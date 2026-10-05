/** Nómina del P&L: plantilla por sucursal (null = oficina central) con vigencia, más ajustes del mes. */
export type RenglonNomina = "cocina" | "gerencia";
export type Puesto = {
  sucursal_id: string | null; puesto: string; renglon: RenglonNomina;
  personas: number; sueldo: number; pct_cargas: number; bono: number; vigente_desde: string;
};
export type Ajuste = { sucursal_id: string | null; renglon: RenglonNomina; monto: number; concepto: string };

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Personas × (sueldo × (1 + cargas) + bono). */
const costoExacto = (p: Puesto) => Number(p.personas) * (Number(p.sueldo) * (1 + Number(p.pct_cargas)) + Number(p.bono));
export const costoPuesto = (p: Puesto) => centavos(costoExacto(p));

/** Por cada puesto, su versión vigente al cierre del mes (vigente_desde ≤ fin de mes, la más reciente). */
export function plantillaVigente(puestos: readonly Puesto[], sucursal: string | null, finDeMes: string): Puesto[] {
  const porPuesto = new Map<string, Puesto>();
  for (const p of puestos) {
    if (p.sucursal_id !== sucursal || p.vigente_desde > finDeMes) continue;
    const k = p.puesto.trim().toLowerCase();
    const previo = porPuesto.get(k);
    if (!previo || p.vigente_desde > previo.vigente_desde) porPuesto.set(k, p);
  }
  return [...porPuesto.values()].filter((p) => Number(p.personas) > 0);
}

export function nominaMes(puestos: readonly Puesto[], ajustes: readonly Ajuste[], sucursal: string | null, finDeMes: string) {
  const plantilla = { cocina: 0, gerencia: 0 };
  // Se suma sin redondear y se redondea el total, como la hoja de LC Inputs.
  for (const p of plantillaVigente(puestos, sucursal, finDeMes)) plantilla[p.renglon] += costoExacto(p);
  plantilla.cocina = centavos(plantilla.cocina);
  plantilla.gerencia = centavos(plantilla.gerencia);
  const ajuste = { cocina: 0, gerencia: 0 };
  for (const a of ajustes) if (a.sucursal_id === sucursal) ajuste[a.renglon] = centavos(ajuste[a.renglon] + Number(a.monto));
  return { plantilla, cocina: centavos(plantilla.cocina + ajuste.cocina), gerencia: centavos(plantilla.gerencia + ajuste.gerencia) };
}
