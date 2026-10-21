import { test } from "node:test";
import assert from "node:assert/strict";
import { quienLlama } from "./cron.ts";

const CLAVE = "a".repeat(64);

test("quién llama a la sincronización: cron con su clave, clave incorrecta o falta en el servidor, o una persona", () => {
  assert.deepEqual(quienLlama(`Bearer ${CLAVE}`, CLAVE), { tipo: "cron" });
  assert.deepEqual(quienLlama(null, CLAVE), { tipo: "persona" });
  assert.deepEqual(quienLlama("", CLAVE), { tipo: "persona" });
  assert.deepEqual(quienLlama(`Bearer ${"b".repeat(64)}`, CLAVE),
    { tipo: "rechazo", mensaje: "La clave del cron no coincide con DODOIS_CRON_SECRET de Vercel." });
  assert.deepEqual(quienLlama(`Bearer ${CLAVE}`, undefined),
    { tipo: "rechazo", mensaje: "Falta DODOIS_CRON_SECRET en Vercel (Production) o volver a desplegar después de ponerla." });
  assert.deepEqual(quienLlama("Bearer corta", "corta"),
    { tipo: "rechazo", mensaje: "Falta DODOIS_CRON_SECRET en Vercel (Production) o volver a desplegar después de ponerla." });
});
