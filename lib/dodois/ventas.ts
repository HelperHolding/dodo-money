/**
 * Ventas de la API de Dodo IS → las mismas filas que llena "Datos brutos" (tablas `pedidos` y `pedido_productos`).
 * Puro, sin red. Los ids van en mayúsculas y la hora en minutos, como el Excel, para que un día no se duplique.
 */
import type { Origen, Pago, TipoPedido } from "../ventas/datosBrutos";

export type ProductoApi = {
  productId: string; defaultProductName: string; price: number; priceWithDiscount: number;
  combo: { id: string; name: string } | null; discount: { bonusActionName: string | null } | null;
};
export type VentaApi = {
  orderId: string; soldAtLocal: string; unitId: string; shiftId: string | null; paymentMethod: string | null;
  salesChannel: string | null; orderSource: string | null; aggregatorName: string | null; products: ProductoApi[];
  cashBoxType?: string | null;
};
/**
 * Producción → Tiempo de entrega del pedido (`/production/orders-handover-time`, scope productionefficiency): por pedido,
 * cuándo entró al tracking (hora local) y cuántos segundos esperó, se horneó y estuvo en la repisa caliente. Dodo IS deja
 * fuera los pedidos sin productos horneados (bebidas, dips, postres): esos quedan sin tiempos.
 * https://docs.dodois.io/docs/dodo-is/c48a37d12f9e9-proizvodstvo-vremya-vydachi-zakaza
 */
export type TiempoApi = {
  orderId: string; orderTrackingStartAtLocal: string; trackingPendingTime: number; cookingTime: number; heatedShelfTime: number;
};
export type TiemposPedido = { inicio_coccion: string | null; listo: string | null; entregado: string | null };
export type PedidoCarga = {
  dodo_id: string; sucursal_id: string; fecha: string; hora: string; pago: Pago; tipo: TipoPedido; origen: Origen;
  origen_dodo: string | null; para_llevar: boolean; estado: "entregado"; total: number; total_sin_descuento: number; iva: number;
  productos: number; promocion: string | null; turno_dodo: string | null; agregador: string | null;
} & TiemposPedido;
export type ProductoCarga = {
  pedido_id: string; renglon: number; dodo_uuid: string; nombre: string; tamano: string | null;
  precio: number; precio_sin_descuento: number; combo: string | null;
};
export type OrigenSincronizacion = "cron" | "noche" | "manual";

const PAGO: Record<string, Pago> = { cash: "efectivo", card: "tarjeta", bankcard: "tarjeta", online: "en_linea", internetacquiring: "en_linea" };
const ORIGEN: Record<string, Origen> = { "dine-in": "mostrador", restaurant: "mostrador", kiosk: "kiosco", mobile: "app", mobileapp: "app", site: "sitio", website: "sitio" };
const EN_TIENDA = new Set(["dine-in", "takeaway", "pickup"]);
const PARA_LLEVAR = new Set(["takeaway", "pickup"]);
const centavos = (n: number) => Math.round(n * 100) / 100;
const clave = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
const SIN_TIEMPOS: TiemposPedido = { inicio_coccion: null, listo: null, entregado: null };

/** Hora local de Dodo IS (sin zona) + segundos → instante con la zona de la sucursal (UTC−6, como el Excel). */
function momentoMas(local: string, segundos: number): string | null {
  const base = Date.parse(`${local.slice(0, 19)}Z`);
  if (!Number.isFinite(base) || !Number.isFinite(segundos)) return null;
  return `${new Date(base + Math.round(segundos) * 1000).toISOString().slice(0, 19)}-06:00`;
}

/**
 * Tiempos por pedido con las columnas del Excel: inicio de cocción = entrada al tracking + espera; listo = inicio +
 * cocción; entregado = listo + repisa caliente (al cliente o al repartidor). La llave es el id en mayúsculas.
 */
export function tiemposDePedidos(tiempos: readonly TiempoApi[]): Map<string, TiemposPedido> {
  const mapa = new Map<string, TiemposPedido>();
  for (const t of tiempos) {
    if (!t.orderId || !t.orderTrackingStartAtLocal) continue;
    const espera = Number(t.trackingPendingTime ?? 0), coccion = Number(t.cookingTime ?? 0), repisa = Number(t.heatedShelfTime ?? 0);
    mapa.set(t.orderId.toUpperCase(), {
      inicio_coccion: momentoMas(t.orderTrackingStartAtLocal, espera),
      listo: momentoMas(t.orderTrackingStartAtLocal, espera + coccion),
      entregado: momentoMas(t.orderTrackingStartAtLocal, espera + coccion + repisa),
    });
  }
  return mapa;
}

/**
 * Pedido capturado desde call center: caja «Delivery» o con origen/agregador de agregador. Hoy son los pedidos de Rappi
 * que operación captura a mano en Dodo IS; no se sincronizan porque Rappi ya llega del portal y no cuadraban (lo capturado
 * es lo que paga el cliente, con combos por piezas y cupones). Rappi vuelve a salir del portal hasta definir cómo cuadrar.
 */
export const esCallCenter = (v: Pick<VentaApi, "cashBoxType" | "orderSource" | "aggregatorName">) =>
  clave(v.cashBoxType) === "delivery" || clave(v.orderSource) === "aggregator" || !!clave(v.aggregatorName);

export function traducirVentas(ventas: readonly VentaApi[], o: {
  sucursalDeUnidad: ReadonlyMap<string, string>; tamanoDe: (nombre: string) => string | null; ivaDe: (precios: readonly number[]) => number;
  tiempos?: ReadonlyMap<string, TiemposPedido>;
}) {
  const pedidos: PedidoCarga[] = [], productos: ProductoCarga[] = [];
  const desconocidos = new Set<string>();
  let sinSucursal = 0;
  const callCenter = { pedidos: 0, total: 0 };
  for (const v of ventas) {
    const sucursal = o.sucursalDeUnidad.get(v.unitId);
    if (!sucursal) { sinSucursal++; continue; }
    if (esCallCenter(v)) { callCenter.pedidos++; callCenter.total = centavos(callCenter.total + v.products.reduce((s, x) => s + Number(x.priceWithDiscount), 0)); continue; }
    const id = v.orderId.toUpperCase();
    const pago = PAGO[clave(v.paymentMethod)] ?? "otro";
    if (pago === "otro" && v.paymentMethod) desconocidos.add(`pago: ${v.paymentMethod}`);
    const canal = clave(v.salesChannel);
    if (canal !== "delivery" && !EN_TIENDA.has(canal) && v.salesChannel) desconocidos.add(`canal: ${v.salesChannel}`);
    const origen = ORIGEN[clave(v.orderSource)] ?? "otro";
    if (origen === "otro" && v.orderSource) desconocidos.add(`origen: ${v.orderSource}`);
    const precios = v.products.map((x) => Number(x.priceWithDiscount));
    pedidos.push({
      dodo_id: id, sucursal_id: sucursal, fecha: v.soldAtLocal.slice(0, 10), hora: v.soldAtLocal.slice(11, 16), pago,
      tipo: canal === "delivery" ? "entrega" : "en_tienda", origen, origen_dodo: v.orderSource, para_llevar: PARA_LLEVAR.has(canal),
      estado: "entregado", total: centavos(precios.reduce((s, x) => s + x, 0)),
      total_sin_descuento: centavos(v.products.reduce((s, x) => s + Number(x.price), 0)), iva: o.ivaDe(precios),
      productos: v.products.length, promocion: v.products.find((x) => x.discount?.bonusActionName)?.discount?.bonusActionName ?? null,
      turno_dodo: v.shiftId, agregador: v.aggregatorName || null, ...(o.tiempos?.get(id) ?? SIN_TIEMPOS),
    });
    v.products.forEach((x, i) => productos.push({
      pedido_id: id, renglon: i + 1, dodo_uuid: x.productId.toUpperCase(), nombre: x.defaultProductName, tamano: o.tamanoDe(x.defaultProductName),
      precio: Number(x.priceWithDiscount), precio_sin_descuento: Number(x.price), combo: x.combo?.name ?? null,
    }));
  }
  return { pedidos, productos, desconocidos: [...desconocidos].sort(), sinSucursal, callCenter };
}

const siguienteDia = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Un día completo en hora local de la sucursal (como la API espera `from`/`to`). */
export const ventanaDelDia = (fecha: string) => ({ from: `${fecha}T00:00:00`, to: `${siguienteDia(fecha)}T00:00:00` });

/** Día a sincronizar en CDMX (UTC−6, sin horario de verano): la pasada de la noche es el día anterior. */
export function fechaASincronizar(origen: OrigenSincronizacion, ahoraIso: string): string {
  const hoy = new Date(Date.parse(ahoraIso) - 6 * 3_600_000).toISOString().slice(0, 10);
  return origen === "noche" ? new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : hoy;
}
