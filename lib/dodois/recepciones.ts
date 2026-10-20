/**
 * Recepciones de insumos de la API de Dodo IS → filas de `recepciones_dodo` (una por entrega e insumo). Puro, sin red.
 * Ids en mayúsculas (como el Excel); si un insumo viene dos veces en una entrega, se suma.
 */
export type RecepcionApi = {
  unitId: string; stockItemId: string; stockItemName: string; quantity: number; measurementUnit: string;
  totalPriceWithoutVat: number; totalPriceWithVat: number; vatRate: number | null; incomingStockOrderId: string;
  supplierId: string | null; suppliedAtLocal: string; invoiceNumber: string | null; invoiceDate: string | null;
  incomingStockOrderModifiedAt: string | null;
};
export type RecepcionCarga = {
  dodo_documento_id: string; dodo_insumo_id: string; material: string; unidad: string; fecha: string; recibido_en: string;
  cantidad: number; precio: number; importe_sin_iva: number; importe_con_iva: number; tasa_iva: number | null;
  dodo_proveedor_id: string | null; factura_texto: string | null; factura_fecha: string | null; modificado_dodo: string | null;
};

const UNIDAD: Record<string, string> = { kilogram: "kg", gram: "g", quantity: "pza", liter: "l", meter: "m" };
const centavos = (n: number) => Math.round(n * 100) / 100;

export function traducirRecepciones(items: readonly RecepcionApi[], unitId: string): RecepcionCarga[] {
  const porClave = new Map<string, RecepcionCarga>();
  for (const x of items) {
    if (x.unitId !== unitId || !(Number(x.quantity) > 0)) continue;
    const doc = x.incomingStockOrderId.toUpperCase(), insumo = x.stockItemId.toUpperCase();
    const previo = porClave.get(`${doc}|${insumo}`);
    const cantidad = Math.round(((previo?.cantidad ?? 0) + Number(x.quantity)) * 1000) / 1000;
    const sin = centavos((previo?.importe_sin_iva ?? 0) + Number(x.totalPriceWithoutVat ?? 0));
    const con = centavos((previo?.importe_con_iva ?? 0) + Number(x.totalPriceWithVat ?? 0));
    porClave.set(`${doc}|${insumo}`, {
      dodo_documento_id: doc, dodo_insumo_id: insumo, material: x.stockItemName,
      unidad: UNIDAD[(x.measurementUnit ?? "").toLowerCase()] ?? x.measurementUnit, fecha: x.suppliedAtLocal.slice(0, 10),
      recibido_en: x.suppliedAtLocal.slice(0, 19), cantidad, precio: Math.round((sin / cantidad) * 10_000) / 10_000,
      importe_sin_iva: sin, importe_con_iva: con, tasa_iva: x.vatRate ?? null,
      dodo_proveedor_id: x.supplierId ? x.supplierId.toUpperCase() : null, factura_texto: x.invoiceNumber?.trim() || null,
      factura_fecha: x.invoiceDate?.slice(0, 10) || null, modificado_dodo: x.incomingStockOrderModifiedAt?.slice(0, 19) || null,
    });
  }
  return [...porClave.values()];
}

/** Para comparar con el folio de la factura: mayúsculas, solo letras y números, sin ceros a la izquierda. */
export const folioNormalizado = (t: string | null | undefined) =>
  (t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+(?=.)/, "") || null;

export const DIAS_RECEPCIONES = { cron: 7, noche: 31, manual: 31 } as const;

const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Últimos `dias` días terminando hoy (CDMX), con el `from`/`to` que espera la API. */
export function ventanaRecepciones(dias: number, hoy: string) {
  const desde = sumarDias(hoy, -(dias - 1));
  return { desde, hasta: hoy, from: `${desde}T00:00:00`, to: `${sumarDias(hoy, 1)}T00:00:00` };
}
