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

/**
 * Qué hacer con cada orden del listado en una vuelta: las que siguen en curso se saltan (entran en otra vuelta),
 * las que ya terminaron y están en caché con el mismo estado se reutilizan, y el resto se abre.
 * @param {object[]} items renglones del listado de historial
 * @param {string} fecha AAAA-MM-DD
 * @param {Record<string, {orden: object, productos: object[]}>} cache órdenes terminadas de vueltas anteriores
 */
export function planearVuelta(items, fecha, cache = {}) {
  const abrir = [], reusar = [], cambios = [];
  let enCurso = 0;
  for (const it of items) {
    if (fechaListado(it) !== fecha) continue;
    const estado = estadoDesdeApi(it), id = String(it.id), previo = cache[id]?.orden?.estado;
    if (!estado) { enCurso++; continue; }
    if (previo === estado && !cache[id].base) reusar.push(cache[id]);
    else { abrir.push(id); if (previo && previo !== estado) cambios.push({ rappi_id: id, fecha, de: previo, a: estado }); }
  }
  return { abrir, reusar, enCurso, cambios };
}

/**
 * Repaso de un día ya cerrado: solo se abre (y se reenvía) una orden si su estado en el listado cambió respecto al
 * último registrado, p. ej. Finalizado → Cancelado. Las que no estaban registradas solo quedan como referencia
 * (`base`), sin reimportarse: así no se mueven cortes pasados.
 * @returns {{abrir: string[], cambios: object[], base: Record<string, {base: true, orden: {estado: string}}>}}
 */
export function planearRepaso(items, fecha, cache = {}) {
  const abrir = [], cambios = [], base = {};
  for (const it of items) {
    if (fechaListado(it) !== fecha) continue;
    const estado = estadoDesdeApi(it), id = String(it.id), previo = cache[id]?.orden?.estado;
    if (!estado) continue;
    if (!previo) base[id] = { base: true, orden: { estado } };
    else if (previo !== estado) { abrir.push(id); cambios.push({ rappi_id: id, fecha, de: previo, a: estado }); }
  }
  return { abrir, cambios, base };
}

/**
 * Devuelve la misma promesa, pero si nadie llega a esperarla su rechazo no tumba el proceso. Para las esperas que se
 * arman antes de navegar (waitForResponse): si la navegación falla, se sale sin await y el timeout de 60 s quedaba suelto
 * (3/11/2026 23:00: TimeoutError sin atrapar en abrirOrden, Node se cerró y n8n perdió la vuelta).
 */
export const sinRechazoSuelto = (promesa) => { promesa.catch(() => {}); return promesa; };

/**
 * Tiendas que el extractor puede leer: la principal primero y luego las de RAPPI_TIENDAS (p. ej. la de Rappi Turbo, que
 * en el portal es otra tienda con su propio ID). Ignora vacíos, repetidos y lo que no tenga forma MX + dígitos.
 */
export function tiendasPermitidas(lista, principal) {
  const todas = [principal, ...String(lista ?? "").split(",")].map((t) => String(t ?? "").trim()).filter((t) => /^MX\d+$/.test(t));
  return [...new Set(todas)];
}

/** Tienda pedida por n8n; sin tienda se usa la principal. Una tienda fuera de la lista se rechaza. */
export function elegirTienda(pedida, permitidas) {
  if (pedida === undefined || pedida === null || pedida === "") return permitidas[0];
  const t = String(pedida).trim();
  if (!permitidas.includes(t)) throw Error(`Tienda ${t.slice(0, 30)} no está en RAPPI_TIENDAS.`);
  return t;
}

/** Caché por tienda y día. La principal conserva el nombre de antes (cache-AAAA-MM-DD.json) para no perder la caché viva. */
export const nombreCache = (tienda, fecha, principal) => (tienda === principal ? `cache-${fecha}.json` : `cache-${tienda}-${fecha}.json`);

/** Fecha de un archivo de caché de cualquier tienda, o null si no es caché. */
export const fechaDeCache = (archivo) => /^cache-(?:MX\d+-)?(\d{4}-\d{2}-\d{2})\.json$/.exec(archivo)?.[1] ?? null;

/**
 * Turnos del extractor: una corrida a la vez (dos navegadores sobre la misma sesión se pisarían el storageState).
 * Si llega otra tienda mientras corre una, espera su turno: n8n pide La Calma y Turbo a la vez porque el "batching" del
 * nodo HTTP solo espacia el inicio de las peticiones, no espera a que termine la anterior. Si llega la misma tienda que ya
 * está corriendo o esperando (vueltas de 15 min empalmadas), se salta con ocupado: la siguiente la cubre.
 * @returns {(tienda: string, correr: () => Promise<any>) => Promise<{ocupado: true} | {ocupado: false, resultado: any}>}
 */
export function crearTurnos() {
  let cadena = Promise.resolve();
  const pendientes = new Set();
  return async (tienda, correr) => {
    if (pendientes.has(tienda)) return { ocupado: true };
    pendientes.add(tienda);
    const turno = cadena.then(correr);
    cadena = turno.catch(() => {});
    try { return { ocupado: false, resultado: await turno }; }
    finally { pendientes.delete(tienda); }
  };
}

/** Espera a que condicion() sea verdadera, revisando cada paso ms, hasta ms milisegundos. Devuelve si se cumplió. */
export async function esperarHasta(condicion, ms, paso = 200) {
  const fin = Date.now() + ms;
  for (;;) {
    if (condicion()) return true;
    if (Date.now() >= fin) return false;
    await new Promise((r) => setTimeout(r, paso));
  }
}
