import { hoyCalendarioMX } from "@/lib/formato";

/** Mes pedido (AAAA-MM, o el actual) y sus límites en hora de México (UTC-6, sin horario de verano desde 2022). */
export function limitesMes(pedido?: string) {
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido ?? "") ? pedido! : hoyCalendarioMX().slice(0, 7);
  const a = Number(mes.slice(0, 4)), m = Number(mes.slice(5, 7));
  const siguiente = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return { mes, desde: `${mes}-01T00:00:00-06:00`, hasta: `${siguiente}-01T00:00:00-06:00` };
}
