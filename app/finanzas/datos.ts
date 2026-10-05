import type { SupabaseClient } from "@supabase/supabase-js";
import { comisionesCobro, comisionRappi, regalias, type DiaVenta, type Vigente } from "@/lib/finanzas/comisiones";
import type { CuentaGasto } from "@/lib/finanzas/cuentas";
import { facturasAGastos, faltantesDe, sumarGastos } from "@/lib/finanzas/gastos";
import { costoPuesto, nominaPeriodo, plantillaVigente, type AjusteMes, type Puesto } from "@/lib/finanzas/nomina";
import { valorVigente, type Parametro } from "@/lib/finanzas/parametros";
import { acumuladoDe, anteriorDe, COLUMNAS, diasEntre, mesesDelRango, type Periodo, type Rango } from "@/lib/finanzas/periodo";
import {
  calcularPL, entradaVacia, escalarMetas, INICIO_FECHA, sumarEntradas, sumarMetas,
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
export type DatosPeriodo = {
  rango: Rango; porSucursal: SucursalPL[]; oficina: number;
  /** Avisos de oficina central (van en el consolidado). */
  avisosOficina: string[];
  consolidado: { entrada: EntradaPL; ctx: ContextoMeta };
  /** Llave `sucursal|renglón` → de dónde sale el monto. */
  detalle: Map<string, Detalle>;
};

/**
 * Todo lo de un rango de días: lo diario (ventas, caja chica, efectivo) filtrado por fecha, y lo que se registra por mes
 * (nómina, gastos del mes, facturas, oficina) de cada mes que toca × la fracción de días de ese mes que entra.
 */
export async function datosPL(supabase: SupabaseClient, rango: Rango): Promise<DatosPeriodo> {
  const { desde, hasta } = rango;
  const meses = mesesDelRango(desde, hasta);
  const mesDe = new Map(meses.map((m) => [m.mes, m]));
  const fraccionDe = (f: string) => mesDe.get(f.slice(0, 7))?.fraccion ?? 0;
  const fraccionTotal = meses.reduce((t, m) => t + m.fraccion, 0);
  /** " · $30,000.00 × 7/31" si del mes de esa fecha solo entra una parte. */
  const proporcion = (f: string, completo: number) => {
    const m = mesDe.get(f.slice(0, 7));
    return m && m.fraccion < 1 ? ` · ${pesos(completo)} × ${m.dias}/${m.diasMes}` : "";
  };
  // Sin meses (periodo vacío) se consulta un mes que no existe en lugar de una lista vacía.
  const primerosDeMes = meses.length ? meses.map((m) => `${m.mes}-01`) : ["1900-01-01"];
  const iniMeses = meses.length ? `${meses[0].mes}-01` : desde;
  const finMeses = meses.length ? meses[meses.length - 1].fin : hasta;

  const res = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("pl_parametros").select("clave, valor, vigente_desde").returns<Parametro[]>(),
    supabase.from("nomina_plantilla").select("sucursal_id, puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde").returns<Puesto[]>(),
    supabase.from("nomina_ajustes").select("sucursal_id, renglon, monto, concepto, mes").in("mes", primerosDeMes).returns<AjusteMes[]>(),
    supabase.from("gastos_mes").select("sucursal_id, cuenta, monto, concepto, mes").in("mes", primerosDeMes)
      .returns<(Fila & { cuenta: CuentaGasto; monto: number; concepto: string; mes: string })[]>(),
    supabase.from("pl_metas").select("sucursal_id, renglon, tipo, valor").returns<(Meta & { sucursal_id: string })[]>(),
    supabase.from("facturas").select("sucursal_id, tipo, estado, subtotal, descuento, cuenta_pl, serie, folio, nombre_emisor, fecha_emision")
      .gte("fecha_emision", iniMeses).lte("fecha_emision", finMeses)
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

  const vigente: Vigente = (clave, f) => valorVigente(params, clave, f);
  const agregadorDe = new Map(desglose.map((x) => [x.ventas_dia_id, x]));
  const detalle = new Map<string, Detalle>();
  const anotar = (suc: string, renglon: string, texto: string, monto: number) => {
    if (!monto) return;
    const k = `${suc}|${renglon}`;
    detalle.set(k, [...(detalle.get(k) ?? []), { texto, monto: centavos(monto) }]);
  };
  const diasRango = diasEntre(desde, hasta);

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
    const f = facturasAGastos(facturasSuc, fraccionDe);
    for (const x of facturasSuc) if (x.estado !== "cancelada") {
      const completo = (Number(x.subtotal) - Number(x.descuento)) * (x.tipo === "egreso" ? -1 : 1);
      anotar(s.id, renglonDe(x.cuenta_pl),
        `${x.tipo === "egreso" ? "Nota de crédito" : "Factura"} ${x.serie ?? ""}${x.folio ?? ""} · ${x.nombre_emisor} · ${x.fecha_emision}${proporcion(x.fecha_emision, completo)}${x.cuenta_pl ? "" : " · sin cuenta"}`,
        completo * fraccionDe(x.fecha_emision));
    }
    const cc = de(cajaChica, s.id);
    const caja = facturasAGastos(cc.map((g) => ({ tipo: "ingreso" as const, estado: "pagada", subtotal: Number(g.monto), descuento: 0, cuenta_pl: g.cuenta_pl })));
    for (const g of cc) anotar(s.id, renglonDe(g.cuenta_pl), `Caja chica · ${g.concepto} · ${g.fecha}${g.cuenta_pl ? "" : " · sin cuenta"}`, Number(g.monto));
    const manual: Partial<Record<CuentaGasto, number>> = {};
    for (const g of de(gastosMes, s.id)) {
      const monto = Number(g.monto) * fraccionDe(g.mes);
      manual[g.cuenta] = centavos((manual[g.cuenta] ?? 0) + monto);
      anotar(s.id, g.cuenta, `Gasto del mes · ${g.concepto}${proporcion(g.mes, Number(g.monto))}`, monto);
    }

    const nomina = nominaPeriodo(puestos, ajustes, s.id, meses);
    for (const m of meses) {
      for (const p of plantillaVigente(puestos, s.id, m.fin)) {
        anotar(s.id, `nomina_${p.renglon}`,
          `${p.puesto} · ${p.personas} × (${pesos(Number(p.sueldo))} + ${(Number(p.pct_cargas) * 100).toFixed(2)} % de cargas${Number(p.bono) ? ` + bono ${pesos(Number(p.bono))}` : ""})${proporcion(m.mes, costoPuesto(p))}`,
          costoPuesto(p) * m.fraccion);
      }
      for (const a of de(ajustes, s.id).filter((a) => a.mes.slice(0, 7) === m.mes)) {
        anotar(s.id, `nomina_${a.renglon}`, `Ajuste · ${a.concepto}${proporcion(m.mes, Number(a.monto))}`, Number(a.monto) * m.fraccion);
      }
    }

    const agregadores = comisionRappi(diasVenta, vigente);
    anotar(s.id, "agregadores", `Venta Rappi con IVA ${pesos(ventaRappi)} × tasa vigente de cada día`, agregadores);
    const regaliasPeriodo = regalias(diasVenta, vigente);
    anotar(s.id, "regalias", `Venta neta ${pesos(ventaNeta)} × regalías vigentes`, regaliasPeriodo);
    const cobro = comisionesCobro(diasVenta, vigente);
    anotar(s.id, "otros", "Comisión dLocal (pagos en la app, sin Rappi)", cobro.dlocal);
    anotar(s.id, "otros", "Comisión NetPay (terminal, sin Rappi)", cobro.netpay);
    // Neto: un sobrante compensa un faltante del mismo periodo.
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
      agregadores, comisionesCobro: cobro.total, faltantes, regalias: regaliasPeriodo, memos: f.memos,
    };

    const avisos: string[] = [];
    if (diasSuc.length < diasRango) avisos.push(`Faltan ${diasRango - diasSuc.length} días de ventas por importar; los % son sobre lo importado.`);
    if (c.sinCosto.length) avisos.push(`${c.sinCosto.length} productos vendidos sin costo quedan fuera del alimento.`);
    const sinCuenta = facturasSuc.filter((x) => x.estado !== "cancelada" && !x.cuenta_pl).length;
    if (sinCuenta) avisos.push(`${sinCuenta} facturas sin cuenta del P&L (van a Otros).`);
    if (fraccionTotal > 0 && !nomina.plantilla.cocina && !nomina.plantilla.gerencia) avisos.push("Sin plantilla de nómina para este periodo.");
    return {
      id: s.id, nombre: s.nombre, entrada, ctx: { ventaNeta, ventaRappi, plantilla: nomina.plantilla },
      metas: escalarMetas(metas.filter((m) => m.sucursal_id === s.id), fraccionTotal), avisos,
    };
  });

  // Oficina central: facturas sin sucursal (sin memos), gastos del mes y nómina de oficina, por fracción; se reparte por venta neta.
  const facturasOf = de(facturas, null);
  const fOf = facturasAGastos(facturasOf, fraccionDe);
  const sinCuentaOf = facturasOf.filter((x) => x.estado !== "cancelada" && !x.cuenta_pl).length;
  const avisosOficina = sinCuentaOf ? [`Oficina central: ${sinCuentaOf} facturas sin sucursal ni cuenta del P&L (se reparten como gasto de oficina).`] : [];
  const nOf = nominaPeriodo(puestos, ajustes, null, meses);
  const manualOf = de(gastosMes, null).reduce((t, g) => t + Number(g.monto) * fraccionDe(g.mes), 0);
  const oficina = centavos(Object.values(fOf.gastos).reduce((t, v) => t + v, 0) + fOf.sinCuenta + nOf.cocina + nOf.gerencia + manualOf);
  const reparto = prorratear(oficina, new Map(porSucursal.map((s) => [s.id, s.entrada.ventaNeta])));
  for (const s of porSucursal) {
    s.entrada.oficina = reparto.get(s.id) ?? 0;
    anotar(s.id, "oficina", `Oficina central del periodo ${pesos(oficina)}, en proporción a la venta neta`, s.entrada.oficina);
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
  return { rango, porSucursal, oficina, avisosOficina, consolidado: { entrada, ctx }, detalle };
}

/** P&L de una sucursal (o consolidado si no hay o no existe) en un periodo ya cargado. */
export function vistaPL(d: DatosPeriodo, sucursalId: string | undefined) {
  const suc = d.porSucursal.find((s) => s.id === sucursalId) ?? null;
  if (suc) return { suc, titulo: suc.nombre, entrada: suc.entrada, filas: calcularPL(suc.entrada, suc.metas, suc.ctx), avisos: suc.avisos };
  return {
    suc: null, titulo: "Consolidado", entrada: d.consolidado.entrada,
    filas: calcularPL(d.consolidado.entrada, sumarMetas(d.porSucursal), d.consolidado.ctx),
    avisos: [...d.avisosOficina, ...d.porSucursal.flatMap((s) => s.avisos.map((a) => `${s.nombre}: ${a}`))],
  };
}

/**
 * El periodo con sus dos comparaciones (% de venta): mes → mes anterior y acumulado del año;
 * semana → semana anterior y acumulado del mes. Tres cargas, cada una de un solo rango.
 */
export async function plConHistoria(supabase: SupabaseClient, p: Periodo, sucursalId: string | undefined) {
  const ant = anteriorDe(p, hoyMX());
  const [d, previo, acumulado] = await Promise.all([
    datosPL(supabase, p),
    ant.vacio || ant.finNominal < INICIO_FECHA ? Promise.resolve(null) : datosPL(supabase, ant),
    datosPL(supabase, acumuladoDe(p, INICIO_FECHA)),
  ]);
  const vista = vistaPL(d, sucursalId);
  const pctDe = (filas: FilaPL[]) => new Map(filas.map((f) => [f.clave, f.pct]));
  const acum = vistaPL(acumulado, sucursalId).entrada;
  return {
    datos: d, ...vista,
    anterior: previo ? pctDe(vistaPL(previo, sucursalId).filas) : null,
    acumulado: pctDe(calcularPL(acum, [], { ventaNeta: acum.ventaNeta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } })),
    columnas: COLUMNAS[p.tipo],
    detalleDe: (renglon: string) => (vista.suc ? d.detalle.get(`${vista.suc.id}|${renglon}`) ?? [] : []),
    memoDetalle: (cuenta: "insumos" | "inversiones") => (vista.suc ? d.detalle.get(`${vista.suc.id}|memo_${cuenta}`) ?? [] : []),
  };
}
