// Convierte el JSON de la API del Portal Aliados (orders/partner/status/v2) al formato de /api/rappi/importar.
// Lo usa el flujo de n8n (scripts/n8n/flujo-rappi.mjs copia estas funciones a su nodo Code), sin navegador.
// No conserva datos de cliente ni repartidor.

export const API_RAPPI = "https://services.mxgrability.rappi.com/api/rs-platform-gateway";
// Mismos conjuntos que usa el portal para decidir la etiqueta "Finalizado" / "Cancelado".
const FINALIZADOS = ["close_order", "finished_order", "finished", "pending_review", "on_the_route", "arrive"];

const centavos = (n) => Math.round(n * 100) / 100;

/** Estado de la app, o null si la orden sigue en curso y no se importa. */
export function estadoDesdeApi(detalle) {
  const s = String(detalle?.state ?? "");
  if (/^cancel+ed/.test(s)) return "Cancelado";
  if (!FINALIZADOS.includes(s)) return null;
  return detalle.has_claims === true || detalle.has_open_dispute === true || (Array.isArray(detalle.claims) && detalle.claims.length > 0) ? "Con reclamo" : "Finalizado";
}

/** Montos con centavos de order_totals: subtotal, discounts_partner_store, subtotal_rest, discounts_rappi y suggested_total. */
export function montosApi(detalle) {
  const t = detalle?.order_totals;
  if (!t || !Array.isArray(t.details) || typeof t.total?.value !== "number") return null;
  const v = (id) => { const d = t.details.find((x) => x?.id === id); return typeof d?.value === "number" ? centavos(Math.abs(d.value)) : null; };
  const bruto = v("subtotal");
  if (bruto === null) return null;
  const descuento_restaurante = v("discounts_partner_store") ?? 0, descuento_rappi = v("discounts_rappi") ?? 0;
  return { bruto, descuento_restaurante, subtotal_restaurante: v("subtotal_rest") ?? centavos(bruto - descuento_restaurante), descuento_rappi, facturar: centavos(t.total.value) };
}

/**
 * @param {object} detalle respuesta de GET /orders/partner/status/v2/store/{tienda}/orders/{id}
 * @param {string} tienda ID de tienda de la app, p. ej. MX1930486109
 * @returns {{orden: object, productos: object[]} | null} null si la orden sigue en curso.
 */
export function ordenDesdeApi(detalle, tienda) {
  const id = String(detalle?.id ?? "");
  if (!/^\d{5,20}$/.test(id)) throw Error("Detalle sin ID de orden.");
  const estado = estadoDesdeApi(detalle);
  if (!estado) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(detalle.created_at ?? ""));
  if (!m) throw Error(`Orden ${id}: fecha ilegible "${detalle.created_at}".`);
  const pago = String(detalle.payment_method ?? "").trim();
  if (!pago) throw Error(`Orden ${id}: sin método de pago.`);
  const montos = montosApi(detalle);
  if (!montos) throw Error(`Orden ${id}: sin totales de Rappi.`);

  // Opciones en el orden en que Rappi las registró, con " · " como en las importaciones previas (la clave del producto depende de este texto).
  const productos = (detalle.products ?? []).map((p, i) => ({
    rappi_id: id,
    linea: i + 1,
    nombre: String(p.name ?? "").trim(),
    opciones: [...(p.toppings ?? [])].sort((a, b) => (a.order_product_topping_id ?? 0) - (b.order_product_topping_id ?? 0))
      .map((t) => `${Number(t.units) > 1 ? `${t.units}x ` : ""}${String(t.description ?? "").trim()}`).filter(Boolean).join(" · "),
    cantidad: Number(p.units),
    importe: centavos(Number(p.total_price)),
  }));
  if (!productos.length || productos.some((p) => !p.nombre || !Number.isInteger(p.cantidad) || p.cantidad < 1 || !Number.isFinite(p.importe))) throw Error(`Orden ${id}: productos incompletos.`);
  const suma = centavos(productos.reduce((s, p) => s + p.importe, 0));
  if (suma !== montos.bruto) throw Error(`Orden ${id}: los renglones suman ${suma} y Rappi reporta ${montos.bruto}.`);
  if (centavos(montos.bruto - montos.descuento_restaurante) !== montos.subtotal_restaurante || centavos(montos.subtotal_restaurante - montos.descuento_rappi) !== montos.facturar)
    throw Error(`Orden ${id}: los montos de Rappi no cuadran.`);
  return { orden: { rappi_id: id, tienda_id: tienda, fecha: m[1], hora: m[2], estado, pago, ...montos }, productos };
}

/** Fecha local (AAAA-MM-DD) de un renglón del listado de historial. */
export const fechaListado = (item) => String(item?.created_at ?? "").slice(0, 10);
