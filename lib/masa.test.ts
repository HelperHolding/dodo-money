import { test } from "node:test";
import assert from "node:assert/strict";
import { bolasNorma, motivoComentario, temperaturaEnNorma, temperaturaValida } from "./masa.ts";

const n = { hora: 13, bolas_25: 4, bolas_30: 2, bolas_35: 2 };

test("bolasNorma usa la columna de la temperatura del área", () => {
  assert.equal(bolasNorma(n, 25), 4);
  assert.equal(bolasNorma(n, 30), 2);
  assert.equal(bolasNorma(n, 35), 2);
});

test("temperaturaEnNorma incluye 12 y 22 °C", () => {
  assert.equal(temperaturaEnNorma(12), true);
  assert.equal(temperaturaEnNorma(22), true);
  assert.equal(temperaturaEnNorma(11.9), false);
  assert.equal(temperaturaEnNorma(22.1), false);
});

test("temperaturaValida rechaza lecturas absurdas", () => {
  assert.equal(temperaturaValida(18), true);
  assert.equal(temperaturaValida(180), false);
  assert.equal(temperaturaValida(-20), false);
  assert.equal(temperaturaValida(Number.NaN), false);
});

test("motivoComentario explica por qué el comentario es obligatorio", () => {
  assert.equal(motivoComentario(n, 25, 4, 18), null);
  assert.match(motivoComentario(n, 25, 4, 23) ?? "", /fuera de 12 a 22 °C/);
  assert.match(motivoComentario(n, 30, 4, 18) ?? "", /sacaste 4 bolas y la norma es 2/);
});
