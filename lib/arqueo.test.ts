import { test } from "node:test";
import assert from "node:assert/strict";
import { cuadre, pideVentas } from "./arqueo.ts";

test("en el inicio de turno no se piden ventas", () => {
  assert.equal(pideVentas("inicio"), false);
  assert.equal(pideVentas("traspaso"), true);
  assert.equal(pideVentas("cierre"), true);
});

test("inicio: el esperado es solo el fondo, aunque se haya escrito una venta", () => {
  const r = cuadre({ momento: "inicio", fondo: 1500, ventas: 1500, retiros: 0, contado: 1500 });
  assert.equal(r.esperado, 1500);
  assert.equal(r.ventas, 0);
  assert.equal(r.estado, "cuadra");
});

test("inicio queda listo con solo contar", () => {
  assert.equal(cuadre({ momento: "inicio", fondo: 1500, ventas: null, retiros: 0, contado: 1400 }).estado, "faltante");
  assert.equal(cuadre({ momento: "inicio", fondo: 1500, ventas: null, retiros: 0, contado: 0 }).estado, "pendiente");
});

test("traspaso y cierre suman ventas y restan retiros, y esperan a que se escriban las ventas", () => {
  assert.equal(cuadre({ momento: "cierre", fondo: 1500, ventas: 4200, retiros: 3000, contado: 2700 }).esperado, 2700);
  assert.equal(cuadre({ momento: "cierre", fondo: 1500, ventas: 4200, retiros: 3000, contado: 2750 }).estado, "sobrante");
  assert.equal(cuadre({ momento: "traspaso", fondo: 1500, ventas: null, retiros: 0, contado: 2000 }).estado, "pendiente");
});
