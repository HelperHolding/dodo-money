import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaASincronizar, traducirVentas, ventanaDelDia, type VentaApi } from "./ventas.ts";
import { ivaDe, resumirDias } from "../ventas/pedidos.ts";
import { tamanoPorNombre } from "../ventas/calculos.ts";

const UNIDAD = "11f187558e757f53b0570d952420b810", SUC = "suc-zapopan";
const p = (productId: string, defaultProductName: string, price: number, priceWithDiscount: number, extra: Partial<VentaApi["products"][number]> = {}) =>
  ({ productId, defaultProductName, price, priceWithDiscount, combo: null, discount: null, ...extra });
const venta = (orderId: string, soldAtLocal: string, paymentMethod: string, orderSource: string, products: VentaApi["products"], extra: Partial<VentaApi> = {}): VentaApi =>
  ({ orderId, soldAtLocal, unitId: UNIDAD, shiftId: "01a0d957b81078f5895147b76563a6dc", paymentMethod, salesChannel: "Dine-in", orderSource, aggregatorName: null, products, ...extra });
const DESCUENTO = { bonusActionName: "Pepperoni pizza for 119. NO promocode" };
const SOLO_DODO = { id: "11f1b32599175d0739fe6c5bef9187d0", name: "Solo Dodo" };

// Cuatro pedidos reales del 25/09 (API de Dodo IS).
const VENTAS: VentaApi[] = [
  venta("11f1b915aa984b4a87d45d5cae686d08", "2026-09-25T13:20:35", "Cash", "Dine-in", [
    p("11f19a78b9ad03c44e6b462afd065640", "Tres Carnes Mediano", 199, 199), p("11f19997a22f8b4d9c579af6b112b260", "Pepperoni Mediano", 129, 129)]),
  venta("11f1b91a0635641c9d59afb87d99391d", "2026-09-25T13:49:50", "Cash", "Dine-in", [
    p("11f19e46b86befb6c37b0de4a64539d0", "Papas Gajo  Medium", 49, 49), p("11f19aebbcaec131cd618e798a5bf370", "Coca Cola 2 L", 59, 59),
    p("11f19aebbcaec131cd618e798a5bf370", "Coca Cola 2 L", 59, 59), p("11f19997a22f8b4d9c579af6bf6b55b0", "Pepperoni Grande", 159, 119, { discount: DESCUENTO })]),
  venta("11f1b94bd1e8c8029810ebc4f8bccb5e", "2026-09-25T19:45:52", "Card", "Kiosk", [p("11f19a3ab84c9347b0fe6a292fd47730", "Dodo Supreme Pequeño", 155, 155)]),
  venta("11f1b9437f3b87058a1ab5066ca999ec", "2026-09-25T18:49:41", "Card", "Dine-in", [
    p("11f19a219be8517d93da27012e304670", "Quatro quesos Mediano", 169, 107.9, { combo: SOLO_DODO }),
    p("11f19aebbcaec131cd618e798751c0b0", "Coca Cola 0,6 L", 33, 21.1, { combo: SOLO_DODO }),
    p("11f19997a22f8b4d9c579af6c277f970", "Pepperoni T Grande", 159, 119, { discount: DESCUENTO })]),
];
const opciones = { sucursalDeUnidad: new Map([[UNIDAD, SUC]]), tamanoDe: tamanoPorNombre, ivaDe };

test("traducirVentas: ids en mayúsculas, hora en minutos, pago y origen, totales e IVA por pieza", () => {
  const t = traducirVentas(VENTAS, opciones);
  assert.equal(t.pedidos.length, 4);
  assert.deepEqual(t.desconocidos, []);
  const a = t.pedidos[0];
  assert.deepEqual(
    { id: a.dodo_id, suc: a.sucursal_id, fecha: a.fecha, hora: a.hora, pago: a.pago, tipo: a.tipo, origen: a.origen, total: a.total, sin: a.total_sin_descuento, iva: a.iva, piezas: a.productos },
    { id: "11F1B915AA984B4A87D45D5CAE686D08", suc: SUC, fecha: "2026-09-25", hora: "13:20", pago: "efectivo", tipo: "en_tienda", origen: "mostrador", total: 328, sin: 328, iva: 45.24, piezas: 2 });
  const b = t.pedidos[1];
  assert.deepEqual([b.total, b.total_sin_descuento, b.iva, b.promocion], [286, 326, 39.45, "Pepperoni pizza for 119. NO promocode"]);
  assert.deepEqual([t.pedidos[2].pago, t.pedidos[2].origen, t.pedidos[2].origen_dodo], ["tarjeta", "kiosco", "Kiosk"]);
  assert.equal(t.productos.length, 10);
  assert.deepEqual(t.productos.filter((x) => x.pedido_id === "11F1B9437F3B87058A1AB5066CA999EC").map((x) => [x.renglon, x.dodo_uuid, x.precio, x.precio_sin_descuento, x.combo]), [
    [1, "11F19A219BE8517D93DA27012E304670", 107.9, 169, "Solo Dodo"],
    [2, "11F19AEBBCAEC131CD618E798751C0B0", 21.1, 33, "Solo Dodo"],
    [3, "11F19997A22F8B4D9C579AF6C277F970", 119, 159, null],
  ]);
});

test("el día resumido con la misma lógica de Datos brutos", () => {
  const t = traducirVentas(VENTAS, opciones);
  const dias = resumirDias(
    t.pedidos.map((x) => ({ ...x, sucursal: x.sucursal_id, inicio_coccion: null, listo: null, entregado: null })),
    t.productos.map((x) => ({ pedido_id: x.pedido_id, nombre: x.nombre, precio: x.precio, combo: x.combo })));
  assert.equal(dias.length, 1);
  assert.deepEqual(dias[0].resumen, { pedidos: 4, total: 1017, efectivo: 614, tarjeta: 403, en_linea: 0, iva: 140.27 });
  assert.deepEqual(dias[0].desglose.map((d) => [d.tipo, d.pedidos, d.total]), [["restaurante", 4, 1017]]);
  assert.deepEqual(dias[0].productos, { piezas: 10, suma: 1017 });
});

test("canales, agregador y valores desconocidos", () => {
  const t = traducirVentas([
    venta("aa01", "2026-10-20T20:00:10", "Online", "MobileApp", [p("bb01", "Pepperoni Grande", 159, 159)], { salesChannel: "Delivery" }),
    venta("aa02", "2026-10-20T20:05:10", "Card", "Dine-in", [p("bb01", "Pepperoni Grande", 159, 159)], { salesChannel: "Takeaway", aggregatorName: "Rappi" }),
    venta("aa03", "2026-10-20T20:06:10", "Voucher", "Drone", [p("bb01", "Pepperoni Grande", 159, 159)], { salesChannel: "Drive" }),
    venta("aa04", "2026-10-20T20:07:10", "Cash", "Dine-in", [p("bb01", "Pepperoni Grande", 159, 159)], { unitId: "otra-unidad" }),
  ], opciones);
  assert.deepEqual(t.pedidos.map((x) => [x.tipo, x.para_llevar, x.origen, x.pago, x.agregador]), [
    ["entrega", false, "app", "en_linea", null],
    ["en_tienda", true, "mostrador", "tarjeta", "Rappi"],
    ["en_tienda", false, "otro", "otro", null],
  ]);
  assert.deepEqual(t.desconocidos, ["canal: Drive", "origen: Drone", "pago: Voucher"]);
  assert.equal(t.sinSucursal, 1);
});

test("ventana del día y fecha a sincronizar (CDMX, UTC−6)", () => {
  assert.deepEqual(ventanaDelDia("2026-09-25"), { from: "2026-09-25T00:00:00", to: "2026-09-26T00:00:00" });
  assert.deepEqual(ventanaDelDia("2026-12-31"), { from: "2026-12-31T00:00:00", to: "2027-01-01T00:00:00" });
  assert.equal(fechaASincronizar("cron", "2026-10-20T05:30:00Z"), "2026-10-19");
  assert.equal(fechaASincronizar("cron", "2026-10-20T16:15:00Z"), "2026-10-20");
  assert.equal(fechaASincronizar("noche", "2026-10-20T09:00:00Z"), "2026-10-19");
  assert.equal(fechaASincronizar("noche", "2027-01-01T09:00:00Z"), "2026-12-31");
  assert.equal(fechaASincronizar("manual", "2026-10-20T18:00:00Z"), "2026-10-20");
});
