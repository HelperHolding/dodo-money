import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { compararVentas, hayDiferencia, ivaDeVenta } from "./ventasDodo.ts";

const dodo = (efectivo: number, tarjeta: number, pedidos = 10) =>
  ({ efectivo, tarjeta, pedidos, actualizado_en: "2026-11-25T03:00:00Z" }) as never;

test("ivaDeVenta: IVA incluido 16/116 redondeado a centavos", () => {
  assert.equal(ivaDeVenta(17068), 2354.21);
  assert.equal(ivaDeVenta(19900.8), 2744.94);
});

test("compararVentas: todo cuadra da diferencias en cero y no activa tarjetaComoEfectivo", () => {
  const c = compararVentas({ efectivo: 5000, tarjeta: 12068 }, dodo(5000, 12068, 42));
  assert.deepEqual(c, { efectivo: 0, tarjeta: 0, tarjetaComoEfectivo: false, pedidos: 42 });
});

test("compararVentas: efectivo distinto", () => {
  const c = compararVentas({ efectivo: 4900, tarjeta: 12068 }, dodo(5000, 12068));
  assert.equal(c.efectivo, -100);
  assert.equal(c.tarjeta, 0);
  assert.equal(c.tarjetaComoEfectivo, false);
});

test("compararVentas: reparto distinto con la misma suma activa tarjetaComoEfectivo", () => {
  const c = compararVentas({ efectivo: 5000, tarjeta: 12068 }, dodo(17068, 0));
  assert.equal(c.efectivo, -12068);
  assert.equal(c.tarjeta, 12068);
  assert.equal(c.tarjetaComoEfectivo, true);
});

test("compararVentas: caso real del 22-nov da diferencias y no activa tarjetaComoEfectivo", () => {
  const c = compararVentas({ efectivo: 5732, tarjeta: 11471.5 }, dodo(17068, 0));
  assert.equal(c.efectivo, -11336);
  assert.equal(c.tarjeta, 11471.5);
  assert.equal(c.tarjetaComoEfectivo, false);
});

test("compararVentas: sin datos de Dodo todo es null", () => {
  const c = compararVentas({ efectivo: 1, tarjeta: 2 }, null);
  assert.deepEqual(c, { efectivo: null, tarjeta: null, tarjetaComoEfectivo: false, pedidos: null });
});

test("compararVentas: campo capturado vacio da null en ese campo", () => {
  const c = compararVentas({ efectivo: null, tarjeta: 100 }, dodo(5000, 100));
  assert.equal(c.efectivo, null);
  assert.equal(c.tarjeta, 0);
  assert.equal(c.tarjetaComoEfectivo, false);
});

test("tolerancia: exactamente $1.00 no es diferencia; $1.01 si", () => {
  const justo = compararVentas({ efectivo: 5001, tarjeta: 0 }, dodo(5000, 0));
  assert.equal(justo.efectivo, 1);
  assert.equal(hayDiferencia(justo.efectivo), false);

  const pasado = compararVentas({ efectivo: 5001.01, tarjeta: 0 }, dodo(5000, 0));
  assert.equal(pasado.efectivo, 1.01);
  assert.equal(hayDiferencia(pasado.efectivo), true);
});

test("hayDiferencia: null nunca es diferencia", () => {
  assert.equal(hayDiferencia(null), false);
  assert.equal(hayDiferencia(-1.01), true);
  assert.equal(hayDiferencia(-1), false);
});
