import { test } from "node:test";
import assert from "node:assert/strict";
import { esCorporativo, puedeAbrirTurno, puedeGestionar, puedeSupervisar } from "./roles.ts";

test("corporativo solo consulta: no abre turno, no supervisa, no gestiona", () => {
  assert.equal(esCorporativo("corporativo"), true);
  assert.equal(puedeAbrirTurno("corporativo"), false);
  assert.equal(puedeSupervisar("corporativo"), false);
  assert.equal(puedeGestionar("corporativo"), false);
});

test("los roles de sucursal conservan sus permisos", () => {
  assert.equal(puedeAbrirTurno("cajero"), false);
  assert.equal(puedeSupervisar("cajero"), false);
  assert.equal(puedeAbrirTurno("encargado"), true);
  assert.equal(puedeSupervisar("encargado"), true);
  assert.equal(puedeGestionar("encargado"), false);
  for (const rol of ["gerente", "admin"] as const) {
    assert.equal(puedeAbrirTurno(rol), true);
    assert.equal(puedeSupervisar(rol), true);
    assert.equal(puedeGestionar(rol), true);
    assert.equal(esCorporativo(rol), false);
  }
});
