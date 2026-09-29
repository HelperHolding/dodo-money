import { test } from "node:test";
import assert from "node:assert/strict";
import { diasEntreFechas, elegirDia, mesDe, moverMes, rangoElegido, semanasDelMes, ventaDelRango } from "./calendario.ts";

test("semanasDelMes: semanas de lunes a domingo con huecos al inicio y al final", () => {
  const sep = semanasDelMes(2026, 9);
  assert.equal(sep.length, 5);
  assert.equal(sep[0][0], null);
  assert.equal(sep[0][1], "2026-09-01");
  assert.equal(sep[4][2], "2026-09-30");
  assert.equal(sep[4][3], null);
  assert.ok(sep.every((s) => s.length === 7));
  const feb = semanasDelMes(2027, 2);
  assert.equal(feb[0][0], "2027-02-01");
  assert.equal(feb.flat().filter(Boolean).length, 28);
});

test("moverMes cruza años", () => {
  assert.deepEqual(moverMes({ anio: 2026, mes: 12 }, 1), { anio: 2027, mes: 1 });
  assert.deepEqual(moverMes({ anio: 2026, mes: 1 }, -1), { anio: 2025, mes: 12 });
  assert.deepEqual(mesDe("2026-09-25"), { anio: 2026, mes: 9 });
});

test("elegirDia: primer toque inicio, segundo fin (se acomodan), tercero empieza de nuevo", () => {
  let s = elegirDia({ inicio: null, fin: null }, "2026-09-25");
  assert.deepEqual(s, { inicio: "2026-09-25", fin: null });
  s = elegirDia(s, "2026-09-21");
  assert.deepEqual(s, { inicio: "2026-09-21", fin: "2026-09-25" });
  s = elegirDia(s, "2026-09-10");
  assert.deepEqual(s, { inicio: "2026-09-10", fin: null });
  assert.deepEqual(elegirDia(s, "2026-09-10"), { inicio: "2026-09-10", fin: "2026-09-10" });
});

test("rangoElegido: un solo toque es un solo día", () => {
  assert.equal(rangoElegido({ inicio: null, fin: null }), null);
  assert.deepEqual(rangoElegido({ inicio: "2026-09-10", fin: null }), { desde: "2026-09-10", hasta: "2026-09-10" });
  assert.deepEqual(rangoElegido({ inicio: "2026-09-10", fin: "2026-09-12" }), { desde: "2026-09-10", hasta: "2026-09-12" });
});

test("diasEntreFechas cuenta ambos extremos", () => {
  assert.equal(diasEntreFechas({ desde: "2026-09-21", hasta: "2026-09-26" }), 6);
  assert.equal(diasEntreFechas({ desde: "2026-02-27", hasta: "2026-03-02" }), 4);
});

test("ventaDelRango suma los días con venta dentro del rango", () => {
  const venta = { "2026-09-20": 100, "2026-09-21": 9649, "2026-09-22": 4092, "2026-09-27": 8900 };
  assert.deepEqual(ventaDelRango(venta, { desde: "2026-09-21", hasta: "2026-09-26" }), { total: 13741, diasConVenta: 2 });
  assert.deepEqual(ventaDelRango(venta, { desde: "2026-01-01", hasta: "2026-01-31" }), { total: 0, diasConVenta: 0 });
});
