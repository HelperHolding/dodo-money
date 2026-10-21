import { test } from "node:test";
import assert from "node:assert/strict";
import { ErrorDodo, tokenDeAcceso, type Almacen, type Guardado } from "./tokens.ts";

const AHORA = Date.parse("2026-10-20T18:00:00Z");
const vencido: Guardado = { refresh: "r1", access: "a1", access_expira: "2026-10-20T17:59:00Z", estado: "conectada" };

function almacen(lecturas: Guardado[], guardar: ({ error: string | null })[] = [{ error: null }]) {
  const llamadas = { guardar: 0, errores: [] as [string, boolean][], tomar: 0 };
  let i = 0, g = 0;
  const a: Almacen = {
    leer: async () => lecturas[Math.min(i++, lecturas.length - 1)],
    tomarRenovacion: async () => { llamadas.tomar++; return true; },
    guardar: async () => { llamadas.guardar++; return guardar[Math.min(g++, guardar.length - 1)]; },
    marcarError: async (m, r) => { llamadas.errores.push([m, r]); },
  };
  return { a, llamadas };
}
const opciones = { esperar: async () => {}, ahora: () => AHORA };
const nuevo = async () => ({ access_token: "a2", refresh_token: "r2", expires_in: 86_400 });

test("usa el token guardado si le quedan más de 5 minutos", async () => {
  const { a, llamadas } = almacen([{ ...vencido, access_expira: "2026-10-20T19:00:00Z" }]);
  assert.equal(await tokenDeAcceso(a, async () => { throw new Error("no debe renovar"); }, opciones), "a1");
  assert.equal(llamadas.tomar, 0);
});

test("si guardar el token nuevo falla una vez, reintenta y lo devuelve", async () => {
  const { a, llamadas } = almacen([vencido], [{ error: "red" }, { error: null }]);
  assert.equal(await tokenDeAcceso(a, nuevo, opciones), "a2");
  assert.equal(llamadas.guardar, 2);
  assert.deepEqual(llamadas.errores, []);
});

test("si guardar falla dos veces, lo avisa (sin marcar reconectar) y falla", async () => {
  const { a, llamadas } = almacen([vencido], [{ error: "red" }]);
  await assert.rejects(tokenDeAcceso(a, nuevo, opciones), /No se pudo guardar el token nuevo de Dodo IS \(red\)/);
  assert.equal(llamadas.errores.length, 1);
  assert.equal(llamadas.errores[0][1], false);
});

test("invalid_grant porque otra sincronización ya renovó: usa el token nuevo y no marca reconectar", async () => {
  const otro: Guardado = { refresh: "r9", access: "a9", access_expira: "2026-10-21T18:00:00Z", estado: "conectada" };
  const { a, llamadas } = almacen([vencido, otro]);
  const token = await tokenDeAcceso(a, async () => { throw new ErrorDodo("Dodo IS no dio el token (400 invalid_grant).", true); }, opciones);
  assert.equal(token, "a9");
  assert.deepEqual(llamadas.errores, []);
});

test("invalid_grant con el mismo token guardado: marca reconectar", async () => {
  const { a, llamadas } = almacen([vencido, vencido]);
  await assert.rejects(tokenDeAcceso(a, async () => { throw new ErrorDodo("Dodo IS no dio el token (400 invalid_grant).", true); }, opciones), /invalid_grant/);
  assert.deepEqual(llamadas.errores.map((e) => e[1]), [true]);
});

test("conexión que pide reconectar: no intenta renovar", async () => {
  const { a, llamadas } = almacen([{ ...vencido, estado: "requiere_reconectar" }]);
  await assert.rejects(tokenDeAcceso(a, nuevo, opciones), /reconectar/);
  assert.equal(llamadas.tomar, 0);
});
