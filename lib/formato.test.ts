import { test } from "node:test";
import assert from "node:assert/strict";
import { decimal, hoyMX, numeroCorto, rangoDiaMX } from "./formato.ts";

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
