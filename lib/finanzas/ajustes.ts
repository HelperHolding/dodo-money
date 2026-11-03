/** Ajustes del P&L con nota: una capa sobre el real. Aquí solo se calcula cuánto mueve cada ajuste; el real no cambia. */
import type { CuentaGasto } from "./cuentas";
import type { MesDelRango } from "./periodo";
import type { EntradaPL, FilaPL } from "./pl";

export const RENGLONES_AJUSTABLES = [
  "alimento", "merma", "nomina_cocina", "nomina_gerencia", "repartidores", "agregadores", "marketing_agregadores", "marketing",
  "renta", "servicios", "mantenimiento", "consumibles_equipo", "regalias", "otros", "oficina",
] as const;
export type RenglonAjustable = (typeof RENGLONES_AJUSTABLES)[number];
export type TipoAjuste = "tope_pct" | "monto";
/** Un ajuste sin anular de `pl_ajustes`; `mes` es el día 1 ("2026-10-01") y el tope es una fracción (5 % = 0.05). */
export type AjusteVigente = { id: string; sucursalId: string; mes: string; renglon: RenglonAjustable; tipo: TipoAjuste; valor: number; nota: string };
/** Lo que movió el ajuste en el periodo: `real` es el renglón antes del ajuste y `ajuste` = `ajustado` − `real`. */
export type AjusteAplicado = AjusteVigente & { nombre: string; real: number; ajuste: number; ajustado: number; regla: string; sinEfecto: boolean };
export type AjustePL = AjusteAplicado & { sucursal: string };
export type Deltas = Partial<Record<RenglonAjustable, number>>;

const centavos = (n: number) => Math.round(n * 100) / 100;
const mxn = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const pctTexto = (v: number) => `${(v * 100).toLocaleString("es-MX", { maximumFractionDigits: 2 })} %`;
/** Renglones que salen de `entrada.gastos`; los demás tienen su propio campo en la entrada. */
const DE_GASTOS: readonly RenglonAjustable[] = ["repartidores", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "otros"];

export const esAjustable = (clave: string): clave is RenglonAjustable => (RENGLONES_AJUSTABLES as readonly string[]).includes(clave);

/**
 * Deltas por renglón y la lista explicada de una sucursal en un periodo. Primero los montos, proporcionales a los días de su mes
 * que entran; luego el tope sobre lo que queda. En una semana que cruza meses vale el tope del mes con más días en ella (empate: el posterior).
 */
export function aplicarAjustes(filas: readonly FilaPL[], entrada: EntradaPL, ajustes: readonly AjusteVigente[], meses: readonly MesDelRango[]) {
  const fila = new Map(filas.map((f) => [f.clave as string, f]));
  const mesDe = new Map(meses.map((m) => [`${m.mes}-01`, m]));
  const delPeriodo = ajustes.filter((a) => mesDe.has(a.mes));
  const deltas: Deltas = {};
  const lista: AjusteAplicado[] = [];
  const actual = (r: RenglonAjustable) => centavos((fila.get(r)?.monto ?? 0) + (deltas[r] ?? 0));
  const anotar = (a: AjusteVigente, real: number, ajustado: number, regla: string) => {
    const ajuste = centavos(ajustado - real);
    if (ajuste) deltas[a.renglon] = centavos((deltas[a.renglon] ?? 0) + ajuste);
    lista.push({ ...a, nombre: fila.get(a.renglon)?.nombre ?? a.renglon, real, ajuste, ajustado: centavos(ajustado), regla, sinEfecto: ajuste === 0 });
  };

  for (const a of delPeriodo) if (a.tipo === "monto") {
    const m = mesDe.get(a.mes)!;
    const real = actual(a.renglon);
    anotar(a, real, real + a.valor * m.fraccion, `Monto ${mxn.format(a.valor)}${m.fraccion < 1 ? ` × ${m.dias}/${m.diasMes}` : ""}`);
  }
  const dias = (a: AjusteVigente) => mesDe.get(a.mes)!.dias;
  const tope = new Map<RenglonAjustable, AjusteVigente>();
  for (const a of delPeriodo) if (a.tipo === "tope_pct") {
    const otro = tope.get(a.renglon);
    if (!otro || dias(a) > dias(otro) || (dias(a) === dias(otro) && a.mes > otro.mes)) tope.set(a.renglon, a);
  }
  for (const a of delPeriodo) if (a.tipo === "tope_pct") {
    const real = actual(a.renglon);
    if (tope.get(a.renglon) !== a) anotar(a, real, real, `Tope ${pctTexto(a.valor)}: en este periodo vale el tope de ${tope.get(a.renglon)!.mes.slice(0, 7)}`);
    else if (entrada.ventaNeta <= 0) anotar(a, real, real, `Tope ${pctTexto(a.valor)} de la venta neta: sin venta neta en el periodo`);
    else {
      const limite = centavos(a.valor * entrada.ventaNeta);
      anotar(a, real, Math.min(real, limite), `Tope ${pctTexto(a.valor)} de la venta neta = ${mxn.format(limite)}`);
    }
  }
  const orden = (r: RenglonAjustable) => RENGLONES_AJUSTABLES.indexOf(r);
  lista.sort((x, y) => orden(x.renglon) - orden(y.renglon) || x.mes.localeCompare(y.mes));
  return { deltas, lista };
}

/** La entrada con los deltas sumados a los campos que alimentan cada renglón; `calcularPL` sobre ella da el P&L ajustado. */
export function conDeltas(e: EntradaPL, d: Deltas): EntradaPL {
  const mas = (n: number, r: RenglonAjustable) => (d[r] ? centavos(n + d[r]!) : n);
  const gastos = { ...e.gastos };
  for (const r of DE_GASTOS) if (d[r]) gastos[r as CuentaGasto] = centavos((gastos[r as CuentaGasto] ?? 0) + d[r]!);
  return {
    ...e, gastos,
    alimento: mas(e.alimento, "alimento"),
    merma: d.merma ? centavos((e.merma ?? 0) + d.merma) : e.merma,
    nomina: { cocina: mas(e.nomina.cocina, "nomina_cocina"), gerencia: mas(e.nomina.gerencia, "nomina_gerencia") },
    agregadores: mas(e.agregadores, "agregadores"), regalias: mas(e.regalias, "regalias"), oficina: mas(e.oficina, "oficina"),
  };
}

export function sumarDeltas(ds: readonly Deltas[]): Deltas {
  const t: Deltas = {};
  for (const d of ds) for (const [r, v] of Object.entries(d) as [RenglonAjustable, number][]) t[r] = centavos((t[r] ?? 0) + v);
  return t;
}

/** Un ajuste en una línea (pie del PDF). */
export const lineaAjuste = (a: AjustePL, conSucursal: boolean) =>
  `${conSucursal ? `${a.sucursal} · ` : ""}${a.nombre} · ${a.regla} · real ${mxn.format(a.real)} → ajustado ${mxn.format(a.ajustado)}` +
  `${a.sinEfecto ? " (sin efecto)" : ` (${mxn.format(a.ajuste)})`} · ${a.nota}`;

/** A dónde regresa el formulario de ajustes: solo al P&L de /finanzas. */
export function rutaVolver(valor: unknown): string {
  const v = typeof valor === "string" ? valor : "";
  return /^\/finanzas\?[^\\]*$/.test(v) && !v.includes("..") && !v.includes("//") ? v : "/finanzas";
}

/** La tabla pl_ajustes aún no existe: cubre la ventana entre el despliegue y la migración. */
export function faltaTabla(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const m = error.message ?? "";
  return /pl_ajustes/.test(m) && /does not exist|schema cache/i.test(m);
}
