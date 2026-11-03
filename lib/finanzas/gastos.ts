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

/** Lo que mueve el resultado del P&L: todas las partes menos insumos e inversiones (van al memo). */
export const enResultado = (partes: readonly { cuenta: string | null; monto: number }[]) =>
  centavos(partes.filter((p) => p.cuenta !== "insumos" && p.cuenta !== "inversiones").reduce((t, p) => t + p.monto, 0));

/** Faltantes de efectivo como gasto: −Σ diferencias (una diferencia negativa es faltante). */
export const faltantesDe = (diferencias: readonly number[]) => centavos(-diferencias.reduce((s, d) => s + Number(d), 0));

/**
 * Cobros con tarjeta o en línea que se registraron como efectivo: por día, lo que la conciliación de Dodo IS sacó del efectivo,
 * topado al faltante de los arqueos de cierre de ese día (todos sus turnos). Un día sin faltante no inventa un sobrante; la bóveda no entra.
 */
export function cobrosReclasificados(
  arqueos: readonly { fecha: string; diferencia: number }[],
  dias: readonly { fecha: string; importado: number; conciliado: number }[],
) {
  const faltante = new Map<string, number>();
  for (const a of arqueos) faltante.set(a.fecha, (faltante.get(a.fecha) ?? 0) - Number(a.diferencia));
  const sacado = new Map<string, number>();
  for (const d of dias) sacado.set(d.fecha, (sacado.get(d.fecha) ?? 0) + Number(d.importado) - Number(d.conciliado));
  const porDia = [...sacado]
    .map(([fecha, s]) => ({ fecha, monto: centavos(Math.min(Math.max(0, s), Math.max(0, faltante.get(fecha) ?? 0))) }))
    .filter((x) => x.monto > 0)
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  return { total: centavos(porDia.reduce((t, x) => t + x.monto, 0)), porDia };
}
