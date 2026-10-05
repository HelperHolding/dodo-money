/** Arma el P&L con los renglones del modelo de Dodo a partir de los montos del mes, y lo compara contra las metas. */
import type { CuentaGasto } from "./cuentas";

export type ClaveRenglon =
  | "venta_neta" | "alimento" | "merma" | "nomina_cocina" | "nomina_gerencia" | "repartidores" | "agregadores"
  | "marketing_agregadores" | "marketing" | "renta" | "servicios" | "mantenimiento" | "consumibles_equipo"
  | "regalias" | "otros" | "ebitda_tienda" | "oficina" | "ebitda" | "margen_bruto";

export const RENGLONES: readonly { clave: ClaveRenglon; nombre: string; tipo: "venta" | "gasto" | "total" }[] = [
  { clave: "venta_neta", nombre: "Venta neta", tipo: "venta" },
  { clave: "alimento", nombre: "Alimento y empaque", tipo: "gasto" },
  { clave: "merma", nombre: "Merma", tipo: "gasto" },
  { clave: "margen_bruto", nombre: "Margen bruto", tipo: "total" },
  { clave: "nomina_cocina", nombre: "Nómina cocina", tipo: "gasto" },
  { clave: "nomina_gerencia", nombre: "Nómina gerencia", tipo: "gasto" },
  { clave: "repartidores", nombre: "Repartidores", tipo: "gasto" },
  { clave: "agregadores", nombre: "Comisión de agregadores", tipo: "gasto" },
  { clave: "marketing_agregadores", nombre: "Marketing de agregadores", tipo: "gasto" },
  { clave: "marketing", nombre: "Marketing", tipo: "gasto" },
  { clave: "renta", nombre: "Renta", tipo: "gasto" },
  { clave: "servicios", nombre: "Servicios", tipo: "gasto" },
  { clave: "mantenimiento", nombre: "Mantenimiento", tipo: "gasto" },
  { clave: "consumibles_equipo", nombre: "Consumibles y equipo menor", tipo: "gasto" },
  { clave: "regalias", nombre: "Regalías", tipo: "gasto" },
  { clave: "otros", nombre: "Otros gastos de operación", tipo: "gasto" },
  { clave: "ebitda_tienda", nombre: "EBITDA de tienda", tipo: "total" },
  { clave: "oficina", nombre: "Oficina central", tipo: "gasto" },
  { clave: "ebitda", nombre: "EBITDA", tipo: "total" },
];

export type EntradaPL = {
  ventaNeta: number; descuentos: number; alimento: number; merma: number | null;
  nomina: { cocina: number; gerencia: number };
  /** Gastos sin IVA por cuenta: facturas (− notas de crédito), caja chica y gastos del mes. */
  gastos: Partial<Record<CuentaGasto, number>>;
  /** Facturas y caja chica sin cuenta asignada: van a "Otros". */
  sinCuenta: number;
  agregadores: number; comisionesCobro: number; faltantes: number; regalias: number;
  /** Oficina central: prorrateada en la sucursal; completa en el consolidado. */
  oficina: number;
  memos: { insumos: number; inversiones: number };
};

export const entradaVacia = (): EntradaPL => ({
  ventaNeta: 0, descuentos: 0, alimento: 0, merma: null, nomina: { cocina: 0, gerencia: 0 }, gastos: {}, sinCuenta: 0,
  agregadores: 0, comisionesCobro: 0, faltantes: 0, regalias: 0, oficina: 0, memos: { insumos: 0, inversiones: 0 },
});

const centavos = (n: number) => Math.round(n * 100) / 100;

export function sumarEntradas(entradas: readonly EntradaPL[]): EntradaPL {
  const s = entradaVacia();
  for (const e of entradas) {
    s.ventaNeta += e.ventaNeta; s.descuentos += e.descuentos; s.alimento += e.alimento;
    if (e.merma !== null) s.merma = (s.merma ?? 0) + e.merma;
    s.nomina.cocina += e.nomina.cocina; s.nomina.gerencia += e.nomina.gerencia;
    for (const [k, v] of Object.entries(e.gastos) as [CuentaGasto, number][]) s.gastos[k] = centavos((s.gastos[k] ?? 0) + v);
    s.sinCuenta += e.sinCuenta; s.agregadores += e.agregadores; s.comisionesCobro += e.comisionesCobro;
    s.faltantes += e.faltantes; s.regalias += e.regalias; s.oficina += e.oficina;
    s.memos.insumos += e.memos.insumos; s.memos.inversiones += e.memos.inversiones;
  }
  for (const k of ["ventaNeta", "descuentos", "alimento", "sinCuenta", "agregadores", "comisionesCobro", "faltantes", "regalias", "oficina"] as const) s[k] = centavos(s[k]);
  s.nomina = { cocina: centavos(s.nomina.cocina), gerencia: centavos(s.nomina.gerencia) };
  s.memos = { insumos: centavos(s.memos.insumos), inversiones: centavos(s.memos.inversiones) };
  if (s.merma !== null) s.merma = centavos(s.merma);
  return s;
}

export type Meta = { renglon: string; tipo: "pct" | "monto" | "pct_rappi" | "plantilla"; valor: number };
export type ContextoMeta = { ventaNeta: number; ventaRappi: number; plantilla: { cocina: number; gerencia: number } };

export function metaMonto(meta: Meta, ctx: ContextoMeta): number {
  const v = Number(meta.valor);
  if (meta.tipo === "pct") return centavos(ctx.ventaNeta * v);
  if (meta.tipo === "pct_rappi") return centavos(ctx.ventaRappi * v);
  if (meta.tipo === "plantilla") return meta.renglon === "nomina_gerencia" ? ctx.plantilla.gerencia : ctx.plantilla.cocina;
  return centavos(v);
}

export type FilaPL = {
  clave: ClaveRenglon; nombre: string; tipo: "venta" | "gasto" | "total";
  monto: number | null; pct: number | null; meta: number | null; metaPct: number | null; diferencia: number | null;
};

export function calcularPL(e: EntradaPL, metas: readonly Meta[], ctx: ContextoMeta): FilaPL[] {
  const g = (k: CuentaGasto) => e.gastos[k] ?? 0;
  const montos: Partial<Record<ClaveRenglon, number | null>> = {
    venta_neta: e.ventaNeta, alimento: e.alimento, merma: e.merma,
    nomina_cocina: e.nomina.cocina, nomina_gerencia: e.nomina.gerencia,
    repartidores: g("repartidores"), agregadores: e.agregadores, marketing_agregadores: g("marketing_agregadores"),
    marketing: g("marketing"), renta: g("renta"), servicios: g("servicios"), mantenimiento: g("mantenimiento"),
    consumibles_equipo: g("consumibles_equipo"), regalias: e.regalias,
    otros: centavos(g("otros") + e.sinCuenta + e.comisionesCobro + e.faltantes), oficina: e.oficina,
  };
  const gastosTienda = RENGLONES.filter((r) => r.tipo === "gasto" && r.clave !== "oficina");
  const sumaTienda = gastosTienda.reduce((s, r) => s + (montos[r.clave] ?? 0), 0);
  montos.ebitda_tienda = centavos(e.ventaNeta - sumaTienda);
  montos.ebitda = centavos(montos.ebitda_tienda - e.oficina);
  montos.margen_bruto = centavos(e.ventaNeta - e.alimento - (e.merma ?? 0));

  const metaDe = new Map(metas.map((m) => [m.renglon, metaMonto(m, ctx)]));
  const metasTienda = gastosTienda.map((r) => metaDe.get(r.clave));
  const hayMetas = metas.length > 0;
  const metaTienda = hayMetas ? centavos(ctx.ventaNeta - metasTienda.reduce<number>((s, m) => s + (m ?? 0), 0)) : null;
  metaDe.set("ebitda_tienda", metaTienda as number);
  if (metaTienda !== null) metaDe.set("ebitda", centavos(metaTienda - (metaDe.get("oficina") ?? 0)));
  if (hayMetas) metaDe.set("venta_neta", ctx.ventaNeta);
  if (hayMetas) metaDe.set("margen_bruto", centavos(ctx.ventaNeta - (metaDe.get("alimento") ?? 0) - (metaDe.get("merma") ?? 0)));

  const pct = (n: number | null | undefined) => (n === null || n === undefined || e.ventaNeta <= 0 ? null : Math.round((n / e.ventaNeta) * 10000) / 10000);
  return RENGLONES.map((r) => {
    const monto = montos[r.clave] ?? null;
    const meta = metaDe.has(r.clave) ? metaDe.get(r.clave) ?? null : null;
    return {
      clave: r.clave, nombre: r.nombre, tipo: r.tipo, monto, pct: pct(monto), meta,
      metaPct: meta === null || ctx.ventaNeta <= 0 ? null : Math.round((meta / ctx.ventaNeta) * 10000) / 10000,
      diferencia: meta === null || monto === null ? null : centavos(monto - meta),
    };
  });
}

/** Metas del consolidado: por renglón, la suma de la meta en pesos de cada sucursal (como monto fijo). */
export function sumarMetas(sucursales: readonly { metas: readonly Meta[]; ctx: ContextoMeta }[]): Meta[] {
  const suma = new Map<string, number>();
  for (const s of sucursales) for (const m of s.metas) suma.set(m.renglon, centavos((suma.get(m.renglon) ?? 0) + metaMonto(m, s.ctx)));
  return [...suma].map(([renglon, valor]) => ({ renglon, tipo: "monto" as const, valor }));
}

/** Primer mes con datos del P&L: el acumulado del año no va antes. */
export const INICIO_PL = "2026-10";
export const INICIO_FECHA = `${INICIO_PL}-01`;

/** Metas de un periodo: los % no cambian; el monto fijo mensual se reparte por la fracción de días. La plantilla ya viene prorrateada en el contexto. */
export const escalarMetas = (metas: readonly Meta[], fraccion: number): Meta[] =>
  metas.map((m) => (m.tipo === "monto" ? { ...m, valor: centavos(Number(m.valor) * fraccion) } : m));

export function finDeMes(mes: string): string {
  const d = new Date(`${mes}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

