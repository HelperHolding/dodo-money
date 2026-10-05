import type { CuentaGasto } from "./cuentas";

const GASTO = ["repartidores", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "otros"];
const centavos = (n: number) => Math.round(n * 100) / 100;

/** Facturas del mes → gasto por cuenta (subtotal − descuento; notas de crédito restan; canceladas no cuentan). */
export function facturasAGastos(facturas: readonly { tipo: "ingreso" | "egreso"; estado: string; subtotal: number; descuento: number; cuenta_pl: string | null }[]) {
  const gastos: Partial<Record<CuentaGasto, number>> = {};
  let sinCuenta = 0;
  const memos = { insumos: 0, inversiones: 0 };
  for (const f of facturas) {
    if (f.estado === "cancelada") continue;
    const monto = (Number(f.subtotal) - Number(f.descuento)) * (f.tipo === "egreso" ? -1 : 1);
    if (f.cuenta_pl === "insumos" || f.cuenta_pl === "inversiones") memos[f.cuenta_pl] = centavos(memos[f.cuenta_pl] + monto);
    else if (f.cuenta_pl && GASTO.includes(f.cuenta_pl)) gastos[f.cuenta_pl as CuentaGasto] = centavos((gastos[f.cuenta_pl as CuentaGasto] ?? 0) + monto);
    else sinCuenta = centavos(sinCuenta + monto);
  }
  return { gastos, sinCuenta, memos };
}

export function sumarGastos(...partes: Partial<Record<CuentaGasto, number>>[]): Partial<Record<CuentaGasto, number>> {
  const r: Partial<Record<CuentaGasto, number>> = {};
  for (const p of partes) for (const [k, v] of Object.entries(p) as [CuentaGasto, number][]) r[k] = centavos((r[k] ?? 0) + v);
  return r;
}

/** Faltantes de efectivo como gasto: −Σ diferencias (una diferencia negativa es faltante). */
export const faltantesDe = (diferencias: readonly number[]) => centavos(-diferencias.reduce((s, d) => s + Number(d), 0));
