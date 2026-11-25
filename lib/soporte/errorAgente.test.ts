import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { describirError } from "./errorAgente.ts";

const apiError = (statusCode: number, responseBody: string) => Object.assign(new Error("Bad Request"), { name: "AI_APICallError", statusCode, responseBody });

test("error de Anthropic: código, tipo y mensaje del proveedor", () => {
  assert.equal(describirError(apiError(404, JSON.stringify({ type: "error", error: { type: "not_found_error", message: "model: claude-viejo" } }))),
    "AI_APICallError 404 not_found_error: model: claude-viejo");
  assert.equal(describirError(apiError(401, "no es json")), "AI_APICallError 401");
});

test("error envuelto en reintentos usa el último error", () => {
  const ultimo = apiError(529, JSON.stringify({ error: { type: "overloaded_error", message: "Overloaded" } }));
  assert.equal(describirError(Object.assign(new Error("x"), { name: "AI_RetryError", lastError: ultimo })), "AI_APICallError 529 overloaded_error: Overloaded");
});

test("errores propios y otros: solo el nombre o el mensaje corto propio", () => {
  assert.equal(describirError(new Error("sin-configuracion")), "sin-configuracion");
  assert.equal(describirError(Object.assign(new Error("texto largo del ticket"), { name: "TimeoutError" })), "TimeoutError");
  assert.equal(describirError("raro"), "desconocido");
});

test("el mensaje del proveedor se recorta y no trae saltos de línea", () => {
  const r = describirError(apiError(400, JSON.stringify({ error: { type: "invalid_request_error", message: "a\nb".padEnd(500, "x") } })));
  assert.ok(r.length <= 220); assert.doesNotMatch(r, /\n/);
});
