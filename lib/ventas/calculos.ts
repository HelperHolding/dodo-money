/** Cálculos de ventas y costo teórico sobre lo importado de Dodo IS. Sin acceso a datos: solo números. */

import type { TipoDesglose } from "./extraer";

export type Categoria = "pizza" | "snack" | "postre" | "bebida" | "otro";
export const CATEGORIAS: readonly Categoria[] = ["pizza", "snack", "postre", "bebida", "otro"];
export const NOMBRE_CATEGORIA: Record<Categoria, string> = { pizza: "Pizzas", snack: "Snacks", postre: "Postres", bebida: "Bebidas", otro: "Otros" };
export type Tamano = "pequeno" | "mediano" | "grande";

const redondear = (n: number) => Math.round(n * 100) / 100;
const dividir = (a: number, b: number) => (b > 0 ? a / b : null);

/** Tamaño por el final del nombre: "… Pequeño", "… Mediano"/"… Medium", "… Grande"/"… Grande T". */
export function tamanoPorNombre(nombre: string): Tamano | null {
  const n = nombre.trim().toLowerCase();
  if (/\bpequeño$/.test(n)) return "pequeno";
  if (/\b(mediano|medium)$/.test(n)) return "mediano";
  if (/\bgrande( t)?$/.test(n)) return "grande";
  return null;
}

export type Costo = { vigente_desde: string; costo: number };

/** El costo con el vigente_desde más reciente que no pasa de la fecha (igual que costo_vigente en SQL); null si no hay. */
export function costoVigente<T extends Costo>(costos: readonly T[], fecha: string): T | null {
  let mejor: T | null = null;
  for (const c of costos) if (c.vigente_desde <= fecha && (!mejor || c.vigente_desde > mejor.vigente_desde)) mejor = c;
  return mejor;
}

export type VentaDia = {
  sucursal_id: string; fecha: string; pedidos: number; total: number; efectivo: number;
  tarjeta: number; en_linea: number; iva: number; venta_m2: number | null;
};

export function resumenVentas(dias: readonly VentaDia[]) {
  const suma = (k: "pedidos" | "total" | "efectivo" | "tarjeta" | "en_linea" | "iva") => redondear(dias.reduce((s, d) => s + Number(d[k]), 0));
  const total = suma("total"), iva = suma("iva"), pedidos = suma("pedidos");
  return {
    dias: new Set(dias.map((d) => d.fecha)).size,
    total, iva, neta: redondear(total - iva), pedidos,
    efectivo: suma("efectivo"), tarjeta: suma("tarjeta"), en_linea: suma("en_linea"),
    ticket: dividir(total, pedidos),
  };
}

/** Un renglón de la vista ventas_producto_costeo. */
export type RenglonCosteo = {
  fecha: string; dodo_id: number; nombre: string; categoria: Categoria | null;
  cantidad: number; importe: number; importe_sin_descuento: number; importe_neto: number; costo_unitario: number | null;
};

export type ProductoPeriodo = {
  dodo_id: number; nombre: string; categoria: Categoria | null;
  piezas: number; importe: number; sinDescuento: number; descuento: number; ventaNeta: number;
  /** null si algún día del periodo el producto no tuvo costo. */
  costo: number | null; costoPct: number | null;
};

/** Suma por producto; el nombre es el del renglón más reciente. */
export function porProducto(renglones: readonly RenglonCosteo[]): ProductoPeriodo[] {
  const mapa = new Map<number, ProductoPeriodo & { fecha: string }>();
  for (const r of renglones) {
    const p = mapa.get(r.dodo_id) ?? { dodo_id: r.dodo_id, nombre: r.nombre, categoria: r.categoria, fecha: r.fecha, piezas: 0, importe: 0, sinDescuento: 0, descuento: 0, ventaNeta: 0, costo: 0, costoPct: null };
    if (r.fecha >= p.fecha) { p.nombre = r.nombre; p.fecha = r.fecha; }
    p.piezas += Number(r.cantidad);
    p.importe += Number(r.importe);
    p.sinDescuento += Number(r.importe_sin_descuento);
    p.ventaNeta += Number(r.importe_neto);
    p.costo = p.costo === null || r.costo_unitario === null ? null : p.costo + Number(r.cantidad) * Number(r.costo_unitario);
    mapa.set(r.dodo_id, p);
  }
  return [...mapa.values()].map(({ fecha: _f, ...p }) => ({
    ...p,
    importe: redondear(p.importe), sinDescuento: redondear(p.sinDescuento), ventaNeta: redondear(p.ventaNeta),
    descuento: redondear(p.sinDescuento - p.importe),
    costo: p.costo === null ? null : redondear(p.costo),
    costoPct: p.costo === null ? null : dividir(p.costo, p.ventaNeta),
  }));
}

export type CosteoGrupo = {
  categoria: Categoria | null; piezas: number; importe: number; ventaNeta: number;
  piezasConCosto: number; ventaNetaConCosto: number; costo: number;
  costoPct: number | null; costoPromedio: number | null;
};

function grupo(categoria: Categoria | null, renglones: readonly RenglonCosteo[]): CosteoGrupo {
  let piezas = 0, importe = 0, ventaNeta = 0, piezasConCosto = 0, ventaNetaConCosto = 0, costo = 0;
  for (const r of renglones) {
    piezas += Number(r.cantidad);
    importe += Number(r.importe);
    ventaNeta += Number(r.importe_neto);
    if (r.costo_unitario === null) continue;
    piezasConCosto += Number(r.cantidad);
    ventaNetaConCosto += Number(r.importe_neto);
    costo += Number(r.cantidad) * Number(r.costo_unitario);
  }
  return {
    categoria, piezas, importe: redondear(importe), ventaNeta: redondear(ventaNeta),
    piezasConCosto, ventaNetaConCosto: redondear(ventaNetaConCosto), costo: redondear(costo),
    costoPct: dividir(costo, ventaNetaConCosto), costoPromedio: dividir(costo, piezasConCosto),
  };
}

/**
 * Costo teórico por categoría y total. El costo % es sobre la venta neta de los productos con costo;
 * el costo promedio ponderado, sobre las piezas con costo. Los productos sin costo se listan aparte.
 */
export function costeo(renglones: readonly RenglonCosteo[]) {
  const categorias = [...CATEGORIAS, null]
    .map((c) => grupo(c, renglones.filter((r) => r.categoria === c)))
    .filter((g) => g.piezas > 0);
  const sinCosto = porProducto(renglones.filter((r) => r.costo_unitario === null))
    .map(({ dodo_id, nombre, piezas }) => ({ dodo_id, nombre, piezas }))
    .sort((a, b) => b.piezas - a.piezas);
  return { categorias, total: grupo(null, renglones), sinCosto };
}

/** Los n productos que más vendieron (importe), con su cambio contra el periodo anterior (fracción; null si no vendió). */
export function topProductos(actual: readonly ProductoPeriodo[], anterior: readonly { dodo_id: number; importe: number }[], n = 10) {
  const previo = new Map<number, number>();
  for (const a of anterior) previo.set(a.dodo_id, (previo.get(a.dodo_id) ?? 0) + Number(a.importe));
  return [...actual]
    .sort((a, b) => b.importe - a.importe)
    .slice(0, n)
    .map((p) => {
      const antes = previo.get(p.dodo_id);
      return { ...p, cambio: antes ? (p.importe - antes) / antes : null };
    });
}

export function descuentos(productos: readonly ProductoPeriodo[], n = 5) {
  const total = redondear(productos.reduce((s, p) => s + p.descuento, 0));
  const sinDescuento = redondear(productos.reduce((s, p) => s + p.sinDescuento, 0));
  return {
    total, sinDescuento, pct: dividir(total, sinDescuento),
    top: productos.filter((p) => p.descuento > 0).sort((a, b) => b.descuento - a.descuento).slice(0, n),
  };
}

export type CierreDia = {
  sucursal_id: string; fecha: string; efectivo: number; tarjeta: number; app: number; rappi: number; iva: number; transacciones: number;
};

export type Diferencia = { concepto: string; dodo: number; cierre: number; diferencia: number; alerta: boolean; esPedido: boolean };

/** Cierre del gerente contra Dodo IS. Diferencia = cierre − Dodo IS; alerta si pasa de $1 (o de 0 pedidos). */
export function compararConCierre(v: VentaDia, c: CierreDia): Diferencia[] {
  const fila = (concepto: string, dodo: number, cierre: number, esPedido = false): Diferencia => {
    const diferencia = redondear(Number(cierre) - Number(dodo));
    return { concepto, dodo: Number(dodo), cierre: Number(cierre), diferencia, alerta: Math.abs(diferencia) > (esPedido ? 0 : 1), esPedido };
  };
  return [
    fila("Total", v.total, Number(c.efectivo) + Number(c.tarjeta) + Number(c.app) + Number(c.rappi)),
    fila("Efectivo", v.efectivo, c.efectivo),
    fila("Tarjeta", v.tarjeta, c.tarjeta),
    fila("En línea (app + Rappi)", v.en_linea, Number(c.app) + Number(c.rappi)),
    fila("IVA", v.iva, c.iva),
    fila("Pedidos", v.pedidos, c.transacciones, true),
  ];
}

export type Periodo = { desde: string; hasta: string };

const DIA = 86_400_000;
const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);
const fechaReal = (t: string | undefined): t is string =>
  !!t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().startsWith(t);

/** Máximo de días que se pueden pedir de una vez. */
export const MAX_DIAS = 92;

/** Los 7 días que terminan en el último día con datos. */
export const periodoPorDefecto = (ultimoConDatos: string): Periodo => ({ desde: sumarDias(ultimoConDatos, -6), hasta: ultimoConDatos });

/** El periodo pedido en la URL si es válido (fechas reales, en orden, hasta MAX_DIAS); si no, el de por defecto. */
export function periodoElegido(desde: string | undefined, hasta: string | undefined, porDefecto: Periodo): Periodo {
  if (!fechaReal(desde) || !fechaReal(hasta) || desde > hasta || diasEntre(desde, hasta) >= MAX_DIAS) return porDefecto;
  return { desde, hasta };
}

/** El periodo del mismo largo justo antes. */
export function periodoAnterior(p: Periodo): Periodo {
  const largo = diasEntre(p.desde, p.hasta) + 1;
  return { desde: sumarDias(p.desde, -largo), hasta: sumarDias(p.desde, -1) };
}

/** Venta total y pedidos por fecha, sumando sucursales. */
export function ventaPorDia(dias: readonly VentaDia[]): { fecha: string; total: number; pedidos: number }[] {
  const mapa = new Map<string, { fecha: string; total: number; pedidos: number }>();
  for (const d of dias) {
    const f = mapa.get(d.fecha) ?? { fecha: d.fecha, total: 0, pedidos: 0 };
    f.total = redondear(f.total + Number(d.total));
    f.pedidos += Number(d.pedidos);
    mapa.set(d.fecha, f);
  }
  return [...mapa.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}


export const NOMBRE_TIPO: Record<TipoDesglose, string> = {
  entrega: "Entrega", llevadera: "Llevadera", restaurante: "Restaurante", centro_llamadas: "Centro de llamadas",
  sitio: "Sitio", app: "Aplicación móvil", agregador: "Agregador",
};

/** Suma del desglose por tipo; solo los tipos con venta o pedidos, de mayor a menor venta. */
export function sumarDesglose(filas: readonly { tipo: TipoDesglose; pedidos: number; total: number }[]) {
  const mapa = new Map<TipoDesglose, { tipo: TipoDesglose; pedidos: number; total: number }>();
  for (const f of filas) {
    const t = mapa.get(f.tipo) ?? { tipo: f.tipo, pedidos: 0, total: 0 };
    t.pedidos += Number(f.pedidos);
    t.total = redondear(t.total + Number(f.total));
    mapa.set(f.tipo, t);
  }
  return [...mapa.values()].filter((t) => t.total || t.pedidos).sort((a, b) => b.total - a.total);
}

/**
 * Entrega, llevadera y restaurante reparten el total por tipo de servicio; centro de llamadas, sitio, app y agregador
 * lo reparten por origen del pedido. Un mismo pedido está en los dos, así que no se suman juntos.
 */
const TIPOS_SERVICIO: readonly TipoDesglose[] = ["entrega", "llevadera", "restaurante"];

export function separarDesglose(filas: readonly { tipo: TipoDesglose; pedidos: number; total: number }[]) {
  const todos = sumarDesglose(filas);
  return {
    servicio: todos.filter((t) => TIPOS_SERVICIO.includes(t.tipo)),
    origen: todos.filter((t) => !TIPOS_SERVICIO.includes(t.tipo)),
  };
}

/** Cada día importado que tiene cierre del gerente, con su comparación; y cuántos días no tienen cierre. */
export function diasConCierre(dias: readonly VentaDia[], cierres: readonly CierreDia[]) {
  const porClave = new Map(cierres.map((c) => [`${c.sucursal_id}|${c.fecha}`, c]));
  const comparados = [];
  let sinCierre = 0;
  for (const d of dias) {
    const c = porClave.get(`${d.sucursal_id}|${d.fecha}`);
    if (!c) { sinCierre++; continue; }
    const filas = compararConCierre(d, c);
    comparados.push({ sucursal_id: d.sucursal_id, fecha: d.fecha, filas, alerta: filas.some((f) => f.alerta) });
  }
  return { comparados, sinCierre };
}

/** Mensaje de error de un costo capturado, o null si está bien. */
export function errorDeCosto(costo: number, vigenteDesde: string): string | null {
  if (!Number.isFinite(costo) || costo < 0) return "Escribe un costo válido (0 o más).";
  if (costo >= 100_000_000) return "El costo es demasiado grande.";
  if (!fechaReal(vigenteDesde)) return "Elige desde qué fecha aplica el costo.";
  return null;
}
