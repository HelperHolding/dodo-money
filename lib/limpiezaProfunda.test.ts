import { test } from "node:test";
import assert from "node:assert/strict";
import { areaDelDia, cicloDeFecha, diaSemanaISO, semanaISO } from "./limpiezaProfunda.ts";

const areas = [
  { semana: 1 as const, dia_semana: 1, area: "Horno (parte de arriba)" },
  { semana: 2 as const, dia_semana: 1, area: "Horno (parte de abajo)" },
  { semana: 1 as const, dia_semana: 3, area: "Cocina" },
  { semana: 1 as const, dia_semana: 5, area: "Fregadero de fregonas y almacén" },
];

test("semanaISO y día de la semana", () => {
  assert.equal(semanaISO("2026-09-21"), 39);
  assert.equal(semanaISO("2026-09-28"), 40);
  assert.equal(semanaISO("2026-01-01"), 1);
  assert.equal(diaSemanaISO("2026-09-28"), 1);
  assert.equal(diaSemanaISO("2026-10-04"), 7);
});

test("semanas impares usan la tabla 1 y pares la tabla 2", () => {
  assert.deepEqual(cicloDeFecha("2026-09-21"), { semana: 1, dia: 1 });
  assert.deepEqual(cicloDeFecha("2026-09-28"), { semana: 2, dia: 1 });
  assert.equal(areaDelDia(areas, "2026-09-21"), "Horno (parte de arriba)");
  assert.equal(areaDelDia(areas, "2026-09-28"), "Horno (parte de abajo)");
  assert.equal(areaDelDia(areas, "2026-09-23"), "Cocina");
});

test("cambio de año: 2026 tiene 53 semanas y el 1 de enero de 2027 cae en la tabla 1", () => {
  assert.equal(semanaISO("2027-01-01"), 53);
  assert.deepEqual(cicloDeFecha("2027-01-01"), { semana: 1, dia: 5 });
  assert.equal(areaDelDia(areas, "2027-01-01"), "Fregadero de fregonas y almacén");
  assert.deepEqual(cicloDeFecha("2027-01-04"), { semana: 1, dia: 1 });
});

test("sin área para ese día devuelve null", () => {
  assert.equal(areaDelDia(areas, "2026-09-22"), null);
});
