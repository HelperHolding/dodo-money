import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

// La API de Supabase (PostgREST) carga safeupdate: un UPDATE o DELETE sin WHERE falla con "UPDATE requires a WHERE
// clause" (en el SQL Editor no, por eso las pruebas SQL no lo ven). Las funciones que la app llama por la API no pueden
// tener uno, aunque la tabla tenga una sola fila.
const LLAMADAS_POR_API = /^(dodois_|sincronizar_|ligar_|desligar_)/;

function ultimasDefiniciones() {
  const dir = new URL("../../supabase/migrations/", import.meta.url);
  const defs = new Map<string, string>();
  for (const archivo of readdirSync(dir).sort()) {
    const sql = readFileSync(new URL(archivo, dir), "utf8");
    for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/gi)) {
      if (LLAMADAS_POR_API.test(m[1])) defs.set(m[1], m[2]);
    }
  }
  return defs;
}

test("las funciones que la app llama por la API no hacen UPDATE ni DELETE sin WHERE", () => {
  const defs = ultimasDefiniciones();
  assert.ok(defs.has("dodois_guardar_tokens") && defs.has("dodois_marcar_error") && defs.has("sincronizar_recepciones_dodo"));
  const sinWhere: string[] = [];
  for (const [nombre, cuerpo] of defs) {
    for (const sentencia of cuerpo.split(";")) {
      const s = sentencia.replace(/--[^\n]*/g, "").trim();
      if (/^(update|delete)\b/i.test(s) && !/\bwhere\b/i.test(s)) sinWhere.push(`${nombre}: ${s.split("\n")[0].slice(0, 80)}`);
    }
  }
  assert.deepEqual(sinWhere, []);
});
