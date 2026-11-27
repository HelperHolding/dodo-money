import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { armarCierreSemanal, cambiosDesdeAprobacion, diasDeSemana, semanaDe } from "./cierreSemanal.ts";

const L = "2026-11-23";
const vacio = { arqueos: [], rappi: [], dodo: [], netpay: [], ultimoMovimiento: null, hoy: "2026-12-20" };
const arq = (fecha: string, turno: "matutino" | "vespertino", momento: "inicio" | "traspaso" | "cierre", ventas_efectivo: number, diferencia = 0, tarjeta_real: number | null = null, rappi_real: number | null = null) =>
  ({ fecha, turno, momento, ventas_efectivo, diferencia, tarjeta_real, rappi_real });
const dia = (c: any, f: string) => c.dias.find((d: any) => d.fecha === f);

test("semanaDe: domingo, lunes, cambio de mes", () => {
  assert.equal(semanaDe("2026-11-29"), "2026-11-23");
  assert.equal(semanaDe("2026-11-30"), "2026-11-30");
  assert.equal(semanaDe("2026-12-01"), "2026-11-30");
  assert.equal(semanaDe("2026-11-25"), "2026-11-23");
});

test("diasDeSemana: 7 fechas", () => {
  const d = diasDeSemana("2026-11-30");
  assert.equal(d.length, 7);
  assert.equal(d[0], "2026-11-30");
  assert.equal(d[6], "2026-12-06");
});

test("dos turnos: ventas_efectivo es del turno (no acumulada), se suman sin restar", () => {
  const c = armarCierreSemanal(L, { ...vacio, arqueos: [
    arq("2026-11-25", "matutino", "inicio", 0),
    arq("2026-11-25", "matutino", "traspaso", 3000, 10, 200),
    arq("2026-11-25", "vespertino", "inicio", 0),
    arq("2026-11-25", "vespertino", "cierre", 2000, -5, 300),
  ] });
  assert.equal(dia(c, "2026-11-25").efectivo, 5005);
  assert.equal(dia(c, "2026-11-25").tarjeta, 500);
  assert.equal(dia(c, "2026-11-25").sinArqueos, false);
});

test("turno único con cierre; traspaso gana al cierre del matutino", () => {
  const c = armarCierreSemanal(L, { ...vacio, arqueos: [
    arq("2026-11-24", "matutino", "cierre", 1000, 0, 50),
    arq("2026-11-26", "matutino", "traspaso", 800),
    arq("2026-11-26", "matutino", "cierre", 9999),
  ] });
  assert.equal(dia(c, "2026-11-24").efectivo, 1000);
  assert.equal(dia(c, "2026-11-26").efectivo, 800);
});

test("Rappi normal contra Turbo, y su diferencia contra rappi_real", () => {
  const c = armarCierreSemanal(L, { ...vacio,
    arqueos: [arq("2026-11-24", "matutino", "cierre", 100, 0, null, 700)],
    rappi: [{ fecha: "2026-11-24", turbo: false, subtotal: 500 }, { fecha: "2026-11-24", turbo: true, subtotal: 250 }] });
  const d = dia(c, "2026-11-24");
  assert.equal(d.rappi, 500);
  assert.equal(d.turbo, 250);
  assert.equal(d.total, 100 + 500 + 250);
  assert.equal(d.difRappi, 50);
});

test("día sin arqueos y día sin portal", () => {
  const c = armarCierreSemanal(L, { ...vacio, hoy: "2026-11-26",
    dodo: [{ fecha: "2026-11-24", efectivo: 100 }],
    rappi: [{ fecha: "2026-11-24", turbo: false, subtotal: 10 }] });
  const d24 = dia(c, "2026-11-24");
  assert.equal(d24.sinArqueos, true);
  assert.equal(d24.efectivo, 0);
  assert.equal(d24.tarjeta, 0);
  assert.equal(d24.difEfectivo, null);
  assert.equal(d24.difRappi, null);
  assert.equal(d24.sinPortal, false);
  assert.equal(dia(c, "2026-11-25").sinPortal, true);
  assert.equal(dia(c, "2026-11-26").sinPortal, false, "hoy aún no pasó");
  assert.equal(dia(c, "2026-11-27").sinPortal, false);
});

test("diferencias con Dodo, redondeadas a centavos", () => {
  const c = armarCierreSemanal(L, { ...vacio,
    arqueos: [arq("2026-11-25", "matutino", "cierre", 5000, 120.004)],
    dodo: [{ fecha: "2026-11-25", efectivo: 5000 }] });
  assert.equal(dia(c, "2026-11-25").difEfectivo, 120);
  const sinDodo = armarCierreSemanal(L, { ...vacio, arqueos: [arq("2026-11-25", "matutino", "cierre", 5000)] });
  assert.equal(dia(sinDodo, "2026-11-25").difEfectivo, null);
});

test("NetPay: conciliado, no conciliado en rango y pendiente", () => {
  const base = { ...vacio, arqueos: [arq("2026-11-24", "matutino", "cierre", 0, 0, 1000)] };
  const netpay = [
    { fecha: "2026-11-25", tipo: "deposito", monto: 700, conciliadoSemana: null },
    { fecha: "2026-11-26", tipo: "deposito", monto: 250, conciliadoSemana: L },
    { fecha: "2026-11-23", tipo: "deposito", monto: 999, conciliadoSemana: null }, // lunes: fuera de rango
    { fecha: "2026-11-26", tipo: "deposito", monto: 111, conciliadoSemana: "2026-11-16" }, // de otra semana
    { fecha: "2026-11-26", tipo: "comision", monto: 40, conciliadoSemana: null },
    { fecha: "2026-12-04", tipo: "deposito", monto: 5, conciliadoSemana: null }, // viernes siguiente: fuera
    { fecha: "2026-12-03", tipo: "comision", monto: 10, conciliadoSemana: null },
  ] as any;
  const ok = armarCierreSemanal(L, { ...base, netpay, ultimoMovimiento: "2026-12-03" });
  assert.equal(ok.netpay.tarjeta, 1000);
  assert.equal(ok.netpay.depositado, 950);
  assert.equal(ok.netpay.comisiones, 50);
  assert.equal(ok.netpay.pendiente, false);
  assert.equal(ok.netpay.diferencia, 0);
  const pend = armarCierreSemanal(L, { ...base, netpay, ultimoMovimiento: "2026-12-02" });
  assert.equal(pend.netpay.pendiente, true);
  assert.equal(pend.netpay.diferencia, null);
  assert.equal(armarCierreSemanal(L, { ...base, netpay }).netpay.pendiente, true);
});

test("cambiosDesdeAprobacion: con y sin cambios", () => {
  const a = armarCierreSemanal(L, { ...vacio, arqueos: [arq("2026-11-25", "matutino", "cierre", 5000)] });
  assert.deepEqual(cambiosDesdeAprobacion(a, a), []);
  const b = armarCierreSemanal(L, { ...vacio, arqueos: [arq("2026-11-25", "matutino", "cierre", 5120)] });
  const t = cambiosDesdeAprobacion(a, b);
  assert.ok(t.includes("mié 25: efectivo $5,000.00 → $5,120.00"), t.join("|"));
  assert.ok(t.some((x: string) => x.startsWith("mié 25: total")));
  const c = armarCierreSemanal(L, { ...vacio, arqueos: [arq("2026-11-25", "matutino", "cierre", 5000.5)] });
  assert.deepEqual(cambiosDesdeAprobacion(a, c), []);
});
