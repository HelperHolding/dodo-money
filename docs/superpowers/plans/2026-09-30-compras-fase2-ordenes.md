# Compras fase 2: cotización → orden de compra y recepción — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Documento de compra que avanza de cotización a orden de compra (con cotizaciones alternativas y PDF), y su recepción: consumibles desde el *Incoming supplies* de Dodo IS, ligados solos por ID de insumo; activos fijos, servicios y otros confirmados por el gerente o encargado en la app.

**Architecture:** Migración 0012 con las tablas de órdenes, renglones, historial y recepciones. Todo cambio de estado va por funciones `security definer`; los renglones se editan directo, con un trigger que solo los deja cambiar en cotización. Cálculos (totales, avance, comparación) y lectura del Excel en módulos puros de `lib/compras/` probados con `node --test`. Pantallas server-rendered con server actions: `/compras/ordenes`, `/compras/recepciones` y, en la sucursal, `/recepciones`.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript estricto, Supabase Postgres (RLS, plpgsql, storage), `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-09-30-compras-design.md` — secciones 2 (Cotización → orden de compra) y 3 (Recepción), y "Seguridad". Facturas y pagos (secciones 4–5) quedan fuera.

## Global Constraints

- Repositorio: `C:/Users/sebcm/AppData/Local/Temp/claude/C--Users-sebcm-Downloads-dodo-control-efectivo-1-dodo-efectivo/e60f0e8d-16fc-4407-8eb6-62a8265bd266/scratchpad/dodo-money`, rama `feat/compras-ordenes`. Antes de node: `export PATH="$PATH:/c/Program Files/nodejs"`.
- Módulos de `lib/` importan de otros módulos locales **solo tipos** (`import type`, sin extensión). Los `*.test.ts` importan valores con extensión `.ts`.
- Español de México; montos con `pesos()`; fechas con `fechaTexto()`; "hoy" con `hoyMX()` en TS y `(now() at time zone 'America/Mexico_City')::date` en SQL.
- Tarjetas y plegables; **nada de tablas anchas ni scroll horizontal** (revisar a 375 px). No cambiar colores ni tipografía.
- Nada se borra: órdenes se cancelan o cierran con motivo; recepciones de la app se anulan con motivo. Excepción: renglones de una orden en cotización (borrador/enviada) sí se quitan, y el reimportar un *Incoming supplies* reemplaza los días que trae (son copia del reporte).
- Admin hace todo en Compras; corporativo consulta (`Corporativo solo puede consultar.`); gerente y encargado solo reciben renglones no consumibles de órdenes de su sucursal y no ven precios.
- Pruebas SQL: bloque `do $$ … $$` que termina con `raise exception 'PRUEBAS OK — …'`; las corre Sebastián. No se fusiona a main sin su "PRUEBAS OK".
- Páginas temporales de verificación en `app/login/prueba-*`; se borran antes del commit, junto con `.next`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisiones de este plan (desviaciones del spec, con motivo)

- **Fotos de recepción** van al bucket existente `comprobantes`, ruta `<sucursal>/recepciones/<uuid>.<ext>`, en lugar de un bucket nuevo `compras`: sus políticas ya dejan subir a la propia sucursal y ver al admin. Costo: corporativo no ve esas fotos (igual que hoy con las de caja chica).
- **Cierre automático** (recepción y facturación completas) necesita facturas: llega en la fase 3. Aquí el cierre es manual con motivo.
- **Avance de facturación** se muestra desde la fase 3.
- **Precio 0** se permite en cotización (aún no se sabe); **confirmar** exige precio > 0 en todos los renglones.
- **Una orden sin sucursal** ("Oficina") solo la recibe el admin.

## Review Focus

1. **Doble clic en "Confirmar"** o dos admins a la vez — la segunda llamada debe decir "ya está confirmada", no duplicar precios ni historial (`for update` en `confirmar_orden`).
2. **Unidad distinta entre Dodo IS y la orden** (Dodo IS en kg, la orden en "caja") — la liga compara cantidades crudas; la pantalla debe mostrar la unidad de cada lado para que el admin lo note.
3. **Reimportar el mismo Incoming supplies** — no duplica recepciones (reemplaza por sucursal y día) y vuelve a ligar; las ligas manuales de esos días se pierden y la pantalla lo advierte.
4. **Hoja de otra sucursal o archivo que no es Incoming supplies** — error claro, nada guardado.
5. **Gerente que manda a mano el formulario de recibir** con un renglón de otra sucursal, un consumible o una fecha futura — la función lo rechaza con mensaje claro.

---

### Task 1: Cálculos de órdenes (`lib/compras/ordenes.ts`)

**Files:**
- Create: `lib/compras/ordenes.ts`
- Test: `lib/compras/ordenes.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes: `type TasaIva` de `lib/compras/proveedores.ts` (solo tipo).
- Produces:
  - `ESTADOS_ORDEN`, `type EstadoOrden = "borrador" | "enviada" | "confirmada" | "cerrada" | "cancelada"`, `NOMBRE_ESTADO_ORDEN`.
  - `totalesOrden(renglones: readonly { cantidad: number; precio: number; tasa_iva: TasaIva }[]): { subtotal: number; iva: number; total: number }`.
  - `type Avance = "nada" | "parcial" | "completa"`, `NOMBRE_AVANCE`, `avanceRenglon(cantidad, recibido): Avance`, `recibidoDeMas(cantidad, recibido): boolean`, `avanceOrden(renglones: readonly { cantidad: number; recibido: number }[]): Avance`.
  - `type AccionOrden = "editar" | "enviar" | "confirmar" | "copiar" | "cancelar" | "cerrar"`, `accionesDe(estado: EstadoOrden, hayRecepciones: boolean): AccionOrden[]`.
  - `leerRenglon(valor: (campo: string) => string): { datos: { articulo_id: string; cantidad: number; precio: number } } | { error: string }`.
  - `type Cotizacion = { id: string; renglones: { articulo_id: string; cantidad: number; precio: number; tasa_iva: TasaIva }[] }`, `compararCotizaciones(c: readonly Cotizacion[]): { totales: Map<string, number>; masBarata: string | null; mejorPorArticulo: Map<string, string> }`.

- [ ] **Step 1: Write the failing test**

`lib/compras/ordenes.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { accionesDe, avanceOrden, avanceRenglon, compararCotizaciones, leerRenglon, recibidoDeMas, totalesOrden } from "./ordenes.ts";

test("totales: IVA por renglón redondeado; 0 y exento no llevan IVA", () => {
  assert.deepEqual(totalesOrden([
    { cantidad: 3, precio: 33.33, tasa_iva: "16" },
    { cantidad: 12.5, precio: 68, tasa_iva: "0" },
    { cantidad: 1, precio: 100, tasa_iva: "exento" },
  ]), { subtotal: 1049.99, iva: 16, total: 1065.99 });
  assert.deepEqual(totalesOrden([]), { subtotal: 0, iva: 0, total: 0 });
});

test("avance por renglón y por orden", () => {
  assert.equal(avanceRenglon(10, 0), "nada");
  assert.equal(avanceRenglon(10, 4), "parcial");
  assert.equal(avanceRenglon(10, 10), "completa");
  assert.equal(avanceRenglon(10, 12), "completa");
  assert.equal(recibidoDeMas(10, 12), true);
  assert.equal(recibidoDeMas(10, 10), false);
  assert.equal(avanceOrden([]), "nada");
  assert.equal(avanceOrden([{ cantidad: 1, recibido: 0 }, { cantidad: 2, recibido: 0 }]), "nada");
  assert.equal(avanceOrden([{ cantidad: 1, recibido: 1 }, { cantidad: 2, recibido: 0 }]), "parcial");
  assert.equal(avanceOrden([{ cantidad: 1, recibido: 1 }, { cantidad: 2, recibido: 3 }]), "completa");
});

test("acciones según el estado", () => {
  assert.deepEqual(accionesDe("borrador", false), ["editar", "enviar", "confirmar", "copiar", "cancelar"]);
  assert.deepEqual(accionesDe("enviada", false), ["editar", "confirmar", "copiar", "cancelar"]);
  assert.deepEqual(accionesDe("confirmada", false), ["cancelar", "cerrar"]);
  assert.deepEqual(accionesDe("confirmada", true), ["cerrar"]);
  assert.deepEqual(accionesDe("cerrada", false), []);
  assert.deepEqual(accionesDe("cancelada", false), []);
});

test("renglón: cantidad > 0, precio vacío = 0, comas de miles y signo de pesos", () => {
  const campos = (o: Record<string, string>) => (c: string) => o[c] ?? "";
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "1,500.25", precio: "$ 68.456" })),
    { datos: { articulo_id: "a1", cantidad: 1500.25, precio: 68.46 } });
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "2", precio: "" })), { datos: { articulo_id: "a1", cantidad: 2, precio: 0 } });
  assert.deepEqual(leerRenglon(campos({ cantidad: "2" })), { error: "Elige el artículo." });
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "0" })), { error: "La cantidad debe ser mayor a cero." });
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "dos" })), { error: "La cantidad debe ser mayor a cero." });
  assert.deepEqual(leerRenglon(campos({ articulo_id: "a1", cantidad: "2", precio: "-1" })), { error: "El precio no es válido." });
});

test("comparar cotizaciones: más barata completa y mejor precio por artículo", () => {
  const r = compararCotizaciones([
    { id: "A", renglones: [{ articulo_id: "queso", cantidad: 10, precio: 100, tasa_iva: "0" }, { articulo_id: "caja", cantidad: 100, precio: 5, tasa_iva: "16" }] },
    { id: "B", renglones: [{ articulo_id: "queso", cantidad: 10, precio: 95, tasa_iva: "0" }, { articulo_id: "caja", cantidad: 100, precio: 6, tasa_iva: "16" }] },
    { id: "C", renglones: [{ articulo_id: "queso", cantidad: 10, precio: 90, tasa_iva: "0" }, { articulo_id: "caja", cantidad: 100, precio: 0, tasa_iva: "16" }] },
  ]);
  assert.equal(r.totales.get("A"), 1580);
  assert.equal(r.totales.get("B"), 1646);
  assert.equal(r.masBarata, "A");
  assert.equal(r.mejorPorArticulo.get("queso"), "C");
  assert.equal(r.mejorPorArticulo.get("caja"), "A");
  assert.equal(compararCotizaciones([]).masBarata, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/compras/ordenes.test.ts`
Expected: FAIL — `Cannot find module …/lib/compras/ordenes.ts`.

- [ ] **Step 3: Write minimal implementation**

`lib/compras/ordenes.ts`:

```ts
import type { TasaIva } from "./proveedores";

export const ESTADOS_ORDEN = ["borrador", "enviada", "confirmada", "cerrada", "cancelada"] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];
export const NOMBRE_ESTADO_ORDEN: Record<EstadoOrden, string> = {
  borrador: "Cotización (borrador)", enviada: "Cotización enviada", confirmada: "Orden de compra", cerrada: "Cerrada", cancelada: "Cancelada",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const tasa = (t: TasaIva) => (t === "16" ? 0.16 : 0);

/** Importe e IVA por renglón, redondeados a centavos, como en una factura. */
export function totalesOrden(renglones: readonly { cantidad: number; precio: number; tasa_iva: TasaIva }[]) {
  let subtotal = 0;
  let iva = 0;
  for (const r of renglones) {
    const importe = r2(Number(r.cantidad) * Number(r.precio));
    subtotal += importe;
    iva += r2(importe * tasa(r.tasa_iva));
  }
  return { subtotal: r2(subtotal), iva: r2(iva), total: r2(subtotal + iva) };
}

export type Avance = "nada" | "parcial" | "completa";
export const NOMBRE_AVANCE: Record<Avance, string> = { nada: "Sin recibir", parcial: "Recibida en parte", completa: "Recibida completa" };

const EPS = 1e-9;
export const avanceRenglon = (cantidad: number, recibido: number): Avance =>
  recibido <= EPS ? "nada" : recibido + EPS >= cantidad ? "completa" : "parcial";
export const recibidoDeMas = (cantidad: number, recibido: number) => recibido > cantidad + EPS;

export function avanceOrden(renglones: readonly { cantidad: number; recibido: number }[]): Avance {
  const a = renglones.map((r) => avanceRenglon(Number(r.cantidad), Number(r.recibido)));
  if (!a.length || a.every((x) => x === "nada")) return "nada";
  return a.every((x) => x === "completa") ? "completa" : "parcial";
}

export type AccionOrden = "editar" | "enviar" | "confirmar" | "copiar" | "cancelar" | "cerrar";
/** Lo que el admin puede hacer con la orden en su estado. Con algo recibido ya no se cancela: se cierra. */
export function accionesDe(estado: EstadoOrden, hayRecepciones: boolean): AccionOrden[] {
  if (estado === "borrador") return ["editar", "enviar", "confirmar", "copiar", "cancelar"];
  if (estado === "enviada") return ["editar", "confirmar", "copiar", "cancelar"];
  if (estado === "confirmada") return hayRecepciones ? ["cerrar"] : ["cancelar", "cerrar"];
  return [];
}

/** "1,500.25" o "$ 68.4" → número (las comas son de miles, como en México). */
const numeroDe = (t: string) => (t.trim() === "" ? Number.NaN : Number(t.replace(/[$\s,]/g, "")));

export function leerRenglon(valor: (campo: string) => string): { datos: { articulo_id: string; cantidad: number; precio: number } } | { error: string } {
  const articulo_id = valor("articulo_id").trim();
  if (!articulo_id) return { error: "Elige el artículo." };
  const cantidad = numeroDe(valor("cantidad"));
  if (!(cantidad > 0)) return { error: "La cantidad debe ser mayor a cero." };
  const texto = valor("precio").trim();
  const precio = texto === "" ? 0 : numeroDe(texto);
  if (!(precio >= 0)) return { error: "El precio no es válido." };
  return { datos: { articulo_id, cantidad: Math.round(cantidad * 1000) / 1000, precio: r2(precio) } };
}

export type Cotizacion = { id: string; renglones: { articulo_id: string; cantidad: number; precio: number; tasa_iva: TasaIva }[] };

/** Más barata = menor total entre las que tienen precio en todos sus renglones. Empates: la primera. */
export function compararCotizaciones(cotizaciones: readonly Cotizacion[]) {
  const totales = new Map(cotizaciones.map((c) => [c.id, totalesOrden(c.renglones).total]));
  let masBarata: string | null = null;
  for (const c of cotizaciones) {
    if (!c.renglones.length || c.renglones.some((r) => !(r.precio > 0))) continue;
    if (masBarata === null || totales.get(c.id)! < totales.get(masBarata)!) masBarata = c.id;
  }
  const mejorPrecio = new Map<string, number>();
  const mejorPorArticulo = new Map<string, string>();
  for (const c of cotizaciones) {
    for (const r of c.renglones) {
      if (!(r.precio > 0)) continue;
      if (!mejorPrecio.has(r.articulo_id) || r.precio < mejorPrecio.get(r.articulo_id)!) {
        mejorPrecio.set(r.articulo_id, r.precio);
        mejorPorArticulo.set(r.articulo_id, c.id);
      }
    }
  }
  return { totales, masBarata, mejorPorArticulo };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/compras/ordenes.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add to suite and commit**

In `package.json`, append ` lib/compras/ordenes.test.ts` at the end of the `test` script list.

Run: `npm test` → all pass.

```bash
git add lib/compras/ordenes.ts lib/compras/ordenes.test.ts package.json
git commit -m "feat(compras): cálculos de órdenes de compra"
```

---

### Task 2: Lectura del *Incoming supplies* (`lib/compras/incomingSupplies.ts`)

**Files:**
- Create: `lib/compras/incomingSupplies.ts`
- Create: `lib/compras/__fixtures__/incoming-supplies-2026-09-22.xlsx` (copia de `C:/Users/sebcm/Downloads/Incoming supplies (2026-09-22 - 2026-09-28).xlsx`; no trae datos personales)
- Test: `lib/compras/incomingSupplies.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `type Hoja` de `lib/ventas/xlsx.ts` (solo tipo).
- Produces:
  - `type RecepcionLeida = { sucursal_id: string; dodo_insumo_id: string; material: string; unidad: string; fecha: string; cantidad: number; precio: number }`.
  - `NO_ES_INCOMING = "Este archivo no parece un Incoming supplies de Dodo IS."`.
  - `leerIncomingSupplies(hojas: readonly Hoja[], sucursales: readonly { id: string; nombre: string }[]): { recepciones: RecepcionLeida[]; dias: { sucursal_id: string; fecha: string }[]; errores: string[] }`.

Formato (verificado con el archivo real): hoja "All stores" (se ignora) y una hoja por sucursal con el nombre de la sucursal. Fila con `A = "ID"` y `B = "Materials"` es el encabezado; columnas `C` unidad, `D` precio unitario, y a partir de `H` una columna por día con texto `dd.mm.yyyy`. Filas de datos: `A` = ID de 32 hex; filas de sección ("Ingredient") no tienen ID.

- [ ] **Step 1: Copy the fixture and write the failing test**

```bash
mkdir -p lib/compras/__fixtures__
cp "/c/Users/sebcm/Downloads/Incoming supplies (2026-09-22 - 2026-09-28).xlsx" lib/compras/__fixtures__/incoming-supplies-2026-09-22.xlsx
```

`lib/compras/incomingSupplies.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerHojas, type Hoja } from "../ventas/xlsx.ts";
import { leerIncomingSupplies, NO_ES_INCOMING } from "./incomingSupplies.ts";

const archivo = leerHojas(readFileSync(new URL("./__fixtures__/incoming-supplies-2026-09-22.xlsx", import.meta.url)));
const ZAPOPAN = { id: "suc-1", nombre: "Zapopan-1" };

test("archivo real: una recepción por insumo y día con cantidad", () => {
  const r = leerIncomingSupplies(archivo, [ZAPOPAN]);
  assert.deepEqual(r.errores, []);
  assert.deepEqual(r.recepciones, [
    { sucursal_id: "suc-1", dodo_insumo_id: "11F19E428E07ED76A14AF6DA798EFC40", material: "Gajos de papa", unidad: "kg", fecha: "2026-09-24", cantidad: 13.62, precio: 58.5 },
    { sucursal_id: "suc-1", dodo_insumo_id: "11F19E418E07ED76A14AF6DA8111DB50", material: "Papas francesas", unidad: "kg", fecha: "2026-09-24", cantidad: 10, precio: 46.5 },
    { sucursal_id: "suc-1", dodo_insumo_id: "11F19A2E8EBB9F693A4A16E21FDBFD00", material: "Pollo", unidad: "kg", fecha: "2026-09-24", cantidad: 12, precio: 68 },
    { sucursal_id: "suc-1", dodo_insumo_id: "11F19A748FD4D3A5DE4CA44F145562A0", material: "Salsa BBQ", unidad: "kg", fecha: "2026-09-28", cantidad: 17.2, precio: 46.77 },
  ]);
  assert.equal(r.dias.length, 7);
  assert.deepEqual(r.dias[0], { sucursal_id: "suc-1", fecha: "2026-09-22" });
  assert.deepEqual(r.dias[6], { sucursal_id: "suc-1", fecha: "2026-09-28" });
});

test("hoja de una sucursal que no existe en la app", () => {
  const r = leerIncomingSupplies(archivo, [{ id: "x", nombre: "Guadalajara-2" }]);
  assert.deepEqual(r.errores, ["La hoja \"Zapopan-1\" no corresponde a ninguna sucursal de la app."]);
  assert.deepEqual(r.recepciones, []);
});

test("un archivo que no es Incoming supplies", () => {
  const hoja: Hoja = { nombre: "Hoja1", celdas: new Map([["A1", "Razón social"], ["B1", "RFC"]]) };
  assert.deepEqual(leerIncomingSupplies([hoja], [ZAPOPAN]).errores, [NO_ES_INCOMING]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/compras/incomingSupplies.test.ts`
Expected: FAIL — `Cannot find module …/incomingSupplies.ts`.

- [ ] **Step 3: Write minimal implementation**

`lib/compras/incomingSupplies.ts`:

```ts
import type { Hoja } from "../ventas/xlsx";

export type RecepcionLeida = {
  sucursal_id: string; dodo_insumo_id: string; material: string; unidad: string; fecha: string; cantidad: number; precio: number;
};

export const NO_ES_INCOMING = "Este archivo no parece un Incoming supplies de Dodo IS.";

/** Celdas de una hoja agrupadas por fila y columna. */
function filasDe(hoja: Hoja) {
  const filas = new Map<number, Map<string, string | number>>();
  for (const [ref, valor] of hoja.celdas) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) continue;
    const n = Number(m[2]);
    if (!filas.has(n)) filas.set(n, new Map());
    filas.get(n)!.set(m[1], valor);
  }
  return filas;
}

const texto = (v: string | number | undefined) => String(v ?? "").trim();

/**
 * Una recepción por insumo y día con cantidad. `dias`: todos los días del periodo de cada sucursal
 * (al guardar se reemplazan completos, aunque ese día no haya llegado nada).
 */
export function leerIncomingSupplies(hojas: readonly Hoja[], sucursales: readonly { id: string; nombre: string }[]) {
  const porNombre = new Map(sucursales.map((s) => [s.nombre.trim().toLowerCase(), s.id]));
  const recepciones: RecepcionLeida[] = [];
  const dias: { sucursal_id: string; fecha: string }[] = [];
  const errores: string[] = [];
  let hayTabla = false;

  for (const hoja of hojas) {
    if (hoja.nombre.trim().toLowerCase() === "all stores") continue;
    const filas = filasDe(hoja);
    const numeros = [...filas.keys()].sort((a, b) => a - b);
    const encabezado = numeros.find((n) => texto(filas.get(n)!.get("A")) === "ID" && texto(filas.get(n)!.get("B")) === "Materials");
    if (encabezado === undefined) continue;
    hayTabla = true;

    const sucursal = porNombre.get(hoja.nombre.trim().toLowerCase());
    if (!sucursal) { errores.push(`La hoja "${hoja.nombre.trim()}" no corresponde a ninguna sucursal de la app.`); continue; }

    const columnasDia: [string, string][] = [];
    for (const [columna, valor] of filas.get(encabezado)!) {
      const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(texto(valor));
      if (m) columnasDia.push([columna, `${m[3]}-${m[2]}-${m[1]}`]);
    }
    columnasDia.sort((a, b) => a[1].localeCompare(b[1]));
    for (const [, fecha] of columnasDia) dias.push({ sucursal_id: sucursal, fecha });

    for (const n of numeros.filter((x) => x > encabezado)) {
      const fila = filas.get(n)!;
      const id = texto(fila.get("A")).toUpperCase();
      if (!/^[0-9A-F]{32}$/.test(id)) continue;
      const precio = Number(fila.get("D") ?? 0);
      for (const [columna, fecha] of columnasDia) {
        const cantidad = Number(fila.get(columna) ?? 0);
        if (!(cantidad > 0)) continue;
        recepciones.push({
          sucursal_id: sucursal, dodo_insumo_id: id, material: texto(fila.get("B")), unidad: texto(fila.get("C")),
          fecha, cantidad, precio: Number.isFinite(precio) ? Math.round(precio * 100) / 100 : 0,
        });
      }
    }
  }
  if (!hayTabla) return { recepciones: [], dias: [], errores: [NO_ES_INCOMING] };
  return errores.length ? { recepciones: [], dias: [], errores } : { recepciones, dias, errores };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/compras/incomingSupplies.test.ts`
Expected: PASS, 3 tests. If the order of the 4 recepciones differs, check that rows are iterated by row number and days by date; do not sort recepciones any other way.

- [ ] **Step 5: Add to suite and commit**

Append ` lib/compras/incomingSupplies.test.ts` to the `test` script. Run `npm test` → all pass.

```bash
git add lib/compras/incomingSupplies.ts lib/compras/incomingSupplies.test.ts lib/compras/__fixtures__/incoming-supplies-2026-09-22.xlsx package.json
git commit -m "feat(compras): lectura del Incoming supplies de Dodo IS"
```

---

### Task 3: Permisos y menús

**Files:**
- Modify: `lib/roles.ts`
- Test: `lib/roles.test.ts`

**Interfaces:**
- Produces: `puedeRecibirCompras(rol: Rol): boolean` (encargado, gerente, admin). `enlacesCompras(rol)` = Inicio/Vista general, Proveedores, Artículos, Órdenes (`/compras/ordenes`), Recepciones (`/compras/recepciones`) y, solo admin, Cargar Excel. `enlacesSucursal(rol)` agrega `{ href: "/recepciones", texto: "Recepciones" }` después de Checklists cuando `puedeRecibirCompras`.

- [ ] **Step 1: Write the failing test**

In `lib/roles.test.ts`: add `puedeRecibirCompras` to the import list; replace the body of the test `menú de compras por rol` with:

```ts
test("menú de compras por rol", () => {
  assert.deepEqual(enlacesCompras("admin").map((e) => e.href),
    ["/", "/compras", "/compras/articulos", "/compras/ordenes", "/compras/recepciones", "/compras/cargar"]);
  assert.deepEqual(enlacesCompras("corporativo").map((e) => e.href),
    ["/corporativo", "/compras", "/compras/articulos", "/compras/ordenes", "/compras/recepciones"]);
  assert.equal(enlaceActivo("/compras/proveedores/abc", enlacesCompras("admin")), "/compras");
  assert.equal(enlaceActivo("/compras/ordenes/abc", enlacesCompras("admin")), "/compras/ordenes");
});
```

and add:

```ts
test("recepciones de compras: encargado, gerente y admin reciben; operación y corporativo no", () => {
  for (const rol of ["encargado", "gerente", "admin"] as const) {
    assert.equal(puedeRecibirCompras(rol), true);
    assert.ok(enlacesSucursal(rol).some((e) => e.href === "/recepciones"));
  }
  for (const rol of ["operacion", "corporativo"] as const) {
    assert.equal(puedeRecibirCompras(rol), false);
    assert.ok(!enlacesSucursal(rol).some((e) => e.href === "/recepciones"));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/roles.test.ts`
Expected: FAIL — `does not provide an export named 'puedeRecibirCompras'`.

- [ ] **Step 3: Implement**

In `lib/roles.ts`, after `puedeEditarCompras`:

```ts
/** Confirmar lo recibido de activos fijos, servicios y otros (los consumibles se reciben en Dodo IS). */
export const puedeRecibirCompras = (rol: Rol) => rol === "encargado" || rol === "gerente" || rol === "admin";
```

In `enlacesSucursal`, change the return to:

```ts
  return [
    ...(esCorporativo(rol) ? [{ href: "/corporativo", texto: "Corporativo" }] : []),
    ...ENLACES_SUCURSAL,
    ...(puedeRecibirCompras(rol) ? [{ href: "/recepciones", texto: "Recepciones" }] : []),
    ...(puedeVerVentas(rol) ? [{ href: "/ventas", texto: "Ventas" }] : []),
    ...(puedeVerCompras(rol) ? [ENLACE_COMPRAS] : []),
  ];
```

In `enlacesCompras`, change the list to:

```ts
  return [
    esCorporativo(rol) ? { href: "/corporativo", texto: "Vista general" } : { href: "/", texto: "Inicio" },
    { href: "/compras", texto: "Proveedores" },
    { href: "/compras/articulos", texto: "Artículos" },
    { href: "/compras/ordenes", texto: "Órdenes" },
    { href: "/compras/recepciones", texto: "Recepciones" },
    ...(puedeEditarCompras(rol) ? [{ href: "/compras/cargar", texto: "Cargar Excel" }] : []),
  ];
```

`puedeRecibirCompras` is declared after `ENLACE_COMPRAS` and before `ENLACES_SUCURSAL` — both are `const` arrow functions used only inside functions called later, so order is safe as long as it is above `enlacesSucursal`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/roles.test.ts` → PASS. Run `npm test` → all pass.

- [ ] **Step 5: Commit**

```bash
git add lib/roles.ts lib/roles.test.ts
git commit -m "feat(compras): permisos y menús de órdenes y recepciones"
```

---

### Task 4: Migración 0012 y su prueba SQL

**Files:**
- Create: `supabase/migrations/0012_compras_ordenes.sql`
- Create: `supabase/pruebas/0012_compras_ordenes.sql`

**Interfaces:**
- Consumes: `mi_rol()`, `mi_sucursal()`, `ve_compras()`, `edita_compras()`, tablas `proveedores`, `articulos`, `precios_proveedor`, `sucursales`, `perfiles`.
- Produces (usadas por las tareas 5–8):
  - Tipo `estado_orden`.
  - Tablas `ordenes_compra(id, folio, proveedor_id, sucursal_id, estado, grupo_id, notas, motivo, creado_por, creado_en, confirmada_por, confirmada_en, cerrada_por, cerrada_en, cancelada_por, cancelada_en)`, `orden_renglones(id, orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva, creado_en)`, `orden_historial(id, orden_id, evento, nota, usuario, en)`, `importaciones_recepciones(id, archivo, renglones, importado_por, importado_en)`, `recepciones_dodo(id, sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id, orden_renglon_id, clasificacion)`, `recepciones_app(id, orden_renglon_id, cantidad, fecha, foto_path, recibido_por, recibido_en, anulada_por, anulada_en, motivo_anulacion)`.
  - Vista `renglones_recibido` = columnas de `orden_renglones` + `recibido numeric`.
  - Funciones: `recibido_renglon(uuid) → numeric`, `editar_orden(p_id uuid, p_proveedor uuid, p_sucursal uuid, p_notas text)`, `enviar_orden(p_id uuid)`, `confirmar_orden(p_id uuid)`, `cancelar_orden(p_id uuid, p_motivo text)`, `cerrar_orden(p_id uuid, p_motivo text)`, `copiar_orden(p_id uuid, p_proveedor uuid) → uuid`, `importar_recepciones_dodo(p_archivo text, p_dias jsonb, p_filas jsonb) → jsonb {recepciones, ligadas, pendientes}`, `ligar_recepciones_dodo()`, `clasificar_recepcion(p_id uuid, p_clasificacion text, p_renglon uuid)`, `recibir_renglon(p_renglon uuid, p_cantidad numeric, p_fecha date, p_foto text) → uuid`, `anular_recepcion(p_id uuid, p_motivo text)`, `ordenes_por_recibir() → table(orden_id, folio, proveedor, confirmada_en, renglon_id, descripcion, unidad, tipo, cantidad, recibido)`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0012_compras_ordenes.sql`:

```sql
-- Compras, fase 2: cotización → orden de compra, y su recepción.
-- Un solo documento avanza: borrador → enviada → confirmada (orden de compra) → cerrada; o cancelada.
-- Los cambios de estado van por funciones; los renglones solo cambian mientras la orden es cotización.
-- Recepción: consumibles desde el Incoming supplies de Dodo IS (ligados por ID de insumo);
-- activos fijos, servicios y otros los confirma el gerente o encargado en la app.
-- Nada se borra salvo renglones en cotización y días reimportados del Incoming supplies. Requiere 0001–0011.

create type estado_orden as enum ('borrador', 'enviada', 'confirmada', 'cerrada', 'cancelada');

create sequence ordenes_compra_folio;
grant usage on sequence ordenes_compra_folio to authenticated;

create table ordenes_compra (
  id              uuid primary key default gen_random_uuid(),
  folio           text not null unique default 'OC-' || lpad(nextval('ordenes_compra_folio')::text, 4, '0'),
  proveedor_id    uuid not null references proveedores(id),
  sucursal_id     uuid references sucursales(id),          -- null = Oficina
  estado          estado_orden not null default 'borrador',
  grupo_id        uuid not null default gen_random_uuid(),  -- cotizaciones alternativas comparten grupo
  notas           text,
  motivo          text,                                     -- de cierre o cancelación
  creado_por      uuid references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  confirmada_por  uuid references perfiles(id),
  confirmada_en   timestamptz,
  cerrada_por     uuid references perfiles(id),
  cerrada_en      timestamptz,
  cancelada_por   uuid references perfiles(id),
  cancelada_en    timestamptz
);
create index ordenes_compra_grupo on ordenes_compra (grupo_id);

create table orden_renglones (
  id           uuid primary key default gen_random_uuid(),
  orden_id     uuid not null references ordenes_compra(id),
  articulo_id  uuid not null references articulos(id),
  descripcion  text not null check (trim(descripcion) <> ''),
  cantidad     numeric(12,3) not null check (cantidad > 0),
  precio       numeric(12,2) not null default 0 check (precio >= 0),  -- sin IVA; 0 = aún sin precio
  tasa_iva     text not null check (tasa_iva in ('16', '0', 'exento')),
  creado_en    timestamptz not null default now()
);
create index orden_renglones_orden on orden_renglones (orden_id);

create table orden_historial (
  id        bigserial primary key,
  orden_id  uuid not null references ordenes_compra(id),
  evento    text not null,
  nota      text,
  usuario   uuid references perfiles(id) default auth.uid(),
  en        timestamptz not null default now()
);
create index orden_historial_orden on orden_historial (orden_id);

alter table precios_proveedor add constraint precios_proveedor_orden foreign key (orden_id) references ordenes_compra(id);

create table importaciones_recepciones (
  id             uuid primary key default gen_random_uuid(),
  archivo        text not null,
  renglones      integer not null,
  importado_por  uuid references perfiles(id) default auth.uid(),
  importado_en   timestamptz not null default now()
);

create table recepciones_dodo (
  id                uuid primary key default gen_random_uuid(),
  sucursal_id       uuid not null references sucursales(id),
  dodo_insumo_id    text not null,
  material          text not null,
  unidad            text not null,
  fecha             date not null,
  cantidad          numeric(12,3) not null check (cantidad > 0),
  precio            numeric(12,2) not null default 0,
  importacion_id    uuid not null references importaciones_recepciones(id),
  orden_renglon_id  uuid references orden_renglones(id),
  clasificacion     text not null default 'pendiente' check (clasificacion in ('pendiente', 'orden', 'sin_orden', 'traspaso')),
  unique (sucursal_id, dodo_insumo_id, fecha),
  check ((clasificacion = 'orden') = (orden_renglon_id is not null))
);
create index recepciones_dodo_renglon on recepciones_dodo (orden_renglon_id);

create table recepciones_app (
  id                uuid primary key default gen_random_uuid(),
  orden_renglon_id  uuid not null references orden_renglones(id),
  cantidad          numeric(12,3) not null check (cantidad > 0),
  fecha             date not null,
  foto_path         text,
  recibido_por      uuid references perfiles(id) default auth.uid(),
  recibido_en       timestamptz not null default now(),
  anulada_por       uuid references perfiles(id),
  anulada_en        timestamptz,
  motivo_anulacion  text,
  check (anulada_en is null or coalesce(trim(motivo_anulacion), '') <> '')
);
create index recepciones_app_renglon on recepciones_app (orden_renglon_id);

-- ─── Ayudas ─────────────────────────────────────────────────────────────────
create or replace function hoy_mx() returns date
language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;

create or replace function exigir_admin_compras() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  if not edita_compras() then raise exception 'Solo un administrador maneja compras.'; end if;
end $$;

-- Recibido de un renglón: lo ligado de Dodo IS más lo confirmado en la app (sin anuladas).
create or replace function recibido_renglon(p_renglon uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cantidad) from recepciones_dodo where orden_renglon_id = p_renglon), 0)
       + coalesce((select sum(cantidad) from recepciones_app where orden_renglon_id = p_renglon and anulada_en is null), 0)
$$;

create view renglones_recibido with (security_invoker = true) as
select r.*, recibido_renglon(r.id) as recibido from orden_renglones r;

create or replace function hay_recepciones(p_orden uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orden_renglones r where r.orden_id = p_orden and recibido_renglon(r.id) > 0)
$$;

-- ─── Historial y candados ───────────────────────────────────────────────────
create or replace function orden_creada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into orden_historial (orden_id, evento) values (new.id, 'creada');
  return new;
end $$;
create trigger ordenes_compra_creada after insert on ordenes_compra
  for each row execute function orden_creada();

create or replace function renglones_editables() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_estado estado_orden;
begin
  if tg_op = 'UPDATE' and new.orden_id <> old.orden_id then raise exception 'Un renglón no cambia de orden.'; end if;
  select estado into v_estado from ordenes_compra where id = coalesce(new.orden_id, old.orden_id);
  if v_estado not in ('borrador', 'enviada') then
    raise exception 'La orden ya no es cotización: sus renglones no cambian.';
  end if;
  return coalesce(new, old);
end $$;
create trigger orden_renglones_editables before insert or update or delete on orden_renglones
  for each row execute function renglones_editables();

-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table ordenes_compra            enable row level security;
alter table orden_renglones           enable row level security;
alter table orden_historial           enable row level security;
alter table importaciones_recepciones enable row level security;
alter table recepciones_dodo          enable row level security;
alter table recepciones_app           enable row level security;

create policy ver_ordenes on ordenes_compra for select using (ve_compras());
create policy alta_orden on ordenes_compra for insert with check (edita_compras() and estado = 'borrador');
create policy ver_renglones on orden_renglones for select using (ve_compras());
create policy alta_renglon on orden_renglones for insert with check (edita_compras());
create policy editar_renglon on orden_renglones for update using (edita_compras()) with check (edita_compras());
create policy quitar_renglon on orden_renglones for delete using (edita_compras());
create policy ver_historial on orden_historial for select using (ve_compras());
create policy ver_importaciones_recepciones on importaciones_recepciones for select using (ve_compras());
create policy ver_recepciones_dodo on recepciones_dodo for select using (ve_compras());
create policy ver_recepciones_app on recepciones_app for select using (ve_compras());
-- Sin update/delete directos en órdenes, historial ni recepciones: todo por las funciones de abajo.

-- ─── Órdenes ────────────────────────────────────────────────────────────────
create or replace function editar_orden(p_id uuid, p_proveedor uuid, p_sucursal uuid, p_notas text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada') then raise exception 'La orden % ya no es cotización', o.folio; end if;
  if not coalesce((select activo from proveedores where id = p_proveedor), false) then raise exception 'Elige un proveedor activo'; end if;
  update ordenes_compra set proveedor_id = p_proveedor, sucursal_id = p_sucursal, notas = nullif(trim(p_notas), '') where id = p_id;
  insert into orden_historial (orden_id, evento) values (p_id, 'editada');
end $$;

create or replace function enviar_orden(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado <> 'borrador' then raise exception 'La orden % ya está %', o.folio, o.estado; end if;
  if not exists (select 1 from orden_renglones where orden_id = p_id) then raise exception 'La cotización no tiene renglones'; end if;
  update ordenes_compra set estado = 'enviada' where id = p_id;
  insert into orden_historial (orden_id, evento) values (p_id, 'enviada');
end $$;

create or replace function confirmar_orden(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada') then raise exception 'La orden % ya está %', o.folio, o.estado; end if;
  if not exists (select 1 from orden_renglones where orden_id = p_id) then raise exception 'La orden no tiene renglones'; end if;
  if exists (select 1 from orden_renglones where orden_id = p_id and precio <= 0) then raise exception 'Hay renglones sin precio'; end if;
  if not (select activo from proveedores where id = o.proveedor_id) then raise exception 'El proveedor está desactivado'; end if;
  if exists (select 1 from orden_renglones r join articulos a on a.id = r.articulo_id where r.orden_id = p_id and not a.activo) then
    raise exception 'Hay artículos desactivados en la orden';
  end if;

  update ordenes_compra set estado = 'confirmada', confirmada_por = auth.uid(), confirmada_en = now() where id = p_id;
  insert into orden_historial (orden_id, evento) values (p_id, 'confirmada');

  insert into precios_proveedor (proveedor_id, articulo_id, precio, fecha, orden_id)
  select distinct on (articulo_id) o.proveedor_id, articulo_id, precio, hoy_mx(), p_id
    from orden_renglones where orden_id = p_id order by articulo_id, creado_en desc
  on conflict (proveedor_id, articulo_id) do update set precio = excluded.precio, fecha = excluded.fecha, orden_id = excluded.orden_id;

  with canceladas as (
    update ordenes_compra
       set estado = 'cancelada', cancelada_por = auth.uid(), cancelada_en = now(), motivo = 'Se eligió ' || o.folio
     where grupo_id = o.grupo_id and id <> p_id and estado in ('borrador', 'enviada')
    returning id
  )
  insert into orden_historial (orden_id, evento, nota) select id, 'cancelada', 'Se eligió ' || o.folio from canceladas;

  perform ligar_recepciones_dodo();
end $$;

create or replace function cancelar_orden(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la cancelación'; end if;
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada', 'confirmada') then raise exception 'La orden % ya está %', o.folio, o.estado; end if;
  if hay_recepciones(p_id) then raise exception 'Ya se recibió algo de la orden %: ciérrala en lugar de cancelarla', o.folio; end if;
  update ordenes_compra set estado = 'cancelada', cancelada_por = auth.uid(), cancelada_en = now(), motivo = trim(p_motivo) where id = p_id;
  insert into orden_historial (orden_id, evento, nota) values (p_id, 'cancelada', trim(p_motivo));
end $$;

create or replace function cerrar_orden(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo del cierre'; end if;
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado <> 'confirmada' then raise exception 'Solo se cierra una orden confirmada (la % está %)', o.folio, o.estado; end if;
  update ordenes_compra set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_en = now(), motivo = trim(p_motivo) where id = p_id;
  insert into orden_historial (orden_id, evento, nota) values (p_id, 'cerrada', trim(p_motivo));
end $$;

-- "Pedir a otro proveedor": misma sucursal y renglones, mismo grupo; precio = último de ese proveedor o 0.
create or replace function copiar_orden(p_id uuid, p_proveedor uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra; v_nueva uuid;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada') then raise exception 'Solo se copia una cotización'; end if;
  if p_proveedor = o.proveedor_id then raise exception 'Esa cotización ya es de ese proveedor'; end if;
  if not coalesce((select activo from proveedores where id = p_proveedor), false) then raise exception 'Elige un proveedor activo'; end if;
  insert into ordenes_compra (proveedor_id, sucursal_id, grupo_id, notas) values (p_proveedor, o.sucursal_id, o.grupo_id, o.notas)
  returning id into v_nueva;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva)
  select v_nueva, r.articulo_id, r.descripcion, r.cantidad,
         coalesce((select pp.precio from precios_proveedor pp where pp.proveedor_id = p_proveedor and pp.articulo_id = r.articulo_id), 0),
         r.tasa_iva
    from orden_renglones r where r.orden_id = p_id order by r.creado_en, r.id;
  insert into orden_historial (orden_id, evento, nota) values (v_nueva, 'copiada', 'Alternativa de ' || o.folio);
  return v_nueva;
end $$;

-- ─── Recepciones desde Dodo IS ──────────────────────────────────────────────
-- Liga cada recepción pendiente al renglón de una orden confirmada de la misma sucursal y el mismo insumo,
-- recibida entre la confirmación y 7 días después, con cantidad pendiente; la orden más antigua primero.
create or replace function ligar_recepciones_dodo() returns void
language plpgsql security definer set search_path = public as $$
declare rec record; v_renglon uuid;
begin
  for rec in select * from recepciones_dodo where clasificacion = 'pendiente' order by fecha, id loop
    select r.id into v_renglon
      from orden_renglones r
      join ordenes_compra o on o.id = r.orden_id
      join articulos a on a.id = r.articulo_id
     where o.estado = 'confirmada' and o.sucursal_id = rec.sucursal_id and a.dodo_insumo_id = rec.dodo_insumo_id
       and rec.fecha between (o.confirmada_en at time zone 'America/Mexico_City')::date
                         and (o.confirmada_en at time zone 'America/Mexico_City')::date + 7
       and r.cantidad > recibido_renglon(r.id)
     order by o.confirmada_en, r.creado_en, r.id
     limit 1;
    if v_renglon is not null then
      update recepciones_dodo set orden_renglon_id = v_renglon, clasificacion = 'orden' where id = rec.id;
    end if;
  end loop;
end $$;

-- p_dias: [{sucursal_id, fecha}] que se reemplazan completos; p_filas: [{sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio}].
create or replace function importar_recepciones_dodo(p_archivo text, p_dias jsonb, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_imp uuid; v_ligadas int; v_pendientes int;
begin
  perform exigir_admin_compras();
  insert into importaciones_recepciones (archivo, renglones) values (p_archivo, jsonb_array_length(p_filas)) returning id into v_imp;
  delete from recepciones_dodo r
   using jsonb_to_recordset(p_dias) d(sucursal_id uuid, fecha date)
   where r.sucursal_id = d.sucursal_id and r.fecha = d.fecha;
  insert into recepciones_dodo (sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id)
  select f.sucursal_id, upper(f.dodo_insumo_id), f.material, f.unidad, f.fecha, f.cantidad, coalesce(f.precio, 0), v_imp
    from jsonb_to_recordset(p_filas) f(sucursal_id uuid, dodo_insumo_id text, material text, unidad text, fecha date, cantidad numeric, precio numeric);
  perform ligar_recepciones_dodo();
  select count(*) filter (where clasificacion = 'orden'), count(*) filter (where clasificacion = 'pendiente')
    into v_ligadas, v_pendientes
    from recepciones_dodo where importacion_id = v_imp;
  return jsonb_build_object('recepciones', jsonb_array_length(p_filas), 'ligadas', v_ligadas, 'pendientes', v_pendientes);
end $$;

-- Revisión manual: ligar a un renglón (misma sucursal; si el artículo tiene ID de Dodo IS, debe coincidir),
-- o marcar sin orden / traspaso, o regresar a pendiente.
create or replace function clasificar_recepcion(p_id uuid, p_clasificacion text, p_renglon uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rec recepciones_dodo; v_suc uuid; v_estado estado_orden; v_insumo text;
begin
  perform exigir_admin_compras();
  select * into rec from recepciones_dodo where id = p_id for update;
  if not found then raise exception 'Recepción no encontrada'; end if;
  if p_clasificacion = 'orden' then
    select o.sucursal_id, o.estado, a.dodo_insumo_id into v_suc, v_estado, v_insumo
      from orden_renglones r join ordenes_compra o on o.id = r.orden_id join articulos a on a.id = r.articulo_id
     where r.id = p_renglon;
    if not found then raise exception 'Elige el renglón de una orden'; end if;
    if v_estado not in ('confirmada', 'cerrada') then raise exception 'La orden no está confirmada'; end if;
    if v_suc is distinct from rec.sucursal_id then raise exception 'La orden es de otra sucursal'; end if;
    if v_insumo is not null and v_insumo <> rec.dodo_insumo_id then raise exception 'El artículo de ese renglón es otro insumo de Dodo IS'; end if;
    update recepciones_dodo set orden_renglon_id = p_renglon, clasificacion = 'orden' where id = p_id;
  elsif p_clasificacion in ('sin_orden', 'traspaso', 'pendiente') then
    update recepciones_dodo set orden_renglon_id = null, clasificacion = p_clasificacion where id = p_id;
  else
    raise exception 'Clasificación no válida';
  end if;
end $$;

-- ─── Recepciones en la app (activos fijos, servicios y otros) ───────────────
create or replace function recibir_renglon(p_renglon uuid, p_cantidad numeric, p_fecha date, p_foto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra; v_tipo categoria_compra; v_id uuid;
begin
  if mi_rol()::text not in ('encargado', 'gerente', 'admin') then
    raise exception 'Solo encargado, gerente o administrador reciben compras.';
  end if;
  select oc.* into o from ordenes_compra oc join orden_renglones r on r.orden_id = oc.id where r.id = p_renglon;
  if not found then raise exception 'Renglón no encontrado'; end if;
  if o.estado <> 'confirmada' then raise exception 'La orden % no está confirmada', o.folio; end if;
  if mi_rol()::text <> 'admin' and o.sucursal_id is distinct from mi_sucursal() then raise exception 'La orden % es de otra sucursal', o.folio; end if;
  select a.tipo into v_tipo from orden_renglones r join articulos a on a.id = r.articulo_id where r.id = p_renglon;
  if v_tipo = 'consumible' then raise exception 'Los consumibles se reciben en Dodo IS'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  if p_fecha is null or p_fecha > hoy_mx() then raise exception 'La fecha de recepción no puede ser futura'; end if;
  if p_foto is not null and (o.sucursal_id is null or p_foto not like o.sucursal_id::text || '/%') then
    raise exception 'La foto no es de esta sucursal';
  end if;
  insert into recepciones_app (orden_renglon_id, cantidad, fecha, foto_path) values (p_renglon, p_cantidad, p_fecha, p_foto)
  returning id into v_id;
  insert into orden_historial (orden_id, evento, nota)
  select o.id, 'recibido', r.descripcion || ': ' || p_cantidad from orden_renglones r where r.id = p_renglon;
  return v_id;
end $$;

create or replace function anular_recepcion(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_orden uuid;
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la anulación'; end if;
  update recepciones_app set anulada_por = auth.uid(), anulada_en = now(), motivo_anulacion = trim(p_motivo)
   where id = p_id and anulada_en is null;
  if not found then raise exception 'La recepción no existe o ya estaba anulada'; end if;
  select r.orden_id into v_orden from recepciones_app ra join orden_renglones r on r.id = ra.orden_renglon_id where ra.id = p_id;
  insert into orden_historial (orden_id, evento, nota) values (v_orden, 'recepción anulada', trim(p_motivo));
end $$;

-- Lo que la sucursal tiene por recibir, sin precios: gerente, encargado y admin; solo su sucursal
-- (el admin también las de Oficina). Solo no consumibles.
create or replace function ordenes_por_recibir()
returns table (orden_id uuid, folio text, proveedor text, confirmada_en timestamptz, renglon_id uuid,
               descripcion text, unidad text, tipo categoria_compra, cantidad numeric, recibido numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.folio, coalesce(p.nombre_comercial, p.razon_social), o.confirmada_en, r.id,
         r.descripcion, a.unidad, a.tipo, r.cantidad, recibido_renglon(r.id)
    from ordenes_compra o
    join proveedores p on p.id = o.proveedor_id
    join orden_renglones r on r.orden_id = o.id
    join articulos a on a.id = r.articulo_id
   where o.estado = 'confirmada' and a.tipo <> 'consumible'
     and mi_rol()::text in ('encargado', 'gerente', 'admin')
     and (o.sucursal_id = mi_sucursal() or (mi_rol()::text = 'admin' and o.sucursal_id is null))
   order by o.confirmada_en, o.folio, r.creado_en, r.id
$$;
```

- [ ] **Step 2: Write the SQL test**

`supabase/pruebas/0012_compras_ordenes.sql`:

```sql
-- Pruebas de la migración 0012 (Compras: órdenes y recepción). Córrelas completas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos de la misma sucursal; sus puestos cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc uuid; v_prov uuid; v_prov2 uuid; v_cons uuid; v_fijo uuid;
  v_oc uuid; v_oc2 uuid; v_r_cons uuid; v_r_fijo uuid; v_recep uuid; v_n int; v_res jsonb;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_insumo text := 'ABCDEF0123456789ABCDEF0123456789';
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  update perfiles set rol = 'admin' where id = v_a;
  update perfiles set rol = 'gerente' where id = v_b;

  -- ── Admin: cotización → orden ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba OC Uno', 'POU010203AB1', '601') returning id into v_prov;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba OC Dos', 'POD010203AB1', '601') returning id into v_prov2;
  insert into articulos (nombre, unidad, tipo, tasa_iva, dodo_insumo_id) values ('Prueba OC queso', 'kg', 'consumible', '0', v_insumo) returning id into v_cons;
  insert into articulos (nombre, unidad, tipo) values ('Prueba OC horno', 'pza', 'activo_fijo') returning id into v_fijo;

  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_oc;
  if (select folio from ordenes_compra where id = v_oc) !~ '^OC-[0-9]{4,}$' then raise exception 'FALLÓ: folio OC-0000'; end if;
  begin
    insert into ordenes_compra (proveedor_id, sucursal_id, estado) values (v_prov, v_suc, 'confirmada');
    raise exception 'FALLÓ: una orden nace en borrador';
  exception when insufficient_privilege then null; end;

  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_cons, 'Queso', 10, 100, '0') returning id into v_r_cons;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_fijo, 'Horno', 1, 0, '16') returning id into v_r_fijo;
  begin
    perform confirmar_orden(v_oc);
    raise exception 'FALLÓ: confirmar con un renglón sin precio';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%sin precio%' then raise exception 'FALLÓ: mensaje inesperado (sin precio): %', sqlerrm; end if;
  end;
  update orden_renglones set precio = 5000 where id = v_r_fijo;
  perform enviar_orden(v_oc);
  v_oc2 := copiar_orden(v_oc, v_prov2);
  if (select grupo_id from ordenes_compra where id = v_oc2) <> (select grupo_id from ordenes_compra where id = v_oc) then raise exception 'FALLÓ: la alternativa va en el mismo grupo'; end if;
  if (select count(*) from orden_renglones where orden_id = v_oc2) <> 2 then raise exception 'FALLÓ: la alternativa copia los renglones'; end if;

  perform confirmar_orden(v_oc);
  if (select estado::text from ordenes_compra where id = v_oc) <> 'confirmada' then raise exception 'FALLÓ: confirmar'; end if;
  if (select estado::text from ordenes_compra where id = v_oc2) <> 'cancelada' then raise exception 'FALLÓ: al confirmar se cancelan las alternativas'; end if;
  if (select precio from precios_proveedor where proveedor_id = v_prov and articulo_id = v_cons) <> 100 then raise exception 'FALLÓ: último precio del proveedor'; end if;
  begin
    perform confirmar_orden(v_oc);
    raise exception 'FALLÓ: confirmar dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ya está%' then raise exception 'FALLÓ: mensaje inesperado (dos veces): %', sqlerrm; end if;
  end;
  begin
    update orden_renglones set cantidad = 1 where id = v_r_cons;
    raise exception 'FALLÓ: renglón editable tras confirmar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ya no es cotización%' then raise exception 'FALLÓ: mensaje inesperado (renglón): %', sqlerrm; end if;
  end;
  update ordenes_compra set estado = 'borrador' where id = v_oc;
  if (select estado::text from ordenes_compra where id = v_oc) <> 'confirmada' then raise exception 'FALLÓ: el estado solo cambia por las funciones'; end if;
  v_ok := array_append(v_ok, 'cotización → orden con alternativas, último precio y renglones fijos');

  -- ── Recepciones de Dodo IS ────────────────────────────────────────────────
  v_res := importar_recepciones_dodo('prueba.xlsx',
    jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'fecha', v_hoy), jsonb_build_object('sucursal_id', v_suc, 'fecha', v_hoy + 30)),
    jsonb_build_array(
      jsonb_build_object('sucursal_id', v_suc, 'dodo_insumo_id', v_insumo, 'material', 'Queso', 'unidad', 'kg', 'fecha', v_hoy, 'cantidad', 4, 'precio', 100),
      jsonb_build_object('sucursal_id', v_suc, 'dodo_insumo_id', v_insumo, 'material', 'Queso', 'unidad', 'kg', 'fecha', v_hoy + 30, 'cantidad', 1, 'precio', 100)));
  if (v_res->>'ligadas')::int <> 1 or (v_res->>'pendientes')::int <> 1 then raise exception 'FALLÓ: liga automática (ventana de 7 días): %', v_res; end if;
  if recibido_renglon(v_r_cons) <> 4 then raise exception 'FALLÓ: recibido desde Dodo IS'; end if;
  v_res := importar_recepciones_dodo('prueba2.xlsx',
    jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'fecha', v_hoy)),
    jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'dodo_insumo_id', v_insumo, 'material', 'Queso', 'unidad', 'kg', 'fecha', v_hoy, 'cantidad', 6, 'precio', 100)));
  if recibido_renglon(v_r_cons) <> 6 then raise exception 'FALLÓ: reimportar reemplaza el día'; end if;
  if (select count(*) from recepciones_dodo where sucursal_id = v_suc and dodo_insumo_id = v_insumo) <> 2 then raise exception 'FALLÓ: reimportar no duplica'; end if;
  select id into v_recep from recepciones_dodo where sucursal_id = v_suc and dodo_insumo_id = v_insumo and fecha = v_hoy + 30;
  perform clasificar_recepcion(v_recep, 'traspaso', null);
  if (select clasificacion from recepciones_dodo where id = v_recep) <> 'traspaso' then raise exception 'FALLÓ: marcar traspaso'; end if;
  begin
    perform cancelar_orden(v_oc, 'Prueba');
    raise exception 'FALLÓ: cancelar con algo recibido';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ciérrala%' then raise exception 'FALLÓ: mensaje inesperado (cancelar): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'recepciones de Dodo IS: liga, reemplazo y clasificación');

  -- ── Gerente: recibe no consumibles de su sucursal, sin ver la tabla ───────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from ordenes_compra;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no lee la tabla de órdenes (precios)'; end if;
  select count(*) into v_n from ordenes_por_recibir() where orden_id = v_oc;
  if v_n <> 1 then raise exception 'FALLÓ: por recibir debe traer solo el horno (leyó %)', v_n; end if;
  begin
    perform recibir_renglon(v_r_cons, 1, v_hoy, null);
    raise exception 'FALLÓ: un consumible no se recibe en la app';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%Dodo IS%' then raise exception 'FALLÓ: mensaje inesperado (consumible): %', sqlerrm; end if;
  end;
  begin
    perform recibir_renglon(v_r_fijo, 1, v_hoy + 1, null);
    raise exception 'FALLÓ: fecha futura';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%futura%' then raise exception 'FALLÓ: mensaje inesperado (futura): %', sqlerrm; end if;
  end;
  perform recibir_renglon(v_r_fijo, 1, v_hoy, null);
  if recibido_renglon(v_r_fijo) <> 1 then raise exception 'FALLÓ: recibir en la app'; end if;
  v_ok := array_append(v_ok, 'el gerente recibe sin ver precios');

  -- ── Operación no recibe; corporativo solo consulta ────────────────────────
  execute 'reset role';
  update perfiles set rol = 'operacion' where id = v_b;
  execute 'set local role authenticated';
  begin
    perform recibir_renglon(v_r_fijo, 1, v_hoy, null);
    raise exception 'FALLÓ: operación no recibe';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo encargado%' then raise exception 'FALLÓ: mensaje inesperado (operación): %', sqlerrm; end if;
  end;
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  execute 'set local role authenticated';
  select count(*) into v_n from ordenes_compra where id = v_oc;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo lee órdenes'; end if;
  begin
    perform cerrar_orden(v_oc, 'Prueba');
    raise exception 'FALLÓ: corporativo no cierra';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  begin
    insert into ordenes_compra (proveedor_id) values (v_prov);
    raise exception 'FALLÓ: corporativo no crea órdenes';
  exception when insufficient_privilege then null; end;
  v_ok := array_append(v_ok, 'operación no recibe; corporativo consulta');

  -- ── Admin: anula una recepción y cierra con motivo ────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select id into v_recep from recepciones_app where orden_renglon_id = v_r_fijo;
  perform anular_recepcion(v_recep, 'Captura equivocada');
  if recibido_renglon(v_r_fijo) <> 0 then raise exception 'FALLÓ: anular devuelve lo pendiente'; end if;
  begin
    perform cerrar_orden(v_oc, ' ');
    raise exception 'FALLÓ: cerrar sin motivo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%motivo%' then raise exception 'FALLÓ: mensaje inesperado (sin motivo): %', sqlerrm; end if;
  end;
  perform cerrar_orden(v_oc, 'Prueba');
  if (select estado::text from ordenes_compra where id = v_oc) <> 'cerrada' then raise exception 'FALLÓ: cerrar'; end if;
  select count(*) into v_n from orden_historial where orden_id = v_oc;
  if v_n < 6 then raise exception 'FALLÓ: el historial registra cada paso (hay %)', v_n; end if;
  execute 'reset role';
  v_ok := array_append(v_ok, 'anular recepción y cerrar con motivo; historial completo');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 3: Review both files**

Check by reading: every new table has RLS enabled; `ordenes_compra` has no update/delete policy; every `security definer` function has `set search_path = public`; functions that write call `exigir_admin_compras()` except `recibir_renglon` (its own role check) and `ligar_recepciones_dodo` (called only from other functions); the historial count for `v_oc` in the test is creada, enviada, confirmada, recibido, recepción anulada, cerrada = 6.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0012_compras_ordenes.sql supabase/pruebas/0012_compras_ordenes.sql
git commit -m "feat(compras): migración 0012 de órdenes y recepciones con su prueba"
```

---

### Task 5: Órdenes: lista, nueva, detalle y acciones

**Files:**
- Create: `app/compras/servidor.ts`
- Create: `app/compras/ordenes/acciones.ts`
- Create: `app/compras/ordenes/page.tsx`
- Create: `app/compras/ordenes/nueva/page.tsx`
- Create: `app/compras/ordenes/[id]/page.tsx`
- Create: `app/compras/ordenes/CamposRenglon.tsx`

**Interfaces:**
- Consumes: Task 1 (`totalesOrden`, `avanceOrden`, `avanceRenglon`, `recibidoDeMas`, `accionesDe`, `leerRenglon`, `NOMBRE_ESTADO_ORDEN`, `NOMBRE_AVANCE`, `type EstadoOrden`), Task 3 (`puedeEditarCompras`), Task 4 (tables, view `renglones_recibido`, functions), `NOMBRE_TASA_IVA` and `type TasaIva` from `lib/compras/proveedores`.
- Produces: `app/compras/servidor.ts` exports `volver(ruta, clave, texto): never` and `clienteAdmin(ruta)`; server actions `crearOrden`, `editarOrden`, `agregarRenglon`, `editarRenglon`, `quitarRenglon`, `enviarOrden`, `confirmarOrden`, `cancelarOrden`, `cerrarOrden`, `copiarOrden`, `anularRecepcionApp`.

- [ ] **Step 1: Shared server helpers**

`app/compras/servidor.ts`:

```ts
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";

/** Regresa a `ruta` con un aviso (ok o error). */
export const volver = (ruta: string, clave: "ok" | "error", texto: string): never =>
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}${clave}=${encodeURIComponent(texto)}`);

/** Cliente de Supabase de un admin; cualquier otro regresa con el aviso de solo consulta. */
export async function clienteAdmin(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) volver(ruta, "error", SOLO_CONSULTA);
  return supabase;
}
```

- [ ] **Step 2: Actions**

`app/compras/ordenes/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leerRenglon } from "@/lib/compras/ordenes";
import { clienteAdmin, volver } from "../servidor";

const ruta = (id: string) => `/compras/ordenes/${id}`;
const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();
const sucursalDe = (valor: string) => (valor === "oficina" || valor === "" ? null : valor);

function listo(id: string, mensaje: string): never {
  revalidatePath("/compras", "layout");
  revalidatePath("/recepciones");
  return volver(ruta(id), "ok", mensaje);
}

export async function crearOrden(fd: FormData) {
  const destino = "/compras/ordenes/nueva";
  const supabase = await clienteAdmin(destino);
  const proveedor_id = texto(fd, "proveedor_id");
  if (!proveedor_id) volver(destino, "error", "Elige el proveedor.");
  const { data, error } = await supabase.from("ordenes_compra")
    .insert({ proveedor_id, sucursal_id: sucursalDe(texto(fd, "sucursal_id")), notas: texto(fd, "notas") || null })
    .select("id").single();
  if (error) volver(destino, "error", error.message);
  revalidatePath("/compras", "layout");
  redirect(ruta(data!.id));
}

export async function editarOrden(fd: FormData) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const { error } = await supabase.rpc("editar_orden", {
    p_id: id, p_proveedor: texto(fd, "proveedor_id"), p_sucursal: sucursalDe(texto(fd, "sucursal_id")), p_notas: texto(fd, "notas"),
  });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Cotización actualizada.");
}

export async function agregarRenglon(fd: FormData) {
  const id = texto(fd, "orden_id");
  const supabase = await clienteAdmin(ruta(id));
  const r = leerRenglon((c) => texto(fd, c));
  if ("error" in r) volver(ruta(id), "error", r.error);
  const { datos } = r as { datos: { articulo_id: string; cantidad: number; precio: number } };
  const { data: articulo } = await supabase.from("articulos").select("nombre, tasa_iva, activo").eq("id", datos.articulo_id)
    .maybeSingle<{ nombre: string; tasa_iva: string; activo: boolean }>();
  if (!articulo?.activo) volver(ruta(id), "error", "Elige un artículo activo.");
  const { error } = await supabase.from("orden_renglones").insert({
    orden_id: id, articulo_id: datos.articulo_id, descripcion: articulo!.nombre, cantidad: datos.cantidad, precio: datos.precio, tasa_iva: articulo!.tasa_iva,
  });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Renglón agregado.");
}

export async function editarRenglon(fd: FormData) {
  const id = texto(fd, "orden_id");
  const supabase = await clienteAdmin(ruta(id));
  const r = leerRenglon((c) => (c === "articulo_id" ? "x" : texto(fd, c)));
  if ("error" in r) volver(ruta(id), "error", r.error);
  const { datos } = r as { datos: { cantidad: number; precio: number } };
  const { error } = await supabase.from("orden_renglones").update({ cantidad: datos.cantidad, precio: datos.precio })
    .eq("id", texto(fd, "renglon_id")).eq("orden_id", id);
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Renglón actualizado.");
}

export async function quitarRenglon(fd: FormData) {
  const id = texto(fd, "orden_id");
  const supabase = await clienteAdmin(ruta(id));
  const { error } = await supabase.from("orden_renglones").delete().eq("id", texto(fd, "renglon_id")).eq("orden_id", id);
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Renglón quitado.");
}

async function llamar(fd: FormData, funcion: string, argumentos: Record<string, unknown>, mensaje: string) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const { error } = await supabase.rpc(funcion, { p_id: id, ...argumentos });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, mensaje);
}

export async function enviarOrden(fd: FormData) {
  await llamar(fd, "enviar_orden", {}, "Cotización marcada como enviada al proveedor.");
}
export async function confirmarOrden(fd: FormData) {
  await llamar(fd, "confirmar_orden", {}, "Orden de compra confirmada. Ya la ve la sucursal.");
}
export async function cancelarOrden(fd: FormData) {
  await llamar(fd, "cancelar_orden", { p_motivo: texto(fd, "motivo") }, "Orden cancelada.");
}
export async function cerrarOrden(fd: FormData) {
  await llamar(fd, "cerrar_orden", { p_motivo: texto(fd, "motivo") }, "Orden cerrada.");
}

export async function copiarOrden(fd: FormData) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const { data, error } = await supabase.rpc("copiar_orden", { p_id: id, p_proveedor: texto(fd, "proveedor_id") });
  if (error) volver(ruta(id), "error", error.message);
  listo(String(data), "Cotización alternativa creada con los mismos renglones. Captura los precios de este proveedor.");
}

export async function anularRecepcionApp(fd: FormData) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(ruta(id));
  const { error } = await supabase.rpc("anular_recepcion", { p_id: texto(fd, "recepcion_id"), p_motivo: texto(fd, "motivo") });
  if (error) volver(ruta(id), "error", error.message);
  listo(id, "Recepción anulada.");
}
```

- [ ] **Step 3: Client field for new renglón (proposes last price)**

`app/compras/ordenes/CamposRenglon.tsx`:

```tsx
"use client";

import { useState } from "react";

/** Al elegir el artículo propone el último precio de este proveedor; se puede cambiar o dejar vacío. */
export function CamposRenglon({ articulos, precios }: {
  articulos: { id: string; nombre: string; unidad: string }[]; precios: Record<string, number>;
}) {
  const [precio, setPrecio] = useState("");
  const [ultimo, setUltimo] = useState<number | null>(null);
  return (
    <div className="rejilla">
      <div className="campo">
        <label htmlFor="articulo_id">Artículo</label>
        <select id="articulo_id" name="articulo_id" required defaultValue=""
          onChange={(e) => { const p = precios[e.target.value]; setUltimo(p ?? null); setPrecio(p ? String(p) : ""); }}>
          <option value="" disabled>Elige…</option>
          {articulos.map((a) => <option key={a.id} value={a.id}>{a.nombre} ({a.unidad})</option>)}
        </select>
      </div>
      <div className="campo">
        <label htmlFor="cantidad">Cantidad</label>
        <input id="cantidad" name="cantidad" inputMode="decimal" required />
      </div>
      <div className="campo">
        <label htmlFor="precio">Precio unitario sin IVA</label>
        <input id="precio" name="precio" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} placeholder="Vacío si aún no lo sabes" />
        {ultimo !== null && <small>Última compra a este proveedor: ${ultimo.toFixed(2)}</small>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: List page**

`app/compras/ordenes/page.tsx`:

```tsx
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { avanceOrden, ESTADOS_ORDEN, NOMBRE_AVANCE, NOMBRE_ESTADO_ORDEN, totalesOrden, type EstadoOrden } from "@/lib/compras/ordenes";
import type { TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";

type Orden = {
  id: string; folio: string; estado: EstadoOrden; grupo_id: string; creado_en: string; sucursal_id: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null; sucursales: { nombre: string } | null;
};
type Renglon = { orden_id: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number };

export default async function Ordenes({ searchParams }: { searchParams: Promise<{ estado?: string; ok?: string; error?: string }> }) {
  const { estado, ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const filtro = (ESTADOS_ORDEN as readonly string[]).includes(estado ?? "") ? (estado as EstadoOrden) : undefined;
  const [ordenes, renglones] = await Promise.all([
    leerTodo<Orden>((d, h) => supabase.from("ordenes_compra")
      .select("id, folio, estado, grupo_id, creado_en, sucursal_id, proveedores(razon_social, nombre_comercial), sucursales(nombre)")
      .order("creado_en", { ascending: false }).order("id").range(d, h).returns<Orden[]>()),
    leerTodo<Renglon>((d, h) => supabase.from("renglones_recibido").select("orden_id, cantidad, precio, tasa_iva, recibido")
      .order("orden_id").order("id").range(d, h).returns<Renglon[]>()),
  ]);
  const renglonesDe = new Map<string, Renglon[]>();
  for (const r of renglones) renglonesDe.set(r.orden_id, [...(renglonesDe.get(r.orden_id) ?? []), r]);
  const porGrupo = new Map<string, number>();
  for (const o of ordenes) porGrupo.set(o.grupo_id, (porGrupo.get(o.grupo_id) ?? 0) + 1);
  const visibles = ordenes.filter((o) => (filtro ? o.estado === filtro : o.estado !== "cancelada" && o.estado !== "cerrada"));

  return (
    <>
      <div className="encabezado">
        <h1>Órdenes de compra</h1>
        <p>Cada documento empieza como cotización y, al confirmarlo, es la orden de compra que ve la sucursal.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <nav className="acciones" aria-label="Filtros">
        <Link className="boton boton-secundario" href="/compras/ordenes" aria-current={!filtro ? "page" : undefined}>Abiertas</Link>
        {ESTADOS_ORDEN.map((e) => (
          <Link key={e} className="boton boton-secundario" href={`/compras/ordenes?estado=${e}`} aria-current={filtro === e ? "page" : undefined}>
            {NOMBRE_ESTADO_ORDEN[e]}
          </Link>
        ))}
        {puedeEditarCompras(perfil.rol) && <Link className="boton" href="/compras/ordenes/nueva">Nueva cotización</Link>}
      </nav>
      {!visibles.length && <p className="vacio">No hay órdenes con ese filtro.</p>}
      <div className="tarjetas">
        {visibles.map((o) => {
          const rs = renglonesDe.get(o.id) ?? [];
          const avance = avanceOrden(rs);
          return (
            <article key={o.id} className="tarjeta" data-alerta={o.estado === "cancelada" ? "si" : undefined}>
              <div className="tarjeta-encabezado">
                <div>
                  <h3><Link href={`/compras/ordenes/${o.id}`}>{o.folio}</Link> · {o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social}</h3>
                  <p className="tarjeta-estado">{NOMBRE_ESTADO_ORDEN[o.estado]}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">
                <dt>Para</dt><dd>{o.sucursales?.nombre ?? "Oficina"}</dd>
                <dt>Total</dt><dd>{pesos(totalesOrden(rs).total)} · {rs.length} renglones</dd>
                {o.estado === "confirmada" && <><dt>Recepción</dt><dd>{NOMBRE_AVANCE[avance]}</dd></>}
                <dt>Creada</dt><dd>{fechaTexto(o.creado_en.slice(0, 10))}</dd>
                {(porGrupo.get(o.grupo_id) ?? 0) > 1 && <><dt>Alternativas</dt><dd><Link href={`/compras/ordenes/${o.id}/comparar`}>Comparar {porGrupo.get(o.grupo_id)}</Link></dd></>}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 5: New order page**

`app/compras/ordenes/nueva/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { crearOrden } from "../acciones";

export default async function NuevaOrden({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/ordenes");
  const [{ data: proveedores }, { data: sucursales }] = await Promise.all([
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social")
      .returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  return (
    <>
      <div className="encabezado"><h1>Nueva cotización</h1><p>Después agregas los artículos. Al confirmarla se vuelve orden de compra.</p></div>
      <Aviso error={error} />
      <form action={crearOrden} className="seccion formulario">
        <div className="rejilla">
          <div className="campo">
            <label htmlFor="proveedor_id">Proveedor</label>
            <select id="proveedor_id" name="proveedor_id" required defaultValue="">
              <option value="" disabled>Elige…</option>
              {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="sucursal_id">Para</label>
            <select id="sucursal_id" name="sucursal_id" defaultValue={sucursales?.[0]?.id ?? "oficina"}>
              {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              <option value="oficina">Oficina</option>
            </select>
          </div>
        </div>
        <div className="campo"><label htmlFor="notas">Notas</label><textarea id="notas" name="notas" rows={2} /></div>
        <BotonEnviar>Crear cotización</BotonEnviar>
      </form>
    </>
  );
}
```

- [ ] **Step 6: Detail page**

`app/compras/ordenes/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import {
  accionesDe, avanceOrden, avanceRenglon, NOMBRE_AVANCE, NOMBRE_ESTADO_ORDEN, recibidoDeMas, totalesOrden, type EstadoOrden,
} from "@/lib/compras/ordenes";
import { NOMBRE_TASA_IVA, type TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import {
  agregarRenglon, anularRecepcionApp, cancelarOrden, cerrarOrden, confirmarOrden, copiarOrden, editarOrden, editarRenglon, enviarOrden, quitarRenglon,
} from "../acciones";
import { CamposRenglon } from "../CamposRenglon";

type Orden = {
  id: string; folio: string; estado: EstadoOrden; grupo_id: string; proveedor_id: string; sucursal_id: string | null; notas: string | null;
  motivo: string | null; creado_en: string; confirmada_en: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null; sucursales: { nombre: string } | null;
};
type Renglon = { id: string; articulo_id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number; articulos: { unidad: string; tipo: string } | null };
type RecDodo = { id: string; orden_renglon_id: string; fecha: string; cantidad: number; unidad: string; precio: number };
type RecApp = { id: string; orden_renglon_id: string; fecha: string; cantidad: number; anulada_en: string | null; motivo_anulacion: string | null };
type Evento = { id: number; evento: string; nota: string | null; en: string; perfiles: { nombre: string } | null };

const CLAVE_EVENTO: Record<string, string> = {
  creada: "Creada", editada: "Editada", enviada: "Enviada al proveedor", confirmada: "Confirmada como orden de compra", copiada: "Creada como alternativa",
  cancelada: "Cancelada", cerrada: "Cerrada", recibido: "Recibido en sucursal", "recepción anulada": "Recepción anulada",
};

export default async function DetalleOrden({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: o, error: errorOrden } = await supabase.from("ordenes_compra")
    .select("id, folio, estado, grupo_id, proveedor_id, sucursal_id, notas, motivo, creado_en, confirmada_en, proveedores(razon_social, nombre_comercial), sucursales(nombre)")
    .eq("id", id).maybeSingle<Orden>();
  if (errorOrden) throw new Error(errorOrden.message);
  if (!o) notFound();

  const [{ data: renglones }, { data: historial }, { data: grupo }] = await Promise.all([
    supabase.from("renglones_recibido").select("id, articulo_id, descripcion, cantidad, precio, tasa_iva, recibido, articulos(unidad, tipo)")
      .eq("orden_id", id).order("creado_en").order("id").returns<Renglon[]>(),
    supabase.from("orden_historial").select("id, evento, nota, en, perfiles(nombre)").eq("orden_id", id).order("en").returns<Evento[]>(),
    supabase.from("ordenes_compra").select("id").eq("grupo_id", o.grupo_id).returns<{ id: string }[]>(),
  ]);
  const rs = renglones ?? [];
  const ids = rs.map((r) => r.id);
  const [{ data: recDodo }, { data: recApp }] = ids.length
    ? await Promise.all([
      supabase.from("recepciones_dodo").select("id, orden_renglon_id, fecha, cantidad, unidad, precio").in("orden_renglon_id", ids).order("fecha").returns<RecDodo[]>(),
      supabase.from("recepciones_app").select("id, orden_renglon_id, fecha, cantidad, anulada_en, motivo_anulacion").in("orden_renglon_id", ids).order("recibido_en").returns<RecApp[]>(),
    ])
    : [{ data: [] as RecDodo[] }, { data: [] as RecApp[] }];

  const edita = puedeEditarCompras(perfil.rol);
  const hayRecepciones = rs.some((r) => Number(r.recibido) > 0);
  const acciones = edita ? accionesDe(o.estado, hayRecepciones) : [];
  const puedeEditar = acciones.includes("editar");
  const t = totalesOrden(rs);

  // Para editar y copiar: artículos activos, proveedores activos, sucursales y últimos precios de este proveedor.
  const [articulos, proveedores, sucursales, precios] = await Promise.all([
    supabase.from("articulos").select("id, nombre, unidad").eq("activo", true).order("nombre").returns<{ id: string; nombre: string; unidad: string }[]>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("precios_proveedor").select("articulo_id, precio").eq("proveedor_id", o.proveedor_id).returns<{ articulo_id: string; precio: number }[]>(),
  ]);
  const preciosPorArticulo = Object.fromEntries((precios.data ?? []).map((p) => [p.articulo_id, Number(p.precio)]));

  return (
    <>
      <div className="encabezado">
        <h1>{o.folio} · {o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social}</h1>
        <p>{NOMBRE_ESTADO_ORDEN[o.estado]} · para {o.sucursales?.nombre ?? "Oficina"}{o.motivo ? ` · ${o.motivo}` : ""}</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion">
        <dl className="tarjeta-datos">
          <dt>Subtotal</dt><dd>{pesos(t.subtotal)}</dd>
          <dt>IVA</dt><dd>{pesos(t.iva)}</dd>
          <dt>Total</dt><dd><strong>{pesos(t.total)}</strong></dd>
          {o.estado === "confirmada" && <><dt>Recepción</dt><dd>{NOMBRE_AVANCE[avanceOrden(rs)]}</dd></>}
          {o.notas && <><dt>Notas</dt><dd>{o.notas}</dd></>}
        </dl>
        <div className="acciones">
          <Link className="boton boton-secundario" href={`/orden-compra/${o.id}`} target="_blank">Ver PDF</Link>
          {(grupo?.length ?? 0) > 1 && <Link className="boton boton-secundario" href={`/compras/ordenes/${o.id}/comparar`}>Comparar {grupo!.length} cotizaciones</Link>}
        </div>
      </section>

      <section className="seccion" aria-labelledby="t-renglones">
        <h2 id="t-renglones">Renglones</h2>
        {!rs.length && <p className="vacio">Agrega el primer artículo.</p>}
        <div className="tarjetas">
          {rs.map((r) => {
            const avance = avanceRenglon(Number(r.cantidad), Number(r.recibido));
            const deMas = recibidoDeMas(Number(r.cantidad), Number(r.recibido));
            const dodo = (recDodo ?? []).filter((x) => x.orden_renglon_id === r.id);
            const app = (recApp ?? []).filter((x) => x.orden_renglon_id === r.id);
            return (
              <article key={r.id} className="tarjeta" data-alerta={deMas ? "si" : undefined}>
                <div className="tarjeta-encabezado">
                  <div>
                    <h3>{r.descripcion}</h3>
                    <p className="tarjeta-estado">{r.cantidad} {r.articulos?.unidad} · {pesos(r.precio)} c/u · {NOMBRE_TASA_IVA[r.tasa_iva]}</p>
                  </div>
                </div>
                {o.estado !== "borrador" && o.estado !== "enviada" && (
                  <dl className="tarjeta-datos">
                    <dt>Recibido</dt><dd>{r.recibido} {r.articulos?.unidad} · {NOMBRE_AVANCE[avance]}{deMas ? " · más de lo pedido" : ""}</dd>
                    {dodo.map((x) => <Fragment key={x.id}><dt>Dodo IS</dt><dd>{fechaTexto(x.fecha)} · {x.cantidad} {x.unidad} · {pesos(x.precio)}</dd></Fragment>)}
                    {app.map((x) => (
                      <Fragment key={x.id}><dt>En sucursal</dt><dd>{fechaTexto(x.fecha)} · {x.cantidad}{x.anulada_en ? ` · anulada: ${x.motivo_anulacion}` : ""}</dd></Fragment>
                    ))}
                  </dl>
                )}
                {edita && app.some((x) => !x.anulada_en) && (
                  <details>
                    <summary>Anular una recepción de la sucursal</summary>
                    {app.filter((x) => !x.anulada_en).map((x) => (
                      <form key={x.id} action={anularRecepcionApp} className="formulario">
                        <input type="hidden" name="id" value={o.id} />
                        <input type="hidden" name="recepcion_id" value={x.id} />
                        <div className="campo"><label htmlFor={`m-${x.id}`}>Motivo ({fechaTexto(x.fecha)} · {x.cantidad})</label><input id={`m-${x.id}`} name="motivo" required /></div>
                        <BotonEnviar className="boton boton-alerta">Anular</BotonEnviar>
                      </form>
                    ))}
                  </details>
                )}
                {puedeEditar && (
                  <details>
                    <summary>Editar</summary>
                    <form action={editarRenglon} className="formulario">
                      <input type="hidden" name="orden_id" value={o.id} />
                      <input type="hidden" name="renglon_id" value={r.id} />
                      <div className="rejilla">
                        <div className="campo"><label htmlFor={`c-${r.id}`}>Cantidad</label><input id={`c-${r.id}`} name="cantidad" inputMode="decimal" defaultValue={r.cantidad} required /></div>
                        <div className="campo"><label htmlFor={`p-${r.id}`}>Precio sin IVA</label><input id={`p-${r.id}`} name="precio" inputMode="decimal" defaultValue={r.precio} /></div>
                      </div>
                      <BotonEnviar>Guardar</BotonEnviar>
                    </form>
                    <form action={quitarRenglon} className="acciones">
                      <input type="hidden" name="orden_id" value={o.id} />
                      <input type="hidden" name="renglon_id" value={r.id} />
                      <BotonEnviar className="boton boton-secundario" confirmar="¿Quitar este renglón de la cotización?">Quitar renglón</BotonEnviar>
                    </form>
                  </details>
                )}
              </article>
            );
          })}
        </div>
        {puedeEditar && (
          <form action={agregarRenglon} className="formulario">
            <input type="hidden" name="orden_id" value={o.id} />
            <CamposRenglon articulos={articulos.data ?? []} precios={preciosPorArticulo} />
            <BotonEnviar>Agregar renglón</BotonEnviar>
          </form>
        )}
      </section>

      {acciones.length > 0 && (
        <section className="seccion" aria-labelledby="t-acciones">
          <h2 id="t-acciones">Acciones</h2>
          <div className="acciones">
            {acciones.includes("enviar") && (
              <form action={enviarOrden}><input type="hidden" name="id" value={o.id} /><BotonEnviar className="boton boton-secundario">Marcar como enviada</BotonEnviar></form>
            )}
            {acciones.includes("confirmar") && (
              <form action={confirmarOrden}>
                <input type="hidden" name="id" value={o.id} />
                <BotonEnviar confirmar="¿Confirmar como orden de compra? Los renglones ya no cambian y se cancelan las otras cotizaciones del grupo.">Confirmar orden de compra</BotonEnviar>
              </form>
            )}
          </div>
          {acciones.includes("copiar") && (
            <form action={copiarOrden} className="formulario">
              <input type="hidden" name="id" value={o.id} />
              <div className="campo">
                <label htmlFor="otro">Pedir lo mismo a otro proveedor</label>
                <select id="otro" name="proveedor_id" required defaultValue="">
                  <option value="" disabled>Elige…</option>
                  {(proveedores.data ?? []).filter((p) => p.id !== o.proveedor_id).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
                </select>
              </div>
              <BotonEnviar className="boton boton-secundario">Crear cotización alternativa</BotonEnviar>
            </form>
          )}
          {puedeEditar && (
            <details>
              <summary>Cambiar proveedor, destino o notas</summary>
              <form action={editarOrden} className="formulario">
                <input type="hidden" name="id" value={o.id} />
                <div className="rejilla">
                  <div className="campo">
                    <label htmlFor="e-prov">Proveedor</label>
                    <select id="e-prov" name="proveedor_id" defaultValue={o.proveedor_id}>
                      {(proveedores.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
                    </select>
                  </div>
                  <div className="campo">
                    <label htmlFor="e-suc">Para</label>
                    <select id="e-suc" name="sucursal_id" defaultValue={o.sucursal_id ?? "oficina"}>
                      {(sucursales.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                      <option value="oficina">Oficina</option>
                    </select>
                  </div>
                </div>
                <div className="campo"><label htmlFor="e-notas">Notas</label><textarea id="e-notas" name="notas" rows={2} defaultValue={o.notas ?? ""} /></div>
                <BotonEnviar>Guardar</BotonEnviar>
              </form>
            </details>
          )}
          {(["cancelar", "cerrar"] as const).filter((a) => acciones.includes(a)).map((a) => (
            <details key={a}>
              <summary>{a === "cancelar" ? "Cancelar" : "Cerrar la orden"}</summary>
              <form action={a === "cancelar" ? cancelarOrden : cerrarOrden} className="formulario">
                <input type="hidden" name="id" value={o.id} />
                <div className="campo">
                  <label htmlFor={`motivo-${a}`}>Motivo</label>
                  <input id={`motivo-${a}`} name="motivo" required placeholder={a === "cerrar" ? "Ej. lo que falta ya no llegará" : "Ej. el proveedor no surtió"} />
                </div>
                <BotonEnviar className="boton boton-alerta">{a === "cancelar" ? "Cancelar" : "Cerrar"}</BotonEnviar>
              </form>
            </details>
          ))}
        </section>
      )}

      <Plegable id="t-historial" titulo="Historial" resumen={`${historial?.length ?? 0} eventos`}>
        <dl className="tarjeta-datos">
          {(historial ?? []).map((h) => (
            <Fragment key={h.id}><dt>{fechaTexto(h.en.slice(0, 10))}</dt><dd>{CLAVE_EVENTO[h.evento] ?? h.evento}{h.nota ? ` · ${h.nota}` : ""}{h.perfiles ? ` · ${h.perfiles.nombre}` : ""}</dd></Fragment>
          ))}
        </dl>
      </Plegable>
    </>
  );
}
```

Add `import { Fragment } from "react";` at the top of this file (the maps over recepciones and historial return `Fragment` with a key).

- [ ] **Step 7: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras/ordenes`, `/compras/ordenes/nueva`, `/compras/ordenes/[id]`. (The comparar link and the `/orden-compra/[id]` link are built in Task 6.)

Visual check: temp page `app/login/prueba-orden/page.tsx` rendering `<CamposRenglon articulos={[…3 samples…]} precios={{ a1: 68 }} />` inside a `.seccion` and three sample renglón cards copied from the detail markup; at 375 px no horizontal scroll; selecting the article with a price fills the price and shows "Última compra…". Delete the temp page and `.next`.

- [ ] **Step 8: Commit**

```bash
git add app/compras/servidor.ts app/compras/ordenes
git commit -m "feat(compras): cotizaciones y órdenes de compra"
```

---

### Task 6: Comparar cotizaciones y PDF de la orden

**Files:**
- Create: `app/compras/ordenes/[id]/comparar/page.tsx`
- Create: `app/orden-compra/[id]/page.tsx`
- Create: `app/orden-compra/[id]/Imprimir.tsx`

**Interfaces:**
- Consumes: `compararCotizaciones`, `totalesOrden`, `NOMBRE_ESTADO_ORDEN` (Task 1); `confirmarOrden` (Task 5); `puedeVerCompras`, `puedeEditarCompras` (Task 3); `NOMBRE_TASA_IVA`.

- [ ] **Step 1: Compare page**

`app/compras/ordenes/[id]/comparar/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { pesos } from "@/lib/formato";
import { compararCotizaciones, NOMBRE_ESTADO_ORDEN, type EstadoOrden } from "@/lib/compras/ordenes";
import type { TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { confirmarOrden } from "../../acciones";

type Orden = { id: string; folio: string; estado: EstadoOrden; proveedores: { razon_social: string; nombre_comercial: string | null } | null };
type Renglon = { orden_id: string; articulo_id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva };

export default async function Comparar({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: base } = await supabase.from("ordenes_compra").select("grupo_id").eq("id", id).maybeSingle<{ grupo_id: string }>();
  if (!base) notFound();
  const { data: ordenes } = await supabase.from("ordenes_compra").select("id, folio, estado, proveedores(razon_social, nombre_comercial)")
    .eq("grupo_id", base.grupo_id).order("creado_en").returns<Orden[]>();
  const ids = (ordenes ?? []).map((o) => o.id);
  const { data: renglones } = await supabase.from("orden_renglones").select("orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva")
    .in("orden_id", ids).order("creado_en").returns<Renglon[]>();
  const cot = (ordenes ?? []).map((o) => ({ id: o.id, renglones: (renglones ?? []).filter((r) => r.orden_id === o.id) }));
  const { totales, masBarata, mejorPorArticulo } = compararCotizaciones(cot);
  const edita = puedeEditarCompras(perfil.rol);

  return (
    <>
      <div className="encabezado">
        <h1>Comparar cotizaciones</h1>
        <p>Mismo pedido con distintos proveedores. Al confirmar una, las demás se cancelan solas.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <div className="tarjetas">
        {(ordenes ?? []).map((o) => (
          <article key={o.id} className="tarjeta" data-alerta={o.estado === "cancelada" ? "si" : undefined}>
            <div className="tarjeta-encabezado">
              <div>
                <h3><Link href={`/compras/ordenes/${o.id}`}>{o.folio}</Link> · {o.proveedores?.nombre_comercial ?? o.proveedores?.razon_social}</h3>
                <p className="tarjeta-estado">{NOMBRE_ESTADO_ORDEN[o.estado]}{masBarata === o.id ? " · la más barata" : ""}</p>
              </div>
            </div>
            <dl className="tarjeta-datos">
              {cot.find((c) => c.id === o.id)!.renglones.map((r) => (
                <Fragment key={r.articulo_id}>
                  <dt>{r.descripcion}</dt>
                  <dd>{r.precio > 0 ? pesos(r.precio) : "Sin precio"}{mejorPorArticulo.get(r.articulo_id) === o.id ? " · mejor precio" : ""}</dd>
                </Fragment>
              ))}
              <dt>Total</dt><dd><strong>{pesos(totales.get(o.id) ?? 0)}</strong></dd>
            </dl>
            {edita && (o.estado === "borrador" || o.estado === "enviada") && (
              <form action={confirmarOrden}>
                <input type="hidden" name="id" value={o.id} />
                <BotonEnviar confirmar={`¿Confirmar ${o.folio} como orden de compra? Las demás cotizaciones se cancelan.`}>Elegir esta</BotonEnviar>
              </form>
            )}
          </article>
        ))}
      </div>
    </>
  );
}
```

Add `import { Fragment } from "react";` at the top of this file.

- [ ] **Step 2: Printable order (PDF via the browser)**

`app/orden-compra/[id]/Imprimir.tsx`:

```tsx
"use client";

export function Imprimir() {
  return <button className="boton no-imprimir" type="button" onClick={() => window.print()}>Imprimir o guardar como PDF</button>;
}
```

`app/orden-compra/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { NOMBRE_ESTADO_ORDEN, totalesOrden, type EstadoOrden } from "@/lib/compras/ordenes";
import { NOMBRE_TASA_IVA, type TasaIva } from "@/lib/compras/proveedores";
import { puedeVerCompras } from "@/lib/roles";
import { Imprimir } from "./Imprimir";

export const dynamic = "force-dynamic";

type Orden = {
  folio: string; estado: EstadoOrden; notas: string | null; creado_en: string; confirmada_en: string | null;
  proveedores: { razon_social: string; rfc: string } | null; sucursales: { nombre: string } | null;
};
type Renglon = { id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; articulos: { unidad: string } | null };

/** Documento para mandar al proveedor: fuera del layout de Compras para que se imprima limpio. */
export default async function OrdenImprimible({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) redirect("/");
  const { data: o } = await supabase.from("ordenes_compra")
    .select("folio, estado, notas, creado_en, confirmada_en, proveedores(razon_social, rfc), sucursales(nombre)").eq("id", id).maybeSingle<Orden>();
  if (!o) notFound();
  const { data: renglones } = await supabase.from("orden_renglones").select("id, descripcion, cantidad, precio, tasa_iva, articulos(unidad)")
    .eq("orden_id", id).order("creado_en").order("id").returns<Renglon[]>();
  const rs = renglones ?? [];
  const t = totalesOrden(rs);
  const esOrden = o.estado === "confirmada" || o.estado === "cerrada";

  return (
    <main className="pagina">
      <style>{"@media print { .no-imprimir { display: none !important; } body { background: #fff; } }"}</style>
      <div className="acciones no-imprimir"><Imprimir /></div>
      <section className="seccion">
        <div className="tarjeta-encabezado">
          <div>
            <h1>{esOrden ? "Orden de compra" : "Solicitud de cotización"} {o.folio}</h1>
            <p>{fechaTexto((o.confirmada_en ?? o.creado_en).slice(0, 10))} · {NOMBRE_ESTADO_ORDEN[o.estado]}</p>
          </div>
          <img src="/logo-dodo.png" alt="Dodo Pizza" width={48} height={48} />
        </div>
        <dl className="tarjeta-datos">
          <dt>Proveedor</dt><dd>{o.proveedores?.razon_social} · RFC {o.proveedores?.rfc}</dd>
          <dt>Entregar en</dt><dd>Dodo Pizza {o.sucursales?.nombre ?? "Oficina"}</dd>
          {o.notas && <><dt>Notas</dt><dd>{o.notas}</dd></>}
        </dl>
      </section>
      <section className="seccion">
        <dl className="tarjeta-datos">
          {rs.map((r) => (
            <Fragment key={r.id}>
              <dt>{r.cantidad} {r.articulos?.unidad}</dt>
              <dd>{r.descripcion} · {r.precio > 0 ? `${pesos(r.precio)} c/u · ${NOMBRE_TASA_IVA[r.tasa_iva]}` : "precio por cotizar"}</dd>
            </Fragment>
          ))}
          <dt>Subtotal</dt><dd>{pesos(t.subtotal)}</dd>
          <dt>IVA</dt><dd>{pesos(t.iva)}</dd>
          <dt>Total</dt><dd><strong>{pesos(t.total)}</strong></dd>
        </dl>
      </section>
    </main>
  );
}
```

Add `import { Fragment } from "react";` at the top.

- [ ] **Step 3: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras/ordenes/[id]/comparar` and `/orden-compra/[id]`.

Visual check: temp page rendering three comparison cards with sample data (one "la más barata", one with "Sin precio", one cancelled) at 375 px, no horizontal scroll. Delete temp page and `.next`.

- [ ] **Step 4: Commit**

```bash
git add "app/compras/ordenes/[id]/comparar" app/orden-compra
git commit -m "feat(compras): comparar cotizaciones y PDF de la orden"
```

---

### Task 7: Recepciones de Dodo IS (importar y revisar)

**Files:**
- Create: `app/compras/recepciones/acciones.ts`
- Create: `app/compras/recepciones/FormImportarRecepciones.tsx`
- Create: `app/compras/recepciones/page.tsx`

**Interfaces:**
- Consumes: `leerIncomingSupplies`, `NO_ES_INCOMING` (Task 2); `leerHojas`, `NO_ES_XLSX` (`lib/ventas/xlsx`); `clienteAdmin`, `volver` (Task 5); `importar_recepciones_dodo`, `clasificar_recepcion` (Task 4).
- Produces: `importarRecepciones(previo, fd): Promise<{ ok?: string; errores?: string[] }>`, `clasificarRecepcion(fd)`.

- [ ] **Step 1: Actions**

`app/compras/recepciones/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerIncomingSupplies } from "@/lib/compras/incomingSupplies";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { leerHojas, NO_ES_XLSX, type Hoja } from "@/lib/ventas/xlsx";
import { clienteAdmin, volver } from "../servidor";

export type ResultadoImportacion = { ok?: string; errores?: string[] };

export async function importarRecepciones(_previo: ResultadoImportacion | null, fd: FormData): Promise<ResultadoImportacion> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { errores: [SOLO_CONSULTA] };
  const archivo = fd.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { errores: ["Elige el archivo de Excel."] };
  if (archivo.size > 5 * 1024 * 1024) return { errores: ["El archivo pesa más de 5 MB."] };
  let hojas: Hoja[];
  try {
    hojas = leerHojas(new Uint8Array(await archivo.arrayBuffer()));
  } catch {
    return { errores: [NO_ES_XLSX] };
  }
  const { data: sucursales, error: errorSuc } = await supabase.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>();
  if (errorSuc) return { errores: [errorSuc.message] };
  const leido = leerIncomingSupplies(hojas, sucursales ?? []);
  if (leido.errores.length) return { errores: leido.errores };

  const { data, error } = await supabase.rpc("importar_recepciones_dodo", { p_archivo: archivo.name, p_dias: leido.dias, p_filas: leido.recepciones });
  if (error) return { errores: [error.message] };
  revalidatePath("/compras", "layout");
  const r = data as { recepciones: number; ligadas: number; pendientes: number };
  return { ok: `${r.recepciones} recepciones guardadas: ${r.ligadas} ligadas a órdenes y ${r.pendientes} por revisar.` };
}

/** `destino` = "renglon:<id>" | "sin_orden" | "traspaso" | "pendiente". */
export async function clasificarRecepcion(fd: FormData) {
  const ruta = "/compras/recepciones";
  const supabase = await clienteAdmin(ruta);
  const destino = String(fd.get("destino") ?? "");
  const [clasificacion, renglon] = destino.startsWith("renglon:") ? ["orden", destino.slice(8)] : [destino, null];
  const { error } = await supabase.rpc("clasificar_recepcion", { p_id: String(fd.get("id") ?? ""), p_clasificacion: clasificacion, p_renglon: renglon });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", "Recepción clasificada.");
}
```

- [ ] **Step 2: Import form**

`app/compras/recepciones/FormImportarRecepciones.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { importarRecepciones, type ResultadoImportacion } from "./acciones";

export function FormImportarRecepciones() {
  const [resultado, enviar, pendiente] = useActionState<ResultadoImportacion | null, FormData>(importarRecepciones, null);
  return (
    <form action={enviar} className="seccion formulario">
      <div className="campo">
        <label htmlFor="archivo-recepciones">Incoming supplies de Dodo IS</label>
        <input id="archivo-recepciones" name="archivo" type="file" accept=".xlsx" required />
        <small>Dodo IS → Informes → Incoming supplies, del periodo que quieras. Los días que ya estaban se reemplazan (y se pierden sus ligas manuales).</small>
      </div>
      {resultado?.errores && (
        <div className="aviso aviso-error" role="alert"><p>No se guardó nada:</p><ul>{resultado.errores.map((e) => <li key={e}>{e}</li>)}</ul></div>
      )}
      {resultado?.ok && <p className="aviso aviso-ok" role="status">{resultado.ok}</p>}
      <button className="boton" type="submit" disabled={pendiente}>{pendiente ? "Importando…" : "Importar recepciones"}</button>
    </form>
  );
}
```

- [ ] **Step 3: Page**

`app/compras/recepciones/page.tsx`:

```tsx
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { clasificarRecepcion } from "./acciones";
import { FormImportarRecepciones } from "./FormImportarRecepciones";

type Recepcion = {
  id: string; sucursal_id: string; dodo_insumo_id: string; material: string; unidad: string; fecha: string; cantidad: number; precio: number;
  clasificacion: "pendiente" | "orden" | "sin_orden" | "traspaso"; orden_renglon_id: string | null; sucursales: { nombre: string } | null;
};
type Abierto = {
  id: string; descripcion: string; cantidad: number; recibido: number; orden_id: string;
  articulos: { dodo_insumo_id: string | null; unidad: string } | null;
  ordenes_compra: { folio: string; estado: string; sucursal_id: string | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null } | null;
};

const NOMBRE_CLASE = { pendiente: "Por revisar", orden: "Ligada a orden", sin_orden: "Compra sin orden", traspaso: "Traspaso" } as const;

export default async function Recepciones({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const edita = puedeEditarCompras(perfil.rol);
  const [recepciones, { data: abiertos }] = await Promise.all([
    leerTodo<Recepcion>((d, h) => supabase.from("recepciones_dodo")
      .select("id, sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, clasificacion, orden_renglon_id, sucursales(nombre)")
      .order("fecha", { ascending: false }).order("id").range(d, h).returns<Recepcion[]>()),
    supabase.from("renglones_recibido")
      .select("id, descripcion, cantidad, recibido, orden_id, articulos(dodo_insumo_id, unidad), ordenes_compra!inner(folio, estado, sucursal_id, proveedores(razon_social, nombre_comercial))")
      .eq("ordenes_compra.estado", "confirmada").returns<Abierto[]>(),
  ]);
  const pendientes = recepciones.filter((r) => r.clasificacion === "pendiente");
  const recientes = recepciones.filter((r) => r.clasificacion !== "pendiente").slice(0, 40);
  const opciones = (r: Recepcion) => (abiertos ?? []).filter((a) =>
    a.ordenes_compra?.sucursal_id === r.sucursal_id && (!a.articulos?.dodo_insumo_id || a.articulos.dodo_insumo_id === r.dodo_insumo_id));

  return (
    <>
      <div className="encabezado">
        <h1>Recepciones</h1>
        <p>Lo que se recibió en Dodo IS, ligado a las órdenes de compra. Los consumibles se ligan solos por su ID de insumo.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {edita && <FormImportarRecepciones />}

      <section className="seccion" aria-labelledby="t-pendientes">
        <h2 id="t-pendientes">Por revisar · {pendientes.length}</h2>
        {!pendientes.length && <p className="vacio">Todo lo recibido está ligado o clasificado.</p>}
        <div className="tarjetas">
          {pendientes.map((r) => (
            <article key={r.id} className="tarjeta" data-alerta="si">
              <div className="tarjeta-encabezado">
                <div>
                  <h3>{r.material}</h3>
                  <p className="tarjeta-estado">{r.cantidad} {r.unidad} · {fechaTexto(r.fecha)} · {r.sucursales?.nombre}</p>
                </div>
              </div>
              <dl className="tarjeta-datos"><dt>Precio Dodo IS</dt><dd>{pesos(r.precio)} por {r.unidad}</dd></dl>
              {edita && (
                <form action={clasificarRecepcion} className="formulario">
                  <input type="hidden" name="id" value={r.id} />
                  <div className="campo">
                    <label htmlFor={`dest-${r.id}`}>¿A qué corresponde?</label>
                    <select id={`dest-${r.id}`} name="destino" required defaultValue="">
                      <option value="" disabled>Elige…</option>
                      {opciones(r).map((a) => (
                        <option key={a.id} value={`renglon:${a.id}`}>
                          {a.ordenes_compra?.folio} · {a.ordenes_compra?.proveedores?.nombre_comercial ?? a.ordenes_compra?.proveedores?.razon_social} · {a.descripcion} ({a.recibido}/{a.cantidad} {a.articulos?.unidad})
                        </option>
                      ))}
                      <option value="sin_orden">Compra sin orden</option>
                      <option value="traspaso">Traspaso entre sucursales</option>
                    </select>
                  </div>
                  <BotonEnviar>Guardar</BotonEnviar>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>

      <Plegable id="t-recientes" titulo="Recientes" resumen={`${recientes.length} clasificadas`}>
        <div className="tarjetas">
          {recientes.map((r) => (
            <article key={r.id} className="tarjeta">
              <div className="tarjeta-encabezado">
                <div>
                  <h3>{r.material}</h3>
                  <p className="tarjeta-estado">{NOMBRE_CLASE[r.clasificacion]}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">
                <dt>Recibido</dt><dd>{r.cantidad} {r.unidad} · {fechaTexto(r.fecha)} · {r.sucursales?.nombre}</dd>
                {r.orden_renglon_id && <><dt>Orden</dt><dd><OrdenDe abiertos={abiertos ?? []} renglon={r.orden_renglon_id} /></dd></>}
              </dl>
              {edita && (
                <form action={clasificarRecepcion} className="acciones">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="destino" value="pendiente" />
                  <BotonEnviar className="boton boton-secundario">Regresar a revisar</BotonEnviar>
                </form>
              )}
            </article>
          ))}
        </div>
      </Plegable>
    </>
  );
}

function OrdenDe({ abiertos, renglon }: { abiertos: Abierto[]; renglon: string }) {
  const a = abiertos.find((x) => x.id === renglon);
  return a ? <Link href={`/compras/ordenes/${a.orden_id}`}>{a.ordenes_compra?.folio}</Link> : <span>Orden cerrada</span>;
}
```

- [ ] **Step 4: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras/recepciones`.

Visual check: temp page with two "Por revisar" cards (sample data, the select with a long option text) at 375 px: no horizontal scroll (a long `<option>` must not widen the page; if it does, add `style={{ maxWidth: "100%" }}` to the select). Delete temp page and `.next`.

- [ ] **Step 5: Commit**

```bash
git add app/compras/recepciones
git commit -m "feat(compras): importar y revisar recepciones de Dodo IS"
```

---

### Task 8: Recepción en la sucursal, aviso en Inicio y README

**Files:**
- Create: `app/(app)/recepciones/page.tsx`
- Create: `app/(app)/recepciones/actions.ts`
- Modify: `app/(app)/page.tsx` (tarjeta "Por recibir")
- Modify: `README.md`

**Interfaces:**
- Consumes: `ordenes_por_recibir`, `recibir_renglon` (Task 4); `puedeRecibirCompras` (Task 3); `avanceRenglon` (Task 1); `obtenerContexto`, `obtenerContextoParaEscribir`; `BUCKET_FOTOS`, `rutaFoto`, `validarFoto` (`lib/fotos.ts`); `hoyMX`.

- [ ] **Step 1: Action**

`app/(app)/recepciones/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { BUCKET_FOTOS, rutaFoto, validarFoto } from "@/lib/fotos";
import { puedeRecibirCompras } from "@/lib/roles";

const volver = (clave: "ok" | "error", texto: string): never => redirect(`/recepciones?${clave}=${encodeURIComponent(texto)}`);

/** Confirma lo recibido de un renglón (activo fijo, servicio u otro). La foto se sube primero y es opcional. */
export async function recibirRenglon(fd: FormData) {
  const { supabase, perfil, sucursal } = await obtenerContextoParaEscribir("/recepciones");
  if (!puedeRecibirCompras(perfil.rol)) volver("error", "Solo encargado, gerente o administrador reciben compras.");
  const cantidad = Number(String(fd.get("cantidad") ?? "").replace(/,/g, ""));
  if (!(cantidad > 0)) volver("error", "Escribe la cantidad recibida.");
  const foto = fd.get("foto");
  const archivo = foto instanceof File && foto.size > 0 ? foto : null;
  const problema = validarFoto(archivo);
  if (problema) volver("error", problema);

  let fotoPath: string | null = null;
  if (archivo) {
    fotoPath = rutaFoto(sucursal.id, `recepciones/${crypto.randomUUID()}`, archivo.type);
    const { error: errorFoto } = await supabase.storage.from(BUCKET_FOTOS).upload(fotoPath, archivo, { contentType: archivo.type, upsert: false });
    if (errorFoto) volver("error", `No se pudo subir la foto: ${errorFoto.message}`);
  }
  const { error } = await supabase.rpc("recibir_renglon", {
    p_renglon: String(fd.get("renglon_id") ?? ""), p_cantidad: cantidad, p_fecha: String(fd.get("fecha") ?? ""), p_foto: fotoPath,
  });
  if (error) volver("error", error.message);
  revalidatePath("/recepciones");
  revalidatePath("/");
  volver("ok", "Recepción registrada.");
}
```

- [ ] **Step 2: Page**

`app/(app)/recepciones/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto } from "@/lib/contexto";
import { fechaTexto, hoyMX } from "@/lib/formato";
import { avanceRenglon } from "@/lib/compras/ordenes";
import { puedeRecibirCompras } from "@/lib/roles";
import { recibirRenglon } from "./actions";

type PorRecibir = {
  orden_id: string; folio: string; proveedor: string; confirmada_en: string; renglon_id: string;
  descripcion: string; unidad: string; tipo: string; cantidad: number; recibido: number;
};

export default async function RecepcionesSucursal({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, soloLectura } = await obtenerContexto();
  if (!puedeRecibirCompras(perfil.rol)) redirect("/");
  const { data, error: errorRpc } = await supabase.rpc("ordenes_por_recibir").returns<PorRecibir[]>();
  if (errorRpc) throw new Error(errorRpc.message);
  const pendientes = (data ?? []).filter((r) => avanceRenglon(Number(r.cantidad), Number(r.recibido)) !== "completa");
  const ordenes = [...new Map(pendientes.map((r) => [r.orden_id, r])).values()];
  const hoy = hoyMX();

  return (
    <>
      <div className="encabezado">
        <h1>Recepciones</h1>
        <p>Equipo, servicios y otros pedidos por oficina. Los insumos (consumibles) se siguen recibiendo en Dodo IS.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {!ordenes.length && <p className="vacio">No hay nada por recibir.</p>}
      {ordenes.map((o) => (
        <section key={o.orden_id} className="seccion" aria-labelledby={`o-${o.orden_id}`}>
          <h2 id={`o-${o.orden_id}`}>{o.folio} · {o.proveedor}</h2>
          <p className="saldo-nota">Confirmada el {fechaTexto(o.confirmada_en.slice(0, 10))}</p>
          <div className="tarjetas">
            {pendientes.filter((r) => r.orden_id === o.orden_id).map((r) => {
              const falta = Math.round((Number(r.cantidad) - Number(r.recibido)) * 1000) / 1000;
              return (
                <article key={r.renglon_id} className="tarjeta">
                  <div className="tarjeta-encabezado">
                    <div>
                      <h3>{r.descripcion}</h3>
                      <p className="tarjeta-estado">{r.tipo === "servicio" ? "Servicio" : `Faltan ${falta} ${r.unidad} de ${r.cantidad}`}</p>
                    </div>
                  </div>
                  {!soloLectura && (
                    <form action={recibirRenglon} className="formulario">
                      <input type="hidden" name="renglon_id" value={r.renglon_id} />
                      <div className="rejilla">
                        <div className="campo">
                          <label htmlFor={`c-${r.renglon_id}`}>{r.tipo === "servicio" ? "¿Se realizó? (1 = sí)" : `Cantidad recibida (${r.unidad})`}</label>
                          <input id={`c-${r.renglon_id}`} name="cantidad" inputMode="decimal" defaultValue={falta} required />
                        </div>
                        <div className="campo">
                          <label htmlFor={`f-${r.renglon_id}`}>Fecha</label>
                          <input id={`f-${r.renglon_id}`} name="fecha" type="date" defaultValue={hoy} max={hoy} required />
                        </div>
                      </div>
                      <div className="campo">
                        <label htmlFor={`foto-${r.renglon_id}`}>Foto de la remisión o del equipo (opcional)</label>
                        <input id={`foto-${r.renglon_id}`} name="foto" type="file" accept="image/*" capture="environment" />
                      </div>
                      <BotonEnviar pendiente="Registrando…">Registrar recepción</BotonEnviar>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 3: "Por recibir" card in Inicio**

In `app/(app)/page.tsx`:
- add imports: `import { avanceRenglon } from "@/lib/compras/ordenes";` and add `puedeRecibirCompras` to an import from `@/lib/roles` (`import { puedeRecibirCompras } from "@/lib/roles";`).
- after the `Promise.all` that loads saldos/pendientes/nombres, add:

```ts
  const { data: porRecibir } = puedeRecibirCompras(perfil.rol)
    ? await supabase.rpc("ordenes_por_recibir").returns<{ orden_id: string; cantidad: number; recibido: number }[]>()
    : { data: [] };
  const ordenesPorRecibir = new Set((porRecibir ?? [])
    .filter((r) => avanceRenglon(Number(r.cantidad), Number(r.recibido)) !== "completa").map((r) => r.orden_id)).size;
```

- right before the `<section className="seccion" aria-labelledby="t-pendientes">` block, add:

```tsx
      {ordenesPorRecibir > 0 && (
        <section className="seccion" aria-labelledby="t-por-recibir">
          <h2 id="t-por-recibir">Por recibir</h2>
          <p>{ordenesPorRecibir === 1 ? "Hay 1 orden de compra" : `Hay ${ordenesPorRecibir} órdenes de compra`} con equipo, servicios u otros por recibir.</p>
          <Link className="boton" href="/recepciones">Registrar lo recibido</Link>
        </section>
      )}
```

- [ ] **Step 4: README**

Append to the "Compras (oficina central)" section of `README.md`:

```markdown
- **Órdenes** (fase 2): cada documento empieza como cotización (borrador → enviada) y al confirmarlo es la orden de compra (folio OC-0001). "Pedir a otro proveedor" crea una cotización alternativa del mismo grupo; al confirmar una, las demás se cancelan solas. Confirmar actualiza el último precio de cada artículo con ese proveedor. PDF para mandar al proveedor en `/orden-compra/<id>`.
- **Recepciones**: los consumibles llegan del *Incoming supplies* de Dodo IS (Compras → Recepciones) y se ligan solos al renglón de la orden confirmada de la misma sucursal y el mismo insumo, entre la confirmación y 7 días después; lo que no se liga queda "Por revisar". Activos fijos, servicios y otros los registra el gerente o encargado en **Recepciones** de su sucursal (sin ver precios), con foto opcional. Una orden con algo recibido ya no se cancela: se cierra con motivo.

Migración `0012_compras_ordenes.sql` y su prueba `supabase/pruebas/0012_compras_ordenes.sql`.
```

- [ ] **Step 5: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build && npm test`
Expected: all succeed; build lists `/recepciones`.

Visual check: temp page rendering two "por recibir" cards (one servicio, one activo fijo) with their forms at 375 px, no horizontal scroll, date input max = today. Delete temp page and `.next`.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/recepciones" "app/(app)/page.tsx" README.md
git commit -m "feat(compras): recepción en la sucursal y aviso en Inicio"
```

---

## After all tasks

- Final whole-branch review (fresh reviewer, most capable model) against this plan and spec sections 2–3.
- Push `feat/compras-ordenes`; Sebastián runs `0012_compras_ordenes.sql` then `pruebas/0012_compras_ordenes.sql` and confirms **PRUEBAS OK**; only then merge to main and copy changed files to `C:\Users\sebcm\Downloads\dodo-control-efectivo_1\dodo-efectivo`.
