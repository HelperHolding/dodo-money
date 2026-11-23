import { test } from "node:test";
import assert from "node:assert/strict";
import { armarConceptos, desglose } from "./conceptos.ts";

const TICKET = [{ nombre: "Dodo Supreme Grande Tradicional", precio: 269 }, { nombre: "Coca Light 2 L", precio: 59 }, { nombre: "Rolls de manzana 8", precio: 55 }];

test("arma un concepto por producto con IVA incluido", () => {
  const r = armarConceptos(TICKET, 383);
  assert.ok("conceptos" in r);
  assert.equal(r.conceptos.length, 3);
  assert.deepEqual(r.conceptos[1], { quantity: 1, product: { description: "Coca Light 2 L", product_key: "90101501", unit_key: "E48", price: 59, tax_included: true, taxes: [{ type: "IVA", rate: 0.16 }] } });
});

test("agrupa productos iguales con el mismo precio", () => {
  const r = armarConceptos([{ nombre: "Coca 600", precio: 30 }, { nombre: "Coca 600", precio: 30 }, { nombre: "Coca 600", precio: 25 }], 85);
  assert.ok("conceptos" in r);
  assert.deepEqual(r.conceptos.map((c) => [c.product.description, c.quantity, c.product.price]), [["Coca 600", 2, 30], ["Coca 600", 1, 25]]);
});

test("omite renglones en cero (regalos de combo) y conserva el total", () => {
  const r = armarConceptos([{ nombre: "Combo", precio: 199 }, { nombre: "Dip", precio: 0 }], 199);
  assert.ok("conceptos" in r);
  assert.equal(r.conceptos.length, 1);
});

test("falla si la suma no cuadra al centavo o no hay productos", () => {
  assert.match((armarConceptos(TICKET, 384) as { error: string }).error, /no cuadra/);
  assert.match((armarConceptos([], 100) as { error: string }).error, /productos/);
  assert.match((armarConceptos([{ nombre: "X", precio: -5 }, { nombre: "Y", precio: 105 }], 100) as { error: string }).error, /negativo/);
});

test("centavos: 0.1 + 0.2 cuadra con 0.30", () => {
  assert.ok("conceptos" in armarConceptos([{ nombre: "A", precio: 0.1 }, { nombre: "B", precio: 0.2 }], 0.3));
});

test("desglose como el ticket: 383 → 330.17 + 52.83", () => {
  assert.deepEqual(desglose(383), { subtotal: 330.17, iva: 52.83 });
});
