import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acumuladoDe, anteriorDe, diasEntre, elegirPeriodo, esSemana, etiquetaSemana, mesesDelRango, paramsPeriodo,
  periodoMes, periodoSemana, rangoSemana, rangosPorMes, semanaISO, semanasDesde,
} from "./periodo.ts";

const INICIO = "2026-10-01";

test("semanaISO: lunes a domingo; fin y principio de año", () => {
  assert.equal(semanaISO("2026-10-05"), "2026-W41");
  assert.equal(semanaISO("2026-10-11"), "2026-W41");
  assert.equal(semanaISO("2026-10-04"), "2026-W40");
  assert.equal(semanaISO("2027-01-01"), "2026-W53");
  assert.equal(semanaISO("2027-01-04"), "2027-W01");
  assert.equal(semanaISO("2024-12-30"), "2025-W01");
});

test("rangoSemana y esSemana", () => {
  assert.deepEqual(rangoSemana("2026-W41"), { desde: "2026-10-05", hasta: "2026-10-11" });
  assert.deepEqual(rangoSemana("2026-W53"), { desde: "2026-12-28", hasta: "2027-01-03" });
  assert.deepEqual(rangoSemana("2025-W01"), { desde: "2024-12-30", hasta: "2025-01-05" });
  assert.equal(esSemana("2026-W53"), true);
  assert.equal(esSemana("2027-W53"), false);
  assert.equal(esSemana("basura"), false);
});

test("mesesDelRango: fracción de cada mes; febrero bisiesto; vacío", () => {
  assert.deepEqual(mesesDelRango("2026-09-28", "2026-10-04"), [
    { mes: "2026-09", dias: 3, diasMes: 30, fraccion: 0.1, fin: "2026-09-30" },
    { mes: "2026-10", dias: 4, diasMes: 31, fraccion: 4 / 31, fin: "2026-10-31" },
  ]);
  assert.deepEqual(mesesDelRango("2028-02-01", "2028-02-29"), [{ mes: "2028-02", dias: 29, diasMes: 29, fraccion: 1, fin: "2028-02-29" }]);
  assert.deepEqual(mesesDelRango("2026-10-08", "2026-10-07"), []);
  const suma = [...mesesDelRango("2026-10-01", "2026-10-07"), ...mesesDelRango("2026-10-08", "2026-10-31")].reduce((t, m) => t + m.fraccion, 0);
  assert.ok(Math.abs(suma - 1) < 1e-12);
  assert.equal(diasEntre("2026-10-01", "2026-10-07"), 7);
  assert.equal(diasEntre("2026-10-08", "2026-10-07"), 0);
});

test("periodo en curso se corta en ayer; vacío si no hay días cerrados", () => {
  assert.deepEqual(periodoSemana("2026-W41", "2026-10-12"),
    { tipo: "semana", clave: "2026-W41", desde: "2026-10-05", hasta: "2026-10-11", finNominal: "2026-10-11", titulo: "Semana 41 · 5 al 11 oct 2026", vacio: false });
  assert.equal(periodoSemana("2026-W41", "2026-10-08").hasta, "2026-10-07");
  assert.equal(periodoSemana("2026-W41", "2026-10-11").hasta, "2026-10-10");
  assert.equal(periodoSemana("2026-W41", "2026-10-05").vacio, true);
  assert.equal(periodoSemana("2026-W40", "2026-10-12").titulo, "Semana 40 · 28 sep al 4 oct 2026");
  assert.equal(periodoSemana("2026-W53", "2027-02-01").titulo, "Semana 53 · 28 dic 2026 al 3 ene 2027");
  assert.deepEqual(periodoMes("2026-10", "2026-10-07"),
    { tipo: "mes", clave: "2026-10", desde: "2026-10-01", hasta: "2026-10-06", finNominal: "2026-10-31", titulo: "Octubre 2026", vacio: false });
  assert.equal(periodoMes("2026-09", "2026-10-07").hasta, "2026-09-30");
  assert.equal(periodoMes("2026-10", "2026-10-01").vacio, true);
});

test("etiquetas y lista de semanas", () => {
  assert.equal(etiquetaSemana("2026-W41"), "Sem 41 · 5–11 oct");
  assert.equal(etiquetaSemana("2026-W40"), "Sem 40 · 28 sep – 4 oct");
  assert.deepEqual(semanasDesde(INICIO, "2026-10-14"), ["2026-W42", "2026-W41", "2026-W40"]);
});

test("elegirPeriodo: por defecto el de ayer; URL inválida cae al defecto", () => {
  assert.equal(elegirPeriodo({}, "2026-10-14", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({}, "2026-11-01", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({}, "2026-10-01", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({ mes: "2026-09" }, "2026-10-14", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({ mes: "2027-01" }, "2026-10-14", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({ periodo: "semana" }, "2026-10-12", INICIO).clave, "2026-W41");
  assert.equal(elegirPeriodo({ periodo: "semana", semana: "2026-W42" }, "2026-10-12", INICIO).vacio, true);
  for (const malo of ["2026-W50", "2026-W30", "basura"]) {
    assert.equal(elegirPeriodo({ periodo: "semana", semana: malo }, "2026-10-12", INICIO).clave, "2026-W41");
  }
  assert.deepEqual(paramsPeriodo(periodoSemana("2026-W41", "2026-10-12")), { periodo: "semana", semana: "2026-W41" });
  assert.deepEqual(paramsPeriodo(periodoMes("2026-10", "2026-10-12")), { periodo: "mes", mes: "2026-10" });
});

test("comparaciones: periodo anterior y acumulado", () => {
  assert.equal(anteriorDe(periodoSemana("2026-W41", "2026-10-14"), "2026-10-14").clave, "2026-W40");
  assert.equal(anteriorDe(periodoMes("2027-01", "2027-02-10"), "2027-02-10").clave, "2026-12");
  assert.deepEqual(acumuladoDe(periodoSemana("2026-W40", "2026-10-14"), INICIO), { desde: "2026-10-01", hasta: "2026-10-04" });
  assert.deepEqual(acumuladoDe(periodoSemana("2026-W45", "2026-11-14"), INICIO), { desde: "2026-11-01", hasta: "2026-11-08" });
  assert.deepEqual(acumuladoDe(periodoMes("2026-11", "2026-11-10"), INICIO), { desde: "2026-10-01", hasta: "2026-11-09" });
  assert.deepEqual(acumuladoDe(periodoMes("2027-02", "2027-03-10"), INICIO), { desde: "2027-01-01", hasta: "2027-02-28" });
});

test("nada antes del inicio del P&L: la semana 40 empieza el 1 de octubre", () => {
  const w40 = periodoSemana("2026-W40", "2026-10-12", INICIO);
  assert.deepEqual([w40.desde, w40.hasta, w40.titulo], ["2026-10-01", "2026-10-04", "Semana 40 · 1 al 4 oct 2026"]);
  assert.equal(elegirPeriodo({ periodo: "semana", semana: "2026-W40" }, "2026-10-12", INICIO).desde, "2026-10-01");
  assert.equal(elegirPeriodo({ periodo: "semana" }, "2026-10-05", INICIO).desde, "2026-10-01");
  assert.equal(anteriorDe(periodoSemana("2026-W41", "2026-10-14", INICIO), "2026-10-14", INICIO).desde, "2026-10-01");
  assert.equal(periodoSemana("2026-W41", "2026-10-14", INICIO).desde, "2026-10-05");
});

test("rangosPorMes: el acumulado se parte en un rango por mes", () => {
  assert.deepEqual(rangosPorMes({ desde: "2026-10-01", hasta: "2026-12-09" }), [
    { desde: "2026-10-01", hasta: "2026-10-31" }, { desde: "2026-11-01", hasta: "2026-11-30" }, { desde: "2026-12-01", hasta: "2026-12-09" },
  ]);
  assert.deepEqual(rangosPorMes({ desde: "2026-11-01", hasta: "2026-11-08" }), [{ desde: "2026-11-01", hasta: "2026-11-08" }]);
  assert.deepEqual(rangosPorMes({ desde: "2026-10-01", hasta: "2026-09-30" }), []);
});
