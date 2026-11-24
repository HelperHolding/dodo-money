import { test } from "node:test";
import assert from "node:assert/strict";
import { cuentaPuente, diasEntre, documentosEnTransito, lotesLiquidados } from "./transito.ts";

test("Rappi: cada paidlot con su neto y la fecha de su último movimiento; sin paidlot no cuenta", () => {
  const l = lotesLiquidados([
    { fecha: "2026-11-10", lote: "222", neto: 100.1 }, { fecha: "2026-11-12", lote: "222", neto: -20.05 },
    { fecha: "2026-11-03", lote: "111", neto: 50 }, { fecha: "2026-11-20", lote: null, neto: 300 },
  ]);
  assert.deepEqual(l, [{ lote: "111", fecha: "2026-11-03", neto: 50 }, { lote: "222", fecha: "2026-11-12", neto: 80.05 }]);
});

const p = (fecha: string, monto: number, texto = fecha) => ({ fecha, monto, texto });

test("tarjeta → banco: los depósitos y comisiones cubren primero las ventas más viejas", () => {
  const c = cuentaPuente(
    [p("2026-11-20", 4000), p("2026-11-21", 9000.5), p("2026-11-22", 3000)],
    [p("2026-11-21", 3880), p("2026-11-21", 120), p("2026-11-23", 5000)],
    "2026-11-24", 3,
  );
  assert.equal(c.entradas, 16000.5);
  assert.equal(c.salidas, 9000);
  assert.equal(c.saldo, 7000.5);
  assert.deepEqual(c.pendientes.map((x) => [x.fecha, x.restante, x.dias, x.atrasado]), [["2026-11-21", 4000.5, 3, false], ["2026-11-22", 3000, 2, false]]);
  assert.equal(c.diasMasViejo, 3);
  assert.equal(c.sobrante, 0);
});

test("lo atrasado se marca; lo que llega de más queda como sobrante", () => {
  const c = cuentaPuente([p("2026-11-01", 100), p("2026-11-20", 50)], [p("2026-11-02", 30)], "2026-11-24", 7);
  assert.deepEqual(c.pendientes.map((x) => [x.fecha, x.restante, x.atrasado]), [["2026-11-01", 70, true], ["2026-11-20", 50, false]]);
  assert.equal(c.atrasados, 1);
  const sobra = cuentaPuente([p("2026-11-01", 100)], [p("2026-10-01", 130)], "2026-11-24", 7);
  assert.deepEqual([sobra.saldo, sobra.sobrante, sobra.pendientes.length, sobra.diasMasViejo], [0, 30, 0, null]);
});

test("por documento: sale de tránsito cuando se marca recibido; montos en cero o negativos no cuentan", () => {
  const lotes = [{ ...p("2026-11-10", 5843.11), clave: "111" }, { ...p("2026-11-17", 7366.5), clave: "222" }, { ...p("2026-11-18", -12), clave: "333" }];
  const c = documentosEnTransito(lotes, new Set(["111"]), "2026-11-24", 10);
  assert.deepEqual([c.entradas, c.salidas, c.saldo], [13209.61, 5843.11, 7366.5]);
  assert.deepEqual(c.pendientes.map((x) => [x.clave, x.dias, x.atrasado]), [["222", 7, false]]);
});

test("días entre fechas", () => {
  assert.equal(diasEntre("2026-10-30", "2026-11-02"), 3);
  assert.equal(diasEntre("2026-11-05", "2026-11-02"), 0);
});
