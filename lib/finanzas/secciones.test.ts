import { test } from "node:test";
import assert from "node:assert/strict";
import { cifraContable, SECCIONES } from "./secciones.ts";
import { RENGLONES } from "./pl.ts";

test("cifraContable: miles, negativos entre paréntesis, cero como guion", () => {
  assert.equal(cifraContable(1234.5), "1,234.50");
  assert.equal(cifraContable(-10), "(10.00)");
  assert.equal(cifraContable(0), "-");
  assert.equal(cifraContable(0.001), "-");
  assert.equal(cifraContable(null), "—");
});

test("SECCIONES: cada renglón del P&L una vez, en el orden del P&L; los cierres son totales", () => {
  const usados = SECCIONES.flatMap((s) => [...s.renglones, ...(s.total ? [s.total] : [])]);
  assert.deepEqual(usados, RENGLONES.map((r) => r.clave));
  for (const s of SECCIONES) if (s.total) assert.equal(RENGLONES.find((r) => r.clave === s.total)?.tipo, "total");
});
