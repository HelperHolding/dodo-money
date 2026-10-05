import { test } from "node:test";
import assert from "node:assert/strict";
import { valorVigente } from "./parametros.ts";
import { CUENTAS_GASTO, esCuentaPl, NOMBRE_CUENTA } from "./cuentas.ts";

const P = [
  { clave: "rappi_pct" as const, valor: 0, vigente_desde: "2026-10-01" },
  { clave: "rappi_pct" as const, valor: 0.18, vigente_desde: "2027-01-01" },
  { clave: "regalias_pct" as const, valor: 0.05, vigente_desde: "2026-01-01" },
];

test("valorVigente: el de fecha más reciente que no pasa del día; 0 si no hay", () => {
  assert.equal(valorVigente(P, "rappi_pct", "2026-12-31"), 0);
  assert.equal(valorVigente(P, "rappi_pct", "2027-01-01"), 0.18);
  assert.equal(valorVigente(P, "rappi_pct", "2026-09-30"), 0);
  assert.equal(valorVigente(P, "regalias_pct", "2026-10-15"), 0.05);
  assert.equal(valorVigente(P, "netpay_pct", "2026-10-15"), 0);
});

test("cuentas del P&L", () => {
  assert.equal(CUENTAS_GASTO.length, 8);
  assert.equal(esCuentaPl("renta"), true);
  assert.equal(esCuentaPl("insumos"), true);
  assert.equal(esCuentaPl("comida"), false);
  assert.equal(NOMBRE_CUENTA.consumibles_equipo, "Consumibles y equipo menor");
});
