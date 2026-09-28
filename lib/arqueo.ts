import type { MomentoArqueo } from "./tipos";

/** En el inicio de turno todavía no hay ventas: el esperado es solo el fondo. */
export const pideVentas = (momento: MomentoArqueo) => momento !== "inicio";

export type EstadoCuadre = "pendiente" | "cuadra" | "faltante" | "sobrante";

/** Esperado = fondo + ventas en efectivo (salvo al inicio) − retiros a bóveda; diferencia = contado − esperado. */
export function cuadre({ momento, fondo, ventas, retiros, contado }: {
  momento: MomentoArqueo; fondo: number; ventas: number | null; retiros: number; contado: number;
}): { ventas: number; esperado: number; diferencia: number; estado: EstadoCuadre } {
  const v = pideVentas(momento) ? (ventas ?? 0) : 0;
  const esperado = fondo + v - retiros;
  const diferencia = Math.round((contado - esperado) * 100) / 100;
  const listo = contado > 0 && (!pideVentas(momento) || ventas !== null);
  const estado: EstadoCuadre = !listo ? "pendiente" : diferencia === 0 ? "cuadra" : diferencia < 0 ? "faltante" : "sobrante";
  return { ventas: v, esperado, diferencia, estado };
}
