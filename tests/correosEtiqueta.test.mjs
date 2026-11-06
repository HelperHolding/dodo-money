import { test } from "node:test";
import assert from "node:assert/strict";
import { TODOS, etiquetaDeFormulario, opcionesEtiqueta } from "../lib/correos/etiqueta.ts";
test("etiqueta: toda la base es explícita y el campo vacío se rechaza", () => {
  assert.equal(etiquetaDeFormulario(TODOS), null);
  assert.equal(etiquetaDeFormulario("vip"), "vip");
  assert.equal(etiquetaDeFormulario(""), undefined);
  assert.equal(etiquetaDeFormulario("  "), undefined);
});
test("etiqueta: la de la campaña siempre es opción", () => {
  assert.deepEqual(opcionesEtiqueta(["a", "c"], "b"), ["a", "b", "c"]);
  assert.deepEqual(opcionesEtiqueta(["a"], "a"), ["a"]);
  assert.deepEqual(opcionesEtiqueta(["a"], null), ["a"]);
});
