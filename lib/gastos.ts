/** De dónde salió el dinero de un gasto. */
export const ORIGENES = ["caja_chica", "boveda", "empleado"] as const;
export type OrigenGasto = (typeof ORIGENES)[number];

export const NOMBRE_ORIGEN: Record<OrigenGasto, string> = {
  caja_chica: "Caja chica",
  boveda: "Bóveda",
  empleado: "Lo pagó un empleado",
};

export function leerOrigen(valor: FormDataEntryValue | null): OrigenGasto | null {
  const texto = String(valor ?? "");
  return (ORIGENES as readonly string[]).includes(texto) ? (texto as OrigenGasto) : null;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Total de gastos por origen: solo los de caja chica entran a la reposición desde corporativo. */
export function sumaPorOrigen(gastos: readonly { origen: OrigenGasto; monto: number | string }[]): Record<OrigenGasto, number> {
  const suma = { caja_chica: 0, boveda: 0, empleado: 0 };
  for (const g of gastos) suma[g.origen] += Number(g.monto);
  return { caja_chica: centavos(suma.caja_chica), boveda: centavos(suma.boveda), empleado: centavos(suma.empleado) };
}

type GastoEmpleado = { id: string; origen: OrigenGasto; pagado_por: string | null; repuesto_en: string | null; monto: number | string };

/** Lo que falta regresarle a cada empleado, agrupado por persona (id de perfil), el mayor primero. */
export function porReponerAEmpleados<G extends GastoEmpleado>(gastos: readonly G[]) {
  const porPersona = new Map<string, G[]>();
  for (const g of gastos) {
    if (g.origen !== "empleado" || !g.pagado_por || g.repuesto_en) continue;
    porPersona.set(g.pagado_por, [...(porPersona.get(g.pagado_por) ?? []), g]);
  }
  return [...porPersona.entries()]
    .map(([persona, lista]) => ({ persona, gastos: lista, total: centavos(lista.reduce((s, g) => s + Number(g.monto), 0)) }))
    .sort((a, b) => b.total - a.total);
}
