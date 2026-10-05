/** Cuentas del P&L: renglones que se alimentan de gastos (facturas, caja chica, gastos del mes) y memo. */
export const CUENTAS_GASTO = ["repartidores", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "otros"] as const;
/** No entran al EBITDA: insumos (el alimento sale del costo teórico en fase 1) e inversiones (activo fijo). */
export const CUENTAS_MEMO = ["insumos", "inversiones"] as const;
export type CuentaGasto = (typeof CUENTAS_GASTO)[number];
export type CuentaMemo = (typeof CUENTAS_MEMO)[number];
export type CuentaPl = CuentaGasto | CuentaMemo;

export const NOMBRE_CUENTA: Record<CuentaPl, string> = {
  repartidores: "Repartidores", marketing_agregadores: "Marketing de agregadores", marketing: "Marketing",
  renta: "Renta", servicios: "Servicios (luz, gas, agua, internet)", mantenimiento: "Mantenimiento",
  consumibles_equipo: "Consumibles y equipo menor", otros: "Otros gastos", insumos: "Compras de insumos (memo)", inversiones: "Inversiones (memo)",
};

export const esCuentaPl = (v: string): v is CuentaPl => (CUENTAS_GASTO as readonly string[]).includes(v) || (CUENTAS_MEMO as readonly string[]).includes(v);
export const esCuentaGasto = (v: string): v is CuentaGasto => (CUENTAS_GASTO as readonly string[]).includes(v);
