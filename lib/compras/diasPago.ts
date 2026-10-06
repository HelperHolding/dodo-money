/** Días de pago autorizados a proveedores (hoy: viernes). Días ISO: 1 = lunes … 7 = domingo. Fechas YYYY-MM-DD. */
export const NOMBRE_DIA: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 7: "Domingo" };

const sumarDias = (f: string, n: number) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diaIso = (f: string) => ((new Date(`${f}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const esDiaDePago = (f: string, dias: readonly number[]) => dias.includes(diaIso(f));

/** El primer día autorizado desde `desde` (incluido). */
export function proximoDiaDePago(desde: string, dias: readonly number[]): string {
  let d = desde;
  for (let i = 0; i < 7 && !esDiaDePago(d, dias); i++) d = sumarDias(d, 1);
  return d;
}

/** Último día autorizado en o antes del vencimiento (nunca se paga tarde); si ya pasó, el próximo desde hoy. */
export function diaDePagoSugerido(vence: string, hoy: string, dias: readonly number[]): string {
  let d = vence;
  for (let i = 0; i < 7 && !esDiaDePago(d, dias); i++) d = sumarDias(d, -1);
  return d < hoy ? proximoDiaDePago(hoy, dias) : d;
}

export function proximosDiasDePago(desde: string, dias: readonly number[], n: number): string[] {
  const r: string[] = [];
  for (let d = proximoDiaDePago(desde, dias); r.length < n; d = proximoDiaDePago(sumarDias(d, 1), dias)) r.push(d);
  return r;
}

export const textoDia = (f: string) => `${NOMBRE_DIA[diaIso(f)]} ${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

export function leerDiasPago(valores: readonly string[]): { dias: number[] } | { error: string } {
  const dias = [...new Set(valores.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
  return dias.length ? { dias } : { error: "Elige al menos un día de pago." };
}
