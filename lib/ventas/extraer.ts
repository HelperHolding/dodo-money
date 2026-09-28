import type { Hoja } from "./xlsx";

/** Lectura de las dos exportaciones diarias de Dodo IS ("Ventas" y "ProductsSales") ya convertidas en Hoja. */

export type Montos = { pedidos: number; total: number; efectivo: number; tarjeta: number; en_linea: number; iva: number };
export type TipoDesglose = "entrega" | "llevadera" | "restaurante" | "centro_llamadas" | "sitio" | "app" | "agregador";
export type Desglose = Montos & { tipo: TipoDesglose };
export type ReporteVentas = { sucursal: string; fecha: string; resumen: Montos & { venta_m2: number | null }; desglose: Desglose[] };
export type ProductoVendido = { dodo_id: number; nombre: string; cantidad: number; importe: number; importe_sin_descuento: number };
export type ReporteProductos = { sucursal: string; fecha: string; productos: ProductoVendido[] };

export const NO_ES_VENTAS = "Este archivo no parece un reporte de Ventas de Dodo IS.";
export const NO_ES_PRODUCTOS = "Este archivo no parece un reporte de Productos de Dodo IS.";
export const VARIOS_DIAS = "El archivo abarca varios días; exporta un solo día.";
export const SIN_DESCUENTOS = "El método de cálculo del reporte de productos debe ser Con descuentos.";

const TIPOS: Record<string, TipoDesglose> = {
  "entrega": "entrega",
  "llevadera": "llevadera",
  "restaurante": "restaurante",
  "centro de llamadas": "centro_llamadas",
  "sitio": "sitio",
  "aplicación móvil": "app",
  "agregador (tarjeta)": "agregador",
};

/** Espacios repetidos o sobrantes fuera: "Papas Gajo  Medium " → "Papas Gajo Medium". */
export const limpiarTexto = (t: string) => t.replace(/\s+/g, " ").trim();

const COLUMNAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function lector(h: Hoja) {
  const valor = (col: string, fila: number) => h.celdas.get(`${col}${fila}`);
  const texto = (col: string, fila: number) => limpiarTexto(String(valor(col, fila) ?? ""));
  const num = (col: string, fila: number) => {
    const v = valor(col, fila);
    return typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, "")) || 0;
  };
  const ultimaFila = Math.max(0, ...[...h.celdas.keys()].map((r) => Number(r.replace(/^[A-Z]+/, ""))));
  /** Primera fila, desde `desde`, cuya columna `col` dice exactamente `buscado`. */
  const fila = (col: string, buscado: string, desde = 1) => {
    for (let f = desde; f <= ultimaFila; f++) if (texto(col, f).toLowerCase() === buscado.toLowerCase()) return f;
    return 0;
  };
  /** Columna de la fila `f` cuyo encabezado es `buscado`. */
  const columna = (f: number, buscado: string) => [...COLUMNAS].find((c) => texto(c, f).toLowerCase() === buscado.toLowerCase());
  return { valor, texto, num, fila, columna, ultimaFila };
}

/** "25/09/2026 12:00:00 a.m. - 25/09/2026 11:59:00 p.m." → "2026-09-25"; si abarca dos fechas, error. */
function fechaDelPeriodo(periodo: string, error: string): string {
  const fechas = [...periodo.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map(([, d, m, a]) => `${a}-${m}-${d}`);
  if (fechas.length !== 2) throw new Error(error);
  if (fechas[0] !== fechas[1]) throw new Error(VARIOS_DIAS);
  return fechas[0];
}

export function extraerVentas(h: Hoja): ReporteVentas {
  const l = lector(h);
  if (l.texto("A", 1) !== "Informe" || l.texto("D", 1) !== "Ventas") throw new Error(NO_ES_VENTAS);
  const sucursal = l.texto("D", 2);
  const fecha = fechaDelPeriodo(l.texto("D", 3), NO_ES_VENTAS);

  const encabezado = l.fila("B", "Número de pedido");
  const cols = ["Número de pedido", "Total", "Efectivo", "Tarjeta", "En línea", "IMPUESTO"].map((t) => l.columna(encabezado, t));
  if (!encabezado || !sucursal || cols.some((c) => !c)) throw new Error(NO_ES_VENTAS);
  const [cPedidos, cTotal, cEfectivo, cTarjeta, cLinea, cIva] = cols as string[];
  const montos = (f: number): Montos => ({
    pedidos: Math.round(l.num(cPedidos, f)), total: l.num(cTotal, f), efectivo: l.num(cEfectivo, f),
    tarjeta: l.num(cTarjeta, f), en_linea: l.num(cLinea, f), iva: l.num(cIva, f),
  });

  const porDia = l.fila("A", "Unidad", encabezado);
  const filaTotal = l.fila("A", "Total", encabezado);
  if (!porDia || !filaTotal || filaTotal > porDia) throw new Error(NO_ES_VENTAS);

  const desglose: Desglose[] = [];
  for (let f = encabezado + 1; f < porDia; f++) {
    const tipo = TIPOS[l.texto("A", f).toLowerCase()];
    if (tipo) desglose.push({ tipo, ...montos(f) });
  }

  const cFecha = l.columna(porDia, "Fecha");
  const cM2 = l.columna(porDia, "Por m² de comedor");
  if (!cFecha) throw new Error(NO_ES_VENTAS);
  const dias: number[] = [];
  for (let f = porDia + 1; f <= l.ultimaFila; f++) if (typeof l.valor(cFecha, f) === "number") dias.push(f);
  if (dias.length > 1) throw new Error(VARIOS_DIAS);

  return {
    sucursal,
    fecha,
    resumen: { ...montos(filaTotal), venta_m2: dias.length && cM2 ? l.num(cM2, dias[0]) : null },
    desglose,
  };
}

export function extraerProductos(h: Hoja): ReporteProductos {
  const l = lector(h);
  if (l.texto("B", 1) !== "Informe de ventas de productos") throw new Error(NO_ES_PRODUCTOS);
  const sucursal = l.texto("B", 2);
  const fecha = fechaDelPeriodo(l.texto("B", 4), NO_ES_PRODUCTOS);
  const metodo = l.fila("A", "Método de cálculo");
  if (!metodo) throw new Error(NO_ES_PRODUCTOS);
  if (l.texto("B", metodo) !== "Con descuentos") throw new Error(SIN_DESCUENTOS);

  const encabezado = l.fila("B", "Identificador del producto");
  const cols = ["Identificador del producto", "Producto", "Cantidad", "Importe", "Cantidad sin descuento"].map((t) => l.columna(encabezado, t));
  if (!encabezado || !sucursal || cols.some((c) => !c)) throw new Error(NO_ES_PRODUCTOS);
  const [cId, cNombre, cCantidad, cImporte, cSinDescuento] = cols as string[];

  // Un producto repetido en el reporte se suma en un solo renglón.
  const porId = new Map<number, ProductoVendido>();
  for (let f = encabezado + 1; f <= l.ultimaFila; f++) {
    const id = l.valor(cId, f);
    if (typeof id !== "number") continue;
    const previo = porId.get(id);
    const cantidad = l.num(cCantidad, f), importe = l.num(cImporte, f), sinDescuento = l.num(cSinDescuento, f);
    porId.set(id, previo
      ? { ...previo, cantidad: previo.cantidad + cantidad, importe: previo.importe + importe, importe_sin_descuento: previo.importe_sin_descuento + sinDescuento }
      : { dodo_id: id, nombre: l.texto(cNombre, f), cantidad, importe, importe_sin_descuento: sinDescuento });
  }
  return { sucursal, fecha, productos: [...porId.values()] };
}

const fechaLarga = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
const diaDe = (fecha: string) => fechaLarga.format(new Date(`${fecha}T00:00:00Z`));

/** Revisa que los dos reportes sean del mismo día y sucursal; devuelve cuánto no cuadran (total − Σ importes). */
export function revisarPar(v: ReporteVentas, p: ReporteProductos): { sumaProductos: number; diferencia: number; cuadra: boolean } {
  if (v.sucursal !== p.sucursal) throw new Error(`El reporte de Ventas es de ${v.sucursal} y el de Productos de ${p.sucursal}.`);
  if (v.fecha !== p.fecha) throw new Error(`El reporte de Ventas es del ${diaDe(v.fecha)} y el de Productos del ${diaDe(p.fecha)}.`);
  const sumaProductos = Math.round(p.productos.reduce((s, x) => s + x.importe, 0) * 100) / 100;
  const diferencia = Math.round((v.resumen.total - sumaProductos) * 100) / 100;
  return { sumaProductos, diferencia, cuadra: Math.abs(diferencia) <= 1 };
}

/** Sucursal de la app con el nombre del reporte, sin distinguir mayúsculas ni espacios repetidos. */
export function buscarSucursal<T extends { nombre: string }>(nombre: string, sucursales: readonly T[]): T | null {
  const clave = limpiarTexto(nombre).toLowerCase();
  return sucursales.find((s) => limpiarTexto(s.nombre).toLowerCase() === clave) ?? null;
}

/** Guardar pide la casilla de confirmación si los archivos no cuadran o si el día ya estaba importado. */
export const necesitaConfirmacion = (r: { cuadra: boolean; yaImportado: boolean }) => !r.cuadra || r.yaImportado;
