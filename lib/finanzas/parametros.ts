/** Parámetros del P&L con fecha de vigencia: un cambio no altera los días anteriores. */
export type ClaveParametro = "regalias_pct" | "rappi_pct" | "dlocal_pct" | "oxxo_pct" | "oxxo_participacion" | "netpay_pct" | "amex_pct" | "amex_participacion";
export type Parametro = { clave: ClaveParametro; valor: number; vigente_desde: string };

export const NOMBRE_PARAMETRO: Record<ClaveParametro, string> = {
  regalias_pct: "Regalías (sobre venta neta)", rappi_pct: "Comisión Rappi (sobre venta con IVA)",
  dlocal_pct: "dLocal, pagos en la app", oxxo_pct: "dLocal, pagos en Oxxo", oxxo_participacion: "Parte de la venta en línea pagada en Oxxo",
  netpay_pct: "NetPay, débito y crédito", amex_pct: "NetPay, Amex e internacionales", amex_participacion: "Parte de la venta con tarjeta en Amex/internacional",
};

/** Valor vigente en la fecha (el de vigente_desde más reciente que no pasa de ella); 0 si no hay. */
export function valorVigente(params: readonly Parametro[], clave: ClaveParametro, fecha: string): number {
  let mejor: Parametro | null = null;
  for (const p of params) if (p.clave === clave && p.vigente_desde <= fecha && (!mejor || p.vigente_desde > mejor.vigente_desde)) mejor = p;
  return mejor ? Number(mejor.valor) : 0;
}
