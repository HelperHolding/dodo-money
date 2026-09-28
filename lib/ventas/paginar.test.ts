import { test } from "node:test";
import assert from "node:assert/strict";
import { leerTodo, TAMANO_PAGINA } from "./paginar.ts";

/** Una "tabla" de n renglones que responde por rangos como Supabase (.range(desde, hasta)). */
const tabla = (n: number) => {
  const pedidos: [number, number][] = [];
  const pagina = async (desde: number, hasta: number) => {
    pedidos.push([desde, hasta]);
    return { data: Array.from({ length: Math.max(0, Math.min(n, hasta + 1) - desde) }, (_, i) => desde + i), error: null };
  };
  return { pagina, pedidos };
};

test("leerTodo junta todas las páginas", async () => {
  const t = tabla(2 * TAMANO_PAGINA + 5);
  const filas = await leerTodo(t.pagina);
  assert.equal(filas.length, 2 * TAMANO_PAGINA + 5);
  assert.equal(filas.at(-1), 2 * TAMANO_PAGINA + 4);
  assert.deepEqual(t.pedidos, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("leerTodo con exactamente una página pide una más y termina", async () => {
  const t = tabla(TAMANO_PAGINA);
  assert.equal((await leerTodo(t.pagina)).length, TAMANO_PAGINA);
  assert.equal(t.pedidos.length, 2);
});

test("leerTodo sin datos y con error", async () => {
  assert.deepEqual(await leerTodo(tabla(0).pagina), []);
  await assert.rejects(leerTodo(async () => ({ data: null, error: { message: "sin permiso" } })), /No se pudieron cargar las ventas: sin permiso/);
});
