import { datosMermas } from "./mermas/datos";
import { valorarMermas, mermaParaPL } from "@/lib/finanzas/mermasPL";
import { aplicarConciliaciones } from "@/lib/ventas/conciliacion";
import { leerConciliaciones } from "@/app/ventas/conciliacion/datos";
import type { SupabaseClient } from "@supabase/supabase-js";
import { comisionesCobro, comisionRappi, regalias, type DiaVenta, type Vigente } from "@/lib/finanzas/comisiones";
import { enResultado, facturasAGastos, faltantesDe, partesFactura, sumarGastos } from "@/lib/finanzas/gastos";
import { conceptosNomina, realDelMes, costoPuesto, nominaPeriodo, plantillaVigente, type AjusteMes, type Puesto, type NominaReal } from "@/lib/finanzas/nomina";
import { valorVigente, type Parametro } from "@/lib/finanzas/parametros";
import { acumuladoDe, anteriorDe, columnasComparativo, COLUMNAS, diasEntre, mesesDelRango, rangosPorMes, type Periodo, type Rango } from "@/lib/finanzas/periodo";
import {
  avisosSinCapturar, calcularPL, resumenCanalPL, entradaVacia, escalarMetas, INICIO_FECHA, sumarEntradas, sumarMetas,
  type ContextoMeta, type EntradaPL, type FilaPL, type Meta,
} from "@/lib/finanzas/pl";
import type { ColumnaPL } from "@/lib/finanzas/excel";
import { prorratear } from "@/lib/finanzas/prorrateo";
import { costearProductos, costeo, type Categoria, type Costo, type VentaDia, type VentaProducto } from "@/lib/ventas/calculos";
import { leerTodo } from "@/lib/ventas/paginar";
import { primerError } from "@/lib/corporativo";
import { fechaMX, hoyMX, pesos } from "@/lib/formato";
import { capturasTardias, esMesDeEmision, fraccionCubre, textoCubre } from "@/lib/finanzas/cubre";
import {cargarRappi} from "@/app/ventas/rappi/datos";
import {ventasRappi} from "@/lib/ventas/rappi";

type Fila = { sucursal_id: string | null };
type Detalle = { texto: string; monto: number; href?: string; nota?: string }[];
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
 * (nómina, oficina) de cada mes que toca × la fracción de días de ese mes que entra; cada factura, por los días de su periodo (lo que cubre) que caen en el rango.
 */
export async function datosPL(supabase: SupabaseClient, rango: Rango): Promise<DatosPeriodo> {
  const { desde, hasta } = rango;
  const meses = mesesDelRango(desde, hasta);
  const mesDe = new Map(meses.map((m) => [m.mes, m]));
  const fraccionTotal = meses.reduce((t, m) => t + m.fraccion, 0);
  /** " · $30,000.00 × 7/31" si del mes de esa fecha solo entra una parte. */
  const proporcion = (f: string, completo: number) => {
    const m = mesDe.get(f.slice(0, 7));
    return m && m.fraccion < 1 ? ` · ${pesos(completo)} × ${m.dias}/${m.diasMes}` : "";
  };
  // Sin meses (periodo vacío) se consulta un mes que no existe en lugar de una lista vacía.
  const primerosDeMes = meses.length ? meses.map((m) => `${m.mes}-01`) : ["1900-01-01"];

  const res = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("pl_parametros").select("clave, valor, vigente_desde").returns<Parametro[]>(),
    supabase.from("nomina_plantilla").select("sucursal_id, puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde").returns<Puesto[]>(),
    supabase.from("nomina_ajustes").select("sucursal_id, renglon, monto, concepto, mes").in("mes", primerosDeMes).returns<AjusteMes[]>(),
    supabase.from("nomina_reales").select("id, sucursal_id, mes, fuente, empleados").is("anulada_en", null).in("mes", primerosDeMes).returns<NominaReal[]>(),
    supabase.from("pl_metas").select("sucursal_id, renglon, tipo, valor").returns<(Meta & { sucursal_id: string })[]>(),
  ]);
  const error = primerError(res);
  if (error) throw new Error(`No se pudieron cargar los datos del P&L: ${error}`);
  const sucursales = res[0].data ?? [], params = res[1].data ?? [], puestos = res[2].data ?? [], ajustes = res[3].data ?? [];
  const reales = res[4].data ?? [];
  const metas = res[5].data ?? [];

  type FacturaPL = Fila & { id: string;
    tipo: "ingreso" | "egreso"; estado: string; subtotal: number; descuento: number; cuenta_pl: string | null; serie: string | null; folio: string | null;
    nombre_emisor: string; fecha_emision: string; cubre_desde: string; cubre_hasta: string; creado_en: string; origen: "cfdi" | "manual"; factura_conceptos: { descripcion: string; importe: number; cuenta_pl: string | null }[];
  };
  const [facturasLeidas, cajaChica, cierres, arqueos, dias, desglose, ventas, catalogo, costos, datosRappi] = await Promise.all([
    desde > hasta ? Promise.resolve([] as FacturaPL[]) : leerTodo<FacturaPL>((d, h) => supabase.from("facturas")
      .select("id, sucursal_id, tipo, estado, subtotal, descuento, cuenta_pl, serie, folio, nombre_emisor, fecha_emision, cubre_desde, cubre_hasta, creado_en, origen, factura_conceptos(descripcion, importe, cuenta_pl)")
      .lte("cubre_desde", hasta).gte("cubre_hasta", desde).order("id").range(d, h).returns<FacturaPL[]>()),
    leerTodo<Fila & { fecha: string; concepto: string; monto: number; cuenta_pl: string | null; informativo: boolean }>((d, h) => supabase.from("gastos_caja_chica")
      .select("sucursal_id, fecha, concepto, monto, cuenta_pl, informativo").is("anulado_en",null).gte("fecha", desde).lte("fecha", hasta).order("id").range(d, h)
      .returns<(Fila & { fecha: string; concepto: string; monto: number; cuenta_pl: string | null; informativo: boolean })[]>()),
    leerTodo<Fila & { boveda_diferencia: number }>((d, h) => supabase.from("cierres_dia").select("sucursal_id, boveda_diferencia")
      .gte("fecha", desde).lte("fecha", hasta).order("id").range(d, h).returns<(Fila & { boveda_diferencia: number })[]>()),
    leerTodo<{ diferencia: number; turnos: { sucursal_id: string } }>((d, h) => supabase.from("arqueos").select("diferencia, turnos!inner(sucursal_id, fecha)")
      .eq("momento", "cierre").is("anulado_en", null).gte("turnos.fecha", desde).lte("turnos.fecha", hasta).order("id").range(d, h)
      .returns<{ diferencia: number; turnos: { sucursal_id: string } }[]>()),
    leerTodo<VentaDia & { id: string; importacion_id: string }>((d, h) => supabase.from("ventas_dia").select("id, importacion_id, sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2")
      .gte("fecha", desde).lte("fecha", hasta).order("sucursal_id").order("fecha").range(d, h).returns<(VentaDia & { id: string; importacion_id: string })[]>()),
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
    cargarRappi(supabase,null,desde,hasta),
  ]);
  const [conciliaciones,datosMerma] = await Promise.all([leerConciliaciones(supabase,desde,hasta),datosMermas(supabase,desde,hasta)]);
  const mermasValoradas = valorarMermas(datosMerma.filas,datosMerma.costos);
  const diasConciliados = aplicarConciliaciones(dias,conciliaciones.filas);
  const rappi=ventasRappi(datosRappi.ordenes,datosRappi.catalogo);

  // Cada factura entra por los días de su periodo que caen en el rango, repartida entre sus conceptos (con su cuenta, o la de la factura).
  const facturas = facturasLeidas
    .map((x) => ({ ...x, conceptos: x.factura_conceptos, parte: fraccionCubre({ desde: x.cubre_desde, hasta: x.cubre_hasta }, rango) }))
    .filter((x) => x.parte.dias > 0);
  const fraccionDe = (x: (typeof facturas)[number]) => x.parte.fraccion;
  /** "2 recibos llegaron después del cierre del mes: $3,950.00." (capturados con el mes del rango ya terminado; sin insumos ni inversiones). */
  const avisoTardias = (lista: typeof facturas) => {
    const t = capturasTardias(lista.map((x) => ({
      capturada: fechaMX(x.creado_en), monto: enResultado(partesFactura(x, x.parte.fraccion)),
    })), hasta);
    return t.n ? [`${t.n} ${t.n === 1 ? "recibo llegó" : "recibos llegaron"} después del cierre del mes: ${pesos(t.monto)}.`] : [];
  };
  const vigente: Vigente = (clave, f) => valorVigente(params, clave, f);
  const agregadorDe = new Map(desglose.map((x) => [x.ventas_dia_id, x]));
  const detalle = new Map<string, Detalle>();
  const anotar = (suc: string, renglon: string, texto: string, monto: number, extra: { href?: string; nota?: string } = {}) => {
    if (!monto) return;
    const k = `${suc}|${renglon}`;
    detalle.set(k, [...(detalle.get(k) ?? []), { texto, monto: centavos(monto), ...extra }]);
  };
  const diasRango = diasEntre(desde, hasta);

  const porSucursal: SucursalPL[] = sucursales.map((s) => {
    const diasSuc = diasConciliados.filter((d) => d.sucursal_id === s.id);
    const diasVenta: DiaVenta[] = [...diasSuc.map((d) => {
      const ag = agregadorDe.get(d.id);
      return {
        fecha: d.fecha, total: Number(d.total), iva: Number(d.iva), tarjeta: Number(d.tarjeta), en_linea: Number(d.en_linea),
        agregador: { total: Number(ag?.total ?? 0), tarjeta: Number(ag?.tarjeta ?? 0), en_linea: Number(ag?.en_linea ?? 0) },
      };
    }),...rappi.dias.filter(d=>d.sucursal_id===s.id).map(d=>({...d,agregador:{total:d.total,tarjeta:0,en_linea:d.total}}))];
    const ventaNeta = centavos(diasVenta.reduce((t, d) => t + d.total - d.iva, 0));
    const ventaRappi = centavos(diasVenta.reduce((t, d) => t + d.agregador.total, 0));

    const productosDodo = ventas.filter(v => v.sucursal_id === s.id);
    const productosRappi = rappi.productos.filter(v => v.sucursal_id === s.id);
    const diasRappi = rappi.dias.filter(d => d.sucursal_id === s.id);
    const renglonesDodo = costearProductos(productosDodo, diasSuc, catalogo, costos);
    const renglonesRappi = costearProductos(productosRappi, diasRappi, catalogo, costos);
    const canales = {
      dodo: resumenCanalPL(diasSuc, productosDodo, costeo(renglonesDodo).total.costo),
      rappi: resumenCanalPL(diasRappi, productosRappi, costeo(renglonesRappi).total.costo),
    };
    const renglones = [...renglonesDodo, ...renglonesRappi];
    const c = costeo(renglones);
    anotar(s.id, "alimento", `Costo teórico de ${renglones.reduce((t, r) => t + r.cantidad, 0)} piezas vendidas (receta + periférico)`, c.total.costo);

    for (const [canal, nombre] of [["dodo", "Dodo IS / POS"], ["rappi", "Rappi"]] as const) {
      const c = canales[canal];
      anotar(s.id, `venta_neta_${canal}`, `${nombre} · después de descuentos, sin IVA`, c.neta);
      anotar(s.id, `alimento_${canal}`, `${nombre} · costo teórico de las piezas vendidas`, c.alimento);
    }
    const merma = mermaParaPL(mermasValoradas.filter(r=>r.sucursal_id===s.id),datosMerma.dias.filter(d=>d.sucursal_id===s.id),desde,hasta);
    for (const r of [...merma.productos,...merma.insumosFilas].filter(r=>r.costo_pl!==null)) {
      const origen = datosMerma.dias.find(d=>d.sucursal_id===s.id&&d.fecha===r.fecha);
      const detalle={href:`/finanzas/mermas?mes=${r.fecha.slice(0,7)}&sucursal=${s.id}`,nota:`${r.fecha} · ${r.cantidad} ${r.unidad} · ${r.fuente_costo} · ${origen?.archivo??"Reporte importado"}`};
      anotar(s.id,"merma",r.nombre,Number(r.costo_pl),detalle);
      anotar(s.id,r.tipo==="producto"?"merma_productos":"merma_insumos",r.nombre,Number(r.costo_pl),detalle);
    }
    const facturasSuc = de(facturas, s.id);
    const f = facturasAGastos(facturasSuc, fraccionDe);
    for (const x of facturasSuc) {
      // Una línea por cuenta (no por concepto): una factura de insumos con 50 conceptos queda en una sola.
      const porCuenta = new Map<string | null, number>();
      for (const p of partesFactura(x, x.parte.fraccion)) porCuenta.set(p.cuenta, (porCuenta.get(p.cuenta) ?? 0) + p.monto);
      const bases = new Map<string | null, number>();
      for (const p of partesFactura(x)) bases.set(p.cuenta, (bases.get(p.cuenta) ?? 0) + p.monto);
      const nombre = x.tipo === "egreso" ? "Nota de crédito" : x.origen === "manual" ? "Gasto sin CFDI" : "Factura";
      const cubre = { desde: x.cubre_desde, hasta: x.cubre_hasta };
      for (const [cuenta, monto] of porCuenta) {
        const base = bases.get(cuenta) ?? 0;
        const calculo = x.parte.fraccion < 1 ? `${pesos(base)} × ${x.parte.dias}/${x.parte.total} días` : pesos(base);
        anotar(s.id, renglonDe(cuenta), `${nombre} ${x.serie ?? ""}${x.folio ?? ""}`.trim(), monto,
          { href: `/compras/facturas/${x.id}`, nota: `${x.nombre_emisor} · ${x.fecha_emision} · Cubre ${textoCubre(cubre)} · ${calculo}${cuenta ? "" : " · sin cuenta"}` });
      }
    }
    const cc = de(cajaChica, s.id);
    const caja = facturasAGastos(cc.map((g) => ({ tipo: "ingreso" as const, estado: "pagada", subtotal: Number(g.monto), descuento: 0, cuenta_pl: g.cuenta_pl })));
    for (const g of cc) anotar(s.id, renglonDe(g.cuenta_pl), `Gasto${g.informativo?" informativo · ya pagado":""} · ${g.concepto} · ${g.fecha}${g.cuenta_pl ? "" : " · sin cuenta"}`, Number(g.monto));

    const nomina = nominaPeriodo(puestos, ajustes, s.id, meses, reales);
    for (const m of meses) {
      const real = realDelMes(reales, s.id, m.mes);
      if (real) {
        for (const e of real.empleados) for (const [clave, nombre] of Object.entries(conceptosNomina)) {
          const monto = Number(e[clave as keyof typeof conceptosNomina] ?? 0);
          if (monto) anotar(s.id, `nomina_${e.renglon}`, `${e.nombre} · ${e.puesto} · ${nombre}${proporcion(m.mes, monto)}`, monto * m.fraccion, { href: `/finanzas/nomina?mes=${m.mes}`, nota: `${real.fuente}${e.nota ? ` · ${e.nota}` : ""}` });
        }
      }
      for (const p of real ? [] : plantillaVigente(puestos, s.id, m.fin)) {
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
      ...entradaVacia(), canales,
      ventaNeta, descuentos: centavos(renglones.reduce((t, r) => t + r.importe_sin_descuento - r.importe, 0)),
      alimento: c.total.costo, merma: merma.monto===null&&merma.insumosMonto===null?null:centavos((merma.monto??0)+(merma.insumosMonto??0)), mermaPendiente: merma.parcial||merma.insumosParcial,
      mermaProductos:merma.monto,mermaInsumos:merma.insumosMonto,mermaProductosPendiente:merma.parcial,mermaInsumosPendiente:merma.insumosParcial,
      nomina: { cocina: nomina.cocina, gerencia: nomina.gerencia },
      gastos: sumarGastos(f.gastos, caja.gastos), sinCuenta: centavos(f.sinCuenta + caja.sinCuenta),
      agregadores, comisionesCobro: cobro.total, faltantes, regalias: regaliasPeriodo, memos: f.memos,
    };

    const avisos: string[] = [];
    for (const m of meses) if (!realDelMes(reales, s.id, m.mes) && plantillaVigente(puestos, s.id, m.fin).length) avisos.push(`Nómina ${m.mes}: se usa plantilla estimada; falta capturar el desglose real del mes.`);
    if(merma.sinImportar)avisos.push(`Mermas: faltan ${merma.sinImportar} días por importar; el resultado es provisional.`);
    if(merma.sinCobertura)avisos.push(`Mermas: ${merma.sinCobertura} días sin cobertura confirmada de productos terminados. Reimporta el reporte completo; el resultado es provisional.`);
    if(merma.sinCosto)avisos.push(`Mermas: ${merma.sinCosto} renglones de productos sin costo confirmado quedan pendientes y fuera del monto conocido; el resultado es provisional.`);
    if(merma.sinCostoInsumos)avisos.push(`Mermas: ${merma.sinCostoInsumos} renglones de insumos sin costo quedan pendientes y fuera del monto conocido; el resultado es provisional.`);
    for (const c of conciliaciones.filas.filter(c=>c.sucursal_id===s.id)) {
      avisos.push(`Conciliación manual ${c.fecha}: ${c.motivo}${c.conciliar_productos?" · diferencia de productos justificada":""}.`);
    }
    if(rappi.dias.some(d=>d.sucursal_id===s.id))avisos.push("Incluye ventas del historial Rappi por subtotal restaurante, antes del descuento de Rappi. Revisa la liquidación por separado.");
    if(diasVenta.some(d=>d.agregador.total>0)&&rappi.dias.some(r=>r.sucursal_id===s.id&&diasSuc.some(d=>d.fecha===r.fecha&&Number(agregadorDe.get(d.id)?.total??0)>0)))avisos.push("Hay ventas de agregador en Dodo IS y órdenes Rappi importadas para los mismos días. Revisa su fuente en Ventas → Rappi para evitar duplicados.");
    if (diasSuc.length < diasRango) avisos.push(`Faltan ${diasRango - diasSuc.length} días de ventas por importar; los % son sobre lo importado.`);
    if (c.sinCosto.length) avisos.push(`${c.sinCosto.length} productos vendidos sin costo quedan fuera del alimento.`);
    const sinCuenta = facturasSuc.filter((x) => partesFactura(x).some((p) => !p.cuenta)).length;
    if (sinCuenta) avisos.push(`${sinCuenta} facturas sin cuenta del P&L (van a Otros).`);
    avisos.push(...avisoTardias(facturasSuc));
    if (fraccionTotal > 0 && !nomina.plantilla.cocina && !nomina.plantilla.gerencia) avisos.push("Sin plantilla de nómina para este periodo.");
    return {
      id: s.id, nombre: s.nombre, entrada, ctx: { ventaNeta, ventaRappi, plantilla: nomina.plantilla },
      metas: escalarMetas(metas.filter((m) => m.sucursal_id === s.id), fraccionTotal), avisos,
    };
  });

  // Oficina central: facturas sin sucursal (sin memos), gastos del mes y nómina de oficina, por fracción; se reparte por venta neta.
  const facturasOf = de(facturas, null);
  const fOf = facturasAGastos(facturasOf, fraccionDe);
  const sinCuentaOf = facturasOf.filter((x) => partesFactura(x).some((p) => !p.cuenta)).length;
  const avisosOficina = [
    ...(sinCuentaOf ? [`Oficina central: ${sinCuentaOf} facturas sin sucursal ni cuenta del P&L (se reparten como gasto de oficina).`] : []),
    ...avisoTardias(facturasOf).map((a) => `Oficina central: ${a}`),
  ];
  const nOf = nominaPeriodo(puestos, ajustes, null, meses, reales);
  const oficina = centavos(Object.values(fOf.gastos).reduce((t, v) => t + v, 0) + fOf.sinCuenta + nOf.cocina + nOf.gerencia);
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
  if (suc) {
    const filas = calcularPL(suc.entrada, suc.metas, suc.ctx);
    return { suc, titulo: suc.nombre, entrada: suc.entrada, filas, avisos: [...avisosSinCapturar(filas), ...suc.avisos] };
  }
  // En el consolidado, los costos fijos sin capturar se avisan por sucursal (ahí es donde falta capturarlos).
  const porSucursal = d.porSucursal.flatMap((s) =>
    [...avisosSinCapturar(calcularPL(s.entrada, s.metas, s.ctx)), ...s.avisos].map((a) => `${s.nombre}: ${a}`));
  return {
    suc: null, titulo: "Consolidado", entrada: d.consolidado.entrada,
    filas: calcularPL(d.consolidado.entrada, sumarMetas(d.porSucursal), d.consolidado.ctx),
    avisos: [...d.avisosOficina, ...porSucursal],
  };
}

/**
 * El periodo con sus dos comparaciones (% de venta): mes → mes anterior y acumulado del año;
 * semana → semana anterior y acumulado del mes. El acumulado se carga mes por mes en paralelo y se suma.
 */
export async function plConHistoria(supabase: SupabaseClient, p: Periodo, sucursalId: string | undefined) {
  const ant = anteriorDe(p, hoyMX(), INICIO_FECHA);
  const [d, previo, ...meses] = await Promise.all([
    datosPL(supabase, p),
    ant.vacio || ant.finNominal < INICIO_FECHA ? Promise.resolve(null) : datosPL(supabase, ant),
    ...rangosPorMes(acumuladoDe(p, INICIO_FECHA)).map((r) => datosPL(supabase, r)),
  ]);
  const vista = vistaPL(d, sucursalId);
  const pctDe = (filas: FilaPL[]) => new Map(filas.map((f) => [f.clave, f.pct]));
  const acum = sumarEntradas(meses.map((m) => vistaPL(m!, sucursalId).entrada));
  return {
    datos: d, ...vista,
    anterior: previo ? pctDe(vistaPL(previo, sucursalId).filas) : null,
    acumulado: pctDe(calcularPL(acum, [], { ventaNeta: acum.ventaNeta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } })),
    columnas: COLUMNAS[p.tipo],
    detalleDe: (renglon: string) => (vista.suc ? d.detalle.get(`${vista.suc.id}|${renglon}`) ?? [] : []),
    memoDetalle: (cuenta: "insumos" | "inversiones") => (vista.suc ? d.detalle.get(`${vista.suc.id}|memo_${cuenta}`) ?? [] : []),
  };
}

/** Vista comparativa: cada columna es un periodo (mes o semana) cargado en paralelo; el total es su suma. Sin metas. */
export async function comparativoPL(supabase: SupabaseClient, p: Periodo, sucursalId: string | undefined) {
  const { columnas, total, titulo } = columnasComparativo(p, hoyMX(), INICIO_FECHA);
  const [res, cargas] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    Promise.all(columnas.map((c) => datosPL(supabase, c.rango))),
  ]);
  if (res.error) throw new Error(`No se pudieron cargar las sucursales: ${res.error.message}`);
  const sucursales = res.data ?? [];
  const suc = sucursales.find((s) => s.id === sucursalId) ?? null;
  const filasDe = (e: EntradaPL) => calcularPL(e, [], { ventaNeta: e.ventaNeta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
  const entradas = cargas.map((d) => vistaPL(d, suc?.id).entrada);
  const suma = sumarEntradas(entradas);
  const cols: ColumnaPL[] = columnas.map((c, i) => ({ etiqueta: c.etiqueta, filas: filasDe(entradas[i]), entrada: entradas[i] }));
  return { titulo: suc?.nombre ?? "Consolidado", suc, sucursales, periodoTitulo: titulo, columnas: cols, total: { etiqueta: total, filas: filasDe(suma), entrada: suma } };
}
