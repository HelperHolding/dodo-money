import { test } from "node:test";
import assert from "node:assert/strict";
import { diaOperativoMX, estadoCasilla, estadoFranja, franjasAbiertas, relojMX, siguienteFranja } from "./franjas.ts";

/** Instante a partir de una hora de Ciudad de México. */
const mx = (s: string) => new Date(`${s}-06:00`);

test("relojMX convierte a hora de Ciudad de México", () => {
  assert.deepEqual(relojMX(mx("2026-09-25T12:30:00")), { fecha: "2026-09-25", minutos: 750 });
});

test("a media hora solo está abierta la hora actual", () => {
  assert.deepEqual(franjasAbiertas([10, 11, 12, 13], mx("2026-09-25T12:30:00")), [{ fecha: "2026-09-25", hora: 12 }]);
});

test("en los primeros 10 minutos sigue abierta la hora anterior", () => {
  assert.deepEqual(franjasAbiertas([12, 13], mx("2026-09-25T13:09:00")), [
    { fecha: "2026-09-25", hora: 13 },
    { fecha: "2026-09-25", hora: 12 },
  ]);
});

test("al minuto 10 la hora anterior ya cerró", () => {
  assert.deepEqual(franjasAbiertas([12, 13], mx("2026-09-25T13:10:00")), [{ fecha: "2026-09-25", hora: 13 }]);
});

test("solo devuelve horas del checklist", () => {
  assert.deepEqual(franjasAbiertas([12, 13, 14, 15, 16, 17], mx("2026-09-25T18:05:00")), [{ fecha: "2026-09-25", hora: 17 }]);
  assert.deepEqual(franjasAbiertas([12, 13], mx("2026-09-25T09:00:00")), []);
});

test("la hora de las 23:00 se registra a las 00:05 con la fecha del día anterior", () => {
  assert.deepEqual(franjasAbiertas([18, 19, 20, 21, 22, 23], mx("2026-09-26T00:05:00")), [{ fecha: "2026-09-25", hora: 23 }]);
});

test("estadoFranja marca futura, abierta y cerrada", () => {
  const f = { fecha: "2026-09-25", hora: 12 };
  assert.equal(estadoFranja(f, mx("2026-09-25T11:59:00")), "futura");
  assert.equal(estadoFranja(f, mx("2026-09-25T12:00:00")), "abierta");
  assert.equal(estadoFranja(f, mx("2026-09-25T13:09:59")), "abierta");
  assert.equal(estadoFranja(f, mx("2026-09-25T13:10:00")), "cerrada");
});

test("estadoCasilla prefiere el registro y si no hay, usa el horario", () => {
  const f = { fecha: "2026-09-25", hora: 12 };
  assert.equal(estadoCasilla("alerta", f, mx("2026-09-25T20:00:00")), "alerta");
  assert.equal(estadoCasilla(undefined, f, mx("2026-09-25T12:30:00")), "abierta");
  assert.equal(estadoCasilla(undefined, f, mx("2026-09-25T20:00:00")), "falta");
  assert.equal(estadoCasilla(undefined, f, mx("2026-09-25T08:00:00")), "futura");
});

test("diaOperativoMX cambia a las 4:00", () => {
  assert.equal(diaOperativoMX(mx("2026-09-26T00:05:00")), "2026-09-25");
  assert.equal(diaOperativoMX(mx("2026-09-26T03:59:00")), "2026-09-25");
  assert.equal(diaOperativoMX(mx("2026-09-26T04:00:00")), "2026-09-26");
});

test("siguienteFranja da la próxima hora del checklist o null", () => {
  assert.equal(siguienteFranja([10, 11, 12], mx("2026-09-25T09:30:00")), 10);
  assert.equal(siguienteFranja([12, 13], mx("2026-09-25T12:30:00")), 13);
  assert.equal(siguienteFranja([12, 13], mx("2026-09-25T13:30:00")), null);
});
