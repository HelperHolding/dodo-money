import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaDePago, finDeSemana, grupoPorPagar, pagadoDelMes, repartirConAjustes, repartirPago, resumenPagos, revisarPago, type PorPagar } from "./pagos.ts";

const f = (id: string, saldo: number, vence_el: string, pago_programado_el: string | null = null): PorPagar =>
  ({ id, saldo, vence_el, pago_programado_el, estado: "por_pagar" });

test("fecha de pago: la programada o, si no hay, el vencimiento", () => {
  assert.equal(fechaDePago(f("a", 1, "2026-10-10")), "2026-10-10");
  assert.equal(fechaDePago(f("a", 1, "2026-10-10", "2026-10-08")), "2026-10-08");
});

test("reparto: primero lo que se paga antes, hasta el saldo, al centavo", () => {
  const facturas = [f("c", 500, "2026-10-20"), f("a", 300.5, "2026-10-01"), f("b", 400, "2026-10-10", "2026-09-30")];
  assert.deepEqual(repartirPago(1000.01, facturas), {
    aplicaciones: [{ factura_id: "b", monto: 400 }, { factura_id: "a", monto: 300.5 }, { factura_id: "c", monto: 299.51 }], sobrante: 0,
  });
  assert.deepEqual(repartirPago(2000, facturas).sobrante, 799.5);
  assert.deepEqual(repartirPago(0, facturas), { aplicaciones: [], sobrante: 0 });
});

test("revisar un pago antes de registrarlo", () => {
  const saldos = new Map([["a", 300], ["b", 400]]);
  assert.equal(revisarPago(700, [{ factura_id: "a", monto: 300 }, { factura_id: "b", monto: 400 }], saldos), null);
  assert.equal(revisarPago(0, [], saldos), "Escribe el monto del pago.");
  assert.equal(revisarPago(100, [], saldos), "Elige al menos una factura y cuánto se le aplica.");
  assert.equal(revisarPago(500, [{ factura_id: "a", monto: 500 }], saldos), "Lo aplicado a una factura no puede pasar de su saldo ($300.00).");
  assert.equal(revisarPago(500, [{ factura_id: "a", monto: 300 }], saldos), "Lo aplicado ($300.00) no suma el monto del pago ($500.00).");
  assert.equal(revisarPago(100, [{ factura_id: "x", monto: 100 }], saldos), "Una de las facturas ya no tiene saldo por pagar.");
});

test("semana de lunes a domingo", () => {
  assert.equal(finDeSemana("2026-10-01"), "2026-10-04");
  assert.equal(finDeSemana("2026-10-04"), "2026-10-04");
  assert.equal(finDeSemana("2026-10-05"), "2026-10-11");
});

test("agrupar por pagar e indicadores", () => {
  const hoy = "2026-10-01";
  const facturas = [
    f("vencida", 100, "2026-09-25"),
    f("vencida-programada", 50, "2026-09-28", "2026-10-03"),
    f("semana", 200, "2026-10-03"),
    f("mes", 300, "2026-10-20"),
    f("lejos", 400, "2026-12-01"),
  ];
  assert.deepEqual(facturas.map((x) => grupoPorPagar(x, hoy)), ["vencidas", "vencidas", "semana", "despues", "despues"]);
  assert.deepEqual(resumenPagos(facturas, [
    { fecha: "2026-10-01", monto: 1000, anulado: false },
    { fecha: "2026-10-01", monto: 999, anulado: true },
    { fecha: "2026-09-30", monto: 5, anulado: false },
  ], hoy), { vencido: 150, semana: 200, treinta: 500, pagadoMes: 1000 });
});

test("ajuste a mano: las demás facturas se reparten el resto", () => {
  const facturas = [f("a", 300, "2026-10-01"), f("b", 400, "2026-10-02"), f("c", 500, "2026-10-03")];
  // El proveedor pide pagar C completa: con $1,000, el resto ($500) va a A y B por fecha.
  assert.deepEqual(repartirConAjustes(1000, facturas, { c: 500 }), {
    aplicaciones: [{ factura_id: "c", monto: 500 }, { factura_id: "a", monto: 300 }, { factura_id: "b", monto: 200 }], sobrante: 0,
  });
  // Ajustes que ya pasan del monto: no se reparte nada más.
  assert.deepEqual(repartirConAjustes(400, facturas, { c: 500 }).aplicaciones, [{ factura_id: "c", monto: 500 }]);
  // Sin ajustes, igual que repartirPago.
  assert.deepEqual(repartirConAjustes(1000, facturas, {}), repartirPago(1000, facturas));
});

test("pagado del mes desde lo aplicado: respeta el filtro y cuenta pagos distintos", () => {
  const aplicaciones = [
    { pago_id: "p1", fecha: "2026-10-01", monto: 300, anulado: false },
    { pago_id: "p1", fecha: "2026-10-01", monto: 200, anulado: false },
    { pago_id: "p2", fecha: "2026-10-02", monto: 99, anulado: true },
    { pago_id: "p3", fecha: "2026-09-30", monto: 50, anulado: false },
    { pago_id: "p4", fecha: "2026-10-05", monto: 0.1, anulado: false },
    { pago_id: "p4", fecha: "2026-10-05", monto: 0.2, anulado: false },
  ];
  assert.deepEqual(pagadoDelMes(aplicaciones, "2026-10-15"), { monto: 500.3, pagos: 2 });
  assert.deepEqual(pagadoDelMes([], "2026-10-15"), { monto: 0, pagos: 0 });
});
