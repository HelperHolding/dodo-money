import { test } from "node:test";
import assert from "node:assert/strict";
import { errorDeContrasena, MIN_CARACTERES } from "./contrasena.ts";

test("contraseña nueva válida", () => {
  assert.equal(errorDeContrasena("temporal1", "pizza-zapopan", "pizza-zapopan"), null);
});

test("faltan datos", () => {
  assert.match(errorDeContrasena("", "pizza-zapopan", "pizza-zapopan") ?? "", /actual/);
  assert.match(errorDeContrasena("temporal1", "", "") ?? "", /nueva/);
});

test("mínimo de caracteres", () => {
  assert.equal(MIN_CARACTERES, 8);
  assert.match(errorDeContrasena("temporal1", "corta7!", "corta7!") ?? "", /8 caracteres/);
});

test("las dos veces igual", () => {
  assert.match(errorDeContrasena("temporal1", "pizza-zapopan", "pizza-zapopa") ?? "", /no coinciden/);
});

test("distinta de la actual", () => {
  assert.match(errorDeContrasena("pizza-zapopan", "pizza-zapopan", "pizza-zapopan") ?? "", /distinta/);
});
