import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaPL } from "./excel.ts";
import { calcularPL, entradaVacia } from "./pl.ts";

test("hojaPL: renglón, real, %, meta, meta %, diferencia, mes anterior % y acumulado %; totales en negritas", () => {
  const filas = calcularPL({ ...entradaVacia(), ventaNeta: 1000, alimento: 300 }, [{ renglon: "alimento", tipo: "pct", valor: 0.3 }], { ventaNeta: 1000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
  const [h] = hojaPL({
    titulo: "Consolidado", periodo: "Semana 41 · 5 al 11 oct 2026", generado: "Sebastián", filas, anterior: null,
    acumulado: new Map([["alimento", 0.31]]), columnas: { anterior: "Semana anterior %", acumulado: "Acumulado del mes %" },
  });
  assert.equal(h.nombre, "P&L");
  assert.equal(h.filas[1][0], "Semana 41 · 5 al 11 oct 2026 · sin IVA, criterio devengado");
  assert.deepEqual(h.filas[4], ["Renglón", "Real", "% de venta", "Meta", "Meta %", "Diferencia", "Semana anterior %", "Acumulado del mes %"]);
  const alimento = h.filas.find((f) => f[0] === "Alimento y empaque")!;
  assert.deepEqual(alimento.slice(1), [
    { valor: 300, formato: "pesos" }, { valor: 0.3, formato: "porcentaje" }, { valor: 300, formato: "pesos" },
    { valor: 0.3, formato: "porcentaje" }, { valor: 0, formato: "pesos" }, null, { valor: 0.31, formato: "porcentaje" },
  ]);
  assert.equal(h.filas.find((f) => f[0] === "Merma")![1], "Sin dato");
  const ebitda = h.filas.findIndex((f) => f[0] === "EBITDA");
  assert.ok(h.negritas!.includes(ebitda));
  assert.ok(h.negritas!.includes(4));
});
