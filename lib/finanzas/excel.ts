import type { Celda, HojaXlsx } from "../xlsx-escribir";
import type { FilaPL } from "./pl";

const pesos = (n: number | null): Celda => (n === null ? null : { valor: n, formato: "pesos" });
const pct = (n: number | null | undefined): Celda => (n === null || n === undefined ? null : { valor: n, formato: "porcentaje" });

/** El P&L del mes en una hoja de Excel (montos como números con formato, % reales). */
export function hojaPL(r: {
  titulo: string; periodo: string; generado: string; filas: FilaPL[];
  anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
  columnas: { anterior: string; acumulado: string };
}): HojaXlsx[] {
  const filas: Celda[][] = [
    [`P&L · ${r.titulo}`], [`${r.periodo} · sin IVA, criterio devengado`], [`Generado por ${r.generado}`], [],
    ["Renglón", "Real", "% de venta", "Meta", "Meta %", "Diferencia", r.columnas.anterior, r.columnas.acumulado],
    ...r.filas.map((f): Celda[] => [
      f.nombre, f.monto === null ? "Sin dato" : pesos(f.monto), pct(f.pct), pesos(f.meta), pct(f.metaPct), pesos(f.diferencia),
      r.anterior ? pct(r.anterior.get(f.clave)) : null, pct(r.acumulado.get(f.clave)),
    ]),
  ];
  const negritas = [0, 4, ...r.filas.flatMap((f, i) => (f.tipo === "total" || f.tipo === "venta" ? [i + 5] : []))];
  return [{ nombre: "P&L", filas, negritas, anchos: [30, 16, 12, 16, 12, 16, 16, 14] }];
}
