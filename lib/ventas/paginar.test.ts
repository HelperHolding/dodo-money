import { test } from "node:test";
import assert from "node:assert/strict";
import { conReintento, esFallaPasajera, leerTodo, TAMANO_PAGINA } from "./paginar.ts";

const sinEspera = async () => {};
const TIEMPO = { message: "canceling statement due to statement timeout", code: "57014" };

test("esFallaPasajera: límite de tiempo, red y conexión sí; permisos y columnas no", () => {
  assert.equal(esFallaPasajera(TIEMPO), true);
  assert.equal(esFallaPasajera({ message: "TypeError: fetch failed" }), true);
  assert.equal(esFallaPasajera({ message: "x", code: "08006" }), true);
  assert.equal(esFallaPasajera({ message: "Could not connect", code: "PGRST001" }), true);
  assert.equal(esFallaPasajera({ message: "permission denied for table ventas_dia", code: "42501" }), false);
  assert.equal(esFallaPasajera({ message: "column x does not exist", code: "42703" }), false);
});

test("leerTodo repite una página que tardó demasiado y sigue desde ahí", async () => {
  const pedidos: number[] = [], esperas: number[] = [];
  let fallas = 2;
  const filas = await leerTodo(async (desde) => {
    pedidos.push(desde);
    if (desde === TAMANO_PAGINA && fallas-- > 0) return { data: null, error: TIEMPO };
    return { data: Array.from({ length: desde === 0 ? TAMANO_PAGINA : 3 }, (_, i) => desde + i), error: null };
  }, [400, 1200], async (ms) => { esperas.push(ms); });
  assert.equal(filas.length, TAMANO_PAGINA + 3);
  assert.deepEqual(pedidos, [0, TAMANO_PAGINA, TAMANO_PAGINA, TAMANO_PAGINA]);
  assert.deepEqual(esperas, [400, 1200]);
});

test("leerTodo se rinde tras 3 intentos y no repite errores que no son pasajeros", async () => {
  let n = 0;
  await assert.rejects(leerTodo(async () => { n++; return { data: null, error: TIEMPO }; }, [1, 1], sinEspera), /statement timeout/);
  assert.equal(n, 3);
  n = 0;
  await assert.rejects(leerTodo(async () => { n++; return { data: null, error: { message: "sin permiso", code: "42501" } }; }, [1, 1], sinEspera), /sin permiso/);
  assert.equal(n, 1);
});

test("conReintento convierte una excepción de red en error y la repite", async () => {
  let n = 0;
  const r = await conReintento(async () => { if (n++ === 0) throw new TypeError("fetch failed"); return { data: 5, error: null }; }, [1], sinEspera);
  assert.deepEqual(r, { data: 5, error: null });
  assert.equal(n, 2);
});

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
