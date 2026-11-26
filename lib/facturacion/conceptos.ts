/** Productos del pedido de Dodo IS → conceptos de Facturapi. Precio con descuento e IVA 16 % incluido. */
import type { FacturaTimbrada } from "./facturapi";

// Claves SAT por confirmar con el contador (spec, Entregas de Sebastián).
export const CLAVE_PRODUCTO = "90101501";
export const CLAVE_UNIDAD = "E48";

export type ConceptoFacturapi = {
  quantity: number;
  product: { description: string; product_key: string; unit_key: string; price: number; tax_included: true; taxes: [{ type: "IVA"; rate: 0.16 }] };
};

const cent = (n: number) => Math.round(n * 100);

export function armarConceptos(productos: readonly { nombre: string; precio: number }[], total: number): { conceptos: ConceptoFacturapi[] } | { error: string } {
  if (productos.length === 0) return { error: "El ticket no tiene productos registrados." };
  if (productos.some((p) => Number(p.precio) < 0)) return { error: "El ticket tiene un renglón con precio negativo." };
  const suma = productos.reduce((s, p) => s + cent(Number(p.precio)), 0);
  if (suma !== cent(total)) return { error: `La suma de productos (${(suma / 100).toFixed(2)}) no cuadra con el total del ticket (${total.toFixed(2)}).` };
  const grupos = new Map<string, ConceptoFacturapi>();
  for (const p of productos) {
    const precio = cent(Number(p.precio)) / 100;
    if (precio === 0) continue;
    const llave = `${p.nombre}|${precio}`;
    const g = grupos.get(llave);
    if (g) g.quantity += 1;
    else grupos.set(llave, { quantity: 1, product: { description: p.nombre.trim(), product_key: CLAVE_PRODUCTO, unit_key: CLAVE_UNIDAD, price: precio, tax_included: true, taxes: [{ type: "IVA", rate: 0.16 }] } });
  }
  return { conceptos: [...grupos.values()] };
}

export function desglose(total: number) {
  const subtotal = Math.round((total / 1.16) * 100) / 100;
  return { subtotal, iva: Math.round((total - subtotal) * 100) / 100 };
}

/**
 * Parámetros de facturacion_confirmar. Facturapi no regresa `subtotal` en la factura: subtotal e IVA salen del total.
 * Un parámetro undefined desaparece del JSON y PostgREST ya no encuentra la función (falla del 25 nov 2026).
 */
export function paraConfirmar(id: string, f: FacturaTimbrada) {
  const total = Number(f.total);
  if (!(total > 0)) throw new Error(`Facturapi regresó la factura ${f.id} sin total.`);
  const d = desglose(total);
  return { p_id: id, p_facturapi_id: f.id, p_uuid: f.uuid, p_serie: f.series, p_folio: f.folio_number, p_subtotal: d.subtotal, p_iva: d.iva };
}
