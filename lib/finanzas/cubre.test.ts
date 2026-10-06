import { test } from "node:test";
import assert from "node:assert/strict";
import { capturasTardias, esMesDeEmision, fraccionCubre, leerPeriodoMeses, periodoCubre, sumarMeses, textoCubre, ultimoDiaMes } from "./cubre.ts";
import { facturasAGastos } from "./gastos.ts";

test("sumarMeses y último día del mes (bisiesto, cambio de año)", () => {
  assert.equal(sumarMeses("2026-10", 3), "2027-01");
  assert.equal(sumarMeses("2026-01", -2), "2025-11");
  assert.equal(ultimoDiaMes("2028-02"), "2028-02-29");
  assert.equal(ultimoDiaMes("2026-02"), "2026-02-28");
  assert.equal(ultimoDiaMes("2026-12"), "2026-12-31");
});

test("periodoCubre con cada regla", () => {
  assert.deepEqual(periodoCubre("2026-10-05", 2, "anteriores"), { desde: "2026-08-01", hasta: "2026-09-30" });
  assert.deepEqual(periodoCubre("2026-10-03", 3, "emision"), { desde: "2026-10-01", hasta: "2026-12-31" });
  assert.deepEqual(periodoCubre("2026-09-28", 1, "siguiente"), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(periodoCubre("2026-01-15", 2, "anteriores"), { desde: "2025-11-01", hasta: "2025-12-31" });
  assert.deepEqual(periodoCubre("2026-12-10", 1, "siguiente"), { desde: "2027-01-01", hasta: "2027-01-31" });
  assert.deepEqual(periodoCubre("2026-10-31", 1, "emision"), { desde: "2026-10-01", hasta: "2026-10-31" });
});

test("fraccionCubre: dentro, parcial, fuera, semana que cruza meses y periodo vacío", () => {
  const cfe = { desde: "2026-08-01", hasta: "2026-09-30" };   // 61 días
  assert.deepEqual(fraccionCubre(cfe, { desde: "2026-08-01", hasta: "2026-08-31" }), { dias: 31, total: 61, fraccion: 31 / 61 });
  assert.deepEqual(fraccionCubre(cfe, { desde: "2026-09-28", hasta: "2026-10-04" }), { dias: 3, total: 61, fraccion: 3 / 61 });
  assert.equal(fraccionCubre(cfe, { desde: "2026-10-01", hasta: "2026-10-31" }).fraccion, 0);
  assert.equal(fraccionCubre(cfe, { desde: "2026-01-01", hasta: "2026-12-31" }).fraccion, 1);
  assert.equal(fraccionCubre({ desde: "2026-10-01", hasta: "2026-10-31" }, { desde: "2026-10-01", hasta: "2026-09-30" }).fraccion, 0);
});

test("un recibo bimestral de $4,000 queda repartido entre agosto y septiembre", () => {
  const recibo = { tipo: "ingreso" as const, estado: "por_pagar", subtotal: 4000, descuento: 0, cuenta_pl: "servicios", cubre: { desde: "2026-08-01", hasta: "2026-09-30" } };
  const mes = (desde: string, hasta: string) => facturasAGastos([recibo], (f) => fraccionCubre(f.cubre, { desde, hasta }).fraccion).gastos.servicios ?? 0;
  assert.equal(mes("2026-08-01", "2026-08-31"), 2032.79);
  assert.equal(mes("2026-09-01", "2026-09-30"), 1967.21);
  assert.equal(mes("2026-10-01", "2026-10-31"), 0);
});

test("textoCubre y mes de emisión", () => {
  assert.equal(textoCubre({ desde: "2026-10-01", hasta: "2026-10-31" }), "octubre 2026");
  assert.equal(textoCubre({ desde: "2026-08-01", hasta: "2026-09-30" }), "agosto–septiembre 2026");
  assert.equal(textoCubre({ desde: "2026-12-01", hasta: "2027-02-28" }), "diciembre 2026–febrero 2027");
  assert.equal(esMesDeEmision({ desde: "2026-10-01", hasta: "2026-10-31" }, "2026-10-17"), true);
  assert.equal(esMesDeEmision({ desde: "2026-08-01", hasta: "2026-09-30" }, "2026-10-05"), false);
});

test("leerPeriodoMeses: los dos vacíos = regla del proveedor; meses completos; hasta 24 meses", () => {
  assert.deepEqual(leerPeriodoMeses("", ""), { periodo: null });
  assert.deepEqual(leerPeriodoMeses("2026-08", "2026-09"), { periodo: { desde: "2026-08-01", hasta: "2026-09-30" } });
  assert.deepEqual(leerPeriodoMeses("2026-08", ""), { error: "Elige de qué mes a qué mes cubre." });
  assert.deepEqual(leerPeriodoMeses("2026-10", "2026-09"), { error: "El periodo no puede terminar antes de empezar." });
  assert.deepEqual(leerPeriodoMeses("2026-01", "2027-12"), { periodo: { desde: "2026-01-01", hasta: "2027-12-31" } });
  assert.deepEqual(leerPeriodoMeses("2026-01", "2028-01"), { error: "El periodo es de hasta 24 meses." });
});

test("capturasTardias: solo las capturadas después de que terminó el mes del rango", () => {
  const f = [
    { capturada: "2026-09-30", monto: 100 },
    { capturada: "2026-10-05", monto: 1967.21 },
    { capturada: "2026-10-06", monto: 0 },
  ];
  assert.deepEqual(capturasTardias(f, "2026-09-30"), { n: 1, monto: 1967.21 });
  assert.deepEqual(capturasTardias(f, "2026-09-13"), { n: 1, monto: 1967.21 });   // una semana de septiembre
  assert.deepEqual(capturasTardias(f, "2026-10-05"), { n: 0, monto: 0 });          // mes en curso
});
