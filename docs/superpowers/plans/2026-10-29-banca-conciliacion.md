# Conciliación bancaria Banregio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada movimiento de Banregio se concilie (con su pago, días de venta con tarjeta, paidlot de Rappi, nómina, o sin documento) con un concepto de flujo, desde Banca → Conciliación, sin tocar facturas, ventas ni saldos.

**Architecture:** Tres tablas nuevas con escritura solo por dos RPC `security definer` que validan coherencia y calculan montos y diferencia en el servidor. Las sugerencias las calcula una función pura (`lib/banca/conciliacion.ts`), nunca se guardan; admin las confirma. La pantalla es un server component con formularios y server actions.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (Postgres, RLS, RPC plpgsql), PGlite para correr la migración y su prueba SQL en `npm test`, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-10-29-banca-conciliacion-design.md`

## Global Constraints

- Flujo de `AGENTS.md`: rama `banca-conciliacion` → PR hacia `main`; sin commits a `main`; sin `--allow-empty`; sin saltar hooks.
- **La migración y `supabase/pruebas/…` los ejecuta Sebastián en Supabase; el PR se integra solo después de su resultado `PRUEBAS OK`.**
- Documental: no marca facturas pagadas, no crea ventas ni pagos, no toca saldos, caja ni bóveda.
- Admin concilia y anula; quien consulta Banca (`ve_compras()`) consulta. RLS solo lectura; sin escritura directa.
- Un movimiento, un pago, un día de venta y un paidlot: a lo más en **una conciliación activa**.
- Montos y diferencia los calcula el servidor; diferencia ≠ 0 y `sin_documento` exigen nota.
- La app **sugiere**; nada queda conciliado sin que admin confirme.
- Conceptos (exactos): `cobranza_tarjeta, cobranza_rappi, deposito_efectivo, proveedores, nomina, imss_impuestos, renta, servicios, marketing, regalias, comisiones_bancarias, comisiones_cobro, otros_operacion, capex, apertura, prestamo_recibido, pago_capital, intereses, traspaso_interno`.
- Tipos (exactos): `pago_proveedor, cobro_tarjeta, cobro_rappi, nomina, sin_documento`.
- **Ruling (corrige el spec):** NetPay deposita la venta **bruta** y cobra la comisión e IVA aparte el mismo día; el cobro con tarjeta compara **el depósito** contra Σ `ventas_dia.tarjeta` (no depósito + comisiones). Las comisiones van en la misma conciliación.
- Pantalla con tarjetas, no tablas anchas.
- Pruebas sin datos reales: nombres, CLABEs y referencias ficticios.
- `lib/` solo usa `import type` entre módulos de `lib/`.

## Review Focus

- **Dos depósitos NetPay el mismo día:** cada uno toma su par comisión/IVA en orden de fila, sin robar el del otro → prueba en Task 1.
- **Proveedor sin CLABE registrada:** su pago nunca se sugiere automáticamente, pero sigue disponible para vincular a mano → prueba en Task 1 (y selector manual en Task 4).
- **"Confirmar exactas" enviado dos veces:** la segunda vuelta no duplica nada (la base rechaza el doble vínculo y la acción recalcula sugerencias sin lo ya conciliado) → prueba SQL de doble vínculo en Task 2.
- **Anular y volver a conciliar:** anular libera movimiento y pago para una nueva conciliación → prueba SQL en Task 2.
- **Depósito del día 1 del mes que liquida ventas del mes anterior:** el cargador trae ventas hasta 7 días antes del periodo → Task 3 (cargador) y verificación manual en Task 5.

---

### Task 1: Catálogo y sugerencias (función pura)

**Files:**
- Create: `lib/banca/conciliacion.ts`
- Create: `lib/banca/conciliacion.test.ts`
- Modify: `package.json` (script `test`: agregar `lib/banca/conciliacion.test.ts ` después de `lib/banca/rappi.test.ts `)
- Modify: `docs/superpowers/specs/2026-10-29-banca-conciliacion-design.md` (regla NetPay: ver Step 5)

**Interfaces:**
- Produces (usados por Tasks 2–4, nombres exactos):
  - `CONCEPTOS` (array `{ clave, nombre, grupo }`), `type Concepto`, `TIPOS`, `type TipoConciliacion`
  - `type MovimientoBanco = { id; fecha; fila; descripcion; cargo; abono }`
  - `type PagoCandidato = { id; fecha; monto; clabe: string | null; proveedor: string; cuenta: CuentaPl | null }`
  - `type VentaTarjeta = { id; fecha; tarjeta }`, `type LoteRappi = { importacionId; lote; neto }`
  - `type Documentos = { pagos; ventas; lotesRappi }`, `type DocumentoSugerido`, `type Sugerencia`
  - `sugerirConciliaciones(movs, docs): Sugerencia[]`, `clabeDestino(descripcion): string | null`,
    `conceptoDeCuenta(cuenta): Concepto`, `documentosRpc(docs: DocumentoSugerido[]): DocumentoRpc[]`

- [ ] **Step 1: Write the failing tests**

`lib/banca/conciliacion.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONCEPTOS, TIPOS, clabeDestino, conceptoDeCuenta, documentosRpc, sugerirConciliaciones, type Documentos, type MovimientoBanco } from "./conciliacion.ts";

let fila = 0;
const mov = (id: string, fecha: string, descripcion: string, cargo: number, abono: number): MovimientoBanco => ({ id, fecha, fila: ++fila, descripcion, cargo, abono });
const NETPAY = "AAAAA01 SPEI. BANORTE. 072000000000000001. NET PAY SAPI DE C. VTAS";
const COM = "DOMI:     COM VTAS  1234567 DODO PIZZA 1-12345 - NET PAY SA";
const IVA = "DOMI:     IVA COM VTAS  1234567 DODO PIZZA 1-1 - NET PAY SA";
const RAPPI = "BBBBB02 SPEI. CITI MEXICO. 124000000000000002. TECNOLOGIAS R";
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
    mov("f", "2026-09-15", "(NB) Recepcion de cuenta: 000000000001. PRESTAMO EMPRESA", 0, 99999),
    mov("g", "2026-10-20", "MOVIMIENTO DESCONOCIDO", 50, 0),
  ], vacio);
  assert.deepEqual(s.map((x) => [x.movimientos[0], x.tipo, x.concepto]), [
    ["a", "sin_documento", "comisiones_bancarias"], ["b", "sin_documento", "comisiones_bancarias"], ["f", "sin_documento", "prestamo_recibido"],
    ["c", "sin_documento", "comisiones_bancarias"], ["d", "sin_documento", "imss_impuestos"], ["e", "sin_documento", "traspaso_interno"],
  ]);
  assert.ok(s.every((x) => x.nota.length > 0 && !x.exacta));
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
```

Registrar la prueba:

```bash
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.scripts.test=p.scripts.test.replace("lib/banca/rappi.test.ts ","lib/banca/rappi.test.ts lib/banca/conciliacion.test.ts ");fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
git diff package.json
```

Expected: el diff solo agrega esa ruta.

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test lib/banca/conciliacion.test.ts`
Expected: FAIL, no encuentra `./conciliacion.ts`. La prueba del catálogo seguirá fallando hasta Task 2, porque necesita el archivo de migración.

- [ ] **Step 3: Write the implementation**

`lib/banca/conciliacion.ts`:

```ts
/** Conciliación bancaria: conceptos de flujo y sugerencias (puras) del documento que corresponde a cada movimiento. Nada se guarda aquí. */
import type { CuentaPl } from "../finanzas/cuentas";

export const CONCEPTOS = [
  { clave: "cobranza_tarjeta", nombre: "Cobranza tarjeta (NetPay)", grupo: "operacion" },
  { clave: "cobranza_rappi", nombre: "Cobranza Rappi", grupo: "operacion" },
  { clave: "deposito_efectivo", nombre: "Depósito de efectivo", grupo: "operacion" },
  { clave: "proveedores", nombre: "Proveedores", grupo: "operacion" },
  { clave: "nomina", nombre: "Nómina", grupo: "operacion" },
  { clave: "imss_impuestos", nombre: "IMSS e impuestos", grupo: "operacion" },
  { clave: "renta", nombre: "Renta", grupo: "operacion" },
  { clave: "servicios", nombre: "Servicios", grupo: "operacion" },
  { clave: "marketing", nombre: "Marketing", grupo: "operacion" },
  { clave: "regalias", nombre: "Regalías", grupo: "operacion" },
  { clave: "comisiones_bancarias", nombre: "Comisiones bancarias", grupo: "operacion" },
  { clave: "comisiones_cobro", nombre: "Comisiones de cobro", grupo: "operacion" },
  { clave: "otros_operacion", nombre: "Otros de operación", grupo: "operacion" },
  { clave: "capex", nombre: "CapEx", grupo: "inversion" },
  { clave: "apertura", nombre: "Apertura y equipamiento", grupo: "inversion" },
  { clave: "prestamo_recibido", nombre: "Préstamo recibido", grupo: "financiamiento" },
  { clave: "pago_capital", nombre: "Pago de capital", grupo: "financiamiento" },
  { clave: "intereses", nombre: "Intereses", grupo: "financiamiento" },
  { clave: "traspaso_interno", nombre: "Traspaso interno (fuera del flujo)", grupo: "excluido" },
] as const;
export type Concepto = (typeof CONCEPTOS)[number]["clave"];
export const TIPOS = ["pago_proveedor", "cobro_tarjeta", "cobro_rappi", "nomina", "sin_documento"] as const;
export type TipoConciliacion = (typeof TIPOS)[number];

export type MovimientoBanco = { id: string; fecha: string; fila: number; descripcion: string; cargo: number; abono: number };
export type PagoCandidato = { id: string; fecha: string; monto: number; clabe: string | null; proveedor: string; cuenta: CuentaPl | null };
export type VentaTarjeta = { id: string; fecha: string; tarjeta: number };
export type LoteRappi = { importacionId: string; lote: string; neto: number };
export type Documentos = { pagos: readonly PagoCandidato[]; ventas: readonly VentaTarjeta[]; lotesRappi: readonly LoteRappi[] };
export type DocumentoSugerido =
  | { tipo: "pago"; id: string; monto: number; texto: string }
  | { tipo: "venta_dia"; id: string; monto: number; texto: string }
  | { tipo: "rappi_lote"; importacionId: string; lote: string; monto: number; texto: string };
export type DocumentoRpc = { tipo: "pago" | "venta_dia"; id: string } | { tipo: "rappi_lote"; importacion: string; lote: string };
export type Sugerencia = {
  tipo: TipoConciliacion; movimientos: string[]; documentos: DocumentoSugerido[]; concepto: Concepto;
  /** Movimientos − documentos (en cobro con tarjeta: depósito − venta con tarjeta); null sin documentos. */
  diferencia: number | null;
  /** Con documentos y diferencia 0: se puede confirmar en lote. */
  exacta: boolean;
  nota: string;
};

const c = (n: number) => Math.round(n * 100) / 100;
const dia = (f: string) => Date.parse(`${f}T00:00:00Z`) / 864e5;
const sumarDias = (f: string, n: number) => new Date((dia(f) + n) * 864e5).toISOString().slice(0, 10);

/** CLABE destino de un SPEI, en el formato del Excel ("SPEI. BANCO. CLABE.") o del PDF ("SPEI, BANCO, CLABE,"). */
export const clabeDestino = (descripcion: string) => descripcion.match(/SPEI[.,]\s*[^.,]+[.,]\s*(\d{18})[.,]/i)?.[1] ?? null;
const esNetPay = (m: MovimientoBanco) => m.abono > 0 && /NET PAY/i.test(m.descripcion) && !/DOMI:/i.test(m.descripcion);
const esComisionNetPay = (m: MovimientoBanco) => m.cargo > 0 && /DOMI:.*COM VTAS/i.test(m.descripcion);
const esRappi = (m: MovimientoBanco) => m.abono > 0 && /TECNOLOGIAS R/i.test(m.descripcion);
const esNomina = (m: MovimientoBanco) => m.cargo > 0 && /SPEI/i.test(m.descripcion) && /N[OÓ]MINA|\bQ\d{1,2}\b/i.test(m.descripcion);

export const conceptoDeCuenta = (cuenta: CuentaPl | null): Concepto =>
  cuenta === "renta" ? "renta" : cuenta === "servicios" ? "servicios"
    : cuenta === "marketing" || cuenta === "marketing_agregadores" ? "marketing" : cuenta === "inversiones" ? "capex" : "proveedores";

const REGLAS_TEXTO: readonly { patron: RegExp; lado: "cargo" | "abono" | "ambos"; concepto: Concepto; nota: string }[] = [
  { patron: /^\*?(IVA de )?Com\.|Comisi[oó]n Administraci[oó]n/i, lado: "cargo", concepto: "comisiones_bancarias", nota: "Comisión bancaria (regla de texto)." },
  { patron: /PAGO SUA|SIPARE/i, lado: "cargo", concepto: "imss_impuestos", nota: "Pago SUA/SIPARE (regla de texto)." },
  { patron: /Traspaso a cuenta/i, lado: "ambos", concepto: "traspaso_interno", nota: "Traspaso entre cuentas (regla de texto)." },
  { patron: /PRESTAMO/i, lado: "abono", concepto: "prestamo_recibido", nota: "Préstamo recibido (regla de texto)." },
];

export const documentosRpc = (docs: readonly DocumentoSugerido[]): DocumentoRpc[] =>
  docs.map((d) => (d.tipo === "rappi_lote" ? { tipo: d.tipo, importacion: d.importacionId, lote: d.lote } : { tipo: d.tipo, id: d.id }));

/** Sugerencias para movimientos aún no conciliados contra documentos aún no vinculados. Cada movimiento y documento aparece a lo más una vez. */
export function sugerirConciliaciones(movs: readonly MovimientoBanco[], docs: Documentos): Sugerencia[] {
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila - b.fila);
  const usados = new Set<string>(), pagosUsados = new Set<string>(), ventasUsadas = new Set<string>(), lotesUsados = new Set<string>();
  const out: Sugerencia[] = [];
  const agregar = (s: Omit<Sugerencia, "exacta">) => {
    s.movimientos.forEach((id) => usados.add(id));
    out.push({ ...s, exacta: s.documentos.length > 0 && s.diferencia === 0 });
  };

  // 1. NetPay: el depósito (venta bruta) contra la venta con tarjeta de 1 a 4 días anteriores; comisión e IVA del día, en orden de fila.
  //    Cada día de venta se usa una sola vez; un día sin venta (cerrado) no rompe la ventana.
  for (const d of orden.filter(esNetPay)) {
    const comisiones = orden.filter((m) => m.fecha === d.fecha && esComisionNetPay(m) && !usados.has(m.id)).slice(0, 2);
    const candidatas = docs.ventas.filter((v) => !ventasUsadas.has(v.id) && v.tarjeta > 0 && v.fecha < d.fecha && dia(d.fecha) - dia(v.fecha) <= 4);
    let mejor: VentaTarjeta[] | null = null, diferencia = 0;
    for (let n = 1; n <= 4; n++) {
      const ventana = candidatas.filter((v) => v.fecha >= sumarDias(d.fecha, -n)).sort((a, b) => a.fecha.localeCompare(b.fecha));
      if (!ventana.length) continue;
      const dif = c(d.abono - ventana.reduce((s, v) => s + v.tarjeta, 0));
      if (mejor === null || Math.abs(dif) < Math.abs(diferencia)) { mejor = ventana; diferencia = dif; }
    }
    if (!mejor) continue;
    mejor.forEach((v) => ventasUsadas.add(v.id));
    agregar({
      tipo: "cobro_tarjeta", movimientos: [d.id, ...comisiones.map((m) => m.id)], concepto: "cobranza_tarjeta", diferencia, nota: "",
      documentos: mejor.map((v) => ({ tipo: "venta_dia", id: v.id, monto: v.tarjeta, texto: `Venta con tarjeta del ${v.fecha}` })),
    });
  }

  // 2. Rappi: paidlot con el mismo neto; el depósito de validación (≤ $1) va sin documento.
  for (const m of orden.filter((x) => esRappi(x) && !usados.has(x.id))) {
    if (m.abono <= 1) {
      agregar({ tipo: "sin_documento", movimientos: [m.id], documentos: [], concepto: "otros_operacion", diferencia: null, nota: "Depósito de validación de cuenta de Rappi." });
      continue;
    }
    const l = docs.lotesRappi.find((x) => !lotesUsados.has(x.lote) && Math.abs(x.neto - m.abono) < 0.005);
    if (!l) continue;
    lotesUsados.add(l.lote);
    agregar({
      tipo: "cobro_rappi", movimientos: [m.id], concepto: "cobranza_rappi", diferencia: 0, nota: "",
      documentos: [{ tipo: "rappi_lote", importacionId: l.importacionId, lote: l.lote, monto: l.neto, texto: `Paidlot ${l.lote}` }],
    });
  }

  // 3. Nómina: un lote por día.
  const nominas = new Map<string, MovimientoBanco[]>();
  for (const m of orden) if (!usados.has(m.id) && esNomina(m)) nominas.set(m.fecha, [...(nominas.get(m.fecha) ?? []), m]);
  for (const [fecha, ms] of nominas)
    agregar({ tipo: "nomina", movimientos: ms.map((m) => m.id), documentos: [], concepto: "nomina", diferencia: null, nota: `Dispersión de nómina del ${fecha} (${ms.length} transferencias).` });

  // 4. Pagos a proveedores: misma CLABE, mismo monto, fecha ±5 días; el más cercano.
  for (const m of orden) {
    if (usados.has(m.id) || m.cargo <= 0) continue;
    const clabe = clabeDestino(m.descripcion);
    if (!clabe) continue;
    const distancia = (f: string) => Math.abs(dia(f) - dia(m.fecha));
    const p = docs.pagos.filter((x) => !pagosUsados.has(x.id) && x.clabe === clabe && Math.abs(x.monto - m.cargo) < 0.005 && distancia(x.fecha) <= 5)
      .sort((a, b) => distancia(a.fecha) - distancia(b.fecha))[0];
    if (!p) continue;
    pagosUsados.add(p.id);
    agregar({
      tipo: "pago_proveedor", movimientos: [m.id], concepto: conceptoDeCuenta(p.cuenta), diferencia: 0, nota: "",
      documentos: [{ tipo: "pago", id: p.id, monto: p.monto, texto: `Pago a ${p.proveedor} del ${p.fecha}` }],
    });
  }

  // 5. Reglas de texto, sin documento.
  for (const m of orden) {
    if (usados.has(m.id)) continue;
    const lado = m.cargo > 0 ? "cargo" : "abono";
    const r = REGLAS_TEXTO.find((x) => (x.lado === "ambos" || x.lado === lado) && x.patron.test(m.descripcion));
    if (r) agregar({ tipo: "sin_documento", movimientos: [m.id], documentos: [], concepto: r.concepto, diferencia: null, nota: r.nota });
    else if (esComisionNetPay(m)) agregar({ tipo: "sin_documento", movimientos: [m.id], documentos: [], concepto: "comisiones_cobro", diferencia: null, nota: "Comisión NetPay sin depósito sugerido el mismo día." });
  }
  return out;
}
```

Nota sobre el orden del resultado: las sugerencias salen por fecha y luego por fila (`fila` crece con cada `mov()`), por eso la prueba de reglas de texto espera `a, b, f` (15/09) antes que `c` (30/09).

- [ ] **Step 4: Run tests to verify they pass (except the catalog test)**

Run: `node --experimental-strip-types --test lib/banca/conciliacion.test.ts`
Expected: todas PASS salvo "catálogo: conceptos y tipos coinciden con la migración" (ENOENT: la migración llega en Task 2).

- [ ] **Step 5: Corregir la regla NetPay en el spec**

En `docs/superpowers/specs/2026-10-29-banca-conciliacion-design.md`:
- §3 "Montos": reemplazar "`cobro_tarjeta` compara `monto_documentos` contra **abono + cargos** (bruto antes de comisión)." por "`cobro_tarjeta` compara `monto_documentos` contra **el abono** (NetPay deposita la venta bruta y cobra comisión e IVA aparte el mismo día)."
- §4, fila NetPay: reemplazar "Bruto = abono + cargos." por "Se compara el abono (venta bruta) contra Σ `tarjeta`." y "Días candidatos: contiguos desde el día siguiente al último día cubierto por el depósito anterior hasta el día anterior al depósito;" por "Días candidatos: no usados por otro depósito, de 1 a 4 días antes del depósito;".
- §3 "Tipos y coherencia", fila `cobro_tarjeta`: reemplazar "1–7 `venta_dia` de días contiguos" por "`venta_dia` de hasta 7 días distintos, en un lapso de hasta 7 días, anteriores al depósito" (un día cerrado sin venta no debe impedir la conciliación).

- [ ] **Step 6: Commit**

```bash
git add lib/banca/conciliacion.ts lib/banca/conciliacion.test.ts package.json docs/superpowers/specs/2026-10-29-banca-conciliacion-design.md
git commit -m "feat(banca): conceptos de flujo y sugerencias de conciliación"
```

(La prueba del catálogo falla hasta Task 2: no correr `npm test` completo como condición de este commit. Sí correr `npm run typecheck`.)

---

### Task 2: Migración, prueba SQL y arnés PGlite

**Files:**
- Create: `supabase/migrations/20261029200000_banca_conciliacion.sql`
- Create: `supabase/pruebas/20261029200000_banca_conciliacion.sql`
- Create: `tests/bancaConciliacion.test.mjs`
- Modify: `package.json` (script `test`: agregar `tests/bancaConciliacion.test.mjs ` después de `tests/compromisosRecurrentes.test.mjs `)

**Interfaces:**
- Consumes: claves de `CONCEPTOS` y `TIPOS` (Task 1) — idénticas en los `check`.
- Produces (usados por Tasks 3–4):
  - tablas `banca_conciliaciones`, `banca_conciliacion_movimientos (conciliacion_id, movimiento_id, activa)`, `banca_conciliacion_documentos (conciliacion_id, tipo_documento, pago_id, ventas_dia_id, rappi_importacion_id, lote, nomina_real_id, monto, activa)`
  - vista `banca_por_conciliar` (columnas de `banca_movimientos`: `id, cuenta_id, fecha, fila_origen, descripcion, referencia, cargo, abono, saldo`)
  - RPC `conciliar_banca(p_solicitud uuid, p_movimientos uuid[], p_tipo text, p_concepto text, p_documentos jsonb, p_nota text) returns uuid`; `p_documentos` = arreglo de `{tipo:'pago'|'venta_dia'|'nomina_mes', id}` o `{tipo:'rappi_lote', importacion, lote}`
  - RPC `anular_conciliacion(p_id uuid, p_motivo text) returns void`

- [ ] **Step 1: Write the failing PGlite harness**

`tests/bancaConciliacion.test.mjs` (patrón de `tests/compromisosRecurrentes.test.mjs`: stubs mínimos que copian CHECK y enums reales, la migración real de Banregio, la nueva migración y la prueba SQL completa):

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const banregio=load('supabase/migrations/20261020230000_banca_banregio.sql');
const migracion=load('supabase/migrations/20261029200000_banca_conciliacion.sql');
const pruebas=load('supabase/pruebas/20261029200000_banca_conciliacion.sql');

// Lo mínimo de Supabase, Compras, Ventas, Rappi y Nómina que usan las migraciones; los CHECK y enums copian los reales.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum('cajero','encargado','gerente','admin','corporativo');
 create table perfiles(id uuid primary key,activo boolean not null default true,rol rol_usuario,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles(id,rol) values('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000c1','corporativo');
 create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function ve_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text in ('admin','corporativo'),false)$$;
 create table sucursales(id uuid primary key,nombre text);insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Centro');
 create table razones_sociales(rfc text primary key,razon_social text not null check(length(trim(razon_social))>0),activa boolean not null default true);
 insert into razones_sociales values('AAA010101AA1','EMPRESA DE PRUEBA',true);
 create table razon_social_sucursales(rfc text not null references razones_sociales(rfc),sucursal_id uuid not null references sucursales(id),primary key(rfc,sucursal_id));
 insert into razon_social_sucursales values('AAA010101AA1','00000000-0000-0000-0000-0000000000e1');
 create type forma_pago as enum('transferencia','efectivo','tarjeta','cheque');
 create table proveedores(id uuid primary key,clabe text);insert into proveedores values('00000000-0000-0000-0000-0000000000b1','002320000000000001');
 create table pagos(id uuid primary key default gen_random_uuid(),proveedor_id uuid not null references proveedores(id),fecha date not null,monto numeric(14,2) not null check(monto>0),forma forma_pago not null,anulado_en timestamptz);
 insert into pagos(proveedor_id,fecha,monto,forma) values('00000000-0000-0000-0000-0000000000b1','2026-10-06',4515.25,'transferencia');
 create table ventas_dia(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),fecha date not null,tarjeta numeric(12,2) not null default 0,unique(sucursal_id,fecha));
 insert into ventas_dia(sucursal_id,fecha,tarjeta) values('00000000-0000-0000-0000-0000000000e1','2026-10-05',2674);
 create table rappi_fin_importaciones(id uuid primary key,sucursal_id uuid not null references sucursales(id),rfc text not null references razones_sociales(rfc),reporte jsonb not null check(jsonb_typeof(reporte)='object'),sustituida_en timestamptz);
 insert into rappi_fin_importaciones values('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','AAA010101AA1','{"movimientos":[{"lote":"123456","neto":5000},{"lote":"123456","neto":843.11},{"lote":null,"neto":10}]}',null);
 create table nomina_reales(id uuid primary key default gen_random_uuid(),anulada_en timestamptz);`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(banregio);await db.exec(migracion);return db;};

test('conciliación bancaria: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('conciliación bancaria: solo lectura para la app y RPC solo para autenticados',async()=>{
 const db=await nueva();
 try{
  for(const t of ['banca_conciliaciones','banca_conciliacion_movimientos','banca_conciliacion_documentos'])
   for(const p of ['insert','update','delete'])
    assert.equal((await db.query(`select has_table_privilege('authenticated','${t}','${p}') ok`)).rows[0].ok,false,`${t} ${p}`);
  assert.equal((await db.query(`select has_function_privilege('anon','conciliar_banca(uuid,uuid[],text,text,jsonb,text)','execute') ok`)).rows[0].ok,false);
  assert.equal((await db.query(`select has_function_privilege('authenticated','conciliar_banca(uuid,uuid[],text,text,jsonb,text)','execute') ok`)).rows[0].ok,true);
 }finally{await db.close();}
});
```

Registrar:

```bash
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.scripts.test=p.scripts.test.replace("tests/compromisosRecurrentes.test.mjs ","tests/compromisosRecurrentes.test.mjs tests/bancaConciliacion.test.mjs ");fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
```

Si la migración de Banregio exige algo que la BASE no tiene (otra función o columna), agrégalo a la BASE **copiando la definición real** de `supabase/migrations/` y dilo en tu reporte.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/bancaConciliacion.test.mjs`
Expected: FAIL (ENOENT de la migración).

- [ ] **Step 3: Write the migration**

`supabase/migrations/20261029200000_banca_conciliacion.sql`:

```sql
-- Banca: conciliación documental de movimientos bancarios. No marca facturas pagadas ni crea ventas, pagos, saldos ni movimientos de caja.
begin;
set local lock_timeout='5s';
create table public.banca_conciliaciones (
 id uuid primary key,
 cuenta_id uuid not null references public.banca_cuentas(id),
 tipo text not null check(tipo in ('pago_proveedor','cobro_tarjeta','cobro_rappi','nomina','sin_documento')),
 concepto text not null check(concepto in ('cobranza_tarjeta','cobranza_rappi','deposito_efectivo','proveedores','nomina','imss_impuestos','renta','servicios','marketing','regalias','comisiones_bancarias','comisiones_cobro','otros_operacion','capex','apertura','prestamo_recibido','pago_capital','intereses','traspaso_interno')),
 nota text not null default '' check(length(nota)<=1000),
 monto_movimientos numeric(16,2) not null,
 monto_documentos numeric(16,2),
 diferencia numeric(16,2),
 solicitud jsonb not null,
 creado_por uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 anulada_por uuid references public.perfiles(id), anulada_en timestamptz, motivo_anulacion text,
 check((anulada_en is null)=(anulada_por is null)),
 check(anulada_en is null or length(trim(coalesce(motivo_anulacion,''))) between 5 and 1000),
 check(tipo<>'sin_documento' or length(trim(nota))>0),
 check(coalesce(diferencia,0)=0 or length(trim(nota))>0),
 check((monto_documentos is null)=(diferencia is null))
);
create index banca_conciliaciones_cuenta on public.banca_conciliaciones(cuenta_id,creado_en);
create table public.banca_conciliacion_movimientos (
 conciliacion_id uuid not null references public.banca_conciliaciones(id),
 movimiento_id uuid not null references public.banca_movimientos(id),
 activa boolean not null default true,
 primary key(conciliacion_id,movimiento_id)
);
create unique index banca_conciliacion_movimiento_activo on public.banca_conciliacion_movimientos(movimiento_id) where activa;
create table public.banca_conciliacion_documentos (
 id bigint generated always as identity primary key,
 conciliacion_id uuid not null references public.banca_conciliaciones(id),
 tipo_documento text not null check(tipo_documento in ('pago','venta_dia','rappi_lote','nomina_mes')),
 pago_id uuid references public.pagos(id),
 ventas_dia_id uuid references public.ventas_dia(id),
 rappi_importacion_id uuid references public.rappi_fin_importaciones(id),
 lote text check(lote is null or lote~'^\d{5,20}$'),
 nomina_real_id uuid references public.nomina_reales(id),
 monto numeric(16,2),
 activa boolean not null default true,
 check(num_nonnulls(pago_id,ventas_dia_id,rappi_importacion_id,nomina_real_id)=1),
 check((tipo_documento='pago')=(pago_id is not null)),
 check((tipo_documento='venta_dia')=(ventas_dia_id is not null)),
 check((tipo_documento='rappi_lote')=(rappi_importacion_id is not null)),
 check((tipo_documento='rappi_lote')=(lote is not null)),
 check((tipo_documento='nomina_mes')=(nomina_real_id is not null))
);
create index banca_conciliacion_documentos_conciliacion on public.banca_conciliacion_documentos(conciliacion_id);
create unique index banca_conciliacion_pago_activo on public.banca_conciliacion_documentos(pago_id) where activa and pago_id is not null;
create unique index banca_conciliacion_venta_activa on public.banca_conciliacion_documentos(ventas_dia_id) where activa and ventas_dia_id is not null;
create unique index banca_conciliacion_lote_activo on public.banca_conciliacion_documentos(lote) where activa and lote is not null;

alter table public.banca_conciliaciones enable row level security;
alter table public.banca_conciliacion_movimientos enable row level security;
alter table public.banca_conciliacion_documentos enable row level security;
revoke all on public.banca_conciliaciones,public.banca_conciliacion_movimientos,public.banca_conciliacion_documentos from public,anon,authenticated;
grant select on public.banca_conciliaciones,public.banca_conciliacion_movimientos,public.banca_conciliacion_documentos to authenticated;
create policy banca_conciliaciones_consulta on public.banca_conciliaciones for select to authenticated using(public.ve_compras());
create policy banca_conciliacion_movimientos_consulta on public.banca_conciliacion_movimientos for select to authenticated using(public.ve_compras());
create policy banca_conciliacion_documentos_consulta on public.banca_conciliacion_documentos for select to authenticated using(public.ve_compras());

create view public.banca_por_conciliar with(security_invoker=true) as
 select m.id,m.cuenta_id,m.fecha,m.fila_origen,m.descripcion,m.referencia,m.cargo,m.abono,m.saldo
 from public.banca_movimientos m
 where not exists(select 1 from public.banca_conciliacion_movimientos x where x.movimiento_id=m.id and x.activa);
revoke all on public.banca_por_conciliar from public,anon,authenticated;
grant select on public.banca_por_conciliar to authenticated;

create function public.conciliar_banca(p_solicitud uuid,p_movimientos uuid[],p_tipo text,p_concepto text,p_documentos jsonb,p_nota text)
returns uuid language plpgsql security definer set search_path='' as $$
<<conc>>
declare previa public.banca_conciliaciones; sol jsonb; docs jsonb:=coalesce(p_documentos,'[]'::jsonb); nota text:=trim(coalesce(p_nota,''));
 cuenta uuid; empresa text; n integer; cuentas integer; nabonos integer; ncargos integer; abonos numeric; cargos numeric;
 d jsonb; ndocs integer; tiposdoc text[]; monto numeric; k integer; montodocs numeric; dif numeric; fechas date[]; deposito date;
begin
 if public.mi_rol()::text is distinct from 'admin' then raise exception 'Solo administración concilia movimientos bancarios.';end if;
 if p_solicitud is null or coalesce(array_length(p_movimientos,1),0) not between 1 and 200 or jsonb_typeof(docs) is distinct from 'array' or jsonb_array_length(docs)>200 or length(nota)>1000 then
  raise exception 'Solicitud de conciliación inválida.';end if;
 sol:=jsonb_build_object('movimientos',(select jsonb_agg(x order by x) from unnest(p_movimientos) x),'tipo',p_tipo,'concepto',p_concepto,'documentos',docs,'nota',nota);
 perform pg_advisory_xact_lock(hashtextextended('banca-conciliacion:'||p_solicitud,0));
 select * into previa from public.banca_conciliaciones where id=p_solicitud;
 if found then
  if previa.creado_por<>auth.uid() or previa.solicitud is distinct from sol then raise exception 'La solicitud ya se utilizó con otros datos.';end if;
  return previa.id;
 end if;
 if (select count(distinct x) from unnest(p_movimientos) x)<>array_length(p_movimientos,1) then raise exception 'Hay movimientos repetidos en la solicitud.';end if;
 perform 1 from public.banca_movimientos m where m.id=any(p_movimientos) order by m.id for update;
 select count(*),count(distinct m.cuenta_id),min(m.cuenta_id::text)::uuid,count(*) filter(where m.abono>0),count(*) filter(where m.cargo>0),coalesce(sum(m.abono),0),coalesce(sum(m.cargo),0)
  into n,cuentas,cuenta,nabonos,ncargos,abonos,cargos from public.banca_movimientos m where m.id=any(p_movimientos);
 if n<>array_length(p_movimientos,1) then raise exception 'Algún movimiento no existe.';end if;
 if cuentas<>1 then raise exception 'Todos los movimientos deben ser de la misma cuenta.';end if;
 if exists(select 1 from public.banca_conciliacion_movimientos x where x.movimiento_id=any(p_movimientos) and x.activa) then
  raise exception 'Un movimiento ya está conciliado. Anula su conciliación antes de volver a conciliarlo.';end if;
 select c.rfc into empresa from public.banca_cuentas c where c.id=conc.cuenta;
 ndocs:=jsonb_array_length(docs);
 select coalesce(array_agg(distinct x->>'tipo'),'{}') into tiposdoc from jsonb_array_elements(docs) x;
 if p_tipo='pago_proveedor' then
  if nabonos>0 or ndocs=0 or tiposdoc<>array['pago'] then raise exception 'Un pago a proveedor concilia cargos con uno o más pagos.';end if;
 elsif p_tipo='cobro_tarjeta' then
  if nabonos<>1 or ndocs=0 or tiposdoc<>array['venta_dia'] then raise exception 'Un cobro con tarjeta concilia un depósito (y sus comisiones) con días de venta.';end if;
 elsif p_tipo='cobro_rappi' then
  if ncargos>0 or ndocs=0 or tiposdoc<>array['rappi_lote'] then raise exception 'Un cobro de Rappi concilia depósitos con paidlots.';end if;
 elsif p_tipo='nomina' then
  if nabonos>0 or (ndocs>0 and tiposdoc<>array['nomina_mes']) then raise exception 'La nómina concilia cargos, opcionalmente con su nómina real.';end if;
 elsif p_tipo='sin_documento' then
  if ndocs>0 then raise exception 'Una conciliación sin documento no lleva documentos.';end if;
  if nota='' then raise exception 'Escribe una nota para conciliar sin documento.';end if;
 else raise exception 'Tipo de conciliación inválido.';end if;

 insert into public.banca_conciliaciones(id,cuenta_id,tipo,concepto,nota,monto_movimientos,solicitud,creado_por)
  values(p_solicitud,cuenta,p_tipo,p_concepto,nota,abonos-cargos,sol,auth.uid());
 begin
  insert into public.banca_conciliacion_movimientos(conciliacion_id,movimiento_id) select p_solicitud,x from unnest(p_movimientos) x;
  for d in select * from jsonb_array_elements(docs) loop
   if d->>'tipo'='pago' then
    select p.monto into monto from public.pagos p where p.id=(d->>'id')::uuid and p.anulado_en is null and p.forma='transferencia';
    if monto is null then raise exception 'El pago no existe, está anulado o no es transferencia.';end if;
    insert into public.banca_conciliacion_documentos(conciliacion_id,tipo_documento,pago_id,monto) values(p_solicitud,'pago',(d->>'id')::uuid,-monto);
   elsif d->>'tipo'='venta_dia' then
    select v.tarjeta into monto from public.ventas_dia v join public.razon_social_sucursales s on s.sucursal_id=v.sucursal_id and s.rfc=conc.empresa where v.id=(d->>'id')::uuid;
    if monto is null then raise exception 'El día de venta no existe o no es de la razón social de la cuenta.';end if;
    insert into public.banca_conciliacion_documentos(conciliacion_id,tipo_documento,ventas_dia_id,monto) values(p_solicitud,'venta_dia',(d->>'id')::uuid,monto);
   elsif d->>'tipo'='rappi_lote' then
    select coalesce(sum((m->>'neto')::numeric),0),count(*) into monto,k from public.rappi_fin_importaciones i cross join lateral jsonb_array_elements(i.reporte->'movimientos') m
     where i.id=(d->>'importacion')::uuid and i.sustituida_en is null and i.rfc=conc.empresa and m->>'lote'=d->>'lote';
    if k=0 then raise exception 'El paidlot no existe en un reporte vigente de la razón social de la cuenta.';end if;
    insert into public.banca_conciliacion_documentos(conciliacion_id,tipo_documento,rappi_importacion_id,lote,monto) values(p_solicitud,'rappi_lote',(d->>'importacion')::uuid,d->>'lote',round(monto,2));
   elsif d->>'tipo'='nomina_mes' then
    if not exists(select 1 from public.nomina_reales r where r.id=(d->>'id')::uuid and r.anulada_en is null) then raise exception 'La nómina real no existe o está anulada.';end if;
    insert into public.banca_conciliacion_documentos(conciliacion_id,tipo_documento,nomina_real_id) values(p_solicitud,'nomina_mes',(d->>'id')::uuid);
   else raise exception 'Tipo de documento inválido.';
   end if;
  end loop;
 exception when unique_violation then raise exception 'Un movimiento o documento ya está conciliado.';
 end;

 if p_tipo='cobro_tarjeta' then
  select array_agg(distinct v.fecha order by v.fecha) into fechas from public.banca_conciliacion_documentos x join public.ventas_dia v on v.id=x.ventas_dia_id where x.conciliacion_id=p_solicitud;
  select m.fecha into deposito from public.banca_movimientos m where m.id=any(p_movimientos) and m.abono>0;
  if array_length(fechas,1)>7 or fechas[array_length(fechas,1)]-fechas[1]>6 then raise exception 'Los días de venta deben caer en un lapso de hasta 7 días.';end if;
  if fechas[array_length(fechas,1)]>=deposito then raise exception 'Los días de venta deben ser anteriores al depósito.';end if;
 end if;

 select sum(x.monto),count(x.monto) into montodocs,k from public.banca_conciliacion_documentos x where x.conciliacion_id=p_solicitud;
 if k>0 then
  dif:=case when p_tipo='cobro_tarjeta' then abonos-montodocs else abonos-cargos-montodocs end;
  if round(dif,2)<>0 and nota='' then raise exception 'Hay una diferencia de %; escribe una nota para conciliar.',round(dif,2);end if;
  update public.banca_conciliaciones set monto_documentos=round(montodocs,2),diferencia=round(dif,2) where id=p_solicitud;
 end if;
 return p_solicitud;
end$$;

create function public.anular_conciliacion(p_id uuid,p_motivo text) returns void language plpgsql security definer set search_path='' as $$
declare motivo text:=trim(coalesce(p_motivo,''));
begin
 if public.mi_rol()::text is distinct from 'admin' then raise exception 'Solo administración anula conciliaciones.';end if;
 if length(motivo) not between 5 and 1000 then raise exception 'Escribe el motivo de la anulación (5 a 1,000 caracteres).';end if;
 perform 1 from public.banca_conciliaciones where id=p_id and anulada_en is null for update;
 if not found then raise exception 'La conciliación no existe o ya está anulada.';end if;
 update public.banca_conciliaciones set anulada_en=now(),anulada_por=auth.uid(),motivo_anulacion=motivo where id=p_id;
 update public.banca_conciliacion_movimientos set activa=false where conciliacion_id=p_id;
 update public.banca_conciliacion_documentos set activa=false where conciliacion_id=p_id;
end$$;

revoke all on function public.conciliar_banca(uuid,uuid[],text,text,jsonb,text),public.anular_conciliacion(uuid,text) from public,anon;
grant execute on function public.conciliar_banca(uuid,uuid[],text,text,jsonb,text),public.anular_conciliacion(uuid,text) to authenticated;
commit;
```

- [ ] **Step 4: Write the SQL test**

`supabase/pruebas/20261029200000_banca_conciliacion.sql`:

```sql
-- Ejecutar completo después de 20261029200000_banca_conciliacion.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Usa un admin activo, una razón social con un día de venta con tarjeta y un pago por transferencia ya registrados; crea una cuenta y movimientos de prueba.
do $$
declare a uuid; empresa text; vd record; pg record; rp record; c uuid; imp uuid:=gen_random_uuid();
 m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid; m7 uuid; m8 uuid; k1 uuid:=gen_random_uuid(); k uuid; kp uuid; ok boolean; x public.banca_conciliaciones;
 dv jsonb; dp jsonb; f date;
begin
 select p.id into a from public.perfiles p where p.activo and p.rol::text='admin' and not p.debe_cambiar_contrasena limit 1;
 select e.rfc into empresa from public.razones_sociales e where e.activa and exists(
  select 1 from public.razon_social_sucursales s join public.ventas_dia v on v.sucursal_id=s.sucursal_id where s.rfc=e.rfc and v.tarjeta>0
  and not exists(select 1 from public.banca_conciliacion_documentos z where z.ventas_dia_id=v.id and z.activa)) limit 1;
 select v.id,v.fecha,v.tarjeta into vd from public.ventas_dia v join public.razon_social_sucursales s on s.sucursal_id=v.sucursal_id
  where s.rfc=empresa and v.tarjeta>0 and not exists(select 1 from public.banca_conciliacion_documentos z where z.ventas_dia_id=v.id and z.activa) order by v.fecha desc limit 1;
 select p.id,p.monto into pg from public.pagos p where p.anulado_en is null and p.forma='transferencia'
  and not exists(select 1 from public.banca_conciliacion_documentos z where z.pago_id=p.id and z.activa) order by p.fecha desc limit 1;
 if a is null or empresa is null or vd.id is null or pg.id is null then
  raise exception 'FALTAN DATOS: admin activo, razón social con venta con tarjeta sin conciliar y un pago por transferencia sin conciliar.';end if;
 f:=vd.fecha+1;

 -- Cuenta, importación y movimientos de prueba (se revierten al final).
 insert into public.banca_cuentas(banco,numero,clabe,rfc,moneda,titular_fuente,creado_por) values('banregio','999999999901','058999999999999901',empresa,'MXN','PRUEBA',a) returning id into c;
 insert into public.banca_importaciones(id,cuenta_id,archivo,sha256,solicitud,periodo_desde,periodo_hasta,primera_fecha,ultima_fecha,saldo_inicial,saldo_final,cargos,abonos,movimientos,nuevos,repetidos,creado_por)
  values(imp,c,'prueba.xlsx',repeat('a',64),'{}',f,f,f,f,0,vd.tarjeta+1000-(11.6+pg.monto+50+25),11.6+pg.monto+50+25,vd.tarjeta+1000,7,7,0,a);
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,1,'SPEI. BANORTE. 072000000000000001. NET PAY SAPI DE C','_','PRUEBA',0,vd.tarjeta,0,'h1',imp) returning id into m1;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,2,'DOMI: COM VTAS','_','PRUEBA',10,0,0,'h2',imp) returning id into m2;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,3,'DOMI: IVA COM VTAS','_','PRUEBA',1.6,0,0,'h3',imp) returning id into m3;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,4,'SPEI. BANCO. 002000000000000001. PROVEEDOR','_','PRUEBA',pg.monto,0,0,'h4',imp) returning id into m4;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,5,'*Com. Contratación','_','PRUEBA',50,0,0,'h5',imp) returning id into m5;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,6,'PRESTAMO','_','PRUEBA',0,1000,0,'h6',imp) returning id into m6;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,7,'SPEI. BANCO. 002000000000000001. PROVEEDOR','_','PRUEBA',25,0,0,'h7',imp) returning id into m7;
 dv:=jsonb_build_array(jsonb_build_object('tipo','venta_dia','id',vd.id));
 dp:=jsonb_build_array(jsonb_build_object('tipo','pago','id',pg.id));

 -- 1. Sin sesión de admin: rechazado.
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','comisiones_bancarias','[]','x'); exception when others then ok:=sqlerrm like 'Solo administración%'; end;
 if not ok then raise exception 'FALLÓ: concilió sin ser admin';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

 -- 2. Cobro con tarjeta exacto: depósito contra venta con tarjeta; comisión e IVA incluidos.
 k:=public.conciliar_banca(k1,array[m1,m2,m3],'cobro_tarjeta','cobranza_tarjeta',dv,'');
 select * into x from public.banca_conciliaciones where id=k;
 if k<>k1 or x.monto_movimientos<>round(vd.tarjeta-11.6,2) or x.monto_documentos<>vd.tarjeta or x.diferencia<>0 then raise exception 'FALLÓ: cobro con tarjeta % % %',x.monto_movimientos,x.monto_documentos,x.diferencia;end if;

 -- 3. Idempotencia: misma solicitud y datos devuelve el mismo id; otros datos se rechazan.
 if public.conciliar_banca(k1,array[m3,m2,m1],'cobro_tarjeta','cobranza_tarjeta',dv,'') is distinct from k1 then raise exception 'FALLÓ: idempotencia';end if;
 ok:=false; begin perform public.conciliar_banca(k1,array[m1,m2,m3],'cobro_tarjeta','cobranza_tarjeta',dv,'otra nota'); exception when others then ok:=sqlerrm like 'La solicitud ya se utilizó%'; end;
 if not ok then raise exception 'FALLÓ: solicitud reutilizada con otros datos';end if;

 -- 4. Doble vínculo: el movimiento y el día de venta ya conciliados se rechazan.
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m1],'sin_documento','otros_operacion','[]','x'); exception when others then ok:=sqlerrm like '%ya está conciliado%'; end;
 if not ok then raise exception 'FALLÓ: movimiento conciliado dos veces';end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m6],'cobro_tarjeta','cobranza_tarjeta',dv,'x'); exception when others then ok:=sqlerrm like '%ya está conciliado%' or sqlerrm like 'Los días de venta%'; end;
 if not ok then raise exception 'FALLÓ: día de venta conciliado dos veces';end if;

 -- 5. Coherencia de tipo, concepto y documentos.
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m6],'pago_proveedor','proveedores',dp,''); exception when others then ok:=sqlerrm like 'Un pago a proveedor%'; end;
 if not ok then raise exception 'FALLÓ: pago a proveedor con un abono';end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m6],'cobro_tarjeta','cobranza_tarjeta','[]',''); exception when others then ok:=sqlerrm like 'Un cobro con tarjeta%'; end;
 if not ok then raise exception 'FALLÓ: cobro con tarjeta sin días de venta';end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','comisiones_bancarias',dp,'x'); exception when others then ok:=sqlerrm like 'Una conciliación sin documento%'; end;
 if not ok then raise exception 'FALLÓ: sin documento con documentos';end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','inventado','[]','x'); exception when check_violation then ok:=true; end;
 if not ok then raise exception 'FALLÓ: concepto fuera del catálogo';end if;

 -- 6. Sin documento exige nota.
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','comisiones_bancarias','[]','  '); exception when others then ok:=sqlerrm like 'Escribe una nota%'; end;
 if not ok then raise exception 'FALLÓ: sin documento sin nota';end if;
 perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','comisiones_bancarias','[]','Comisión bancaria');
 perform public.conciliar_banca(gen_random_uuid(),array[m6],'sin_documento','prestamo_recibido','[]','Préstamo de prueba');

 -- 7. Pago a proveedor exacto; el pago no se puede vincular dos veces.
 kp:=public.conciliar_banca(gen_random_uuid(),array[m4],'pago_proveedor','proveedores',dp,'');
 select * into x from public.banca_conciliaciones where id=kp;
 if x.monto_documentos<>-pg.monto or x.diferencia<>0 then raise exception 'FALLÓ: pago a proveedor % %',x.monto_documentos,x.diferencia;end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m7],'pago_proveedor','proveedores',dp,'x'); exception when others then ok:=sqlerrm like '%ya está conciliado%'; end;
 if not ok then raise exception 'FALLÓ: pago vinculado dos veces';end if;

 -- 8. Anular: solo admin, con motivo; libera movimiento y pago.
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 ok:=false; begin perform public.anular_conciliacion(kp,'motivo de prueba'); exception when others then ok:=sqlerrm like 'Solo administración%'; end;
 if not ok then raise exception 'FALLÓ: anuló sin ser admin';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 ok:=false; begin perform public.anular_conciliacion(kp,'no'); exception when others then ok:=sqlerrm like 'Escribe el motivo%'; end;
 if not ok then raise exception 'FALLÓ: anuló sin motivo';end if;
 perform public.anular_conciliacion(kp,'Prueba de anulación');
 if exists(select 1 from public.banca_conciliacion_movimientos where conciliacion_id=kp and activa) or exists(select 1 from public.banca_conciliacion_documentos where conciliacion_id=kp and activa) then raise exception 'FALLÓ: la anulación no liberó vínculos';end if;
 if not exists(select 1 from public.banca_por_conciliar where id=m4) or exists(select 1 from public.banca_por_conciliar where id=m1) then raise exception 'FALLÓ: vista de movimientos por conciliar';end if;
 ok:=false; begin perform public.anular_conciliacion(kp,'Otra vez'); exception when others then ok:=sqlerrm like '%ya está anulada%'; end;
 if not ok then raise exception 'FALLÓ: anuló dos veces';end if;

 -- 9. Diferencia: exige nota; con nota se guarda calculada en el servidor.
 if pg.monto<>25 then
  ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m7],'pago_proveedor','proveedores',dp,''); exception when others then ok:=sqlerrm like 'Hay una diferencia%'; end;
  if not ok then raise exception 'FALLÓ: diferencia sin nota';end if;
  k:=public.conciliar_banca(gen_random_uuid(),array[m7],'pago_proveedor','proveedores',dp,'Pago parcial de prueba');
  select * into x from public.banca_conciliaciones where id=k;
  if x.diferencia<>round(pg.monto-25,2) then raise exception 'FALLÓ: diferencia calculada %',x.diferencia;end if;
 end if;

 -- 10. Rappi por paidlot (si hay un reporte vigente de la razón social con paidlot sin conciliar).
 select i.id as importacion,mv->>'lote' as lote,sum((mv->>'neto')::numeric) as neto into rp from public.rappi_fin_importaciones i cross join lateral jsonb_array_elements(i.reporte->'movimientos') mv
  where i.rfc=empresa and i.sustituida_en is null and mv->>'lote' is not null
  and not exists(select 1 from public.banca_conciliacion_documentos z where z.lote=mv->>'lote' and z.activa)
  group by i.id,mv->>'lote' having sum((mv->>'neto')::numeric)>0 limit 1;
 if rp.lote is not null then
  insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,8,'SPEI. CITI MEXICO. 124000000000000002. TECNOLOGIAS R','_','PRUEBA',0,round(rp.neto,2),0,'h8',imp) returning id into m8;
  k:=public.conciliar_banca(gen_random_uuid(),array[m8],'cobro_rappi','cobranza_rappi',jsonb_build_array(jsonb_build_object('tipo','rappi_lote','importacion',rp.importacion,'lote',rp.lote)),'');
  select * into x from public.banca_conciliaciones where id=k;
  if x.diferencia<>0 then raise exception 'FALLÓ: Rappi por paidlot %',x.diferencia;end if;
 else raise notice 'Sin reporte Rappi vigente con paidlot: se omite la prueba de paidlot.';
 end if;

 -- 11. Sin escritura directa desde la app.
 if has_table_privilege('authenticated','public.banca_conciliaciones','insert') or has_table_privilege('authenticated','public.banca_conciliacion_movimientos','insert') or has_table_privilege('authenticated','public.banca_conciliacion_documentos','insert') then
  raise exception 'FALLÓ: escritura directa permitida';end if;

 raise exception 'PRUEBAS OK';
end$$;
```

- [ ] **Step 5: Run PGlite and the catalog test**

Run: `node --test tests/bancaConciliacion.test.mjs && node --experimental-strip-types --test lib/banca/conciliacion.test.ts`
Expected: PASS (2 + 13). Si la prueba SQL falla con "FALLÓ: …", corrige la migración (no la prueba) salvo que la prueba contradiga el spec; repórtalo.

- [ ] **Step 6: Full suite and commit**

Run: `npm test && npm run typecheck`
Expected: todo PASS.

```bash
git add supabase/migrations/20261029200000_banca_conciliacion.sql supabase/pruebas/20261029200000_banca_conciliacion.sql tests/bancaConciliacion.test.mjs package.json
git commit -m "feat(banca): migración de conciliación bancaria con pruebas SQL"
```

---

### Task 3: Cargador de datos y acciones del servidor

**Files:**
- Create: `app/banca/conciliacion/datos.ts`
- Create: `app/banca/conciliacion/acciones.ts`

**Interfaces:**
- Consumes: `sugerirConciliaciones`, `documentosRpc`, `TIPOS`, `CONCEPTOS` y tipos (Task 1); tablas, vista y RPC (Task 2); `leerTodo` (`lib/ventas/paginar`), `obtenerPerfil` (`lib/contexto`).
- Produces (Task 4):
  - `leerConciliacion(db, cuenta: { id: string; rfc: string }, desde: string, hasta: string)` → `{ pendientes: MovimientoBanco[]; sugerencias: Sugerencia[]; conciliadas: ConciliacionVista[]; pagos: PagoCandidato[]; movimiento: (id: string) => MovimientoBanco | undefined }`
  - `type ConciliacionVista = { id; tipo; concepto; nota; monto_movimientos; monto_documentos: number | null; diferencia: number | null; creado_en; movimientos: MovimientoBanco[] }`
  - Server actions `conciliarMovimientos(fd)`, `confirmarExactas(fd)`, `anularConciliacionBanca(fd)`. Todas terminan en `redirect()` a `/banca?vista=conciliacion&cuenta=…&desde=…&hasta=…` con `ok=<texto>` o `error=<texto>` (máx. 300 caracteres).

- [ ] **Step 1: `datos.ts`**

Primero confirma con `grep -n "create table proveedores" -A30 supabase/migrations/0011_compras_proveedores.sql` el nombre de la columna del nombre del proveedor (`nombre`, `razon_social` o similar) y úsala en el `select` de pagos.

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import { sugerirConciliaciones, type LoteRappi, type MovimientoBanco, type PagoCandidato, type Sugerencia, type VentaTarjeta } from "@/lib/banca/conciliacion";
import type { CuentaPl } from "@/lib/finanzas/cuentas";

export type ConciliacionVista = {
  id: string; tipo: string; concepto: string; nota: string; monto_movimientos: number; monto_documentos: number | null; diferencia: number | null;
  creado_en: string; movimientos: MovimientoBanco[];
};
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const trozos = <T,>(xs: readonly T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
type Fila = { id: string; fecha: string; fila_origen: number; descripcion: string; cargo: number; abono: number };
const aMovimiento = (m: Fila): MovimientoBanco => ({ id: m.id, fecha: m.fecha, fila: m.fila_origen, descripcion: m.descripcion, cargo: Number(m.cargo), abono: Number(m.abono) });

/** Movimientos del periodo por conciliar, sus sugerencias, lo conciliado y los pagos disponibles para vincular a mano. */
export async function leerConciliacion(db: SupabaseClient, cuenta: { id: string; rfc: string }, desde: string, hasta: string) {
  const falla = (que: string) => { throw Error(`No se pudo consultar ${que}. Verifica que la migración de conciliación esté instalada.`); };
  const [pend, links, rss, lotes] = await Promise.all([
    leerTodo<Fila>((a, b) => db.from("banca_por_conciliar").select("id,fecha,fila_origen,descripcion,cargo,abono").eq("cuenta_id", cuenta.id)
      .gte("fecha", desde).lte("fecha", hasta).order("fecha").order("fila_origen").range(a, b).returns<Fila[]>()),
    leerTodo<{ conciliacion_id: string; banca_movimientos: Fila & { cuenta_id: string } }>((a, b) => db.from("banca_conciliacion_movimientos")
      .select("conciliacion_id,banca_movimientos!inner(id,fecha,fila_origen,descripcion,cargo,abono,cuenta_id)").eq("activa", true)
      .eq("banca_movimientos.cuenta_id", cuenta.id).gte("banca_movimientos.fecha", desde).lte("banca_movimientos.fecha", hasta)
      .order("conciliacion_id").range(a, b).returns<{ conciliacion_id: string; banca_movimientos: Fila & { cuenta_id: string } }[]>()),
    db.from("razon_social_sucursales").select("sucursal_id").eq("rfc", cuenta.rfc).returns<{ sucursal_id: string }[]>(),
    db.from("rappi_fin_importaciones").select("id,reporte").eq("rfc", cuenta.rfc).is("sustituida_en", null).returns<{ id: string; reporte: { movimientos?: { lote: string | null; neto: number }[] } }[]>(),
  ]);
  if (rss.error) falla("las sucursales de la razón social");
  if (lotes.error) falla("los reportes de Rappi");

  const ids = [...new Set(links.map((l) => l.conciliacion_id))];
  const conc: Omit<ConciliacionVista, "movimientos">[] = [];
  for (const t of trozos(ids)) {
    const r = await db.from("banca_conciliaciones").select("id,tipo,concepto,nota,monto_movimientos,monto_documentos,diferencia,creado_en").in("id", t).is("anulada_en", null)
      .returns<Omit<ConciliacionVista, "movimientos">[]>();
    if (r.error) falla("las conciliaciones");
    conc.push(...(r.data ?? []));
  }
  const conciliadas: ConciliacionVista[] = conc.map((x) => ({ ...x, movimientos: links.filter((l) => l.conciliacion_id === x.id).map((l) => aMovimiento(l.banca_movimientos)) }))
    .sort((a, b) => (b.movimientos[0]?.fecha ?? "").localeCompare(a.movimientos[0]?.fecha ?? ""));

  // Documentos candidatos: ventas hasta 7 días antes del periodo (un depósito del día 1 liquida el mes anterior), pagos ±30 días, paidlots vigentes.
  const sucursales = (rss.data ?? []).map((s) => s.sucursal_id);
  const [ventasRaw, pagosRaw] = await Promise.all([
    sucursales.length ? leerTodo<VentaTarjeta>((a, b) => db.from("ventas_dia").select("id,fecha,tarjeta").in("sucursal_id", sucursales).gt("tarjeta", 0)
      .gte("fecha", sumarDias(desde, -7)).lte("fecha", hasta).order("fecha").order("id").range(a, b).returns<VentaTarjeta[]>()) : Promise.resolve([] as VentaTarjeta[]),
    leerTodo<{ id: string; fecha: string; monto: number; proveedores: { nombre: string; clabe: string | null } | null; pago_aplicaciones: { monto: number; facturas: { cuenta_pl: CuentaPl | null } | null }[] }>((a, b) =>
      db.from("pagos").select("id,fecha,monto,proveedores(nombre,clabe),pago_aplicaciones(monto,facturas(cuenta_pl))").is("anulado_en", null).eq("forma", "transferencia")
        .gte("fecha", sumarDias(desde, -30)).lte("fecha", sumarDias(hasta, 30)).order("fecha").order("id").range(a, b)
        .returns<{ id: string; fecha: string; monto: number; proveedores: { nombre: string; clabe: string | null } | null; pago_aplicaciones: { monto: number; facturas: { cuenta_pl: CuentaPl | null } | null }[] }[]>()),
  ]);
  const usados = async (col: "ventas_dia_id" | "pago_id" | "lote", valores: string[]) => {
    const s = new Set<string>();
    for (const t of trozos(valores)) {
      const r = await db.from("banca_conciliacion_documentos").select(col).eq("activa", true).in(col, t).returns<Record<string, string>[]>();
      if (r.error) falla("los documentos conciliados");
      for (const x of r.data ?? []) s.add(x[col]);
    }
    return s;
  };
  const lotesRappi: LoteRappi[] = [];
  for (const i of lotes.data ?? []) {
    const suma = new Map<string, number>();
    for (const m of i.reporte.movimientos ?? []) if (m.lote) suma.set(m.lote, (suma.get(m.lote) ?? 0) + Number(m.neto));
    for (const [lote, neto] of suma) lotesRappi.push({ importacionId: i.id, lote, neto: Math.round(neto * 100) / 100 });
  }
  const [ventasUsadas, pagosUsados, lotesUsados] = await Promise.all([
    usados("ventas_dia_id", ventasRaw.map((v) => v.id)), usados("pago_id", pagosRaw.map((p) => p.id)), usados("lote", lotesRappi.map((l) => l.lote)),
  ]);
  const pagos: PagoCandidato[] = pagosRaw.filter((p) => !pagosUsados.has(p.id)).map((p) => ({
    id: p.id, fecha: p.fecha, monto: Number(p.monto), clabe: p.proveedores?.clabe ?? null, proveedor: p.proveedores?.nombre ?? "Proveedor",
    cuenta: [...p.pago_aplicaciones].sort((a, b) => Number(b.monto) - Number(a.monto))[0]?.facturas?.cuenta_pl ?? null,
  }));
  const pendientes = pend.map(aMovimiento);
  const sugerencias: Sugerencia[] = sugerirConciliaciones(pendientes, {
    pagos, ventas: ventasRaw.filter((v) => !ventasUsadas.has(v.id)).map((v) => ({ ...v, tarjeta: Number(v.tarjeta) })),
    lotesRappi: lotesRappi.filter((l) => !lotesUsados.has(l.lote) && l.neto > 0),
  });
  const porId = new Map(pendientes.map((m) => [m.id, m]));
  return { pendientes, sugerencias, conciliadas, pagos, movimiento: (id: string) => porId.get(id) };
}
```

- [ ] **Step 2: `acciones.ts`**

```ts
"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { CONCEPTOS, TIPOS, documentosRpc } from "@/lib/banca/conciliacion";
import { leerConciliacion } from "./datos";

const UUID = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const volver = (fd: FormData, aviso: { ok?: string; error?: string }): never => {
  const p = new URLSearchParams({ vista: "conciliacion" });
  for (const k of ["cuenta", "desde", "hasta"]) { const v = texto(fd, k); if (v && (k === "cuenta" ? UUID : FECHA).test(v)) p.set(k, v); }
  if (aviso.ok) p.set("ok", aviso.ok.slice(0, 300));
  if (aviso.error) p.set("error", aviso.error.slice(0, 300));
  revalidatePath("/banca");
  redirect(`/banca?${p}`);
};
const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo conciliar.");

async function admin() {
  const { supabase, perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") throw Error("Solo administración concilia movimientos bancarios.");
  return supabase;
}

/** Una conciliación: movimientos, tipo, concepto, documentos y nota del formulario; la base valida y calcula montos. */
export async function conciliarMovimientos(fd: FormData) {
  let aviso: { ok?: string; error?: string };
  try {
    const db = await admin();
    const solicitud = texto(fd, "solicitud"), movimientos = texto(fd, "movimientos").split(",").filter(Boolean);
    const tipo = texto(fd, "tipo"), concepto = texto(fd, "concepto"), nota = texto(fd, "nota"), pago = texto(fd, "pago");
    // El formulario manual de pago manda el pago elegido en `pago`; las sugerencias mandan `documentos` ya armados.
    const documentos = tipo === "pago_proveedor" && UUID.test(pago) && !texto(fd, "documentos") ? [{ tipo: "pago", id: pago }] : JSON.parse(texto(fd, "documentos") || "[]");
    if (!UUID.test(solicitud) || !movimientos.length || movimientos.length > 200 || !movimientos.every((m) => UUID.test(m))
      || !(TIPOS as readonly string[]).includes(tipo) || !CONCEPTOS.some((c) => c.clave === concepto) || !Array.isArray(documentos) || documentos.length > 200 || nota.length > 1000)
      throw Error("Revisa los datos de la conciliación.");
    const { error } = await db.rpc("conciliar_banca", { p_solicitud: solicitud, p_movimientos: movimientos, p_tipo: tipo, p_concepto: concepto, p_documentos: documentos, p_nota: nota });
    if (error) throw Error(error.message);
    aviso = { ok: "Conciliación guardada." };
  } catch (e) { aviso = { error: mensaje(e) }; }
  volver(fd, aviso);
}

/** Recalcula las sugerencias del periodo y confirma las exactas (con documento y diferencia 0); repetirla no duplica nada. */
export async function confirmarExactas(fd: FormData) {
  let aviso: { ok?: string; error?: string };
  try {
    const db = await admin();
    const cuentaId = texto(fd, "cuenta"), desde = texto(fd, "desde"), hasta = texto(fd, "hasta");
    if (!UUID.test(cuentaId) || !FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) throw Error("Revisa la cuenta y el periodo.");
    const { data: cuenta, error } = await db.from("banca_cuentas").select("id,rfc").eq("id", cuentaId).single<{ id: string; rfc: string }>();
    if (error || !cuenta) throw Error("No se encontró la cuenta.");
    const { sugerencias } = await leerConciliacion(db, cuenta, desde, hasta);
    let n = 0;
    const fallas: string[] = [];
    for (const s of sugerencias.filter((x) => x.exacta)) {
      const r = await db.rpc("conciliar_banca", { p_solicitud: randomUUID(), p_movimientos: s.movimientos, p_tipo: s.tipo, p_concepto: s.concepto, p_documentos: documentosRpc(s.documentos), p_nota: s.nota });
      if (r.error) fallas.push(r.error.message); else n++;
    }
    aviso = fallas.length ? { error: `${n} confirmadas; ${fallas.length} no: ${fallas[0]}` } : { ok: `${n} conciliaciones confirmadas.` };
  } catch (e) { aviso = { error: mensaje(e) }; }
  volver(fd, aviso);
}

export async function anularConciliacionBanca(fd: FormData) {
  let aviso: { ok?: string; error?: string };
  try {
    const db = await admin();
    const id = texto(fd, "id"), motivo = texto(fd, "motivo");
    if (!UUID.test(id)) throw Error("Conciliación inválida.");
    const { error } = await db.rpc("anular_conciliacion", { p_id: id, p_motivo: motivo });
    if (error) throw Error(error.message);
    aviso = { ok: "Conciliación anulada; sus movimientos vuelven a estar por conciliar." };
  } catch (e) { aviso = { error: mensaje(e) }; }
  volver(fd, aviso);
}
```

`redirect()` lanza internamente; por eso `volver` se llama **fuera** del `try`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores. Si el tipo de `leerTodo` difiere del que usa este código, ajusta la llamada al patrón de `app/finanzas/datos.ts`.

- [ ] **Step 4: Commit**

```bash
git add app/banca/conciliacion/datos.ts app/banca/conciliacion/acciones.ts
git commit -m "feat(banca): datos y acciones de conciliación bancaria"
```

---

### Task 4: Pantalla Banca → Conciliación

**Files:**
- Create: `app/banca/conciliacion/Panel.tsx`
- Modify: `app/banca/banca.module.css` (clases `tarjetas`, `tarjeta`, `filaMovimiento`, `diferencia`, `formularioLinea`)
- Modify: `app/banca/page.tsx` (render de `vista=conciliacion`; indicador "Por conciliar")
- Modify: `app/banca/Banregio.tsx` (texto de la nota final)

**Interfaces:**
- Consumes: `leerConciliacion`, acciones (Task 3); `CONCEPTOS`, `documentosRpc` (Task 1); `CuentaBanca`, `FiltrosBanca` (`app/banca/Banregio.tsx`); `pesos`, `fechaTexto`, `hoyCalendarioMX` (`lib/formato`).
- Produces: `Conciliacion({ db, cuentas, edita, q })` (server component).

- [ ] **Step 1: `Panel.tsx`**

```tsx
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CONCEPTOS, documentosRpc, type MovimientoBanco, type Sugerencia } from "@/lib/banca/conciliacion";
import { fechaTexto, hoyCalendarioMX, pesos } from "@/lib/formato";
import type { CuentaBanca, FiltrosBanca } from "../Banregio";
import { anularConciliacionBanca, conciliarMovimientos, confirmarExactas } from "./acciones";
import { leerConciliacion } from "./datos";
import styles from "../banca.module.css";

const NOMBRE_TIPO: Record<string, string> = {
  cobro_tarjeta: "Cobros con tarjeta (NetPay)", cobro_rappi: "Cobros de Rappi", pago_proveedor: "Pagos a proveedores", nomina: "Nómina", sin_documento: "Sin documento",
};
const nombreConcepto = (c: string) => CONCEPTOS.find((x) => x.clave === c)?.nombre ?? c;
const GRUPOS = [["operacion", "Operación"], ["inversion", "Inversión"], ["financiamiento", "Financiamiento"], ["excluido", "Fuera del flujo"]] as const;
const fecha = (f: string | undefined, def: string) => (f && /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : def);

function SelectorConcepto({ valor }: { valor: string }) {
  return <label>Concepto de flujo<select name="concepto" defaultValue={valor} required>
    {GRUPOS.map(([g, n]) => <optgroup key={g} label={n}>{CONCEPTOS.filter((c) => c.grupo === g).map((c) => <option key={c.clave} value={c.clave}>{c.nombre}</option>)}</optgroup>)}
  </select></label>;
}
const Movimientos = ({ ms }: { ms: MovimientoBanco[] }) => <ul className={styles.filaMovimiento}>
  {ms.map((m) => <li key={m.id}><span>{fechaTexto(m.fecha)} · {m.descripcion}</span><strong>{m.abono > 0 ? pesos(m.abono) : `−${pesos(m.cargo)}`}</strong></li>)}
</ul>;

export async function Conciliacion({ db, cuentas, edita, q }: { db: SupabaseClient; cuentas: CuentaBanca[]; edita: boolean; q: FiltrosBanca & { ok?: string; error?: string } }) {
  const cuenta = cuentas.find((c) => c.id === q.cuenta) ?? cuentas[0];
  const hoy = hoyCalendarioMX();
  const desde = fecha(q.desde, `${hoy.slice(0, 7)}-01`), hasta = fecha(q.hasta, hoy);
  if (!cuenta) return <section className={styles.panel}><h2>Conciliación</h2><p>Primero importa un reporte de Banregio.</p></section>;
  if (desde > hasta) return <section className={styles.panel}><p role="alert" className="aviso aviso-error">La fecha inicial debe ser anterior a la final.</p></section>;
  const d = await leerConciliacion(db, cuenta, desde, hasta);
  const enSugerencia = new Set(d.sugerencias.flatMap((s) => s.movimientos));
  const sinSugerencia = d.pendientes.filter((m) => !enSugerencia.has(m.id));
  const exactas = d.sugerencias.filter((s) => s.exacta).length;
  const ocultos = (extra: Record<string, string>) => <>
    <input type="hidden" name="cuenta" value={cuenta.id} /><input type="hidden" name="desde" value={desde} /><input type="hidden" name="hasta" value={hasta} />
    {Object.entries(extra).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
  </>;
  const tarjetaSugerencia = (s: Sugerencia) => {
    const ms = s.movimientos.map(d.movimiento).filter((m): m is MovimientoBanco => Boolean(m));
    const requiereNota = s.tipo === "sin_documento" || (s.diferencia ?? 0) !== 0;
    return <article className={styles.tarjeta} key={s.movimientos.join(",")}>
      <Movimientos ms={ms} />
      {s.documentos.length > 0 && <ul>{s.documentos.map((x, i) => <li key={i}>{x.texto} · {pesos(x.monto)}</li>)}</ul>}
      {s.diferencia !== null && <p className={s.diferencia ? styles.diferencia : undefined}>Diferencia: {pesos(s.diferencia)}</p>}
      {edita && <form action={conciliarMovimientos} className={styles.formularioLinea}>
        {ocultos({ solicitud: randomUUID(), movimientos: s.movimientos.join(","), tipo: s.tipo, documentos: JSON.stringify(documentosRpc(s.documentos)) })}
        <SelectorConcepto valor={s.concepto} />
        <label>Nota<input name="nota" defaultValue={s.nota} maxLength={1000} required={requiereNota} /></label>
        <button className="boton boton-compacto">Confirmar</button>
      </form>}
    </article>;
  };

  return <section className={styles.panel}>
    <div className={styles.encabezado}><div><h2>Conciliación</h2><p>{cuenta.razon_social} · cuenta {cuenta.numero.slice(-4)} · {d.pendientes.length} por conciliar en el periodo</p></div></div>
    {q.ok && <p role="status" className="aviso">{q.ok}</p>}
    {q.error && <p role="alert" className="aviso aviso-error">{q.error}</p>}
    <form method="get" className={styles.filtros}>
      <input type="hidden" name="vista" value="conciliacion" />
      <label>Cuenta<select name="cuenta" defaultValue={cuenta.id}>{cuentas.map((c) => <option value={c.id} key={c.id}>{c.razon_social} · {c.numero.slice(-4)}</option>)}</select></label>
      <label>Desde<input type="date" name="desde" defaultValue={desde} /></label><label>Hasta<input type="date" name="hasta" defaultValue={hasta} /></label>
      <button className="boton boton-secundario">Filtrar</button>
    </form>
    <p className={styles.nota}>Conciliar es documental: no marca facturas pagadas, no crea ventas ni pagos y no cambia saldos. La app sugiere; nada queda conciliado sin confirmarlo.</p>

    <h3>Sugerencias</h3>
    {edita && exactas > 0 && <form action={confirmarExactas}>{ocultos({})}<button className="boton">Confirmar {exactas} exactas</button></form>}
    {d.sugerencias.length === 0 && <p>No hay sugerencias para el periodo.</p>}
    {Object.keys(NOMBRE_TIPO).map((t) => {
      const ss = d.sugerencias.filter((s) => s.tipo === t);
      return ss.length > 0 && <details key={t} open><summary>{NOMBRE_TIPO[t]} ({ss.length})</summary><div className={styles.tarjetas}>{ss.map(tarjetaSugerencia)}</div></details>;
    })}

    <h3>Sin sugerencia ({sinSugerencia.length})</h3>
    <div className={styles.tarjetas}>{sinSugerencia.map((m) => {
      const pagos = m.cargo > 0 ? d.pagos.filter((p) => Math.abs(p.monto - m.cargo) < 0.005) : [];
      return <article className={styles.tarjeta} key={m.id}>
        <Movimientos ms={[m]} />
        {edita && pagos.length > 0 && <form action={conciliarMovimientos} className={styles.formularioLinea}>
          {ocultos({ solicitud: randomUUID(), movimientos: m.id, tipo: "pago_proveedor" })}
          <label>Pago registrado<select name="pago" required>{pagos.map((p) => <option key={p.id} value={p.id}>{p.proveedor} · {fechaTexto(p.fecha)} · {pesos(p.monto)}</option>)}</select></label>
          <SelectorConcepto valor="proveedores" />
          <button className="boton boton-compacto">Vincular pago</button>
        </form>}
        {edita && <form action={conciliarMovimientos} className={styles.formularioLinea}>
          {ocultos({ solicitud: randomUUID(), movimientos: m.id, tipo: "sin_documento", documentos: "[]" })}
          <SelectorConcepto valor="otros_operacion" />
          <label>Nota<input name="nota" maxLength={1000} required placeholder="Qué es y por qué no tiene documento" /></label>
          <button className="boton boton-secundario boton-compacto">Sin documento</button>
        </form>}
      </article>;
    })}</div>

    <details className={styles.detalle}><summary>Conciliados del periodo ({d.conciliadas.length})</summary><div className={styles.tarjetas}>{d.conciliadas.map((x) => <article className={styles.tarjeta} key={x.id}>
      <p><strong>{NOMBRE_TIPO[x.tipo] ?? x.tipo}</strong> · {nombreConcepto(x.concepto)}</p>
      <Movimientos ms={x.movimientos} />
      {x.diferencia !== null && <p className={Number(x.diferencia) ? styles.diferencia : undefined}>Documentos {pesos(Number(x.monto_documentos))} · diferencia {pesos(Number(x.diferencia))}</p>}
      {x.nota && <p><small>{x.nota}</small></p>}
      {edita && <form action={anularConciliacionBanca} className={styles.formularioLinea}>
        {ocultos({ id: x.id })}
        <label>Motivo<input name="motivo" minLength={5} maxLength={1000} required /></label>
        <button className="boton boton-secundario boton-compacto">Anular</button>
      </form>}
    </article>)}</div></details>
  </section>;
}
```

El formulario manual de pago no manda `documentos`: manda el pago elegido en `pago`, y `conciliarMovimientos` (Task 3) arma el documento. Así funciona sin JavaScript de cliente aunque haya varios pagos con el mismo monto.

- [ ] **Step 2: CSS**

Agregar al final de `app/banca/banca.module.css`, siguiendo las variables que ya usa el archivo (revisa los nombres reales de las variables de color antes de escribir):

```css
.tarjetas { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); margin: 8px 0 16px; }
.tarjeta { border: 1px solid var(--borde, #d9d9d9); border-radius: 10px; padding: 12px; display: grid; gap: 8px; background: var(--blanco, #fff); min-width: 0; }
.filaMovimiento { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.filaMovimiento li { display: flex; justify-content: space-between; gap: 8px; overflow-wrap: anywhere; }
.filaMovimiento strong { white-space: nowrap; }
.diferencia { color: var(--alerta-texto, #9a3412); font-weight: 700; }
.formularioLinea { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
.formularioLinea label { display: grid; gap: 2px; flex: 1 1 160px; min-width: 0; }
```

- [ ] **Step 3: Integrar en `app/banca/page.tsx`**

1. Import: `import { Conciliacion } from "./conciliacion/Panel";`
2. Tipo de `searchParams`: `Promise<FiltrosBanca & { ok?: string; error?: string }>`.
3. Indicador "Por conciliar": reemplazar `supabase.from("banca_movimientos").select("id",{count:"exact",head:true})` por `supabase.from("banca_por_conciliar").select("id",{count:"exact",head:true})`, y en el mensaje de error decir "No se pudo consultar los movimientos por conciliar."
4. Render: en la cadena de la vista, antes de la rama genérica (el `<section className={styles.panel}>` con la tabla vacía), agregar `vista === "conciliacion" ? <Conciliacion db={supabase} cuentas={cuentas} edita={perfil.rol === "admin"} q={q} /> :`. La rama genérica queda solo para NetPay y dLocal.
5. Texto del aviso superior: "Banregio y Rappi se actualizan con reportes importados. Los depósitos se concilian en la pestaña Conciliación."

En `app/banca/Banregio.tsx`, cambiar la nota "Las asociaciones de conciliación se incorporarán después." por "Las asociaciones se registran en la pestaña Conciliación."

- [ ] **Step 4: Typecheck, tests y build**

Run: `npm run typecheck && npm test && npm run build`
Expected: todo correcto.

- [ ] **Step 5: Commit**

```bash
git add app/banca/conciliacion/Panel.tsx app/banca/banca.module.css app/banca/page.tsx app/banca/Banregio.tsx
git commit -m "feat(banca): pantalla de conciliación bancaria"
```

---

### Task 5: Documentación, verificación y PR

**Files:**
- Create: `docs/banca-conciliacion.md`
- Modify: `docs/banca-banregio.md` (primer párrafo: "Las asociaciones de conciliación quedan para una entrega posterior." → "La conciliación se documenta en `docs/banca-conciliacion.md`.")

- [ ] **Step 1: `docs/banca-conciliacion.md`**

```markdown
# Banregio: conciliación de movimientos

## Alcance

Cada movimiento importado de Banregio se concilia con su documento o sin documento, y queda con un concepto de flujo para el Flujo de Efectivo. Es documental: no marca facturas pagadas, no crea ventas ni pagos, no cambia saldos, caja ni bóveda.

Solo administración concilia y anula. Administración y corporativo consultan.

## Tipos

- **Pago a proveedor:** cargos contra pagos registrados en Compras → Pagos (transferencia, no anulados).
- **Cobro con tarjeta:** un depósito de NetPay (venta bruta) y su comisión e IVA del mismo día contra la venta con tarjeta de Dodo IS de días anteriores al depósito, en un lapso de hasta 7 días.
- **Cobro de Rappi:** depósitos contra paidlots de reportes financieros vigentes.
- **Nómina:** cargos de la dispersión, opcionalmente con la nómina real del mes.
- **Sin documento:** con concepto y nota obligatoria (comisiones bancarias, IMSS, préstamos, traspasos…).

Un movimiento, un pago, un día de venta y un paidlot pertenecen a lo más a una conciliación activa. Los montos y la diferencia los calcula la base; una diferencia distinta de cero exige nota. Anular exige motivo y libera los vínculos.

## Sugerencias

La app sugiere y admin confirma; "Confirmar exactas" solo confirma las que tienen documento y diferencia cero. Las reglas están en `lib/banca/conciliacion.ts`.

## Activación

1. Ejecutar `supabase/migrations/20261029200000_banca_conciliacion.sql` en Supabase.
2. Ejecutar `supabase/pruebas/20261029200000_banca_conciliacion.sql`. Necesita un admin activo, una razón social con un día de venta con tarjeta y un pago por transferencia registrados. El `RAISE` final `PRUEBAS OK` es intencional y revierte los datos de ensayo.
3. Confirmar ese resultado antes de integrar el PR que activa la pantalla.
4. Usar Banca → Conciliación.
```

- [ ] **Step 2: Verificación completa**

Run: `npm test && npm run typecheck && npm run build`
Expected: todo correcto.

Verificación en navegador solo si hay `.env.local` con credenciales de Supabase **y** la migración ya está instalada en ese proyecto; si no, anotarlo para el preview de Vercel: abrir `/banca?vista=conciliacion` con los reportes de septiembre y octubre, confirmar que NetPay sugiere días de venta y que un depósito del 1 de octubre toma ventas de fines de septiembre.

- [ ] **Step 3: Commit, push y PR (sin integrar)**

```bash
git add docs/banca-conciliacion.md docs/banca-banregio.md
git commit -m "docs(banca): conciliación bancaria y pasos de activación"
git push -u origin banca-conciliacion
gh pr create --repo HelperHolding/dodo-money --base main --head banca-conciliacion --title "Banca: conciliación de movimientos Banregio" --body-file -
```

Cuerpo con la plantilla del repo, que diga explícitamente **"No integrar hasta que Sebastián confirme PRUEBAS OK de `supabase/pruebas/20261029200000_banca_conciliacion.sql` en Supabase"**, y al final:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
