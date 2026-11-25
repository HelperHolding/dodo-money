// Presupuesto vivo de una apertura (HD-3): CAPEX (presupuesto, comprometido, facturado, pagado) más lo cotizado sin orden de compra.
// @ts-expect-error Node strip-types requiere extensión explícita.
import { CATEGORIAS_CAPEX, equivalenciaItem, nombreCategoriaCapex, type FilaCapex } from "../finanzas/capex.ts";
import type { ItemApertura } from "../aperturas";

export type FilaVivo = { clave: string; nombre: string; presupuesto: number | null; pagado: number; facturado: number; comprometido: number; cotizado: number; faltante: number | null };
export type PresupuestoVivo = { categorias: FilaVivo[]; total: FilaVivo; conPresupuesto: boolean };
type ItemCotizado = Pick<ItemApertura, "tipo" | "estado" | "cantidad" | "precio" | "orden_id" | "categoria">;

const c = (n: number) => Math.round(n * 100);
const IVA = 1.16;

/** Cotizado sin OC: equipo o referencia cotizado/aprobado con cantidad y precio y sin orden ligada (lo que ya tiene orden está en comprometido). */
const cotizadoSinOrden = (i: ItemCotizado) =>
  (i.tipo === "equipo" || i.tipo === "referencia") && (i.estado === "cotizado" || i.estado === "aprobado") && i.orden_id === null
  && Number(i.cantidad) > 0 && Number(i.precio) > 0;

export function presupuestoVivo(filas: FilaCapex[], items: ItemCotizado[]): PresupuestoVivo {
  const cotizado = new Map<string, number>();
  for (const i of items.filter(cotizadoSinOrden)) {
    const k = equivalenciaItem(i.categoria);
    cotizado.set(k, (cotizado.get(k) ?? 0) + Math.round(Number(i.cantidad) * Number(i.precio) / IVA * 100));
  }
  const categorias = CATEGORIAS_CAPEX.map(({ clave }): FilaVivo => {
    const de = filas.filter((f) => f.categoria === clave);
    const pres = de.some((f) => f.presupuesto !== null) ? de.reduce((a, f) => a + c(f.presupuesto ?? 0), 0) : null;
    const sum = (k: "pagado" | "facturado" | "comprometido") => de.reduce((a, f) => a + c(Number(f[k])), 0);
    const pagado = sum("pagado"), facturado = sum("facturado"), comprometido = sum("comprometido"), cot = cotizado.get(clave) ?? 0;
    return { clave, nombre: nombreCategoriaCapex(clave), presupuesto: pres === null ? null : pres / 100, pagado: pagado / 100, facturado: facturado / 100,
      comprometido: comprometido / 100, cotizado: cot / 100, faltante: pres === null ? null : Math.max(0, pres - comprometido - facturado - cot) / 100 };
  }).filter((f) => f.presupuesto !== null || f.pagado || f.facturado || f.comprometido || f.cotizado);
  const conPresupuesto = categorias.some((f) => f.presupuesto !== null);
  const suma = (k: "pagado" | "facturado" | "comprometido" | "cotizado") => categorias.reduce((a, f) => a + c(f[k]), 0) / 100;
  const total: FilaVivo = { clave: "total", nombre: "Total",
    presupuesto: conPresupuesto ? categorias.reduce((a, f) => a + c(f.presupuesto ?? 0), 0) / 100 : null,
    pagado: suma("pagado"), facturado: suma("facturado"), comprometido: suma("comprometido"), cotizado: suma("cotizado"),
    faltante: conPresupuesto ? categorias.reduce((a, f) => a + c(f.faltante ?? 0), 0) / 100 : null };
  return { categorias, total, conPresupuesto };
}

/** Para el KPI «Compras con precio firme»: comprometido + facturado + cotizado sin OC sobre el presupuesto CAPEX. Sin presupuesto: null (el KPI queda como hoy). */
export function kpiVivo(v: PresupuestoVivo): { monto: number; presupuesto: number } | null {
  if (!v.conPresupuesto || v.total.presupuesto === null) return null;
  return { monto: (c(v.total.comprometido) + c(v.total.facturado) + c(v.total.cotizado)) / 100, presupuesto: v.total.presupuesto };
}
