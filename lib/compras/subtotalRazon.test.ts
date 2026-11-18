import { test } from "node:test";
import assert from "node:assert/strict";
import { SIN_RAZON, subtotalesPorRazon } from "./subtotalRazon.ts";

test("subtotal por razón social: suma al centavo y cuenta por RFC", () => {
  const grupos = subtotalesPorRazon([
    { monto: 100.1, rfc: "HHO010101AAA", empresa: "HELPER HOLDING" },
    { monto: 0.2, rfc: "hho010101aaa ", empresa: "HELPER HOLDING" },
    { monto: 500, rfc: "CMS230321FI8", empresa: "COMERCIALIZADORA MASTER SITRU" },
  ]);
  assert.deepEqual(grupos, [
    { rfc: "CMS230321FI8", empresa: "COMERCIALIZADORA MASTER SITRU", total: 500, cuenta: 1 },
    { rfc: "HHO010101AAA", empresa: "HELPER HOLDING", total: 100.3, cuenta: 2 },
  ]);
});

test("subtotal por razón social: lo que no se identifica va al final aunque sume más", () => {
  const grupos = subtotalesPorRazon([
    { monto: 9000, rfc: "", empresa: undefined },
    { monto: 50, rfc: "XAXX010101000", empresa: SIN_RAZON },
    { monto: 10, rfc: "HHO010101AAA", empresa: "HELPER HOLDING" },
    { monto: 10, rfc: "AAA010101AAA", empresa: "ALFA" },
  ]);
  assert.deepEqual(grupos.map((g) => [g.empresa, g.rfc, g.total]), [
    ["ALFA", "AAA010101AAA", 10],
    ["HELPER HOLDING", "HHO010101AAA", 10],
    [SIN_RAZON, null, 9000],
    [SIN_RAZON, "XAXX010101000", 50],
  ]);
});

test("subtotal por razón social: sin filas no hay grupos y la suma cuadra con el total", () => {
  assert.deepEqual(subtotalesPorRazon([]), []);
  const filas = [0.1, 0.2, 0.3, 1234.56].map((monto, i) => ({ monto, rfc: i % 2 ? "B" : "A", empresa: i % 2 ? "B" : "A" }));
  const suma = subtotalesPorRazon(filas).reduce((n, g) => n + Math.round(g.total * 100), 0) / 100;
  assert.equal(suma, 1235.16);
});
