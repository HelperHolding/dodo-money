/**
 * Reporte de ventas Rappi para descargar (PDF y Excel) desde Ventas → Rappi: el mismo periodo y sucursal de la página.
 * Puro, sin red: recibe las órdenes ya cargadas (portal en vivo y, si hay, pedidos de agregador de Dodo IS).
 */
import type { Celda, EstiloFila, HojaXlsx } from "../xlsx-escribir";
import type { RappiGuardada } from "./rappi";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { esDeDodo, esTurbo } from "./rappi.ts";

export type TiendaRappi = "Rappi" | "Rappi Turbo" | "Dodo IS";
export type OrdenReporteRappi = {
  id: string; fecha: string; hora: string; dia: string; sucursal: string; tienda: TiendaRappi; estado: RappiGuardada["estado"];
  /** Finalizada y con fuente Rappi (o capturada en Dodo IS): es la que suma a la venta. */
  cuenta: boolean; fuente: "Portal Rappi" | "Incluida en Dodo IS" | "Dodo IS"; pago: string;
  bruto: number; descuento: number; subtotal: number; descuentoRappi: number; facturar: number;
  lineas: { cantidad: number; nombre: string; opciones: string; importe: number }[];
};
type Importes = { ordenes: number; bruto: number; descuento: number; subtotal: number; descuentoRappi: number; facturar: number };
export type ResumenReporteRappi = {
  recibidas: number; canceladas: number; conReclamo: number; noSuman: number;
  venta: Importes; subtotalCanceladas: number; subtotalReclamo: number;
  tiendas: { tienda: TiendaRappi; ordenes: number; subtotal: number }[];
  dias: (Importes & { fecha: string; dia: string; canceladas: number; reclamos: number; turbo: number })[];
  semana: { dia: string; ordenes: number; subtotal: number; turbo: number }[];
  horas: { hora: number; ordenes: number; subtotal: number }[];
  productos: { nombre: string; unidades: number; ordenes: number; importe: number }[];
  pagos: { pago: string; ordenes: number }[];
};

export const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"] as const;
const LUNES_A_DOMINGO = [1, 2, 3, 4, 5, 6, 0].map((i) => DIAS_SEMANA[i]);
const centavos = (n: number) => Math.round(n * 100) / 100;
const diaDe = (fecha: string) => DIAS_SEMANA[new Date(`${fecha}T12:00:00Z`).getUTCDay()];

/** Órdenes del portal y pedidos de agregador de Dodo IS como renglones del reporte, de la más antigua a la más reciente. */
export function ordenesReporteRappi(ordenes: readonly RappiGuardada[], nombreSucursal: (id: string) => string): OrdenReporteRappi[] {
  return ordenes.map((o): OrdenReporteRappi => {
    const dodo = esDeDodo(o);
    return {
      id: dodo ? o.rappi_id.replace(/^dodo:/, "Dodo IS ") : o.rappi_id, fecha: o.fecha, hora: o.hora.slice(0, 5), dia: diaDe(o.fecha),
      sucursal: nombreSucursal(o.sucursal_id), tienda: dodo ? "Dodo IS" : esTurbo(o) ? "Rappi Turbo" : "Rappi", estado: o.estado,
      cuenta: o.estado === "Finalizado" && o.sumar, fuente: dodo ? "Dodo IS" : o.sumar ? "Portal Rappi" : "Incluida en Dodo IS", pago: o.pago,
      bruto: Number(o.bruto), descuento: Number(o.descuento_restaurante), subtotal: Number(o.subtotal_restaurante),
      descuentoRappi: Number(o.descuento_rappi), facturar: Number(o.facturar),
      lineas: [...o.rappi_lineas].sort((a, b) => a.linea - b.linea)
        .map((l) => ({ cantidad: Number(l.cantidad), nombre: l.nombre, opciones: l.opciones ?? "", importe: Number(l.importe) })),
    };
  }).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.hora.localeCompare(b.hora) || a.id.localeCompare(b.id));
}

function importes(ordenes: readonly OrdenReporteRappi[]): Importes {
  const s = (k: "bruto" | "descuento" | "subtotal" | "descuentoRappi" | "facturar") => centavos(ordenes.reduce((t, o) => t + o[k], 0));
  return { ordenes: ordenes.length, bruto: s("bruto"), descuento: s("descuento"), subtotal: s("subtotal"), descuentoRappi: s("descuentoRappi"), facturar: s("facturar") };
}

/** Totales, días, día de la semana, horas, productos y formas de pago; la venta solo con las órdenes que cuentan. */
export function resumenReporteRappi(ordenes: readonly OrdenReporteRappi[]): ResumenReporteRappi {
  const venta = ordenes.filter((o) => o.cuenta);
  const subtotalDe = (a: readonly OrdenReporteRappi[]) => centavos(a.reduce((t, o) => t + o.subtotal, 0));
  const turboDe = (a: readonly OrdenReporteRappi[]) => subtotalDe(a.filter((o) => o.tienda === "Rappi Turbo"));
  const fechas = [...new Set(ordenes.map((o) => o.fecha))].sort();
  const productos = new Map<string, { unidades: number; importe: number; ordenes: Set<string> }>();
  for (const o of venta) for (const l of o.lineas) {
    const p = productos.get(l.nombre) ?? { unidades: 0, importe: 0, ordenes: new Set<string>() };
    p.unidades += l.cantidad; p.importe = centavos(p.importe + l.importe); p.ordenes.add(o.id); productos.set(l.nombre, p);
  }
  const pagos = new Map<string, number>();
  for (const o of venta) { const k = o.pago.split(" - ")[0].trim() || "Sin dato"; pagos.set(k, (pagos.get(k) ?? 0) + 1); }
  return {
    recibidas: ordenes.length,
    canceladas: ordenes.filter((o) => o.estado === "Cancelado").length,
    conReclamo: ordenes.filter((o) => o.estado === "Con reclamo").length,
    noSuman: ordenes.filter((o) => o.estado === "Finalizado" && !o.cuenta).length,
    venta: importes(venta),
    subtotalCanceladas: subtotalDe(ordenes.filter((o) => o.estado === "Cancelado")),
    subtotalReclamo: subtotalDe(ordenes.filter((o) => o.estado === "Con reclamo")),
    tiendas: (["Rappi", "Rappi Turbo", "Dodo IS"] as const).map((tienda) => { const a = venta.filter((o) => o.tienda === tienda); return { tienda, ordenes: a.length, subtotal: subtotalDe(a) }; })
      .filter((t) => t.tienda === "Rappi" || t.ordenes > 0),
    dias: fechas.map((fecha) => {
      const todas = ordenes.filter((o) => o.fecha === fecha), d = venta.filter((o) => o.fecha === fecha);
      return { fecha, dia: diaDe(fecha), ...importes(d), canceladas: todas.filter((o) => o.estado === "Cancelado").length,
        reclamos: todas.filter((o) => o.estado === "Con reclamo").length, turbo: turboDe(d) };
    }),
    semana: LUNES_A_DOMINGO.map((dia) => { const a = venta.filter((o) => o.dia === dia); return { dia, ordenes: a.length, subtotal: subtotalDe(a), turbo: turboDe(a) }; }),
    horas: Array.from({ length: 24 }, (_, hora) => { const a = venta.filter((o) => Number(o.hora.slice(0, 2)) === hora); return { hora, ordenes: a.length, subtotal: subtotalDe(a) }; })
      .filter((h) => h.ordenes > 0),
    productos: [...productos].map(([nombre, p]) => ({ nombre, unidades: p.unidades, ordenes: p.ordenes.size, importe: p.importe }))
      .sort((a, b) => b.unidades - a.unidades || b.importe - a.importe || a.nombre.localeCompare(b.nombre)),
    pagos: [...pagos].map(([pago, n]) => ({ pago, ordenes: n })).sort((a, b) => b.ordenes - a.ordenes || a.pago.localeCompare(b.pago)),
  };
}

const ENCABEZADO: EstiloFila = { fondo: "FDE7DC", negrita: true };
const pesos = (n: number): Celda => ({ valor: centavos(n), formato: "pesos" });
const fx = (formula: string, resultado: number, formato?: "pesos" | "porcentaje", estilo?: EstiloFila): Celda => ({ formula, resultado, formato, estilo });

/**
 * Hojas del Excel: Resumen, Por día, Órdenes (una fila por orden), Productos (una por producto) y Más vendidos. Los totales son
 * fórmulas sobre la hoja «Órdenes» (columna «Cuenta en venta» = Sí), con su resultado ya calculado.
 */
export function hojasReporteRappi(r: { titulo: string; desde: string; hasta: string; generado: string; ordenes: readonly OrdenReporteRappi[] }): HojaXlsx[] {
  const o = r.ordenes, res = resumenReporteRappi(o), v = res.venta;
  const fin = o.length + 1, col = (c: string) => `Órdenes!$${c}$2:$${c}$${Math.max(2, fin)}`;
  const cuenta = `${col("H")},"Sí"`;

  const filasOrdenes: Celda[][] = [["Orden", "Fecha", "Hora", "Día", "Sucursal", "Tienda", "Estado", "Cuenta en venta", "Fuente", "Pago", "Unidades", "Productos",
    "Venta bruta", "Descuento restaurante", "Subtotal restaurante", "Descuento Rappi", "A facturar", "Subtotal sin IVA"],
  ...o.map((x, i): Celda[] => { const n = i + 2; return [
    { texto: x.id }, { fecha: x.fecha }, x.hora, x.dia, x.sucursal, x.tienda, x.estado, x.cuenta ? "Sí" : "No", x.fuente, x.pago,
    x.lineas.reduce((t, l) => t + l.cantidad, 0), x.lineas.map((l) => `${l.cantidad}× ${l.nombre}${l.opciones ? ` (${l.opciones})` : ""}`).join(" | "),
    pesos(x.bruto), pesos(x.descuento), fx(`M${n}-N${n}`, centavos(x.bruto - x.descuento), "pesos"), pesos(x.descuentoRappi),
    fx(`O${n}-P${n}`, centavos(x.bruto - x.descuento - x.descuentoRappi), "pesos"), fx(`ROUND(O${n}/1.16,2)`, centavos((x.bruto - x.descuento) / 1.16), "pesos")]; })];

  const filasProductos: Celda[][] = [["Orden", "Fecha", "Hora", "Tienda", "Estado", "Cuenta en venta", "Cantidad", "Producto", "Opciones", "Importe"],
    ...o.flatMap((x) => x.lineas.map((l): Celda[] => [{ texto: x.id }, { fecha: x.fecha }, x.hora, x.tienda, x.estado, x.cuenta ? "Sí" : "No", l.cantidad, l.nombre, l.opciones, pesos(l.importe)]))];

  const sumaDia = (c: string, f: string) => `SUMIFS(${col(c)},${col("B")},${f},${cuenta})`;
  const filasDia: Celda[][] = [["Fecha", "Día", "Órdenes que cuentan", "Canceladas", "Con reclamo", "Venta bruta", "Descuento restaurante", "Subtotal restaurante", "Rappi Turbo", "Descuento Rappi", "A facturar", "Ticket promedio"],
    ...res.dias.map((d, i): Celda[] => { const n = i + 2, f = `A${n}`; return [{ fecha: d.fecha }, d.dia,
      fx(`COUNTIFS(${col("B")},${f},${cuenta})`, d.ordenes), fx(`COUNTIFS(${col("B")},${f},${col("G")},"Cancelado")`, d.canceladas),
      fx(`COUNTIFS(${col("B")},${f},${col("G")},"Con reclamo")`, d.reclamos), fx(sumaDia("M", f), d.bruto, "pesos"), fx(sumaDia("N", f), d.descuento, "pesos"),
      fx(sumaDia("O", f), d.subtotal, "pesos"), fx(`SUMIFS(${col("O")},${col("B")},${f},${cuenta},${col("F")},"Rappi Turbo")`, d.turbo, "pesos"),
      fx(sumaDia("P", f), d.descuentoRappi, "pesos"), fx(sumaDia("Q", f), d.facturar, "pesos"), fx(`IF(C${n}=0,0,H${n}/C${n})`, d.ordenes ? centavos(d.subtotal / d.ordenes) : 0, "pesos")]; })];
  const td = filasDia.length + 1, ultimo = Math.max(2, filasDia.length);
  const totDia = [v.ordenes, res.canceladas, res.conReclamo, v.bruto, v.descuento, v.subtotal, res.tiendas.find((t) => t.tienda === "Rappi Turbo")?.subtotal ?? 0, v.descuentoRappi, v.facturar];
  filasDia.push(["Total", null, ...["C", "D", "E", "F", "G", "H", "I", "J", "K"].map((c, i) => fx(`SUM(${c}2:${c}${ultimo})`, totDia[i], i < 3 ? undefined : "pesos")),
    fx(`IF(C${td}=0,0,H${td}/C${td})`, v.ordenes ? centavos(v.subtotal / v.ordenes) : 0, "pesos")]);

  const filasRanking: Celda[][] = [["#", "Producto", "Unidades", "% de unidades", "Órdenes", "Importe (precio de lista)"],
    ...res.productos.map((p, i): Celda[] => { const n = i + 2, total = res.productos.reduce((t, x) => t + x.unidades, 0); return [i + 1, p.nombre,
      fx(`SUMIFS(Productos!$G:$G,Productos!$H:$H,B${n},Productos!$F:$F,"Sí")`, p.unidades),
      fx(`IF(SUM($C$2:$C$${res.productos.length + 1})=0,0,C${n}/SUM($C$2:$C$${res.productos.length + 1}))`, total ? p.unidades / total : 0, "porcentaje"), p.ordenes,
      fx(`SUMIFS(Productos!$J:$J,Productos!$H:$H,B${n},Productos!$F:$F,"Sí")`, p.importe, "pesos")]; })];

  const pct = (fila: number, valor: number) => fx(`IF($B$10=0,0,B${fila}/$B$10)`, v.bruto ? valor / v.bruto : 0, "porcentaje");
  const filasResumen: Celda[][] = [
    [{ texto: `Ventas Rappi · ${r.titulo}`, estilo: { negrita: true, tamano: 14 } }],
    [`Del ${r.desde} al ${r.hasta} · generado por ${r.generado}`],
    ["Importes con IVA. «Subtotal restaurante» es la venta Rappi de Dodo MX: después del descuento del restaurante y antes del descuento de Rappi."],
    [],
    [{ texto: "Concepto", estilo: ENCABEZADO }, { texto: "Valor", estilo: ENCABEZADO }, { texto: "% de venta bruta", estilo: ENCABEZADO }],
    ["Órdenes recibidas", fx(`COUNTA(${col("A")})`, res.recibidas)],
    ["Órdenes que cuentan en la venta", fx(`COUNTIFS(${cuenta})`, v.ordenes)],
    ["Órdenes canceladas", fx(`COUNTIFS(${col("G")},"Cancelado")`, res.canceladas)],
    ["Órdenes con reclamo", fx(`COUNTIFS(${col("G")},"Con reclamo")`, res.conReclamo)],
    ["Venta bruta", fx(`SUMIFS(${col("M")},${cuenta})`, v.bruto, "pesos"), pct(10, v.bruto)],
    ["Descuento restaurante", fx(`SUMIFS(${col("N")},${cuenta})`, v.descuento, "pesos"), pct(11, v.descuento)],
    [{ texto: "Subtotal restaurante (venta Rappi)", estilo: { negrita: true } }, fx(`SUMIFS(${col("O")},${cuenta})`, v.subtotal, "pesos", { negrita: true }), pct(12, v.subtotal)],
    ["Descuento Rappi", fx(`SUMIFS(${col("P")},${cuenta})`, v.descuentoRappi, "pesos"), pct(13, v.descuentoRappi)],
    ["A facturar (lo que paga el cliente)", fx(`SUMIFS(${col("Q")},${cuenta})`, v.facturar, "pesos"), pct(14, v.facturar)],
    ["Subtotal restaurante sin IVA", fx("ROUND(B12/1.16,2)", centavos(v.subtotal / 1.16), "pesos")],
    ["Ticket promedio", fx("IF(B7=0,0,B12/B7)", v.ordenes ? centavos(v.subtotal / v.ordenes) : 0, "pesos")],
    ["Subtotal de canceladas (no suma)", fx(`SUMIFS(${col("O")},${col("G")},"Cancelado")`, res.subtotalCanceladas, "pesos")],
    ["Subtotal con reclamo (no suma)", fx(`SUMIFS(${col("O")},${col("G")},"Con reclamo")`, res.subtotalReclamo, "pesos")],
    [],
    [{ texto: "Por tienda", estilo: ENCABEZADO }, { texto: "Órdenes", estilo: ENCABEZADO }, { texto: "Subtotal restaurante", estilo: ENCABEZADO }, { texto: "% del subtotal", estilo: ENCABEZADO }],
    ...res.tiendas.map((t, i): Celda[] => { const n = 21 + i; return [t.tienda, fx(`COUNTIFS(${col("F")},A${n},${cuenta})`, t.ordenes),
      fx(`SUMIFS(${col("O")},${col("F")},A${n},${cuenta})`, t.subtotal, "pesos"), fx(`IF($B$12=0,0,C${n}/$B$12)`, v.subtotal ? t.subtotal / v.subtotal : 0, "porcentaje")]; }),
    [],
    [{ texto: "Notas", estilo: { negrita: true } }],
    ["• Fuente: órdenes en vivo del portal de Rappi guardadas en Dodo MX (Ventas → Rappi), con el periodo y la sucursal elegidos."],
    ["• Solo cuentan las órdenes finalizadas con fuente Rappi. Las que dicen «Incluida en Dodo IS» ya se sumaron en Dodo IS y no se repiten."],
    ["• No incluye la liquidación del reporte financiero (comisión, retenciones y depósitos): está en Banca → Rappi y en el P&L."],
  ];
  if (res.tiendas.some((t) => t.tienda === "Dodo IS")) filasResumen.push(["• «Dodo IS» son pedidos de agregador capturados en Dodo IS: su importe es lo que pagó el cliente y Dodo IS no distingue Turbo."]);

  return [
    { nombre: "Resumen", filas: filasResumen, anchos: [46, 18, 22, 16], ocultarCuadricula: true },
    { nombre: "Por día", filas: filasDia, negritas: [filasDia.length - 1], anchos: [12, 11, 12, 11, 12, 15, 18, 18, 14, 16, 15, 15], inmovilizar: 1, estilos: { 0: ENCABEZADO } },
    { nombre: "Órdenes", filas: filasOrdenes, anchos: [16, 11, 7, 11, 22, 12, 12, 9, 18, 30, 9, 70, 13, 14, 14, 13, 13, 14], inmovilizar: 1, estilos: { 0: ENCABEZADO } },
    { nombre: "Productos", filas: filasProductos, anchos: [16, 11, 7, 12, 12, 9, 9, 40, 40, 12], inmovilizar: 1, estilos: { 0: ENCABEZADO } },
    { nombre: "Más vendidos", filas: filasRanking, anchos: [5, 40, 10, 13, 10, 20], inmovilizar: 1, estilos: { 0: ENCABEZADO } },
  ];
}
