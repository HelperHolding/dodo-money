/**
 * Posibles duplicados en el P&L: dos o más documentos vigentes del mismo proveedor, en la misma sucursal y cuenta, que cubren
 * el periodo (p. ej. una prefactura de renta y su CFDI subido aparte, o el CFDI del mes siguiente con el periodo equivocado).
 * Compras de insumos e inversiones (memo), notas de crédito, canceladas y conceptos sin cuenta no cuentan.
 */
export type DocumentoCuenta = {
  id: string; documento: string; proveedorId: string | null; proveedor: string; estado: string; tipo: "ingreso" | "egreso";
  /** Cuenta efectiva de cada concepto (o de la factura). */
  cuentas: readonly (string | null)[];
};
export type GrupoDuplicado = { cuenta: string; proveedor: string; documentos: string[] };

const FUERA = new Set(["insumos", "inversiones"]);

/** Recibe los documentos de una sucursal que ya cubren el periodo. */
export function documentosDuplicados(docs: readonly DocumentoCuenta[]): GrupoDuplicado[] {
  const grupos = new Map<string, GrupoDuplicado & { ids: Set<string> }>();
  for (const d of docs) {
    if (d.estado === "cancelada" || d.tipo !== "ingreso") continue;
    for (const cuenta of new Set(d.cuentas)) {
      if (!cuenta || FUERA.has(cuenta)) continue;
      const clave = `${d.proveedorId ?? `nombre:${d.proveedor}`}|${cuenta}`;
      const g = grupos.get(clave) ?? { cuenta, proveedor: d.proveedor, documentos: [], ids: new Set<string>() };
      if (!g.ids.has(d.id)) { g.ids.add(d.id); g.documentos.push(d.documento); }
      grupos.set(clave, g);
    }
  }
  return [...grupos.values()].filter((g) => g.ids.size > 1).map(({ cuenta, proveedor, documentos }) => ({ cuenta, proveedor, documentos }));
}
