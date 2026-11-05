/** Cuentas del P&L: renglones que se alimentan de gastos (facturas, caja chica, gastos del mes) y memo. */
export const CUENTAS_GASTO = ["repartidores", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "otros"] as const;
/**
 * No entran al EBITDA: insumos (el alimento sale del costo teórico en fase 1), inversiones (activo fijo) y regalías
 * (las facturas del franquiciador; el renglón de regalías ya se calcula como venta × tasa).
 */
export const CUENTAS_MEMO = ["insumos", "inversiones", "regalias"] as const;
export type CuentaGasto = (typeof CUENTAS_GASTO)[number];
export type CuentaMemo = (typeof CUENTAS_MEMO)[number];
export type CuentaPl = CuentaGasto | CuentaMemo;

export const NOMBRE_CUENTA: Record<CuentaPl, string> = {
  repartidores: "Repartidores", marketing_agregadores: "Marketing de agregadores", marketing: "Marketing",
  renta: "Renta", servicios: "Servicios (luz, gas, agua, internet)", mantenimiento: "Mantenimiento",
  consumibles_equipo: "Consumibles y equipo menor", otros: "Otros gastos", insumos: "Compras de insumos (memo)", inversiones: "Inversiones (memo)",
  regalias: "Regalías (memo)",
};
/** Cómo se presenta cada memo en el P&L. */
export const NOMBRE_MEMO: Record<CuentaMemo, string> = {
  insumos: NOMBRE_CUENTA.insumos, inversiones: NOMBRE_CUENTA.inversiones, regalias: "Regalías facturadas (memo)",
};
export type Memos = Record<CuentaMemo, number>;
export const memosVacios = (): Memos => ({ insumos: 0, inversiones: 0, regalias: 0 });

export const esCuentaPl = (v: string): v is CuentaPl => (CUENTAS_GASTO as readonly string[]).includes(v) || (CUENTAS_MEMO as readonly string[]).includes(v);
export const esCuentaGasto = (v: string): v is CuentaGasto => (CUENTAS_GASTO as readonly string[]).includes(v);
export const esCuentaMemo = (v: string | null | undefined): v is CuentaMemo => (CUENTAS_MEMO as readonly string[]).includes(v ?? "");
