import { test } from "node:test";
import assert from "node:assert/strict";
import { comisionesCobro, comisionRappi, regalias, type DiaVenta, type Vigente } from "./comisiones.ts";
import { prorratear } from "./prorrateo.ts";
import { valorVigente } from "./parametros.ts";

const PARAMS = [
  { clave: "rappi_pct" as const, valor: 0, vigente_desde: "2026-10-01" },
  { clave: "rappi_pct" as const, valor: 0.18, vigente_desde: "2027-01-01" },
  { clave: "regalias_pct" as const, valor: 0.05, vigente_desde: "2026-01-01" },
  { clave: "dlocal_pct" as const, valor: 0.035, vigente_desde: "2026-01-01" },
  { clave: "oxxo_pct" as const, valor: 0.05, vigente_desde: "2026-01-01" },
  { clave: "oxxo_participacion" as const, valor: 0.1, vigente_desde: "2026-01-01" },
  { clave: "netpay_pct" as const, valor: 0.018, vigente_desde: "2026-01-01" },
  { clave: "amex_pct" as const, valor: 0.036, vigente_desde: "2026-01-01" },
  { clave: "amex_participacion" as const, valor: 0.2, vigente_desde: "2026-01-01" },
];
const vigente: Vigente = (clave, fecha) => valorVigente(PARAMS, clave, fecha);
const dia = (fecha: string, total: number, iva: number, tarjeta: number, en_linea: number, ag = { total: 0, tarjeta: 0, en_linea: 0 }): DiaVenta => ({ fecha, total, iva, tarjeta, en_linea, agregador: ag });

test("comisionRappi: tasa del día sobre la venta del agregador con IVA (0 % hasta diciembre, 18 % desde enero)", () => {
  const dias = [dia("2026-12-31", 10000, 1379.31, 0, 0, { total: 1000, tarjeta: 0, en_linea: 1000 }), dia("2027-01-01", 10000, 1379.31, 0, 0, { total: 1000, tarjeta: 0, en_linea: 1000 })];
  assert.equal(comisionRappi(dias, vigente), 180);
});

test("comisionesCobro: sin la parte del agregador; Oxxo y Amex por su participación", () => {
  // En línea 3,000 de los que 1,000 son Rappi → base dLocal 2,000: 90 % × 3.5 % + 10 % × 5 % = 73.00
  // Tarjeta 5,000 → 80 % × 1.8 % + 20 % × 3.6 % = 108.00
  const r = comisionesCobro([dia("2026-10-05", 12000, 1655.17, 5000, 3000, { total: 1000, tarjeta: 0, en_linea: 1000 })], vigente);
  assert.deepEqual(r, { dlocal: 73, netpay: 108, total: 181 });
});

test("regalias: 5 % de la venta neta de cada día", () => {
  assert.equal(regalias([dia("2026-10-05", 11600, 1600, 0, 0), dia("2026-10-06", 5800, 800, 0, 0)], vigente), 750);
});

test("prorratear: por venta, sin perder centavos; sin ventas no reparte", () => {
  assert.deepEqual([...prorratear(100, new Map([["a", 1], ["b", 2]]))], [["a", 33.33], ["b", 66.67]]);
  assert.deepEqual([...prorratear(1000, new Map([["a", 500], ["b", 0]]))], [["a", 1000], ["b", 0]]);
  assert.deepEqual([...prorratear(1000, new Map([["a", 0]]))], [["a", 0]]);
  const tres = prorratear(100, new Map([["a", 1], ["b", 1], ["c", 1]]));
  assert.equal([...tres.values()].reduce((s, v) => s + v, 0), 100);
});
