import test from "node:test";
import assert from "node:assert/strict";
import { ordenDesdeApi, estadoDesdeApi, montosApi, fechaListado } from "./api.mjs";

// Forma real de la API (orden 2482139768 del 20/10/2026), sin datos de cliente ni repartidor.
const totales = (sub, rest, subRest, rappi, total) => ({ total: { id: "suggested_total", value: total }, details: [{ id: "subtotal", value: sub }, { id: "discounts_partner_store", value: -rest }, { id: "subtotal_rest", value: subRest }, { id: "discounts_rappi", value: -rappi }] });
const topping = (description, order_product_topping_id, units = 1) => ({ description, order_product_topping_id, units });
const detalle = (cambios = {}) => ({
  id: 2482139768, state: "pending_review", created_at: "2026-10-20 22:52:32", payment_method: "Apple Pay - american_express",
  products: [
    { name: "Pizza Cheeseburger", units: 1, total_price: 346, toppings: [topping("Dip de Buffalo", 1359332182), topping("35 cm", 1359332180), topping("Tradicional", 1359332181)] },
    { name: "Rolls de manzana", units: 1, total_price: 65, toppings: [] },
  ],
  order_totals: totales(411, 0, 411, 68.8, 342.2),
  ...cambios,
});

test("API Rappi: orden completa con centavos, opciones en orden de registro y separador ·", () => {
  const r = ordenDesdeApi(detalle(), "MX1930486109");
  assert.deepEqual(r.orden, { rappi_id: "2482139768", tienda_id: "MX1930486109", fecha: "2026-10-20", hora: "22:52", estado: "Finalizado", pago: "Apple Pay - american_express", bruto: 411, descuento_restaurante: 0, subtotal_restaurante: 411, descuento_rappi: 68.8, facturar: 342.2 });
  assert.deepEqual(r.productos.map((p) => [p.linea, p.nombre, p.opciones, p.cantidad, p.importe]), [[1, "Pizza Cheeseburger", "35 cm · Tradicional · Dip de Buffalo", 1, 346], [2, "Rolls de manzana", "", 1, 65]]);
});
test("API Rappi: estados como los etiqueta el portal", () => {
  for (const s of ["finished", "pending_review", "on_the_route", "arrive", "close_order", "finished_order"]) assert.equal(estadoDesdeApi({ state: s }), "Finalizado", s);
  for (const s of ["canceled_by_early_regret", "canceled_with_charge", "cancelled"]) assert.equal(estadoDesdeApi({ state: s }), "Cancelado", s);
  for (const s of ["created", "in_store", "in_progress", "scheduled", ""]) assert.equal(estadoDesdeApi({ state: s }), null, s);
  assert.equal(estadoDesdeApi({ state: "finished", has_claims: true }), "Con reclamo");
  assert.equal(ordenDesdeApi(detalle({ state: "in_progress" }), "MX1"), null);
});
test("API Rappi: opciones con varias unidades y espacios de Rappi", () => {
  const r = ordenDesdeApi(detalle({ products: [{ name: " Pepperoni ", units: 2, total_price: 411, toppings: [topping("30 cm ", 1), topping("Dip de Ranch", 2, 2)] }] }), "MX1");
  assert.equal(r.productos[0].nombre, "Pepperoni"); assert.equal(r.productos[0].opciones, "30 cm · 2x Dip de Ranch"); assert.equal(r.productos[0].cantidad, 2);
});
test("API Rappi: rechaza montos o renglones que no cuadran", () => {
  assert.throws(() => ordenDesdeApi(detalle({ order_totals: totales(412, 0, 412, 68.8, 343.2) }), "MX1"), /renglones suman 411/);
  assert.throws(() => ordenDesdeApi(detalle({ order_totals: totales(411, 0, 411, 68.8, 342) }), "MX1"), /no cuadran/);
  assert.throws(() => ordenDesdeApi(detalle({ order_totals: undefined }), "MX1"), /sin totales/);
  assert.throws(() => ordenDesdeApi(detalle({ payment_method: "" }), "MX1"), /método de pago/);
});
test("API Rappi: montos sin descuentos y fecha del listado", () => {
  assert.deepEqual(montosApi({ order_totals: { total: { value: 199 }, details: [{ id: "subtotal", value: 199 }] } }), { bruto: 199, descuento_restaurante: 0, subtotal_restaurante: 199, descuento_rappi: 0, facturar: 199 });
  assert.equal(fechaListado({ created_at: "2026-10-20 22:52:32" }), "2026-10-20");
});

import { planearVuelta } from "./api.mjs";
test("vuelta en vivo: salta en curso, reutiliza terminadas en caché y abre el resto", () => {
  const it = (id, state, created_at = "2026-10-21 13:00:00", extra = {}) => ({ id, state, created_at, ...extra });
  const cache = { 1: { orden: { estado: "Finalizado" }, productos: [] }, 2: { orden: { estado: "Finalizado" }, productos: [] } };
  const r = planearVuelta([
    it(1, "pending_review"),                       // en caché igual → reutiliza
    it(2, "canceled_by_early_regret"),             // cambió de estado → abre
    it(3, "in_store"),                             // en curso → salta
    it(4, "finished"),                             // nueva → abre
    it(5, "finished", "2026-10-20 23:59:00"),      // otro día → ignora
    it(6, "finished", "2026-10-21 14:00:00", { has_claims: true }),
  ], "2026-10-21", cache);
  assert.deepEqual(r.abrir, ["2", "4", "6"]);
  assert.equal(r.reusar.length, 1); assert.equal(r.enCurso, 1);
  assert.deepEqual(planearVuelta([it(1, "finished")], "2026-10-21").abrir, ["1"]);
});

import { planearRepaso } from "./api.mjs";
test("vuelta en vivo: reporta la cancelación de una orden ya importada como finalizada", () => {
  const cache = { 7: { orden: { estado: "Finalizado" }, productos: [] }, 8: { base: true, orden: { estado: "Finalizado" } } };
  const r = planearVuelta([{ id: 7, state: "canceled_by_partner_inactivity", created_at: "2026-10-21 13:00:00" }, { id: 8, state: "finished", created_at: "2026-10-21 13:10:00" }], "2026-10-21", cache);
  assert.deepEqual(r.abrir, ["7", "8"]); // la de referencia (base) no se reutiliza: hay que abrirla
  assert.deepEqual(r.cambios, [{ rappi_id: "7", fecha: "2026-10-21", de: "Finalizado", a: "Cancelado" }]);
});
test("repaso de días cerrados: solo abre las que cambiaron y no mueve las no registradas", () => {
  const it = (id, state) => ({ id, state, created_at: "2026-10-18 13:00:00" });
  const cache = { 1: { orden: { estado: "Finalizado" }, productos: [] }, 2: { base: true, orden: { estado: "Finalizado" } }, 3: { orden: { estado: "Finalizado" }, productos: [] } };
  const r = planearRepaso([it(1, "canceled_with_charge"), it(2, "canceled_by_early_regret"), it(3, "finished"), it(4, "finished"), it(5, "in_store")], "2026-10-18", cache);
  assert.deepEqual(r.abrir, ["1", "2"]);
  assert.deepEqual(r.cambios.map((c) => `${c.rappi_id}:${c.de}>${c.a}`), ["1:Finalizado>Cancelado", "2:Finalizado>Cancelado"]);
  assert.deepEqual(r.base, { 4: { base: true, orden: { estado: "Finalizado" } } }); // nueva referencia, sin reimportar
  assert.deepEqual(planearRepaso([it(1, "finished")], "2026-10-18", {}).abrir, []);
});
