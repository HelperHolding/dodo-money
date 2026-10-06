import type { CuentaGasto } from "./cuentas";

const GASTO = ["repartidores", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "otros"];
const centavos = (n: number) => Math.round(n * 100) / 100;

type FacturaGasto = {
  tipo: "ingreso" | "egreso"; estado: string; subtotal: number; descuento: number; cuenta_pl: string | null; fecha_emision?: string;
  conceptos?: readonly { descripcion?: string; importe: number; cuenta_pl: string | null }[];
};

/**
 * Partes de una factura en el P&L, sin IVA y con signo (las notas de crédito restan): una por concepto, con su cuenta o la
 * de la factura, repartiendo subtotal − descuento en proporción al importe; sin conceptos, la factura completa. Canceladas: nada.
 */
export function partesFactura(f: FacturaGasto, fraccion = 1): { cuenta: string | null; monto: number; concepto: string | null }[] {
  if (f.estado === "cancelada") return [];
  const base = (Number(f.subtotal) - Number(f.descuento)) * (f.tipo === "egreso" ? -1 : 1) * fraccion;
  const conceptos = (f.conceptos ?? []).filter((c) => Number(c.importe) > 0);
  const suma = conceptos.reduce((t, c) => t + Number(c.importe), 0);
  if (!conceptos.length || suma <= 0) return [{ cuenta: f.cuenta_pl, monto: base, concepto: null }];
  return conceptos.map((c) => ({ cuenta: c.cuenta_pl ?? f.cuenta_pl, monto: (base * Number(c.importe)) / suma, concepto: c.descripcion ?? null }));
}

/** Facturas → gasto por cuenta (por concepto cuando los trae). Con `fraccionDe`, cada una por la parte que le toca al periodo. */
export function facturasAGastos<F extends FacturaGasto>(facturas: readonly F[], fraccionDe?: (f: F) => number) {
  const gastos: Partial<Record<CuentaGasto, number>> = {};
  let sinCuenta = 0;
  const memos = { insumos: 0, inversiones: 0 };
  for (const f of facturas) {
    for (const p of partesFactura(f, fraccionDe ? fraccionDe(f) : 1)) {
      if (p.cuenta === "insumos" || p.cuenta === "inversiones") memos[p.cuenta] = centavos(memos[p.cuenta] + p.monto);
      else if (p.cuenta && GASTO.includes(p.cuenta)) gastos[p.cuenta as CuentaGasto] = centavos((gastos[p.cuenta as CuentaGasto] ?? 0) + p.monto);
      else sinCuenta = centavos(sinCuenta + p.monto);
    }
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
