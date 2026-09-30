# Compras fase 1: proveedores y artículos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cartera de proveedores (con régimen fiscal, CLABE validada, días de crédito y categorías), catálogo de artículos y carga inicial de proveedores desde Excel, en una sección nueva `/compras` que el admin edita y corporativo consulta.

**Architecture:** Migración 0011 con tres tablas (`proveedores`, `articulos`, `precios_proveedor`), RLS (lectura admin+corporativo, escritura solo admin, sin borrado) y checks que repiten las validaciones de la pantalla. Validación y lectura del Excel en módulos puros de `lib/compras/` probados con `node --test`. Pantallas server-rendered con server actions, siguiendo el patrón de `/ventas/costos`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript estricto, Supabase Postgres (RLS, plpgsql), `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-09-30-compras-design.md` (sección 1 y "Seguridad"; fases 2–4 fuera de este plan).

## Global Constraints

- Repositorio: `C:/Users/sebcm/AppData/Local/Temp/claude/C--Users-sebcm-Downloads-dodo-control-efectivo-1-dodo-efectivo/e60f0e8d-16fc-4407-8eb6-62a8265bd266/scratchpad/dodo-money`, rama `feat/compras`. Antes de cada comando de node: `export PATH="$PATH:/c/Program Files/nodejs"`.
- Módulos de `lib/` importan de otros módulos locales **solo tipos** (`import type`, sin extensión), para que `node --test` los cargue y Next compile. Por eso todo lo de proveedores vive en un solo módulo, `lib/compras/proveedores.ts`. Los archivos `*.test.ts` sí importan valores con extensión `.ts`.
- Todo texto de pantalla en español de México; montos con `pesos()` de `lib/formato.ts`.
- Diseño: tarjetas y plegables (`.tarjetas`, `.tarjeta`, `Plegable`); **nada de tablas anchas ni scroll horizontal**. No cambiar `app/globals.css` salvo que una tarea lo diga.
- Nada se borra: proveedores y artículos se desactivan (`activo = false`).
- Corporativo recibe `SOLO_CONSULTA` ("Corporativo solo puede consultar.") si intenta escribir.
- Pruebas SQL: bloque `do $$ … $$` que termina con `raise exception 'PRUEBAS OK — …'`; las corre Sebastián en Supabase → SQL Editor. No se fusiona a main sin su "PRUEBAS OK".
- Páginas temporales de verificación visual van en `app/login/prueba-*` y se borran antes del commit.

## Review Focus

1. **RFC con guiones, espacios o minúsculas** ("abc-010203-xy9 ") — debe normalizarse a `ABC010203XY9` antes de validar y guardar, en pantalla y en Excel.
2. **Excel con encabezados con acentos, mayúsculas o en otro orden** ("RÉGIMEN FISCAL", columnas movidas) — debe reconocerlos; columnas desconocidas se ignoran; faltar una obligatoria es error claro.
3. **RFC repetido dentro del mismo Excel o ya existente en la base** — error por renglón, no se guarda ninguno.
4. **Celdas numéricas del Excel** (CLABE o días de crédito leídos como número; CLABE que Excel convirtió a notación científica o perdió ceros a la izquierda) — CLABE numérica se rechaza con mensaje que pide formato texto; días como número se aceptan.
5. **Corporativo manda el formulario a mano** (POST directo a la server action) — la acción responde `SOLO_CONSULTA` y la RLS rechaza igual.

---

### Task 1: Validación de proveedores y artículos (`lib/compras`)

**Files:**
- Create: `lib/compras/proveedores.ts` (catálogo SAT + validación; Task 2 le agrega la lectura del Excel)
- Test: `lib/compras/proveedores.test.ts`
- Modify: `package.json` (script `test`)

Why one module: modules in `lib/` import each other **only as types** (no value imports between local modules), so the SAT catalog, validation and Excel reader live together.

**Interfaces:**
- Produces (all from `lib/compras/proveedores.ts`):
  - `REGIMENES: Record<string, string>` (clave → nombre), `nombreRegimen(clave: string): string`.
  - `clave(t: string): string` (normaliza etiquetas: minúsculas, sin acentos, espacios → "_").
    - `CATEGORIAS_COMPRA = ["consumible", "activo_fijo", "servicio", "otro"] as const`, `type CategoriaCompra`, `NOMBRE_CATEGORIA_COMPRA: Record<CategoriaCompra, string>`.
    - `FORMAS_PAGO = ["transferencia", "efectivo", "tarjeta", "cheque"] as const`, `type FormaPago`, `NOMBRE_FORMA_PAGO`.
    - `TASAS_IVA = ["16", "0", "exento"] as const`, `type TasaIva`, `NOMBRE_TASA_IVA`.
    - `normalizarRfc(t: string): string`, `rfcValido(rfc: string): boolean`, `clabeValida(clabe: string): boolean`.
    - `type DatosProveedor = { razon_social: string; nombre_comercial: string | null; rfc: string; regimen_fiscal: string; contacto_nombre: string | null; telefono: string | null; correo: string | null; banco: string | null; clabe: string | null; cuenta: string | null; dias_credito: number; forma_pago_habitual: FormaPago; categorias: CategoriaCompra[]; notas: string | null }`.
    - `leerProveedor(valor: (campo: string) => string): { datos: DatosProveedor } | { error: string }`.
    - `type DatosArticulo = { nombre: string; unidad: string; tipo: CategoriaCompra; tasa_iva: TasaIva; dodo_insumo_id: string | null }`.
    - `leerArticulo(valor: (campo: string) => string): { datos: DatosArticulo } | { error: string }`.

- [ ] **Step 1: Write the failing test**

`lib/compras/proveedores.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clabeValida, leerArticulo, leerProveedor, nombreRegimen, normalizarRfc, REGIMENES, rfcValido } from "./proveedores.ts";

const campos = (o: Record<string, string>) => (c: string) => o[c] ?? "";
const base = { razon_social: "Lácteos del Bajío SA de CV", rfc: "LBA010203AB1", regimen_fiscal: "601" };

test("RFC: se normaliza y valida persona moral (12) y física (13)", () => {
  assert.equal(normalizarRfc(" lba-010203 ab1 "), "LBA010203AB1");
  assert.equal(rfcValido("LBA010203AB1"), true);
  assert.equal(rfcValido("GOMJ800101AB2"), true);
  assert.equal(rfcValido("ÑAÑ010203AB1"), true);
  assert.equal(rfcValido("LB010203AB1"), false);
  assert.equal(rfcValido("LBA0102AB1"), false);
  assert.equal(rfcValido(""), false);
});

test("CLABE: 18 dígitos con dígito verificador", () => {
  assert.equal(clabeValida("032180000118359719"), true);
  assert.equal(clabeValida("002010077777777771"), true);
  assert.equal(clabeValida("012180001234567899"), true);
  assert.equal(clabeValida("012180001234567897"), false);
  assert.equal(clabeValida("03218000011835971"), false);
  assert.equal(clabeValida("0321800001183597AB"), false);
});

test("régimen fiscal del catálogo del SAT", () => {
  assert.equal(nombreRegimen("626"), "Régimen Simplificado de Confianza");
  assert.equal(REGIMENES["601"], "General de Ley Personas Morales");
  assert.equal(nombreRegimen("999"), "999");
});

test("proveedor mínimo: defaults de crédito, forma de pago y categorías", () => {
  const r = leerProveedor(campos(base));
  assert.ok("datos" in r);
  assert.deepEqual(r.datos, {
    razon_social: "Lácteos del Bajío SA de CV", nombre_comercial: null, rfc: "LBA010203AB1", regimen_fiscal: "601",
    contacto_nombre: null, telefono: null, correo: null, banco: null, clabe: null, cuenta: null,
    dias_credito: 0, forma_pago_habitual: "transferencia", categorias: [], notas: null,
  });
});

test("proveedor completo: acepta etiquetas legibles y las normaliza", () => {
  const r = leerProveedor(campos({
    ...base, rfc: "lba-010203-ab1", regimen_fiscal: "601 - General de Ley Personas Morales",
    nombre_comercial: " Lácteos Bajío ", correo: "Ventas@Lacteos.mx", clabe: "032180000118359719",
    dias_credito: "15", forma_pago_habitual: "Transferencia", categorias: "Consumible, Activo fijo, consumible",
  }));
  assert.ok("datos" in r);
  assert.equal(r.datos.rfc, "LBA010203AB1");
  assert.equal(r.datos.regimen_fiscal, "601");
  assert.equal(r.datos.nombre_comercial, "Lácteos Bajío");
  assert.equal(r.datos.correo, "ventas@lacteos.mx");
  assert.equal(r.datos.dias_credito, 15);
  assert.deepEqual(r.datos.categorias, ["consumible", "activo_fijo"]);
});

test("proveedor: cada error con mensaje claro", () => {
  const error = (o: Record<string, string>) => {
    const r = leerProveedor(campos({ ...base, ...o }));
    return "error" in r ? r.error : null;
  };
  assert.equal(error({ razon_social: " " }), "Escribe la razón social.");
  assert.equal(error({ rfc: "ABC" }), "El RFC ABC no es válido (12 caracteres para empresa, 13 para persona física).");
  assert.equal(error({ regimen_fiscal: "999" }), "Elige un régimen fiscal del catálogo del SAT.");
  assert.equal(error({ clabe: "012180001234567897" }), "La CLABE no es válida: deben ser 18 dígitos y revisa el último.");
  assert.equal(error({ correo: "ventas" }), "El correo no es válido.");
  assert.equal(error({ dias_credito: "-1" }), "Los días de crédito van de 0 a 365.");
  assert.equal(error({ dias_credito: "15.5" }), "Los días de crédito van de 0 a 365.");
  assert.equal(error({ forma_pago_habitual: "bitcoin" }), "Forma de pago no reconocida: bitcoin.");
  assert.equal(error({ categorias: "comida" }), "Categoría no reconocida: comida.");
});

test("artículo: consumible con ID de Dodo IS; los demás sin él", () => {
  const r = leerArticulo(campos({ nombre: " Queso mozzarella ", unidad: "kg", tipo: "consumible", tasa_iva: "0", dodo_insumo_id: "11f19a2e8ebb9f693a4a16e21fdbfd00" }));
  assert.ok("datos" in r);
  assert.deepEqual(r.datos, { nombre: "Queso mozzarella", unidad: "kg", tipo: "consumible", tasa_iva: "0", dodo_insumo_id: "11F19A2E8EBB9F693A4A16E21FDBFD00" });

  const error = (o: Record<string, string>) => {
    const x = leerArticulo(campos({ nombre: "Horno", unidad: "pza", tipo: "activo_fijo", tasa_iva: "16", ...o }));
    return "error" in x ? x.error : null;
  };
  assert.equal(error({}), null);
  assert.equal(error({ nombre: "" }), "Escribe el nombre del artículo.");
  assert.equal(error({ unidad: "" }), "Escribe la unidad (kg, pza, caja, servicio…).");
  assert.equal(error({ tipo: "x" }), "Elige el tipo de artículo.");
  assert.equal(error({ tasa_iva: "8" }), "Elige la tasa de IVA.");
  assert.equal(error({ dodo_insumo_id: "11F19A2E8EBB9F693A4A16E21FDBFD00" }), "Solo los consumibles llevan ID de insumo de Dodo IS.");
  assert.equal(error({ tipo: "consumible", dodo_insumo_id: "123" }), "El ID de insumo de Dodo IS son 32 caracteres (0-9 y A-F).");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/compras/proveedores.test.ts`
Expected: FAIL — `Cannot find module …/lib/compras/proveedores.ts`.

- [ ] **Step 3: Write minimal implementation**

`lib/compras/proveedores.ts` (one file; the two blocks below go in this order):

```ts
/** Catálogo c_RegimenFiscal del SAT (CFDI 4.0). */
export const REGIMENES: Record<string, string> = {
  "601": "General de Ley Personas Morales",
  "603": "Personas Morales con Fines no Lucrativos",
  "605": "Sueldos y Salarios e Ingresos Asimilados a Salarios",
  "606": "Arrendamiento",
  "607": "Régimen de Enajenación o Adquisición de Bienes",
  "608": "Demás ingresos",
  "610": "Residentes en el Extranjero sin Establecimiento Permanente en México",
  "611": "Ingresos por Dividendos (socios y accionistas)",
  "612": "Personas Físicas con Actividades Empresariales y Profesionales",
  "614": "Ingresos por intereses",
  "615": "Régimen de los ingresos por obtención de premios",
  "616": "Sin obligaciones fiscales",
  "620": "Sociedades Cooperativas de Producción que optan por diferir sus ingresos",
  "621": "Incorporación Fiscal",
  "622": "Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras",
  "623": "Opcional para Grupos de Sociedades",
  "624": "Coordinados",
  "625": "Actividades Empresariales con ingresos a través de Plataformas Tecnológicas",
  "626": "Régimen Simplificado de Confianza",
  "628": "Hidrocarburos",
  "629": "De los Regímenes Fiscales Preferentes y de las Empresas Multinacionales",
  "630": "Enajenación de acciones en bolsa de valores",
};

export const nombreRegimen = (clave: string) => REGIMENES[clave] ?? clave;
```

Continuing `lib/compras/proveedores.ts`:

```ts

export const CATEGORIAS_COMPRA = ["consumible", "activo_fijo", "servicio", "otro"] as const;
export type CategoriaCompra = (typeof CATEGORIAS_COMPRA)[number];
export const NOMBRE_CATEGORIA_COMPRA: Record<CategoriaCompra, string> = {
  consumible: "Consumible", activo_fijo: "Activo fijo", servicio: "Servicio", otro: "Otro",
};

export const FORMAS_PAGO = ["transferencia", "efectivo", "tarjeta", "cheque"] as const;
export type FormaPago = (typeof FORMAS_PAGO)[number];
export const NOMBRE_FORMA_PAGO: Record<FormaPago, string> = {
  transferencia: "Transferencia", efectivo: "Efectivo", tarjeta: "Tarjeta", cheque: "Cheque",
};

export const TASAS_IVA = ["16", "0", "exento"] as const;
export type TasaIva = (typeof TASAS_IVA)[number];
export const NOMBRE_TASA_IVA: Record<TasaIva, string> = { "16": "IVA 16 %", "0": "IVA 0 %", exento: "Exento" };

/** "Activo fijo" → "activo_fijo": minúsculas, sin acentos, espacios y guiones a "_". */
export const clave = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const opcional = (t: string) => t.trim() || null;

export const normalizarRfc = (t: string) => t.toUpperCase().replace(/[\s-]/g, "");
export const rfcValido = (rfc: string) => /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/.test(rfc);

/** Dígito verificador de Banxico: pesos 3, 7, 1 sobre los primeros 17 dígitos, módulo 10. */
export function clabeValida(clabe: string): boolean {
  if (!/^\d{18}$/.test(clabe)) return false;
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(clabe[i]) * [3, 7, 1][i % 3]) % 10;
  return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}

export type DatosProveedor = {
  razon_social: string; nombre_comercial: string | null; rfc: string; regimen_fiscal: string;
  contacto_nombre: string | null; telefono: string | null; correo: string | null;
  banco: string | null; clabe: string | null; cuenta: string | null;
  dias_credito: number; forma_pago_habitual: FormaPago; categorias: CategoriaCompra[]; notas: string | null;
};

type Resultado<T> = { datos: T } | { error: string };

/** Lee y valida un proveedor; `valor(campo)` devuelve el texto del formulario o de la celda del Excel. */
export function leerProveedor(valor: (campo: string) => string): Resultado<DatosProveedor> {
  const razon_social = valor("razon_social").trim();
  if (!razon_social) return { error: "Escribe la razón social." };

  const rfc = normalizarRfc(valor("rfc"));
  if (!rfcValido(rfc)) return { error: `El RFC ${rfc || "(vacío)"} no es válido (12 caracteres para empresa, 13 para persona física).` };

  const regimen_fiscal = valor("regimen_fiscal").trim().slice(0, 3);
  if (!REGIMENES[regimen_fiscal]) return { error: "Elige un régimen fiscal del catálogo del SAT." };

  const clabe = opcional(valor("clabe").replace(/\s/g, ""));
  if (clabe && !clabeValida(clabe)) return { error: "La CLABE no es válida: deben ser 18 dígitos y revisa el último." };

  const correo = opcional(valor("correo").toLowerCase());
  if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "El correo no es válido." };

  const textoDias = valor("dias_credito").trim();
  const dias_credito = textoDias === "" ? 0 : Number(textoDias);
  if (!Number.isInteger(dias_credito) || dias_credito < 0 || dias_credito > 365) return { error: "Los días de crédito van de 0 a 365." };

  const textoForma = valor("forma_pago_habitual").trim();
  const forma = textoForma === "" ? "transferencia" : clave(textoForma);
  if (!(FORMAS_PAGO as readonly string[]).includes(forma)) return { error: `Forma de pago no reconocida: ${textoForma}.` };

  const categorias: CategoriaCompra[] = [];
  for (const parte of valor("categorias").split(",").map((p) => p.trim()).filter(Boolean)) {
    const c = clave(parte);
    if (!(CATEGORIAS_COMPRA as readonly string[]).includes(c)) return { error: `Categoría no reconocida: ${parte}.` };
    if (!categorias.includes(c as CategoriaCompra)) categorias.push(c as CategoriaCompra);
  }

  return {
    datos: {
      razon_social, nombre_comercial: opcional(valor("nombre_comercial")), rfc, regimen_fiscal,
      contacto_nombre: opcional(valor("contacto_nombre")), telefono: opcional(valor("telefono")), correo,
      banco: opcional(valor("banco")), clabe, cuenta: opcional(valor("cuenta")),
      dias_credito, forma_pago_habitual: forma as FormaPago, categorias, notas: opcional(valor("notas")),
    },
  };
}

export type DatosArticulo = { nombre: string; unidad: string; tipo: CategoriaCompra; tasa_iva: TasaIva; dodo_insumo_id: string | null };

export function leerArticulo(valor: (campo: string) => string): Resultado<DatosArticulo> {
  const nombre = valor("nombre").trim();
  if (!nombre) return { error: "Escribe el nombre del artículo." };
  const unidad = valor("unidad").trim();
  if (!unidad) return { error: "Escribe la unidad (kg, pza, caja, servicio…)." };
  const tipo = valor("tipo");
  if (!(CATEGORIAS_COMPRA as readonly string[]).includes(tipo)) return { error: "Elige el tipo de artículo." };
  const tasa_iva = valor("tasa_iva");
  if (!(TASAS_IVA as readonly string[]).includes(tasa_iva)) return { error: "Elige la tasa de IVA." };
  const dodo_insumo_id = opcional(valor("dodo_insumo_id").toUpperCase());
  if (dodo_insumo_id && tipo !== "consumible") return { error: "Solo los consumibles llevan ID de insumo de Dodo IS." };
  if (dodo_insumo_id && !/^[0-9A-F]{32}$/.test(dodo_insumo_id)) return { error: "El ID de insumo de Dodo IS son 32 caracteres (0-9 y A-F)." };
  return { datos: { nombre, unidad, tipo: tipo as CategoriaCompra, tasa_iva: tasa_iva as TasaIva, dodo_insumo_id } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/compras/proveedores.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Add to the suite and commit**

In `package.json`, append ` lib/compras/proveedores.test.ts` at the end of the `test` script's file list.

Run: `npm test`
Expected: all pass (139 previos + 7).

```bash
git add lib/compras/proveedores.ts lib/compras/proveedores.test.ts package.json
git commit -m "feat(compras): validación de proveedores y artículos"
```

---

### Task 2: Lectura del Excel de proveedores

**Files:**
- Modify: `lib/compras/proveedores.ts` (append the Excel reader; add `import type { Hoja } from "../ventas/xlsx";` as the file's first line)
- Test: `lib/compras/cargaProveedores.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `leerProveedor`, `DatosProveedor`, `clave` (same file, Task 1); `type Hoja` de `lib/ventas/xlsx.ts` (type-only import, no extension, like `lib/ventas/datosBrutos.ts`).
- Produces (from `lib/compras/proveedores.ts`):
  - `ENCABEZADOS: readonly { texto: string; campo: string; obligatorio: boolean }[]` (para mostrarlos en pantalla).
  - `leerCargaProveedores(hoja: Hoja, rfcsExistentes: ReadonlySet<string>): { proveedores: DatosProveedor[]; errores: string[] }`.
  - Constantes de error: `SIN_RENGLONES = "El archivo no trae proveedores (la primera fila son los encabezados)."`, `MAX_PROVEEDORES = 500`.

- [ ] **Step 1: Write the failing test**

`lib/compras/cargaProveedores.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hoja } from "../ventas/xlsx.ts";
import { leerCargaProveedores, SIN_RENGLONES } from "./proveedores.ts";

/** Hoja a partir de filas: la primera son los encabezados. */
function hoja(filas: (string | number | undefined)[][]): Hoja {
  const celdas = new Map<string, string | number>();
  filas.forEach((fila, r) => fila.forEach((v, c) => {
    if (v !== undefined && v !== "") celdas.set(`${String.fromCharCode(65 + c)}${r + 1}`, v);
  }));
  return { nombre: "Proveedores", celdas };
}

const ENC = ["Razón social", "RFC", "Régimen fiscal", "CLABE", "Días de crédito", "Categorías"];

test("lee proveedores con encabezados en cualquier orden, mayúsculas y acentos", () => {
  const r = leerCargaProveedores(hoja([
    ["RFC", "RÉGIMEN FISCAL", "razon social", "Columna rara", "Dias de credito"],
    ["lba-010203-ab1", "601", "Lácteos del Bajío", "x", 30],
    [],
    ["GOMJ800101AB2", "626 - RESICO", "Juan Gómez", "", ""],
  ]), new Set());
  assert.deepEqual(r.errores, []);
  assert.equal(r.proveedores.length, 2);
  assert.equal(r.proveedores[0].rfc, "LBA010203AB1");
  assert.equal(r.proveedores[0].dias_credito, 30);
  assert.equal(r.proveedores[1].regimen_fiscal, "626");
  assert.equal(r.proveedores[1].dias_credito, 0);
});

test("falta un encabezado obligatorio", () => {
  const r = leerCargaProveedores(hoja([["Razón social", "RFC"], ["X", "LBA010203AB1"]]), new Set());
  assert.deepEqual(r.errores, ["Falta la columna \"Régimen fiscal\" en la primera fila."]);
  assert.equal(r.proveedores.length, 0);
});

test("sin renglones de datos", () => {
  assert.deepEqual(leerCargaProveedores(hoja([ENC]), new Set()).errores, [SIN_RENGLONES]);
});

test("errores por renglón: inválido, repetido en el archivo y ya existente; no devuelve ninguno", () => {
  const r = leerCargaProveedores(hoja([
    ENC,
    ["A", "LBA010203AB1", "601"],
    ["B", "lba010203ab1", "601"],
    ["C", "EXI010203AB1", "601"],
    ["D", "MAL", "601"],
  ]), new Set(["EXI010203AB1"]));
  assert.deepEqual(r.errores, [
    "Renglón 3: el RFC LBA010203AB1 está repetido en el archivo (renglón 2).",
    "Renglón 4: el RFC EXI010203AB1 ya está en la cartera.",
    "Renglón 5: El RFC MAL no es válido (12 caracteres para empresa, 13 para persona física).",
  ]);
  assert.equal(r.proveedores.length, 0);
});

test("CLABE que Excel convirtió en número se rechaza pidiendo formato texto", () => {
  const r = leerCargaProveedores(hoja([ENC, ["A", "LBA010203AB1", "601", 32180000118359720]]), new Set());
  assert.deepEqual(r.errores, ["Renglón 2: la CLABE llegó como número y Excel pudo cambiarla; dale formato de texto a esa columna."]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/compras/cargaProveedores.test.ts`
Expected: FAIL — `SyntaxError: The requested module './proveedores.ts' does not provide an export named 'leerCargaProveedores'`.

- [ ] **Step 3: Write minimal implementation**

Add as the first line of `lib/compras/proveedores.ts`:

```ts
import type { Hoja } from "../ventas/xlsx";
```

Append to the end of `lib/compras/proveedores.ts`:

```ts

export const SIN_RENGLONES = "El archivo no trae proveedores (la primera fila son los encabezados).";
export const MAX_PROVEEDORES = 500;

/** Columnas que se reconocen en la primera fila (sin importar mayúsculas, acentos ni orden). */
export const ENCABEZADOS = [
  { texto: "Razón social", campo: "razon_social", obligatorio: true },
  { texto: "Nombre comercial", campo: "nombre_comercial", obligatorio: false },
  { texto: "RFC", campo: "rfc", obligatorio: true },
  { texto: "Régimen fiscal", campo: "regimen_fiscal", obligatorio: true },
  { texto: "Contacto", campo: "contacto_nombre", obligatorio: false },
  { texto: "Teléfono", campo: "telefono", obligatorio: false },
  { texto: "Correo", campo: "correo", obligatorio: false },
  { texto: "Banco", campo: "banco", obligatorio: false },
  { texto: "CLABE", campo: "clabe", obligatorio: false },
  { texto: "Cuenta", campo: "cuenta", obligatorio: false },
  { texto: "Días de crédito", campo: "dias_credito", obligatorio: false },
  { texto: "Forma de pago", campo: "forma_pago_habitual", obligatorio: false },
  { texto: "Categorías", campo: "categorias", obligatorio: false },
  { texto: "Notas", campo: "notas", obligatorio: false },
] as const;

const CAMPO_POR_CLAVE = new Map<string, string>(ENCABEZADOS.map((e) => [clave(e.texto), e.campo]));

/** "AB12" → { columna: "AB", fila: 12 }. */
function partirReferencia(ref: string) {
  const m = /^([A-Z]+)(\d+)$/.exec(ref);
  return m ? { columna: m[1], fila: Number(m[2]) } : null;
}

export function leerCargaProveedores(hoja: Hoja, rfcsExistentes: ReadonlySet<string>): { proveedores: DatosProveedor[]; errores: string[] } {
  const filas = new Map<number, Map<string, string | number>>();
  for (const [ref, valor] of hoja.celdas) {
    const p = partirReferencia(ref);
    if (!p) continue;
    if (!filas.has(p.fila)) filas.set(p.fila, new Map());
    filas.get(p.fila)!.set(p.columna, valor);
  }

  // Encabezados: columna → campo.
  const columnaDe = new Map<string, string>();
  for (const [columna, valor] of filas.get(1) ?? []) {
    const campo = CAMPO_POR_CLAVE.get(clave(String(valor)));
    if (campo && !columnaDe.has(campo)) columnaDe.set(campo, columna);
  }
  const faltan = ENCABEZADOS.filter((e) => e.obligatorio && !columnaDe.has(e.campo));
  if (faltan.length) return { proveedores: [], errores: faltan.map((e) => `Falta la columna "${e.texto}" en la primera fila.`) };

  const numeros = [...filas.keys()].filter((n) => n > 1 && [...filas.get(n)!.values()].some((v) => String(v).trim() !== "")).sort((a, b) => a - b);
  if (!numeros.length) return { proveedores: [], errores: [SIN_RENGLONES] };
  if (numeros.length > MAX_PROVEEDORES) return { proveedores: [], errores: [`El archivo trae más de ${MAX_PROVEEDORES} proveedores; divídelo en varios.`] };

  const proveedores: DatosProveedor[] = [];
  const errores: string[] = [];
  const renglonDeRfc = new Map<string, number>();
  for (const n of numeros) {
    const fila = filas.get(n)!;
    const crudo = (campo: string) => {
      const columna = columnaDe.get(campo);
      return columna === undefined ? undefined : fila.get(columna);
    };
    if (typeof crudo("clabe") === "number") {
      errores.push(`Renglón ${n}: la CLABE llegó como número y Excel pudo cambiarla; dale formato de texto a esa columna.`);
      continue;
    }
    const r = leerProveedor((campo) => String(crudo(campo) ?? ""));
    if ("error" in r) { errores.push(`Renglón ${n}: ${r.error}`); continue; }
    const previo = renglonDeRfc.get(r.datos.rfc);
    if (previo !== undefined) { errores.push(`Renglón ${n}: el RFC ${r.datos.rfc} está repetido en el archivo (renglón ${previo}).`); continue; }
    renglonDeRfc.set(r.datos.rfc, n);
    if (rfcsExistentes.has(r.datos.rfc)) { errores.push(`Renglón ${n}: el RFC ${r.datos.rfc} ya está en la cartera.`); continue; }
    proveedores.push(r.datos);
  }
  return errores.length ? { proveedores: [], errores } : { proveedores, errores };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/compras/cargaProveedores.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add to the suite and commit**

In `package.json`, append ` lib/compras/cargaProveedores.test.ts` to the `test` script.

Run: `npm test`
Expected: all pass.

```bash
git add lib/compras/proveedores.ts lib/compras/cargaProveedores.test.ts package.json
git commit -m "feat(compras): lectura del Excel de proveedores"
```

---

### Task 3: Permisos y menú de Compras

**Files:**
- Modify: `lib/roles.ts`
- Test: `lib/roles.test.ts`

**Interfaces:**
- Produces: `puedeVerCompras(rol: Rol): boolean` (admin, corporativo), `puedeEditarCompras(rol: Rol): boolean` (admin), `enlacesCompras(rol: Rol): Enlace[]`. `enlacesSucursal("admin")` y `enlacesVentas("admin" | "corporativo")` terminan con `{ href: "/compras", texto: "Compras" }`.

- [ ] **Step 1: Write the failing test**

In `lib/roles.test.ts`, add `enlacesCompras, puedeEditarCompras, puedeVerCompras` to the import list, change the existing `menú de ventas por rol` expectations, and add two tests:

```ts
test("menú de ventas por rol", () => {
  assert.deepEqual(enlacesVentas("admin").map((e) => e.href), ["/", "/ventas", "/ventas/importar", "/ventas/costos", "/compras"]);
  assert.deepEqual(enlacesVentas("gerente").map((e) => e.href), ["/", "/ventas"]);
  assert.deepEqual(enlacesVentas("corporativo").map((e) => e.href), ["/corporativo", "/ventas", "/compras"]);
});

test("compras: admin edita, corporativo consulta, sucursal no entra", () => {
  assert.equal(puedeEditarCompras("admin"), true);
  assert.equal(puedeVerCompras("admin"), true);
  assert.equal(puedeVerCompras("corporativo"), true);
  assert.equal(puedeEditarCompras("corporativo"), false);
  for (const rol of ["operacion", "encargado", "gerente"] as const) {
    assert.equal(puedeVerCompras(rol), false);
    assert.equal(puedeEditarCompras(rol), false);
  }
  assert.ok(enlacesSucursal("admin").some((e) => e.href === "/compras"));
  assert.ok(!enlacesSucursal("gerente").some((e) => e.href === "/compras"));
});

test("menú de compras por rol", () => {
  assert.deepEqual(enlacesCompras("admin").map((e) => e.href), ["/", "/compras", "/compras/articulos", "/compras/cargar"]);
  assert.deepEqual(enlacesCompras("corporativo").map((e) => e.href), ["/corporativo", "/compras", "/compras/articulos"]);
  assert.equal(enlaceActivo("/compras/proveedores/abc", enlacesCompras("admin")), "/compras");
  assert.equal(enlaceActivo("/compras/articulos", enlacesCompras("admin")), "/compras/articulos");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/roles.test.ts`
Expected: FAIL — `enlacesCompras` / `puedeVerCompras` not exported (SyntaxError on import).

- [ ] **Step 3: Write minimal implementation**

In `lib/roles.ts`, after `veAvisoSinCosto`:

```ts
/** Compras (proveedores, órdenes, facturas, pagos): oficina central. Admin edita; corporativo consulta. */
export const puedeVerCompras = (rol: Rol) => rol === "admin" || rol === "corporativo";
export const puedeEditarCompras = (rol: Rol) => rol === "admin";
const ENLACE_COMPRAS: Enlace = { href: "/compras", texto: "Compras" };
```

Change `enlacesSucursal` return to end with:

```ts
    ...(puedeVerVentas(rol) ? [{ href: "/ventas", texto: "Ventas" }] : []),
    ...(puedeVerCompras(rol) ? [ENLACE_COMPRAS] : []),
```

Change `enlacesVentas` return to end with:

```ts
    ...(puedeImportarVentas(rol) ? [{ href: "/ventas/importar", texto: "Importar" }, { href: "/ventas/costos", texto: "Costos" }] : []),
    ...(puedeVerCompras(rol) ? [ENLACE_COMPRAS] : []),
```

Add after `enlacesVentas`:

```ts
/** Menú de Compras. */
export function enlacesCompras(rol: Rol): Enlace[] {
  return [
    esCorporativo(rol) ? { href: "/corporativo", texto: "Vista general" } : { href: "/", texto: "Inicio" },
    { href: "/compras", texto: "Proveedores" },
    { href: "/compras/articulos", texto: "Artículos" },
    ...(puedeEditarCompras(rol) ? [{ href: "/compras/cargar", texto: "Cargar Excel" }] : []),
  ];
}
```

Note: `ENLACE_COMPRAS` is referenced inside functions declared later in the file; declare the constant before `enlacesSucursal` (move the three lines above `const ENLACES_SUCURSAL`) so it is initialized when the functions run. `Enlace` type is declared above `ENLACES_SUCURSAL` already — place the new lines right after `export type Enlace = …`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/roles.test.ts`
Expected: PASS (all tests in file).

- [ ] **Step 5: Commit**

Run: `npm test` → all pass.

```bash
git add lib/roles.ts lib/roles.test.ts
git commit -m "feat(compras): permisos y menú de Compras"
```

---

### Task 4: Migración 0011 y su prueba SQL

**Files:**
- Create: `supabase/migrations/0011_compras_proveedores.sql`
- Create: `supabase/pruebas/0011_compras_proveedores.sql`

**Interfaces:**
- Consumes: `mi_rol()`, `perfiles`, `auth.uid()` (0001, 0004).
- Produces (usadas por las tareas 5–7):
  - Tipos: `categoria_compra` (`consumible | activo_fijo | servicio | otro`), `forma_pago` (`transferencia | efectivo | tarjeta | cheque`).
  - Tabla `proveedores(id uuid pk, razon_social, nombre_comercial, rfc unique, regimen_fiscal, contacto_nombre, telefono, correo, banco, clabe, cuenta, dias_credito int, forma_pago_habitual forma_pago, categorias categoria_compra[], notas, activo bool, creado_por, creado_en)`.
  - Tabla `articulos(id uuid pk, nombre, unidad, tipo categoria_compra, tasa_iva text, dodo_insumo_id text unique, activo, creado_por, creado_en)`.
  - Tabla `precios_proveedor(proveedor_id, articulo_id, precio numeric(12,2), fecha date, orden_id uuid, pk(proveedor_id, articulo_id))` — solo lectura en esta fase.
  - Funciones: `ve_compras()`, `edita_compras()`, `clabe_valida(text)`.

This task has no node test; its test is the SQL script, run by Sebastián after the migration. The RED step is conceptual (tables don't exist); write both files, then check syntax by review.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0011_compras_proveedores.sql`:

```sql
-- Compras, fase 1: cartera de proveedores y catálogo de artículos.
-- Oficina central: el admin edita; corporativo consulta. La sucursal no ve este catálogo.
-- Nada se borra: se desactiva (activo = false). Requiere 0001–0010.

create type categoria_compra as enum ('consumible', 'activo_fijo', 'servicio', 'otro');
create type forma_pago as enum ('transferencia', 'efectivo', 'tarjeta', 'cheque');

-- Dígito verificador de Banxico: pesos 3, 7, 1 sobre los primeros 17 dígitos, módulo 10.
create or replace function clabe_valida(p text) returns boolean
language plpgsql immutable as $$
declare t int := 0;
begin
  if p is null or p !~ '^[0-9]{18}$' then return false; end if;
  for i in 1..17 loop
    t := t + (substr(p, i, 1)::int * (array[3, 7, 1])[((i - 1) % 3) + 1]) % 10;
  end loop;
  return (10 - t % 10) % 10 = substr(p, 18, 1)::int;
end $$;

create or replace function ve_compras() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text in ('admin', 'corporativo'), false)
$$;

create or replace function edita_compras() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text = 'admin', false)
$$;

create table proveedores (
  id                   uuid primary key default gen_random_uuid(),
  razon_social         text not null check (trim(razon_social) <> ''),
  nombre_comercial     text,
  rfc                  text not null unique check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  regimen_fiscal       text not null check (regimen_fiscal ~ '^6[0-9]{2}$'),
  contacto_nombre      text,
  telefono             text,
  correo               text check (correo is null or correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  banco                text,
  clabe                text check (clabe is null or clabe_valida(clabe)),
  cuenta               text,
  dias_credito         integer not null default 0 check (dias_credito between 0 and 365),
  forma_pago_habitual  forma_pago not null default 'transferencia',
  categorias           categoria_compra[] not null default '{}',
  notas                text,
  activo               boolean not null default true,
  creado_por           uuid references perfiles(id) default auth.uid(),
  creado_en            timestamptz not null default now()
);

create table articulos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (trim(nombre) <> ''),
  unidad          text not null check (trim(unidad) <> ''),
  tipo            categoria_compra not null,
  tasa_iva        text not null default '16' check (tasa_iva in ('16', '0', 'exento')),
  dodo_insumo_id  text unique,
  activo          boolean not null default true,
  creado_por      uuid references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  check (dodo_insumo_id is null or (tipo = 'consumible' and dodo_insumo_id ~ '^[0-9A-F]{32}$'))
);
create unique index articulos_nombre_unico on articulos (lower(nombre));

-- Último precio (sin IVA) por proveedor y artículo. Se llena al confirmar órdenes (fase 2).
create table precios_proveedor (
  proveedor_id  uuid not null references proveedores(id),
  articulo_id   uuid not null references articulos(id),
  precio        numeric(12,2) not null check (precio >= 0),
  fecha         date not null,
  orden_id      uuid,
  primary key (proveedor_id, articulo_id)
);

alter table proveedores       enable row level security;
alter table articulos         enable row level security;
alter table precios_proveedor enable row level security;

create policy ver_proveedores on proveedores for select using (ve_compras());
create policy alta_proveedor on proveedores for insert with check (edita_compras());
create policy editar_proveedor on proveedores for update using (edita_compras()) with check (edita_compras());

create policy ver_articulos on articulos for select using (ve_compras());
create policy alta_articulo on articulos for insert with check (edita_compras());
create policy editar_articulo on articulos for update using (edita_compras()) with check (edita_compras());

create policy ver_precios_proveedor on precios_proveedor for select using (ve_compras());
-- Sin políticas de borrado: nada se borra. Sin escritura directa en precios_proveedor.
```

- [ ] **Step 2: Write the SQL test**

`supabase/pruebas/0011_compras_proveedores.sql`:

```sql
-- Pruebas de la migración 0011 (Compras: proveedores y artículos). Córrelas completas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos con sucursal; sus puestos cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_prov uuid; v_n int;
  v_ok text[] := '{}';
begin
  select p.id, o.id into v_a, v_b
    from perfiles p join perfiles o on o.id <> p.id and o.activo and o.sucursal_id is not null
   where p.activo and p.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos con sucursal.'; end if;

  if not clabe_valida('032180000118359719') or clabe_valida('012180001234567897') or clabe_valida('123') then
    raise exception 'FALLÓ: clabe_valida';
  end if;
  v_ok := array_append(v_ok, 'CLABE con dígito verificador');

  -- ── Admin: da de alta y edita ─────────────────────────────────────────────
  update perfiles set rol = 'admin' where id = v_a;
  update perfiles set rol = 'gerente' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into proveedores (razon_social, rfc, regimen_fiscal, clabe, dias_credito, categorias)
  values ('Prueba Lácteos SA de CV', 'PLA010203AB1', '601', '032180000118359719', 15, '{consumible}')
  returning id into v_prov;
  update proveedores set dias_credito = 30 where id = v_prov;
  if (select dias_credito from proveedores where id = v_prov) <> 30 then raise exception 'FALLÓ: admin no pudo editar'; end if;

  begin
    insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Otro', 'PLA010203AB1', '601');
    raise exception 'FALLÓ: RFC repetido';
  exception when unique_violation then null; end;
  begin
    insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Otro', 'pla-010203', '601');
    raise exception 'FALLÓ: RFC inválido';
  exception when check_violation then null; end;
  begin
    insert into proveedores (razon_social, rfc, regimen_fiscal, clabe) values ('Otro', 'OTR010203AB1', '601', '012180001234567897');
    raise exception 'FALLÓ: CLABE inválida';
  exception when check_violation then null; end;
  v_ok := array_append(v_ok, 'admin da de alta y edita; RFC único y válido; CLABE válida');

  insert into articulos (nombre, unidad, tipo, dodo_insumo_id) values ('Prueba queso', 'kg', 'consumible', '11F19A2E8EBB9F693A4A16E21FDBFD00');
  begin
    insert into articulos (nombre, unidad, tipo, dodo_insumo_id) values ('Prueba horno', 'pza', 'activo_fijo', '11F19A2E8EBB9F693A4A16E21FDBFD01');
    raise exception 'FALLÓ: ID de Dodo IS en un no consumible';
  exception when check_violation then null; end;
  begin
    insert into articulos (nombre, unidad, tipo) values ('PRUEBA QUESO', 'kg', 'consumible');
    raise exception 'FALLÓ: nombre de artículo repetido';
  exception when unique_violation then null; end;
  v_ok := array_append(v_ok, 'artículos: ID de Dodo IS solo consumibles, nombre único');

  begin
    insert into precios_proveedor (proveedor_id, articulo_id, precio, fecha)
    select v_prov, id, 1, current_date from articulos where nombre = 'Prueba queso';
    raise exception 'FALLÓ: nadie escribe precios_proveedor directo';
  exception when insufficient_privilege then null; end;

  delete from proveedores where id = v_prov;
  if not exists (select 1 from proveedores where id = v_prov) then raise exception 'FALLÓ: un proveedor no se debe poder borrar'; end if;
  v_ok := array_append(v_ok, 'nada se borra; precios solo por el sistema');

  -- ── Corporativo: lee, no escribe ──────────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_a;
  execute 'set local role authenticated';
  select count(*) into v_n from proveedores where id = v_prov;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo debe ver proveedores'; end if;
  begin
    insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Corpo', 'COR010203AB1', '601');
    raise exception 'FALLÓ: corporativo no debe dar de alta';
  exception when insufficient_privilege then null; end;
  update proveedores set dias_credito = 1 where id = v_prov;
  execute 'reset role';
  if (select dias_credito from proveedores where id = v_prov) <> 30 then raise exception 'FALLÓ: corporativo no debe editar'; end if;
  v_ok := array_append(v_ok, 'corporativo consulta y no edita');

  -- ── Gerente de sucursal: no ve el catálogo ────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from proveedores;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no debe ver proveedores'; end if;
  select count(*) into v_n from articulos;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no debe ver artículos'; end if;
  execute 'reset role';
  v_ok := array_append(v_ok, 'la sucursal no ve el catálogo');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 3: Review both files**

Check by reading: every table in the migration has RLS enabled; no `delete` policy; the test covers each policy; the corporativo `update … sucursal_id = null` runs as owner (`reset role` before it) because the constraint `perfiles_corporativo_sin_sucursal` from 0004 requires it.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0011_compras_proveedores.sql supabase/pruebas/0011_compras_proveedores.sql
git commit -m "feat(compras): migración 0011 de proveedores y artículos con su prueba"
```

---

### Task 5: Sección `/compras`: proveedores (lista, ficha, alta y edición)

**Files:**
- Create: `app/compras/layout.tsx`
- Create: `app/compras/error.tsx` (copy of `app/ventas/error.tsx` with "Compras" in the text)
- Create: `app/compras/acciones.ts`
- Create: `app/compras/FormProveedor.tsx`
- Create: `app/compras/page.tsx` (lista de proveedores)
- Create: `app/compras/proveedores/nuevo/page.tsx`
- Create: `app/compras/proveedores/[id]/page.tsx`

**Interfaces:**
- Consumes: `leerProveedor`, `DatosProveedor`, `NOMBRE_CATEGORIA_COMPRA`, `NOMBRE_FORMA_PAGO`, `CATEGORIAS_COMPRA`, `FORMAS_PAGO` (Task 1); `REGIMENES`, `nombreRegimen` (Task 1); `puedeVerCompras`, `puedeEditarCompras`, `enlacesCompras`, `SOLO_CONSULTA` (Task 3); tables from Task 4; `obtenerPerfil` (`lib/contexto.ts`), `Aviso`, `BotonEnviar`, `Nav`.
- Produces: server actions `guardarProveedor(fd: FormData)` and `cambiarActivoProveedor(fd: FormData)` in `app/compras/acciones.ts` (Task 6 adds article actions to the same file); `type Proveedor` row type exported from `app/compras/acciones.ts`? No — define row types locally in each page.

This task is UI over already-tested logic; its verification is `npx tsc --noEmit`, `npm run build` and a visual check.

- [ ] **Step 1: Layout**

`app/compras/layout.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerPerfil } from "@/lib/contexto";
import { enlacesCompras, puedeEditarCompras, puedeVerCompras } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Compras vive fuera de (app): es de oficina central, no de una sucursal. */
export default async function LayoutCompras({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  return (
    <>
      <header className="barra">
        <span className="barra-identidad">
          <img className="barra-logo" src="/logo-dodo.png" alt="Dodo Pizza" width={32} height={32} />
          <span className="barra-marca">Compras</span>
        </span>
        <span className="barra-turno">{puedeEditarCompras(perfil.rol) ? "Oficina central" : "Oficina central · solo lectura"}</span>
        <div className="barra-usuario">
          <span>{perfil.nombre}</span>
          <Link href="/cuenta">Mi contraseña</Link>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <Nav enlaces={enlacesCompras(perfil.rol)} />
      <main className="pagina">{children}</main>
    </>
  );
}
```

- [ ] **Step 2: Actions**

`app/compras/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { leerProveedor } from "@/lib/compras/proveedores";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";

const volver = (ruta: string, clave: "ok" | "error", texto: string): never =>
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}${clave}=${encodeURIComponent(texto)}`);

async function clienteAdmin(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) volver(ruta, "error", SOLO_CONSULTA);
  return supabase;
}

/** Alta (sin id) o edición (con id) de un proveedor. */
export async function guardarProveedor(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = id ? `/compras/proveedores/${id}` : "/compras/proveedores/nuevo";
  const supabase = await clienteAdmin(ruta);
  const r = leerProveedor((c) => (c === "categorias" ? fd.getAll("categorias").join(",") : String(fd.get(c) ?? "")));
  if ("error" in r) volver(ruta, "error", r.error);
  const datos = (r as { datos: import("@/lib/compras/proveedores").DatosProveedor }).datos;

  const { data, error } = id
    ? await supabase.from("proveedores").update(datos).eq("id", id).select("id").single()
    : await supabase.from("proveedores").insert(datos).select("id").single();
  if (error) volver(ruta, "error", error.code === "23505" ? `Ya hay un proveedor con el RFC ${datos.rfc}.` : error.message);

  revalidatePath("/compras", "layout");
  volver(`/compras/proveedores/${data!.id}`, "ok", id ? "Proveedor actualizado." : "Proveedor dado de alta.");
}

export async function cambiarActivoProveedor(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = `/compras/proveedores/${id}`;
  const supabase = await clienteAdmin(ruta);
  const activo = fd.get("activo") === "si";
  const { error } = await supabase.from("proveedores").update({ activo }).eq("id", id);
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", activo ? "Proveedor reactivado." : "Proveedor desactivado. Su historial se conserva.");
}
```

Replace the `(r as …)` cast with a narrowed variable if TypeScript narrows `r` after `volver` (it returns `never`, so `const { datos } = r as { datos: DatosProveedor }` is only needed if narrowing fails; import `type DatosProveedor` at the top instead of the inline `import()` type).

- [ ] **Step 3: Form component**

`app/compras/FormProveedor.tsx` (server component; used for alta and edición):

```tsx
import { BotonEnviar } from "@/components/BotonEnviar";
import { REGIMENES } from "@/lib/compras/proveedores";
import { CATEGORIAS_COMPRA, FORMAS_PAGO, NOMBRE_CATEGORIA_COMPRA, NOMBRE_FORMA_PAGO, type DatosProveedor } from "@/lib/compras/proveedores";
import { guardarProveedor } from "./acciones";

export function FormProveedor({ id, inicial }: { id?: string; inicial?: DatosProveedor }) {
  const v = (c: keyof DatosProveedor) => (inicial?.[c] ?? "") as string;
  const campo = (nombre: keyof DatosProveedor, etiqueta: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="campo">
      <label htmlFor={nombre}>{etiqueta}</label>
      <input id={nombre} name={nombre} defaultValue={v(nombre)} {...extra} />
    </div>
  );
  return (
    <form action={guardarProveedor} className="seccion formulario">
      {id && <input type="hidden" name="id" value={id} />}
      <h2>Datos fiscales</h2>
      <div className="rejilla">
        {campo("razon_social", "Razón social", { required: true })}
        {campo("nombre_comercial", "Nombre comercial")}
        {campo("rfc", "RFC", { required: true, maxLength: 15, autoCapitalize: "characters" })}
        <div className="campo">
          <label htmlFor="regimen_fiscal">Régimen fiscal</label>
          <select id="regimen_fiscal" name="regimen_fiscal" defaultValue={v("regimen_fiscal")} required>
            <option value="" disabled>Elige…</option>
            {Object.entries(REGIMENES).map(([c, n]) => <option key={c} value={c}>{c} · {n}</option>)}
          </select>
        </div>
      </div>
      <h2>Contacto</h2>
      <div className="rejilla">
        {campo("contacto_nombre", "Nombre")}
        {campo("telefono", "Teléfono", { type: "tel" })}
        {campo("correo", "Correo", { type: "email" })}
      </div>
      <h2>Pago</h2>
      <div className="rejilla">
        {campo("banco", "Banco")}
        {campo("clabe", "CLABE", { inputMode: "numeric", maxLength: 18, pattern: "[0-9]{18}" })}
        {campo("cuenta", "Cuenta")}
        {campo("dias_credito", "Días de crédito", { type: "number", min: 0, max: 365, step: 1, defaultValue: String(inicial?.dias_credito ?? 0) })}
        <div className="campo">
          <label htmlFor="forma_pago_habitual">Forma de pago habitual</label>
          <select id="forma_pago_habitual" name="forma_pago_habitual" defaultValue={inicial?.forma_pago_habitual ?? "transferencia"}>
            {FORMAS_PAGO.map((f) => <option key={f} value={f}>{NOMBRE_FORMA_PAGO[f]}</option>)}
          </select>
        </div>
      </div>
      <fieldset className="campo">
        <legend>Qué surte</legend>
        <div className="acciones">
          {CATEGORIAS_COMPRA.map((c) => (
            <label key={c}><input type="checkbox" name="categorias" value={c} defaultChecked={inicial?.categorias.includes(c)} /> {NOMBRE_CATEGORIA_COMPRA[c]}</label>
          ))}
        </div>
      </fieldset>
      <div className="campo">
        <label htmlFor="notas">Notas</label>
        <textarea id="notas" name="notas" defaultValue={v("notas")} rows={3} />
      </div>
      <BotonEnviar>{id ? "Guardar cambios" : "Dar de alta"}</BotonEnviar>
    </form>
  );
}
```

`defaultValue` for `dias_credito` is passed in `extra` and overrides `v(nombre)` because `{...extra}` comes after it.

- [ ] **Step 4: List page**

`app/compras/page.tsx`:

```tsx
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { CATEGORIAS_COMPRA, NOMBRE_CATEGORIA_COMPRA, type CategoriaCompra } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";

type Fila = { id: string; razon_social: string; nombre_comercial: string | null; rfc: string; dias_credito: number; categorias: CategoriaCompra[]; activo: boolean };

export default async function Proveedores({ searchParams }: { searchParams: Promise<{ q?: string; categoria?: string; inactivos?: string; ok?: string; error?: string }> }) {
  const { q = "", categoria, inactivos, ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const filas = await leerTodo<Fila>((desde, hasta) => supabase.from("proveedores")
    .select("id, razon_social, nombre_comercial, rfc, dias_credito, categorias, activo")
    .order("razon_social").order("id").range(desde, hasta).returns<Fila[]>());

  const buscar = q.trim().toLowerCase();
  const filtro = (CATEGORIAS_COMPRA as readonly string[]).includes(categoria ?? "") ? (categoria as CategoriaCompra) : undefined;
  const visibles = filas.filter((p) =>
    (inactivos === "si" || p.activo)
    && (!filtro || p.categorias.includes(filtro))
    && (!buscar || [p.razon_social, p.nombre_comercial ?? "", p.rfc].some((t) => t.toLowerCase().includes(buscar))));

  return (
    <>
      <div className="encabezado">
        <h1>Proveedores</h1>
        <p>La cartera de proveedores de todas las sucursales.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <form className="seccion formulario" role="search">
        <div className="rejilla">
          <div className="campo"><label htmlFor="q">Buscar</label><input id="q" name="q" defaultValue={q} placeholder="Razón social, nombre o RFC" /></div>
          <div className="campo">
            <label htmlFor="categoria">Qué surte</label>
            <select id="categoria" name="categoria" defaultValue={filtro ?? ""}>
              <option value="">Todas</option>
              {CATEGORIAS_COMPRA.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA_COMPRA[c]}</option>)}
            </select>
          </div>
          <label className="campo"><span><input type="checkbox" name="inactivos" value="si" defaultChecked={inactivos === "si"} /> Incluir inactivos</span></label>
        </div>
        <div className="acciones">
          <button className="boton boton-secundario" type="submit">Filtrar</button>
          {puedeEditarCompras(perfil.rol) && <Link className="boton" href="/compras/proveedores/nuevo">Nuevo proveedor</Link>}
        </div>
      </form>

      {!visibles.length && <p className="vacio">{filas.length ? "Ningún proveedor coincide." : "Aún no hay proveedores. Da de alta el primero o cárgalos desde Excel."}</p>}
      <div className="tarjetas">
        {visibles.map((p) => (
          <article key={p.id} className="tarjeta" data-alerta={p.activo ? undefined : "si"}>
            <div className="tarjeta-encabezado">
              <div>
                <h3><Link href={`/compras/proveedores/${p.id}`}>{p.nombre_comercial ?? p.razon_social}</Link></h3>
                <p className="tarjeta-estado">{p.activo ? p.rfc : `${p.rfc} · inactivo`}</p>
              </div>
            </div>
            <dl className="tarjeta-datos">
              {p.nombre_comercial && <><dt>Razón social</dt><dd>{p.razon_social}</dd></>}
              <dt>Crédito</dt><dd>{p.dias_credito ? `${p.dias_credito} días` : "Contado"}</dd>
              <dt>Surte</dt><dd>{p.categorias.length ? p.categorias.map((c) => NOMBRE_CATEGORIA_COMPRA[c]).join(", ") : "Sin categoría"}</dd>
            </dl>
          </article>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 5: New and detail pages**

`app/compras/proveedores/nuevo/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { FormProveedor } from "../../FormProveedor";

export default async function NuevoProveedor({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras");
  return (
    <>
      <div className="encabezado"><h1>Nuevo proveedor</h1><p>El RFC y el régimen fiscal sirven para reconocer sus facturas.</p></div>
      <Aviso error={error} />
      <FormProveedor />
    </>
  );
}
```

`app/compras/proveedores/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { nombreRegimen } from "@/lib/compras/proveedores";
import { NOMBRE_CATEGORIA_COMPRA, NOMBRE_FORMA_PAGO, type DatosProveedor } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { cambiarActivoProveedor } from "../../acciones";
import { FormProveedor } from "../../FormProveedor";

type Proveedor = DatosProveedor & { id: string; activo: boolean };

export default async function FichaProveedor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: p } = await supabase.from("proveedores")
    .select("id, razon_social, nombre_comercial, rfc, regimen_fiscal, contacto_nombre, telefono, correo, banco, clabe, cuenta, dias_credito, forma_pago_habitual, categorias, notas, activo")
    .eq("id", id).maybeSingle<Proveedor>();
  if (!p) notFound();
  const edita = puedeEditarCompras(perfil.rol);

  return (
    <>
      <div className="encabezado">
        <h1>{p.nombre_comercial ?? p.razon_social}</h1>
        <p>{p.rfc}{p.activo ? "" : " · inactivo"}</p>
      </div>
      <Aviso ok={ok} error={error} />
      <section className="seccion">
        <dl className="tarjeta-datos">
          <dt>Razón social</dt><dd>{p.razon_social}</dd>
          <dt>Régimen fiscal</dt><dd>{p.regimen_fiscal} · {nombreRegimen(p.regimen_fiscal)}</dd>
          <dt>Contacto</dt><dd>{[p.contacto_nombre, p.telefono, p.correo].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Banco</dt><dd>{[p.banco, p.clabe && `CLABE ${p.clabe}`, p.cuenta && `Cuenta ${p.cuenta}`].filter(Boolean).join(" · ") || "—"}</dd>
          <dt>Crédito</dt><dd>{p.dias_credito ? `${p.dias_credito} días` : "Contado"} · {NOMBRE_FORMA_PAGO[p.forma_pago_habitual]}</dd>
          <dt>Surte</dt><dd>{p.categorias.map((c) => NOMBRE_CATEGORIA_COMPRA[c]).join(", ") || "Sin categoría"}</dd>
          {p.notas && <><dt>Notas</dt><dd>{p.notas}</dd></>}
        </dl>
      </section>
      {edita && (
        <>
          <details className="seccion">
            <summary>Editar datos</summary>
            <FormProveedor id={p.id} inicial={p} />
          </details>
          <form action={cambiarActivoProveedor} className="acciones">
            <input type="hidden" name="id" value={p.id} />
            <input type="hidden" name="activo" value={p.activo ? "no" : "si"} />
            <BotonEnviar className={p.activo ? "boton boton-alerta" : "boton boton-secundario"}
              confirmar={p.activo ? "¿Desactivar este proveedor? Ya no aparecerá para nuevas compras; su historial se conserva." : undefined}>
              {p.activo ? "Desactivar proveedor" : "Reactivar proveedor"}
            </BotonEnviar>
          </form>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras`, `/compras/proveedores/nuevo`, `/compras/proveedores/[id]`.

Visual check: create `app/login/prueba-proveedor/page.tsx` rendering `<main className="pagina"><FormProveedor /></main>` and a second render with an `inicial` sample; `preview_start {name: "dodo-money"}`; navigate to `/login/prueba-proveedor`; screenshot at desktop and `resize_window {preset: "mobile"}`; confirm no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`). Delete the temp page and `.next`.

- [ ] **Step 7: Commit**

```bash
git add app/compras
git commit -m "feat(compras): lista, ficha, alta y edición de proveedores"
```

---

### Task 6: Artículos

**Files:**
- Modify: `app/compras/acciones.ts` (add `guardarArticulo`, `cambiarActivoArticulo`)
- Create: `app/compras/articulos/page.tsx`

**Interfaces:**
- Consumes: `leerArticulo`, `CATEGORIAS_COMPRA`, `NOMBRE_CATEGORIA_COMPRA`, `TASAS_IVA`, `NOMBRE_TASA_IVA` (Task 1); `clienteAdmin`, `volver` (Task 5, same file); tables `articulos`, `precios_proveedor`, `proveedores` (Task 4); `Plegable`.

- [ ] **Step 1: Actions**

Append to `app/compras/acciones.ts` (add `leerArticulo` to the `@/lib/compras/proveedores` import):

```ts
/** Alta (sin id) o edición (con id) de un artículo; regresa a su tarjeta. */
export async function guardarArticulo(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = "/compras/articulos";
  const supabase = await clienteAdmin(ruta);
  const r = leerArticulo((c) => String(fd.get(c) ?? ""));
  if ("error" in r) volver(ruta, "error", r.error);
  const { datos } = r as { datos: DatosArticulo };
  const { data, error } = id
    ? await supabase.from("articulos").update(datos).eq("id", id).select("id").single()
    : await supabase.from("articulos").insert(datos).select("id").single();
  if (error) {
    volver(ruta, "error", error.code === "23505"
      ? (error.message.includes("dodo_insumo_id") ? "Ese ID de insumo de Dodo IS ya está en otro artículo." : `Ya hay un artículo llamado ${datos.nombre}.`)
      : error.message);
  }
  revalidatePath("/compras", "layout");
  redirect(`${ruta}?ok=${encodeURIComponent(id ? "Artículo actualizado." : "Artículo dado de alta.")}#a-${data!.id}`);
}

export async function cambiarActivoArticulo(fd: FormData) {
  const ruta = "/compras/articulos";
  const supabase = await clienteAdmin(ruta);
  const id = String(fd.get("id") ?? "");
  const activo = fd.get("activo") === "si";
  const { error } = await supabase.from("articulos").update({ activo }).eq("id", id);
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  redirect(`${ruta}?ok=${encodeURIComponent(activo ? "Artículo reactivado." : "Artículo desactivado.")}#a-${id}`);
}
```

Add `type DatosArticulo` to the type import from `@/lib/compras/proveedores`.

- [ ] **Step 2: Page**

`app/compras/articulos/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { CATEGORIAS_COMPRA, NOMBRE_CATEGORIA_COMPRA, NOMBRE_TASA_IVA, TASAS_IVA, type CategoriaCompra, type TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { cambiarActivoArticulo, guardarArticulo } from "../acciones";

type Articulo = { id: string; nombre: string; unidad: string; tipo: CategoriaCompra; tasa_iva: TasaIva; dodo_insumo_id: string | null; activo: boolean };
type Precio = { articulo_id: string; precio: number; fecha: string; proveedores: { razon_social: string; nombre_comercial: string | null } | null };

function CamposArticulo({ a }: { a?: Articulo }) {
  const sufijo = a?.id ?? "nuevo";
  return (
    <div className="rejilla">
      <div className="campo"><label htmlFor={`nombre-${sufijo}`}>Nombre</label><input id={`nombre-${sufijo}`} name="nombre" defaultValue={a?.nombre} required /></div>
      <div className="campo"><label htmlFor={`unidad-${sufijo}`}>Unidad</label><input id={`unidad-${sufijo}`} name="unidad" defaultValue={a?.unidad} placeholder="kg, pza, caja, servicio" required /></div>
      <div className="campo">
        <label htmlFor={`tipo-${sufijo}`}>Tipo</label>
        <select id={`tipo-${sufijo}`} name="tipo" defaultValue={a?.tipo ?? "consumible"}>
          {CATEGORIAS_COMPRA.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA_COMPRA[c]}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`iva-${sufijo}`}>IVA</label>
        <select id={`iva-${sufijo}`} name="tasa_iva" defaultValue={a?.tasa_iva ?? "16"}>
          {TASAS_IVA.map((t) => <option key={t} value={t}>{NOMBRE_TASA_IVA[t]}</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor={`dodo-${sufijo}`}>ID de insumo en Dodo IS</label>
        <input id={`dodo-${sufijo}`} name="dodo_insumo_id" defaultValue={a?.dodo_insumo_id ?? ""} maxLength={32} />
        <small>Solo consumibles. Es la columna ID del reporte Incoming supplies.</small>
      </div>
    </div>
  );
}

export default async function Articulos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCompras(perfil.rol);
  const [articulos, precios] = await Promise.all([
    leerTodo<Articulo>((d, h) => supabase.from("articulos").select("id, nombre, unidad, tipo, tasa_iva, dodo_insumo_id, activo")
      .order("nombre").order("id").range(d, h).returns<Articulo[]>()),
    leerTodo<Precio>((d, h) => supabase.from("precios_proveedor").select("articulo_id, precio, fecha, proveedores(razon_social, nombre_comercial)")
      .order("articulo_id").order("proveedor_id").range(d, h).returns<Precio[]>()),
  ]);
  const preciosDe = new Map<string, Precio[]>();
  for (const p of precios) preciosDe.set(p.articulo_id, [...(preciosDe.get(p.articulo_id) ?? []), p]);

  return (
    <>
      <div className="encabezado">
        <h1>Artículos</h1>
        <p>Lo que se compra, con el último precio de cada proveedor. Los precios se llenan solos al confirmar órdenes de compra.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {edita && (
        <details className="seccion">
          <summary>Nuevo artículo</summary>
          <form action={guardarArticulo} className="formulario">
            <CamposArticulo />
            <BotonEnviar>Dar de alta</BotonEnviar>
          </form>
        </details>
      )}
      {!articulos.length && <p className="vacio">Aún no hay artículos.</p>}
      {CATEGORIAS_COMPRA.map((tipo) => {
        const lista = articulos.filter((a) => a.tipo === tipo);
        if (!lista.length) return null;
        return (
          <Plegable key={tipo} id={`t-${tipo}`} titulo={NOMBRE_CATEGORIA_COMPRA[tipo]} resumen={`${lista.filter((a) => a.activo).length} activos`}>
            <div className="tarjetas">
              {lista.map((a) => {
                const ps = preciosDe.get(a.id) ?? [];
                return (
                  <article key={a.id} id={`a-${a.id}`} className="tarjeta" data-alerta={a.activo ? undefined : "si"}>
                    <div className="tarjeta-encabezado">
                      <div>
                        <h3>{a.nombre}</h3>
                        <p className="tarjeta-estado">{a.unidad} · {NOMBRE_TASA_IVA[a.tasa_iva]}{a.activo ? "" : " · inactivo"}</p>
                      </div>
                    </div>
                    <dl className="tarjeta-datos">
                      {a.dodo_insumo_id && <><dt>Dodo IS</dt><dd>{a.dodo_insumo_id}</dd></>}
                      <dt>Precios</dt>
                      <dd>{ps.length ? ps.map((p, i) => (
                        <span key={i}>{p.proveedores?.nombre_comercial ?? p.proveedores?.razon_social}: {pesos(p.precio)} ({fechaTexto(p.fecha)})</span>
                      )) : "Sin compras todavía"}</dd>
                    </dl>
                    {edita && (
                      <details>
                        <summary>Editar</summary>
                        <form action={guardarArticulo} className="formulario">
                          <input type="hidden" name="id" value={a.id} />
                          <CamposArticulo a={a} />
                          <BotonEnviar>Guardar</BotonEnviar>
                        </form>
                        <form action={cambiarActivoArticulo} className="acciones">
                          <input type="hidden" name="id" value={a.id} />
                          <input type="hidden" name="activo" value={a.activo ? "no" : "si"} />
                          <BotonEnviar className="boton boton-secundario">{a.activo ? "Desactivar" : "Reactivar"}</BotonEnviar>
                        </form>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>
          </Plegable>
        );
      })}
    </>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras/articulos`.

Visual check: temp page `app/login/prueba-articulo/page.tsx` that renders the article card markup with two sample articles (copy `CamposArticulo` usage inside a `<details open>`); desktop and mobile screenshots; no horizontal scroll. Delete the temp page and `.next`.

- [ ] **Step 4: Commit**

```bash
git add app/compras/acciones.ts app/compras/articulos
git commit -m "feat(compras): catálogo de artículos"
```

---

### Task 7: Carga de proveedores desde Excel y README

**Files:**
- Create: `app/compras/cargar/acciones.ts`
- Create: `app/compras/cargar/FormCarga.tsx`
- Create: `app/compras/cargar/page.tsx`
- Modify: `README.md` (nueva sección "Compras")

**Interfaces:**
- Consumes: `leerCargaProveedores`, `ENCABEZADOS` (Task 2); `leerPrimeraHoja`, `NO_ES_XLSX` (`lib/ventas/xlsx.ts`); `puedeEditarCompras`, `SOLO_CONSULTA` (Task 3); table `proveedores` (Task 4).
- Produces: `cargarProveedores(previo: ResultadoCarga | null, fd: FormData): Promise<ResultadoCarga>` with `type ResultadoCarga = { ok?: string; errores?: string[] }`.

- [ ] **Step 1: Action**

`app/compras/cargar/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerCargaProveedores } from "@/lib/compras/proveedores";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { leerPrimeraHoja, NO_ES_XLSX } from "@/lib/ventas/xlsx";

export type ResultadoCarga = { ok?: string; errores?: string[] };

const MAX_BYTES = 5 * 1024 * 1024;

/** Valida todo el archivo; si un renglón falla no se guarda ninguno (un solo insert). */
export async function cargarProveedores(_previo: ResultadoCarga | null, fd: FormData): Promise<ResultadoCarga> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { errores: [SOLO_CONSULTA] };
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { errores: ["Elige el archivo de Excel."] };
  if (archivo.size > MAX_BYTES) return { errores: ["El archivo pesa más de 5 MB."] };

  let hoja;
  try {
    hoja = leerPrimeraHoja(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    return { errores: [NO_ES_XLSX] };
  }

  const { data: existentes, error: errorLectura } = await supabase.from("proveedores").select("rfc").returns<{ rfc: string }[]>();
  if (errorLectura) return { errores: [errorLectura.message] };
  const { proveedores, errores } = leerCargaProveedores(hoja, new Set((existentes ?? []).map((p) => p.rfc)));
  if (errores.length) return { errores };

  const { error } = await supabase.from("proveedores").insert(proveedores);
  if (error) return { errores: [error.code === "23505" ? "Alguien dio de alta uno de estos RFC mientras cargabas; vuelve a intentarlo." : error.message] };
  revalidatePath("/compras", "layout");
  return { ok: `${proveedores.length} proveedores dados de alta.` };
}
```

The `select("rfc")` read has no `.range`: the cartera stays well under 1000 proveedores (ceiling `MAX_PROVEEDORES` = 500 per file); if it ever grows past 1000, switch to `leerTodo` — note it in a code comment above the query.

- [ ] **Step 2: Form and page**

`app/compras/cargar/FormCarga.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cargarProveedores, type ResultadoCarga } from "./acciones";

export function FormCarga() {
  const [resultado, enviar, pendiente] = useActionState<ResultadoCarga | null, FormData>(cargarProveedores, null);
  return (
    <form action={enviar} className="seccion formulario">
      <div className="campo">
        <label htmlFor="archivo">Excel de proveedores</label>
        <input id="archivo" name="archivo" type="file" accept=".xlsx" required />
      </div>
      {resultado?.errores && (
        <div className="aviso aviso-error" role="alert">
          <p>No se guardó ningún proveedor. Corrige esto y vuelve a subir el archivo:</p>
          <ul>{resultado.errores.slice(0, 20).map((e) => <li key={e}>{e}</li>)}</ul>
          {resultado.errores.length > 20 && <p>…y {resultado.errores.length - 20} más.</p>}
        </div>
      )}
      {resultado?.ok && <p className="aviso aviso-ok" role="status">{resultado.ok} <Link href="/compras">Ver proveedores</Link></p>}
      <button className="boton" type="submit" disabled={pendiente}>{pendiente ? "Cargando…" : "Cargar proveedores"}</button>
    </form>
  );
}
```

`app/compras/cargar/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { ENCABEZADOS } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { FormCarga } from "./FormCarga";

export default async function CargarProveedores() {
  const { perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras");
  return (
    <>
      <div className="encabezado">
        <h1>Cargar proveedores desde Excel</h1>
        <p>Primera fila: encabezados. Un proveedor por renglón. Si algún renglón tiene un error, no se guarda ninguno.</p>
      </div>
      <section className="seccion">
        <h2>Columnas</h2>
        <p>Obligatorias: <strong>{ENCABEZADOS.filter((e) => e.obligatorio).map((e) => e.texto).join(", ")}</strong>.</p>
        <p>Opcionales: {ENCABEZADOS.filter((e) => !e.obligatorio).map((e) => e.texto).join(", ")}.</p>
        <p className="saldo-nota">
          Régimen fiscal: la clave del SAT (601, 612, 626…). Categorías: Consumible, Activo fijo, Servicio u Otro, separadas por coma.
          A la columna CLABE dale formato de texto para que Excel no le quite dígitos.
        </p>
      </section>
      <FormCarga />
    </>
  );
}
```

- [ ] **Step 3: README**

Add at the end of `README.md`:

```markdown
## Compras (oficina central)

`/compras` es de oficina central: el **admin** edita y **corporativo** consulta. La sucursal no ve el catálogo.

- **Proveedores**: razón social, RFC (único; reconoce sus facturas), régimen fiscal del SAT, contacto, banco y CLABE (se valida el dígito verificador), días de crédito, forma de pago y qué surte. Nunca se borran: se desactivan.
- **Artículos**: nombre, unidad, tipo (consumible, activo fijo, servicio, otro), IVA y, en consumibles, el ID de insumo de Dodo IS. El último precio por proveedor se llena al confirmar órdenes de compra (fase 2).
- **Cargar Excel**: alta masiva de proveedores; los encabezados se reconocen sin importar mayúsculas, acentos u orden. Si un renglón falla no se guarda ninguno.

Migración `0011_compras_proveedores.sql` y su prueba `supabase/pruebas/0011_compras_proveedores.sql`.
Diseño completo (fases 2–4: órdenes, facturas XML, pagos y calendario): `docs/superpowers/specs/2026-09-30-compras-design.md`.
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run build && npm test`
Expected: all succeed; build lists `/compras/cargar`.

Visual check: temp page `app/login/prueba-carga/page.tsx` rendering the "Columnas" section and `<FormCarga />` (the action will fail against the fake Supabase; only layout is checked). Desktop and mobile screenshots, no horizontal scroll. Delete temp page and `.next`.

- [ ] **Step 5: Commit**

```bash
git add app/compras/cargar README.md
git commit -m "feat(compras): carga de proveedores desde Excel y README"
```

---

## After all tasks

- Final whole-branch review (fresh reviewer, most capable model) against this plan and the spec's section 1.
- Push `feat/compras`; Sebastián runs `0011_compras_proveedores.sql` then `pruebas/0011_compras_proveedores.sql` in Supabase and confirms **PRUEBAS OK**; only then merge to main and copy changed files to `C:\Users\sebcm\Downloads\dodo-control-efectivo_1\dodo-efectivo`.
