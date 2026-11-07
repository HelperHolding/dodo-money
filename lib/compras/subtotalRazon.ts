export const SIN_RAZON = "Razón social por identificar";

export type SubtotalRazon = { rfc: string | null; empresa: string; total: number; cuenta: number };

/**
 * Agrupa importes por razón social receptora (RFC). Suma en centavos. Orden: mayor subtotal primero;
 * lo que no tiene razón social identificada, al final.
 */
export function subtotalesPorRazon(filas: readonly { monto: number; rfc?: string | null; empresa?: string | null }[]): SubtotalRazon[] {
  const grupos = new Map<string, { rfc: string | null; empresa: string; centavos: number; cuenta: number }>();
  for (const f of filas) {
    const rfc = (f.rfc ?? "").trim().toUpperCase() || null;
    const g = grupos.get(rfc ?? "") ?? { rfc, empresa: f.empresa?.trim() || SIN_RAZON, centavos: 0, cuenta: 0 };
    g.centavos += Math.round(Number(f.monto) * 100);
    g.cuenta += 1;
    grupos.set(rfc ?? "", g);
  }
  const identificada = (g: { rfc: string | null; empresa: string }) => !!g.rfc && g.empresa !== SIN_RAZON;
  return [...grupos.values()]
    .sort((a, b) => Number(identificada(b)) - Number(identificada(a)) || b.centavos - a.centavos || a.empresa.localeCompare(b.empresa, "es"))
    .map(({ rfc, empresa, centavos, cuenta }) => ({ rfc, empresa, total: centavos / 100, cuenta }));
}
