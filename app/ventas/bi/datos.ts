import type { SupabaseClient } from "@supabase/supabase-js";
import { datosPL } from "@/app/finanzas/datos";
import { calcularPL } from "@/lib/finanzas/pl";
import { metaDelRango, parametrosSQL, puntoEquilibrio, prorratear, rangoComparacion, ventaParcial, type FiltrosBI } from "@/lib/ventas/bi";

type Num = number | string;
/** Lo que devuelve `ventas_bi` (los numeric pueden llegar como texto: se convierten con Number al usarlos). */
export type ResultadoBI = {
  kpis: { ventas: Num; tickets: Num; productos: Num };
  canales: { canal: string; ventas: Num; tickets: Num }[];
  origenes: { origen: string; ventas: Num; tickets: Num }[];
  tipos: { tipo: string; ventas: Num; tickets: Num }[];
  pagos: { pago: string; ventas: Num; tickets: Num }[];
  pagos_sucursal: { sucursal_id: string; pago: string; ventas: Num }[];
  dias: { dia: number; ventas: Num; tickets: Num }[];
  horas: { hora: number; ventas: Num; tickets: Num }[];
  semanas: { semana: string; ventas: Num; tickets: Num }[];
  categorias: { categoria: string; ventas: number; piezas: Num }[];
  productos: { nombre: string; canal: string; ventas: Num; piezas: Num; pedidos: Num }[];
  rappi_nombres: { nombre: string; ventas: number }[];
};
export type HistoricoBI = { semanas: { anio: number; semana: number; ventas: Num }[]; meses: { anio: number; mes: number; ventas: Num }[] };

/** Último mes cerrado: el anterior al mes de `hoy`. */
const mesCerrado = (hoy: string) => { const x = new Date(`${hoy.slice(0, 7)}-01T12:00:00Z`); x.setUTCDate(0); return { desde: `${x.toISOString().slice(0, 7)}-01`, hasta: x.toISOString().slice(0, 10) }; };
const siguienteMes = (m: string) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1)).toISOString().slice(0, 7);

export async function datosBI(supabase: SupabaseClient, f: FiltrosBI, hoy: string) {
  const comp = rangoComparacion(f.desde, f.hasta, f.comp);
  const cerrado = mesCerrado(hoy);
  const p = parametrosSQL(f, f);
  const [actual, anterior, historico, filtradas, metas, pl] = await Promise.all([
    supabase.rpc("ventas_bi", { p }),
    supabase.rpc("ventas_bi", { p: parametrosSQL(f, comp) }),
    supabase.rpc("ventas_bi_historico", { p }),
    // Sucursales que pasan sucursal, razón social y antigüedad: las mismas que suma ventas_bi, para que P.E. y meta comparen lo mismo.
    supabase.rpc("ventas_bi_sucursales", { p, p_hasta: f.hasta }),
    supabase.from("ventas_metas").select("sucursal_id, mes, monto").gte("mes", `${f.desde.slice(0, 7)}-01`).lte("mes", f.hasta),
    // Si el P&L no carga, se marca error: no es que falte capturar datos.
    datosPL(supabase, cerrado).then((d) => ({ d, error: false }), () => ({ d: null, error: true })),
  ]);
  if (actual.error || anterior.error || historico.error || filtradas.error) throw new Error("No se pudo calcular Ventas BI.");
  const elegidas: string[] = ((filtradas.data ?? []) as (string | { ventas_bi_sucursales: string })[]).map((x) => (typeof x === "string" ? x : x.ventas_bi_sucursales));
  const resultado = actual.data as ResultadoBI;
  // Venta del rango por sucursal: el medidor compara cada objetivo solo con la venta de las sucursales que lo forman.
  const ventaSuc = new Map<string, number>();
  for (const x of resultado?.pagos_sucursal ?? []) ventaSuc.set(x.sucursal_id, (ventaSuc.get(x.sucursal_id) ?? 0) + Number(x.ventas));
  const ventaDe = (ids: readonly string[]) => Math.round(ids.reduce((s, id) => s + (ventaSuc.get(id) ?? 0), 0) * 100) / 100;
  // Las sucursales que no vendieron en el rango no salen en los avisos de «sin P.E.» o «falta meta».
  const vendio = (id: string) => (ventaSuc.get(id) ?? 0) !== 0;
  // Con filtros de canal, día, hora, pago, producto… la venta es solo una parte: P.E. y meta quedan sin dato.
  const parcial = ventaParcial(f);

  // P.E. del rango: P.E. mensual de cada sucursal (mes cerrado) prorrateado a los días del rango. Sin P&L, sin margen o
  // sin costos fijos cargados (P.E. ≤ 0), la sucursal queda «sin P.E.».
  const sinPE: string[] = [], conPE: string[] = [];
  let pe = 0;
  for (const id of pl.error ? [] : elegidas) {
    const s = pl.d?.porSucursal.find((x) => x.id === id);
    const montos = s ? Object.fromEntries(calcularPL(s.entrada, s.metas, s.ctx).map((r) => [r.clave, r.monto])) : null;
    const mensual = montos ? puntoEquilibrio(montos) : null;
    if (mensual === null || !(mensual > 0)) { sinPE.push(id); continue; }
    conPE.push(id);
    for (let m = f.desde.slice(0, 7); m <= f.hasta.slice(0, 7); m = siguienteMes(m)) pe += prorratear(mensual, f.desde, f.hasta, m);
  }
  const peMonto = Math.round(pe * 100) / 100;

  // Meta: entra la sucursal que tiene la meta de todos los meses del rango; si le falta alguno, no entra ni su venta.
  // Una meta en 0 es una meta quitada (así se quita en Parámetros): cuenta como faltante.
  const filasMeta = ((metas.data ?? []) as { sucursal_id: string; mes: string; monto: number }[]).filter((x) => Number(x.monto) > 0);
  const todas = metas.error ? { monto: 0, faltan: [] } : metaDelRango(filasMeta, elegidas, f.desde, f.hasta);
  const conMeta = metas.error ? [] : elegidas.filter((id) => !todas.faltan.some((x) => x.sucursal_id === id));
  const metaMonto = metaDelRango(filasMeta, conMeta, f.desde, f.hasta).monto;

  return { actual: resultado, anterior: anterior.data as ResultadoBI, historico: historico.data as HistoricoBI, comp, elegidas, parcial,
    pe: { monto: peMonto, objetivo: parcial || pl.error || !(peMonto > 0) ? null : peMonto, venta: ventaDe(conPE),
      sinPE: sinPE.filter(vendio), error: pl.error, mesCerrado: cerrado.desde.slice(0, 7) },
    meta: { monto: metaMonto, objetivo: parcial || metas.error || !(metaMonto > 0) ? null : metaMonto, venta: ventaDe(conMeta),
      faltan: todas.faltan.filter((x) => vendio(x.sucursal_id)), error: !!metas.error } };
}
