/** Comisiones (Rappi, cobro) y regalías del P&L, día por día con el parámetro vigente ese día. */
import type { ClaveParametro } from "./parametros";

export type DiaVenta = {
  fecha: string; total: number; iva: number; tarjeta: number; en_linea: number;
  /** Lo del canal agregador (Rappi) ese día, con IVA: su cobro no pasa por dLocal ni NetPay. */
  agregador: { total: number; tarjeta: number; en_linea: number };
};
export type Vigente = (clave: ClaveParametro, fecha: string) => number;

const centavos = (n: number) => Math.round(n * 100) / 100;

export const comisionRappi = (dias: readonly DiaVenta[], vigente: Vigente) =>
  centavos(dias.reduce((s, d) => s + Number(d.agregador.total) * vigente("rappi_pct", d.fecha), 0));

export function comisionesCobro(dias: readonly DiaVenta[], vigente: Vigente) {
  let dlocal = 0, netpay = 0;
  for (const d of dias) {
    const enLinea = Math.max(0, Number(d.en_linea) - Number(d.agregador.en_linea));
    const tarjeta = Math.max(0, Number(d.tarjeta) - Number(d.agregador.tarjeta));
    const oxxo = vigente("oxxo_participacion", d.fecha), amex = vigente("amex_participacion", d.fecha);
    dlocal += enLinea * ((1 - oxxo) * vigente("dlocal_pct", d.fecha) + oxxo * vigente("oxxo_pct", d.fecha));
    netpay += tarjeta * ((1 - amex) * vigente("netpay_pct", d.fecha) + amex * vigente("amex_pct", d.fecha));
  }
  return { dlocal: centavos(dlocal), netpay: centavos(netpay), total: centavos(centavos(dlocal) + centavos(netpay)) };
}

export const regalias = (dias: readonly DiaVenta[], vigente: Vigente) =>
  centavos(dias.reduce((s, d) => s + (Number(d.total) - Number(d.iva)) * vigente("regalias_pct", d.fecha), 0));
