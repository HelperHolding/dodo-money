import { test } from "node:test";
import assert from "node:assert/strict";
import { confirmarVisible } from "./previa.ts";

test("confirmarVisible: previa nueva sí, archivo cambiado después no, previa siguiente sí", () => {
  assert.equal(confirmarVisible(null, "", null), false);
  assert.equal(confirmarVisible("1 nuevo", "A", null), true);
  assert.equal(confirmarVisible("1 nuevo", "A", "A"), false);
  assert.equal(confirmarVisible("2 nuevos", "B", "A"), true);
});
