import type { SupabaseClient } from "@supabase/supabase-js";
import { comisionesCobro, comisionRappi, regalias, type DiaVenta, type Vigente } from "@/lib/finanzas/comisiones";
import type { CuentaGasto } from "@/lib/finanzas/cuentas";
import { facturasAGastos, faltantesDe, sumarGastos } from "@/lib/finanzas/gastos";
import { costoPuesto, nominaMes, plantillaVigente, type Ajuste, type Puesto } from "@/lib/finanzas/nomina";
import { valorVigente, type Parametro } from "@/lib/finanzas/parametros";
import {
  calcularPL, entradaVacia, finDeMes, INICIO_PL, mesAnterior, mesesAcumulados, sumarEntradas, sumarMetas,
  type ContextoMeta, type EntradaPL, type FilaPL, type Meta,
} from "@/lib/finanzas/pl";
import { prorratear } from "@/lib/finanzas/prorrateo";
import { costearProductos, costeo, type Categoria, type Costo, type VentaDia, type VentaProducto } from "@/lib/ventas/calculos";
import { leerTodo } from "@/lib/ventas/paginar";
import { primerError } from "@/lib/corporativo";
import { hoyMX, pesos } from "@/lib/formato";

type Fila = { sucursal_id: string | null };
type Detalle = { texto: string; monto: number }[];
const de = <T extends Fila>(filas: readonly T[], id: string | null) => filas.filter((f) => f.sucursal_id === id);
const centavos = (n: number) => Math.round(n * 100) / 100;
/** Renglón del P&L donde cae una cuenta (memo e "insumos/inversiones" no son renglón: van al memo). */
const renglonDe = (cuenta: string | null) => (cuenta && cuenta !== "insumos" && cuenta !== "inversiones" ? cuenta : cuenta ? `memo_${cuenta}` : "otros");

export type SucursalPL = { id: string; nombre: string; entrada: EntradaPL; ctx: ContextoMeta; metas: Meta[]; avisos: string[] };
export type DatosMes = {
  mes: string; porSucursal: SucursalPL[]; oficina: number;
  /** Avisos de oficina central (van en el consolidado). */
  avisosOficina: string[];
  consolidado: { entrada: EntradaPL; ctx: ContextoMeta };
  /** Llave `sucursal|renglón` → de dónde sale el monto. */
  detalle: Map<string, Detalle>;
};

/** Todo lo de un mes (YYYY-MM): una consulta por tabla y el armado de la entrada del P&L por sucursal y consolidado. */
export async function datosPL(supabase: SupabaseClient, mes: string): Promise<DatosMes> {
  const desde = `${mes}-01`, hasta = finDeMes(mes);
  const res = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("pl_parametros").select("clave, valor, vigente_desde").returns<Parametro[]>(),
    supabase.from("nomina_plantilla").select("sucursal_id, puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde").returns<Puesto[]>(),
    supabase.from("nomina_ajustes").select("sucursal_id, renglon, monto, concepto").eq("mes", desde).returns<Ajuste[]>(),
    supabase.from("gastos_mes").select("sucursal_id, cuenta, monto, concepto").eq("mes", desde)
      .returns<(Fila & { cuenta: CuentaGasto; monto: number; concepto: string })[]>(),
    supabase.from("pl_metas").select("sucursal_id, renglon, tipo, valor").returns<(Meta & { sucursal_id: string })[]>(),
    supabase.from("facturas").select("sucursal_id, tipo, estado, subtotal, descuento, cuenta_pl, serie, folio, nombre_emisor, fecha_emision")
      .gte("fecha_emision", desde).lte("fecha_emision", hasta)
      .returns<(Fila & { tipo: "ingreso" | "egreso"; estado: string; subtotal: number; descuento: number; cuenta_pl: string | null; serie: string | null; folio: string | null; nombre_emisor: string; fecha_emision: string })[]>(),
    supabase.from("gastos_caja_chica").select("sucursal_id, fecha, concepto, monto, cuenta_pl").gte("fecha", desde).lte("fecha", hasta)
      .returns<(Fila & { fecha: string; concepto: string; monto: number; cuenta_pl: string | null })[]>(),
    supabase.from("cierres_dia").select("sucursal_id, boveda_diferencia").gte("fecha", desde).lte("fecha", hasta)
      .returns<(Fila & { boveda_diferencia: number })[]>(),
    supabase.from("arqueos").select("diferencia, turnos!inner(sucursal_id, fecha)").eq("momento", "cierre").is("anulado_en", null)
      .gte("turnos.fecha", desde).lte("turnos.fecha", hasta).returns<{ diferencia: number; turnos: { sucursal_id: string } }[]>(),
  ]);
  const error = primerError(res);
  if (error) throw new Error(`No se pudieron cargar los datos del P&L: ${error}`);
  const sucursales = res[0].data ?? [], params = res[1].data ?? [], puestos = res[2].data ?? [], ajustes = res[3].data ?? [];
  const gastosMes = res[4].data ?? [], metas = res[5].data ?? [], facturas = res[6].data ?? [], cajaChica = res[7].data ?? [];
  const cierres = res[8].data ?? [], arqueos = res[9].data ?? [];

  const [dias, desglose, ventas, catalogo, costos] = await Promise.all([
    leerTodo<VentaDia & { id: string }>((d, h) => supabase.from("ventas_dia").select("id, sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2")
      .gte("fecha", desde).lte("fecha", hasta).order("sucursal_id").order("fecha").range(d, h).returns<(VentaDia & { id: string })[]>()),
    leerTodo<{ ventas_dia_id: string; total: number; tarjeta: number; en_linea: number }>((d, h) => supabase.from("ventas_dia_desglose")
      .select("ventas_dia_id, total, tarjeta, en_linea, ventas_dia!inner(fecha)").eq("tipo", "agregador")
      .gte("ventas_dia.fecha", desde).lte("ventas_dia.fecha", hasta).order("ventas_dia_id").range(d, h)
      .returns<{ ventas_dia_id: string; total: number; tarjeta: number; en_linea: number }[]>()),
    leerTodo<VentaProducto>((d, h) => supabase.from("ventas_producto").select("sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento")
      .gte("fecha", desde).lte("fecha", hasta).order("sucursal_id").order("fecha").order("dodo_id").range(d, h).returns<VentaProducto[]>()),
    leerTodo<{ dodo_id: number; categoria: Categoria | null }>((d, h) => supabase.from("productos_venta").select("dodo_id, categoria").order("dodo_id").range(d, h)
      .returns<{ dodo_id: number; categoria: Categoria | null }[]>()),
    leerTodo<Costo & { dodo_id: number }>((d, h) => supabase.from("costos_producto").select("dodo_id, costo, vigente_desde").lte("vigente_desde", hasta)
      .order("dodo_id").order("vigente_desde").range(d, h).returns<(Costo & { dodo_id: number })[]>()),
  ]);

  const vigente: Vigente = (clave, fecha) => valorVigente(params, clave, fecha);
  const agregadorDe = new Map(desglose.map((x) => [x.ventas_dia_id, x]));
  const detalle = new Map<string, Detalle>();
  const anotar = (suc: string, renglon: string, texto: string, monto: number) => {
    if (!monto) return;
    const k = `${suc}|${renglon}`;
    detalle.set(k, [...(detalle.get(k) ?? []), { texto, monto: centavos(monto) }]);
  };

  const porSucursal: SucursalPL[] = sucursales.map((s) => {
    const diasSuc = dias.filter((d) => d.sucursal_id === s.id);
    const diasVenta: DiaVenta[] = diasSuc.map((d) => {
      const ag = agregadorDe.get(d.id);
      return {
        fecha: d.fecha, total: Number(d.total), iva: Number(d.iva), tarjeta: Number(d.tarjeta), en_linea: Number(d.en_linea),
        agregador: { total: Number(ag?.total ?? 0), tarjeta: Number(ag?.tarjeta ?? 0), en_linea: Number(ag?.en_linea ?? 0) },
      };
    });
    const ventaNeta = centavos(diasVenta.reduce((t, d) => t + d.total - d.iva, 0));
    const ventaRappi = centavos(diasVenta.reduce((t, d) => t + d.agregador.total, 0));

    const renglones = costearProductos(ventas.filter((v) => v.sucursal_id === s.id), diasSuc, catalogo, costos);
    const c = costeo(renglones);
    anotar(s.id, "alimento", `Costo teórico de ${renglones.reduce((t, r) => t + r.cantidad, 0)} piezas vendidas (receta + periférico)`, c.total.costo);

    const facturasSuc = de(facturas, s.id);
    const f = facturasAGastos(facturasSuc);
    for (const x of facturasSuc) if (x.estado !== "cancelada") {
      anotar(s.id, renglonDe(x.cuenta_pl), `${x.tipo === "egreso" ? "Nota de crédito" : "Factura"} ${x.serie ?? ""}${x.folio ?? ""} · ${x.nombre_emisor} · ${x.fecha_emision}${x.cuenta_pl ? "" : " · sin cuenta"}`,
        (Number(x.subtotal) - Number(x.descuento)) * (x.tipo === "egreso" ? -1 : 1));
    }
    const cc = de(cajaChica, s.id);
    const caja = facturasAGastos(cc.map((g) => ({ tipo: "ingreso" as const, estado: "pagada", subtotal: Number(g.monto), descuento: 0, cuenta_pl: g.cuenta_pl })));
    for (const g of cc) anotar(s.id, renglonDe(g.cuenta_pl), `Caja chica · ${g.concepto} · ${g.fecha}${g.cuenta_pl ? "" : " · sin cuenta"}`, Number(g.monto));
    const manual: Partial<Record<CuentaGasto, number>> = {};
    for (const g of de(gastosMes, s.id)) {
      manual[g.cuenta] = centavos((manual[g.cuenta] ?? 0) + Number(g.monto));
      anotar(s.id, g.cuenta, `Gasto del mes · ${g.concepto}`, Number(g.monto));
    }

    const nomina = nominaMes(puestos, ajustes, s.id, hasta);
    for (const p of plantillaVigente(puestos, s.id, hasta)) {
      anotar(s.id, `nomina_${p.renglon}`, `${p.puesto} · ${p.personas} × (${pesos(Number(p.sueldo))} + ${(Number(p.pct_cargas) * 100).toFixed(2)} % de cargas${Number(p.bono) ? ` + bono ${pesos(Number(p.bono))}` : ""})`, costoPuesto(p));
    }
    for (const a of de(ajustes, s.id)) anotar(s.id, `nomina_${a.renglon}`, `Ajuste · ${a.concepto}`, Number(a.monto));

    const agregadores = comisionRappi(diasVenta, vigente);
    anotar(s.id, "agregadores", `Venta Rappi con IVA ${pesos(ventaRappi)} × tasa vigente de cada día`, agregadores);
    const regaliasMes = regalias(diasVenta, vigente);
    anotar(s.id, "regalias", `Venta neta ${pesos(ventaNeta)} × regalías vigentes`, regaliasMes);
    const cobro = comisionesCobro(diasVenta, vigente);
    anotar(s.id, "otros", "Comisión dLocal (pagos en la app, sin Rappi)", cobro.dlocal);
    anotar(s.id, "otros", "Comisión NetPay (terminal, sin Rappi)", cobro.netpay);
    // Neto: un sobrante compensa un faltante del mismo mes.
    const faltantes = faltantesDe([
      ...arqueos.filter((a) => a.turnos.sucursal_id === s.id).map((a) => Number(a.diferencia)),
      ...de(cierres, s.id).map((x) => Number(x.boveda_diferencia ?? 0)),
    ]);
    anotar(s.id, "otros", "Faltantes de efectivo, neto (arqueos de cierre y bóveda)", faltantes);

    const entrada: EntradaPL = {
      ...entradaVacia(),
      ventaNeta, descuentos: centavos(renglones.reduce((t, r) => t + r.importe_sin_descuento - r.importe, 0)),
      alimento: c.total.costo, nomina: { cocina: nomina.cocina, gerencia: nomina.gerencia },
      gastos: sumarGastos(f.gastos, caja.gastos, manual), sinCuenta: centavos(f.sinCuenta + caja.sinCuenta),
      agregadores, comisionesCobro: cobro.total, faltantes, regalias: regaliasMes, memos: f.memos,
    };

    const avisos: string[] = [];
    const diasMes = Number(hasta.slice(8));
    if (diasSuc.length < diasMes) avisos.push(`Faltan ${diasMes - diasSuc.length} días de ventas por importar; los % son sobre lo importado.`);
    if (c.sinCosto.length) avisos.push(`${c.sinCosto.length} productos vendidos sin costo quedan fuera del alimento.`);
    const sinCuenta = facturasSuc.filter((x) => x.estado !== "cancelada" && !x.cuenta_pl).length;
    if (sinCuenta) avisos.push(`${sinCuenta} facturas sin cuenta del P&L (van a Otros).`);
    if (!nomina.plantilla.cocina && !nomina.plantilla.gerencia) avisos.push("Sin plantilla de nómina para este mes.");
    return { id: s.id, nombre: s.nombre, entrada, ctx: { ventaNeta, ventaRappi, plantilla: nomina.plantilla }, metas: metas.filter((m) => m.sucursal_id === s.id), avisos };
  });

  // Oficina central: facturas sin sucursal (sin memos), gastos del mes y nómina de oficina; se prorratea por venta neta.
  const fOf = facturasAGastos(de(facturas, null));
  const sinCuentaOf = de(facturas, null).filter((x) => x.estado !== "cancelada" && !x.cuenta_pl).length;
  const avisosOficina = sinCuentaOf ? [`Oficina central: ${sinCuentaOf} facturas sin sucursal ni cuenta del P&L (se reparten como gasto de oficina).`] : [];
  const nOf = nominaMes(puestos, ajustes, null, hasta);
  const manualOf = de(gastosMes, null).reduce((t, g) => t + Number(g.monto), 0);
  const oficina = centavos(Object.values(fOf.gastos).reduce((t, v) => t + v, 0) + fOf.sinCuenta + nOf.cocina + nOf.gerencia + manualOf);
  const reparto = prorratear(oficina, new Map(porSucursal.map((s) => [s.id, s.entrada.ventaNeta])));
  for (const s of porSucursal) {
    s.entrada.oficina = reparto.get(s.id) ?? 0;
    anotar(s.id, "oficina", `Oficina central del mes ${pesos(oficina)}, en proporción a la venta neta`, s.entrada.oficina);
  }

  const entrada = { ...sumarEntradas(porSucursal.map((s) => s.entrada)), oficina };
  entrada.memos = { insumos: centavos(entrada.memos.insumos + fOf.memos.insumos), inversiones: centavos(entrada.memos.inversiones + fOf.memos.inversiones) };
  const ctx: ContextoMeta = {
    ventaNeta: entrada.ventaNeta,
    ventaRappi: centavos(porSucursal.reduce((t, s) => t + s.ctx.ventaRappi, 0)),
    plantilla: {
      cocina: centavos(porSucursal.reduce((t, s) => t + s.ctx.plantilla.cocina, 0)),
      gerencia: centavos(porSucursal.reduce((t, s) => t + s.ctx.plantilla.gerencia, 0)),
    },
  };
  return { mes, porSucursal, oficina, avisosOficina, consolidado: { entrada, ctx }, detalle };
}

/** P&L de una sucursal (o consolidado si no hay o no existe) en un mes ya cargado. */
export function vistaPL(d: DatosMes, sucursalId: string | undefined) {
  const suc = d.porSucursal.find((s) => s.id === sucursalId) ?? null;
  if (suc) return { suc, titulo: suc.nombre, entrada: suc.entrada, filas: calcularPL(suc.entrada, suc.metas, suc.ctx), avisos: suc.avisos };
  return {
    suc: null, titulo: "Consolidado", entrada: d.consolidado.entrada,
    filas: calcularPL(d.consolidado.entrada, sumarMetas(d.porSucursal), d.consolidado.ctx),
    avisos: [...d.avisosOficina, ...d.porSucursal.flatMap((s) => s.avisos.map((a) => `${s.nombre}: ${a}`))],
  };
}

/** El mes elegido con su mes anterior (% de venta) y el acumulado del año (% de venta), para pantalla, PDF y Excel. */
export async function plConHistoria(supabase: SupabaseClient, mes: string, sucursalId: string | undefined) {
  const acumulados = mesesAcumulados(mes);
  const anterior = mesAnterior(mes);
  const meses = [...new Set([...acumulados, ...(anterior >= INICIO_PL ? [anterior] : [])])];
  const cargados = new Map(await Promise.all(meses.map(async (m) => [m, await datosPL(supabase, m)] as const)));
  const d = cargados.get(mes)!;
  const vista = vistaPL(d, sucursalId);
  const previo = cargados.get(anterior);
  const entradaDe = (x: DatosMes) => vistaPL(x, sucursalId).entrada;
  const acumulado = sumarEntradas(acumulados.map((m) => entradaDe(cargados.get(m)!)));
  const sinMetas: ContextoMeta = { ventaNeta: acumulado.ventaNeta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } };
  const pctDe = (filas: FilaPL[]) => new Map(filas.map((f) => [f.clave, f.pct]));
  return {
    datos: d, ...vista,
    anterior: previo ? pctDe(vistaPL(previo, sucursalId).filas) : null,
    acumulado: pctDe(calcularPL(acumulado, [], sinMetas)),
    detalleDe: (renglon: string) => (vista.suc ? d.detalle.get(`${vista.suc.id}|${renglon}`) ?? [] : []),
    memoDetalle: (cuenta: "insumos" | "inversiones") => (vista.suc ? d.detalle.get(`${vista.suc.id}|memo_${cuenta}`) ?? [] : []),
  };
}

/** Mes de la URL si es válido (de INICIO_PL al mes actual); si no, el mes actual. */
export const mesElegido = (m: string | undefined) => {
  const hoy = hoyMX().slice(0, 7);
  return m && /^\d{4}-\d{2}$/.test(m) && m <= hoy && m >= INICIO_PL ? m : hoy;
};

