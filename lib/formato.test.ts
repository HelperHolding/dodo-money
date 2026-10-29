import { test } from "node:test";
import assert from "node:assert/strict";
import { decimal, diaYNumero, fechaConAnio, fechaMX, fechaTexto, hoyCalendarioMX, hoyMX, numeroCorto, pesosCortos, pesosRedondos, porcentaje, rangoDiaMX } from "./formato.ts";

test("decimal acepta punto o coma", () => {
  assert.equal(decimal("0,5"), 0.5);
  assert.equal(decimal("18.5"), 18.5);
  assert.equal(decimal(" 2 "), 2);
});

test("decimal devuelve NaN si no hay número", () => {
  assert.ok(Number.isNaN(decimal("")));
  assert.ok(Number.isNaN(decimal(null)));
  assert.ok(Number.isNaN(decimal("abc")));
});

test("numeroCorto muestra hasta tres decimales", () => {
  assert.equal(numeroCorto(0.5), "0.5");
  assert.equal(numeroCorto(2), "2");
  assert.equal(numeroCorto(1.23456), "1.235");
});

test("hoyMX es el día operativo: hasta las 3:59 sigue siendo el día anterior", () => {
  assert.equal(hoyMX(new Date("2026-09-26T00:30:00-06:00")), "2026-09-25");
  assert.equal(hoyMX(new Date("2026-09-26T03:59:00-06:00")), "2026-09-25");
  assert.equal(hoyMX(new Date("2026-09-26T04:00:00-06:00")), "2026-09-26");
});

test("rangoDiaMX va de las 4:00 a las 4:00 del día siguiente, hora de Ciudad de México", () => {
  assert.deepEqual(rangoDiaMX("2026-09-25"), {
    desde: new Date("2026-09-25T04:00:00-06:00").toISOString(),
    hasta: new Date("2026-09-26T04:00:00-06:00").toISOString(),
  });
});

test("fechaTexto muestra día de la semana, día y mes", () => {
  const t = fechaTexto("2026-09-25");
  assert.match(t, /^vie/);
  assert.match(t, /25/);
  assert.match(t, /sep/);
});

test("fechaConAnio agrega el año para fechas que cruzan de un año a otro", () => {
  assert.equal(fechaConAnio("2026-10-29"), "jue 29 de oct de 2026");
  assert.equal(fechaConAnio("2027-10-29"), "vie 29 de oct de 2027");
});

test("porcentaje", () => {
  assert.equal(porcentaje(0.3421), "34.2 %");
  assert.equal(porcentaje(0), "0.0 %");
  assert.equal(porcentaje(null), "—");
});

test("pesosRedondos: sin centavos, para los indicadores", () => {
  assert.equal(pesosRedondos(53454.4), "$53,454");
  assert.equal(pesosRedondos(232.6), "$233");
});

test("diaYNumero: rótulo corto para las barras", () => {
  assert.equal(diaYNumero("2026-09-25"), "vie 25");
});

test("pesosCortos: venta de un día en poco espacio", () => {
  assert.equal(pesosCortos(9649), "$9.6k");
  assert.equal(pesosCortos(12825), "$12.8k");
  assert.equal(pesosCortos(10000), "$10k");
  assert.equal(pesosCortos(950), "$950");
  assert.equal(pesosCortos(1250000), "$1.3M");
});

test("fecha de calendario en México: cambia a medianoche, no a las 4:00", () => {
  // 1 oct 02:30 en México = 1 oct 08:30 UTC: ya es 1 de octubre (el día operativo sigue siendo el 30).
  assert.equal(hoyCalendarioMX(new Date("2026-10-01T08:30:00Z")), "2026-10-01");
  assert.equal(hoyMX(new Date("2026-10-01T08:30:00Z")), "2026-09-30");
  // 30 sep 23:59 en México = 1 oct 05:59 UTC.
  assert.equal(hoyCalendarioMX(new Date("2026-10-01T05:59:00Z")), "2026-09-30");
});

test("fecha en México de un registro con hora (después de las 18:00 en UTC ya es otro día)", () => {
  assert.equal(fechaMX("2026-10-01T01:30:00+00:00"), "2026-09-30");
  assert.equal(fechaMX("2026-10-01T12:00:00Z"), "2026-10-01");
  assert.equal(fechaMX("2026-10-01T06:00:00.123456+00:00"), "2026-10-01");
});
