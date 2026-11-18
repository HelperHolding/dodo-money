import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaDePago, finDeSemana, grupoPorPagar, pagadoDelMes, repartirConAjustes, repartirPago, resumenPagos, revisarPago, type PorPagar, agruparPorDiaDePago, efectoAplicacion, ajustarAplicacion, abonosDelPago, programacionTrasAbono, formaParaResto } from "./pagos.ts";

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

test("fechaDePago: programada, si no la sugerida, si no el vencimiento", () => {
  assert.equal(fechaDePago({ vence_el: "2026-10-14", pago_programado_el: null, pago_sugerido_el: "2026-10-09" }), "2026-10-09");
  assert.equal(fechaDePago({ vence_el: "2026-10-14", pago_programado_el: "2026-10-16", pago_sugerido_el: "2026-10-09" }), "2026-10-16");
  assert.equal(fechaDePago({ vence_el: "2026-10-14", pago_programado_el: null }), "2026-10-14");
});

test("agruparPorDiaDePago: por día con su total; lo atrasado cae en el próximo día de pago", () => {
  const f = (id: string, saldo: number, vence: string, programada: string | null, sugerida: string) =>
    ({ id, saldo, vence_el: vence, pago_programado_el: programada, pago_sugerido_el: sugerida, estado: "por_pagar" as const });
  const g = agruparPorDiaDePago([
    f("a", 100, "2026-10-14", null, "2026-10-09"),
    f("b", 50.5, "2026-10-16", "2026-10-16", "2026-10-16"),
    f("c", 10, "2026-10-01", null, "2026-10-09"),
    f("d", 20, "2026-10-20", "2026-10-02", "2026-10-16"),
  ], "2026-10-06", "2026-10-09");
  assert.deepEqual(g.map((x) => [x.dia, x.total, x.facturas.map((y) => `${y.id}${y.programada ? "P" : ""}${y.atrasada ? "!" : ""}`)]),
    [["2026-10-09", 130, ["a", "c!", "dP!"]], ["2026-10-16", 50.5, ["bP"]]]);
});

test("agruparPorDiaDePago: una vencida sigue marcada aunque ya esté programada", () => {
  const g = agruparPorDiaDePago([
    { id: "v", saldo: 10, vence_el: "2026-10-01", pago_programado_el: "2026-10-09", pago_sugerido_el: "2026-10-09", estado: "por_pagar" as const },
  ], "2026-10-06", "2026-10-09");
  assert.deepEqual([g[0].facturas[0].programada, g[0].facturas[0].atrasada], [true, true]);
});

test("agruparPorDiaDePago: avisa cuando el día de pago cae después del vencimiento", () => {
  // Sábado 17/10: vence el lunes 19 y el viernes 16 ya pasó, así que su día de pago es el 23 (tarde).
  const g = agruparPorDiaDePago([
    { id: "t", saldo: 10, vence_el: "2026-10-19", pago_programado_el: null, pago_sugerido_el: "2026-10-23", estado: "por_pagar" as const },
    { id: "ok", saldo: 10, vence_el: "2026-10-30", pago_programado_el: null, pago_sugerido_el: "2026-10-30", estado: "por_pagar" as const },
  ], "2026-10-17", "2026-10-23");
  const t = g.flatMap((x) => x.facturas).map((x) => [x.id, x.tarde, x.atrasada]);
  assert.deepEqual(t, [["t", true, false], ["ok", false, false]]);
});

test("efecto de lo aplicado: liquida o abona y dice cuánto queda, al centavo", () => {
  assert.deepEqual(efectoAplicacion(1000, 1000), { tipo: "liquida" });
  assert.deepEqual(efectoAplicacion(1000.1, 1000.1), { tipo: "liquida" });
  assert.deepEqual(efectoAplicacion(1000, 400), { tipo: "abono", queda: 600 });
  assert.deepEqual(efectoAplicacion(100.3, 0.1), { tipo: "abono", queda: 100.2 });
  assert.equal(efectoAplicacion(1000, 0), null);
  assert.equal(efectoAplicacion(1000, 1200), null); // pasa del saldo: lo avisa revisarPago
});

test("cambiar lo aplicado a una factura recalcula el monto y congela las demás", () => {
  // Llegó desde la factura A con su saldo; el admin baja el abono a 4,000.
  assert.deepEqual(ajustarAplicacion([{ factura_id: "a", monto: "10000" }, { factura_id: "b", monto: "" }], "a", "4,000"),
    { manual: { a: "4,000", b: "" }, monto: "4000" });
  // Sin factura elegida el monto cayó en A (vence antes); se pasa a B: A en 0 y B con el abono.
  const paso1 = ajustarAplicacion([{ factura_id: "a", monto: "500" }, { factura_id: "b", monto: "" }], "a", "0");
  assert.deepEqual(paso1, { manual: { a: "0", b: "" }, monto: "0" });
  assert.deepEqual(ajustarAplicacion([{ factura_id: "a", monto: paso1.manual.a }, { factura_id: "b", monto: paso1.manual.b }], "b", "500.25"),
    { manual: { a: "0", b: "500.25" }, monto: "500.25" });
  // Centavos sin errores de coma flotante.
  assert.equal(ajustarAplicacion([{ factura_id: "a", monto: "0.1" }, { factura_id: "b", monto: "0.2" }], "b", "0.2").monto, "0.3");
  // Mientras escribe, un campo vacío cuenta como cero.
  assert.equal(ajustarAplicacion([{ factura_id: "a", monto: "300" }], "a", "").monto, "");
});

test("abonos del pago: las facturas que quedan con saldo", () => {
  const saldos = new Map([["a", 1000], ["b", 500], ["c", 0.3]]);
  assert.deepEqual(abonosDelPago([{ factura_id: "a", monto: 400 }, { factura_id: "b", monto: 500 }, { factura_id: "c", monto: 0.1 }], saldos), ["a", "c"]);
  assert.deepEqual(abonosDelPago([{ factura_id: "b", monto: 500 }], saldos), []);
});

test("programación del resto tras un abono", () => {
  // Con fecha para liquidar el resto: se programa ahí.
  assert.deepEqual(programacionTrasAbono("2026-11-06", "2026-11-06", "2026-11-27"), { fecha: "2026-11-27" });
  // Sin fecha: la programación que era para este pago (hoy o antes) se borra y el resto vuelve a su día sugerido.
  assert.deepEqual(programacionTrasAbono("2026-11-06", "2026-11-06", ""), { fecha: null });
  assert.deepEqual(programacionTrasAbono("2026-11-01", "2026-11-06", ""), { fecha: null });
  // Una programación futura se respeta; sin programación no hay nada que hacer.
  assert.equal(programacionTrasAbono("2026-11-20", "2026-11-06", ""), null);
  assert.equal(programacionTrasAbono(null, "2026-11-06", ""), null);
});

test("forma prevista del resto: la que tenía la factura; si no, la del abono", () => {
  assert.equal(formaParaResto("cheque", "transferencia"), "cheque");
  assert.equal(formaParaResto(null, "transferencia"), "transferencia");
  assert.equal(formaParaResto(null, "tarjeta"), "tarjeta");
  assert.equal(formaParaResto(null, "boveda_acumulado"), "efectivo");
  assert.equal(formaParaResto(null, "ventas"), "efectivo");
  assert.equal(formaParaResto(null, "boveda"), "efectivo");
});
