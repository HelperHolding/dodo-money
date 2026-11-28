import { test } from "node:test";
import assert from "node:assert/strict";
import { codigoError, debeReintentarSolo, reporteError, VENTANA_REINTENTO_MS } from "./errorPantalla.ts";

test("codigoError usa el digest del servidor cuando existe", () => {
  assert.deepEqual(codigoError({ name: "Error", message: "x", digest: "534682908" }), { codigo: "534682908", delNavegador: false });
});

test("codigoError arma un código estable N-xxxxxx para errores del navegador", () => {
  const a = codigoError({ name: "Error", message: "Connection closed." });
  assert.equal(a.delNavegador, true);
  assert.match(a.codigo, /^N-[0-9a-f]{6}$/);
  assert.equal(codigoError({ name: "Error", message: "Connection closed." }).codigo, a.codigo);
  assert.notEqual(codigoError({ name: "ChunkLoadError", message: "Loading chunk 12 failed." }).codigo, a.codigo);
  assert.match(codigoError({}).codigo, /^N-[0-9a-f]{6}$/);
});

test("debeReintentarSolo: una vez por ventana", () => {
  assert.equal(debeReintentarSolo(null, 1000), true);
  assert.equal(debeReintentarSolo(NaN, 1000), true);
  assert.equal(debeReintentarSolo(1000, 1000 + 5000), false);
  assert.equal(debeReintentarSolo(1000, 1000 + VENTANA_REINTENTO_MS + 1), true);
});

test("reporteError recorta cada campo", () => {
  const r = reporteError({ name: "Error", message: "m".repeat(900), stack: "s".repeat(5000) }, "N-abcdef", "/ventas");
  assert.equal(r.mensaje.length, 500);
  assert.equal(r.pila.length, 1500);
  assert.deepEqual([r.codigo, r.nombre, r.ruta], ["N-abcdef", "Error", "/ventas"]);
});
