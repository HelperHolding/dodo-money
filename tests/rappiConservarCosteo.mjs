// Ensayo de importar_rappi con PostgreSQL en memoria (PGlite), sin conectarse a Supabase:
//   node tests/rappiConservarCosteo.mjs /ruta/absoluta/a/@electric-sql/pglite/dist/index.js
// Aplica 0032 y la migración que conserva el costeo manual, y corre las pruebas SQL de ambas: cada una debe terminar en
// su ERROR intencional "PRUEBAS OK" (que revierte sus datos).
import fs from "node:fs";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const modulo = process.argv[2] ? pathToFileURL(process.argv[2]).href : "@electric-sql/pglite";
const { PGlite } = await import(modulo);
const db = new PGlite();
const leer = (f) => fs.readFileSync(f, "utf8");
const migracion = fs.readdirSync("supabase/migrations").find((f) => f.endsWith("_rappi_conservar_costeo_manual.sql"));

async function pruebas(archivo) {
  try { await db.exec(leer(archivo)); } catch (e) {
    assert.match(String(e.message), /^PRUEBAS OK/, `${archivo}: ${e.message}`);
    return String(e.message);
  }
  assert.fail(`${archivo}: terminó sin el ERROR intencional "PRUEBAS OK"`);
}

try {
  await db.exec(leer("tests/rappi-historial-fixture.sql"));
  await db.exec(leer("supabase/migrations/0032_rappi_historial.sql"));
  await db.exec(leer("supabase/migrations/" + migracion));
  console.log("0032 con la función nueva:", await pruebas("supabase/pruebas/0032_rappi_historial.sql"));
  console.log("Costeo manual:", await pruebas("supabase/pruebas/" + migracion));
  // Las pruebas se revierten: no deben quedar datos.
  const { rows } = await db.query("select (select count(*) from rappi_ordenes) ordenes, (select count(*) from rappi_lineas) lineas");
  assert.deepEqual(rows[0], { ordenes: 0, lineas: 0 });
} finally {
  await db.close();
}
