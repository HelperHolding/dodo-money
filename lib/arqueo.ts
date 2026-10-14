import type { MomentoArqueo } from "./tipos";

/** En el inicio de turno todavía no hay ventas: el esperado es solo el fondo. */
export const pideVentas = (momento: MomentoArqueo) => momento !== "inicio";

export type EstadoCuadre = "pendiente" | "cuadra" | "faltante" | "sobrante";

/** Esperado = fondo + ventas en efectivo (salvo al inicio) − retiros a bóveda; diferencia = contado − esperado. */
export function cuadre({ momento, fondo, ventas, retiros, contado,pagos=0 }: {
  momento: MomentoArqueo; fondo: number; ventas: number | null; retiros: number; contado: number;pagos?:number;
}): { ventas: number; esperado: number; diferencia: number; estado: EstadoCuadre } {
  const v = pideVentas(momento) ? (ventas ?? 0) : 0;
  const esperado = fondo + v - retiros-pagos;
  const diferencia = Math.round((contado - esperado) * 100) / 100;
  const listo = contado > 0 && (!pideVentas(momento) || ventas !== null);
  const estado: EstadoCuadre = !listo ? "pendiente" : diferencia === 0 ? "cuadra" : diferencia < 0 ? "faltante" : "sobrante";
  return { ventas: v, esperado, diferencia, estado };
}

/** Los arqueos anulados (un duplicado, un conteo equivocado) se ven tachados pero no cuentan. */
export const arqueosVigentes = <A extends { anulado_en: string | null }>(arqueos: readonly A[]) => arqueos.filter((a) => !a.anulado_en);

const MOMENTOS: MomentoArqueo[] = ["inicio", "traspaso", "cierre"];

/**
 * Qué momentos se pueden registrar en el turno: un solo inicio vigente (la base de datos también lo exige).
 * Sugerido: inicio si aún no hay arqueos vigentes; si ya hay, traspaso.
 */
export function momentosDelTurno(arqueos: readonly { momento: MomentoArqueo; anulado_en: string | null }[]) {
  const vigentes = arqueosVigentes(arqueos);
  const conInicio = vigentes.some((a) => a.momento === "inicio");
  return {
    posibles: MOMENTOS.filter((m) => m !== "inicio" || !conInicio),
    sugerido: (vigentes.length ? "traspaso" : "inicio") as MomentoArqueo,
  };
}
