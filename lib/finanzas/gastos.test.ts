import { test } from "node:test";
import assert from "node:assert/strict";
import { facturasAGastos, faltantesDe, sumarGastos } from "./gastos.ts";

test("facturasAGastos: subtotal − descuento; notas de crédito restan; canceladas fuera; memos aparte", () => {
  const r = facturasAGastos([
    { tipo: "ingreso", estado: "por_pagar", subtotal: 1000, descuento: 100, cuenta_pl: "servicios" },
    { tipo: "egreso", estado: "pagada", subtotal: 200, descuento: 0, cuenta_pl: "servicios" },
    { tipo: "ingreso", estado: "cancelada", subtotal: 999, descuento: 0, cuenta_pl: "servicios" },
    { tipo: "ingreso", estado: "pagada", subtotal: 300, descuento: 0, cuenta_pl: null },
    { tipo: "ingreso", estado: "pagada", subtotal: 5000, descuento: 0, cuenta_pl: "insumos" },
    { tipo: "ingreso", estado: "pagada", subtotal: 8000, descuento: 0, cuenta_pl: "inversiones" },
  ]);
  assert.deepEqual(r, { gastos: { servicios: 700 }, sinCuenta: 300, memos: { insumos: 5000, inversiones: 8000 } });
});

test("sumarGastos y faltantes", () => {
  assert.deepEqual(sumarGastos({ renta: 100 }, { renta: 50, otros: 1 }), { renta: 150, otros: 1 });
  assert.equal(faltantesDe([-50, 20, -10.5]), 40.5);
});

test("facturasAGastos con fracción: cada factura por la parte de su mes", () => {
  const r = facturasAGastos([
    { tipo: "ingreso", estado: "pagada", subtotal: 3000, descuento: 0, cuenta_pl: "renta", fecha_emision: "2026-09-05" },
    { tipo: "ingreso", estado: "pagada", subtotal: 3100, descuento: 0, cuenta_pl: "renta", fecha_emision: "2026-10-02" },
    { tipo: "egreso", estado: "pagada", subtotal: 310, descuento: 0, cuenta_pl: null, fecha_emision: "2026-10-20" },
  ], (f) => (f.startsWith("2026-09") ? 0.1 : 4 / 31));
  assert.deepEqual(r, { gastos: { renta: 700 }, sinCuenta: -40, memos: { insumos: 0, inversiones: 0 } });
});
