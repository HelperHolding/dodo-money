import type { AreaLimpieza } from "./tipos";

export const NOMBRE_DIA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

const aFecha = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha YYYY-MM-DD. */
export function diaSemanaISO(fecha: string): number {
  return aFecha(fecha).getUTCDay() || 7;
}

/** Semana ISO (1–53) de una fecha YYYY-MM-DD, igual que extract(week) de Postgres. */
export function semanaISO(fecha: string): number {
  const d = aFecha(fecha);
  d.setUTCDate(d.getUTCDate() + 4 - diaSemanaISO(fecha));
  const inicio = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - inicio) / 86_400_000 + 1) / 7);
}

/** Semana ISO impar = tabla 1, par = tabla 2. */
export function cicloDeFecha(fecha: string): { semana: 1 | 2; dia: number } {
  return { semana: semanaISO(fecha) % 2 === 1 ? 1 : 2, dia: diaSemanaISO(fecha) };
}

export function areaDelDia(areas: readonly AreaLimpieza[], fecha: string): string | null {
  const { semana, dia } = cicloDeFecha(fecha);
  return areas.find((a) => a.semana === semana && a.dia_semana === dia)?.area ?? null;
}
