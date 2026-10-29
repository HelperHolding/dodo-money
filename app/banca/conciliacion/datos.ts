import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import { sugerirConciliaciones, type LoteRappi, type MovimientoBanco, type PagoCandidato, type Sugerencia, type VentaTarjeta } from "@/lib/banca/conciliacion";
import type { CuentaPl } from "@/lib/finanzas/cuentas";

export type ConciliacionVista = {
  id: string; tipo: string; concepto: string; nota: string; monto_movimientos: number; monto_documentos: number | null; diferencia: number | null;
  creado_en: string; movimientos: MovimientoBanco[];
};
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const trozos = <T,>(xs: readonly T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
type Fila = { id: string; fecha: string; fila_origen: number; descripcion: string; referencia: string; cargo: number; abono: number };
const aMovimiento = (m: Fila): MovimientoBanco => ({ id: m.id, fecha: m.fecha, fila: m.fila_origen, descripcion: m.descripcion, referencia: m.referencia ?? "", cargo: Number(m.cargo), abono: Number(m.abono) });

/** Movimientos del periodo por conciliar, sus sugerencias, lo conciliado y los pagos disponibles para vincular a mano. */
export async function leerConciliacion(db: SupabaseClient, cuenta: { id: string; rfc: string }, desde: string, hasta: string) {
  const falla = (que: string) => { throw Error(`No se pudo consultar ${que}. Verifica que la migración de conciliación esté instalada.`); };
  const [pend, links, rss, lotes] = await Promise.all([
    leerTodo<Fila>((a, b) => db.from("banca_por_conciliar").select("id,fecha,fila_origen,descripcion,referencia,cargo,abono").eq("cuenta_id", cuenta.id)
      .gte("fecha", desde).lte("fecha", hasta).order("fecha").order("fila_origen").order("id").range(a, b).returns<Fila[]>()),
    leerTodo<{ conciliacion_id: string; banca_movimientos: Fila & { cuenta_id: string } }>((a, b) => db.from("banca_conciliacion_movimientos")
      .select("conciliacion_id,banca_movimientos!inner(id,fecha,fila_origen,descripcion,referencia,cargo,abono,cuenta_id)").eq("activa", true)
      .eq("banca_movimientos.cuenta_id", cuenta.id).gte("banca_movimientos.fecha", desde).lte("banca_movimientos.fecha", hasta)
      .order("conciliacion_id").order("movimiento_id").range(a, b).returns<{ conciliacion_id: string; banca_movimientos: Fila & { cuenta_id: string } }[]>()),
    db.from("razon_social_sucursales").select("sucursal_id").eq("rfc", cuenta.rfc).returns<{ sucursal_id: string }[]>(),
    db.from("rappi_fin_importaciones").select("id,reporte").eq("rfc", cuenta.rfc).is("sustituida_en", null).returns<{ id: string; reporte: { movimientos?: { lote: string | null; neto: number }[] } }[]>(),
  ]);
  if (rss.error) falla("las sucursales de la razón social");
  if (lotes.error) falla("los reportes de Rappi");

  const ids = [...new Set(links.map((l) => l.conciliacion_id))];
  const conc: Omit<ConciliacionVista, "movimientos">[] = [];
  for (const t of trozos(ids)) {
    const r = await db.from("banca_conciliaciones").select("id,tipo,concepto,nota,monto_movimientos,monto_documentos,diferencia,creado_en").in("id", t).is("anulada_en", null)
      .returns<Omit<ConciliacionVista, "movimientos">[]>();
    if (r.error) falla("las conciliaciones");
    conc.push(...(r.data ?? []));
  }
  const conciliadas: ConciliacionVista[] = conc.map((x) => ({ ...x, movimientos: links.filter((l) => l.conciliacion_id === x.id).map((l) => aMovimiento(l.banca_movimientos)) }))
    .sort((a, b) => (b.movimientos[0]?.fecha ?? "").localeCompare(a.movimientos[0]?.fecha ?? ""));

  // Documentos candidatos: ventas hasta 7 días antes del periodo (un depósito del día 1 liquida el mes anterior), pagos ±30 días, paidlots vigentes.
  const sucursales = (rss.data ?? []).map((s) => s.sucursal_id);
  const [ventasRaw, pagosRaw] = await Promise.all([
    sucursales.length ? leerTodo<VentaTarjeta>((a, b) => db.from("ventas_dia").select("id,fecha,tarjeta").in("sucursal_id", sucursales).gt("tarjeta", 0)
      .gte("fecha", sumarDias(desde, -7)).lte("fecha", hasta).order("fecha").order("id").range(a, b).returns<VentaTarjeta[]>()) : Promise.resolve([] as VentaTarjeta[]),
    leerTodo<{ id: string; fecha: string; monto: number; proveedores: { razon_social: string | null; nombre_comercial: string | null; clabe: string | null } | null; pago_aplicaciones: { monto: number; facturas: { cuenta_pl: CuentaPl | null } | null }[] }>((a, b) =>
      db.from("pagos").select("id,fecha,monto,proveedores(razon_social,nombre_comercial,clabe),pago_aplicaciones(monto,facturas(cuenta_pl))").is("anulado_en", null).eq("forma", "transferencia")
        .gte("fecha", sumarDias(desde, -30)).lte("fecha", sumarDias(hasta, 30)).order("fecha").order("id").range(a, b)
        .returns<{ id: string; fecha: string; monto: number; proveedores: { razon_social: string | null; nombre_comercial: string | null; clabe: string | null } | null; pago_aplicaciones: { monto: number; facturas: { cuenta_pl: CuentaPl | null } | null }[] }[]>()),
  ]);
  const usados = async (col: "ventas_dia_id" | "pago_id" | "lote", valores: string[]) => {
    const s = new Set<string>();
    for (const t of trozos(valores)) {
      const r = await db.from("banca_conciliacion_documentos").select(col).eq("activa", true).in(col, t).returns<Record<string, string>[]>();
      if (r.error) falla("los documentos conciliados");
      for (const x of r.data ?? []) s.add(x[col]);
    }
    return s;
  };
  const lotesRappi: LoteRappi[] = [];
  for (const i of lotes.data ?? []) {
    const suma = new Map<string, number>();
    for (const m of i.reporte.movimientos ?? []) if (m.lote) suma.set(m.lote, (suma.get(m.lote) ?? 0) + Number(m.neto));
    for (const [lote, neto] of suma) lotesRappi.push({ importacionId: i.id, lote, neto: Math.round(neto * 100) / 100 });
  }
  const [ventasUsadas, pagosUsados, lotesUsados] = await Promise.all([
    usados("ventas_dia_id", ventasRaw.map((v) => v.id)), usados("pago_id", pagosRaw.map((p) => p.id)), usados("lote", lotesRappi.map((l) => l.lote)),
  ]);
  const pagos: PagoCandidato[] = pagosRaw.filter((p) => !pagosUsados.has(p.id)).map((p) => ({
    id: p.id, fecha: p.fecha, monto: Number(p.monto), clabe: p.proveedores?.clabe ?? null, proveedor: p.proveedores?.nombre_comercial || p.proveedores?.razon_social || "Proveedor",
    cuenta: [...p.pago_aplicaciones].sort((a, b) => Number(b.monto) - Number(a.monto))[0]?.facturas?.cuenta_pl ?? null,
  }));
  const pendientes = pend.map(aMovimiento);
  const sugerencias: Sugerencia[] = sugerirConciliaciones(pendientes, {
    pagos, ventas: ventasRaw.filter((v) => !ventasUsadas.has(v.id)).map((v) => ({ ...v, tarjeta: Number(v.tarjeta) })),
    lotesRappi: lotesRappi.filter((l) => !lotesUsados.has(l.lote) && l.neto > 0),
  });
  const porId = new Map(pendientes.map((m) => [m.id, m]));
  return { pendientes, sugerencias, conciliadas, pagos, movimiento: (id: string) => porId.get(id) };
}
