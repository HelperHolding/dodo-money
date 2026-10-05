# Formato del P&L (secciones y comparativo) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** P&L con secciones de color, subtotales en barra y montos contables (pantalla, PDF y Excel), más una vista "Comparativo" con periodos lado a lado.

**Architecture:** La presentación vive en un módulo puro nuevo (`lib/finanzas/secciones.ts`: secciones, colores, cifra contable). `pl.ts` gana el renglón Margen bruto. `periodo.ts` calcula las columnas del comparativo. El generador de Excel aprende fondos, color de letra y formato contable con estilos generados según se usen. En la app, `TablaPL` (contra meta) se rehace por secciones y `TablaComparativo` es nueva; `comparativoPL` carga cada columna en paralelo con el `datosPL` que ya existe.

**Tech Stack:** Next.js 15, React 19, TypeScript estricto, Supabase, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-10-05-pl-formato-design.md`

## Global Constraints

- Colores (hex sin #): Venta `BDD7EE`, Costo de venta `D9EAD3`, Gastos de operación `FCE4D6`, Oficina central `EAD1DC`, Memo `F2F2F2`; barra de total fondo `7F7F7F` y letra `FFFFFF`, negritas.
- Montos contables: `$` a la izquierda, cifra a la derecha con 2 decimales y separador de miles, negativos entre paréntesis, cero como `-`, sin dato `—`.
- Excel contable: `_("$"* #,##0.00_);_("$"* \(#,##0.00\);_("$"* "-"??_);_(@_)` (numFmtId 167).
- Los módulos de `lib/` se importan entre sí **solo como tipos**: los valores de `secciones.ts` llegan a `excel.ts` como parámetro (`PRESENTACION`).
- Archivos en CRLF; reemplazos con función; cada prueba nueva de `lib/` al script `test`.
- El reporte de ventas en Excel debe seguir abriendo igual (mismas celdas y formatos).

## Review Focus

1. **Excel abre sin reparar** con fondos y el formato contable (estilos generados): se prueba en el Excel real (Tarea 7).
2. **Semanas del comparativo**: la que cruza de mes pertenece al mes de su jueves y se corta al mes; las columnas no se solapan (Tarea 3).
3. **Celular**: las tarjetas de "Contra meta" con la sección como banda y la barra de total legibles; el comparativo se desliza sin mover la página (Tarea 7).
4. **Impresión**: los colores salen en el PDF (`print-color-adjust`) y el comparativo va horizontal (Tarea 6).
5. **Mes o semana sin días cerrados** en el comparativo: mensaje en lugar de tabla vacía (Tarea 5).

---

### Task 1: Excel con fondos, color de letra y formato contable (`lib/xlsx-escribir.ts`)

**Files:**
- Modify: `lib/xlsx-escribir.ts`, `lib/xlsx-escribir.test.ts`

**Interfaces:**
- Produces: `Celda` acepta `{ valor, formato: "contable" }`; `type EstiloFila = { fondo?: string; texto?: string; negrita?: boolean }`; `HojaXlsx.estilos?: Record<number, EstiloFila>` (un renglón con fondo se pinta hasta la última columna de la hoja).

- [ ] **Step 1: Pruebas**

En `lib/xlsx-escribir.test.ts`, en la prueba "los formatos de número están bien escritos", cambiar la expresión por:

```ts
  assert.match(estilos, /<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;\$&quot;#,##0\.00"\/><numFmt numFmtId="165" formatCode="dd\/mm\/yyyy"\/><numFmt numFmtId="166" formatCode="\+0\.0&quot; pts&quot;;-0\.0&quot; pts&quot;;0\.0&quot; pts&quot;"\/><numFmt numFmtId="167" /);
  assert.ok(estilos.includes(`<numFmt numFmtId="167" formatCode="_(&quot;$&quot;* #,##0.00_);_(&quot;$&quot;* \\(#,##0.00\\);_(&quot;$&quot;* &quot;-&quot;??_);_(@_)"/>`));
```

y agregar al final del archivo:

```ts
/** Un archivo del ZIP, ya inflado. */
function parte(b: Buffer, nombre: string): string {
  let p = 0;
  while (b.readUInt32LE(p) === 0x04034b50) {
    const tam = b.readUInt32LE(p + 18), ln = b.readUInt16LE(p + 26);
    const inicio = p + 30 + ln + b.readUInt16LE(p + 28);
    if (b.toString("utf8", p + 30, p + 30 + ln) === nombre) return inflateRawSync(b.subarray(inicio, inicio + tam)).toString("utf8");
    p = inicio + tam;
  }
  return "";
}

test("escribirXlsx: renglones con fondo, color de letra y formato contable", () => {
  const b = Buffer.from(escribirXlsx([{
    nombre: "P&L",
    filas: [["VENTA"], ["Venta neta", { valor: -10, formato: "contable" }], ["EBITDA", { valor: 5, formato: "contable" }, null]],
    anchos: [20, 14, 14],
    estilos: { 0: { fondo: "BDD7EE", negrita: true }, 2: { fondo: "7F7F7F", texto: "FFFFFF", negrita: true } },
  }]));
  const estilos = parte(b, "xl/styles.xml"), hoja = parte(b, "xl/worksheets/sheet1.xml");
  assert.ok(estilos.includes('<fgColor rgb="FFBDD7EE"/>'));
  assert.ok(estilos.includes('<fgColor rgb="FF7F7F7F"/>'));
  assert.ok(estilos.includes('<color rgb="FFFFFFFF"/>'));
  // La banda llega a la última columna aunque el renglón traiga menos celdas; un renglón sin estilo no se rellena.
  assert.match(hoja, /<c r="C1" s="\d+"\/>/);
  assert.match(hoja, /<c r="C3" s="\d+"\/>/);
  assert.doesNotMatch(hoja, /r="C2"/);
  assert.match(hoja, /<c r="B2" s="\d+"><v>-10<\/v><\/c>/);
  assert.equal(leerHojas(new Uint8Array(b))[0].celdas.get("B2"), -10);
});
```

Run: `node --experimental-strip-types --test lib/xlsx-escribir.test.ts`
Expected: FAIL (count="3" y sin fondos).

- [ ] **Step 2: Implementar**

En `lib/xlsx-escribir.ts`:

1. El tipo `Celda` cambia el formato de número a `"pesos" | "porcentaje" | "puntos" | "contable"`.
2. Agregar después de `HojaXlsx` (y el campo `estilos` dentro de `HojaXlsx`):

```ts
  /** Estilo de renglones completos (índice desde 0): fondo y color de letra en hex RRGGBB y negritas. Con fondo se pinta hasta la última columna. */
  estilos?: Record<number, EstiloFila>;
```

```ts
export type EstiloFila = { fondo?: string; texto?: string; negrita?: boolean };
```

3. Reemplazar desde `// Estilos: cada formato…` hasta antes de `const escapar` por:

```ts
type Formato = "general" | "pesos" | "porcentaje" | "fecha" | "puntos" | "contable";
const NUM_FMT: Record<Formato, number> = { general: 0, pesos: 164, porcentaje: 10, fecha: 165, puntos: 166, contable: 167 };
type Estilo = { negrita: boolean; fondo?: string; texto?: string };

/** Estilos del libro: el 0 es el normal; los demás se agregan según se usen (formato, negritas, fondo, color de letra). */
class Estilos {
  private claves = ["general|0||"];
  indice(formato: Formato, e: Estilo): number {
    const clave = `${formato}|${e.negrita ? 1 : 0}|${e.fondo ?? ""}|${e.texto ?? ""}`;
    let i = this.claves.indexOf(clave);
    if (i < 0) { i = this.claves.length; this.claves.push(clave); }
    return i;
  }
  xml(): string {
    const partes = this.claves.map((c) => { const [formato, b, fondo, texto] = c.split("|"); return { formato: formato as Formato, negrita: b === "1", fondo, texto }; });
    const fuentes = [...new Set(["0|", "1|", ...partes.map((p) => `${p.negrita ? 1 : 0}|${p.texto}`)])];
    const fondos = [...new Set(partes.map((p) => p.fondo).filter(Boolean))];
    const fuente = (f: string) => {
      const [b, color] = f.split("|");
      return `<font>${b === "1" ? "<b/>" : ""}<sz val="11"/>${color ? `<color rgb="FF${color}"/>` : ""}<name val="Calibri"/></font>`;
    };
    const xf = (p: (typeof partes)[number]) => {
      const fontId = fuentes.indexOf(`${p.negrita ? 1 : 0}|${p.texto}`), fillId = p.fondo ? fondos.indexOf(p.fondo) + 2 : 0, num = NUM_FMT[p.formato];
      return `<xf numFmtId="${num}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"${num ? ' applyNumberFormat="1"' : ""}${fontId ? ' applyFont="1"' : ""}${fillId ? ' applyFill="1"' : ""}/>`;
    };
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="+0.0&quot; pts&quot;;-0.0&quot; pts&quot;;0.0&quot; pts&quot;"/><numFmt numFmtId="167" formatCode="_(&quot;$&quot;* #,##0.00_);_(&quot;$&quot;* \\(#,##0.00\\);_(&quot;$&quot;* &quot;-&quot;??_);_(@_)"/></numFmts>
<fonts count="${fuentes.length}">${fuentes.map(fuente).join("")}</fonts>
<fills count="${fondos.length + 2}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fondos.map((c) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`).join("")}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${partes.length}">${partes.map(xf).join("")}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
  }
}
```

4. `celdaXml` y `hojaXml` reciben el estilo del renglón y el registro:

```ts
function celdaXml(ref: string, c: Celda, e: Estilo, estilos: Estilos): string {
  const s = (f: Formato) => { const i = estilos.indice(f, e); return i ? ` s="${i}"` : ""; };
  if (c === null || c === "") return e.fondo ? `<c r="${ref}"${s("general")}/>` : "";
  if (typeof c === "string") return `<c r="${ref}" t="inlineStr"${s("general")}><is><t xml:space="preserve">${escapar(c)}</t></is></c>`;
  if (typeof c === "number") return Number.isFinite(c) ? `<c r="${ref}"${s("general")}><v>${c}</v></c>` : "";
  if ("fecha" in c) return `<c r="${ref}"${s("fecha")}><v>${serial(c.fecha)}</v></c>`;
  return Number.isFinite(c.valor) ? `<c r="${ref}"${s(c.formato)}><v>${c.valor}</v></c>` : "";
}

function hojaXml(h: HojaXlsx, estilos: Estilos): string {
  const negritas = new Set(h.negritas ?? []);
  const ancho = Math.max(h.anchos?.length ?? 0, ...h.filas.map((f) => f.length));
  const cols = h.anchos?.length
    ? `<cols>${h.anchos.map((a, i) => `<col min="${i + 1}" max="${i + 1}" width="${a}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const filas = h.filas.map((fila, r) => {
    const x = h.estilos?.[r];
    const e: Estilo = { negrita: x?.negrita ?? negritas.has(r), fondo: x?.fondo, texto: x?.texto };
    const celdas = e.fondo ? Array.from({ length: ancho }, (_, i) => fila[i] ?? null) : fila;
    return `<row r="${r + 1}">${celdas.map((c, i) => celdaXml(`${columna(i)}${r + 1}`, c, e, estilos)).join("")}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${filas}</sheetData></worksheet>`;
}
```

5. Borrar la constante `ESTILOS`. En `escribirXlsx`, antes de armar `archivos`: `const estilos = new Estilos(); const hojasXml = hojas.map((h) => hojaXml(h, estilos));`, y usar `["xl/styles.xml", estilos.xml()]` y `...hojasXml.map((x, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, x])`.

Run: `npm test` → Expected: PASS todo (incluidas las pruebas del reporte de ventas).

- [ ] **Step 3: Commit**

```bash
git add lib/xlsx-escribir.ts lib/xlsx-escribir.test.ts
git commit -m "feat(xlsx): renglones con fondo y color de letra; formato contable"
```

---

### Task 2: Secciones, cifra contable y Margen bruto

**Files:**
- Create: `lib/finanzas/secciones.ts`, `lib/finanzas/secciones.test.ts`
- Modify: `lib/finanzas/pl.ts`, `lib/finanzas/pl.test.ts`, `package.json`

**Interfaces:**
- Produces: `SECCIONES`, `type Seccion`, `MEMO`, `BARRA_TOTAL`, `PRESENTACION = { secciones, memo, barra }`, `type Presentacion`, `cifraContable(n: number | null): string`; renglón `margen_bruto` (tipo `total`) entre `merma` y `nomina_cocina`.

- [ ] **Step 1: Pruebas**

`lib/finanzas/secciones.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cifraContable, SECCIONES } from "./secciones.ts";
import { RENGLONES } from "./pl.ts";

test("cifraContable: miles, negativos entre paréntesis, cero como guion", () => {
  assert.equal(cifraContable(1234.5), "1,234.50");
  assert.equal(cifraContable(-10), "(10.00)");
  assert.equal(cifraContable(0), "-");
  assert.equal(cifraContable(0.001), "-");
  assert.equal(cifraContable(null), "—");
});

test("SECCIONES: cada renglón del P&L una vez, en el orden del P&L; los cierres son totales", () => {
  const usados = SECCIONES.flatMap((s) => [...s.renglones, ...(s.total ? [s.total] : [])]);
  assert.deepEqual(usados, RENGLONES.map((r) => r.clave));
  for (const s of SECCIONES) if (s.total) assert.equal(RENGLONES.find((r) => r.clave === s.total)?.tipo, "total");
});
```

En `lib/finanzas/pl.test.ts`:

```ts
test("margen bruto: venta − alimento − merma, con su meta", () => {
  const ctx = { ventaNeta: 1000, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } };
  const filas = calcularPL({ ...entradaVacia(), ventaNeta: 1000, alimento: 310, merma: 15 },
    [{ renglon: "alimento", tipo: "pct", valor: 0.3 }, { renglon: "merma", tipo: "pct", valor: 0.02 }], ctx);
  const mb = filas.find((f) => f.clave === "margen_bruto")!;
  assert.deepEqual([mb.tipo, mb.monto, mb.pct, mb.meta, mb.diferencia], ["total", 675, 0.675, 680, -5]);
  const sinMerma = calcularPL({ ...entradaVacia(), ventaNeta: 100, alimento: 30 }, [], { ...ctx, ventaNeta: 100 });
  assert.equal(sinMerma.find((f) => f.clave === "margen_bruto")!.monto, 70);
});
```

Run: `npm test` (con `lib/finanzas/secciones.test.ts` agregado al script) → Expected: FAIL (`secciones.ts` no existe; no hay `margen_bruto`).

- [ ] **Step 2: Implementar**

`lib/finanzas/secciones.ts`:

```ts
/** Presentación del P&L como estado de resultados formal: secciones con color, barras de total y cifras contables. */
import type { ClaveRenglon } from "./pl";

export type ClaveSeccion = "venta" | "costo" | "operacion" | "oficina";
export type Seccion = { clave: ClaveSeccion; nombre: string; fondo: string; renglones: readonly ClaveRenglon[]; total: ClaveRenglon | null };

export const SECCIONES: readonly Seccion[] = [
  { clave: "venta", nombre: "Venta", fondo: "BDD7EE", renglones: ["venta_neta"], total: null },
  { clave: "costo", nombre: "Costo de venta", fondo: "D9EAD3", renglones: ["alimento", "merma"], total: "margen_bruto" },
  {
    clave: "operacion", nombre: "Gastos de operación", fondo: "FCE4D6",
    renglones: ["nomina_cocina", "nomina_gerencia", "repartidores", "agregadores", "marketing_agregadores", "marketing", "renta", "servicios", "mantenimiento", "consumibles_equipo", "regalias", "otros"],
    total: "ebitda_tienda",
  },
  { clave: "oficina", nombre: "Oficina central", fondo: "EAD1DC", renglones: ["oficina"], total: "ebitda" },
];
export const MEMO = { nombre: "Memo", fondo: "F2F2F2" } as const;
export const BARRA_TOTAL = { fondo: "7F7F7F", texto: "FFFFFF" } as const;

/** Lo que el Excel necesita de aquí (los módulos de lib/ no se importan valores entre sí). */
export const PRESENTACION = { secciones: SECCIONES, memo: MEMO, barra: BARRA_TOTAL };
export type Presentacion = { secciones: readonly Seccion[]; memo: { nombre: string; fondo: string }; barra: { fondo: string; texto: string } };

const cifra = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Cifra contable sin el $: "1,234.50", negativos "(10.00)", cero "-", sin dato "—". */
export function cifraContable(n: number | null): string {
  if (n === null) return "—";
  const r = Math.round(n * 100) / 100;
  if (r === 0) return "-";
  return r < 0 ? `(${cifra.format(-r)})` : cifra.format(r);
}
```

`lib/finanzas/pl.ts`:
- En `ClaveRenglon`, agregar `| "margen_bruto"`.
- En `RENGLONES`, después de Merma: `{ clave: "margen_bruto", nombre: "Margen bruto", tipo: "total" },`.
- En `calcularPL`, después de `montos.ebitda = …`: `montos.margen_bruto = centavos(e.ventaNeta - e.alimento - (e.merma ?? 0));`
- Después de `if (hayMetas) metaDe.set("venta_neta", ctx.ventaNeta);`:

```ts
  if (hayMetas) metaDe.set("margen_bruto", centavos(ctx.ventaNeta - (metaDe.get("alimento") ?? 0) - (metaDe.get("merma") ?? 0)));
```

Run: `npm test` → Expected: PASS (la prueba vieja de `hojaPL` sigue pasando: busca renglones por nombre).

- [ ] **Step 3: Commit**

```bash
git add lib/finanzas package.json
git commit -m "feat(finanzas): secciones del P&L, cifra contable y margen bruto"
```

---

### Task 3: Columnas del comparativo (`lib/finanzas/periodo.ts`)

**Files:**
- Modify: `lib/finanzas/periodo.ts`, `lib/finanzas/periodo.test.ts`

**Interfaces:**
- Produces: `type ColumnaComparativo = { clave: string; etiqueta: string; rango: Rango }`; `columnasComparativo(p: Periodo, hoy: string, inicio: string): { columnas: ColumnaComparativo[]; total: string; titulo: string }`.

- [ ] **Step 1: Prueba**

```ts
test("columnasComparativo: meses del año y semanas del mes (la del jueves), cortadas al mes, al inicio y a ayer", () => {
  const meses = columnasComparativo(periodoMes("2026-12", "2027-01-10"), "2027-01-10", INICIO);
  assert.deepEqual(meses.columnas.map((c) => [c.clave, c.etiqueta, c.rango.desde, c.rango.hasta]),
    [["2026-10", "Oct", "2026-10-01", "2026-10-31"], ["2026-11", "Nov", "2026-11-01", "2026-11-30"], ["2026-12", "Dic", "2026-12-01", "2026-12-31"]]);
  assert.deepEqual([meses.total, meses.titulo], ["Total 2026", "Meses de 2026"]);
  assert.deepEqual(columnasComparativo(periodoMes("2026-11", "2026-11-10"), "2026-11-10", INICIO).columnas.at(-1)?.rango, { desde: "2026-11-01", hasta: "2026-11-09" });
  assert.deepEqual(columnasComparativo(periodoMes("2027-02", "2027-03-05"), "2027-03-05", INICIO).columnas.map((c) => c.clave), ["2027-01", "2027-02"]);

  const oct = columnasComparativo(periodoSemana("2026-W41", "2026-11-10", INICIO), "2026-11-10", INICIO);
  assert.deepEqual(oct.columnas.map((c) => c.etiqueta), ["Sem 40 · 1–4 oct", "Sem 41 · 5–11 oct", "Sem 42 · 12–18 oct", "Sem 43 · 19–25 oct", "Sem 44 · 26–31 oct"]);
  assert.deepEqual([oct.total, oct.titulo], ["Total octubre", "Semanas de octubre 2026"]);
  assert.deepEqual(columnasComparativo(periodoSemana("2026-W44", "2026-11-10", INICIO), "2026-11-10", INICIO).columnas.length, 5);
  assert.deepEqual(columnasComparativo(periodoSemana("2026-W45", "2026-11-10", INICIO), "2026-11-10", INICIO).columnas.map((c) => c.etiqueta),
    ["Sem 44 · 1 nov", "Sem 45 · 2–8 nov", "Sem 46 · 9 nov"]);
  assert.deepEqual(columnasComparativo(periodoSemana("2026-W42", "2026-10-15", INICIO), "2026-10-15", INICIO).columnas.map((c) => c.rango),
    [{ desde: "2026-10-01", hasta: "2026-10-04" }, { desde: "2026-10-05", hasta: "2026-10-11" }, { desde: "2026-10-12", hasta: "2026-10-14" }]);
  assert.deepEqual(columnasComparativo(periodoMes("2026-10", "2026-10-01"), "2026-10-01", INICIO).columnas, []);
});
```

(agregar `columnasComparativo` al import). Run → Expected: FAIL (no existe).

- [ ] **Step 2: Implementar**

En `lib/finanzas/periodo.ts`, reemplazar `etiquetaSemana` por la versión que usa un rango, y agregar el comparativo:

```ts
/** "Sem 41 · 5–11 oct", "Sem 40 · 28 sep – 4 oct" o, de un solo día, "Sem 44 · 1 nov". */
function etiquetaRango(n: number, desde: string, hasta: string): string {
  if (desde === hasta) return `Sem ${n} · ${diaMes(desde)}`;
  return desde.slice(0, 7) === hasta.slice(0, 7)
    ? `Sem ${n} · ${Number(desde.slice(8))}–${diaMes(hasta)}`
    : `Sem ${n} · ${diaMes(desde)} – ${diaMes(hasta)}`;
}

/** Para la lista: "Sem 41 · 5–11 oct" o "Sem 40 · 28 sep – 4 oct". */
export function etiquetaSemana(semana: string): string {
  const { desde, hasta } = rangoSemana(semana);
  return etiquetaRango(Number(semana.slice(6)), desde, hasta);
}

export type ColumnaComparativo = { clave: string; etiqueta: string; rango: Rango };
const MESES_CORTOS = MESES.map((m) => m[0].toUpperCase() + m.slice(1));

/**
 * Columnas de la vista comparativa. Mensual: los meses del año hasta el elegido. Semanal: las semanas del mes al que
 * pertenece la semana elegida (el de su jueves), cada una cortada al mes. Todas cortadas al inicio del P&L y a ayer;
 * sin columnas vacías.
 */
export function columnasComparativo(p: Periodo, hoy: string, inicio: string): { columnas: ColumnaComparativo[]; total: string; titulo: string } {
  const ayer = sumarDias(hoy, -1);
  const corta = (desde: string, hasta: string): Rango => ({ desde: desde < inicio ? inicio : desde, hasta: hasta > ayer ? ayer : hasta });
  const columnas: ColumnaComparativo[] = [];
  if (p.tipo === "mes") {
    const anio = p.clave.slice(0, 4);
    for (let m = `${anio}-01`; m <= p.clave; m = mesMenos(m, -1)) {
      const rango = corta(`${m}-01`, ultimoDia(m));
      if (rango.desde <= rango.hasta) columnas.push({ clave: m, etiqueta: MESES_CORTOS[Number(m.slice(5)) - 1], rango });
    }
    return { columnas, total: `Total ${anio}`, titulo: `Meses de ${anio}` };
  }
  const mes = sumarDias(rangoSemana(p.clave).desde, 3).slice(0, 7);
  const primero = `${mes}-01`, ultimo = ultimoDia(mes);
  for (let lunes = rangoSemana(semanaISO(primero)).desde; lunes <= ultimo; lunes = sumarDias(lunes, 7)) {
    const domingo = sumarDias(lunes, 6);
    const rango = corta(lunes < primero ? primero : lunes, domingo > ultimo ? ultimo : domingo);
    const n = Number(semanaISO(lunes).slice(6));
    if (rango.desde <= rango.hasta) columnas.push({ clave: semanaISO(lunes), etiqueta: etiquetaRango(n, rango.desde, rango.hasta), rango });
  }
  const nombre = MESES_LARGOS[Number(mes.slice(5)) - 1].toLowerCase();
  return { columnas, total: `Total ${nombre}`, titulo: `Semanas de ${nombre} ${mes.slice(0, 4)}` };
}
```

Run: `npm test` → Expected: PASS (incluidas las pruebas viejas de `etiquetaSemana`).

- [ ] **Step 3: Commit**

```bash
git add lib/finanzas/periodo.ts lib/finanzas/periodo.test.ts
git commit -m "feat(finanzas): columnas del P&L comparativo"
```

---

### Task 4: Hojas de Excel con secciones (`lib/finanzas/excel.ts`)

**Files:**
- Modify: `lib/finanzas/excel.ts`, `lib/finanzas/excel.test.ts` (reescrito)

**Interfaces:**
- Consumes: `EstiloFila` (Tarea 1), `Presentacion`/`PRESENTACION` (Tarea 2), solo como tipos en `excel.ts`.
- Produces: `type ColumnaPL = { etiqueta: string; filas: FilaPL[]; entrada: EntradaPL }`; `hojaPL(r: { titulo; periodo; generado; filas; entrada; anterior; acumulado; columnas }, pre: Presentacion)` → hoja "Contra meta"; `hojaComparativo(r: { titulo; periodo; generado; columnas: ColumnaPL[]; total: ColumnaPL }, pre)` → hoja "Comparativo".

- [ ] **Step 1: Pruebas** — reemplazar `lib/finanzas/excel.test.ts` completo:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hojaComparativo, hojaPL } from "./excel.ts";
import { calcularPL, entradaVacia } from "./pl.ts";
import { PRESENTACION } from "./secciones.ts";

const BARRA = { fondo: "7F7F7F", texto: "FFFFFF", negrita: true };
const ctx = (venta: number) => ({ ventaNeta: venta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });

test("hojaPL: secciones con color, barras de total, montos contables y memo al final", () => {
  const e = { ...entradaVacia(), ventaNeta: 1000, alimento: 300, descuentos: 50 };
  const filas = calcularPL(e, [{ renglon: "alimento", tipo: "pct", valor: 0.3 }], ctx(1000));
  const [h] = hojaPL({
    titulo: "Consolidado", periodo: "Semana 41 · 5 al 11 oct 2026", generado: "Sebastián", filas, entrada: e, anterior: null,
    acumulado: new Map([["alimento", 0.31]]), columnas: { anterior: "Semana anterior %", acumulado: "Acumulado del mes %" },
  }, PRESENTACION);
  const fila = (t: string) => h.filas.findIndex((f) => f[0] === t);
  assert.equal(h.nombre, "Contra meta");
  assert.equal(h.filas[1][0], "Semana 41 · 5 al 11 oct 2026 · sin IVA, criterio devengado");
  assert.deepEqual(h.filas[4], ["Renglón", "Real", "% de venta", "Meta", "Meta %", "Diferencia", "Semana anterior %", "Acumulado del mes %"]);
  assert.deepEqual(h.estilos![fila("VENTA")], { fondo: "BDD7EE", negrita: true });
  assert.deepEqual(h.estilos![fila("GASTOS DE OPERACIÓN")], { fondo: "FCE4D6", negrita: true });
  assert.deepEqual(h.estilos![fila("Margen bruto")], BARRA);
  assert.deepEqual(h.estilos![fila("EBITDA")], BARRA);
  assert.equal(h.estilos![fila("Alimento y empaque")], undefined);
  assert.deepEqual(h.filas[fila("Alimento y empaque")].slice(1), [
    { valor: 300, formato: "contable" }, { valor: 0.3, formato: "porcentaje" }, { valor: 300, formato: "contable" },
    { valor: 0.3, formato: "porcentaje" }, { valor: 0, formato: "contable" }, null, { valor: 0.31, formato: "porcentaje" },
  ]);
  assert.deepEqual(h.filas[fila("Descuentos (informativo)")], ["Descuentos (informativo)", { valor: 50, formato: "contable" }]);
  assert.equal(h.filas[fila("Merma")][1], "Sin dato");
  assert.ok(fila("Descuentos (informativo)") < fila("COSTO DE VENTA"));
  assert.ok(fila("MEMO") > fila("EBITDA"));
});

test("hojaComparativo: periodos lado a lado (monto y %) con su total", () => {
  const col = (etiqueta: string, venta: number) => {
    const entrada = { ...entradaVacia(), ventaNeta: venta, alimento: venta * 0.3 };
    return { etiqueta, filas: calcularPL(entrada, [], ctx(venta)), entrada };
  };
  const [h] = hojaComparativo({
    titulo: "Consolidado", periodo: "Semanas de octubre 2026", generado: "Sebastián",
    columnas: [col("Sem 40 · 1–4 oct", 400), col("Sem 41 · 5–11 oct", 600)], total: col("Total octubre", 1000),
  }, PRESENTACION);
  assert.equal(h.nombre, "Comparativo");
  assert.deepEqual(h.filas[4], ["Renglón", "Sem 40 · 1–4 oct", "%", "Sem 41 · 5–11 oct", "%", "Total octubre", "%"]);
  assert.deepEqual(h.filas.find((f) => f[0] === "Venta neta")!.slice(1), [
    { valor: 400, formato: "contable" }, { valor: 1, formato: "porcentaje" }, { valor: 600, formato: "contable" },
    { valor: 1, formato: "porcentaje" }, { valor: 1000, formato: "contable" }, { valor: 1, formato: "porcentaje" },
  ]);
  assert.deepEqual(h.estilos![h.filas.findIndex((f) => f[0] === "EBITDA")], BARRA);
});
```

Run → Expected: FAIL (`hojaComparativo` no existe).

- [ ] **Step 2: Implementar** — reemplazar `lib/finanzas/excel.ts` completo:

```ts
import type { Celda, EstiloFila, HojaXlsx } from "../xlsx-escribir";
import type { ClaveRenglon, EntradaPL, FilaPL } from "./pl";
import type { Presentacion } from "./secciones";

export type ColumnaPL = { etiqueta: string; filas: FilaPL[]; entrada: EntradaPL };

const contable = (n: number | null): Celda => (n === null ? null : { valor: n, formato: "contable" });
const pct = (n: number | null | undefined): Celda => (n === null || n === undefined ? null : { valor: n, formato: "porcentaje" });

/** Renglones por sección: encabezado de color, renglones, barra del total y un renglón en blanco; al final el memo. */
function porSecciones(pre: Presentacion, fila: (clave: ClaveRenglon) => Celda[] | null, extra: { venta: Celda[][]; memo: Celda[][] }, desde: number) {
  const filas: Celda[][] = [];
  const estilos: Record<number, EstiloFila> = {};
  const agregar = (celdas: Celda[], estilo?: EstiloFila) => { if (estilo) estilos[desde + filas.length] = estilo; filas.push(celdas); };
  const barra = { fondo: pre.barra.fondo, texto: pre.barra.texto, negrita: true };
  for (const s of pre.secciones) {
    agregar([s.nombre.toUpperCase()], { fondo: s.fondo, negrita: true });
    for (const c of s.renglones) { const f = fila(c); if (f) agregar(f); }
    if (s.clave === "venta") for (const f of extra.venta) agregar(f);
    if (s.total) { const f = fila(s.total); if (f) agregar(f, barra); }
    agregar([]);
  }
  agregar([pre.memo.nombre.toUpperCase()], { fondo: pre.memo.fondo, negrita: true });
  for (const f of extra.memo) agregar(f);
  return { filas, estilos };
}

const encabezado = (titulo: string, periodo: string, generado: string, columnas: Celda[]): Celda[][] =>
  [[titulo], [`${periodo} · sin IVA, criterio devengado`], [`Generado por ${generado}`], [], columnas];

/** Hoja "Contra meta": real, %, meta, diferencia y las dos comparaciones, por secciones. */
export function hojaPL(r: {
  titulo: string; periodo: string; generado: string; filas: FilaPL[]; entrada: EntradaPL;
  anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
  columnas: { anterior: string; acumulado: string };
}, pre: Presentacion): HojaXlsx[] {
  const arriba = encabezado(`P&L · ${r.titulo}`, r.periodo, r.generado,
    ["Renglón", "Real", "% de venta", "Meta", "Meta %", "Diferencia", r.columnas.anterior, r.columnas.acumulado]);
  const de = new Map(r.filas.map((f) => [f.clave, f]));
  const cuerpo = porSecciones(pre, (clave) => {
    const f = de.get(clave);
    return f ? [
      f.nombre, f.monto === null ? "Sin dato" : contable(f.monto), pct(f.pct), contable(f.meta), pct(f.metaPct), contable(f.diferencia),
      r.anterior ? pct(r.anterior.get(f.clave)) : null, pct(r.acumulado.get(f.clave)),
    ] : null;
  }, {
    venta: [["Descuentos (informativo)", contable(r.entrada.descuentos)]],
    memo: [["Compras de insumos", contable(r.entrada.memos.insumos)], ["Inversiones", contable(r.entrada.memos.inversiones)]],
  }, arriba.length);
  return [{ nombre: "Contra meta", filas: [...arriba, ...cuerpo.filas], negritas: [0, 4], estilos: cuerpo.estilos, anchos: [32, 16, 12, 16, 12, 16, 18, 18] }];
}

/** Hoja "Comparativo": cada periodo con su monto y su % de venta, más el total. */
export function hojaComparativo(r: { titulo: string; periodo: string; generado: string; columnas: ColumnaPL[]; total: ColumnaPL }, pre: Presentacion): HojaXlsx[] {
  const todas = [...r.columnas, r.total];
  const arriba = encabezado(`P&L comparativo · ${r.titulo}`, r.periodo, r.generado, ["Renglón", ...todas.flatMap((c) => [c.etiqueta, "%"])]);
  const cuerpo = porSecciones(pre, (clave) => {
    const fs = todas.map((c) => c.filas.find((f) => f.clave === clave));
    return fs[0] ? [fs[0].nombre, ...fs.flatMap((f) => [contable(f?.monto ?? null), pct(f?.pct)])] : null;
  }, {
    venta: [["Descuentos (informativo)", ...todas.flatMap((c) => [contable(c.entrada.descuentos), null])]],
    memo: [
      ["Compras de insumos", ...todas.flatMap((c) => [contable(c.entrada.memos.insumos), null])],
      ["Inversiones", ...todas.flatMap((c) => [contable(c.entrada.memos.inversiones), null])],
    ],
  }, arriba.length);
  return [{ nombre: "Comparativo", filas: [...arriba, ...cuerpo.filas], negritas: [0, 4], estilos: cuerpo.estilos, anchos: [32, ...todas.flatMap(() => [16, 9])] }];
}
```

Run: `npm test` → Expected: PASS. (`app/reporte/pl/excel/route.ts` deja de compilar hasta la Tarea 6; no correr `tsc` aquí.)

- [ ] **Step 3: Commit**

```bash
git add lib/finanzas/excel.ts lib/finanzas/excel.test.ts
git commit -m "feat(finanzas): hojas de Excel del P&L por secciones y comparativo"
```

---

### Task 5: Pantalla: secciones, comparativo y pestañas

**Files:**
- Create: `app/finanzas/Importe.tsx`, `app/finanzas/TablaComparativo.tsx`
- Modify: `app/finanzas/TablaPL.tsx` (reescrito), `app/finanzas/datos.ts` (agregar `comparativoPL`), `app/finanzas/page.tsx` (reescrito), `app/globals.css`

**Interfaces:**
- Consumes: Tareas 2–4.
- Produces: `comparativoPL(supabase, p, sucursalId?)` → `{ titulo; suc; sucursales; periodoTitulo; columnas: ColumnaPL[]; total: ColumnaPL }`; `TablaPL({ r, columnas, conDetalle? })`; `TablaComparativo({ columnas, total })`.

- [ ] **Step 1: `app/finanzas/Importe.tsx`**

```tsx
import { cifraContable } from "@/lib/finanzas/secciones";

/** Monto contable: el $ a la izquierda de la celda y la cifra a la derecha; negativos entre paréntesis. */
export function Importe({ n }: { n: number | null }) {
  if (n === null) return <>Sin dato</>;
  return <span className="importe"><span aria-hidden="true">$</span><span>{cifraContable(n)}</span></span>;
}
```

- [ ] **Step 2: `app/finanzas/TablaPL.tsx`** (reescrito)

```tsx
import { pesos, porcentaje } from "@/lib/formato";
import { NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import type { Columnas } from "@/lib/finanzas/periodo";
import type { EntradaPL, FilaPL } from "@/lib/finanzas/pl";
import { SECCIONES } from "@/lib/finanzas/secciones";
import { Importe } from "./Importe";

type Detalle = { texto: string; monto: number }[];
const NOMBRE_MEMO = { insumos: NOMBRE_CUENTA.insumos, inversiones: NOMBRE_CUENTA.inversiones } as const;

const desplegable = (items: Detalle, rotulo: string) =>
  items.length > 0 && (
    <details>
      <summary className="saldo-nota">{rotulo} ({items.length})</summary>
      <ul className="lista-simple">{items.map((i, n) => <li key={n}>{i.texto} · {pesos(i.monto)}</li>)}</ul>
    </details>
  );

/** P&L contra meta como estado de resultados: secciones con color, subtotales en barra y montos contables. */
export function TablaPL({ r, columnas, conDetalle = true }: {
  r: {
    filas: FilaPL[]; entrada: EntradaPL; anterior: ReadonlyMap<string, number | null> | null; acumulado: ReadonlyMap<string, number | null>;
    detalleDe: (renglon: string) => Detalle; memoDetalle: (cuenta: "insumos" | "inversiones") => Detalle;
  };
  /** Encabezados de las comparaciones (mes o semana). */
  columnas: Columnas;
  /** En el PDF no se despliega de dónde sale cada renglón. */
  conDetalle?: boolean;
}) {
  const de = new Map(r.filas.map((f) => [f.clave, f]));
  const pctDe = (m: ReadonlyMap<string, number | null> | null, clave: string) => (m ? porcentaje(m.get(clave) ?? null) : "—");

  const renglon = (f: FilaPL) => {
    const total = f.tipo === "total";
    const pasa = f.tipo === "gasto" && f.diferencia !== null && f.diferencia > 0;
    const falta = total && f.diferencia !== null && f.diferencia < 0;
    return (
      <tr key={f.clave} className={total ? "pl-total" : undefined}>
        <td data-label="Renglón">
          <span className="celda-pila"><strong>{f.nombre}</strong>{conDetalle && desplegable(r.detalleDe(f.clave), "De dónde sale")}</span>
        </td>
        <td data-label="Real" className="monto"><Importe n={f.monto} /></td>
        <td data-label="%" className="monto">{porcentaje(f.pct)}</td>
        <td data-label="Meta %" className="monto">{porcentaje(f.metaPct)}</td>
        <td data-label="Diferencia" className={`monto${pasa || falta ? " celda-alerta" : ""}`}>{f.diferencia === null ? "—" : <Importe n={f.diferencia} />}</td>
        <td data-label={columnas.anterior} className="monto">{pctDe(r.anterior, f.clave)}</td>
        <td data-label={columnas.acumulado} className="monto">{pctDe(r.acumulado, f.clave)}</td>
      </tr>
    );
  };
  const informativo = (clave: string, nombre: string, monto: number, items: Detalle) => (
    <tr key={clave} className="pl-informativo">
      <td data-label="Renglón"><span className="celda-pila"><strong>{nombre}</strong>{conDetalle && desplegable(items, "Facturas")}</span></td>
      <td data-label="Real" className="monto"><Importe n={monto} /></td>
      <td data-label="" colSpan={5} />
    </tr>
  );

  return (
    <section className="seccion">
      <div className="tabla-contenedor">
        <table className="tabla tabla-tarjetas tabla-pl">
          <thead>
            <tr>
              <th>Renglón</th><th className="monto">Real</th><th className="monto">%</th><th className="monto">Meta %</th><th className="monto">Dif.</th>
              <th className="monto" title={columnas.anterior}>{columnas.anteriorCorto}</th><th className="monto" title={columnas.acumulado}>{columnas.acumuladoCorto}</th>
            </tr>
          </thead>
          {SECCIONES.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion pl-${s.clave}`}><th colSpan={7} scope="rowgroup">{s.nombre}</th></tr>
              {s.renglones.map((c) => de.get(c)).filter((f): f is FilaPL => Boolean(f)).map(renglon)}
              {s.clave === "venta" && informativo("descuentos", "Descuentos (informativo)", r.entrada.descuentos, [])}
              {s.total && de.has(s.total) && renglon(de.get(s.total)!)}
            </tbody>
          ))}
          <tbody>
            <tr className="pl-seccion pl-memo"><th colSpan={7} scope="rowgroup">Memo</th></tr>
            {(["insumos", "inversiones"] as const).map((m) => informativo(m, NOMBRE_MEMO[m], r.entrada.memos[m], r.memoDetalle(m)))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: `app/finanzas/TablaComparativo.tsx`**

```tsx
import { porcentaje } from "@/lib/formato";
import { NOMBRE_CUENTA } from "@/lib/finanzas/cuentas";
import type { ColumnaPL } from "@/lib/finanzas/excel";
import { RENGLONES, type ClaveRenglon } from "@/lib/finanzas/pl";
import { SECCIONES } from "@/lib/finanzas/secciones";
import { Importe } from "./Importe";

const NOMBRE = new Map(RENGLONES.map((r) => [r.clave, r.nombre]));

/** Periodos lado a lado (meses del año o semanas del mes) y su total: monto y, debajo, % de venta. */
export function TablaComparativo({ columnas, total }: { columnas: ColumnaPL[]; total: ColumnaPL }) {
  const todas = [...columnas, total];
  const ancho = todas.length + 1;
  const clase = (i: number) => `monto${i === columnas.length ? " pl-col-total" : ""}`;
  const renglon = (clave: ClaveRenglon, esTotal: boolean) => (
    <tr key={clave} className={esTotal ? "pl-total" : undefined}>
      <th scope="row">{NOMBRE.get(clave)}</th>
      {todas.map((c, i) => {
        const f = c.filas.find((x) => x.clave === clave);
        return <td key={i} className={clase(i)}><Importe n={f?.monto ?? null} /><small className="pl-pct">{porcentaje(f?.pct ?? null)}</small></td>;
      })}
    </tr>
  );
  const simple = (clave: string, nombre: string, valor: (c: ColumnaPL) => number) => (
    <tr key={clave} className="pl-informativo">
      <th scope="row">{nombre}</th>
      {todas.map((c, i) => <td key={i} className={clase(i)}><Importe n={valor(c)} /></td>)}
    </tr>
  );
  return (
    <section className="seccion">
      <div className="tabla-contenedor tabla-deslizable">
        <table className="tabla tabla-pl tabla-comparativo">
          <thead><tr><th>Renglón</th>{todas.map((c, i) => <th key={i} className={clase(i)}>{c.etiqueta}</th>)}</tr></thead>
          {SECCIONES.map((s) => (
            <tbody key={s.clave}>
              <tr className={`pl-seccion pl-${s.clave}`}><th colSpan={ancho} scope="rowgroup">{s.nombre}</th></tr>
              {s.renglones.map((c) => renglon(c, false))}
              {s.clave === "venta" && simple("descuentos", "Descuentos (informativo)", (c) => c.entrada.descuentos)}
              {s.total && renglon(s.total, true)}
            </tbody>
          ))}
          <tbody>
            <tr className="pl-seccion pl-memo"><th colSpan={ancho} scope="rowgroup">Memo</th></tr>
            {simple("insumos", NOMBRE_CUENTA.insumos, (c) => c.entrada.memos.insumos)}
            {simple("inversiones", NOMBRE_CUENTA.inversiones, (c) => c.entrada.memos.inversiones)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: `comparativoPL` en `app/finanzas/datos.ts`** (al final; importar `columnasComparativo` de periodo y `type ColumnaPL` de excel)

```ts
/** Vista comparativa: cada columna es un periodo (mes o semana) cargado en paralelo; el total es su suma. Sin metas. */
export async function comparativoPL(supabase: SupabaseClient, p: Periodo, sucursalId: string | undefined) {
  const { columnas, total, titulo } = columnasComparativo(p, hoyMX(), INICIO_FECHA);
  const [res, cargas] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    Promise.all(columnas.map((c) => datosPL(supabase, c.rango))),
  ]);
  if (res.error) throw new Error(`No se pudieron cargar las sucursales: ${res.error.message}`);
  const sucursales = res.data ?? [];
  const suc = sucursales.find((s) => s.id === sucursalId) ?? null;
  const filasDe = (e: EntradaPL) => calcularPL(e, [], { ventaNeta: e.ventaNeta, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
  const entradas = cargas.map((d) => vistaPL(d, suc?.id).entrada);
  const suma = sumarEntradas(entradas);
  const cols: ColumnaPL[] = columnas.map((c, i) => ({ etiqueta: c.etiqueta, filas: filasDe(entradas[i]), entrada: entradas[i] }));
  return { titulo: suc?.nombre ?? "Consolidado", suc, sucursales, periodoTitulo: titulo, columnas: cols, total: { etiqueta: total, filas: filasDe(suma), entrada: suma } };
}
```

- [ ] **Step 5: `app/finanzas/page.tsx`** (reescrito)

```tsx
import Link from "next/link";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX } from "@/lib/formato";
import { elegirPeriodo, etiquetaSemana, paramsPeriodo, semanasDesde } from "@/lib/finanzas/periodo";
import { INICIO_FECHA, INICIO_PL } from "@/lib/finanzas/pl";
import { comparativoPL, plConHistoria } from "./datos";
import { TablaComparativo } from "./TablaComparativo";
import { TablaPL } from "./TablaPL";

type Filtros = { periodo?: string; mes?: string; semana?: string; sucursal?: string; vista?: string };

export default async function PaginaPL({ searchParams }: { searchParams: Promise<Filtros> }) {
  const q = await searchParams;
  const { supabase } = await obtenerPerfil();
  const hoy = hoyMX();
  const p = elegirPeriodo(q, hoy, INICIO_FECHA);
  const comparativo = q.vista === "comparativo";
  const meta = comparativo ? null : await plConHistoria(supabase, p, q.sucursal);
  const comp = comparativo ? await comparativoPL(supabase, p, q.sucursal) : null;
  const titulo = meta?.titulo ?? comp?.titulo ?? "Consolidado";
  const sucId = meta ? meta.suc?.id : comp?.suc?.id;
  const sucursales = meta ? meta.datos.porSucursal : comp?.sucursales ?? [];
  const suc: Record<string, string> = sucId ? { sucursal: sucId } : {};
  const vista: Record<string, string> = comparativo ? { vista: "comparativo" } : {};
  const filtro = new URLSearchParams({ ...paramsPeriodo(p), ...suc, ...vista }).toString();
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const pestana = (activa: boolean, href: string, texto: string) => (
    <Link className={activa ? "boton" : "boton boton-secundario"} aria-current={activa ? "page" : undefined} href={href}>{texto}</Link>
  );

  return (
    <>
      <div className="encabezado">
        <h1>P&L · {titulo}</h1>
        <p>
          {comp ? comp.periodoTitulo : <>{p.titulo}{enCurso && ` · hasta el ${fechaTexto(p.hasta)}`}</>}. Montos sin IVA, criterio devengado.
          {meta && " Meta: PL Base del modelo de Dodo."}{meta && !meta.suc && " Elige una sucursal para ver de dónde sale cada renglón."}
        </p>
      </div>
      <nav className="acciones" aria-label="Periodo y vista">
        {pestana(p.tipo === "mes", `/finanzas?${new URLSearchParams({ periodo: "mes", ...suc, ...vista })}`, "Mes")}
        {pestana(p.tipo === "semana", `/finanzas?${new URLSearchParams({ periodo: "semana", ...suc, ...vista })}`, "Semana")}
        {pestana(!comparativo, `/finanzas?${new URLSearchParams({ ...paramsPeriodo(p), ...suc })}`, "Contra meta")}
        {pestana(comparativo, `/finanzas?${new URLSearchParams({ ...paramsPeriodo(p), ...suc, vista: "comparativo" })}`, "Comparativo")}
      </nav>
      <form className="acciones" method="get">
        <input type="hidden" name="periodo" value={p.tipo} />
        {comparativo && <input type="hidden" name="vista" value="comparativo" />}
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
        <select id="sucursal" name="sucursal" defaultValue={sucId ?? ""}>
          <option value="">Consolidado</option>
          {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select>
        <button className="boton boton-secundario" type="submit">Ver</button>
        <Link className="boton boton-secundario" href={`/reporte/pl?${filtro}`} target="_blank">PDF</Link>
        <a className="boton boton-secundario" href={`/reporte/pl/excel?${filtro}`} download>Excel</a>
      </form>
      {p.tipo === "semana" && (
        <p className="saldo-nota">Lo que se registra por mes (nómina, renta, servicios, facturas, oficina) se reparte por días; si llega una factura de ese mes, la semana se ajusta.</p>
      )}
      {comp ? (
        comp.columnas.length === 0
          ? <p className="vacio">Todavía no hay días cerrados en este periodo.</p>
          : <TablaComparativo columnas={comp.columnas} total={comp.total} />
      ) : meta && p.vacio ? (
        <p className="vacio">{p.tipo === "semana" ? "La semana apenas empieza: todavía no hay días cerrados." : "El mes apenas empieza: todavía no hay días cerrados."}</p>
      ) : meta && (
        <>
          {meta.avisos.length > 0 && <ul className="aviso aviso-error lista-simple">{meta.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          <TablaPL r={meta} columnas={meta.columnas} />
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Estilos** — agregar al final de `app/globals.css`:

```css
/* ─── P&L como estado de resultados: secciones con color, subtotales en barra, montos contables ─── */
.tabla-pl { --pl-fondo: var(--papel-2); --pl-barra: #7f7f7f; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.tabla-pl .pl-venta { --pl-fondo: #bdd7ee; }
.tabla-pl .pl-costo { --pl-fondo: #d9ead3; }
.tabla-pl .pl-operacion { --pl-fondo: #fce4d6; }
.tabla-pl .pl-oficina { --pl-fondo: #ead1dc; }
.tabla-pl .pl-memo { --pl-fondo: #f2f2f2; }
.tabla-pl .pl-seccion th {
  background: var(--pl-fondo); color: var(--tinta); font-size: 0.85rem; font-weight: 800; text-transform: uppercase;
  letter-spacing: 0.03em; padding: 8px 10px; border-bottom: 0;
}
.tabla-pl tbody + tbody .pl-seccion th { border-top: 14px solid var(--blanco); }
.tabla-pl .pl-total td, .tabla-pl .pl-total th[scope="row"] { background: var(--pl-barra); color: var(--blanco); font-weight: 800; border-bottom: 0; }
.tabla-pl .pl-total td.celda-alerta { background: var(--alerta-fondo); color: var(--alerta-texto); }
.tabla-pl .pl-informativo td, .tabla-pl .pl-informativo th { color: var(--tinta-2); }
.importe { display: inline-flex; justify-content: space-between; gap: 10px; min-width: 8.5em; font-variant-numeric: tabular-nums; }
.pl-pct { display: block; font-size: 0.78rem; font-weight: 500; color: var(--tinta-2); }
.pl-total .pl-pct { color: var(--blanco); }
/* Comparativo: la única tabla ancha; se desliza de lado con la columna de renglones fija. */
.tabla-deslizable { overflow-x: auto; }
.tabla-comparativo th[scope="row"], .tabla-comparativo thead th:first-child {
  position: sticky; left: 0; z-index: 1; background: var(--blanco); text-align: left; white-space: nowrap;
  font-size: 0.92rem; font-weight: 600; color: var(--tinta); padding: 10px; border-bottom: 1px solid var(--papel-2);
}
.tabla-comparativo .pl-col-total { border-left: 2px solid var(--linea); }
.tabla-comparativo th.monto, .tabla-comparativo td.monto { min-width: 9.5em; }
@media (max-width: 640px) {
  .tabla-pl.tabla-tarjetas .pl-seccion { border: 0; padding: 0; margin: 18px 0 8px; background: none; }
  .tabla-pl.tabla-tarjetas .pl-seccion th { display: block; border-radius: 8px; border-top: 0; }
  .tabla-pl.tabla-tarjetas .pl-total { background: var(--pl-barra); border-color: var(--pl-barra); }
  .tabla-pl.tabla-tarjetas .pl-total td { background: none; }
  .tabla-pl.tabla-tarjetas .pl-total td::before { color: var(--blanco); }
  .tabla-pl.tabla-tarjetas .pl-total td.celda-alerta { background: var(--alerta-fondo); }
}
```

- [ ] **Step 7: Verificar** — `npm test` → PASS. (`tsc` hasta la Tarea 6.)

- [ ] **Step 8: Commit**

```bash
git add app/finanzas app/globals.css
git commit -m "feat(finanzas): P&L por secciones y vista comparativa en pantalla"
```

---

### Task 6: PDF y Excel

**Files:**
- Modify: `app/finanzas/reporte-datos.ts`, `app/reporte/pl/page.tsx` (reescrito), `app/reporte/pl/excel/route.ts`

**Interfaces:**
- Produces: `reportePL(q: { periodo?; mes?; semana?; sucursal?; vista? }, que: { meta: boolean; comparativo: boolean })` → `{ periodo: Periodo; generadoPor: string; titulo: string; meta: Awaited<ReturnType<typeof plConHistoria>> | null; comp: Awaited<ReturnType<typeof comparativoPL>> | null }`.

- [ ] **Step 1: `app/finanzas/reporte-datos.ts`**

```ts
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { elegirPeriodo } from "@/lib/finanzas/periodo";
import { INICIO_FECHA } from "@/lib/finanzas/pl";
import { puedeVerFinanzas } from "@/lib/roles";
import { comparativoPL, plConHistoria } from "./datos";

export type FiltrosPL = { periodo?: string; mes?: string; semana?: string; sucursal?: string; vista?: string };

/** Lo que llevan el PDF y el Excel del P&L, con el mismo periodo y sucursal que la pantalla; `que` dice qué vistas cargar. */
export async function reportePL(q: FiltrosPL, que: { meta: boolean; comparativo: boolean }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerFinanzas(perfil.rol)) redirect("/");
  const periodo = elegirPeriodo(q, hoyMX(), INICIO_FECHA);
  const [meta, comp] = await Promise.all([
    que.meta ? plConHistoria(supabase, periodo, q.sucursal) : Promise.resolve(null),
    que.comparativo ? comparativoPL(supabase, periodo, q.sucursal) : Promise.resolve(null),
  ]);
  return { periodo, generadoPor: perfil.nombre, titulo: meta?.titulo ?? comp?.titulo ?? "Consolidado", meta, comp };
}
```

- [ ] **Step 2: `app/reporte/pl/page.tsx`** (reescrito)

```tsx
import { reportePL, type FiltrosPL } from "@/app/finanzas/reporte-datos";
import { TablaComparativo } from "@/app/finanzas/TablaComparativo";
import { TablaPL } from "@/app/finanzas/TablaPL";
import { fechaTexto } from "@/lib/formato";
import { EncabezadoReporte } from "../Encabezado";

export const dynamic = "force-dynamic";

/** P&L para imprimir o guardar como PDF: la misma vista, periodo y sucursal que la pantalla. */
export default async function ReportePLPdf({ searchParams }: { searchParams: Promise<FiltrosPL> }) {
  const q = await searchParams;
  const comparativo = q.vista === "comparativo";
  const r = await reportePL(q, { meta: !comparativo, comparativo });
  const p = r.periodo;
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const vacio = <p className="vacio">Todavía no hay días cerrados en este periodo.</p>;
  return (
    <main className="pagina">
      {comparativo && <style>{"@page { size: landscape; }"}</style>}
      <EncabezadoReporte titulo={comparativo ? "P&L comparativo" : "P&L"} sucursal={r.titulo}
        detalle={`${r.comp ? r.comp.periodoTitulo : `${p.titulo}${enCurso ? ` · hasta el ${fechaTexto(p.hasta)}` : ""}`} · sin IVA, criterio devengado`}
        generadoPor={r.generadoPor} />
      {r.comp ? (
        r.comp.columnas.length ? <TablaComparativo columnas={r.comp.columnas} total={r.comp.total} /> : vacio
      ) : r.meta && (p.vacio ? vacio : (
        <>
          {r.meta.avisos.length > 0 && <ul className="aviso aviso-error lista-simple">{r.meta.avisos.map((a) => <li key={a}>{a}</li>)}</ul>}
          <TablaPL r={r.meta} columnas={r.meta.columnas} conDetalle={false} />
        </>
      ))}
    </main>
  );
}
```

- [ ] **Step 3: `app/reporte/pl/excel/route.ts`** — las dos hojas:

```ts
import { reportePL, type FiltrosPL } from "@/app/finanzas/reporte-datos";
import { fechaMX, hora } from "@/lib/formato";
import { hojaComparativo, hojaPL } from "@/lib/finanzas/excel";
import { PRESENTACION } from "@/lib/finanzas/secciones";
import { escribirXlsx } from "@/lib/xlsx-escribir";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const q = Object.fromEntries(new URL(request.url).searchParams) as FiltrosPL;
  const r = await reportePL(q, { meta: true, comparativo: true });
  const ahora = new Date().toISOString();
  const generado = `${r.generadoPor} · ${fechaMX(ahora)} ${hora(ahora)}`;
  const p = r.periodo;
  const enCurso = !p.vacio && p.hasta < p.finNominal;
  const archivo = escribirXlsx([
    ...hojaPL({
      titulo: r.titulo, periodo: `${p.titulo}${enCurso ? ` · hasta el ${p.hasta}` : ""}`, generado, filas: r.meta!.filas, entrada: r.meta!.entrada,
      anterior: r.meta!.anterior, acumulado: r.meta!.acumulado, columnas: r.meta!.columnas,
    }, PRESENTACION),
    ...hojaComparativo({ titulo: r.titulo, periodo: r.comp!.periodoTitulo, generado, columnas: r.comp!.columnas, total: r.comp!.total }, PRESENTACION),
  ]);
  const nombre = `P&L ${r.titulo.replace(/[\\/:*?"<>|]/g, " ")} ${p.clave}.xlsx`;
  return new Response(Buffer.from(archivo), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}"; filename*=UTF-8''${encodeURIComponent(nombre)}`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 4: Verificar** — `rm -rf .next`, `node node_modules/typescript/bin/tsc --noEmit` → sin errores; `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/finanzas/reporte-datos.ts app/reporte/pl
git commit -m "feat(finanzas): PDF y Excel del P&L con secciones y comparativo"
```

---

### Task 7: Vista previa y Excel real

**Files:**
- Create (temporal, se borra antes de terminar): `app/login/prueba-pl-formato/page.tsx`

- [ ] **Step 1: Página temporal**

```tsx
// TEMPORAL: las dos vistas del P&L con datos de ejemplo. Se borra antes de terminar.
import { calcularPL, entradaVacia, type EntradaPL } from "@/lib/finanzas/pl";
import { COLUMNAS } from "@/lib/finanzas/periodo";
import { TablaComparativo } from "@/app/finanzas/TablaComparativo";
import { TablaPL } from "@/app/finanzas/TablaPL";

const ctx = (v: number) => ({ ventaNeta: v, ventaRappi: 0, plantilla: { cocina: 0, gerencia: 0 } });
const entrada = (v: number): EntradaPL => ({
  ...entradaVacia(), ventaNeta: v, descuentos: v * 0.03, alimento: v * 0.31, nomina: { cocina: v * 0.12, gerencia: v * 0.04 },
  gastos: { renta: 6774.19, servicios: 4516.13, marketing: v * 0.02 }, regalias: v * 0.05, oficina: v * 0.05, memos: { insumos: v * 0.28, inversiones: 0 },
});

export default function PruebaFormato() {
  const e = entrada(142000);
  const filas = calcularPL(e, [{ renglon: "alimento", tipo: "pct", valor: 0.3 }, { renglon: "renta", tipo: "monto", valor: 6774.19 }], ctx(142000));
  const col = (etiqueta: string, v: number) => ({ etiqueta, filas: calcularPL(entrada(v), [], ctx(v)), entrada: entrada(v) });
  return (
    <main className="pagina">
      <h1>P&L · Prueba de formato</h1>
      <TablaPL r={{ filas, entrada: e, anterior: null, acumulado: new Map(filas.map((f) => [f.clave, f.pct])), detalleDe: () => [], memoDetalle: () => [] }} columnas={COLUMNAS.semana} />
      <TablaComparativo columnas={[col("Sem 40 · 1–4 oct", 80000), col("Sem 41 · 5–11 oct", 142000), col("Sem 42 · 12–14 oct", 61000)]} total={col("Total octubre", 283000)} />
    </main>
  );
}
```

- [ ] **Step 2: Revisar en el preview** (`/login/prueba-pl-formato`) a 1280 px y a 375 px: bandas de color por sección, barras grises con letra blanca, `$` a la izquierda y negativos entre paréntesis; en celular las tarjetas con la banda de sección, y el comparativo deslizable con "Renglón" fijo; la página no se desborda (`scrollWidth === innerWidth`).
- [ ] **Step 3: Excel real** — generar con `hojaPL` + `hojaComparativo` + `escribirXlsx` (script en el scratchpad con `node --experimental-strip-types`) y abrirlo por COM desde PowerShell: Expected: abre sin reparar, dos hojas "Contra meta" y "Comparativo", `Range("A6").Interior.Color` de VENTA = azul, y una celda negativa se lee como `$ (10.00)` en `.Text`.
- [ ] **Step 4: Borrar la página temporal**, `rm -rf .next`, `tsc` y `npm test` en verde, `git status` limpio.

---

## Cierre

- [ ] Revisión final de la rama (modelo más capaz) con el Review Focus.
- [ ] Sin migración: fusionar a main cuando Sebastián lo apruebe, copiar los archivos y borrar la rama.
