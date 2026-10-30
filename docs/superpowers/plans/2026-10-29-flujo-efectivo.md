# Flujo de Efectivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página Finanzas → Flujo de efectivo (`/finanzas/flujo`) con el flujo real del banco (mes y comparativo) en la estructura de la plantilla, más su Excel.

**Architecture:** Funciones puras en `lib/finanzas/flujo.ts` convierten movimientos bancarios (con el tipo y concepto de su conciliación activa) en renglones, totales y saldos; `lib/finanzas/excelFlujo.ts` arma las hojas. Un cargador lee Supabase; la página y la ruta del Excel solo presentan. Sin migraciones.

**Tech Stack:** Next.js App Router (server components), Supabase (lectura), `node --experimental-strip-types --test`, `lib/xlsx-escribir.ts`.

**Spec:** `docs/superpowers/specs/2026-10-29-flujo-efectivo-design.md`

## Global Constraints

- Flujo de `AGENTS.md`: rama `flujo-efectivo` → PR a `main`; sin commits a `main`; sin `--allow-empty`; sin saltar hooks. No hacer push sin el visto bueno de Sebastián.
- Sin migraciones; solo lectura de `banca_cuentas`, `banca_movimientos`, `banca_conciliacion_movimientos`, `banca_conciliaciones`, `banca_saldos`.
- Signo: entradas positivas, salidas negativas; concepto = Σ abonos − Σ cargos.
- `cobro_tarjeta`: abonos → `cobranza_tarjeta`, cargos → `comisiones_cobro`, sin importar el concepto guardado.
- Saldo inicial + flujo neto = saldo final; si no, aviso de hueco (las cifras se muestran igual).
- % sobre **total ingresos operativos**; ingresos 0 → sin %.
- Renglones opcionales (Depósitos de efectivo, Apertura, Pago de capital, Intereses, Traspasos, Por conciliar entradas/salidas) solo si ≠ 0 (en el comparativo, si ≠ 0 en alguna columna).
- Permisos de Finanzas (`puedeVerFinanzas`: admin y corporativo).
- `lib/` solo `import type` entre módulos de `lib/`; las pruebas importan con `.ts`.
- Pantalla con el estilo del P&L; en celular, tarjetas; el comparativo se desliza de lado.

## Review Focus

- **Cuenta sin movimientos en el mes** pero con saldo anterior: saldo inicial = final = saldo previo, flujo 0 → prueba en Task 1.
- **Mes con hueco** (saldos del banco que no encadenan): se reporta la diferencia, no se esconde → prueba en Task 1.
- **Comparativo con un mes intermedio sin movimientos:** arrastra el saldo del mes anterior → prueba en Task 1.
- **Concepto desconocido** (catálogo futuro): cae en "Otros de operación", no desaparece del flujo → prueba en Task 1.
- **Mes en curso o no importado completo:** el encabezado dice "movimientos hasta el …" → Task 4.

---

### Task 1: Cálculo del flujo (función pura)

**Files:**
- Create: `lib/finanzas/flujo.ts`
- Create: `lib/finanzas/flujo.test.ts`
- Modify: `package.json` (script `test`: agregar `lib/finanzas/flujo.test.ts ` después de `lib/finanzas/pl.test.ts `)

**Interfaces (Produces, nombres exactos):** `SeccionFlujo`, `RENGLONES_FLUJO`, `SECCIONES_FLUJO`, `MovimientoFlujo`, `SaldoPrevio`, `RenglonFlujo`, `Flujo`, `claveDe(m)`, `calcularFlujo(movs, previos?)`, `flujoPorMes(movs, previos, meses)`, `visibles(flujos)`.

- [ ] **Step 1: Write the failing tests**

`lib/finanzas/flujo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularFlujo, flujoPorMes, visibles, type Flujo, type MovimientoFlujo } from "./flujo.ts";

let fila = 0;
const mov = (fecha: string, cargo: number, abono: number, saldo: number, tipo: string | null = null, concepto = "", cuentaId = "c1"): MovimientoFlujo =>
  ({ cuentaId, fecha, fila: ++fila, cargo, abono, saldo, conciliacion: tipo ? { tipo, concepto } : null });
const de = (f: Flujo, clave: string) => {
  const r = f.renglones.find((x) => x.clave === clave);
  assert.ok(r, `falta ${clave}`);
  return r;
};

const OCT = [
  mov("2026-10-02", 0, 1000, 11000, "cobro_tarjeta", "cobranza_tarjeta"),
  mov("2026-10-02", 20, 0, 10980, "cobro_tarjeta", "cobranza_tarjeta"),
  mov("2026-10-03", 0, 500, 11480, "cobro_rappi", "cobranza_rappi"),
  mov("2026-10-04", 300, 0, 11180, "pago_proveedor", "proveedores"),
  mov("2026-10-05", 0, 50, 11230, "sin_documento", "proveedores"),
  mov("2026-10-06", 100, 0, 11130, "nomina", "nomina"),
  mov("2026-10-07", 30, 0, 11100),
  mov("2026-10-08", 0, 5000, 16100, "sin_documento", "prestamo_recibido"),
  mov("2026-10-09", 1000, 0, 15100, "sin_documento", "capex"),
  mov("2026-10-10", 200, 0, 14900, "sin_documento", "traspaso_interno"),
];

test("conceptos, regla del cobro con tarjeta, devoluciones y totales", () => {
  const f = calcularFlujo(OCT);
  assert.equal(de(f, "cobranza_tarjeta").monto, 1000);
  assert.equal(de(f, "comisiones_cobro").monto, -20);
  assert.equal(de(f, "cobranza_rappi").monto, 500);
  assert.equal(de(f, "proveedores").monto, -250);
  assert.equal(de(f, "ingresos_operativos").monto, 1500);
  assert.equal(de(f, "egresos_operativos").monto, -370);
  assert.equal(de(f, "flujo_operacion").monto, 1130);
  assert.equal(de(f, "flujo_inversion").monto, -1000);
  assert.equal(de(f, "flujo_antes_financiamiento").monto, 130);
  assert.equal(de(f, "flujo_financiamiento").monto, 5000);
  assert.equal(de(f, "traspaso_interno").monto, -200);
  assert.equal(de(f, "por_conciliar_salidas").monto, -30);
  assert.equal(de(f, "flujo_neto").monto, 4900);
  assert.deepEqual([f.saldoInicial, f.saldoFinal, f.diferencia], [10000, 14900, 0]);
  assert.deepEqual(f.porConciliar, { n: 1, entradas: 0, salidas: -30 });
  assert.equal(f.ultimaFecha, "2026-10-10");
  assert.equal(de(f, "proveedores").pct, -250 / 1500);
  assert.equal(de(f, "saldo_final").pct, null);
});

test("orden de renglones de la plantilla", () => {
  assert.deepEqual(calcularFlujo([]).renglones.map((r) => r.clave), [
    "cobranza_tarjeta", "deposito_efectivo", "cobranza_rappi", "ingresos_operativos",
    "proveedores", "nomina", "imss_impuestos", "renta", "servicios", "marketing", "regalias", "comisiones_cobro", "comisiones_bancarias", "otros_operacion",
    "egresos_operativos", "flujo_operacion",
    "capex", "apertura", "flujo_inversion", "flujo_antes_financiamiento",
    "prestamo_recibido", "pago_capital", "intereses", "flujo_financiamiento",
    "traspaso_interno", "por_conciliar_entradas", "por_conciliar_salidas", "flujo_neto",
    "saldo_inicial", "saldo_final",
  ]);
});

test("dos cuentas: una sin movimientos usa su saldo previo", () => {
  const f = calcularFlujo([mov("2026-10-05", 0, 100, 300, null, "", "c2")], [{ cuentaId: "c1", saldo: 500 }, { cuentaId: "c2", saldo: 200 }]);
  assert.deepEqual([f.saldoInicial, f.saldoFinal, f.diferencia], [700, 800, 0]);
  assert.equal(de(f, "por_conciliar_entradas").monto, 100);
});

test("hueco en los saldos del banco: se reporta la diferencia", () => {
  const f = calcularFlujo([mov("2026-10-01", 0, 100, 1100), mov("2026-10-02", 50, 0, 900)]);
  assert.deepEqual([f.saldoInicial, f.saldoFinal], [1000, 900]);
  assert.equal(f.diferencia, -150);
});

test("sin ingresos no hay porcentaje; sin movimientos todo en cero", () => {
  const f = calcularFlujo([mov("2026-10-01", 10, 0, 90, "sin_documento", "comisiones_bancarias")]);
  assert.equal(de(f, "comisiones_bancarias").pct, null);
  const v = calcularFlujo([]);
  assert.deepEqual([v.saldoInicial, v.saldoFinal, v.diferencia, v.ultimaFecha], [0, 0, 0, null]);
});

test("concepto desconocido cae en otros de operación", () => {
  assert.equal(de(calcularFlujo([mov("2026-10-01", 10, 0, 90, "sin_documento", "inventado")]), "otros_operacion").monto, -10);
});

test("por mes: arrastra saldos y un mes sin movimientos conserva el saldo", () => {
  const movs = [mov("2026-09-30", 0, 100, 1100), mov("2026-10-15", 40, 0, 1060)];
  const [sep, oct, nov] = flujoPorMes(movs, [], [
    { desde: "2026-09-01", hasta: "2026-09-30" }, { desde: "2026-10-01", hasta: "2026-10-31" }, { desde: "2026-11-01", hasta: "2026-11-30" },
  ]);
  assert.deepEqual([sep.saldoInicial, sep.saldoFinal], [1000, 1100]);
  assert.deepEqual([oct.saldoInicial, oct.saldoFinal, oct.diferencia], [1100, 1060, 0]);
  assert.deepEqual([nov.saldoInicial, nov.saldoFinal, de(nov, "flujo_neto").monto], [1060, 1060, 0]);
});

test("visibles: opcionales solo si tienen monto en alguna columna", () => {
  const a = calcularFlujo([mov("2026-10-01", 0, 10, 10, "sin_documento", "deposito_efectivo")]), b = calcularFlujo([]);
  const v = visibles([a, b]);
  assert.equal(v.has("deposito_efectivo"), true);
  assert.equal(v.has("apertura"), false);
  assert.equal(v.has("renta"), true);
  assert.equal(v.has("flujo_neto"), true);
});
```

Registrar:

```bash
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.scripts.test=p.scripts.test.replace("lib/finanzas/pl.test.ts ","lib/finanzas/pl.test.ts lib/finanzas/flujo.test.ts ");fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
git diff package.json
```

Expected: el diff solo agrega esa ruta.

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test lib/finanzas/flujo.test.ts` → FAIL (no encuentra `./flujo.ts`).

- [ ] **Step 3: Implementation**

`lib/finanzas/flujo.ts`:

```ts
/** Flujo de efectivo real: movimientos del banco agrupados por el concepto de su conciliación, del saldo inicial al final. */
export type SeccionFlujo = "ingresos" | "egresos" | "inversion" | "financiamiento" | "otros" | "saldos";
type Definicion = { clave: string; nombre: string; seccion: SeccionFlujo; tipo: "renglon" | "total"; opcional?: boolean };

export const RENGLONES_FLUJO: readonly Definicion[] = [
  { clave: "cobranza_tarjeta", nombre: "Cobranza tarjeta (NetPay)", seccion: "ingresos", tipo: "renglon" },
  { clave: "deposito_efectivo", nombre: "Depósitos de efectivo", seccion: "ingresos", tipo: "renglon", opcional: true },
  { clave: "cobranza_rappi", nombre: "Cobranza Rappi", seccion: "ingresos", tipo: "renglon" },
  { clave: "ingresos_operativos", nombre: "Total ingresos operativos", seccion: "ingresos", tipo: "total" },
  { clave: "proveedores", nombre: "Proveedores (alimentos y empaque)", seccion: "egresos", tipo: "renglon" },
  { clave: "nomina", nombre: "Nómina", seccion: "egresos", tipo: "renglon" },
  { clave: "imss_impuestos", nombre: "IMSS e impuestos", seccion: "egresos", tipo: "renglon" },
  { clave: "renta", nombre: "Renta", seccion: "egresos", tipo: "renglon" },
  { clave: "servicios", nombre: "Servicios", seccion: "egresos", tipo: "renglon" },
  { clave: "marketing", nombre: "Marketing", seccion: "egresos", tipo: "renglon" },
  { clave: "regalias", nombre: "Regalías", seccion: "egresos", tipo: "renglon" },
  { clave: "comisiones_cobro", nombre: "Comisiones de cobro", seccion: "egresos", tipo: "renglon" },
  { clave: "comisiones_bancarias", nombre: "Comisiones bancarias", seccion: "egresos", tipo: "renglon" },
  { clave: "otros_operacion", nombre: "Otros de operación", seccion: "egresos", tipo: "renglon" },
  { clave: "egresos_operativos", nombre: "Total egresos operativos", seccion: "egresos", tipo: "total" },
  { clave: "flujo_operacion", nombre: "Flujo de operación", seccion: "egresos", tipo: "total" },
  { clave: "capex", nombre: "CapEx", seccion: "inversion", tipo: "renglon" },
  { clave: "apertura", nombre: "Apertura y equipamiento", seccion: "inversion", tipo: "renglon", opcional: true },
  { clave: "flujo_inversion", nombre: "Flujo de inversión", seccion: "inversion", tipo: "total" },
  { clave: "flujo_antes_financiamiento", nombre: "Flujo antes de financiamiento", seccion: "inversion", tipo: "total" },
  { clave: "prestamo_recibido", nombre: "Préstamo recibido", seccion: "financiamiento", tipo: "renglon" },
  { clave: "pago_capital", nombre: "Pago de capital", seccion: "financiamiento", tipo: "renglon", opcional: true },
  { clave: "intereses", nombre: "Intereses", seccion: "financiamiento", tipo: "renglon", opcional: true },
  { clave: "flujo_financiamiento", nombre: "Flujo de financiamiento", seccion: "financiamiento", tipo: "total" },
  { clave: "traspaso_interno", nombre: "Traspasos entre cuentas propias", seccion: "otros", tipo: "renglon", opcional: true },
  { clave: "por_conciliar_entradas", nombre: "Por conciliar · entradas", seccion: "otros", tipo: "renglon", opcional: true },
  { clave: "por_conciliar_salidas", nombre: "Por conciliar · salidas", seccion: "otros", tipo: "renglon", opcional: true },
  { clave: "flujo_neto", nombre: "Flujo neto", seccion: "otros", tipo: "total" },
  { clave: "saldo_inicial", nombre: "Saldo inicial", seccion: "saldos", tipo: "total" },
  { clave: "saldo_final", nombre: "Saldo final", seccion: "saldos", tipo: "total" },
];

export const SECCIONES_FLUJO: readonly { clave: SeccionFlujo; nombre: string; fondo: string; css: string }[] = [
  { clave: "ingresos", nombre: "Flujo de operación · ingresos", fondo: "BDD7EE", css: "pl-venta" },
  { clave: "egresos", nombre: "Flujo de operación · egresos", fondo: "FCE4D6", css: "pl-operacion" },
  { clave: "inversion", nombre: "Flujo de inversión", fondo: "D9EAD3", css: "pl-costo" },
  { clave: "financiamiento", nombre: "Flujo de financiamiento", fondo: "EAD1DC", css: "pl-oficina" },
  { clave: "otros", nombre: "Otros movimientos", fondo: "F2F2F2", css: "pl-memo" },
  { clave: "saldos", nombre: "Saldos del banco", fondo: "F2F2F2", css: "pl-memo" },
];

export type MovimientoFlujo = {
  cuentaId: string; fecha: string; fila: number; cargo: number; abono: number;
  /** Saldo del banco después del movimiento. */
  saldo: number;
  conciliacion: { tipo: string; concepto: string } | null;
};
export type SaldoPrevio = { cuentaId: string; saldo: number };
export type RenglonFlujo = Definicion & { monto: number; pct: number | null };
export type Flujo = {
  renglones: RenglonFlujo[]; saldoInicial: number; saldoFinal: number;
  /** Saldo final − (saldo inicial + flujo neto): distinto de 0 si hay huecos en los reportes importados. */
  diferencia: number;
  porConciliar: { n: number; entradas: number; salidas: number };
  ultimaFecha: string | null;
};

const c = (n: number) => Math.round(n * 100) / 100;
const CONCEPTOS = new Set(RENGLONES_FLUJO.filter((r) => r.tipo === "renglon" && !r.clave.startsWith("por_conciliar")).map((r) => r.clave));

/** Renglón de un movimiento: sin conciliación → por conciliar; en un cobro con tarjeta, abonos a cobranza y cargos a comisiones. */
export function claveDe(m: MovimientoFlujo): string {
  if (!m.conciliacion) return m.abono > 0 ? "por_conciliar_entradas" : "por_conciliar_salidas";
  if (m.conciliacion.tipo === "cobro_tarjeta") return m.abono > 0 ? "cobranza_tarjeta" : "comisiones_cobro";
  return CONCEPTOS.has(m.conciliacion.concepto) ? m.conciliacion.concepto : "otros_operacion";
}

/** Flujo de un periodo. `previos`: saldo de cada cuenta antes del periodo (para las cuentas sin movimientos en él). */
export function calcularFlujo(movs: readonly MovimientoFlujo[], previos: readonly SaldoPrevio[] = []): Flujo {
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila - b.fila);
  const montos = new Map<string, number>();
  for (const m of orden) { const k = claveDe(m); montos.set(k, c((montos.get(k) ?? 0) + m.abono - m.cargo)); }
  const monto = (k: string) => montos.get(k) ?? 0;
  const suma = (s: SeccionFlujo) => c(RENGLONES_FLUJO.filter((r) => r.seccion === s && r.tipo === "renglon").reduce((t, r) => t + monto(r.clave), 0));
  const ingresos = suma("ingresos"), egresos = suma("egresos"), operacion = c(ingresos + egresos), inversion = suma("inversion");
  const antes = c(operacion + inversion), financiamiento = suma("financiamiento"), neto = c(antes + financiamiento + suma("otros"));

  let inicial = 0, final = 0;
  for (const id of new Set([...previos.map((p) => p.cuentaId), ...orden.map((m) => m.cuentaId)])) {
    const ms = orden.filter((m) => m.cuentaId === id);
    if (ms.length) { inicial += ms[0].saldo - ms[0].abono + ms[0].cargo; final += ms[ms.length - 1].saldo; }
    else { const p = previos.find((x) => x.cuentaId === id); if (p) { inicial += p.saldo; final += p.saldo; } }
  }
  inicial = c(inicial); final = c(final);
  const totales: Record<string, number> = {
    ingresos_operativos: ingresos, egresos_operativos: egresos, flujo_operacion: operacion, flujo_inversion: inversion,
    flujo_antes_financiamiento: antes, flujo_financiamiento: financiamiento, flujo_neto: neto, saldo_inicial: inicial, saldo_final: final,
  };
  const renglones = RENGLONES_FLUJO.map((r) => {
    const m = r.tipo === "total" ? totales[r.clave] : monto(r.clave);
    return { ...r, monto: m, pct: r.seccion === "saldos" || !ingresos ? null : m / ingresos };
  });
  return {
    renglones, saldoInicial: inicial, saldoFinal: final, diferencia: c(final - (inicial + neto)),
    porConciliar: { n: orden.filter((m) => !m.conciliacion).length, entradas: monto("por_conciliar_entradas"), salidas: monto("por_conciliar_salidas") },
    ultimaFecha: orden.length ? orden[orden.length - 1].fecha : null,
  };
}

/** Un flujo por periodo consecutivo; el saldo de cada cuenta se arrastra al siguiente. */
export function flujoPorMes(movs: readonly MovimientoFlujo[], previos: readonly SaldoPrevio[], meses: readonly { desde: string; hasta: string }[]): Flujo[] {
  const saldos = new Map(previos.map((p) => [p.cuentaId, p.saldo]));
  const orden = [...movs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.fila - b.fila);
  return meses.map((r) => {
    const ms = orden.filter((m) => m.fecha >= r.desde && m.fecha <= r.hasta);
    const f = calcularFlujo(ms, [...saldos].map(([cuentaId, saldo]) => ({ cuentaId, saldo })));
    for (const m of ms) saldos.set(m.cuentaId, m.saldo);
    return f;
  });
}

/** Claves a mostrar: todo lo no opcional, y lo opcional con monto en alguna columna. */
export const visibles = (flujos: readonly Flujo[]) => new Set(RENGLONES_FLUJO
  .filter((r) => !r.opcional || flujos.some((f) => f.renglones.some((x) => x.clave === r.clave && x.monto !== 0)))
  .map((r) => r.clave));
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --experimental-strip-types --test lib/finanzas/flujo.test.ts` → PASS (8). Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add lib/finanzas/flujo.ts lib/finanzas/flujo.test.ts package.json
git commit -m "feat(finanzas): cálculo del flujo de efectivo"
```

---

### Task 2: Hojas de Excel

**Files:**
- Create: `lib/finanzas/excelFlujo.ts`
- Create: `lib/finanzas/excelFlujo.test.ts`
- Modify: `package.json` (agregar `lib/finanzas/excelFlujo.test.ts ` después de `lib/finanzas/flujo.test.ts `)

**Interfaces:**
- Consumes: `Flujo`, `SeccionFlujo`, `visibles` — **`visibles` es un valor**: como `lib/` no importa valores entre sí, `excelFlujo.ts` recibe `mostrar: ReadonlySet<string>` ya calculado.
- Produces: `hojaFlujo({ titulo, periodo, generado, flujo, secciones, mostrar }): HojaXlsx[]` y `hojaFlujoComparativo({ titulo, periodo, generado, columnas: { etiqueta; flujo }[], total: { etiqueta; flujo }, secciones, mostrar }): HojaXlsx[]`.

- [ ] **Step 1: Failing test**

`lib/finanzas/excelFlujo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaFlujo, hojaFlujoComparativo } from "./excelFlujo.ts";
import { calcularFlujo, SECCIONES_FLUJO, visibles, type MovimientoFlujo } from "./flujo.ts";

const m = (fecha: string, cargo: number, abono: number, saldo: number, tipo: string | null, concepto = ""): MovimientoFlujo =>
  ({ cuentaId: "c1", fecha, fila: Number(fecha.slice(8)), cargo, abono, saldo, conciliacion: tipo ? { tipo, concepto } : null });
const flujo = calcularFlujo([m("2026-10-01", 0, 1000, 1000, "cobro_tarjeta", "cobranza_tarjeta"), m("2026-10-02", 30, 0, 970, null)]);
const BARRA = { fondo: "7F7F7F", texto: "FFFFFF", negrita: true };

test("hoja Flujo: encabezado, secciones, barras, porcentajes y avisos", () => {
  const [h] = hojaFlujo({ titulo: "Todas las razones sociales", periodo: "Octubre 2026", generado: "Sebastián", flujo, secciones: SECCIONES_FLUJO, mostrar: visibles([flujo]) });
  const fila = (t: string) => h.filas.findIndex((f) => f[0] === t);
  assert.equal(h.nombre, "Flujo");
  assert.equal(h.filas[0][0], "Flujo de efectivo · Todas las razones sociales");
  assert.deepEqual(h.filas[4], ["Renglón", "Monto", "% de ingresos"]);
  assert.deepEqual(h.estilos![fila("FLUJO DE OPERACIÓN · INGRESOS")], { fondo: "BDD7EE", negrita: true });
  assert.deepEqual(h.estilos![fila("Flujo neto")], BARRA);
  assert.deepEqual(h.filas[fila("Cobranza tarjeta (NetPay)")], ["Cobranza tarjeta (NetPay)", { valor: 1000, formato: "contable" }, { valor: 1, formato: "porcentaje" }]);
  assert.equal(fila("Apertura y equipamiento"), -1);
  assert.ok(fila("Por conciliar · salidas") > 0);
  assert.ok(h.filas.some((f) => f[0] === "1 movimiento por conciliar."));
});

test("hoja Flujo comparativo: columnas por mes más total", () => {
  const vacio = calcularFlujo([]);
  const [h] = hojaFlujoComparativo({
    titulo: "Todas", periodo: "2026", generado: "Sebastián", secciones: SECCIONES_FLUJO, mostrar: visibles([flujo, vacio]),
    columnas: [{ etiqueta: "Sep 2026", flujo: vacio }, { etiqueta: "Oct 2026", flujo }], total: { etiqueta: "Total", flujo },
  });
  assert.equal(h.nombre, "Flujo comparativo");
  assert.deepEqual(h.filas[4], ["Renglón", "Sep 2026", "Oct 2026", "Total"]);
  const neto = h.filas.find((f) => f[0] === "Flujo neto")!;
  assert.deepEqual(neto.slice(1), [{ valor: 0, formato: "contable" }, { valor: 970, formato: "contable" }, { valor: 970, formato: "contable" }]);
});
```

Registrar en `package.json` como en Task 1 (después de `lib/finanzas/flujo.test.ts `).

- [ ] **Step 2: Run → FAIL** (`node --experimental-strip-types --test lib/finanzas/excelFlujo.test.ts`).

- [ ] **Step 3: Implementation**

`lib/finanzas/excelFlujo.ts`:

```ts
import type { Celda, EstiloFila, HojaXlsx } from "../xlsx-escribir";
import type { Flujo, SeccionFlujo } from "./flujo";

type Secciones = readonly { clave: SeccionFlujo; nombre: string; fondo: string }[];
const BARRA: EstiloFila = { fondo: "7F7F7F", texto: "FFFFFF", negrita: true };
const contable = (n: number): Celda => ({ valor: n, formato: "contable" });

/** Encabezado, secciones con color y totales en barra; `celdas` da las columnas de cada renglón. */
function cuerpo(secciones: Secciones, referencia: Flujo, mostrar: ReadonlySet<string>, desde: number, celdas: (clave: string) => Celda[]) {
  const filas: Celda[][] = [], estilos: Record<number, EstiloFila> = {};
  for (const s of secciones) {
    estilos[desde + filas.length] = { fondo: s.fondo, negrita: true };
    filas.push([s.nombre.toUpperCase()]);
    for (const r of referencia.renglones.filter((x) => x.seccion === s.clave && mostrar.has(x.clave))) {
      if (r.tipo === "total") estilos[desde + filas.length] = BARRA;
      filas.push([r.nombre, ...celdas(r.clave)]);
    }
    filas.push([]);
  }
  return { filas, estilos };
}
const avisos = (f: Flujo): Celda[][] => [
  ...(f.porConciliar.n ? [[`${f.porConciliar.n} ${f.porConciliar.n === 1 ? "movimiento" : "movimientos"} por conciliar.`]] : []),
  ...(f.diferencia ? [[`Diferencia contra el saldo del banco: ${f.diferencia.toFixed(2)} (hay huecos en los reportes importados).`]] : []),
];

export function hojaFlujo(r: { titulo: string; periodo: string; generado: string; flujo: Flujo; secciones: Secciones; mostrar: ReadonlySet<string> }): HojaXlsx[] {
  const arriba: Celda[][] = [[`Flujo de efectivo · ${r.titulo}`], [`${r.periodo} · montos en MXN; cifras reales del banco; % sobre ingresos operativos`], [`Generado por ${r.generado}`], [], ["Renglón", "Monto", "% de ingresos"]];
  const de = new Map(r.flujo.renglones.map((x) => [x.clave, x]));
  const c = cuerpo(r.secciones, r.flujo, r.mostrar, arriba.length, (k) => {
    const x = de.get(k)!;
    return [contable(x.monto), x.pct === null ? null : { valor: x.pct, formato: "porcentaje" }];
  });
  return [{ nombre: "Flujo", filas: [...arriba, ...c.filas, ...avisos(r.flujo)], negritas: [0, 4], estilos: c.estilos, anchos: [40, 18, 16] }];
}

export function hojaFlujoComparativo(r: {
  titulo: string; periodo: string; generado: string; columnas: { etiqueta: string; flujo: Flujo }[]; total: { etiqueta: string; flujo: Flujo };
  secciones: Secciones; mostrar: ReadonlySet<string>;
}): HojaXlsx[] {
  const todas = [...r.columnas, r.total];
  const arriba: Celda[][] = [[`Flujo de efectivo comparativo · ${r.titulo}`], [`${r.periodo} · montos en MXN; cifras reales del banco`], [`Generado por ${r.generado}`], [], ["Renglón", ...todas.map((c) => c.etiqueta)]];
  const c = cuerpo(r.secciones, r.total.flujo, r.mostrar, arriba.length, (k) => todas.map((col) => contable(col.flujo.renglones.find((x) => x.clave === k)!.monto)));
  return [{ nombre: "Flujo comparativo", filas: [...arriba, ...c.filas, ...avisos(r.total.flujo)], negritas: [0, 4], estilos: c.estilos, anchos: [40, ...todas.map(() => 16)] }];
}
```

- [ ] **Step 4: Run → PASS**, then `npm run typecheck`.

- [ ] **Step 5: Commit** — `git commit -m "feat(finanzas): Excel del flujo de efectivo"` (with `lib/finanzas/excelFlujo.ts`, its test and `package.json`).

---

### Task 3: Cargador de datos y ruta del Excel

**Files:**
- Create: `app/finanzas/flujo/datos.ts`
- Create: `app/reporte/flujo/excel/route.ts`

**Interfaces:**
- Consumes: Task 1 (`calcularFlujo`, `flujoPorMes`, `visibles`, `SECCIONES_FLUJO`, tipos); Task 2 (`hojaFlujo`, `hojaFlujoComparativo`); `leerTodo` (`lib/ventas/paginar`), `finDeMes` (`lib/finanzas/pl`), `periodoMes` (`lib/finanzas/periodo`), `obtenerPerfil` (`lib/contexto`), `puedeVerFinanzas` (`lib/roles`), `escribirXlsx` (`lib/xlsx-escribir`), `fechaMX`, `hora`, `hoyMX` (`lib/formato`).
- Produces: `cargarFlujo(db, rfc: string | null, mes: string, hoy: string)` → `{ mes: { etiqueta: string; desde: string; hasta: string; flujo: Flujo }; columnas: { etiqueta: string; flujo: Flujo }[]; total: { etiqueta: string; flujo: Flujo }; mostrarMes: Set<string>; mostrarComparativo: Set<string>; primerMes: string | null }`.

- [ ] **Step 1: `datos.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTodo } from "@/lib/ventas/paginar";
import { finDeMes } from "@/lib/finanzas/pl";
import { periodoMes } from "@/lib/finanzas/periodo";
import { calcularFlujo, flujoPorMes, visibles, type MovimientoFlujo, type SaldoPrevio } from "@/lib/finanzas/flujo";

type Fila = { id: string; cuenta_id: string; fecha: string; fila_origen: number; cargo: number; abono: number; saldo: number };
type Vinculo = { movimiento_id: string; banca_conciliaciones: { tipo: string; concepto: string } };
const falla = (que: string): never => { throw Error(`No se pudo consultar ${que} para el flujo de efectivo.`); };

/** Movimientos de las cuentas (de una razón social o todas) en el rango, con la conciliación activa de cada uno, y el saldo previo de cada cuenta. */
async function leerMovimientos(db: SupabaseClient, rfc: string | null, desde: string, hasta: string) {
  let q = db.from("banca_cuentas").select("id");
  if (rfc) q = q.eq("rfc", rfc);
  const cuentas = await q.returns<{ id: string }[]>();
  if (cuentas.error) falla("las cuentas bancarias");
  const ids = (cuentas.data ?? []).map((c) => c.id);
  if (!ids.length) return { movimientos: [] as MovimientoFlujo[], previos: [] as SaldoPrevio[], primeraFecha: null as string | null };
  const [movs, vinculos, primera, ...anteriores] = await Promise.all([
    leerTodo<Fila>((a, b) => db.from("banca_movimientos").select("id,cuenta_id,fecha,fila_origen,cargo,abono,saldo").in("cuenta_id", ids)
      .gte("fecha", desde).lte("fecha", hasta).order("fecha").order("fila_origen").order("id").range(a, b).returns<Fila[]>()),
    leerTodo<Vinculo>((a, b) => db.from("banca_conciliacion_movimientos")
      .select("movimiento_id,banca_conciliaciones!inner(tipo,concepto),banca_movimientos!inner(fecha,cuenta_id)").eq("activa", true)
      .in("banca_movimientos.cuenta_id", ids).gte("banca_movimientos.fecha", desde).lte("banca_movimientos.fecha", hasta)
      .order("conciliacion_id").order("movimiento_id").range(a, b).returns<Vinculo[]>()),
    db.from("banca_movimientos").select("fecha").in("cuenta_id", ids).order("fecha").limit(1).returns<{ fecha: string }[]>(),
    ...ids.map((id) => db.from("banca_movimientos").select("saldo").eq("cuenta_id", id).lt("fecha", desde)
      .order("fecha", { ascending: false }).order("fila_origen", { ascending: false }).limit(1).returns<{ saldo: number }[]>()),
  ]);
  if (primera.error || anteriores.some((r) => r.error)) falla("los saldos del banco");
  const conciliacion = new Map(vinculos.map((v) => [v.movimiento_id, v.banca_conciliaciones]));
  return {
    movimientos: movs.map((m): MovimientoFlujo => ({
      cuentaId: m.cuenta_id, fecha: m.fecha, fila: m.fila_origen, cargo: Number(m.cargo), abono: Number(m.abono), saldo: Number(m.saldo),
      conciliacion: conciliacion.get(m.id) ?? null,
    })),
    previos: ids.flatMap((id, i): SaldoPrevio[] => (anteriores[i].data?.[0] ? [{ cuentaId: id, saldo: Number(anteriores[i].data![0].saldo) }] : [])),
    primeraFecha: primera.data?.[0]?.fecha ?? null,
  };
}

const siguienteMes = (mes: string) => { const [a, m] = mes.split("-").map(Number); return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`; };

/** El mes elegido y el comparativo del año (desde enero o el primer mes con movimientos) con su total. */
export async function cargarFlujo(db: SupabaseClient, rfc: string | null, mes: string, hoy: string) {
  const anio = mes.slice(0, 4);
  const { movimientos, previos, primeraFecha } = await leerMovimientos(db, rfc, `${anio}-01-01`, finDeMes(mes));
  const primerMes = primeraFecha?.slice(0, 7) ?? null;
  const inicio = primerMes && primerMes > `${anio}-01` && primerMes <= mes ? primerMes : `${anio}-01`;
  const meses: string[] = [];
  for (let m = inicio; m <= mes; m = siguienteMes(m)) meses.push(m);
  const rangos = meses.map((m) => ({ etiqueta: periodoMes(m, hoy).titulo, desde: `${m}-01`, hasta: finDeMes(m) }));
  const flujos = flujoPorMes(movimientos, previos, rangos);
  const columnas = rangos.map((r, i) => ({ etiqueta: r.etiqueta, flujo: flujos[i] }));
  const total = { etiqueta: "Total", flujo: calcularFlujo(movimientos.filter((x) => x.fecha >= rangos[0].desde), previos) };
  const ultimo = rangos[rangos.length - 1];
  return {
    mes: { ...ultimo, flujo: flujos[flujos.length - 1] }, columnas, total,
    mostrarMes: visibles([flujos[flujos.length - 1]]), mostrarComparativo: visibles([...flujos, total.flujo]), primerMes,
  };
}
```

Confirm `finDeMes` is exported from `lib/finanzas/pl.ts` (it is: `export function finDeMes(mes: string)`), and adapt the `leerTodo` call to its signature if needed (pattern in `app/finanzas/datos.ts`).

- [ ] **Step 2: `app/reporte/flujo/excel/route.ts`**

```ts
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, hora, hoyMX } from "@/lib/formato";
import { puedeVerFinanzas } from "@/lib/roles";
import { SECCIONES_FLUJO } from "@/lib/finanzas/flujo";
import { hojaFlujo, hojaFlujoComparativo } from "@/lib/finanzas/excelFlujo";
import { escribirXlsx } from "@/lib/xlsx-escribir";
import { cargarFlujo } from "@/app/finanzas/flujo/datos";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  const q = new URL(request.url).searchParams;
  const hoy = hoyMX();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.get("mes") ?? "") && q.get("mes")! <= hoy.slice(0, 7) ? q.get("mes")! : hoy.slice(0, 7);
  const rfc = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(q.get("rfc") ?? "") ? q.get("rfc")! : null;
  const d = await cargarFlujo(supabase, rfc, mes, hoy);
  const ahora = new Date().toISOString();
  const generado = `${perfil.nombre} · ${fechaMX(ahora)} ${hora(ahora)}`;
  const titulo = rfc ?? "Todas las razones sociales";
  const archivo = escribirXlsx([
    ...hojaFlujo({ titulo, periodo: d.mes.etiqueta, generado, flujo: d.mes.flujo, secciones: SECCIONES_FLUJO, mostrar: d.mostrarMes }),
    ...hojaFlujoComparativo({ titulo, periodo: mes.slice(0, 4), generado, columnas: d.columnas, total: d.total, secciones: SECCIONES_FLUJO, mostrar: d.mostrarComparativo }),
  ]);
  const nombre = `Flujo de efectivo ${titulo} ${mes}.xlsx`;
  return new Response(Buffer.from(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
```

Check `fechaMX`, `hora` and `hoyMX` exist in `lib/formato.ts` (they are used by `app/reporte/pl/excel/route.ts`).

- [ ] **Step 3: `npm run typecheck && npm test`** → pass.

- [ ] **Step 4: Commit** — `git commit -m "feat(finanzas): datos y Excel del flujo de efectivo"`.

---

### Task 4: Página Finanzas → Flujo de efectivo

**Files:**
- Create: `app/finanzas/flujo/page.tsx`
- Create: `app/finanzas/flujo/TablaFlujo.tsx`
- Modify: `lib/roles.ts` (menú de Finanzas: `{ href: "/finanzas/flujo", texto: "Flujo de efectivo" }` justo después de `{ href: "/finanzas", texto: "P&L" }`)

**Interfaces:**
- Consumes: `cargarFlujo` (Task 3); `SECCIONES_FLUJO`, `Flujo` (Task 1); `leerCuentasBanca` (`app/banca/Banregio.tsx`, devuelve `{ rfc, razon_social, … }[]`); `EncabezadoPagina`, `EstadoVacio`, `Icono`; `Importe` (`app/finanzas/Importe.tsx`); `porcentaje`, `fechaTexto`, `hoyMX` (`lib/formato`); `obtenerPerfil`.
- Produces: `TablaFlujo({ flujo, mostrar })` y `TablaFlujoComparativo({ columnas, total, mostrar })`.

- [ ] **Step 1: `TablaFlujo.tsx`**

```tsx
import { porcentaje } from "@/lib/formato";
import { SECCIONES_FLUJO, type Flujo } from "@/lib/finanzas/flujo";
import { Importe } from "../Importe";

/** Un mes: secciones de la plantilla con monto y % de ingresos operativos. */
export function TablaFlujo({ flujo, mostrar }: { flujo: Flujo; mostrar: ReadonlySet<string> }) {
  return (
    <section className="seccion">
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas tabla-pl">
          <caption className="solo-lector">Flujo de efectivo del mes</caption>
          <thead><tr><th>Renglón</th><th className="monto">Monto</th><th className="monto">% de ingresos</th></tr></thead>
          {SECCIONES_FLUJO.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion ${s.css}`}><th colSpan={3} scope="rowgroup">{s.nombre}</th></tr>
              {flujo.renglones.filter((r) => r.seccion === s.clave && mostrar.has(r.clave)).map((r) => (
                <tr key={r.clave} className={r.tipo === "total" ? "pl-total" : undefined}>
                  <td data-label="Renglón"><strong>{r.nombre}</strong></td>
                  <td data-label="Monto" className="monto"><Importe n={r.monto} /></td>
                  <td data-label="% de ingresos" className="monto">{porcentaje(r.pct)}</td>
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}

/** Meses lado a lado y su total; la columna de renglones queda fija al deslizar. */
export function TablaFlujoComparativo({ columnas, total, mostrar }: { columnas: { etiqueta: string; flujo: Flujo }[]; total: { etiqueta: string; flujo: Flujo }; mostrar: ReadonlySet<string> }) {
  const todas = [...columnas, total];
  const clase = (i: number) => `monto${i === columnas.length ? " pl-col-total" : ""}`;
  return (
    <section className="seccion">
      <div className="tabla-contenedor tabla-deslizable">
        <table className="tabla tabla-pl tabla-comparativo">
          <caption className="solo-lector">Flujo de efectivo comparativo</caption>
          <thead><tr><th>Renglón</th>{todas.map((c, i) => <th key={i} className={clase(i)}>{c.etiqueta}</th>)}</tr></thead>
          {SECCIONES_FLUJO.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion ${s.css}`}><th colSpan={todas.length + 1} scope="rowgroup"><span className="pl-seccion-nombre">{s.nombre}</span></th></tr>
              {total.flujo.renglones.filter((r) => r.seccion === s.clave && mostrar.has(r.clave)).map((r) => (
                <tr key={r.clave} className={r.tipo === "total" ? "pl-total" : undefined}>
                  <th scope="row">{r.nombre}</th>
                  {todas.map((c, i) => <td key={i} className={clase(i)}><Importe n={c.flujo.renglones.find((x) => x.clave === r.clave)!.monto} /></td>)}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `page.tsx`**

```tsx
import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { Icono } from "@/components/Icono";
import { leerCuentasBanca } from "@/app/banca/Banregio";
import { cargarFlujo } from "./datos";
import { TablaFlujo, TablaFlujoComparativo } from "./TablaFlujo";

type Filtros = { vista?: string; mes?: string; rfc?: string };

export default async function PaginaFlujo({ searchParams }: { searchParams: Promise<Filtros> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const hoy = hoyMX();
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(q.mes ?? "") && q.mes! <= hoy.slice(0, 7) ? q.mes! : hoy.slice(0, 7);
  const cuentas = await leerCuentasBanca(supabase);
  const empresas = [...new Map(cuentas.map((c) => [c.rfc, c.razon_social])).entries()];
  const rfc = empresas.some(([r]) => r === q.rfc) ? q.rfc! : null;
  const comparativo = q.vista === "comparativo";
  const d = await cargarFlujo(supabase, rfc, mes, hoy);
  const f = d.mes.flujo;
  const filtro = new URLSearchParams({ mes, ...(rfc ? { rfc } : {}) });
  const pestana = (activa: boolean, vista: string, texto: string) =>
    <Link aria-current={activa ? "page" : undefined} href={`/finanzas/flujo?${new URLSearchParams({ ...Object.fromEntries(filtro), vista })}`}>{texto}</Link>;
  const hasta = f.ultimaFecha && f.ultimaFecha < d.mes.hasta ? f.ultimaFecha : null;
  const avisos = [
    f.porConciliar.n > 0 && <>{f.porConciliar.n} {f.porConciliar.n === 1 ? "movimiento" : "movimientos"} por conciliar en el mes ({pesos(f.porConciliar.entradas)} de entradas, {pesos(-f.porConciliar.salidas)} de salidas). <Link href={`/banca?${new URLSearchParams({ vista: "conciliacion", desde: d.mes.desde, hasta: d.mes.hasta })}`}>Conciliar en Banca →</Link></>,
    f.diferencia !== 0 && <>El saldo final del banco difiere del calculado en {pesos(f.diferencia)}: hay huecos en los reportes importados.</>,
  ].filter(Boolean);

  return (
    <div className="panel-admin">
      <EncabezadoPagina
        titulo={<>Flujo de efectivo · {rfc ? empresas.find(([r]) => r === rfc)?.[1] : "Todas las razones sociales"}</>}
        descripcion={<>{comparativo ? `Comparativo ${mes.slice(0, 4)}` : d.mes.etiqueta}{hasta && !comparativo && ` · movimientos hasta el ${fechaTexto(hasta)}`}. Cifras reales del banco según la conciliación; % sobre ingresos operativos.</>}
        acciones={<a className="boton boton-secundario boton-compacto" href={`/reporte/flujo/excel?${filtro}`} download><Icono nombre="descargar" />Excel</a>}
      />
      <div className="barra-filtros">
        <nav className="segmentos" aria-label="Vista">{pestana(!comparativo, "mes", "Mes")}{pestana(comparativo, "comparativo", "Comparativo")}</nav>
        <form className="barra-filtros" method="get" aria-label="Mes y razón social">
          <input type="hidden" name="vista" value={comparativo ? "comparativo" : "mes"} />
          <label htmlFor="mes" className="solo-lector">Mes</label>
          <input id="mes" name="mes" type="month" defaultValue={mes} min={d.primerMes ?? undefined} max={hoy.slice(0, 7)} />
          <label htmlFor="rfc" className="solo-lector">Razón social</label>
          <select id="rfc" name="rfc" defaultValue={rfc ?? ""}>
            <option value="">Todas las razones sociales</option>
            {empresas.map(([r, n]) => <option key={r} value={r}>{n}</option>)}
          </select>
          <button className="boton boton-secundario boton-compacto" type="submit">Ver</button>
        </form>
      </div>
      {cuentas.length === 0 ? <EstadoVacio icono="banco" titulo="Todavía no hay movimientos bancarios" descripcion="Importa un reporte de Banregio en Banca para ver el flujo." /> : <>
        {avisos.map((a, i) => <p key={i} role="status" className="aviso">{a}</p>)}
        {comparativo ? <TablaFlujoComparativo columnas={d.columnas} total={d.total} mostrar={d.mostrarComparativo} /> : <TablaFlujo flujo={f} mostrar={d.mostrarMes} />}
      </>}
    </div>
  );
}
```

Check that `Icono` accepts `"banco"` and `"descargar"` (both used in `app/banca/page.tsx` / `app/finanzas/page.tsx`); if `EstadoVacio`'s `icono` prop is typed, use a valid value.

- [ ] **Step 3: Menu**

In `lib/roles.ts`, Finanzas group, insert `{ href: "/finanzas/flujo", texto: "Flujo de efectivo" },` right after the P&L entry. If `lib/roles.test.ts` asserts the menu list, update the expected list.

- [ ] **Step 4: `npm run typecheck && npm test && npm run build`** → pass.

- [ ] **Step 5: Commit** — `git commit -m "feat(finanzas): pantalla de flujo de efectivo"`.

---

### Task 5: Verificación final (sin push)

- [ ] Run `npm test`, `npm run typecheck`, `npm run build` on the branch; all pass.
- [ ] Browser check only if `.env.local` with Supabase credentials exists; otherwise note it for the Vercel preview: open `/finanzas/flujo?mes=2026-10` and confirm saldo inicial = $85,457.73 (saldo final de septiembre del estado de cuenta) and that "Por conciliar" + conceptos cuadran con el saldo final del banco.
- [ ] Do not push or open the PR; the controller asks Sebastián.
