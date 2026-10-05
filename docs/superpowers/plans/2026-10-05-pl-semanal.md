# P&L semanal — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ver el P&L por semana (lunes a domingo) además de por mes, con los costos que se registran por mes repartidos por días y el periodo en curso cortado en ayer.

**Architecture:** Un módulo puro nuevo, `lib/finanzas/periodo.ts`, sabe de semanas ISO, meses que toca un rango, fracciones y recorte a ayer. `datosPL` deja de recibir un mes y recibe un rango `desde–hasta`: lo diario se filtra por fecha y lo mensual (nómina, gastos del mes, facturas, oficina) se pondera por la fracción de cada mes. `plConHistoria` recibe un `Periodo` y arma sus comparaciones (mes: mes anterior y año; semana: semana anterior y mes) con una sola carga por rango.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript estricto, Supabase, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-10-05-pl-semanal-design.md` (sobre `docs/superpowers/specs/2026-10-05-pl-fase-1-design.md`)

## Global Constraints

- Semana **lunes a domingo** (ISO 8601: la semana 1 es la que tiene el primer jueves del año), con el día operativo de `hoyMX()` (corte a las 4:00).
- Costos que se registran por mes × **días del periodo en ese mes ÷ días del mes**; un periodo que cruza meses suma la parte de cada mes.
- Periodo en curso: `hasta` = **ayer** (día operativo). Si no hay días cerrados, el periodo está vacío.
- Inicio del P&L: **2026-10-01** (`INICIO_FECHA`); no se ofrecen semanas que terminen antes ni meses anteriores.
- Sin migración. Montos sin IVA, centavos (`Math.round(n * 100) / 100`).
- Los módulos de `lib/` se importan entre sí **solo como tipos**; los tests importan con `.ts`. Archivos en CRLF.
- Cada prueba nueva de `lib/` se agrega al script `test` de `package.json`.

## Review Focus

1. **Semana que cruza meses o años** (W40 = 28 sep–4 oct; W53 = 28 dic 2026–3 ene 2027): fracciones de cada mes y título correctos (Tarea 1).
2. **Lunes temprano / día 1**: el periodo por defecto es el de **ayer** (nunca vacío); si se elige la semana actual el lunes, se muestra "apenas empieza" sin romper (Tarea 1 y Tarea 3).
3. **Mismo mes completo**: con la fracción 1 el P&L mensual de un mes cerrado da lo mismo que la fase 1 (Tarea 2: facturas sin `fraccionDe`, nómina con fracción 1).
4. **Mes en curso**: la nómina y la renta se cargan solo por los días cerrados y el aviso de días faltantes no cuenta días futuros (Tarea 3).
5. **URL manipulada** (`semana=basura`, semana futura, mes antes del inicio): cae al periodo por defecto (Tarea 1).

---

### Task 1: Periodos (`lib/finanzas/periodo.ts`)

**Files:**
- Create: `lib/finanzas/periodo.ts`
- Test: `lib/finanzas/periodo.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `type Periodo = { tipo: "mes" | "semana"; clave: string; desde: string; hasta: string; finNominal: string; titulo: string; vacio: boolean }`
  - `type Rango = { desde: string; hasta: string }`, `type MesDelRango = { mes: string; dias: number; diasMes: number; fraccion: number; fin: string }`
  - `sumarDias(fecha, n)`, `diasEntre(desde, hasta)` (inclusivo, 0 si vacío), `semanaISO(fecha)`, `rangoSemana(semana)`, `esSemana(s)`, `mesesDelRango(desde, hasta)`
  - `periodoMes(mes, hoy)`, `periodoSemana(semana, hoy)`, `anteriorDe(p, hoy)`, `acumuladoDe(p, inicio): Rango`
  - `semanasDesde(inicio, hoy): string[]` (la más reciente primero), `etiquetaSemana(semana)`
  - `elegirPeriodo(q: { periodo?; mes?; semana? }, hoy, inicio): Periodo`, `paramsPeriodo(p): Record<string, string>`
  - `COLUMNAS: Record<"mes" | "semana", { anterior; anteriorCorto; acumulado; acumuladoCorto }>`

- [ ] **Step 1: Escribir la prueba**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acumuladoDe, anteriorDe, diasEntre, elegirPeriodo, esSemana, etiquetaSemana, mesesDelRango, paramsPeriodo,
  periodoMes, periodoSemana, rangoSemana, semanaISO, semanasDesde,
} from "./periodo.ts";

const INICIO = "2026-10-01";

test("semanaISO: lunes a domingo; fin y principio de año", () => {
  assert.equal(semanaISO("2026-10-05"), "2026-W41");
  assert.equal(semanaISO("2026-10-11"), "2026-W41");
  assert.equal(semanaISO("2026-10-04"), "2026-W40");
  assert.equal(semanaISO("2027-01-01"), "2026-W53");
  assert.equal(semanaISO("2027-01-04"), "2027-W01");
  assert.equal(semanaISO("2024-12-30"), "2025-W01");
});

test("rangoSemana y esSemana", () => {
  assert.deepEqual(rangoSemana("2026-W41"), { desde: "2026-10-05", hasta: "2026-10-11" });
  assert.deepEqual(rangoSemana("2026-W53"), { desde: "2026-12-28", hasta: "2027-01-03" });
  assert.deepEqual(rangoSemana("2025-W01"), { desde: "2024-12-30", hasta: "2025-01-05" });
  assert.equal(esSemana("2026-W53"), true);
  assert.equal(esSemana("2027-W53"), false);
  assert.equal(esSemana("basura"), false);
});

test("mesesDelRango: fracción de cada mes; febrero bisiesto; vacío", () => {
  assert.deepEqual(mesesDelRango("2026-09-28", "2026-10-04"), [
    { mes: "2026-09", dias: 3, diasMes: 30, fraccion: 0.1, fin: "2026-09-30" },
    { mes: "2026-10", dias: 4, diasMes: 31, fraccion: 4 / 31, fin: "2026-10-31" },
  ]);
  assert.deepEqual(mesesDelRango("2028-02-01", "2028-02-29"), [{ mes: "2028-02", dias: 29, diasMes: 29, fraccion: 1, fin: "2028-02-29" }]);
  assert.deepEqual(mesesDelRango("2026-10-08", "2026-10-07"), []);
  const suma = [...mesesDelRango("2026-10-01", "2026-10-07"), ...mesesDelRango("2026-10-08", "2026-10-31")].reduce((t, m) => t + m.fraccion, 0);
  assert.ok(Math.abs(suma - 1) < 1e-12);
  assert.equal(diasEntre("2026-10-01", "2026-10-07"), 7);
  assert.equal(diasEntre("2026-10-08", "2026-10-07"), 0);
});

test("periodo en curso se corta en ayer; vacío si no hay días cerrados", () => {
  assert.deepEqual(periodoSemana("2026-W41", "2026-10-12"),
    { tipo: "semana", clave: "2026-W41", desde: "2026-10-05", hasta: "2026-10-11", finNominal: "2026-10-11", titulo: "Semana 41 · 5 al 11 oct 2026", vacio: false });
  assert.equal(periodoSemana("2026-W41", "2026-10-08").hasta, "2026-10-07");
  assert.equal(periodoSemana("2026-W41", "2026-10-11").hasta, "2026-10-10");
  assert.equal(periodoSemana("2026-W41", "2026-10-05").vacio, true);
  assert.equal(periodoSemana("2026-W40", "2026-10-12").titulo, "Semana 40 · 28 sep al 4 oct 2026");
  assert.equal(periodoSemana("2026-W53", "2027-02-01").titulo, "Semana 53 · 28 dic 2026 al 3 ene 2027");
  assert.deepEqual(periodoMes("2026-10", "2026-10-07"),
    { tipo: "mes", clave: "2026-10", desde: "2026-10-01", hasta: "2026-10-06", finNominal: "2026-10-31", titulo: "Octubre 2026", vacio: false });
  assert.equal(periodoMes("2026-09", "2026-10-07").hasta, "2026-09-30");
  assert.equal(periodoMes("2026-10", "2026-10-01").vacio, true);
});

test("etiquetas y lista de semanas", () => {
  assert.equal(etiquetaSemana("2026-W41"), "Sem 41 · 5–11 oct");
  assert.equal(etiquetaSemana("2026-W40"), "Sem 40 · 28 sep – 4 oct");
  assert.deepEqual(semanasDesde(INICIO, "2026-10-14"), ["2026-W42", "2026-W41", "2026-W40"]);
});

test("elegirPeriodo: por defecto el de ayer; URL inválida cae al defecto", () => {
  assert.equal(elegirPeriodo({}, "2026-10-14", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({}, "2026-11-01", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({}, "2026-10-01", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({ mes: "2026-09" }, "2026-10-14", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({ mes: "2027-01" }, "2026-10-14", INICIO).clave, "2026-10");
  assert.equal(elegirPeriodo({ periodo: "semana" }, "2026-10-12", INICIO).clave, "2026-W41");
  assert.equal(elegirPeriodo({ periodo: "semana", semana: "2026-W42" }, "2026-10-12", INICIO).vacio, true);
  for (const malo of ["2026-W50", "2026-W30", "basura"]) {
    assert.equal(elegirPeriodo({ periodo: "semana", semana: malo }, "2026-10-12", INICIO).clave, "2026-W41");
  }
  assert.deepEqual(paramsPeriodo(periodoSemana("2026-W41", "2026-10-12")), { periodo: "semana", semana: "2026-W41" });
  assert.deepEqual(paramsPeriodo(periodoMes("2026-10", "2026-10-12")), { periodo: "mes", mes: "2026-10" });
});

test("comparaciones: periodo anterior y acumulado", () => {
  assert.equal(anteriorDe(periodoSemana("2026-W41", "2026-10-14"), "2026-10-14").clave, "2026-W40");
  assert.equal(anteriorDe(periodoMes("2027-01", "2027-02-10"), "2027-02-10").clave, "2026-12");
  assert.deepEqual(acumuladoDe(periodoSemana("2026-W40", "2026-10-14"), INICIO), { desde: "2026-10-01", hasta: "2026-10-04" });
  assert.deepEqual(acumuladoDe(periodoSemana("2026-W45", "2026-11-14"), INICIO), { desde: "2026-11-01", hasta: "2026-11-08" });
  assert.deepEqual(acumuladoDe(periodoMes("2026-11", "2026-11-10"), INICIO), { desde: "2026-10-01", hasta: "2026-11-09" });
  assert.deepEqual(acumuladoDe(periodoMes("2027-02", "2027-03-10"), INICIO), { desde: "2027-01-01", hasta: "2027-02-28" });
});
```

- [ ] **Step 2: Correrla y verla fallar**

Run: `node --experimental-strip-types --test lib/finanzas/periodo.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implementar**

```ts
/**
 * Periodos del P&L: mes o semana ISO (lunes a domingo). Un periodo en curso se corta en ayer (día operativo) para que
 * ventas y costos fijos cubran los mismos días. Fechas como texto YYYY-MM-DD.
 */
export type TipoPeriodo = "mes" | "semana";
export type Periodo = {
  tipo: TipoPeriodo;
  /** "2026-10" o "2026-W41". */
  clave: string;
  /** Días que se calculan: `hasta` ya viene recortado a ayer si el periodo está en curso. */
  desde: string; hasta: string;
  /** Último día del mes o domingo de la semana. */
  finNominal: string;
  titulo: string;
  /** En curso y todavía sin días cerrados. */
  vacio: boolean;
};
export type Rango = { desde: string; hasta: string };
export type MesDelRango = { mes: string; dias: number; diasMes: number; fraccion: number; fin: string };

const DIA = 86_400_000;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const fecha = (f: string) => new Date(`${f}T00:00:00Z`);
const texto = (d: Date) => d.toISOString().slice(0, 10);
export const sumarDias = (f: string, n: number) => texto(new Date(fecha(f).getTime() + n * DIA));
export const diasEntre = (desde: string, hasta: string) => (hasta < desde ? 0 : Math.round((fecha(hasta).getTime() - fecha(desde).getTime()) / DIA) + 1);
const ultimoDia = (mes: string) => {
  const d = fecha(`${mes}-01`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return texto(d);
};
const mesMenos = (mes: string, n: number) => {
  const d = fecha(`${mes}-01`);
  d.setUTCMonth(d.getUTCMonth() - n);
  return texto(d).slice(0, 7);
};
const diaMes = (f: string) => `${Number(f.slice(8))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

/** Semana ISO de una fecha: "2026-W41". La semana es del año de su jueves. */
export function semanaISO(f: string): string {
  const d = fecha(f);
  const jueves = new Date(d.getTime() + (3 - ((d.getUTCDay() + 6) % 7)) * DIA);
  const anio = jueves.getUTCFullYear();
  const n = Math.floor((jueves.getTime() - fecha(`${anio}-01-01`).getTime()) / DIA / 7) + 1;
  return `${anio}-W${String(n).padStart(2, "0")}`;
}

/** Lunes y domingo de una semana ISO (la semana 1 contiene el 4 de enero). */
export function rangoSemana(semana: string): Rango {
  const anio = Number(semana.slice(0, 4)), n = Number(semana.slice(6));
  const ene4 = fecha(`${anio}-01-04`);
  const lunes = texto(new Date(ene4.getTime() - ((ene4.getUTCDay() + 6) % 7) * DIA + (n - 1) * 7 * DIA));
  return { desde: lunes, hasta: sumarDias(lunes, 6) };
}

export const esSemana = (s: string) => /^\d{4}-W\d{2}$/.test(s) && semanaISO(rangoSemana(s).desde) === s;

/** Meses que toca un rango, con los días que entran de cada uno y su fracción (días ÷ días del mes). */
export function mesesDelRango(desde: string, hasta: string): MesDelRango[] {
  const r: MesDelRango[] = [];
  for (let ini = desde; ini <= hasta; ) {
    const mes = ini.slice(0, 7), fin = ultimoDia(mes);
    const diasMes = Number(fin.slice(8));
    const dias = diasEntre(ini, fin < hasta ? fin : hasta);
    r.push({ mes, dias, diasMes, fraccion: dias / diasMes, fin });
    ini = sumarDias(fin, 1);
  }
  return r;
}

/** Recorta a ayer si el periodo no ha terminado. */
function armar(tipo: TipoPeriodo, clave: string, desde: string, finNominal: string, titulo: string, hoy: string): Periodo {
  const hasta = finNominal < hoy ? finNominal : sumarDias(hoy, -1);
  return { tipo, clave, desde, hasta, finNominal, titulo, vacio: hasta < desde };
}

export function periodoMes(mes: string, hoy: string): Periodo {
  return armar("mes", mes, `${mes}-01`, ultimoDia(mes), `${MESES_LARGOS[Number(mes.slice(5)) - 1]} ${mes.slice(0, 4)}`, hoy);
}

export function periodoSemana(semana: string, hoy: string): Periodo {
  const { desde, hasta } = rangoSemana(semana);
  const n = Number(semana.slice(6));
  const mismoAnio = desde.slice(0, 4) === hasta.slice(0, 4);
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  const inicio = mismoMes ? String(Number(desde.slice(8))) : `${diaMes(desde)}${mismoAnio ? "" : ` ${desde.slice(0, 4)}`}`;
  return armar("semana", semana, desde, hasta, `Semana ${n} · ${inicio} al ${diaMes(hasta)} ${hasta.slice(0, 4)}`, hoy);
}

/** Para la lista: "Sem 41 · 5–11 oct" o "Sem 40 · 28 sep – 4 oct". */
export function etiquetaSemana(semana: string): string {
  const { desde, hasta } = rangoSemana(semana);
  const n = Number(semana.slice(6));
  return desde.slice(0, 7) === hasta.slice(0, 7)
    ? `Sem ${n} · ${Number(desde.slice(8))}–${diaMes(hasta)}`
    : `Sem ${n} · ${diaMes(desde)} – ${diaMes(hasta)}`;
}

/** Semanas de la que contiene `inicio` a la de hoy, la más reciente primero. */
export function semanasDesde(inicio: string, hoy: string): string[] {
  const primera = rangoSemana(semanaISO(inicio)).desde;
  const r: string[] = [];
  for (let lunes = rangoSemana(semanaISO(hoy)).desde; lunes >= primera; lunes = sumarDias(lunes, -7)) r.push(semanaISO(lunes));
  return r;
}

/** Periodo de la URL; si falta o no es válido, el mes o la semana de ayer (nunca antes del inicio). */
export function elegirPeriodo(q: { periodo?: string; mes?: string; semana?: string }, hoy: string, inicio: string): Periodo {
  const ayer = sumarDias(hoy, -1) < inicio ? inicio : sumarDias(hoy, -1);
  if (q.periodo === "semana") {
    const s = q.semana ?? "";
    const valida = esSemana(s) && rangoSemana(s).desde <= hoy && rangoSemana(s).hasta >= inicio;
    return periodoSemana(valida ? s : semanaISO(ayer), hoy);
  }
  const m = q.mes ?? "";
  const valido = /^\d{4}-\d{2}$/.test(m) && m <= hoy.slice(0, 7) && m >= inicio.slice(0, 7);
  return periodoMes(valido ? m : ayer.slice(0, 7), hoy);
}

export const paramsPeriodo = (p: Periodo): Record<string, string> =>
  p.tipo === "semana" ? { periodo: "semana", semana: p.clave } : { periodo: "mes", mes: p.clave };

/** Periodo anterior del mismo tipo. */
export const anteriorDe = (p: Periodo, hoy: string): Periodo =>
  p.tipo === "semana" ? periodoSemana(semanaISO(sumarDias(p.desde, -7)), hoy) : periodoMes(mesMenos(p.clave, 1), hoy);

/** Acumulado para comparar: del 1 de enero (mes) o del 1 del mes (semana) hasta el último día calculado; nunca antes del inicio. */
export function acumuladoDe(p: Periodo, inicio: string): Rango {
  const base = p.tipo === "mes" ? `${p.hasta.slice(0, 4)}-01-01` : `${p.hasta.slice(0, 7)}-01`;
  return { desde: base > inicio ? base : inicio, hasta: p.hasta };
}

/** Encabezados de las dos columnas de comparación. */
export const COLUMNAS = {
  mes: { anterior: "Mes anterior %", anteriorCorto: "Mes ant.", acumulado: "Acumulado del año %", acumuladoCorto: "Año" },
  semana: { anterior: "Semana anterior %", anteriorCorto: "Sem. ant.", acumulado: "Acumulado del mes %", acumuladoCorto: "Mes" },
} as const;
export type Columnas = (typeof COLUMNAS)[TipoPeriodo];
```

- [ ] **Step 4: Correrla y verla pasar**

Run: `node --experimental-strip-types --test lib/finanzas/periodo.test.ts`
Expected: PASS (7 pruebas). Agregar el archivo al script `test`.

- [ ] **Step 5: Commit**

```bash
git add lib/finanzas/periodo.ts lib/finanzas/periodo.test.ts package.json
git commit -m "feat(finanzas): periodos del P&L (semanas ISO, fracciones de mes, recorte a ayer)"
```

---

### Task 2: Ponderación por fracción (facturas, nómina, metas)

**Files:**
- Modify: `lib/finanzas/gastos.ts`, `lib/finanzas/gastos.test.ts`
- Modify: `lib/finanzas/nomina.ts`, `lib/finanzas/nomina.test.ts`
- Modify: `lib/finanzas/pl.ts`, `lib/finanzas/pl.test.ts`

**Interfaces:**
- Consumes: `MesDelRango` (Tarea 1), solo como tipo.
- Produces:
  - `facturasAGastos(facturas, fraccionDe?: (fecha: string) => number)` — cada factura con `fecha_emision?: string`; sin `fraccionDe` se comporta como hoy.
  - `type AjusteMes = Ajuste & { mes: string }`; `nominaPeriodo(puestos, ajustes: readonly AjusteMes[], sucursal, meses: readonly Pick<MesDelRango, "mes" | "fraccion" | "fin">[])` → `{ plantilla: { cocina; gerencia }; cocina; gerencia }`
  - `escalarMetas(metas: readonly Meta[], fraccion: number): Meta[]` (solo escala `monto`), `INICIO_FECHA = "2026-10-01"` en `pl.ts`.

- [ ] **Step 1: Pruebas**

En `lib/finanzas/gastos.test.ts` agregar:

```ts
test("facturasAGastos con fracción: cada factura por la parte de su mes", () => {
  const r = facturasAGastos([
    { tipo: "ingreso", estado: "pagada", subtotal: 3000, descuento: 0, cuenta_pl: "renta", fecha_emision: "2026-09-05" },
    { tipo: "ingreso", estado: "pagada", subtotal: 3100, descuento: 0, cuenta_pl: "renta", fecha_emision: "2026-10-02" },
    { tipo: "egreso", estado: "pagada", subtotal: 310, descuento: 0, cuenta_pl: null, fecha_emision: "2026-10-20" },
  ], (f) => (f.startsWith("2026-09") ? 0.1 : 4 / 31));
  assert.deepEqual(r, { gastos: { renta: 700 }, sinCuenta: -40, memos: { insumos: 0, inversiones: 0 } });
});
```

En `lib/finanzas/nomina.test.ts` (importar también `nominaPeriodo`):

```ts
test("nominaPeriodo: cada mes que toca × su fracción, con su plantilla y sus ajustes", () => {
  const ajustes = [
    { sucursal_id: "s1", renglon: "cocina" as const, monto: 1500, concepto: "Bono", mes: "2026-10-01" },
    { sucursal_id: "s1", renglon: "cocina" as const, monto: 9999, concepto: "Otro mes", mes: "2026-11-01" },
  ];
  const n = nominaPeriodo(PUESTOS, ajustes, "s1", [
    { mes: "2026-09", fraccion: 0.1, fin: "2026-09-30" },
    { mes: "2026-10", fraccion: 4 / 31, fin: "2026-10-31" },
  ]);
  assert.deepEqual(n, { plantilla: { cocina: 9754.32, gerencia: 3406.45 }, cocina: 9947.87, gerencia: 3406.45 });
  const mes = nominaPeriodo(PUESTOS, ajustes, "s1", [{ mes: "2026-10", fraccion: 1, fin: "2026-10-31" }]);
  assert.deepEqual({ cocina: mes.cocina, gerencia: mes.gerencia }, { cocina: 77095.96, gerencia: 26400 });
});
```

En `lib/finanzas/pl.test.ts` (importar también `escalarMetas`):

```ts
test("escalarMetas: solo el monto fijo se reparte por días", () => {
  assert.deepEqual(escalarMetas([
    { renglon: "renta", tipo: "monto", valor: 31000 },
    { renglon: "alimento", tipo: "pct", valor: 0.3 },
    { renglon: "nomina_cocina", tipo: "plantilla", valor: 0 },
  ], 7 / 31), [
    { renglon: "renta", tipo: "monto", valor: 7000 },
    { renglon: "alimento", tipo: "pct", valor: 0.3 },
    { renglon: "nomina_cocina", tipo: "plantilla", valor: 0 },
  ]);
});
```

- [ ] **Step 2: Correrlas y verlas fallar**

Run: `npm test`
Expected: FAIL — `nominaPeriodo` y `escalarMetas` no existen (SyntaxError de import) y la de facturas da renta 6100 en vez de 700.

- [ ] **Step 3: Implementar**

`lib/finanzas/gastos.ts`: cambiar la firma y el monto de `facturasAGastos`:

```ts
/**
 * Facturas → gasto por cuenta (subtotal − descuento; notas de crédito restan; canceladas no cuentan).
 * Con `fraccionDe`, cada factura cuenta por la parte de su mes que entra en el periodo.
 */
export function facturasAGastos(
  facturas: readonly { tipo: "ingreso" | "egreso"; estado: string; subtotal: number; descuento: number; cuenta_pl: string | null; fecha_emision?: string }[],
  fraccionDe?: (fecha: string) => number,
) {
```

y dentro del ciclo:

```ts
    const monto = (Number(f.subtotal) - Number(f.descuento)) * (f.tipo === "egreso" ? -1 : 1) * (fraccionDe ? fraccionDe(f.fecha_emision ?? "") : 1);
```

`lib/finanzas/nomina.ts`, al final:

```ts
export type AjusteMes = Ajuste & { mes: string };

/** Nómina de un periodo: la de cada mes que toca (plantilla al cierre de ese mes + sus ajustes) × su fracción. */
export function nominaPeriodo(
  puestos: readonly Puesto[], ajustes: readonly AjusteMes[], sucursal: string | null,
  meses: readonly { mes: string; fraccion: number; fin: string }[],
) {
  const r = { plantilla: { cocina: 0, gerencia: 0 }, cocina: 0, gerencia: 0 };
  for (const m of meses) {
    const n = nominaMes(puestos, ajustes.filter((a) => a.mes.slice(0, 7) === m.mes), sucursal, m.fin);
    r.plantilla.cocina += n.plantilla.cocina * m.fraccion;
    r.plantilla.gerencia += n.plantilla.gerencia * m.fraccion;
    r.cocina += n.cocina * m.fraccion;
    r.gerencia += n.gerencia * m.fraccion;
  }
  return {
    plantilla: { cocina: centavos(r.plantilla.cocina), gerencia: centavos(r.plantilla.gerencia) },
    cocina: centavos(r.cocina), gerencia: centavos(r.gerencia),
  };
}
```

`lib/finanzas/pl.ts`: junto a `INICIO_PL`:

```ts
export const INICIO_FECHA = `${INICIO_PL}-01`;

/** Metas de un periodo: los % no cambian; el monto fijo mensual se reparte por la fracción de días. La plantilla ya viene prorrateada en el contexto. */
export const escalarMetas = (metas: readonly Meta[], fraccion: number): Meta[] =>
  metas.map((m) => (m.tipo === "monto" ? { ...m, valor: centavos(Number(m.valor) * fraccion) } : m));
```

- [ ] **Step 4: Correrlas y verlas pasar**

Run: `npm test`
Expected: PASS, todas.

- [ ] **Step 5: Commit**

```bash
git add lib/finanzas package.json
git commit -m "feat(finanzas): facturas, nómina y metas ponderadas por fracción de mes"
```

---

### Task 3: P&L por periodo (datos, pantalla, PDF y Excel)

**Files:**
- Modify: `app/finanzas/datos.ts` (reescrito), `app/finanzas/page.tsx`, `app/finanzas/TablaPL.tsx`
- Modify: `app/finanzas/reporte-datos.ts`, `app/reporte/pl/page.tsx`, `app/reporte/pl/excel/route.ts`
- Modify: `lib/finanzas/excel.ts`, `lib/finanzas/excel.test.ts`
- Modify: `lib/finanzas/pl.ts`, `lib/finanzas/pl.test.ts` (quitar `mesAnterior` y `mesesAcumulados`, que dejan de usarse)

**Interfaces:**
- Consumes: todo lo de las Tareas 1 y 2.
- Produces:
  - `datosPL(supabase, rango: Rango): Promise<DatosPeriodo>` (`DatosPeriodo` = el `DatosMes` de la fase 1 con `rango` en lugar de `mes`)
  - `plConHistoria(supabase, p: Periodo, sucursalId?)` → como antes + `columnas: Columnas`
  - `hojaPL({ titulo, periodo: string, generado, filas, anterior, acumulado, columnas })`
  - `TablaPL({ r, oficina, columnas })`
  - `reportePL(q: { periodo?; mes?; semana?; sucursal? })` → `{ titulo, periodo: Periodo, generadoPor, filas, anterior, acumulado, columnas, avisos, entrada }`

- [ ] **Step 1: Prueba de `hojaPL` con el periodo y las columnas**

En `lib/finanzas/excel.test.ts` cambiar la llamada y los encabezados esperados:

```ts
  const [h] = hojaPL({
    titulo: "Consolidado", periodo: "Semana 41 · 5 al 11 oct 2026", generado: "Sebastián", filas, anterior: null,
    acumulado: new Map([["alimento", 0.31]]), columnas: { anterior: "Semana anterior %", acumulado: "Acumulado del mes %" },
  });
  assert.equal(h.nombre, "P&L");
  assert.equal(h.filas[1][0], "Semana 41 · 5 al 11 oct 2026 · sin IVA, criterio devengado");
  assert.deepEqual(h.filas[4], ["Renglón", "Real", "% de venta", "Meta", "Meta %", "Diferencia", "Semana anterior %", "Acumulado del mes %"]);
```

Y en `lib/finanzas/pl.test.ts` reemplazar la prueba de meses por:

```ts
test("finDeMes", () => {
  assert.equal(finDeMes("2026-10"), "2026-10-31");
  assert.equal(finDeMes("2028-02"), "2028-02-29");
});
```

(quitar `mesAnterior` y `mesesAcumulados` del import).

Run: `npm test` → Expected: FAIL en `hojaPL` (fila 1 dice "Mes undefined…" y los encabezados son los de mes).

- [ ] **Step 2: `lib/finanzas/excel.ts` y `lib/finanzas/pl.ts`**

```ts
export function hojaPL(r: {
  titulo: string; periodo: string; generado: string; filas: FilaPL[];
  anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
  columnas: { anterior: string; acumulado: string };
}): HojaXlsx[] {
  const filas: Celda[][] = [
    [`P&L · ${r.titulo}`], [`${r.periodo} · sin IVA, criterio devengado`], [`Generado por ${r.generado}`], [],
    ["Renglón", "Real", "% de venta", "Meta", "Meta %", "Diferencia", r.columnas.anterior, r.columnas.acumulado],
```

(el resto igual). En `lib/finanzas/pl.ts` borrar `mesAnterior` y `mesesAcumulados` (comprobar antes con `grep -rn "mesAnterior\|mesesAcumulados" app lib` que solo los usa `app/finanzas/datos.ts`, que se reescribe en el Step 3).

Run: `npm test` → Expected: PASS.

- [ ] **Step 3: Reescribir `app/finanzas/datos.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { comisionesCobro, comisionRappi, regalias, type DiaVenta, type Vigente } from "@/lib/finanzas/comisiones";
import type { CuentaGasto } from "@/lib/finanzas/cuentas";
import { facturasAGastos, faltantesDe, sumarGastos } from "@/lib/finanzas/gastos";
import { costoPuesto, nominaPeriodo, plantillaVigente, type AjusteMes, type Puesto } from "@/lib/finanzas/nomina";
import { valorVigente, type Parametro } from "@/lib/finanzas/parametros";
import { acumuladoDe, anteriorDe, COLUMNAS, diasEntre, mesesDelRango, type Periodo, type Rango } from "@/lib/finanzas/periodo";
import {
  calcularPL, entradaVacia, escalarMetas, INICIO_FECHA, sumarEntradas, sumarMetas,
  type ContextoMeta, type EntradaPL, type FilaPL, type Meta,
} from "@/lib/finanzas/pl";
import { prorratear } from "@/lib/finanzas/prorrateo";
import { costearProductos, costeo, type Categoria, type Costo, type VentaDia, type VentaProducto } from "@/lib/ventas/calculos";
import { leerTodo } from "@/lib/ventas/paginar";
import { primerError } from "@/lib/corporativo";
import { hoyMX, pesos } from "@/lib/formato";

type Fila = { sucursal_id: string | null };
type Detalle = { texto: string; monto: number }[];
const de = <T extends Fila>(filas: readonly T[], id: string | null) => filas.filter((f) => f.sucursal_id === id);
const centavos = (n: number) => Math.round(n * 100) / 100;
/** Renglón del P&L donde cae una cuenta (memo e "insumos/inversiones" no son renglón: van al memo). */
const renglonDe = (cuenta: string | null) => (cuenta && cuenta !== "insumos" && cuenta !== "inversiones" ? cuenta : cuenta ? `memo_${cuenta}` : "otros");

export type SucursalPL = { id: string; nombre: string; entrada: EntradaPL; ctx: ContextoMeta; metas: Meta[]; avisos: string[] };
export type DatosPeriodo = {
  rango: Rango; porSucursal: SucursalPL[]; oficina: number;
  /** Avisos de oficina central (van en el consolidado). */
  avisosOficina: string[];
  consolidado: { entrada: EntradaPL; ctx: ContextoMeta };
  /** Llave `sucursal|renglón` → de dónde sale el monto. */
  detalle: Map<string, Detalle>;
};

/**
 * Todo lo de un rango de días: lo diario (ventas, caja chica, efectivo) filtrado por fecha, y lo que se registra por mes
 * (nómina, gastos del mes, facturas, oficina) de cada mes que toca × la fracción de días de ese mes que entra.
 */
export async function datosPL(supabase: SupabaseClient, rango: Rango): Promise<DatosPeriodo> {
  const { desde, hasta } = rango;
  const meses = mesesDelRango(desde, hasta);
  const mesDe = new Map(meses.map((m) => [m.mes, m]));
  const fraccionDe = (f: string) => mesDe.get(f.slice(0, 7))?.fraccion ?? 0;
  const fraccionTotal = meses.reduce((t, m) => t + m.fraccion, 0);
  /** " · $30,000.00 × 7/31" si del mes de esa fecha solo entra una parte. */
  const proporcion = (f: string, completo: number) => {
    const m = mesDe.get(f.slice(0, 7));
    return m && m.fraccion < 1 ? ` · ${pesos(completo)} × ${m.dias}/${m.diasMes}` : "";
  };
  // Sin meses (periodo vacío) se consulta un mes que no existe en lugar de una lista vacía.
  const primerosDeMes = meses.length ? meses.map((m) => `${m.mes}-01`) : ["1900-01-01"];
  const iniMeses = meses.length ? `${meses[0].mes}-01` : desde;
  const finMeses = meses.length ? meses[meses.length - 1].fin : hasta;

  const res = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("pl_parametros").select("clave, valor, vigente_desde").returns<Parametro[]>(),
    supabase.from("nomina_plantilla").select("sucursal_id, puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde").returns<Puesto[]>(),
    supabase.from("nomina_ajustes").select("sucursal_id, renglon, monto, concepto, mes").in("mes", primerosDeMes).returns<AjusteMes[]>(),
    supabase.from("gastos_mes").select("sucursal_id, cuenta, monto, concepto, mes").in("mes", primerosDeMes)
      .returns<(Fila & { cuenta: CuentaGasto; monto: number; concepto: string; mes: string })[]>(),
    supabase.from("pl_metas").select("sucursal_id, renglon, tipo, valor").returns<(Meta & { sucursal_id: string })[]>(),
    supabase.from("facturas").select("sucursal_id, tipo, estado, subtotal, descuento, cuenta_pl, serie, folio, nombre_emisor, fecha_emision")
      .gte("fecha_emision", iniMeses).lte("fecha_emision", finMeses)
      .returns<(Fila & { tipo: "ingreso" | "egreso"; estado: string; subtotal: number; descuento: number; cuenta_pl: string | null; serie: string | null; folio: string | null; nombre_emisor: string; fecha_emision: string })[]>(),
    supabase.from("gastos_caja_chica").select("sucursal_id, fecha, concepto, monto, cuenta_pl").gte("fecha", desde).lte("fecha", hasta)
      .returns<(Fila & { fecha: string; concepto: string; monto: number; cuenta_pl: string | null })[]>(),
    supabase.from("cierres_dia").select("sucursal_id, boveda_diferencia").gte("fecha", desde).lte("fecha", hasta)
      .returns<(Fila & { boveda_diferencia: number })[]>(),
    supabase.from("arqueos").select("diferencia, turnos!inner(sucursal_id, fecha)").eq("momento", "cierre").is("anulado_en", null)
      .gte("turnos.fecha", desde).lte("turnos.fecha", hasta).returns<{ diferencia: number; turnos: { sucursal_id: string } }[]>(),
  ]);
  const error = primerError(res);
  if (error) throw new Error(`No se pudieron cargar los datos del P&L: ${error}`);
  const sucursales = res[0].data ?? [], params = res[1].data ?? [], puestos = res[2].data ?? [], ajustes = res[3].data ?? [];
  const gastosMes = res[4].data ?? [], metas = res[5].data ?? [], facturas = res[6].data ?? [], cajaChica = res[7].data ?? [];
  const cierres = res[8].data ?? [], arqueos = res[9].data ?? [];

  const [dias, desglose, ventas, catalogo, costos] = await Promise.all([
    leerTodo<VentaDia & { id: string }>((d, h) => supabase.from("ventas_dia").select("id, sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2")
      .gte("fecha", desde).lte("fecha", hasta).order("sucursal_id").order("fecha").range(d, h).returns<(VentaDia & { id: string })[]>()),
    leerTodo<{ ventas_dia_id: string; total: number; tarjeta: number; en_linea: number }>((d, h) => supabase.from("ventas_dia_desglose")
      .select("ventas_dia_id, total, tarjeta, en_linea, ventas_dia!inner(fecha)").eq("tipo", "agregador")
      .gte("ventas_dia.fecha", desde).lte("ventas_dia.fecha", hasta).order("ventas_dia_id").range(d, h)
      .returns<{ ventas_dia_id: string; total: number; tarjeta: number; en_linea: number }[]>()),
    leerTodo<VentaProducto>((d, h) => supabase.from("ventas_producto").select("sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento")
      .gte("fecha", desde).lte("fecha", hasta).order("sucursal_id").order("fecha").order("dodo_id").range(d, h).returns<VentaProducto[]>()),
    leerTodo<{ dodo_id: number; categoria: Categoria | null }>((d, h) => supabase.from("productos_venta").select("dodo_id, categoria").order("dodo_id").range(d, h)
      .returns<{ dodo_id: number; categoria: Categoria | null }[]>()),
    leerTodo<Costo & { dodo_id: number }>((d, h) => supabase.from("costos_producto").select("dodo_id, costo, vigente_desde").lte("vigente_desde", hasta)
      .order("dodo_id").order("vigente_desde").range(d, h).returns<(Costo & { dodo_id: number })[]>()),
  ]);

  const vigente: Vigente = (clave, f) => valorVigente(params, clave, f);
  const agregadorDe = new Map(desglose.map((x) => [x.ventas_dia_id, x]));
  const detalle = new Map<string, Detalle>();
  const anotar = (suc: string, renglon: string, texto: string, monto: number) => {
    if (!monto) return;
    const k = `${suc}|${renglon}`;
    detalle.set(k, [...(detalle.get(k) ?? []), { texto, monto: centavos(monto) }]);
  };
  const diasRango = diasEntre(desde, hasta);

  const porSucursal: SucursalPL[] = sucursales.map((s) => {
    const diasSuc = dias.filter((d) => d.sucursal_id === s.id);
    const diasVenta: DiaVenta[] = diasSuc.map((d) => {
      const ag = agregadorDe.get(d.id);
      return {
        fecha: d.fecha, total: Number(d.total), iva: Number(d.iva), tarjeta: Number(d.tarjeta), en_linea: Number(d.en_linea),
        agregador: { total: Number(ag?.total ?? 0), tarjeta: Number(ag?.tarjeta ?? 0), en_linea: Number(ag?.en_linea ?? 0) },
      };
    });
    const ventaNeta = centavos(diasVenta.reduce((t, d) => t + d.total - d.iva, 0));
    const ventaRappi = centavos(diasVenta.reduce((t, d) => t + d.agregador.total, 0));

    const renglones = costearProductos(ventas.filter((v) => v.sucursal_id === s.id), diasSuc, catalogo, costos);
    const c = costeo(renglones);
    anotar(s.id, "alimento", `Costo teórico de ${renglones.reduce((t, r) => t + r.cantidad, 0)} piezas vendidas (receta + periférico)`, c.total.costo);

    const facturasSuc = de(facturas, s.id);
    const f = facturasAGastos(facturasSuc, fraccionDe);
    for (const x of facturasSuc) if (x.estado !== "cancelada") {
      const completo = (Number(x.subtotal) - Number(x.descuento)) * (x.tipo === "egreso" ? -1 : 1);
      anotar(s.id, renglonDe(x.cuenta_pl),
        `${x.tipo === "egreso" ? "Nota de crédito" : "Factura"} ${x.serie ?? ""}${x.folio ?? ""} · ${x.nombre_emisor} · ${x.fecha_emision}${proporcion(x.fecha_emision, completo)}${x.cuenta_pl ? "" : " · sin cuenta"}`,
        completo * fraccionDe(x.fecha_emision));
    }
    const cc = de(cajaChica, s.id);
    const caja = facturasAGastos(cc.map((g) => ({ tipo: "ingreso" as const, estado: "pagada", subtotal: Number(g.monto), descuento: 0, cuenta_pl: g.cuenta_pl })));
    for (const g of cc) anotar(s.id, renglonDe(g.cuenta_pl), `Caja chica · ${g.concepto} · ${g.fecha}${g.cuenta_pl ? "" : " · sin cuenta"}`, Number(g.monto));
    const manual: Partial<Record<CuentaGasto, number>> = {};
    for (const g of de(gastosMes, s.id)) {
      const monto = Number(g.monto) * fraccionDe(g.mes);
      manual[g.cuenta] = centavos((manual[g.cuenta] ?? 0) + monto);
      anotar(s.id, g.cuenta, `Gasto del mes · ${g.concepto}${proporcion(g.mes, Number(g.monto))}`, monto);
    }

    const nomina = nominaPeriodo(puestos, ajustes, s.id, meses);
    for (const m of meses) {
      for (const p of plantillaVigente(puestos, s.id, m.fin)) {
        anotar(s.id, `nomina_${p.renglon}`,
          `${p.puesto} · ${p.personas} × (${pesos(Number(p.sueldo))} + ${(Number(p.pct_cargas) * 100).toFixed(2)} % de cargas${Number(p.bono) ? ` + bono ${pesos(Number(p.bono))}` : ""})${proporcion(m.mes, costoPuesto(p))}`,
          costoPuesto(p) * m.fraccion);
      }
      for (const a of de(ajustes, s.id).filter((a) => a.mes.slice(0, 7) === m.mes)) {
        anotar(s.id, `nomina_${a.renglon}`, `Ajuste · ${a.concepto}${proporcion(m.mes, Number(a.monto))}`, Number(a.monto) * m.fraccion);
      }
    }

    const agregadores = comisionRappi(diasVenta, vigente);
    anotar(s.id, "agregadores", `Venta Rappi con IVA ${pesos(ventaRappi)} × tasa vigente de cada día`, agregadores);
    const regaliasPeriodo = regalias(diasVenta, vigente);
    anotar(s.id, "regalias", `Venta neta ${pesos(ventaNeta)} × regalías vigentes`, regaliasPeriodo);
    const cobro = comisionesCobro(diasVenta, vigente);
    anotar(s.id, "otros", "Comisión dLocal (pagos en la app, sin Rappi)", cobro.dlocal);
    anotar(s.id, "otros", "Comisión NetPay (terminal, sin Rappi)", cobro.netpay);
    // Neto: un sobrante compensa un faltante del mismo periodo.
    const faltantes = faltantesDe([
      ...arqueos.filter((a) => a.turnos.sucursal_id === s.id).map((a) => Number(a.diferencia)),
      ...de(cierres, s.id).map((x) => Number(x.boveda_diferencia ?? 0)),
    ]);
    anotar(s.id, "otros", "Faltantes de efectivo, neto (arqueos de cierre y bóveda)", faltantes);

    const entrada: EntradaPL = {
      ...entradaVacia(),
      ventaNeta, descuentos: centavos(renglones.reduce((t, r) => t + r.importe_sin_descuento - r.importe, 0)),
      alimento: c.total.costo, nomina: { cocina: nomina.cocina, gerencia: nomina.gerencia },
      gastos: sumarGastos(f.gastos, caja.gastos, manual), sinCuenta: centavos(f.sinCuenta + caja.sinCuenta),
      agregadores, comisionesCobro: cobro.total, faltantes, regalias: regaliasPeriodo, memos: f.memos,
    };

    const avisos: string[] = [];
    if (diasSuc.length < diasRango) avisos.push(`Faltan ${diasRango - diasSuc.length} días de ventas por importar; los % son sobre lo importado.`);
    if (c.sinCosto.length) avisos.push(`${c.sinCosto.length} productos vendidos sin costo quedan fuera del alimento.`);
    const sinCuenta = facturasSuc.filter((x) => x.estado !== "cancelada" && !x.cuenta_pl).length;
    if (sinCuenta) avisos.push(`${sinCuenta} facturas sin cuenta del P&L (van a Otros).`);
    if (fraccionTotal > 0 && !nomina.plantilla.cocina && !nomina.plantilla.gerencia) avisos.push("Sin plantilla de nómina para este periodo.");
    return {
      id: s.id, nombre: s.nombre, entrada, ctx: { ventaNeta, ventaRappi, plantilla: nomina.plantilla },
      metas: escalarMetas(metas.filter((m) => m.sucursal_id === s.id), fraccionTotal), avisos,
    };
  });

  // Oficina central: facturas sin sucursal (sin memos), gastos del mes y nómina de oficina, por fracción; se reparte por venta neta.
  const facturasOf = de(facturas, null);
  const fOf = facturasAGastos(facturasOf, fraccionDe);
  const sinCuentaOf = facturasOf.filter((x) => x.estado !== "cancelada" && !x.cuenta_pl).length;
  const avisosOficina = sinCuentaOf ? [`Oficina central: ${sinCuentaOf} facturas sin sucursal ni cuenta del P&L (se reparten como gasto de oficina).`] : [];
  const nOf = nominaPeriodo(puestos, ajustes, null, meses);
  const manualOf = de(gastosMes, null).reduce((t, g) => t + Number(g.monto) * fraccionDe(g.mes), 0);
  const oficina = centavos(Object.values(fOf.gastos).reduce((t, v) => t + v, 0) + fOf.sinCuenta + nOf.cocina + nOf.gerencia + manualOf);
  const reparto = prorratear(oficina, new Map(porSucursal.map((s) => [s.id, s.entrada.ventaNeta])));
  for (const s of porSucursal) {
    s.entrada.oficina = reparto.get(s.id) ?? 0;
    anotar(s.id, "oficina", `Oficina central del periodo ${pesos(oficina)}, en proporción a la venta neta`, s.entrada.oficina);
  }

  const entrada = { ...sumarEntradas(porSucursal.map((s) => s.entrada)), oficina };
  entrada.memos = { insumos: centavos(entrada.memos.insumos + fOf.memos.insumos), inversiones: centavos(entrada.memos.inversiones + fOf.memos.inversiones) };
  const ctx: ContextoMeta = {
    ventaNeta: entrada.ventaNeta,
    ventaRappi: centavos(porSucursal.reduce((t, s) => t + s.ctx.ventaRappi, 0)),
    plantilla: {
      cocina: centavos(porSucursal.reduce((t, s) => t + s.ctx.plantilla.cocina, 0)),
      gerencia: centavos(porSucursal.reduce((t, s) => t + s.ctx.plantilla.gerencia, 0)),
    },
  };
  return { rango, porSucursal, oficina, avisosOficina, consolidado: { entrada, ctx }, detalle };
}

/** P&L de una sucursal (o consolidado si no hay o no existe) en un periodo ya cargado. */
export function vistaPL(d: DatosPeriodo, sucursalId: string | undefined) {
  const suc = d.porSucursal.find((s) => s.id === sucursalId) ?? null;
  if (suc) return { suc, titulo: suc.nombre, entrada: suc.entrada, filas: calcularPL(suc.entrada, suc.metas, suc.ctx), avisos: suc.avisos };
  return {
    suc: null, titulo: "Consolidado", entrada: d.consolidado.entrada,
    filas: calcularPL(d.consolidado.entrada, sumarMetas(d.porSucursal), d.consolidado.ctx),
    avisos: [...d.avisosOficina, ...d.porSucursal.flatMap((s) => s.avisos.map((a) => `${s.nombre}: ${a}`))],
  };
}

/**
 * El periodo con sus dos comparaciones (% de venta): mes → mes anterior y acumulado del año;
 * semana → semana anterior y acumulado del mes. Tres cargas, cada una de un solo rango.
 */
export async function plConHistoria(supabase: SupabaseClient, p: Periodo, sucursalId: string | undefined) {
  const ant = anteriorDe(p, hoyMX());
  const [d, previo, acumulado] = await Promise.all([
    datosPL(supabase, p),
    ant.vacio || ant.finNominal < INICIO_FECHA ? Promise.resolve(null) : datosPL(supabase, ant),
    datosPL(supabase, acumuladoDe(p, INICIO_FECHA)),
  ]);
  const vista = vistaPL(d, sucursalId);
  const pctDe = (filas: FilaPL[]) => new Map(filas.map((f) => [f.clave, f.pct]));
  const acum = vistaPL(acumulado, sucursalId).entrada;
  return {
    datos: d, ...vista,
    anterior: previo ? pctDe(vistaPL(previo, sucursalId).filas) : null,
    acumulado: pctDe(calcularPL(acum, [], { ventaNeta: acum.ventaNeta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } })),
    columnas: COLUMNAS[p.tipo],
    detalleDe: (renglon: string) => (vista.suc ? d.detalle.get(`${vista.suc.id}|${renglon}`) ?? [] : []),
    memoDetalle: (cuenta: "insumos" | "inversiones") => (vista.suc ? d.detalle.get(`${vista.suc.id}|memo_${cuenta}`) ?? [] : []),
  };
}
```

- [ ] **Step 4: `app/finanzas/TablaPL.tsx` con columnas**

Cambiar la firma y los encabezados/etiquetas de las dos columnas de comparación:

```tsx
import type { Columnas } from "@/lib/finanzas/periodo";
```

```tsx
export function TablaPL({ r, oficina, columnas }: {
  r: { /* igual */ };
  oficina: number | null;
  /** Encabezados de las comparaciones (mes o semana). */
  columnas: Columnas;
}) {
```

```tsx
<th className="monto" title={columnas.anterior}>{columnas.anteriorCorto}</th><th className="monto" title={columnas.acumulado}>{columnas.acumuladoCorto}</th>
```

y en las celdas `data-label={columnas.anterior}` y `data-label={columnas.acumulado}`. El rótulo de oficina: "Oficina central del periodo".

- [ ] **Step 5: `app/finanzas/page.tsx`**

```tsx
import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX } from "@/lib/formato";
import { elegirPeriodo, etiquetaSemana, paramsPeriodo, semanasDesde } from "@/lib/finanzas/periodo";
import { INICIO_FECHA, INICIO_PL } from "@/lib/finanzas/pl";
import { plConHistoria } from "./datos";
import { TablaPL } from "./TablaPL";

type Filtros = { periodo?: string; mes?: string; semana?: string; sucursal?: string };

export default async function PaginaPL({ searchParams }: { searchParams: Promise<Filtros> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const hoy = hoyMX();
  const p = elegirPeriodo(q, hoy, INICIO_FECHA);
  const r = await plConHistoria(supabase, p, q.sucursal);
  const suc: Record<string, string> = r.suc ? { sucursal: r.suc.id } : {};
  const filtro = new URLSearchParams({ ...paramsPeriodo(p), ...suc }).toString();
  const enCurso = !p.vacio && p.hasta < p.finNominal;

  return (
    <>
      <div className="encabezado">
        <h1>P&L · {r.titulo}</h1>
        <p>
          {p.titulo}{enCurso && ` · hasta el ${fechaTexto(p.hasta)}`}. Montos sin IVA, criterio devengado. Meta: PL Base del modelo de Dodo.
          {!r.suc && " Elige una sucursal para ver de dónde sale cada renglón."}
        </p>
      </div>
      <nav className="acciones" aria-label="Periodo">
        <Link className={p.tipo === "mes" ? "boton" : "boton boton-secundario"} aria-current={p.tipo === "mes" ? "page" : undefined}
          href={`/finanzas?${new URLSearchParams({ periodo: "mes", ...suc })}`}>Mes</Link>
        <Link className={p.tipo === "semana" ? "boton" : "boton boton-secundario"} aria-current={p.tipo === "semana" ? "page" : undefined}
          href={`/finanzas?${new URLSearchParams({ periodo: "semana", ...suc })}`}>Semana</Link>
      </nav>
      <form className="acciones" method="get">
        <input type="hidden" name="periodo" value={p.tipo} />
        {p.tipo === "mes" ? (
          <>
            <label htmlFor="mes" className="etiqueta">Mes</label>
            <input id="mes" name="mes" type="month" defaultValue={p.clave} min={INICIO_PL} max={hoy.slice(0, 7)} />
          </>
        ) : (
          <>
            <label htmlFor="semana" className="etiqueta">Semana</label>
            <select id="semana" name="semana" defaultValue={p.clave}>
              {semanasDesde(INICIO_FECHA, hoy).map((s) => <option key={s} value={s}>{etiquetaSemana(s)}</option>)}
            </select>
          </>
        )}
        <label htmlFor="sucursal" className="etiqueta">Sucursal</label>
        <select id="sucursal" name="sucursal" defaultValue={r.suc?.id ?? ""}>
          <option value="">Consolidado</option>
          {r.datos.porSucursal.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="boton boton-secundario" type="submit">Ver</button>
        <Link className="boton boton-secundario" href={`/reporte/pl?${filtro}`} target="_blank">PDF</Link>
        <a className="boton boton-secundario" href={`/reporte/pl/excel?${filtro}`} download>Excel</a>
      </form>
      {p.tipo === "semana" && (
        <p className="saldo-nota">Lo que se registra por mes (nómina, renta, servicios, facturas, oficina) se reparte por días; si llega una factura de ese mes, esta semana se ajusta.</p>
      )}
      {p.vacio ? (
        <p className="vacio">{p.tipo === "semana" ? "La semana apenas empieza: todavía no hay días cerrados." : "El mes apenas empieza: todavía no hay días cerrados."}</p>
      ) : (
        <>
          {r.avisos.length > 0 && <ul className="aviso aviso-error lista-simple">{r.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          <TablaPL r={r} oficina={r.suc ? null : r.datos.oficina} columnas={r.columnas} />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Reportes**

`app/finanzas/reporte-datos.ts`:

```ts
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { elegirPeriodo } from "@/lib/finanzas/periodo";
import { INICIO_FECHA } from "@/lib/finanzas/pl";
import { puedeVerFinanzas } from "@/lib/roles";
import { plConHistoria } from "./datos";

/** Lo que llevan el PDF y el Excel del P&L, con el mismo periodo y sucursal que la pantalla. */
export async function reportePL(q: { periodo?: string; mes?: string; semana?: string; sucursal?: string }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  const periodo = elegirPeriodo(q, hoyMX(), INICIO_FECHA);
  const r = await plConHistoria(supabase, periodo, q.sucursal);
  return {
    titulo: r.titulo, periodo, generadoPor: perfil.nombre, filas: r.filas, anterior: r.anterior, acumulado: r.acumulado,
    columnas: r.columnas, avisos: r.avisos, entrada: r.entrada,
  };
}
```

`app/reporte/pl/page.tsx`: tipo de `searchParams` `{ periodo?: string; mes?: string; semana?: string; sucursal?: string }`; detalle del encabezado
`` `${r.periodo.titulo}${!r.periodo.vacio && r.periodo.hasta < r.periodo.finNominal ? ` · hasta el ${fechaTexto(r.periodo.hasta)}` : ""} · sin IVA, criterio devengado` `` (importar `fechaTexto`); encabezados de las dos columnas `r.columnas.anterior` y `r.columnas.acumulado` (y sus `data-label`); si `r.periodo.vacio`, en lugar de la sección mostrar `<p className="vacio">Todavía no hay días cerrados en este periodo.</p>`.

`app/reporte/pl/excel/route.ts`:

```ts
  const q = Object.fromEntries(new URL(request.url).searchParams) as { periodo?: string; mes?: string; semana?: string; sucursal?: string };
  const r = await reportePL(q);
  const ahora = new Date().toISOString();
  const archivo = escribirXlsx(hojaPL({
    titulo: r.titulo, periodo: r.periodo.titulo, generado: `${r.generadoPor} · ${fechaMX(ahora)} ${hora(ahora)}`,
    filas: r.filas, anterior: r.anterior, acumulado: r.acumulado, columnas: r.columnas,
  }));
  const nombre = `P&L ${r.titulo.replace(/[\\/:*?"<>|]/g, " ")} ${r.periodo.clave}.xlsx`;
```

- [ ] **Step 7: Verificar**

Run: `node node_modules/typescript/bin/tsc --noEmit` → Expected: sin errores (si `.next/types` trae rutas viejas, borrar `.next` y repetir).
Run: `npm test` → Expected: todo PASS.

- [ ] **Step 8: Commit**

```bash
git add app lib package.json
git commit -m "feat(finanzas): P&L por semana además de por mes"
```

---

### Task 4: Vista previa

**Files:**
- Create (temporal, se borra antes del commit): `app/login/prueba-pl-semanal/page.tsx`

- [ ] **Step 1: Página temporal**

```tsx
// TEMPORAL: selector de semanas y tabla del P&L semanal con datos de ejemplo. Se borra antes del commit.
import { calcularPL, entradaVacia, type EntradaPL } from "@/lib/finanzas/pl";
import { COLUMNAS, etiquetaSemana, periodoSemana, semanasDesde } from "@/lib/finanzas/periodo";
import { TablaPL } from "@/app/finanzas/TablaPL";

export default function PruebaPLSemanal() {
  const p = periodoSemana("2026-W41", "2026-10-08");
  const e: EntradaPL = {
    ...entradaVacia(), ventaNeta: 142000, alimento: 43100, nomina: { cocina: 17408.12, gerencia: 5961.29 },
    gastos: { renta: 6774.19, servicios: 4516.13 }, regalias: 7100, oficina: 6322.58, memos: { insumos: 0, inversiones: 0 },
  };
  const filas = calcularPL(e, [{ renglon: "alimento", tipo: "pct", valor: 0.3 }, { renglon: "renta", tipo: "monto", valor: 6774.19 }],
    { ventaNeta: e.ventaNeta, ventaRappi: 0, plantilla: { cocina: 17072.31, gerencia: 5961.29 } });
  const detalle = (k: string) => (k === "renta" ? [{ texto: "Gasto del mes · Renta local · $30,000.00 × 7/31", monto: 6774.19 }] : []);
  return (
    <main className="pagina">
      <h1>P&L · Prueba semanal</h1>
      <p>{p.titulo} · hasta el {p.hasta}</p>
      <select defaultValue="2026-W41" aria-label="Semana">{semanasDesde("2026-10-01", "2026-10-08").map((s) => <option key={s} value={s}>{etiquetaSemana(s)}</option>)}</select>
      <TablaPL r={{ filas, entrada: e, anterior: null, acumulado: new Map(filas.map((f) => [f.clave, f.pct])), detalleDe: detalle, memoDetalle: () => [] }}
        oficina={6322.58} columnas={COLUMNAS.semana} />
    </main>
  );
}
```

- [ ] **Step 2: Revisar** en el preview (`/login/prueba-pl-semanal`) a 1280 px y en celular (375 px): encabezados "Sem. ant." y "Mes", detalle de Renta con "× 7/31", sin scroll horizontal de la página.

- [ ] **Step 3: Borrar la página temporal**, correr `npm test` y `tsc`, y confirmar que `git status` no la incluye.

---

## Cierre

- [ ] Revisión final de la rama (modelo más capaz) con el Review Focus.
- [ ] Sin migración: fusionar a main cuando Sebastián lo apruebe, copiar los archivos a la carpeta local y borrar la rama.
