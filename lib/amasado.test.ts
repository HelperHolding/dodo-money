import { test } from "node:test";
import assert from "node:assert/strict";
import { fueraDeRango, motivoAmasado } from "./amasado.ts";

const bien = { masa: 25, sala: 22, harina: 20, agua: 15 };

test("dentro de rango no pide comentario (bordes incluidos)", () => {
  assert.deepEqual(fueraDeRango(bien), []);
  assert.deepEqual(fueraDeRango({ masa: 24, sala: 16, harina: 26, agua: 9 }), []);
  assert.equal(motivoAmasado(bien), null);
});

test("cada temperatura fuera de rango se reporta, la masa primero", () => {
  assert.deepEqual(fueraDeRango({ ...bien, masa: 28, agua: 22 }), ["masa", "agua"]);
  assert.equal(motivoAmasado({ ...bien, masa: 28 }), "la masa está a 28 °C, fuera de 24 a 26 °C");
  assert.equal(motivoAmasado({ ...bien, sala: 30 }), "la sala está a 30 °C, fuera de 16 a 26 °C");
  assert.equal(motivoAmasado({ ...bien, agua: 5 }), "el agua está a 5 °C, fuera de 9 a 20 °C");
});
