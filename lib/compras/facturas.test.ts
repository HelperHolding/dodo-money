import { test } from "node:test";
import assert from "node:assert/strict";
import { avanceFacturacion, baseArchivo, cotejar, valorRecibido, venceEl, vencida } from "./facturas.ts";

test("vencimiento: PUE vence el mismo día; PPD y sin método suman los días de crédito", () => {
  assert.equal(venceEl("2026-09-25", 15, "PUE"), "2026-09-25");
  assert.equal(venceEl("2026-09-25", 15, "PPD"), "2026-10-10");
  assert.equal(venceEl("2026-12-20", 30, null), "2027-01-19");
  assert.equal(venceEl("2026-09-25", 0, "PPD"), "2026-09-25");
});

test("vencida: con saldo, sin pagar y pasada la fecha", () => {
  assert.equal(vencida({ estado: "por_pagar", vence_el: "2026-09-29", saldo: 100 }, "2026-09-30"), true);
  assert.equal(vencida({ estado: "parcial", vence_el: "2026-09-29", saldo: 50 }, "2026-09-30"), true);
  assert.equal(vencida({ estado: "por_pagar", vence_el: "2026-09-30", saldo: 100 }, "2026-09-30"), false);
  assert.equal(vencida({ estado: "pagada", vence_el: "2026-09-01", saldo: 0 }, "2026-09-30"), false);
  assert.equal(vencida({ estado: "cancelada", vence_el: "2026-09-01", saldo: 100 }, "2026-09-30"), false);
  assert.equal(vencida({ estado: "por_pagar", vence_el: "2026-09-01", saldo: 0 }, "2026-09-30"), false);
});

test("valor de lo recibido a precio de la orden con IVA", () => {
  assert.equal(valorRecibido([{ recibido: 10, precio: 50, tasa_iva: "0" }, { recibido: 50, precio: 5, tasa_iva: "16" }]), 790);
  assert.equal(valorRecibido([]), 0);
});

test("cotejo de tres vías con tolerancia de $1", () => {
  const base = { tieneOrdenes: true, ordenado: 1080, recibido: 1080, recepcionCompleta: true, facturado: 1080 };
  assert.equal(cotejar(base), "cuadra");
  assert.equal(cotejar({ ...base, facturado: 1080.9 }), "cuadra");
  assert.equal(cotejar({ ...base, tieneOrdenes: false }), "sin_orden");
  assert.equal(cotejar({ ...base, recibido: 0, recepcionCompleta: false }), "nada_recibido");
  assert.equal(cotejar({ ...base, recibido: 540, recepcionCompleta: false, facturado: 1080 }), "facturado_de_mas");
  assert.equal(cotejar({ ...base, recibido: 540, recepcionCompleta: false, facturado: 540 }), "cuadra");
  assert.equal(cotejar({ ...base, recibido: 1200, ordenado: 1200, facturado: 1080 }), "precio_distinto");
});

test("avance de facturación de una orden", () => {
  assert.equal(avanceFacturacion(1000, 0), "nada");
  assert.equal(avanceFacturacion(1000, 400), "parcial");
  assert.equal(avanceFacturacion(1000, 999.5), "completa");
  assert.equal(avanceFacturacion(1000, 1200), "completa");
});

test("emparejar XML y PDF por nombre", () => {
  assert.equal(baseArchivo("A-1234.XML"), "a-1234");
  assert.equal(baseArchivo("A-1234.pdf"), "a-1234");
  assert.equal(baseArchivo("factura sin extension"), "factura sin extension");
});
