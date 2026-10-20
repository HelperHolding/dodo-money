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
};
export type PedidoCarga = {
  dodo_id: string; sucursal_id: string; fecha: string; hora: string; pago: Pago; tipo: TipoPedido; origen: Origen;
  origen_dodo: string | null; para_llevar: boolean; estado: "entregado"; total: number; total_sin_descuento: number; iva: number;
  productos: number; promocion: string | null; turno_dodo: string | null; agregador: string | null;
};
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
const clave = (v: string | null) => (v ?? "").trim().toLowerCase();

export function traducirVentas(ventas: readonly VentaApi[], o: {
  sucursalDeUnidad: ReadonlyMap<string, string>; tamanoDe: (nombre: string) => string | null; ivaDe: (precios: readonly number[]) => number;
}) {
  const pedidos: PedidoCarga[] = [], productos: ProductoCarga[] = [];
  const desconocidos = new Set<string>();
  let sinSucursal = 0;
  for (const v of ventas) {
    const sucursal = o.sucursalDeUnidad.get(v.unitId);
    if (!sucursal) { sinSucursal++; continue; }
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
      turno_dodo: v.shiftId, agregador: v.aggregatorName || null,
    });
    v.products.forEach((x, i) => productos.push({
      pedido_id: id, renglon: i + 1, dodo_uuid: x.productId.toUpperCase(), nombre: x.defaultProductName, tamano: o.tamanoDe(x.defaultProductName),
      precio: Number(x.priceWithDiscount), precio_sin_descuento: Number(x.price), combo: x.combo?.name ?? null,
    }));
  }
  return { pedidos, productos, desconocidos: [...desconocidos].sort(), sinSucursal };
}

const siguienteDia = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Un día completo en hora local de la sucursal (como la API espera `from`/`to`). */
export const ventanaDelDia = (fecha: string) => ({ from: `${fecha}T00:00:00`, to: `${siguienteDia(fecha)}T00:00:00` });

/** Día a sincronizar en CDMX (UTC−6, sin horario de verano): la pasada de la noche es el día anterior. */
export function fechaASincronizar(origen: OrigenSincronizacion, ahoraIso: string): string {
  const hoy = new Date(Date.parse(ahoraIso) - 6 * 3_600_000).toISOString().slice(0, 10);
  return origen === "noche" ? new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : hoy;
}
