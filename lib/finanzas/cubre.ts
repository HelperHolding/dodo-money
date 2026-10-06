/**
 * Periodo que cubre una factura, en meses completos (el recibo bimestral de CFE cubre agosto–septiembre aunque se emita en
 * octubre). El P&L reparte cada factura por los días de su periodo que caen en el rango, no por su fecha de emisión.
 */
import type { InicioCubre } from "../compras/proveedores";
import type { Rango } from "./periodo";

const DIA = 86_400_000;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const diasEntre = (desde: string, hasta: string) =>
  hasta < desde ? 0 : Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA) + 1;

/** "2026-10" más n meses (n puede ser negativo). */
export function sumarMeses(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "2026-02" → "2026-02-28". */
export const ultimoDiaMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Periodo por la regla del proveedor: N meses desde los anteriores a la emisión, el de emisión o el siguiente. */
export function periodoCubre(fecha: string, meses: number, inicio: InicioCubre): Rango {
  const mes = fecha.slice(0, 7);
  const primero = inicio === "anteriores" ? sumarMeses(mes, -meses) : inicio === "siguiente" ? sumarMeses(mes, 1) : mes;
  return { desde: `${primero}-01`, hasta: ultimoDiaMes(sumarMeses(primero, meses - 1)) };
}

/** Días del periodo que caen en el rango, días del periodo y la fracción que le toca al rango. */
export function fraccionCubre(cubre: Rango, rango: Rango): { dias: number; total: number; fraccion: number } {
  const total = diasEntre(cubre.desde, cubre.hasta);
  const dias = diasEntre(cubre.desde > rango.desde ? cubre.desde : rango.desde, cubre.hasta < rango.hasta ? cubre.hasta : rango.hasta);
  return { dias, total, fraccion: total ? dias / total : 0 };
}

const nombreMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];

/** "octubre 2026", "agosto–septiembre 2026", "diciembre 2026–febrero 2027". */
export function textoCubre(cubre: Rango): string {
  const a = cubre.desde.slice(0, 7), b = cubre.hasta.slice(0, 7);
  if (a === b) return `${nombreMes(a)} ${a.slice(0, 4)}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${nombreMes(a)}–${nombreMes(b)} ${a.slice(0, 4)}`;
  return `${nombreMes(a)} ${a.slice(0, 4)}–${nombreMes(b)} ${b.slice(0, 4)}`;
}

/** ¿Cubre solo el mes en que se emitió? (lo de siempre: no hace falta decirlo en el P&L). */
export const esMesDeEmision = (cubre: Rango, fecha: string) =>
  cubre.desde === `${fecha.slice(0, 7)}-01` && cubre.hasta === ultimoDiaMes(fecha.slice(0, 7));

export const MAX_MESES_CUBRE = 24;
const MES = /^20\d\d-(0[1-9]|1[0-2])$/;

/** Lee "de qué mes a qué mes" (AAAA-MM). Los dos vacíos: null (queda la regla del proveedor). */
export function leerPeriodoMeses(desde: string, hasta: string): { periodo: Rango | null } | { error: string } {
  const a = desde.trim(), b = hasta.trim();
  if (!a && !b) return { periodo: null };
  if (!MES.test(a) || !MES.test(b)) return { error: "Elige de qué mes a qué mes cubre." };
  if (b < a) return { error: "El periodo no puede terminar antes de empezar." };
  if (sumarMeses(a, MAX_MESES_CUBRE - 1) < b) return { error: `El periodo es de hasta ${MAX_MESES_CUBRE} meses.` };
  return { periodo: { desde: `${a}-01`, hasta: ultimoDiaMes(b) } };
}

/** Facturas con monto en el rango capturadas después de que terminó el mes de `hasta` (llegaron con el mes cerrado). */
export function capturasTardias(facturas: readonly { capturada: string; monto: number }[], hasta: string): { n: number; monto: number } {
  const cierre = ultimoDiaMes(hasta.slice(0, 7));
  const tarde = facturas.filter((f) => f.capturada > cierre && f.monto !== 0);
  return { n: tarde.length, monto: Math.round(tarde.reduce((t, f) => t + f.monto, 0) * 100) / 100 };
}
