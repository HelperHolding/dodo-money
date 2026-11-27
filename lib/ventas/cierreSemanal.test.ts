import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { armarCierreSemanal, atribuirNetPay, cambiosDesdeAprobacion, diasDeSemana, netpayCompletadoDespues, semanaDe } from "./cierreSemanal.ts";

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

test("turno único con cierre; el cierre gana al traspaso de media jornada", () => {
  const c = armarCierreSemanal(L, { ...vacio, arqueos: [
    arq("2026-11-24", "matutino", "cierre", 1000, 0, 50),
    arq("2026-11-26", "matutino", "traspaso", 800),
    arq("2026-11-26", "matutino", "cierre", 9999),
  ] });
  assert.equal(dia(c, "2026-11-24").efectivo, 1000);
  assert.equal(dia(c, "2026-11-26").efectivo, 9999);
});

test("caso real La Calma 22-nov: un turno con inicio, traspaso y cierre usa el cierre", () => {
  const c = armarCierreSemanal(L, { ...vacio, arqueos: [
    arq("2026-11-27", "matutino", "inicio", 0, 0),
    arq("2026-11-27", "matutino", "traspaso", 6778.5, -5446.5),
    arq("2026-11-27", "matutino", "cierre", 17150, -11396),
  ] });
  assert.equal(dia(c, "2026-11-27").efectivo, 5754);
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
    { fecha: "2026-12-01", tipo: "deposito", monto: 5, conciliadoSemana: null }, // martes siguiente: ya es de la otra semana
    { fecha: "2026-11-30", tipo: "comision", monto: 10, conciliadoSemana: null }, // lunes siguiente: último día del rango
    { fecha: "2026-12-10", tipo: "deposito", monto: 30, conciliadoSemana: L }, // conciliado a esta semana aunque llegue tarde
  ] as any;
  const ok = armarCierreSemanal(L, { ...base, netpay, ultimoMovimiento: "2026-11-30" });
  assert.equal(ok.netpay.tarjeta, 1000);
  assert.equal(ok.netpay.depositado, 980);
  assert.equal(ok.netpay.comisiones, 50);
  assert.equal(ok.netpay.pendiente, false);
  assert.equal(ok.netpay.diferencia, -30);
  // La semana siguiente no vuelve a contar el lunes 30 ni lo de esta semana.
  const sig = armarCierreSemanal("2026-11-30", { ...vacio, netpay, ultimoMovimiento: "2026-12-07" });
  assert.equal(sig.netpay.depositado, 5);
  assert.equal(sig.netpay.comisiones, 0);
  const pend = armarCierreSemanal(L, { ...base, netpay, ultimoMovimiento: "2026-11-29" });
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

test("rappi_real cuenta una vez por turno aunque haya traspaso y cierre", () => {
  const c = armarCierreSemanal(L, { ...vacio,
    arqueos: [arq("2026-11-24", "vespertino", "traspaso", 10, 0, null, 700), arq("2026-11-24", "vespertino", "cierre", 20, 0, null, 700)],
    rappi: [{ fecha: "2026-11-24", turbo: false, subtotal: 700 }] });
  assert.equal(dia(c, "2026-11-24").difRappi, 0);
});

test("vespertino cerrado como traspaso cuenta; con dos traspasos gana el último", () => {
  const solo = armarCierreSemanal(L, { ...vacio, arqueos: [arq("2026-11-24", "vespertino", "traspaso", 400)] });
  assert.equal(dia(solo, "2026-11-24").efectivo, 400);
  const dos = armarCierreSemanal(L, { ...vacio, arqueos: [
    { ...arq("2026-11-24", "matutino", "traspaso", 100), creado_en: "2026-11-24T20:00:00Z" },
    { ...arq("2026-11-24", "matutino", "traspaso", 300), creado_en: "2026-11-24T18:00:00Z" },
  ] });
  assert.equal(dia(dos, "2026-11-24").efectivo, 100);
  const sinOrden = armarCierreSemanal(L, { ...vacio, arqueos: [arq("2026-11-24", "matutino", "traspaso", 300), arq("2026-11-24", "matutino", "traspaso", 100)] });
  assert.equal(dia(sinOrden, "2026-11-24").efectivo, 100);
});

test("arqueos anulados se ignoran", () => {
  const c = armarCierreSemanal(L, { ...vacio, arqueos: [{ ...arq("2026-11-24", "matutino", "cierre", 999), anulado: true }] });
  assert.equal(dia(c, "2026-11-24").sinArqueos, true);
  assert.equal(dia(c, "2026-11-24").efectivo, 0);
});

test("cambiosDesdeAprobacion: tarjeta y depositado de NetPay", () => {
  const a = armarCierreSemanal(L, { ...vacio, ultimoMovimiento: "2026-12-01", arqueos: [arq("2026-11-25", "matutino", "cierre", 0, 0, 1000)],
    netpay: [{ fecha: "2026-11-26", tipo: "deposito", monto: 900, conciliadoSemana: null }] });
  const b = armarCierreSemanal(L, { ...vacio, ultimoMovimiento: "2026-12-01", arqueos: [arq("2026-11-25", "matutino", "cierre", 0, 0, 1100)],
    netpay: [{ fecha: "2026-11-26", tipo: "deposito", monto: 950, conciliadoSemana: null }] });
  const t = cambiosDesdeAprobacion(a, b);
  assert.ok(t.includes("mié 25: tarjeta $1,000.00 → $1,100.00"), t.join("|"));
  assert.ok(t.includes("NetPay: depositado $900.00 → $950.00"), t.join("|"));
});

const S = "suc-a", OTRA = "suc-b";
const mov = (x: Partial<Parameters<typeof atribuirNetPay>[1][number]>) =>
  ({ fecha: "2026-11-26", tipo: "deposito", monto: 1000, sucursal: null, exclusiva: false, documentos: null, ...x }) as Parameters<typeof atribuirNetPay>[1][number];

test("atribuirNetPay: conciliación de una sola sucursal cuenta completa en la semana de su venta", () => {
  const r = atribuirNetPay(S, [mov({ documentos: [{ sucursal: S, fecha: "2026-11-24", monto: 1000 }] })]);
  assert.deepEqual(r.netpay, [{ fecha: "2026-11-26", tipo: "deposito", monto: 1000, conciliadoSemana: L }]);
  assert.equal(r.sinAsignar, 0);
  // Conciliada solo con ventas de otra sucursal: no cuenta aquí aunque el movimiento diga esta sucursal.
  assert.deepEqual(atribuirNetPay(S, [mov({ sucursal: S, documentos: [{ sucursal: OTRA, fecha: "2026-11-24", monto: 1000 }] })]).netpay, []);
});

test("atribuirNetPay: conciliación de dos sucursales se prorratea por monto de documentos", () => {
  const m = mov({ monto: 1000, documentos: [{ sucursal: S, fecha: "2026-11-24", monto: 300 }, { sucursal: OTRA, fecha: "2026-11-24", monto: 700 }] });
  assert.equal(atribuirNetPay(S, [m]).netpay[0].monto, 300);
  assert.equal(atribuirNetPay(OTRA, [m]).netpay[0].monto, 700);
  const c = mov({ tipo: "comision", monto: 33.33, documentos: [{ sucursal: S, fecha: "2026-11-24", monto: 1 }, { sucursal: OTRA, fecha: "2026-11-24", monto: 2 }] });
  assert.equal(atribuirNetPay(S, [c]).netpay[0].monto, 11.11);
  // Sin monto en algún documento: por número de documentos.
  const sinMonto = mov({ documentos: [{ sucursal: S, fecha: "2026-11-24", monto: null }, { sucursal: OTRA, fecha: "2026-11-24", monto: 500 }] });
  assert.equal(atribuirNetPay(S, [sinMonto]).netpay[0].monto, 500);
});

test("atribuirNetPay: depósito ligado a ventas de dos semanas va a la de la venta más reciente", () => {
  const m = mov({ fecha: "2026-11-24", documentos: [{ sucursal: S, fecha: "2026-11-22", monto: 400 }, { sucursal: S, fecha: "2026-11-23", monto: 600 }] });
  assert.deepEqual(atribuirNetPay(S, [m]).netpay, [{ fecha: "2026-11-24", tipo: "deposito", monto: 1000, conciliadoSemana: L }]);
});

test("atribuirNetPay: sin conciliar por sucursal del movimiento, cuenta exclusiva o sin asignar", () => {
  const r = atribuirNetPay(S, [
    mov({ sucursal: S, monto: 100 }), mov({ exclusiva: true, monto: 200 }), mov({ monto: 50 }), mov({ sucursal: OTRA, monto: 999 }), mov({ documentos: [], sucursal: S, monto: 7 }),
  ]);
  assert.deepEqual(r.netpay.map((x) => [x.monto, x.conciliadoSemana]), [[100, null], [200, null], [7, null]]);
  assert.equal(r.sinAsignar, 50);
});

test("NetPay pendiente al aprobar: el depósito posterior no es un cambio, solo línea neutra", () => {
  const a = armarCierreSemanal(L, { ...vacio, arqueos: [arq("2026-11-25", "matutino", "cierre", 0, 0, 1000)] });
  assert.equal(a.netpay.pendiente, true);
  const b = armarCierreSemanal(L, { ...vacio, ultimoMovimiento: "2026-12-01", arqueos: [arq("2026-11-25", "matutino", "cierre", 0, 0, 1000)],
    netpay: [{ fecha: "2026-11-26", tipo: "deposito", monto: 950, conciliadoSemana: null }] });
  assert.equal(b.netpay.pendiente, false);
  assert.deepEqual(cambiosDesdeAprobacion(a, b), []);
  assert.equal(netpayCompletadoDespues(a, b), 950);
  assert.equal(netpayCompletadoDespues(b, b), null, "ya estaba completo al aprobar");
  assert.equal(netpayCompletadoDespues(a, a), null, "sigue pendiente");
});

test("sinPortal: solo si no se importó ninguna orden ese día (cualquier estado) y difRappi queda en null", () => {
  const dr = { ...vacio, hoy: "2026-11-27", arqueos: [arq("2026-11-24", "matutino", "cierre", 0, 0, null, 500), arq("2026-11-25", "matutino", "cierre", 0, 0, null, 500)] };
  const c = armarCierreSemanal(L, { ...dr, rappi: [], diasConPortal: ["2026-11-24"] });
  assert.equal(dia(c, "2026-11-24").sinPortal, false, "hubo órdenes importadas aunque ninguna finalizada");
  assert.equal(dia(c, "2026-11-24").difRappi, -500);
  assert.equal(dia(c, "2026-11-25").sinPortal, true);
  assert.equal(dia(c, "2026-11-25").difRappi, null);
});
