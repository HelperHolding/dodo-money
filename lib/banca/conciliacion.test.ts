import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONCEPTOS, TIPOS, clabeDestino, conceptoDeCuenta, documentosRpc, sugerirConciliaciones, type Documentos, type MovimientoBanco } from "./conciliacion.ts";

let fila = 0;
const mov = (id: string, fecha: string, descripcion: string, cargo: number, abono: number, referencia = "_"): MovimientoBanco => ({ id, fecha, fila: ++fila, descripcion, referencia, cargo, abono });
const NETPAY = "AAAAA01 SPEI. BANORTE. 072000000000000001. NET PAY SAPI DE C. VTAS";
const COM = "DOMI:     COM VTAS  1234567 DODO PIZZA 1-12345 - NET PAY SA";
const IVA = "DOMI:     IVA COM VTAS  1234567 DODO PIZZA 1-1 - NET PAY SA";
const RAPPI = "BBBBB02 SPEI. CITI MEXICO. 124000000000000002. TECNOLO";
const SPEI = (clabe: string, nombre: string) => `CCCCC03 SPEI. BANAMEX. ${clabe}. ${nombre}. 058-07/10/2026`;
const vacio: Documentos = { pagos: [], ventas: [], lotesRappi: [] };

test("catálogo: conceptos y tipos coinciden con la migración", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261029200000_banca_conciliacion.sql", import.meta.url), "utf8");
  for (const c of CONCEPTOS) assert.match(sql, new RegExp(`'${c.clave}'`));
  for (const t of TIPOS) assert.match(sql, new RegExp(`'${t}'`));
  assert.equal(new Set(CONCEPTOS.map((c) => c.clave)).size, 19);
});

test("clabeDestino: formato del Excel (puntos) y del PDF (comas)", () => {
  assert.equal(clabeDestino(SPEI("002320000000000001", "PROVEEDOR UNO")), "002320000000000001");
  assert.equal(clabeDestino("TRA SPEI-CCCCC03 SPEI, BBVA MEXICO, 012000000000000003, PERSONA, 058-17/09/2026"), "012000000000000003");
  assert.equal(clabeDestino("DOMI: COM VTAS"), null);
});

test("NetPay: el depósito se compara contra la venta con tarjeta del día anterior; comisión e IVA van juntos", () => {
  const s = sugerirConciliaciones(
    [mov("d", "2026-10-06", NETPAY, 0, 2674), mov("c", "2026-10-06", COM, 41.48, 0), mov("i", "2026-10-06", IVA, 6.62, 0)],
    { ...vacio, ventas: [{ id: "v5", fecha: "2026-10-05", tarjeta: 2674 }] },
  );
  assert.equal(s.length, 1);
  assert.deepEqual({ ...s[0], documentos: s[0].documentos.map((d) => d.tipo === "venta_dia" && d.id) }, {
    tipo: "cobro_tarjeta", movimientos: ["d", "c", "i"], documentos: ["v5"], concepto: "cobranza_tarjeta", diferencia: 0, exacta: true, nota: "",
  });
});

test("NetPay: el lunes liquida viernes a domingo; cada día se usa una sola vez", () => {
  const s = sugerirConciliaciones(
    [mov("d1", "2026-10-02", NETPAY, 0, 4574), mov("d2", "2026-10-05", NETPAY, 0, 27991)],
    { ...vacio, ventas: [
      { id: "v1", fecha: "2026-10-01", tarjeta: 4574 }, { id: "v2", fecha: "2026-10-02", tarjeta: 9000 },
      { id: "v3", fecha: "2026-10-03", tarjeta: 9500 }, { id: "v4", fecha: "2026-10-04", tarjeta: 9491 },
    ] },
  );
  const ids = (k: number) => s[k].documentos.map((d) => (d.tipo === "venta_dia" ? d.id : ""));
  assert.deepEqual(ids(0), ["v1"]);
  assert.deepEqual(ids(1), ["v2", "v3", "v4"]);
  assert.equal(s[1].diferencia, 0);
});

test("NetPay: con diferencia no es exacta", () => {
  const [s] = sugerirConciliaciones([mov("d", "2026-10-06", NETPAY, 0, 1000)], { ...vacio, ventas: [{ id: "v", fecha: "2026-10-05", tarjeta: 990 }] });
  assert.equal(s.diferencia, 10);
  assert.equal(s.exacta, false);
});

test("NetPay: dos depósitos el mismo día toman su par de comisiones en orden de fila", () => {
  const s = sugerirConciliaciones(
    [mov("d1", "2026-10-09", NETPAY, 0, 100), mov("c1", "2026-10-09", COM, 1, 0), mov("i1", "2026-10-09", IVA, 0.16, 0),
     mov("d2", "2026-10-09", NETPAY, 0, 200), mov("c2", "2026-10-09", COM, 2, 0), mov("i2", "2026-10-09", IVA, 0.32, 0)],
    { ...vacio, ventas: [{ id: "v8", fecha: "2026-10-08", tarjeta: 100 }, { id: "v7", fecha: "2026-10-07", tarjeta: 200 }] },
  );
  assert.deepEqual(s.map((x) => x.movimientos), [["d1", "c1", "i1"], ["d2", "c2", "i2"]]);
});

test("Rappi: paidlot por neto exacto; depósito de validación sin documento", () => {
  const s = sugerirConciliaciones(
    [mov("r", "2026-10-13", RAPPI, 0, 5843.11), mov("val", "2026-09-21", RAPPI, 0, 0.01)],
    { ...vacio, lotesRappi: [{ importacionId: "imp", lote: "123456", neto: 5843.11 }] },
  );
  const r = s.find((x) => x.movimientos[0] === "r")!;
  assert.equal(r.tipo, "cobro_rappi");
  assert.equal(r.concepto, "cobranza_rappi");
  assert.equal(r.exacta, true);
  const v = s.find((x) => x.movimientos[0] === "val")!;
  assert.deepEqual([v.tipo, v.concepto, v.exacta], ["sin_documento", "otros_operacion", false]);
  assert.ok(v.nota.length > 0);
});

test("proveedor: misma CLABE, mismo monto y fecha ±5 días; concepto según la cuenta del pago", () => {
  const clabe = "002320000000000001";
  const base = { clabe, proveedor: "PROVEEDOR UNO", fecha: "2026-10-06", monto: 4515.25 };
  const docs = (cuenta: "insumos" | "renta" | null, extra = {}) => ({ ...vacio, pagos: [{ id: "p", cuenta, ...base, ...extra }] });
  const cargo = [mov("m", "2026-10-07", SPEI(clabe, "PROVEEDOR UNO"), 4515.25, 0)];
  assert.deepEqual(sugerirConciliaciones(cargo, docs("insumos")).map((x) => [x.tipo, x.concepto, x.exacta]), [["pago_proveedor", "proveedores", true]]);
  assert.equal(sugerirConciliaciones(cargo, docs("renta"))[0].concepto, "renta");
  assert.equal(sugerirConciliaciones(cargo, docs("insumos", { monto: 4515.26 })).length, 0);
  assert.equal(sugerirConciliaciones(cargo, docs("insumos", { fecha: "2026-09-28" })).length, 0);
  assert.equal(sugerirConciliaciones(cargo, docs("insumos", { clabe: null })).length, 0);
});

test("proveedor: un pago se sugiere una sola vez", () => {
  const clabe = "002320000000000001";
  const s = sugerirConciliaciones(
    [mov("a", "2026-10-07", SPEI(clabe, "P"), 100, 0), mov("b", "2026-10-07", SPEI(clabe, "P"), 100, 0)],
    { ...vacio, pagos: [{ id: "p", fecha: "2026-10-07", monto: 100, clabe, proveedor: "P", cuenta: null }] },
  );
  assert.deepEqual(s.map((x) => x.movimientos), [["a"]]);
});

test("nómina: un lote por día con NOMINA o Q##", () => {
  const s = sugerirConciliaciones(
    [mov("n1", "2026-09-30", SPEI("012000000000000004", "PERSONA UNO") + ", Q18 NOMINA", 6111.6, 0),
     mov("n2", "2026-09-30", SPEI("012000000000000005", "PERSONA DOS") + ", Q18 NOMINA", 5370.6, 0),
     mov("n3", "2026-09-15", SPEI("012000000000000004", "PERSONA UNO") + ", DISPERSION NOMINA Q17", 5370.8, 0)],
    vacio,
  );
  assert.deepEqual(s.map((x) => [x.tipo, x.concepto, x.movimientos]), [["nomina", "nomina", ["n3"]], ["nomina", "nomina", ["n1", "n2"]]]);
});

test("reglas de texto sin documento", () => {
  const s = sugerirConciliaciones([
    mov("a", "2026-09-15", "*Com. Contratación - esquema de seguridad", 120, 0),
    mov("b", "2026-09-15", "*IVA de Com. Contratación - esquema de seguridad", 19.2, 0),
    mov("c", "2026-09-30", "Comisión Administración - renta", 320, 0),
    mov("d", "2026-10-09", "(BE) Pago servicio: PAGO SUA/SIPARE", 7690.96, 0),
    mov("e", "2026-10-14", "(BE) Traspaso a cuenta: 058000000000000006. C000000", 796.77, 0),
    mov("f", "2026-09-15", "(NB) Recepcion de cuenta: 000000000001. PRE", 0, 99999, "_PRESTAMO EMPRESA"),
    mov("g", "2026-10-20", "MOVIMIENTO DESCONOCIDO", 50, 0),
  ], vacio);
  assert.deepEqual(s.map((x) => [x.movimientos[0], x.tipo, x.concepto]), [
    ["a", "sin_documento", "comisiones_bancarias"], ["b", "sin_documento", "comisiones_bancarias"], ["f", "sin_documento", "prestamo_recibido"],
    ["c", "sin_documento", "comisiones_bancarias"], ["d", "sin_documento", "imss_impuestos"], ["e", "sin_documento", "traspaso_interno"],
  ]);
  assert.ok(s.every((x) => x.nota.length > 0 && !x.exacta));
});

test("nómina: un SPEI sin NOMINA ni Q## queda sin sugerencia", () => {
  assert.deepEqual(sugerirConciliaciones([mov("n", "2026-09-30", "ABUYC65 SPEI. BBVA MEXICO. 012000000000000004. PERSONA UNO", 6111.6, 0)], vacio), []);
});

test("comisión NetPay sin depósito el mismo día → comisiones_cobro sin documento", () => {
  const s = sugerirConciliaciones([mov("c", "2026-10-06", COM, 41.48, 0)], vacio);
  assert.deepEqual(s.map((x) => [x.tipo, x.concepto, x.documentos.length]), [["sin_documento", "comisiones_cobro", 0]]);
});

test("un abono con texto DOMI COM nunca se trata como depósito NetPay", () => {
  const s = sugerirConciliaciones([mov("c", "2026-10-06", COM, 0, 41.48)], { ...vacio, ventas: [{ id: "v", fecha: "2026-10-05", tarjeta: 41.48 }] });
  assert.deepEqual(s, []);
});

test("conceptoDeCuenta y documentosRpc", () => {
  assert.equal(conceptoDeCuenta("servicios"), "servicios");
  assert.equal(conceptoDeCuenta("marketing_agregadores"), "marketing");
  assert.equal(conceptoDeCuenta("inversiones"), "capex");
  assert.equal(conceptoDeCuenta(null), "proveedores");
  assert.deepEqual(documentosRpc([
    { tipo: "pago", id: "p", monto: 1, texto: "" }, { tipo: "venta_dia", id: "v", monto: 1, texto: "" },
    { tipo: "rappi_lote", importacionId: "i", lote: "123456", monto: 1, texto: "" },
  ]), [{ tipo: "pago", id: "p" }, { tipo: "venta_dia", id: "v" }, { tipo: "rappi_lote", importacion: "i", lote: "123456" }]);
});
