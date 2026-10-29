# P&L "Formato asesores" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuarta pestaña en `/finanzas` (`?vista=asesores`) que presenta el P&L real con la estructura de la plantilla de los asesores, hasta EBITDA, en pantalla y en Excel.

**Architecture:** Una función pura `formatoAsesores(entrada, filas)` reacomoda lo que ya calcula `calcularPL` en los renglones de la plantilla y comprueba al centavo que EBITDA 4-Wall y EBITDA coinciden. La página y el Excel solo la presentan. Sin migraciones.

**Tech Stack:** Next.js (App Router, server components), TypeScript, Supabase (solo lectura), pruebas con `node --experimental-strip-types --test`, generador propio `lib/xlsx-escribir.ts`.

**Spec:** `docs/superpowers/specs/2026-10-29-pl-formato-asesores-design.md`

## Global Constraints

- Flujo de `AGENTS.md`: rama → PR hacia `main`; nunca commit directo a `main`; sin `--allow-empty`; sin saltar hooks; `npm run hooks:install` en el clon.
- Antes de integrar deben pasar `Historial válido` y `Pruebas y tipos` (`npm test`, `npm run typecheck`).
- Por cuentas, Contra meta y Comparativo **no cambian** (mismas cifras, mismo detalle).
- Base del %: **ventas brutas**; si la venta bruta de algún canal es desconocida (`bruta === null`), **ventas netas**, y se avisa.
- D&A, EBIT, Intereses, Utilidad antes de impuestos, ISR y Utilidad neta: **Pendiente**.
- Comisión Rappi arriba de Utilidad bruta.
- Renglones de la plantilla siempre visibles; los extra solo si su monto ≠ 0.
- Excel sí, PDF no.
- Los módulos de `lib/` no importan **valores** entre sí (solo `import type`), porque las pruebas corren con strip-types; los valores se pasan como parámetro desde `app/`.

## Review Focus

- **Merma parcialmente pendiente** (`merma` con monto y `mermaPendiente: true`): debe mostrar el monto conocido marcado como parcial, no "Pendiente" a secas, y los totales deben seguir cuadrando → prueba en Task 2.
- **Venta bruta en cero** (periodo sin ventas, o todo descontado): ningún % debe dividir entre cero; se muestran como "—" → prueba en Task 2.
- **EBITDA negativo**: debe salir como monto negativo (paréntesis en pantalla y Excel), sin invertir signos de los gastos → prueba en Task 2.
- **Consolidado** (`sumarEntradas` de varias sucursales con Rappi extra y comisiones de cobro): cuadra igual que por sucursal → prueba en Task 2.
- **Detalle de "Otros"** al separar las comisiones de cobro: las comisiones NetPay/dLocal deben aparecer solo bajo "Comisiones de cobro", y Contra meta debe seguir mostrándolas bajo "Otros" → prueba en Task 3.

---

### Task 1: Rama de trabajo en el clon real

La carpeta `Downloads/dodo-control-efectivo_1/dodo-efectivo` **no es un repositorio git** (es una copia extraída). El trabajo se hace en el clon de `HelperHolding/dodo-money`.

**Files:**
- Copy: `docs/superpowers/specs/2026-10-29-pl-formato-asesores-design.md` y este plan al clon.

- [ ] **Step 1: Ubicar el clon y actualizar `main`**

Pedir a Sebastián la ruta del clon si no se conoce. En el clon:

```bash
git status -sb
git fetch origin
git switch main
git pull --ff-only
npm run hooks:install
```

Expected: árbol limpio o solo cambios ajenos (conservarlos, no sobrescribirlos).

- [ ] **Step 2: Crear la rama**

```bash
git switch -c pl-formato-asesores
```

- [ ] **Step 3: Copiar spec y plan, y comprobar que el código base coincide con el del plan**

Copiar los dos documentos a `docs/superpowers/specs/` y `docs/superpowers/plans/` del clon. Comprobar que existen y tienen la forma que el plan supone:

```bash
grep -n "export function calcularPL" lib/finanzas/pl.ts
grep -n "export function vistaPL" app/finanzas/datos.ts
grep -n 'anotar(s.id, "otros", "Comisión' app/finanzas/datos.ts
```

Expected: las tres coincidencias. Si no, detenerse y reportar la diferencia.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-10-29-pl-formato-asesores-design.md docs/superpowers/plans/2026-10-29-pl-formato-asesores.md
git commit -m "docs(finanzas): spec y plan del P&L en formato de asesores"
```

---

### Task 2: `formatoAsesores` (función pura)

**Files:**
- Create: `lib/finanzas/formatoAsesores.ts`
- Create: `lib/finanzas/formatoAsesores.test.ts`
- Modify: `package.json` (script `test`: agregar el archivo de pruebas)

**Interfaces:**
- Consumes: `EntradaPL`, `FilaPL`, `ClaveRenglon` de `lib/finanzas/pl.ts` (solo tipos); `calcularPL`, `entradaVacia`, `sumarEntradas` en las pruebas.
- Produces:
  - `type SeccionAsesores = "ventas" | "cogs" | "sucursal" | "corporativo" | "bajo"`
  - `type RenglonAsesores = { clave: string; nombre: string; seccion: SeccionAsesores; tipo: "renglon" | "total"; monto: number | null; pct: number | null; pendiente: boolean; origen: readonly string[] }`
  - `type FormatoAsesores = { renglones: RenglonAsesores[]; base: "bruta" | "neta"; avisos: string[] }`
  - `const SECCIONES_ASESORES: readonly { clave: SeccionAsesores; nombre: string; fondo: string; css: string }[]`
  - `function formatoAsesores(e: EntradaPL, filas: readonly FilaPL[]): FormatoAsesores`, que lanza `Error` si no cuadra con `calcularPL`.
  - `origen` lista las claves de detalle del P&L (`"alimento"`, `"otros"`…) cuyo "De dónde sale" corresponde al renglón; la clave especial `"comisiones_cobro"` la resuelve Task 3.

- [ ] **Step 1: Write the failing tests**

`lib/finanzas/formatoAsesores.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatoAsesores } from "./formatoAsesores.ts";
import { calcularPL, entradaVacia, sumarEntradas, type EntradaPL } from "./pl.ts";

const ctx = (v: number) => ({ ventaNeta: v, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
const E: EntradaPL = {
  ...entradaVacia(),
  canales: { dodo: { bruta: 90000, neta: 85000, alimento: 26000 }, rappi: { bruta: 20000, neta: 15000, alimento: 5000 } },
  ventaNeta: 100000, descuentos: 10000, alimento: 31000, merma: 2000,
  nomina: { cocina: 20000, gerencia: 8000 },
  gastos: { renta: 9000, servicios: 4500, marketing: 3000, mantenimiento: 1000, marketing_agregadores: 600, otros: 500 },
  sinCuenta: 200, agregadores: 3000, comisionesCobro: 1300, faltantes: 150, regalias: 5000, oficina: 4000,
};
const formato = (e: EntradaPL) => formatoAsesores(e, calcularPL(e, [], ctx(e.ventaNeta)));
const de = (f: ReturnType<typeof formato>, clave: string) => {
  const r = f.renglones.find((x) => x.clave === clave);
  assert.ok(r, `falta el renglón ${clave}`);
  return r;
};

test("estructura de la plantilla en orden, con ventas brutas, descuentos y netas por canal", () => {
  const f = formato(E);
  assert.deepEqual(f.renglones.map((r) => r.clave), [
    "ventas_dinein", "ventas_rappi", "ventas_brutas", "descuentos_dinein", "descuentos_rappi", "total_descuentos", "ventas_netas", "comision_rappi",
    "alimento", "merma", "utilidad_bruta",
    "nomina", "regalias", "mantenimiento", "renta", "servicios", "marketing_rappi", "marketing", "comisiones_cobro", "otros", "total_sucursal", "ebitda_4wall",
    "corporativo", "ebitda",
    "dya", "ebit", "intereses", "uai", "isr", "utilidad_neta",
  ]);
  assert.equal(de(f, "ventas_brutas").monto, 110000);
  assert.equal(de(f, "descuentos_dinein").monto, 5000);
  assert.equal(de(f, "total_descuentos").monto, 10000);
  assert.equal(de(f, "ventas_netas").monto, 100000);
  assert.equal(de(f, "nomina").monto, 28000);
  assert.deepEqual(de(f, "nomina").origen, ["nomina_cocina", "nomina_gerencia"]);
  assert.equal(f.base, "bruta");
  assert.equal(de(f, "ventas_brutas").pct, 1);
  assert.equal(de(f, "ventas_netas").pct, 100000 / 110000);
});

test("comisión Rappi arriba de utilidad bruta; EBITDA 4-Wall y EBITDA iguales a calcularPL", () => {
  const filas = calcularPL(E, [], ctx(E.ventaNeta));
  const f = formatoAsesores(E, filas);
  assert.equal(de(f, "utilidad_bruta").monto, 100000 - 3000 - 31000 - 2000);
  assert.equal(de(f, "ebitda_4wall").monto, filas.find((x) => x.clave === "ebitda_tienda")!.monto);
  assert.equal(de(f, "ebitda").monto, filas.find((x) => x.clave === "ebitda")!.monto);
});

test("comisiones de cobro salen de Otros; Otros conserva sin cuenta y faltantes", () => {
  const f = formato(E);
  assert.equal(de(f, "comisiones_cobro").monto, 1300);
  assert.deepEqual(de(f, "comisiones_cobro").origen, ["comisiones_cobro"]);
  assert.equal(de(f, "otros").monto, 500 + 200 + 150);
});

test("renglones extra en cero se ocultan; los de la plantilla siempre se muestran", () => {
  const f = formato({ ...E, gastos: {}, sinCuenta: 0, faltantes: 0, comisionesCobro: 0 });
  assert.equal(f.renglones.some((r) => r.clave === "marketing"), false);
  assert.equal(f.renglones.some((r) => r.clave === "comisiones_cobro"), false);
  assert.equal(de(f, "renta").monto, 0);
  assert.equal(de(f, "marketing_rappi").monto, 0);
});

test("Rappi fuera de base y excedente se suman a ventas netas y cuadran con EBITDA", () => {
  const e = { ...E, rappiFueraBase: 600, rappiExcedente: 400, rappiAjustes: 250 };
  const filas = calcularPL(e, [], ctx(e.ventaNeta));
  const f = formatoAsesores(e, filas);
  assert.equal(de(f, "rappi_fuera_base").monto, 600);
  assert.equal(de(f, "rappi_excedente").monto, 400);
  assert.equal(de(f, "ventas_netas").monto, 101000);
  assert.equal(de(f, "rappi_ajustes").monto, 250);
  assert.equal(de(f, "ebitda").monto, filas.find((x) => x.clave === "ebitda")!.monto);
});

test("venta bruta desconocida: brutas y descuentos del canal en Pendiente, % sobre netas y aviso", () => {
  const f = formato({ ...E, canales: { ...E.canales, rappi: { bruta: null, neta: 15000, alimento: 5000 } } });
  assert.equal(de(f, "ventas_rappi").monto, null);
  assert.equal(de(f, "ventas_brutas").monto, null);
  assert.equal(de(f, "descuentos_rappi").monto, null);
  assert.equal(de(f, "descuentos_dinein").monto, 5000);
  assert.equal(f.base, "neta");
  assert.equal(de(f, "ventas_netas").pct, 1);
  assert.match(f.avisos.join(" "), /ventas netas/);
});

test("merma: pendiente sin monto muestra Pendiente; parcial conserva el monto marcado", () => {
  const sin = formato({ ...E, merma: null, mermaPendiente: true });
  assert.equal(de(sin, "merma").monto, null);
  assert.equal(de(sin, "merma").pendiente, true);
  assert.equal(de(sin, "utilidad_bruta").monto, 100000 - 3000 - 31000);
  const parcial = formato({ ...E, merma: 140, mermaPendiente: true });
  assert.equal(de(parcial, "merma").monto, 140);
  assert.equal(de(parcial, "merma").pendiente, true);
});

test("bajo EBITDA todo en Pendiente", () => {
  const f = formato(E);
  for (const k of ["dya", "ebit", "intereses", "uai", "isr", "utilidad_neta"]) {
    assert.equal(de(f, k).monto, null);
    assert.equal(de(f, k).pendiente, true);
    assert.equal(de(f, k).pct, null);
  }
});

test("venta en cero: sin división entre cero", () => {
  const f = formato({ ...entradaVacia(), regalias: 100 });
  assert.equal(de(f, "ventas_brutas").monto, 0);
  assert.equal(de(f, "regalias").pct, null);
  assert.equal(de(f, "ebitda").monto, -100);
});

test("EBITDA negativo conserva el signo", () => {
  const f = formato({ ...E, oficina: 80000 });
  assert.ok(de(f, "ebitda").monto! < 0);
  assert.equal(de(f, "corporativo").monto, 80000);
});

test("consolidado: la suma de sucursales cuadra igual", () => {
  const e = sumarEntradas([E, { ...E, rappiFueraBase: 60, comisionesCobro: 7 }]);
  const filas = calcularPL(e, [], ctx(e.ventaNeta));
  const f = formatoAsesores(e, filas);
  assert.equal(de(f, "ebitda_4wall").monto, filas.find((x) => x.clave === "ebitda_tienda")!.monto);
  assert.equal(de(f, "comisiones_cobro").monto, 1307);
});

test("si no cuadra con calcularPL, lanza error", () => {
  const filas = calcularPL(E, [], ctx(E.ventaNeta)).map((x) => (x.clave === "ebitda_tienda" ? { ...x, monto: x.monto! + 1 } : x));
  assert.throws(() => formatoAsesores(E, filas), /no cuadra/);
});
```

Registrar el archivo en `package.json`, en el script `test`, justo después de `lib/finanzas/excel.test.ts`:

```bash
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.scripts.test=p.scripts.test.replace("lib/finanzas/excel.test.ts ","lib/finanzas/excel.test.ts lib/finanzas/formatoAsesores.test.ts ");fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
git diff package.json
```

Expected: el diff solo agrega `lib/finanzas/formatoAsesores.test.ts` (si cambia el formato del archivo, revertir y editar a mano).

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test lib/finanzas/formatoAsesores.test.ts`
Expected: FAIL, no encuentra `./formatoAsesores.ts`.

- [ ] **Step 3: Write the implementation**

`lib/finanzas/formatoAsesores.ts`:

```ts
/** P&L con la estructura de la plantilla de los asesores: reacomoda lo que calcula `calcularPL`, sin cálculos nuevos. */
import type { ClaveRenglon, EntradaPL, FilaPL } from "./pl";

export type SeccionAsesores = "ventas" | "cogs" | "sucursal" | "corporativo" | "bajo";
export type RenglonAsesores = {
  clave: string; nombre: string; seccion: SeccionAsesores; tipo: "renglon" | "total";
  /** null: sin dato (se muestra "Pendiente"). */
  monto: number | null;
  pct: number | null;
  /** Falta información: sin monto, o monto parcial. */
  pendiente: boolean;
  /** Claves de detalle del P&L ("De dónde sale") que corresponden a este renglón. */
  origen: readonly string[];
};
export type FormatoAsesores = { renglones: RenglonAsesores[]; base: "bruta" | "neta"; avisos: string[] };

export const SECCIONES_ASESORES: readonly { clave: SeccionAsesores; nombre: string; fondo: string; css: string }[] = [
  { clave: "ventas", nombre: "Ventas", fondo: "BDD7EE", css: "pl-venta" },
  { clave: "cogs", nombre: "COGS", fondo: "D9EAD3", css: "pl-costo" },
  { clave: "sucursal", nombre: "Gastos sucursal", fondo: "FCE4D6", css: "pl-operacion" },
  { clave: "corporativo", nombre: "Corporativo", fondo: "EAD1DC", css: "pl-oficina" },
  { clave: "bajo", nombre: "Debajo de EBITDA", fondo: "F2F2F2", css: "pl-memo" },
];

const c = (n: number) => Math.round(n * 100) / 100;

export function formatoAsesores(e: EntradaPL, filas: readonly FilaPL[]): FormatoAsesores {
  const m = (k: ClaveRenglon) => filas.find((f) => f.clave === k)?.monto ?? 0;
  const { dodo, rappi } = e.canales;
  const brutas = dodo.bruta === null || rappi.bruta === null ? null : c(dodo.bruta + rappi.bruta);
  const descuento = (x: typeof dodo) => (x.bruta === null ? null : c(x.bruta - x.neta));
  const descDodo = descuento(dodo), descRappi = descuento(rappi);
  const totalDesc = descDodo === null || descRappi === null ? null : c(descDodo + descRappi);
  const netas = c(e.ventaNeta + (e.rappiFueraBase ?? 0) + (e.rappiExcedente ?? 0));
  const merma = e.merma;
  const utilidadBruta = c(netas - e.agregadores - e.alimento - (merma ?? 0));

  type Sin = Omit<RenglonAsesores, "pct" | "seccion">;
  const r = (clave: string, nombre: string, monto: number | null, origen: readonly string[] = [], extra: Partial<Sin> = {}): Sin =>
    ({ clave, nombre, tipo: "renglon", monto, pendiente: monto === null, origen, ...extra });
  const total = (clave: string, nombre: string, monto: number | null): Sin => ({ ...r(clave, nombre, monto), tipo: "total" });
  /** Renglón que la plantilla no tiene: solo si trae monto. */
  const opcional = (x: Sin) => (x.monto ? [x] : []);

  const sucursal: Sin[] = [
    r("nomina", "Nómina sucursal", c(m("nomina_cocina") + m("nomina_gerencia")), ["nomina_cocina", "nomina_gerencia"]),
    r("regalias", "Regalías", m("regalias"), ["regalias"]),
    r("mantenimiento", "Gastos de mantenimiento", m("mantenimiento"), ["mantenimiento"]),
    r("renta", "Renta", m("renta"), ["renta"]),
    r("servicios", "Servicios (luz, agua, basura, etc.)", m("servicios"), ["servicios"]),
    r("marketing_rappi", "Marketing Rappi", m("marketing_agregadores"), ["marketing_agregadores"]),
    ...opcional(r("repartidores", "Repartidores", m("repartidores"), ["repartidores"])),
    ...opcional(r("rappi_ajustes", "Rappi · compensaciones y cancelaciones", m("rappi_ajustes"), ["rappi_ajustes"])),
    ...opcional(r("marketing", "Marketing", m("marketing"), ["marketing"])),
    ...opcional(r("consumibles_equipo", "Consumibles y equipo menor", m("consumibles_equipo"), ["consumibles_equipo"])),
    ...opcional(r("comisiones_cobro", "Comisiones de cobro (NetPay y dLocal)", e.comisionesCobro, ["comisiones_cobro"])),
    ...opcional(r("otros", "Otros gastos de operación", c(m("otros") - e.comisionesCobro), ["otros"])),
  ];
  const totalSucursal = c(sucursal.reduce((s, x) => s + (x.monto ?? 0), 0));
  const ebitda4 = c(utilidadBruta - totalSucursal);
  const ebitda = c(ebitda4 - m("oficina"));
  for (const [nombre, propio, pl] of [["EBITDA 4-Wall", ebitda4, m("ebitda_tienda")], ["EBITDA", ebitda, m("ebitda")]] as const)
    if (Math.abs(propio - pl) > 0.005) throw new Error(`El formato de asesores no cuadra con el P&L: ${nombre} ${propio} contra ${pl}.`);

  const secciones: [SeccionAsesores, Sin[]][] = [
    ["ventas", [
      r("ventas_dinein", "Ventas Dine-In", dodo.bruta, ["venta_neta_dodo"]),
      r("ventas_rappi", "Ventas brutas Rappi", rappi.bruta, ["venta_neta_rappi"]),
      total("ventas_brutas", "Ventas brutas", brutas),
      r("descuentos_dinein", "Descuentos Dine-In", descDodo),
      r("descuentos_rappi", "Descuentos Rappi", descRappi),
      total("total_descuentos", "Total descuentos", totalDesc),
      ...opcional(r("rappi_fuera_base", "Rappi · ingresos fuera de base de retención", e.rappiFueraBase ?? 0, ["rappi_fuera_base"])),
      ...opcional(r("rappi_excedente", "Rappi · excedente DAR sin IVA", e.rappiExcedente ?? 0, ["rappi_excedente"])),
      total("ventas_netas", "Ventas netas", netas),
      r("comision_rappi", "Comisión Rappi", e.agregadores, ["agregadores"]),
    ]],
    ["cogs", [
      r("alimento", "Alimentos y empaque", e.alimento, ["alimento"]),
      r("merma", "Merma", merma === null && !e.mermaPendiente ? 0 : merma, ["merma"], { pendiente: e.mermaPendiente }),
      total("utilidad_bruta", "Utilidad bruta", utilidadBruta),
    ]],
    ["sucursal", [...sucursal, total("total_sucursal", "Total gastos sucursal", totalSucursal), total("ebitda_4wall", "EBITDA 4-Wall", ebitda4)]],
    ["corporativo", [r("corporativo", "Gasto corporativo", m("oficina"), ["oficina"]), total("ebitda", "EBITDA", ebitda)]],
    ["bajo", [
      r("dya", "Depreciación y amortización", null), total("ebit", "EBIT", null),
      r("intereses", "Intereses", null), total("uai", "Utilidad antes de impuestos", null),
      r("isr", "ISR", null), total("utilidad_neta", "Utilidad neta", null),
    ]],
  ];

  const baseBruta = brutas !== null;
  const base = baseBruta ? brutas : netas;
  const pct = (n: number | null) => (n === null || !base ? null : n / base);
  return {
    renglones: secciones.flatMap(([seccion, xs]) => xs.map((x) => ({ ...x, seccion, pct: pct(x.monto) }))),
    base: baseBruta ? "bruta" : "neta",
    avisos: baseBruta ? [] : ["La venta bruta no está completa (falta el detalle por producto de algún día); los porcentajes se calculan sobre ventas netas."],
  };
}
```

Nota: en la merma, `merma === null && !mermaPendiente` es "no hubo merma" (0); `merma === null && mermaPendiente` queda en `null`, que se muestra como "Pendiente".

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test lib/finanzas/formatoAsesores.test.ts`
Expected: PASS (12 pruebas). Si "consolidado" falla por centavos, revisar que todo pase por `c()`.

- [ ] **Step 5: Commit**

```bash
git add lib/finanzas/formatoAsesores.ts lib/finanzas/formatoAsesores.test.ts package.json
git commit -m "feat(finanzas): estructura del P&L en formato de asesores"
```

---

### Task 3: Datos de la pestaña y detalle de comisiones de cobro

**Files:**
- Modify: `app/finanzas/datos.ts` (textos de comisiones en una constante; nueva `plAsesores`)
- Modify: `app/finanzas/reporte-datos.ts` (opción `asesores`)
- Create: `tests/plAsesoresDetalle.test.mjs` (opcional, ver Step 1)

**Interfaces:**
- Consumes: `formatoAsesores`, `FormatoAsesores` (Task 2); `datosPL`, `vistaPL` (ya existen en `datos.ts`).
- Produces:
  - `plAsesores(supabase: SupabaseClient, p: Periodo, sucursalId: string | undefined)` → `{ datos: DatosPeriodo; suc; titulo: string; entrada: EntradaPL; filas: FilaPL[]; avisos: string[]; formato: FormatoAsesores | null; error: string | null; detalleDe: (origen: readonly string[]) => Detalle }`
  - `reportePL(q, { meta, comparativo, cuentas?, asesores? })` devuelve además `asesores` (resultado de `plAsesores` o `null`).

El detalle de las comisiones NetPay/dLocal se sigue guardando bajo `"otros"` (Por cuentas y Contra meta no cambian). `plAsesores` lo separa reconociendo esos dos textos, que se vuelven una constante para que no puedan divergir.

- [ ] **Step 1: Constante de textos de comisión**

En `app/finanzas/datos.ts`, junto a los demás `const` del inicio del archivo (después de `renglonDe`):

```ts
/** Textos con que se anotan las comisiones de cobro en el detalle de "Otros"; el formato de asesores las separa por estos textos. */
const TEXTO_COBRO = { dlocal: "Comisión dLocal (pagos en la app, sin Rappi)", netpay: "Comisión NetPay (terminal, sin Rappi)" } as const;
const esComisionCobro = (texto: string) => texto === TEXTO_COBRO.dlocal || texto === TEXTO_COBRO.netpay;
```

Reemplazar las dos llamadas existentes:

```ts
    anotar(s.id, "otros", TEXTO_COBRO.dlocal, cobro.dlocal);
    anotar(s.id, "otros", TEXTO_COBRO.netpay, cobro.netpay);
```

Comprobar que no quedan textos sueltos:

```bash
grep -n "Comisión dLocal\|Comisión NetPay" app lib -r
```

Expected: solo la línea de `TEXTO_COBRO`.

- [ ] **Step 2: `plAsesores`**

En `app/finanzas/datos.ts`, agregar el import:

```ts
import { formatoAsesores, type FormatoAsesores } from "@/lib/finanzas/formatoAsesores";
```

y después de `plConHistoria`:

```ts
/** Pestaña "Formato asesores": el mismo P&L del periodo con la estructura de la plantilla; sin metas ni comparaciones. */
export async function plAsesores(supabase: SupabaseClient, p: Periodo, sucursalId: string | undefined) {
  const d = await datosPL(supabase, p);
  const vista = vistaPL(d, sucursalId);
  let formato: FormatoAsesores | null = null, error: string | null = null;
  try { formato = formatoAsesores(vista.entrada, vista.filas); } catch (e) { error = e instanceof Error ? e.message : String(e); }
  const de = (clave: string) => (vista.suc ? d.detalle.get(`${vista.suc.id}|${clave}`) ?? [] : []);
  /** "comisiones_cobro" son las comisiones anotadas en "otros"; "otros" aquí ya no las incluye. */
  const detalleDe = (origen: readonly string[]): Detalle => origen.flatMap((clave) =>
    clave === "comisiones_cobro" ? de("otros").filter((x) => esComisionCobro(x.texto))
      : clave === "otros" ? de("otros").filter((x) => !esComisionCobro(x.texto))
      : de(clave));
  return { datos: d, ...vista, formato, error, detalleDe };
}
```

- [ ] **Step 3: `reportePL` con la opción `asesores`**

En `app/finanzas/reporte-datos.ts`:

```ts
import { comparativoPL, plAsesores, plConHistoria } from "./datos";
```

```ts
export async function reportePL(q: FiltrosPL, que: { meta: boolean; comparativo: boolean; cuentas?: boolean; asesores?: boolean }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  const periodo = elegirPeriodo(q, hoyMX(), INICIO_FECHA);
  const [meta, comp, cuentas, asesores] = await Promise.all([
    que.meta ? plConHistoria(supabase, periodo, q.sucursal) : Promise.resolve(null),
    que.comparativo ? comparativoPL(supabase, periodo, q.sucursal) : Promise.resolve(null),
    que.cuentas ? cuentasPL(supabase, periodo, q.sucursal) : Promise.resolve(null),
    que.asesores ? plAsesores(supabase, periodo, q.sucursal) : Promise.resolve(null),
  ]);
  return { periodo, generadoPor: perfil.nombre, titulo: cuentas?.titulo ?? meta?.titulo ?? comp?.titulo ?? asesores?.titulo ?? "Consolidado", meta, comp, cuentas, asesores };
}
```

- [ ] **Step 4: Typecheck y pruebas**

Run: `npm run typecheck`
Expected: sin errores.

Run: `npm test`
Expected: PASS. Las pruebas de Contra meta y Por cuentas no cambian, porque el detalle sigue guardado bajo `"otros"`.

El filtrado de `detalleDe` depende de Supabase y no tiene prueba unitaria. Se comprueba en el navegador en Task 6 (Review Focus, "Detalle de Otros").

- [ ] **Step 5: Commit**

```bash
git add app/finanzas/datos.ts app/finanzas/reporte-datos.ts
git commit -m "feat(finanzas): datos del P&L en formato de asesores"
```

---

### Task 4: Pestaña "Formato asesores" en pantalla

**Files:**
- Create: `app/finanzas/TablaAsesores.tsx`
- Modify: `app/finanzas/TablaPL.tsx` (exportar `desplegable`)
- Modify: `app/finanzas/page.tsx`

**Interfaces:**
- Consumes: `plAsesores` (Task 3); `FormatoAsesores`, `SECCIONES_ASESORES` (Task 2); `Importe`, `AdvertenciasPL`, `EstadoVacio` (existentes).
- Produces: `TablaAsesores({ formato, detalleDe, conDetalle? })`.

- [ ] **Step 1: Exportar `desplegable`**

En `app/finanzas/TablaPL.tsx` cambiar `const desplegable = (items: Detalle, rotulo: string) =>` por:

```ts
export const desplegable = (items: Detalle, rotulo: string) =>
```

y `type Detalle = …` por `export type Detalle = …`.

- [ ] **Step 2: `TablaAsesores.tsx`**

```tsx
import { porcentaje } from "@/lib/formato";
import { SECCIONES_ASESORES, type FormatoAsesores, type RenglonAsesores } from "@/lib/finanzas/formatoAsesores";
import { Importe } from "./Importe";
import { desplegable, type Detalle } from "./TablaPL";

/** P&L con la estructura de la plantilla de los asesores: monto y % de ventas brutas (o netas si la bruta no está completa). */
export function TablaAsesores({ formato, detalleDe, conDetalle = true }: {
  formato: FormatoAsesores;
  detalleDe: (origen: readonly string[]) => Detalle;
  conDetalle?: boolean;
}) {
  const base = formato.base === "bruta" ? "% de ventas brutas" : "% de ventas netas";
  const renglon = (r: RenglonAsesores) => (
    <tr key={r.clave} className={r.tipo === "total" ? "pl-total" : undefined}>
      <td data-label="Renglón">
        <span className="celda-pila">
          <strong>{r.nombre}</strong>
          {r.pendiente && r.monto !== null && <small>Parcial: hay montos pendientes</small>}
          {conDetalle && r.origen.length > 0 && desplegable(detalleDe(r.origen), "De dónde sale")}
        </span>
      </td>
      <td data-label="Monto" className="monto">{r.monto === null ? "Pendiente" : <Importe n={r.monto} />}</td>
      <td data-label={base} className="monto">{porcentaje(r.pct)}</td>
    </tr>
  );
  return (
    <section className="seccion">
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas tabla-pl">
          <caption className="solo-lector">Estado de resultados en formato de asesores</caption>
          <thead><tr><th>Renglón</th><th className="monto">Monto</th><th className="monto">{base}</th></tr></thead>
          {SECCIONES_ASESORES.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion ${s.css}`}><th colSpan={3} scope="rowgroup">{s.nombre}</th></tr>
              {formato.renglones.filter((r) => r.seccion === s.clave).map(renglon)}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Pestaña en `page.tsx`**

En `app/finanzas/page.tsx`:

1. Imports:

```ts
import { comparativoPL, plAsesores, plConHistoria } from "./datos";
import { TablaAsesores } from "./TablaAsesores";
```

2. Reemplazar la carga de datos (desde `const cuentas = …` hasta `const vista: Record<string, string> = …`) por:

```ts
  const asesores = q.vista === "asesores";
  const cuentas = !q.vista || q.vista === "cuentas";
  const contable = cuentas ? await cuentasPL(supabase,p,q.sucursal) : null;
  const comparativo = q.vista === "comparativo";
  const meta = comparativo || cuentas || asesores ? null : await plConHistoria(supabase, p, q.sucursal);
  const comp = comparativo ? await comparativoPL(supabase, p, q.sucursal) : null;
  const ases = asesores ? await plAsesores(supabase, p, q.sucursal) : null;
  const titulo = contable?.titulo ?? meta?.titulo ?? comp?.titulo ?? ases?.titulo ?? "Consolidado";
  const sucId = contable ? contable.sucursal : meta ? meta.suc?.id : comp ? comp.suc?.id : ases?.suc?.id;
  const sucursales = contable ? contable.sucursales : meta ? meta.datos.porSucursal : comp ? comp.sucursales : ases?.datos.porSucursal ?? [];
  const suc: Record<string, string> = sucId ? { sucursal: sucId } : {};
  const vista: Record<string, string> = {vista:cuentas?"cuentas":comparativo?"comparativo":asesores?"asesores":"meta"};
```

3. En `acciones`, ocultar el PDF en esta pestaña (el spec no lo incluye):

```tsx
          {!asesores && <Link className="boton boton-secundario boton-compacto" href={`/reporte/pl?${filtro}`} target="_blank"><Icono nombre="documento" />{cuentas?"PDF operativo":"PDF"}</Link>}
```

4. En el `<nav aria-label="Vista">`, después de "Comparativo":

```tsx
          {pestana(asesores, `/finanzas?${new URLSearchParams({ ...paramsPeriodo(p), ...suc, vista: "asesores" })}`, "Formato asesores")}
```

5. Ajustar la condición de "Contra meta" para que no quede activa en esta pestaña: `pestana(!comparativo&&!cuentas&&!asesores, …)`.

6. Al inicio de la cadena de render (antes de `{contable ? <>`), agregar la rama de esta pestaña. La expresión queda `{ases ? (…) : contable ? <> … }`:

```tsx
      {ases ? (
        p.vacio ? <EstadoVacio icono="calendario" titulo={p.tipo === "semana" ? "La semana apenas empieza" : "El mes apenas empieza"} descripcion="Todavía no hay días cerrados. Elige un periodo anterior para ver resultados." />
        : !ases.formato ? <AdvertenciasPL avisos={[`No se muestra el formato de asesores: ${ases.error}`]} />
        : <>
          <p className="nota">Estructura de la plantilla de los asesores con cifras reales. Los renglones debajo de EBITDA quedan pendientes hasta tener su fuente.</p>
          <AdvertenciasPL avisos={[...ases.formato.avisos, ...ases.avisos]} />
          <TablaAsesores formato={ases.formato} detalleDe={ases.detalleDe} />
        </>
      ) : contable ? <>
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add app/finanzas/TablaAsesores.tsx app/finanzas/TablaPL.tsx app/finanzas/page.tsx
git commit -m "feat(finanzas): pestaña Formato asesores en el P&L"
```

---

### Task 5: Excel de la pestaña

**Files:**
- Create: `lib/finanzas/excelAsesores.ts`
- Create: `lib/finanzas/excelAsesores.test.ts`
- Modify: `app/reporte/pl/excel/route.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `FormatoAsesores`, `SECCIONES_ASESORES` (Task 2, pasado como parámetro); `reportePL(..., { asesores: true })` (Task 3); `HojaXlsx`, `Celda`, `EstiloFila` de `lib/xlsx-escribir.ts`.
- Produces: `hojaAsesores(r: { titulo: string; periodo: string; generado: string; formato: FormatoAsesores; secciones: typeof SECCIONES_ASESORES }): HojaXlsx[]`

- [ ] **Step 1: Write the failing test**

`lib/finanzas/excelAsesores.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaAsesores } from "./excelAsesores.ts";
import { formatoAsesores, SECCIONES_ASESORES } from "./formatoAsesores.ts";
import { calcularPL, entradaVacia } from "./pl.ts";

const e = { ...entradaVacia(), canales: { dodo: { bruta: 1100, neta: 1000, alimento: 300 }, rappi: { bruta: 0, neta: 0, alimento: 0 } }, ventaNeta: 1000, alimento: 300, regalias: 50 };
const formato = formatoAsesores(e, calcularPL(e, [], { ventaNeta: 1000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } }));
const [h] = hojaAsesores({ titulo: "Consolidado", periodo: "Octubre 2026", generado: "Sebastián", formato, secciones: SECCIONES_ASESORES });
const fila = (t: string) => h.filas.findIndex((f) => f[0] === t);

test("hoja P&L asesores: encabezado, secciones con color y barras de total", () => {
  assert.equal(h.nombre, "P&L asesores");
  assert.equal(h.filas[0][0], "P&L formato asesores · Consolidado");
  assert.deepEqual(h.filas[4], ["Renglón", "Monto", "% de ventas brutas"]);
  assert.deepEqual(h.estilos![fila("VENTAS")], { fondo: "BDD7EE", negrita: true });
  assert.deepEqual(h.estilos![fila("EBITDA 4-Wall")], { fondo: "7F7F7F", texto: "FFFFFF", negrita: true });
  assert.equal(h.estilos![fila("Regalías")], undefined);
});

test("montos contables, porcentaje y Pendiente", () => {
  assert.deepEqual(h.filas[fila("Ventas brutas")], ["Ventas brutas", { valor: 1100, formato: "contable" }, { valor: 1, formato: "porcentaje" }]);
  assert.deepEqual(h.filas[fila("ISR")], ["ISR", "Pendiente", null]);
});
```

Registrar el archivo en el script `test`:

```bash
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));p.scripts.test=p.scripts.test.replace("lib/finanzas/formatoAsesores.test.ts ","lib/finanzas/formatoAsesores.test.ts lib/finanzas/excelAsesores.test.ts ");fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/finanzas/excelAsesores.test.ts`
Expected: FAIL, no encuentra `./excelAsesores.ts`.

- [ ] **Step 3: Write the implementation**

`lib/finanzas/excelAsesores.ts`:

```ts
import type { Celda, EstiloFila, HojaXlsx } from "../xlsx-escribir";
import type { FormatoAsesores, SeccionAsesores } from "./formatoAsesores";

const BARRA: EstiloFila = { fondo: "7F7F7F", texto: "FFFFFF", negrita: true };

/** Hoja "P&L asesores": secciones de la plantilla con color, totales en barra, monto contable y % de venta. */
export function hojaAsesores(r: {
  titulo: string; periodo: string; generado: string; formato: FormatoAsesores;
  secciones: readonly { clave: SeccionAsesores; nombre: string; fondo: string }[];
}): HojaXlsx[] {
  const base = r.formato.base === "bruta" ? "% de ventas brutas" : "% de ventas netas";
  const filas: Celda[][] = [
    [`P&L formato asesores · ${r.titulo}`],
    [`${r.periodo} · montos en MXN sin IVA; criterio devengado; ${base}`],
    [`Generado por ${r.generado}`],
    [],
    ["Renglón", "Monto", base],
  ];
  const estilos: Record<number, EstiloFila> = {};
  for (const s of r.secciones) {
    estilos[filas.length] = { fondo: s.fondo, negrita: true };
    filas.push([s.nombre.toUpperCase()]);
    for (const x of r.formato.renglones.filter((y) => y.seccion === s.clave)) {
      if (x.tipo === "total") estilos[filas.length] = BARRA;
      filas.push([x.nombre, x.monto === null ? "Pendiente" : { valor: x.monto, formato: "contable" }, x.pct === null ? null : { valor: x.pct, formato: "porcentaje" }]);
    }
    filas.push([]);
  }
  for (const a of r.formato.avisos) filas.push([a]);
  return [{ nombre: "P&L asesores", filas, negritas: [0, 4], estilos, anchos: [40, 18, 18] }];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test lib/finanzas/excelAsesores.test.ts`
Expected: PASS.

- [ ] **Step 5: Ruta del Excel**

En `app/reporte/pl/excel/route.ts`, agregar imports:

```ts
import { hojaAsesores } from "@/lib/finanzas/excelAsesores";
import { SECCIONES_ASESORES } from "@/lib/finanzas/formatoAsesores";
```

y reemplazar el cuerpo de `GET` desde `const r = await reportePL(...)` hasta `const archivo = escribirXlsx([...]);` por:

```ts
  const asesores = q.vista === "asesores";
  const r = await reportePL(q, asesores ? { meta: false, comparativo: false, asesores: true } : { meta: true, comparativo: true, cuentas: true });
  const ahora = new Date().toISOString();
  const generado = `${r.generadoPor} · ${fechaMX(ahora)} ${hora(ahora)}`;
  const p = r.periodo;
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const periodo = `${p.titulo}${enCurso ? ` · hasta el ${p.hasta}` : ""}`;
  if (asesores && !r.asesores!.formato)
    return new Response(`No se generó el Excel: ${r.asesores!.error}`, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const archivo = escribirXlsx(asesores
    ? hojaAsesores({ titulo: r.titulo, periodo, generado, formato: r.asesores!.formato!, secciones: SECCIONES_ASESORES })
    : [
      ...hojasCuentas({ ...r.cuentas!, generado }),
      ...hojaPL({
        titulo: r.titulo, periodo, generado, filas: r.meta!.filas, entrada: r.meta!.entrada,
        anterior: r.meta!.anterior, acumulado: r.meta!.acumulado, columnas: r.meta!.columnas,
      }, PRESENTACION),
      ...hojaComparativo({ titulo: r.titulo, periodo: r.comp!.periodoTitulo, generado, columnas: r.comp!.columnas, total: r.comp!.total }, PRESENTACION),
    ]);
  const nombre = `P&L ${asesores ? "asesores " : ""}${r.titulo.replace(/[\\/:*?"<>|]/g, " ")} ${p.clave}.xlsx`;
```

(Se conserva igual el `return new Response(Buffer.from(archivo), …)` del final.)

- [ ] **Step 6: Typecheck y pruebas completas**

Run: `npm run typecheck && npm test`
Expected: sin errores; todas las pruebas PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/finanzas/excelAsesores.ts lib/finanzas/excelAsesores.test.ts app/reporte/pl/excel/route.ts package.json
git commit -m "feat(finanzas): Excel del P&L en formato de asesores"
```

---

### Task 6: Verificación en el navegador y PR

**Files:** ninguno nuevo (solo correcciones si aparecen).

- [ ] **Step 1: Levantar la app**

Usar la configuración de `.claude/launch.json` del clon con `preview_start`. Si falta `.env.local` con credenciales de Supabase, pedirlo a Sebastián; no inventar valores.

- [ ] **Step 2: Comprobar la pestaña**

En `/finanzas?periodo=mes&mes=2026-10&vista=asesores`:
- Las 5 secciones aparecen en orden y las barras de total tienen el estilo del P&L.
- **EBITDA 4-Wall** y **EBITDA** son iguales a "EBITDA de tienda" y "EBITDA" de la pestaña Contra meta en el mismo periodo, en el consolidado y en cada sucursal.
- Con sucursal elegida, "Comisiones de cobro" despliega solo las comisiones NetPay/dLocal, y "Otros" no las incluye. En Contra meta, "Otros" las sigue mostrando.
- Semana en curso: mismas reglas; con la semana vacía aparece el estado vacío.
- Vista de celular (`resize_window` mobile): tarjetas legibles, sin scroll horizontal de la página.
- `read_console_messages` sin errores.

- [ ] **Step 3: Comprobar el Excel**

Descargar desde el botón Excel de la pestaña: una sola hoja, "P&L asesores", que abre sin reparar. Desde Contra meta, el Excel sigue saliendo con sus hojas de siempre.

- [ ] **Step 4: Abrir el PR**

```bash
git push -u origin pl-formato-asesores
gh pr create --base main --title "P&L: pestaña Formato asesores" --body-file -
```

Cuerpo: resumen del spec, que no hay migraciones, las comprobaciones hechas en el Step 2, y al final:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

Esperar a que pasen `Historial válido` y `Pruebas y tipos`, y revisar el diff completo antes de integrar.
