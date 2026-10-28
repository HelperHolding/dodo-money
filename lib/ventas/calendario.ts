/** Calendario para elegir el periodo de Ventas: semanas del mes, selección de rango y venta del rango. */

export type Mes = { anio: number; mes: number };
export type Seleccion = { inicio: string | null; fin: string | null };
export type Rango = { desde: string; hasta: string };

const DIA = 86_400_000;
const fecha = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const mesDe = (dia: string): Mes => ({ anio: Number(dia.slice(0, 4)), mes: Number(dia.slice(5, 7)) });

export function moverMes({ anio, mes }: Mes, pasos: number): Mes {
  const total = anio * 12 + (mes - 1) + pasos;
  return { anio: Math.floor(total / 12), mes: (total % 12) + 1 };
}

/** Semanas de lunes a domingo; los días fuera del mes son null. */
export function semanasDelMes(anio: number, mes: number): (string | null)[][] {
  const primero = Date.UTC(anio, mes - 1, 1);
  const dias = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const hueco = (new Date(primero).getUTCDay() + 6) % 7; // lunes = 0
  const celdas: (string | null)[] = [
    ...Array.from({ length: hueco }, () => null),
    ...Array.from({ length: dias }, (_, i) => fecha(primero + i * DIA)),
  ];
  while (celdas.length % 7) celdas.push(null);
  return Array.from({ length: celdas.length / 7 }, (_, s) => celdas.slice(s * 7, s * 7 + 7));
}

/** Primer toque = inicio; segundo = fin (si es anterior, se acomodan); con un rango completo, se empieza de nuevo. */
export function elegirDia(s: Seleccion, dia: string): Seleccion {
  if (!s.inicio || s.fin) return { inicio: dia, fin: null };
  return dia < s.inicio ? { inicio: dia, fin: s.inicio } : { inicio: s.inicio, fin: dia };
}

/** El rango que se aplicaría: con un solo toque, ese día. */
export function rangoElegido(s: Seleccion): Rango | null {
  return s.inicio ? { desde: s.inicio, hasta: s.fin ?? s.inicio } : null;
}

/** Días del rango contando los dos extremos. */
export const diasEntreFechas = (r: Rango) => Math.round((Date.parse(`${r.hasta}T00:00:00Z`) - Date.parse(`${r.desde}T00:00:00Z`)) / DIA) + 1;

export type PeriodoRapido = { clave: "hoy" | "semana" | "mes"; etiqueta: string; rango: Rango };

/** Botones de la barra del periodo: hoy, los últimos 7 días contando hoy y lo que va del mes. "Hoy" es el de por defecto. */
export function periodosRapidos(hoy: string): PeriodoRapido[] {
  return [
    { clave: "hoy", etiqueta: "Hoy", rango: { desde: hoy, hasta: hoy } },
    { clave: "semana", etiqueta: "Semana", rango: { desde: fecha(Date.parse(`${hoy}T00:00:00Z`) - 6 * DIA), hasta: hoy } },
    { clave: "mes", etiqueta: "Mes", rango: { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy } },
  ];
}

/** Suma de la venta de los días del rango que tienen venta. */
export function ventaDelRango(venta: Readonly<Record<string, number>>, r: Rango) {
  let total = 0, diasConVenta = 0;
  for (const [dia, monto] of Object.entries(venta)) {
    if (dia < r.desde || dia > r.hasta) continue;
    total += monto;
    diasConVenta++;
  }
  return { total: Math.round(total * 100) / 100, diasConVenta };
}

export type Eleccion = { sel: Seleccion; cargar: Rango | null; excede: boolean };

/**
 * Qué pasa al tocar un día (los datos se cargan solos, sin botón):
 * - primer toque: marca el inicio y espera otro día (no carga);
 * - segundo toque en otro día: carga ese rango; en el mismo día (doble toque): carga solo ese día;
 * - si el rango pasa de maxDias: no carga y conserva el primer día marcado.
 */
export function alElegirDia(s: Seleccion, dia: string, maxDias: number): Eleccion {
  const nueva = elegirDia(s, dia);
  if (!nueva.fin) return { sel: nueva, cargar: null, excede: false };
  const rango = rangoElegido(nueva)!;
  if (diasEntreFechas(rango) > maxDias) return { sel: { inicio: s.inicio, fin: null }, cargar: null, excede: true };
  return { sel: nueva, cargar: rango, excede: false };
}
