import type { NormaMasa, TempArea } from "./tipos";

export const TEMP_MIN = 12;
export const TEMP_MAX = 22;
export const TEMPS_AREA = [25, 30, 35] as const;

export const bolasNorma = (n: NormaMasa, t: TempArea) => (t === 25 ? n.bolas_25 : t === 30 ? n.bolas_30 : n.bolas_35);

export const temperaturaEnNorma = (c: number) => c >= TEMP_MIN && c <= TEMP_MAX;

/** Descarta lecturas imposibles (Fahrenheit, dedo de más). La base de datos acepta de −5 a 50 °C. */
export const temperaturaValida = (c: number) => Number.isFinite(c) && c >= -5 && c <= 50;

/** Por qué la lectura necesita comentario, o null si está en norma. */
export function motivoComentario(n: NormaMasa, t: TempArea, bolas: number, temperatura: number): string | null {
  if (!temperaturaEnNorma(temperatura)) return `la masa está a ${temperatura} °C, fuera de ${TEMP_MIN} a ${TEMP_MAX} °C`;
  const norma = bolasNorma(n, t);
  if (bolas !== norma) return `sacaste ${bolas} bolas y la norma es ${norma}`;
  return null;
}
