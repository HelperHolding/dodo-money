import { test } from "node:test";
import assert from "node:assert/strict";
import { alElegirDia, diasEntreFechas, elegirDia, mesDe, moverMes, periodosRapidos, rangoElegido, semanasDelMes, ventaDelRango } from "./calendario.ts";

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

test("alElegirDia: el primer toque solo marca; el segundo carga el rango sin botón", () => {
  const cargado = { inicio: "2026-10-09", fin: "2026-10-15" };
  const primero = alElegirDia(cargado, "2026-10-12", 92);
  assert.deepEqual(primero, { sel: { inicio: "2026-10-12", fin: null }, cargar: null, excede: false });
  const segundo = alElegirDia(primero.sel, "2026-10-05", 92);
  assert.deepEqual(segundo.cargar, { desde: "2026-10-05", hasta: "2026-10-12" });
  assert.deepEqual(segundo.sel, { inicio: "2026-10-05", fin: "2026-10-12" });
});

test("alElegirDia: doble toque en el mismo día carga solo ese día", () => {
  const primero = alElegirDia({ inicio: null, fin: null }, "2026-10-12", 92);
  assert.equal(primero.cargar, null);
  assert.deepEqual(alElegirDia(primero.sel, "2026-10-12", 92).cargar, { desde: "2026-10-12", hasta: "2026-10-12" });
});

test("alElegirDia: un rango de más días que el máximo no carga y conserva el primer día", () => {
  const primero = alElegirDia({ inicio: null, fin: null }, "2026-10-12", 7);
  const largo = alElegirDia(primero.sel, "2026-10-30", 7);
  assert.deepEqual(largo, { sel: { inicio: "2026-10-12", fin: null }, cargar: null, excede: true });
  // Justo en el máximo sí carga.
  assert.deepEqual(alElegirDia(primero.sel, "2026-10-18", 7).cargar, { desde: "2026-10-12", hasta: "2026-10-18" });
});

test("periodosRapidos: hoy, últimos 7 días contando hoy y lo que va del mes", () => {
  assert.deepEqual(periodosRapidos("2026-10-28"), [
    { clave: "hoy", etiqueta: "Hoy", rango: { desde: "2026-10-28", hasta: "2026-10-28" } },
    { clave: "semana", etiqueta: "Semana", rango: { desde: "2026-10-22", hasta: "2026-10-28" } },
    { clave: "mes", etiqueta: "Mes", rango: { desde: "2026-10-01", hasta: "2026-10-28" } },
  ]);
  // La semana cruza al mes anterior; el primero del mes, "Mes" es solo ese día.
  const primero = periodosRapidos("2026-11-01");
  assert.deepEqual(primero[1].rango, { desde: "2026-10-26", hasta: "2026-11-01" });
  assert.deepEqual(primero[2].rango, { desde: "2026-11-01", hasta: "2026-11-01" });
  assert.equal(diasEntreFechas(periodosRapidos("2026-03-03")[1].rango), 7);
});
