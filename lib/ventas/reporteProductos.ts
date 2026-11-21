/** Excel de ventas por producto del periodo elegido en Ventas: totales por producto y el detalle día por día. */
import type { Celda, HojaXlsx } from "../xlsx-escribir";
import type { Periodo, ProductoPeriodo, RenglonCosteo } from "./calculos";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { NOMBRE_CATEGORIA as NOMBRES, porProducto as sumarProductos } from "./calculos.ts";

const NOMBRE_CATEGORIA: Record<NonNullable<RenglonCosteo["categoria"]>, string> = NOMBRES;
const porProducto: (r: readonly RenglonCosteo[]) => ProductoPeriodo[] = sumarProductos;

export type CanalProductos = { nombre: string; renglones: readonly RenglonCosteo[] };

const pesos = (n: number | null): Celda => (n === null ? null : { valor: n, formato: "pesos" });
const pct = (n: number | null): Celda => (n === null ? null : { valor: n, formato: "porcentaje" });
const centavos = (n: number) => Math.round(n * 100) / 100;
const categoria = (c: RenglonCosteo["categoria"]) => (c ? NOMBRE_CATEGORIA[c] : "Sin categoría");

/** "Ventas por producto Coyoacán 2026-09-01 a 2026-09-30.xlsx", sin los caracteres que Windows no acepta. */
export function nombreArchivoProductos(titulo: string, p: Periodo): string {
  const limpio = titulo.replace(/[\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return `Ventas por producto ${limpio} ${p.desde} a ${p.hasta}.xlsx`;
}

/**
 * Hojas "Por producto" (un renglón por producto con piezas por canal, venta, descuento, participación y costo)
 * y "Por día" (fecha × producto × canal, para filtrar o hacer tablas dinámicas).
 */
export function hojasProductos(r: { titulo: string; periodo: Periodo; generado: string; canales: readonly CanalProductos[] }): HojaXlsx[] {
  const todos = r.canales.flatMap((c) => c.renglones);
  const productos = porProducto(todos).sort((a, b) => b.importe - a.importe || a.nombre.localeCompare(b.nombre, "es"));
  const piezasCanal = r.canales.map((c) => {
    const m = new Map<number, number>();
    for (const x of c.renglones) m.set(x.dodo_id, (m.get(x.dodo_id) ?? 0) + Number(x.cantidad));
    return m;
  });
  const t = porProducto(todos.map((x) => ({ ...x, dodo_id: 0 })))[0];
  const total = t?.importe ?? 0;
  const encabezado: Celda[][] = [
    [`Ventas por producto · ${r.titulo}`],
    [`Del ${r.periodo.desde} al ${r.periodo.hasta}`],
    [`Generado por ${r.generado}`],
    [],
  ];
  const columnas = ["Producto", "Categoría", "Piezas", ...r.canales.map((c) => `Piezas ${c.nombre}`),
    "Venta sin descuento", "Descuento", "Venta con IVA", "Venta neta (sin IVA)", "% de la venta", "Precio promedio", "Costo teórico", "% costo"];
  const filasProducto: Celda[][] = [
    ...encabezado,
    columnas,
    ...productos.map((p): Celda[] => [
      p.nombre, categoria(p.categoria), p.piezas, ...piezasCanal.map((m) => m.get(p.dodo_id) ?? 0),
      pesos(p.sinDescuento), pesos(p.descuento), pesos(p.importe), pesos(p.ventaNeta),
      pct(total > 0 ? Math.round((p.importe / total) * 10_000) / 10_000 : null),
      pesos(p.piezas > 0 ? centavos(p.importe / p.piezas) : null), pesos(p.costo), pct(p.costoPct),
    ]),
    ["Total", null, t?.piezas ?? 0, ...piezasCanal.map((m) => [...m.values()].reduce((n, v) => n + v, 0)),
      pesos(t?.sinDescuento ?? 0), pesos(t?.descuento ?? 0), pesos(total), pesos(t?.ventaNeta ?? 0),
      pct(total > 0 ? 1 : null), pesos(t && t.piezas > 0 ? centavos(t.importe / t.piezas) : null), pesos(t?.costo ?? null), pct(t?.costoPct ?? null)],
  ];

  const detalle = r.canales.flatMap((c) => c.renglones.map((x) => ({ canal: c.nombre, ...x })));
  // Con varias sucursales un producto se repite el mismo día: se suma en un solo renglón por fecha, producto y canal.
  const porDia = new Map<string, (typeof detalle)[number]>();
  for (const x of detalle) {
    const k = `${x.fecha}|${x.dodo_id}|${x.canal}`;
    const a = porDia.get(k);
    porDia.set(k, a ? { ...a, nombre: x.nombre, cantidad: a.cantidad + Number(x.cantidad), importe: a.importe + Number(x.importe),
      importe_sin_descuento: a.importe_sin_descuento + Number(x.importe_sin_descuento), importe_neto: a.importe_neto + Number(x.importe_neto) }
      : { ...x, cantidad: Number(x.cantidad), importe: Number(x.importe), importe_sin_descuento: Number(x.importe_sin_descuento), importe_neto: Number(x.importe_neto) });
  }
  const dias = [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || b.importe - a.importe || a.nombre.localeCompare(b.nombre, "es"));
  const filasDia: Celda[][] = [
    ...encabezado,
    ["Fecha", "Producto", "Categoría", "Canal", "Piezas", "Venta sin descuento", "Descuento", "Venta con IVA", "Venta neta (sin IVA)"],
    ...dias.map((x): Celda[] => [
      { fecha: x.fecha }, x.nombre, categoria(x.categoria), x.canal, x.cantidad, pesos(centavos(x.importe_sin_descuento)),
      pesos(centavos(x.importe_sin_descuento - x.importe)), pesos(centavos(x.importe)), pesos(centavos(x.importe_neto)),
    ]),
  ];

  const finProducto = filasProducto.length - 1;
  return [
    { nombre: "Por producto", filas: filasProducto, negritas: [0, 4, finProducto], inmovilizar: 5,
      anchos: [34, 14, 10, ...r.canales.map(() => 14), 18, 14, 16, 18, 12, 14, 16, 10] },
    { nombre: "Por día", filas: filasDia, negritas: [0, 4], inmovilizar: 5, anchos: [12, 34, 14, 16, 10, 18, 14, 16, 18] },
  ];
}
