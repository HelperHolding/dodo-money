import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFlujo, conSaldos, flujoPorMes, visibles, type Flujo, type MovimientoFlujo } from "./flujo.ts";

let fila = 0;
const mov = (fecha: string, cargo: number, abono: number, saldo: number, tipo: string | null = null, concepto = "", cuentaId = "c1"): MovimientoFlujo =>
  ({ cuentaId, fecha, fila: ++fila, cargo, abono, saldo, conciliacion: tipo ? { tipo, concepto } : null });
const de = (f: Flujo, clave: string) => {
  const r = f.renglones.find((x) => x.clave === clave);
  assert.ok(r, `falta ${clave}`);
  return r;
};

const OCT = [
  mov("2026-10-02", 0, 1000, 11000, "cobro_tarjeta", "cobranza_tarjeta"),
  mov("2026-10-02", 20, 0, 10980, "cobro_tarjeta", "cobranza_tarjeta"),
  mov("2026-10-03", 0, 500, 11480, "cobro_rappi", "cobranza_rappi"),
  mov("2026-10-04", 300, 0, 11180, "pago_proveedor", "proveedores"),
  mov("2026-10-05", 0, 50, 11230, "sin_documento", "proveedores"),
  mov("2026-10-06", 100, 0, 11130, "nomina", "nomina"),
  mov("2026-10-07", 30, 0, 11100),
  mov("2026-10-08", 0, 5000, 16100, "sin_documento", "prestamo_recibido"),
  mov("2026-10-09", 1000, 0, 15100, "sin_documento", "capex"),
  mov("2026-10-10", 200, 0, 14900, "sin_documento", "traspaso_interno"),
];

test("conceptos, regla del cobro con tarjeta, devoluciones y totales", () => {
  const f = calcularFlujo(OCT);
  assert.equal(de(f, "cobranza_tarjeta").monto, 1000);
  assert.equal(de(f, "comisiones_cobro").monto, -20);
  assert.equal(de(f, "cobranza_rappi").monto, 500);
  assert.equal(de(f, "proveedores").monto, -250);
  assert.equal(de(f, "ingresos_operativos").monto, 1500);
  assert.equal(de(f, "egresos_operativos").monto, -370);
  assert.equal(de(f, "flujo_operacion").monto, 1130);
  assert.equal(de(f, "flujo_inversion").monto, -1000);
  assert.equal(de(f, "flujo_antes_financiamiento").monto, 130);
  assert.equal(de(f, "flujo_financiamiento").monto, 5000);
  assert.equal(de(f, "traspaso_interno").monto, -200);
  assert.equal(de(f, "por_conciliar_salidas").monto, -30);
  assert.equal(de(f, "flujo_neto").monto, 4900);
  assert.deepEqual([f.saldoInicial, f.saldoFinal, f.diferencia], [10000, 14900, 0]);
  assert.deepEqual(f.porConciliar, { n: 1, entradas: 0, salidas: -30 });
  assert.equal(f.ultimaFecha, "2026-10-10");
  assert.equal(de(f, "proveedores").pct, -250 / 1500);
  assert.equal(de(f, "saldo_final").pct, null);
});

test("orden de renglones de la plantilla", () => {
  assert.deepEqual(calcularFlujo([]).renglones.map((r) => r.clave), [
    "cobranza_tarjeta", "deposito_efectivo", "cobranza_rappi", "ingresos_operativos",
    "proveedores", "nomina", "imss_impuestos", "renta", "servicios", "marketing", "regalias", "comisiones_cobro", "comisiones_bancarias", "otros_operacion",
    "egresos_operativos", "flujo_operacion",
    "capex", "apertura", "flujo_inversion", "flujo_antes_financiamiento",
    "prestamo_recibido", "pago_capital", "intereses", "flujo_financiamiento",
    "traspaso_interno", "por_conciliar_entradas", "por_conciliar_salidas", "flujo_neto",
    "saldo_inicial", "saldo_final",
  ]);
});

test("dos cuentas: una sin movimientos usa su saldo previo", () => {
  const f = calcularFlujo([mov("2026-10-05", 0, 100, 300, null, "", "c2")], [{ cuentaId: "c1", saldo: 500 }, { cuentaId: "c2", saldo: 200 }]);
  assert.deepEqual([f.saldoInicial, f.saldoFinal, f.diferencia], [700, 800, 0]);
  assert.equal(de(f, "por_conciliar_entradas").monto, 100);
});

test("hueco en los saldos del banco: se reporta la diferencia", () => {
  const f = calcularFlujo([mov("2026-10-01", 0, 100, 1100), mov("2026-10-02", 50, 0, 900)]);
  assert.deepEqual([f.saldoInicial, f.saldoFinal], [1000, 900]);
  assert.equal(f.diferencia, -150);
});

test("hueco al inicio del periodo: el saldo previo manda y la diferencia lo expone", () => {
  const f = calcularFlujo([mov("2026-10-05", 0, 100, 1600)], [{ cuentaId: "c1", saldo: 1000 }]);
  assert.deepEqual([f.saldoInicial, f.saldoFinal, f.diferencia], [1000, 1600, 500]);
});

test("conSaldos: reemplaza saldo inicial y final y recalcula la diferencia", () => {
  const f = calcularFlujo([mov("2026-10-05", 0, 100, 1600)], [{ cuentaId: "c1", saldo: 1000 }]);
  const g = conSaldos(f, 1000, 1100);
  assert.deepEqual([g.saldoInicial, g.saldoFinal, g.diferencia], [1000, 1100, 0]);
  assert.equal(de(g, "saldo_inicial").monto, 1000);
  assert.equal(de(g, "saldo_final").monto, 1100);
  assert.equal(de(f, "saldo_final").monto, 1600);
});

test("sin ingresos no hay porcentaje; sin movimientos todo en cero", () => {
  const f = calcularFlujo([mov("2026-10-01", 10, 0, 90, "sin_documento", "comisiones_bancarias")]);
  assert.equal(de(f, "comisiones_bancarias").pct, null);
  const v = calcularFlujo([]);
  assert.deepEqual([v.saldoInicial, v.saldoFinal, v.diferencia, v.ultimaFecha], [0, 0, 0, null]);
});

test("concepto desconocido cae en otros de operación", () => {
  assert.equal(de(calcularFlujo([mov("2026-10-01", 10, 0, 90, "sin_documento", "inventado")]), "otros_operacion").monto, -10);
});

test("por mes: arrastra saldos y un mes sin movimientos conserva el saldo", () => {
  const movs = [mov("2026-09-30", 0, 100, 1100), mov("2026-10-15", 40, 0, 1060)];
  const [sep, oct, nov] = flujoPorMes(movs, [], [
    { desde: "2026-09-01", hasta: "2026-09-30" }, { desde: "2026-10-01", hasta: "2026-10-31" }, { desde: "2026-11-01", hasta: "2026-11-30" },
  ]);
  assert.deepEqual([sep.saldoInicial, sep.saldoFinal], [1000, 1100]);
  assert.deepEqual([oct.saldoInicial, oct.saldoFinal, oct.diferencia], [1100, 1060, 0]);
  assert.deepEqual([nov.saldoInicial, nov.saldoFinal, de(nov, "flujo_neto").monto], [1060, 1060, 0]);
});

test("visibles: opcionales solo si tienen monto en alguna columna", () => {
  const a = calcularFlujo([mov("2026-10-01", 0, 10, 10, "sin_documento", "deposito_efectivo")]), b = calcularFlujo([]);
  const v = visibles([a, b]);
  assert.equal(v.has("deposito_efectivo"), true);
  assert.equal(v.has("apertura"), false);
  assert.equal(v.has("renta"), true);
  assert.equal(v.has("flujo_neto"), true);
});
