import { test } from "node:test";
import assert from "node:assert/strict";
import { decimal, numeroCorto } from "./formato.ts";

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
