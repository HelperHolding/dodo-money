import { test } from "node:test";
import assert from "node:assert/strict";
import { leerPaginas } from "./paginas.ts";

const caja = { item: "caja", cantidad: 1 };

test("conserva líneas idénticas (dos cajas iguales en una entrega) y avanza por páginas", async () => {
  const paginas = [[caja, caja], [{ item: "queso", cantidad: 2 }]];
  const skips: number[] = [];
  const r = await leerPaginas(async (skip) => { skips.push(skip); const i = skips.length - 1; return { items: paginas[i], fin: i === 1 }; });
  assert.deepEqual(r, [caja, caja, { item: "queso", cantidad: 2 }]);
  assert.deepEqual(skips, [0, 2]);
});

test("página vacía termina; una API que repite la misma página es un error, no una suma doble", async () => {
  assert.deepEqual(await leerPaginas(async () => ({ items: [], fin: false })), []);
  await assert.rejects(leerPaginas(async () => ({ items: [caja, { item: "x", cantidad: 1 }], fin: false })), /repite páginas/);
});
