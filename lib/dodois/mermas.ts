/**
 * Mermas desde la API de Dodo IS: /accounting/write-offs/products (productos terminados, con su receta) y
 * /accounting/write-offs/stock-items (insumos dados de baja sueltos; no repiten los de los productos).
 * Se convierten a los mismos renglones que el Excel de Bajas para reemplazar días completos con importar_mermas_dodo.
 * El costo sin IVA sale del precio de recepción de cada insumo en Dodo IS. Si a la receta de un producto le falta algún
 * precio, el producto toma el costo teórico del catálogo (el mismo de Alimento en el P&L); sin ninguno, queda pendiente.
 */
import type { DiaMerma, MermaDodo } from "../finanzas/mermasDodo";

type InsumoReceta = { id: string; name: string; quantity: number; measurementUnit: string };
export type MermaProductoApi = {
  writeOffListId?: string; unitId: string; unitName?: string; writtenOffAtLocal: string; writtenOffAt?: string; reason: string;
  productId: string; productName: string; quantity: number; pricePerPiece?: number;
  /** Cantidades totales de la baja (no por pieza). */
  stockItems: InsumoReceta[];
};
export type MermaInsumoApi = {
  unitId: string; unitName?: string; writtenOffAtLocal: string; writtenOffAt?: string; reason: string;
  stockItemId: string; stockItemName: string; quantity: number; measurementUnit: string;
};
/** Precio sin IVA por unidad de un insumo de Dodo IS a una fecha, o null si no se conoce. */
export type PrecioInsumo = (insumoId: string, fecha: string) => number | null;
/** Costo teórico sin IVA por pieza de un producto de Dodo IS a una fecha (catálogo: receta + periférico), o null. */
export type CostoProducto = (productoId: string, fecha: string) => number | null;

/** Las bajas con razón Marketing (producto regalado) no son merma: el P&L las manda a Marketing. */
export const MARKETING = "marketing:";
export const esMarketing = (clave: string) => clave.startsWith(MARKETING);

const UNIDAD: Record<string, string> = { kilogram: "kg", gram: "g", quantity: "pza", liter: "l", meter: "m" };
const DIA = 86_400_000;
const pesos = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const mil = (n: number) => Math.round(n * 1000) / 1000;
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * DIA).toISOString().slice(0, 10);
const fechaValida = (f: string) => /^\d{4}-\d{2}-\d{2}$/.test(f) && new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) === f;

export function traducirMermas(p: {
  sucursalId: string; unitId: string; desde: string; hasta: string;
  productos: readonly MermaProductoApi[]; insumos: readonly MermaInsumoApi[]; precio: PrecioInsumo;
  /** Respaldo cuando algún insumo de la receta no tiene precio de recepción (p. ej. la masa, que no se compra). */
  costoProducto?: CostoProducto;
}): { dias: DiaMerma[]; filas: MermaDodo[] } {
  const dias: DiaMerma[] = [];
  for (let f = p.desde; f <= p.hasta; f = sumarDias(f, 1)) dias.push({ sucursal_id: p.sucursalId, fecha: f, productos_completos: true });
  const dentro = (u: string, local: string) => u === p.unitId && local.slice(0, 10) >= p.desde && local.slice(0, 10) <= p.hasta;
  const filas = new Map<string, MermaDodo>();
  const sumar = (k: string, nueva: MermaDodo) => {
    const previa = filas.get(k);
    filas.set(k, previa
      ? { ...previa, cantidad: mil(previa.cantidad + nueva.cantidad), costo: pesos(previa.costo + nueva.costo), sin_costo: previa.sin_costo || nueva.sin_costo }
      : nueva);
  };

  for (const x of p.productos) {
    if (!dentro(x.unitId, x.writtenOffAtLocal) || !(Number(x.quantity) > 0)) continue;
    const fecha = x.writtenOffAtLocal.slice(0, 10), mkt = x.reason === "Marketing";
    let costo = 0, faltaPrecio = !x.stockItems?.length;
    for (const i of x.stockItems ?? []) {
      const pr = p.precio(i.id, fecha);
      if (pr === null) faltaPrecio = true; else costo += Number(i.quantity) * pr;
    }
    if (faltaPrecio) {
      const unitario = p.costoProducto?.(x.productId, fecha) ?? null;
      if (unitario !== null && unitario > 0) { costo = Number(x.quantity) * unitario; faltaPrecio = false; }
    }
    const clave = `${mkt ? MARKETING : ""}${x.productName.trim().toLowerCase()}`;
    sumar(`${fecha}|producto|${clave}`, {
      sucursal_id: p.sucursalId, fecha, tipo: "producto", clave, nombre: x.productName.trim(), unidad: "piezas",
      categoria: mkt ? "Marketing" : "Producto terminado", cantidad: Number(x.quantity), costo: faltaPrecio ? 0 : pesos(costo),
      sin_costo: faltaPrecio || costo === 0,
    });
  }

  for (const x of p.insumos) {
    if (!dentro(x.unitId, x.writtenOffAtLocal) || !(Number(x.quantity) > 0)) continue;
    const fecha = x.writtenOffAtLocal.slice(0, 10), mkt = x.reason === "Marketing";
    const pr = p.precio(x.stockItemId, fecha);
    const clave = `${mkt ? MARKETING : ""}${x.stockItemId.toUpperCase()}`;
    sumar(`${fecha}|insumo|${clave}`, {
      sucursal_id: p.sucursalId, fecha, tipo: "insumo", clave, nombre: x.stockItemName.trim(),
      unidad: UNIDAD[(x.measurementUnit ?? "").toLowerCase()] ?? x.measurementUnit, categoria: mkt ? "Marketing" : "Insumo",
      cantidad: mil(Number(x.quantity)), costo: pr === null ? 0 : pesos(Number(x.quantity) * pr), sin_costo: pr === null || pr === 0,
    });
  }
  return { dias, filas: [...filas.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo) || a.clave.localeCompare(b.clave)) };
}

/**
 * Precio por insumo desde las recepciones de Dodo IS (precio sin IVA por unidad): el último recibido hasta la fecha en la
 * sucursal; si no hay, el último de cualquier sucursal; antes de la primera recepción, la primera conocida.
 */
export function precioDesdeRecepciones(
  recepciones: readonly { sucursal_id: string; dodo_insumo_id: string; fecha: string; precio: number }[], sucursalId: string,
): PrecioInsumo {
  const porInsumo = new Map<string, { suc: boolean; fecha: string; precio: number }[]>();
  for (const r of recepciones) {
    if (!(Number(r.precio) > 0)) continue;
    const k = r.dodo_insumo_id.toUpperCase();
    porInsumo.set(k, [...(porInsumo.get(k) ?? []), { suc: r.sucursal_id === sucursalId, fecha: r.fecha, precio: Number(r.precio) }]);
  }
  for (const l of porInsumo.values()) l.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return (id, fecha) => {
    const l = porInsumo.get(id.toUpperCase());
    if (!l?.length) return null;
    const propias = l.filter((r) => r.suc), lista = propias.length ? propias : l;
    return (lista.filter((r) => r.fecha <= fecha).at(-1) ?? lista[0]).precio;
  };
}

/**
 * Costo por pieza desde el catálogo: el producto de Dodo IS (productId) se liga a productos_venta con productos_codigos
 * (dodo_uuid → dodo_id) y toma el costos_producto con el vigente_desde más reciente que no pasa de la fecha.
 */
export function costoDesdeCatalogo(
  codigos: readonly { dodo_uuid: string; dodo_id: number | null }[],
  costos: readonly { dodo_id: number; costo: number; vigente_desde: string }[],
): CostoProducto {
  const idDe = new Map(codigos.filter((c) => c.dodo_id !== null).map((c) => [c.dodo_uuid.toUpperCase(), Number(c.dodo_id)]));
  const porProducto = new Map<number, { costo: number; vigente_desde: string }[]>();
  for (const c of costos) porProducto.set(Number(c.dodo_id), [...(porProducto.get(Number(c.dodo_id)) ?? []), c]);
  return (productoId, fecha) => {
    const id = idDe.get(productoId.toUpperCase());
    if (id === undefined) return null;
    let mejor: { costo: number; vigente_desde: string } | null = null;
    for (const c of porProducto.get(id) ?? []) if (c.vigente_desde <= fecha && (!mejor || c.vigente_desde > mejor.vigente_desde)) mejor = c;
    return mejor ? Number(mejor.costo) : null;
  };
}

/** Ventana de mermas: el cron trae los últimos 3 días hasta hoy; a mano, el rango pedido (máximo 31 días, sin pasar de hoy). */
export function ventanaMermas(hoy: string, desde?: string, hasta?: string): { desde: string; hasta: string } | null {
  if (!desde && !hasta) return { desde: sumarDias(hoy, -2), hasta: hoy };
  if (!desde || !hasta || !fechaValida(desde) || !fechaValida(hasta) || hasta < desde) return null;
  const fin = hasta > hoy ? hoy : hasta;
  if (fin < desde || (Date.parse(fin) - Date.parse(desde)) / DIA > 30) return null;
  return { desde, hasta: fin };
}
