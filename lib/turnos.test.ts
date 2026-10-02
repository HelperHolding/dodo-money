import { test } from "node:test";
import assert from "node:assert/strict";
import { repartirGastos, resumenDia, resumenTurno } from "./turnos.ts";

const mat = { id: "m", abierto_en: "2026-10-01T14:00:00Z", cerrado_en: "2026-10-01T22:00:00Z" };
const ves = { id: "v", abierto_en: "2026-10-01T22:00:00Z", cerrado_en: null };

test("repartirGastos asigna cada gasto al turno abierto a esa hora", () => {
  const gastos = [
    { id: "antes", creado_en: "2026-10-01T13:59:59Z" },
    { id: "g1", creado_en: "2026-10-01T15:00:00Z" },
    { id: "cambio", creado_en: "2026-10-01T22:00:00Z" },
    { id: "g2", creado_en: "2026-10-02T03:00:00Z" },
  ];
  const r = repartirGastos([mat, ves], gastos, new Date("2026-10-02T04:00:00Z"));
  assert.deepEqual(r.porTurno.get("m")?.map((g) => g.id), ["g1"]);
  // Justo en el cambio de turno cuenta para el que abre.
  assert.deepEqual(r.porTurno.get("v")?.map((g) => g.id), ["cambio", "g2"]);
  assert.deepEqual(r.fuera.map((g) => g.id), ["antes"]);
});

test("repartirGastos: un turno abierto llega hasta ahora, no más", () => {
  const r = repartirGastos([ves], [{ id: "futuro", creado_en: "2026-10-02T05:00:00Z" }], new Date("2026-10-02T04:00:00Z"));
  assert.deepEqual(r.porTurno.get("v"), []);
  assert.deepEqual(r.fuera.map((g) => g.id), ["futuro"]);
});

test("resumenTurno: diferencia del cierre, arqueos descuadrados y movimientos confirmados por tipo", () => {
  const r = resumenTurno(
    [
      { momento: "inicio", diferencia: 0 },
      { momento: "traspaso", diferencia: "-20.004" },
      { momento: "cierre", diferencia: "-50" },
    ],
    [
      { tipo: "retiro_boveda", estado: "confirmado", monto: 3000 },
      { tipo: "retiro_boveda", estado: "confirmado", monto: "1500.5" },
      { tipo: "retiro_boveda", estado: "pendiente", monto: 999 },
      { tipo: "apertura", estado: "rechazado", monto: 999 },
      { tipo: "apertura", estado: "confirmado", monto: 2000 },
    ],
  );
  assert.equal(r.diferenciaCierre, -50);
  assert.equal(r.descuadrados, 2);
  assert.equal(r.movimientos, 5);
  assert.equal(r.sinConfirmar, 1);
  assert.deepEqual(r.confirmadoPorTipo, { retiro_boveda: 4500.5, apertura: 2000 });
  assert.equal(r.alerta, true);
});

test("resumenTurno sin cierre ni movimientos", () => {
  const r = resumenTurno([{ momento: "inicio", diferencia: "0.001" }], []);
  assert.equal(r.diferenciaCierre, null);
  assert.equal(r.descuadrados, 0);
  assert.deepEqual(r.confirmadoPorTipo, {});
  assert.equal(r.alerta, false);
});

test("resumenDia suma las diferencias de cierre de los turnos", () => {
  const a = resumenTurno([{ momento: "cierre", diferencia: -50 }], []);
  const b = resumenTurno([{ momento: "cierre", diferencia: 20.25 }], []);
  const c = resumenTurno([], [{ tipo: "apertura", estado: "pendiente", monto: 1 }]);
  assert.deepEqual(resumenDia([a, b, c]), { diferencia: -29.75, turnos: 3, abiertos: 1, conAlerta: 3 });
});
