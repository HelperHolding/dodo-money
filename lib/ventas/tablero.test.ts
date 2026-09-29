import { test } from "node:test";
import assert from "node:assert/strict";
import { cambioRelativo, diasConEtiqueta, indicadores, rebanadasDona } from "./tablero.ts";

test("cambioRelativo: fracción contra el anterior; null si no hay anterior o era cero", () => {
  assert.equal(cambioRelativo(110, 100)?.toFixed(2), "0.10");
  assert.equal(cambioRelativo(90, 100)?.toFixed(2), "-0.10");
  assert.equal(cambioRelativo(90, null), null);
  assert.equal(cambioRelativo(90, 0), null);
});

test("indicadores: venta, pedidos y ticket son buenos si suben; el costo % es bueno si baja y se mide en puntos", () => {
  const r = indicadores(
    { total: 53454, pedidos: 230, ticket: 232.4, costoPct: 0.338 },
    { total: 49450, pedidos: 220, ticket: 224.8, costoPct: 0.332 },
  );
  const por = Object.fromEntries(r.map((i) => [i.clave, i]));
  assert.deepEqual(r.map((i) => i.clave), ["venta", "pedidos", "ticket", "costo"]);
  assert.equal(por.venta.cambio?.toFixed(3), "0.081");
  assert.equal(por.venta.favorable, true);
  assert.equal(por.pedidos.favorable, true);
  assert.equal(por.costo.unidad, "puntos");
  assert.equal(por.costo.cambio?.toFixed(1), "0.6");
  assert.equal(por.costo.favorable, false);
});

test("indicadores sin periodo anterior o sin cambio", () => {
  const sin = indicadores({ total: 100, pedidos: 1, ticket: 100, costoPct: null }, null);
  assert.ok(sin.every((i) => i.cambio === null && i.favorable === null));
  const igual = indicadores({ total: 100, pedidos: 1, ticket: 100, costoPct: 0.3 }, { total: 100, pedidos: 1, ticket: 100, costoPct: 0.3 });
  assert.ok(igual.every((i) => i.cambio === 0 && i.favorable === null));
  const bajo = indicadores({ total: 80, pedidos: 1, ticket: 80, costoPct: 0.25 }, { total: 100, pedidos: 1, ticket: 100, costoPct: 0.3 });
  assert.equal(bajo[0].favorable, false);
  assert.equal(bajo[3].favorable, true);
});

test("rebanadasDona: fracciones que suman 1, en orden, sin rebanadas vacías", () => {
  const r = rebanadasDona([{ clave: "pizza", valor: 84 }, { clave: "postre", valor: 0 }, { clave: "snack", valor: 13 }, { clave: "bebida", valor: 3 }]);
  assert.deepEqual(r.map((x) => x.clave), ["pizza", "snack", "bebida"]);
  assert.deepEqual(r.map((x) => x.fraccion), [0.84, 0.13, 0.03]);
  assert.deepEqual(r.map((x) => Number(x.inicio.toFixed(2))), [0, 0.84, 0.97]);
  assert.deepEqual(rebanadasDona([{ clave: "pizza", valor: 0 }]), []);
});

test("diasConEtiqueta: hasta 7 rótulos repartidos, siempre el último", () => {
  assert.deepEqual(diasConEtiqueta(6), [true, true, true, true, true, true]);
  const treinta = diasConEtiqueta(30);
  assert.equal(treinta.length, 30);
  assert.ok(treinta.filter(Boolean).length <= 8);
  assert.equal(treinta[0], true);
  assert.equal(treinta[29], true);
  assert.deepEqual(diasConEtiqueta(0), []);
});
