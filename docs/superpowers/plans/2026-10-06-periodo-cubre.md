# Periodo que cubre cada factura — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El P&L reparte cada factura por los días del periodo que cubre (meses completos), no por su fecha de emisión.

**Architecture:** Cálculo puro del periodo y su fracción en `lib/finanzas/cubre.ts`. La base guarda `facturas.cubre_desde/cubre_hasta` (las existentes, su mes de emisión), los llena al dar de alta con la regla del proveedor (`proveedores.cubre_meses/cubre_inicio`) mediante un trigger, y deja corregirlos con `cambiar_periodo_factura`. `datosPL` lee las facturas cuyo periodo se traslapa con el rango y pondera cada una por días.

**Tech Stack:** Next.js 15, React 19, TypeScript estricto, Supabase, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-periodo-cubre-design.md`

## Global Constraints

- Periodo = meses completos: `cubre_desde` es día 1, `cubre_hasta` es el último día del mes; de 1 a 24 meses al corregir; la regla del proveedor es de 1 a 12 meses.
- Inicio de la regla: `anteriores` (los N meses que terminan en el mes anterior a la emisión), `emision` (por omisión), `siguiente`.
- Fracción en el P&L = días del periodo dentro del rango / días del periodo.
- Las facturas existentes quedan con su mes de emisión. Pagos, vencimientos, IVA, caja chica y nómina no cambian.
- Aviso: facturas capturadas (`creado_en`, fecha de CDMX) después del último día del mes de `hasta` del rango.
- Los módulos de `lib/` se importan entre sí solo como tipos; CRLF; reemplazos con función; pruebas nuevas al script `test` con `node ../agregar-test.cjs <archivo>`.
- Después de `review-package`, volver a la rama antes de arreglar.

## Review Focus

1. **Periodo vacío** (`desde > hasta`, p. ej. el día 1 del mes en curso): ninguna factura entra ni avisa (Tarea 3; `fraccionCubre` con rango vacío en Tarea 1).
2. **Cambio de año** en la regla (anteriores en enero, siguiente en diciembre) en TS y en SQL (Tareas 1 y 2).
3. **Nota de crédito** de un recibo bimestral: resta en los mismos meses y sigue a su factura si se corrige el periodo (Tarea 2).
4. **Mes en curso**: una factura capturada hoy no se marca como "llegó después del cierre" (Tarea 1, `capturasTardias`).
5. **Semana que cruza meses**: el recibo entra solo por los días de la semana que caen en su periodo (Tarea 1).

---

### Task 1: Cálculo del periodo (`lib/finanzas/cubre.ts`), regla en el proveedor y fracción por factura

**Files:** Create `lib/finanzas/cubre.ts`, `lib/finanzas/cubre.test.ts`; Modify `lib/compras/proveedores.ts`, `lib/compras/proveedores.test.ts`, `lib/finanzas/gastos.ts`, `lib/finanzas/gastos.test.ts`, `package.json`.

**Interfaces — Produces:**
- `lib/compras/proveedores.ts`: `INICIOS_CUBRE`, `type InicioCubre = "anteriores" | "emision" | "siguiente"`, `NOMBRE_INICIO_CUBRE`, `DatosProveedor.cubre_meses: number`, `DatosProveedor.cubre_inicio: InicioCubre`.
- `lib/finanzas/cubre.ts`: `sumarMeses(mes, n)`, `ultimoDiaMes(mes)`, `periodoCubre(fecha, meses, inicio): Rango`, `fraccionCubre(cubre, rango): { dias; total; fraccion }`, `textoCubre(cubre)`, `esMesDeEmision(cubre, fecha)`, `leerPeriodoMeses(desde, hasta): { periodo: Rango | null } | { error }`, `capturasTardias(facturas, hasta): { n; monto }`.
- `lib/finanzas/gastos.ts`: `facturasAGastos<F>(facturas: readonly F[], fraccionDe?: (f: F) => number)` (antes recibía la fecha).

- [ ] **Step 1: Pruebas** — `lib/finanzas/cubre.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { capturasTardias, esMesDeEmision, fraccionCubre, leerPeriodoMeses, periodoCubre, sumarMeses, textoCubre, ultimoDiaMes } from "./cubre.ts";
import { facturasAGastos } from "./gastos.ts";

test("sumarMeses y último día del mes (bisiesto, cambio de año)", () => {
  assert.equal(sumarMeses("2026-10", 3), "2027-01");
  assert.equal(sumarMeses("2026-01", -2), "2025-11");
  assert.equal(ultimoDiaMes("2028-02"), "2028-02-29");
  assert.equal(ultimoDiaMes("2026-02"), "2026-02-28");
  assert.equal(ultimoDiaMes("2026-12"), "2026-12-31");
});

test("periodoCubre con cada regla", () => {
  assert.deepEqual(periodoCubre("2026-10-05", 2, "anteriores"), { desde: "2026-08-01", hasta: "2026-09-30" });
  assert.deepEqual(periodoCubre("2026-10-03", 3, "emision"), { desde: "2026-10-01", hasta: "2026-12-31" });
  assert.deepEqual(periodoCubre("2026-09-28", 1, "siguiente"), { desde: "2026-10-01", hasta: "2026-10-31" });
  assert.deepEqual(periodoCubre("2026-01-15", 2, "anteriores"), { desde: "2025-11-01", hasta: "2025-12-31" });
  assert.deepEqual(periodoCubre("2026-12-10", 1, "siguiente"), { desde: "2027-01-01", hasta: "2027-01-31" });
  assert.deepEqual(periodoCubre("2026-10-31", 1, "emision"), { desde: "2026-10-01", hasta: "2026-10-31" });
});

test("fraccionCubre: dentro, parcial, fuera, semana que cruza meses y periodo vacío", () => {
  const cfe = { desde: "2026-08-01", hasta: "2026-09-30" };   // 61 días
  assert.deepEqual(fraccionCubre(cfe, { desde: "2026-08-01", hasta: "2026-08-31" }), { dias: 31, total: 61, fraccion: 31 / 61 });
  assert.deepEqual(fraccionCubre(cfe, { desde: "2026-09-28", hasta: "2026-10-04" }), { dias: 3, total: 61, fraccion: 3 / 61 });
  assert.equal(fraccionCubre(cfe, { desde: "2026-10-01", hasta: "2026-10-31" }).fraccion, 0);
  assert.equal(fraccionCubre(cfe, { desde: "2026-01-01", hasta: "2026-12-31" }).fraccion, 1);
  assert.equal(fraccionCubre({ desde: "2026-10-01", hasta: "2026-10-31" }, { desde: "2026-10-01", hasta: "2026-09-30" }).fraccion, 0);
});

test("un recibo bimestral de $4,000 queda repartido entre agosto y septiembre", () => {
  const recibo = { tipo: "ingreso" as const, estado: "por_pagar", subtotal: 4000, descuento: 0, cuenta_pl: "servicios", cubre: { desde: "2026-08-01", hasta: "2026-09-30" } };
  const mes = (desde: string, hasta: string) => facturasAGastos([recibo], (f) => fraccionCubre(f.cubre, { desde, hasta }).fraccion).gastos.servicios ?? 0;
  assert.equal(mes("2026-08-01", "2026-08-31"), 2032.79);
  assert.equal(mes("2026-09-01", "2026-09-30"), 1967.21);
  assert.equal(mes("2026-10-01", "2026-10-31"), 0);
});

test("textoCubre y mes de emisión", () => {
  assert.equal(textoCubre({ desde: "2026-10-01", hasta: "2026-10-31" }), "octubre 2026");
  assert.equal(textoCubre({ desde: "2026-08-01", hasta: "2026-09-30" }), "agosto–septiembre 2026");
  assert.equal(textoCubre({ desde: "2026-12-01", hasta: "2027-02-28" }), "diciembre 2026–febrero 2027");
  assert.equal(esMesDeEmision({ desde: "2026-10-01", hasta: "2026-10-31" }, "2026-10-17"), true);
  assert.equal(esMesDeEmision({ desde: "2026-08-01", hasta: "2026-09-30" }, "2026-10-05"), false);
});

test("leerPeriodoMeses: los dos vacíos = regla del proveedor; meses completos; hasta 24 meses", () => {
  assert.deepEqual(leerPeriodoMeses("", ""), { periodo: null });
  assert.deepEqual(leerPeriodoMeses("2026-08", "2026-09"), { periodo: { desde: "2026-08-01", hasta: "2026-09-30" } });
  assert.deepEqual(leerPeriodoMeses("2026-08", ""), { error: "Elige de qué mes a qué mes cubre." });
  assert.deepEqual(leerPeriodoMeses("2026-10", "2026-09"), { error: "El periodo no puede terminar antes de empezar." });
  assert.deepEqual(leerPeriodoMeses("2026-01", "2027-12"), { periodo: { desde: "2026-01-01", hasta: "2027-12-31" } });
  assert.deepEqual(leerPeriodoMeses("2026-01", "2028-01"), { error: "El periodo es de hasta 24 meses." });
});

test("capturasTardias: solo las capturadas después de que terminó el mes del rango", () => {
  const f = [
    { capturada: "2026-09-30", monto: 100 },
    { capturada: "2026-10-05", monto: 1967.21 },
    { capturada: "2026-10-06", monto: 0 },
  ];
  assert.deepEqual(capturasTardias(f, "2026-09-30"), { n: 1, monto: 1967.21 });
  assert.deepEqual(capturasTardias(f, "2026-09-13"), { n: 1, monto: 1967.21 });   // una semana de septiembre
  assert.deepEqual(capturasTardias(f, "2026-10-05"), { n: 0, monto: 0 });          // mes en curso
});
```

En `lib/compras/proveedores.test.ts`, en la primera `deepEqual` de `r.datos`, reemplaza `cuenta_pl: null, sucursal_id: null,` por `cuenta_pl: null, sucursal_id: null, cubre_meses: 1, cubre_inicio: "emision",` y agrega al final del archivo:

```ts
test("regla del periodo del proveedor: por omisión 1 mes desde la emisión; de 1 a 12 meses", () => {
  const r = leerProveedor(campos({ ...base, cubre_meses: "2", cubre_inicio: "anteriores" }));
  assert.ok("datos" in r);
  assert.equal(r.datos.cubre_meses, 2);
  assert.equal(r.datos.cubre_inicio, "anteriores");
  for (const malo of ["0", "13", "1.5", "dos"]) {
    assert.deepEqual(leerProveedor(campos({ ...base, cubre_meses: malo })), { error: "Cada recibo cubre de 1 a 12 meses." });
  }
  assert.deepEqual(leerProveedor(campos({ ...base, cubre_inicio: "despues" })), { error: "Elige desde qué mes cubre cada recibo." });
});
```

En `lib/finanzas/gastos.test.ts`, la prueba "facturasAGastos con fracción" pasa a recibir la factura: reemplaza
`], (f) => (f.startsWith("2026-09") ? 0.1 : 4 / 31));` por `], (f) => (f.fecha_emision?.startsWith("2026-09") ? 0.1 : 4 / 31));`
y su título por `"facturasAGastos con fracción: cada factura por su propia fracción"`.

Agrega la prueba nueva al script: `node ../agregar-test.cjs lib/finanzas/cubre.test.ts`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm test 2>&1 | tail -5`
Expected: FAIL (no existe `cubre.ts`; `cubre_meses` no viene en los datos del proveedor; `f.startsWith` ya no aplica).

- [ ] **Step 3: Implementación** — `lib/finanzas/cubre.ts`:

```ts
/**
 * Periodo que cubre una factura, en meses completos (el recibo bimestral de CFE cubre agosto–septiembre aunque se emita en
 * octubre). El P&L reparte cada factura por los días de su periodo que caen en el rango, no por su fecha de emisión.
 */
import type { InicioCubre } from "../compras/proveedores";
import type { Rango } from "./periodo";

const DIA = 86_400_000;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const diasEntre = (desde: string, hasta: string) =>
  hasta < desde ? 0 : Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA) + 1;

/** "2026-10" más n meses (n puede ser negativo). */
export function sumarMeses(mes: string, n: number): string {
  const total = Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "2026-02" → "2026-02-28". */
export const ultimoDiaMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Periodo por la regla del proveedor: N meses desde los anteriores a la emisión, el de emisión o el siguiente. */
export function periodoCubre(fecha: string, meses: number, inicio: InicioCubre): Rango {
  const mes = fecha.slice(0, 7);
  const primero = inicio === "anteriores" ? sumarMeses(mes, -meses) : inicio === "siguiente" ? sumarMeses(mes, 1) : mes;
  return { desde: `${primero}-01`, hasta: ultimoDiaMes(sumarMeses(primero, meses - 1)) };
}

/** Días del periodo que caen en el rango, días del periodo y la fracción que le toca al rango. */
export function fraccionCubre(cubre: Rango, rango: Rango): { dias: number; total: number; fraccion: number } {
  const total = diasEntre(cubre.desde, cubre.hasta);
  const dias = diasEntre(cubre.desde > rango.desde ? cubre.desde : rango.desde, cubre.hasta < rango.hasta ? cubre.hasta : rango.hasta);
  return { dias, total, fraccion: total ? dias / total : 0 };
}

const nombreMes = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];

/** "octubre 2026", "agosto–septiembre 2026", "diciembre 2026–febrero 2027". */
export function textoCubre(cubre: Rango): string {
  const a = cubre.desde.slice(0, 7), b = cubre.hasta.slice(0, 7);
  if (a === b) return `${nombreMes(a)} ${a.slice(0, 4)}`;
  if (a.slice(0, 4) === b.slice(0, 4)) return `${nombreMes(a)}–${nombreMes(b)} ${a.slice(0, 4)}`;
  return `${nombreMes(a)} ${a.slice(0, 4)}–${nombreMes(b)} ${b.slice(0, 4)}`;
}

/** ¿Cubre solo el mes en que se emitió? (lo de siempre: no hace falta decirlo en el P&L). */
export const esMesDeEmision = (cubre: Rango, fecha: string) =>
  cubre.desde === `${fecha.slice(0, 7)}-01` && cubre.hasta === ultimoDiaMes(fecha.slice(0, 7));

export const MAX_MESES_CUBRE = 24;
const MES = /^20\d\d-(0[1-9]|1[0-2])$/;

/** Lee "de qué mes a qué mes" (AAAA-MM). Los dos vacíos: null (queda la regla del proveedor). */
export function leerPeriodoMeses(desde: string, hasta: string): { periodo: Rango | null } | { error: string } {
  const a = desde.trim(), b = hasta.trim();
  if (!a && !b) return { periodo: null };
  if (!MES.test(a) || !MES.test(b)) return { error: "Elige de qué mes a qué mes cubre." };
  if (b < a) return { error: "El periodo no puede terminar antes de empezar." };
  if (sumarMeses(a, MAX_MESES_CUBRE - 1) < b) return { error: `El periodo es de hasta ${MAX_MESES_CUBRE} meses.` };
  return { periodo: { desde: `${a}-01`, hasta: ultimoDiaMes(b) } };
}

/** Facturas con monto en el rango capturadas después de que terminó el mes de `hasta` (llegaron con el mes cerrado). */
export function capturasTardias(facturas: readonly { capturada: string; monto: number }[], hasta: string): { n: number; monto: number } {
  const cierre = ultimoDiaMes(hasta.slice(0, 7));
  const tarde = facturas.filter((f) => f.capturada > cierre && f.monto !== 0);
  return { n: tarde.length, monto: Math.round(tarde.reduce((t, f) => t + f.monto, 0) * 100) / 100 };
}
```

`lib/compras/proveedores.ts` — después de `NOMBRE_TASA_IVA`:

```ts
/** Desde qué mes cubre cada recibo del proveedor (el P&L lo reparte en esos meses). */
export const INICIOS_CUBRE = ["anteriores", "emision", "siguiente"] as const;
export type InicioCubre = (typeof INICIOS_CUBRE)[number];
export const NOMBRE_INICIO_CUBRE: Record<InicioCubre, string> = {
  anteriores: "Los meses anteriores a la emisión (luz, agua, teléfono)",
  emision: "Desde el mes de emisión",
  siguiente: "Desde el mes siguiente (renta facturada a fin de mes)",
};
```

En `DatosProveedor`, después de `sucursal_id: string | null;`:

```ts
  /** Cada recibo cubre N meses (1–12) desde `cubre_inicio`. */
  cubre_meses: number;
  cubre_inicio: InicioCubre;
```

En `leerProveedor`, antes de `const categorias: CategoriaCompra[] = [];`:

```ts
  const textoMeses = valor("cubre_meses").trim();
  const cubre_meses = textoMeses === "" ? 1 : Number(textoMeses);
  if (!Number.isInteger(cubre_meses) || cubre_meses < 1 || cubre_meses > 12) return { error: "Cada recibo cubre de 1 a 12 meses." };
  const textoInicio = valor("cubre_inicio").trim() || "emision";
  if (!(INICIOS_CUBRE as readonly string[]).includes(textoInicio)) return { error: "Elige desde qué mes cubre cada recibo." };
```

y en el `return`, reemplaza `numero_cliente, dias_entrega, cuenta_pl, sucursal_id,` por
`numero_cliente, dias_entrega, cuenta_pl, sucursal_id, cubre_meses, cubre_inicio: textoInicio as InicioCubre,`.

`lib/finanzas/gastos.ts` — reemplaza el comentario y la firma de `facturasAGastos` y su llamada a `fraccionDe`:

```ts
/** Facturas → gasto por cuenta (por concepto cuando los trae). Con `fraccionDe`, cada una por la parte que le toca al periodo. */
export function facturasAGastos<F extends FacturaGasto>(facturas: readonly F[], fraccionDe?: (f: F) => number) {
```

```ts
    for (const p of partesFactura(f, fraccionDe ? fraccionDe(f) : 1)) {
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm test 2>&1 | tail -5` y `node node_modules/typescript/bin/tsc --noEmit`
Expected: todas pasan; tsc marca solo `app/finanzas/datos.ts` (sigue pasando una función de fecha a `facturasAGastos`), que se arregla en la Tarea 3. Si marca otra cosa, corrígela.

- [ ] **Step 5: Commit**

```bash
git add lib package.json
git commit -m "feat(finanzas): periodo que cubre cada factura y regla del proveedor"
```

---

### Task 2: Migración 0029 y su prueba SQL

**Files:** Create `supabase/migrations/0029_periodo_cubre.sql`, `supabase/pruebas/0029_periodo_cubre.sql`.

**Interfaces — Produces:** columnas `proveedores.cubre_meses smallint`, `proveedores.cubre_inicio text`, `facturas.cubre_desde date`, `facturas.cubre_hasta date` (también en la vista `facturas_saldo`); `periodo_cubre(date, integer, text) → (desde, hasta)`; `cambiar_periodo_factura(p_factura uuid, p_desde date, p_hasta date)`.

- [ ] **Step 1: Prueba SQL** — `supabase/pruebas/0029_periodo_cubre.sql`:

```sql
-- Pruebas de la migración 0029 (periodo que cubre cada factura). Córrelas completas en Supabase → SQL Editor justo después de la migración.
-- Necesitan un admin activo y un usuario corporativo activo. Si no hay datos de la empresa, usa unos de prueba (se deshace).
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_prov uuid; v_f uuid; v_ing uuid; v_nota uuid; v_p record; v_rfc text;
  v_ok text[] := '{}';
  ren jsonb := jsonb_build_array(jsonb_build_object('descripcion', 'Luz', 'importe', 100, 'cuenta_pl', 'servicios'));
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_a is null or v_c is null then raise exception 'FALTAN DATOS: se necesitan un admin y un corporativo activos.'; end if;
  if not exists (select 1 from empresa) then insert into empresa (rfc, razon_social) values ('DMX010101AB1', 'Empresa de prueba'); end if;
  select rfc into v_rfc from empresa;

  if exists (select 1 from facturas where cubre_desde <> date_trunc('month', fecha_emision)::date
                                       or cubre_hasta <> (date_trunc('month', fecha_emision) + interval '1 month - 1 day')::date) then
    raise exception 'FALLÓ: las facturas existentes quedan en su mes de emisión';
  end if;

  select * into v_p from periodo_cubre('2026-10-05', 2, 'anteriores');
  if v_p.desde <> '2026-08-01' or v_p.hasta <> '2026-09-30' then raise exception 'FALLÓ: anteriores (CFE): % a %', v_p.desde, v_p.hasta; end if;
  select * into v_p from periodo_cubre('2026-10-03', 3, 'emision');
  if v_p.desde <> '2026-10-01' or v_p.hasta <> '2026-12-31' then raise exception 'FALLÓ: desde la emisión: % a %', v_p.desde, v_p.hasta; end if;
  select * into v_p from periodo_cubre('2026-09-28', 1, 'siguiente');
  if v_p.desde <> '2026-10-01' or v_p.hasta <> '2026-10-31' then raise exception 'FALLÓ: mes siguiente: % a %', v_p.desde, v_p.hasta; end if;
  select * into v_p from periodo_cubre('2026-01-15', 2, 'anteriores');
  if v_p.desde <> '2025-11-01' or v_p.hasta <> '2025-12-31' then raise exception 'FALLÓ: anteriores en enero: % a %', v_p.desde, v_p.hasta; end if;
  select * into v_p from periodo_cubre('2026-12-10', 1, 'siguiente');
  if v_p.desde <> '2027-01-01' or v_p.hasta <> '2027-01-31' then raise exception 'FALLÓ: siguiente en diciembre: % a %', v_p.desde, v_p.hasta; end if;
  v_ok := array_append(v_ok, 'existentes en su mes; periodo_cubre con cada regla y cambio de año');

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  insert into proveedores (razon_social, rfc, regimen_fiscal, cubre_meses, cubre_inicio)
  values ('Proveedor 0029', 'PRUE800101AB2', '601', 2, 'anteriores') returning id into v_prov;
  v_f := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'CFE-1',
    'renglones', ren, 'subtotal', 100, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 100));
  select * into v_p from periodo_cubre(hoy_mx(), 2, 'anteriores');
  if (select cubre_desde from facturas where id = v_f) <> v_p.desde or (select cubre_hasta from facturas where id = v_f) <> v_p.hasta then
    raise exception 'FALLÓ: el gasto toma la regla del proveedor';
  end if;
  v_ok := array_append(v_ok, 'alta con la regla del proveedor');

  insert into facturas (origen, uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('cfdi', 'PRUEBA-0029-ING', 'ingreso', hoy_mx(), 'PRUE800101AB2', 'Proveedor 0029', '601', v_rfc, 100, 100, v_prov, hoy_mx(), 'prueba-0029.xml')
  returning id into v_ing;
  perform cambiar_periodo_factura(v_ing, '2026-01-15', '2026-03-10');
  if (select cubre_desde from facturas where id = v_ing) <> '2026-01-01' or (select cubre_hasta from facturas where id = v_ing) <> '2026-03-31' then
    raise exception 'FALLÓ: cambiar el periodo lo deja en meses completos';
  end if;
  insert into facturas (origen, uuid, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta, uuid_relacionado)
  values ('cfdi', 'PRUEBA-0029-EGR', 'egreso', hoy_mx(), 'PRUE800101AB2', 'Proveedor 0029', '601', v_rfc, 10, 10, v_prov, hoy_mx(), 'prueba-0029-nc.xml', 'PRUEBA-0029-ING')
  returning id into v_nota;
  if (select cubre_desde from facturas where id = v_nota) <> '2026-01-01' or (select cubre_hasta from facturas where id = v_nota) <> '2026-03-31' then
    raise exception 'FALLÓ: la nota de crédito cubre lo mismo que su factura';
  end if;
  perform cambiar_periodo_factura(v_ing, '2026-04-01', '2026-04-30');
  if (select cubre_desde from facturas where id = v_nota) <> '2026-04-01' then raise exception 'FALLÓ: la nota sigue el periodo de su factura'; end if;
  v_ok := array_append(v_ok, 'cambiar periodo: meses completos y la nota de crédito lo sigue');

  begin
    perform cambiar_periodo_factura(v_ing, '2026-05-01', '2026-04-01');
    raise exception 'FALLÓ: un periodo al revés no pasa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'El periodo no puede terminar antes de empezar.' then raise exception 'FALLÓ: mensaje inesperado (al revés): %', sqlerrm; end if;
  end;
  begin
    perform cambiar_periodo_factura(v_ing, '2026-01-01', '2028-01-01');
    raise exception 'FALLÓ: más de 24 meses no pasa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'El periodo es de hasta 24 meses.' then raise exception 'FALLÓ: mensaje inesperado (24 meses): %', sqlerrm; end if;
  end;
  perform cancelar_factura(v_f, 'Prueba 0029');
  begin
    perform cambiar_periodo_factura(v_f, '2026-01-01', '2026-01-31');
    raise exception 'FALLÓ: una cancelada no cambia de periodo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Factura no encontrada o cancelada' then raise exception 'FALLÓ: mensaje inesperado (cancelada): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'rechaza al revés, más de 24 meses y canceladas');

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform cambiar_periodo_factura(v_ing, '2026-01-01', '2026-01-31');
    raise exception 'FALLÓ: corporativo no cambia periodos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo no cambia periodos');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 2: Migración** — `supabase/migrations/0029_periodo_cubre.sql`:

```sql
-- Periodo que cubre cada factura: el P&L la reparte por los días de ese periodo (meses completos), no por su fecha de emisión.
-- Cada proveedor tiene su regla (cada recibo cubre N meses: los anteriores a la emisión, desde el de emisión o desde el siguiente).
-- Las facturas que ya existen quedan con su mes de emisión. Requiere 0001–0028.

alter table proveedores
  add column cubre_meses smallint not null default 1 check (cubre_meses between 1 and 12),
  add column cubre_inicio text not null default 'emision' check (cubre_inicio in ('anteriores', 'emision', 'siguiente'));

alter table facturas add column cubre_desde date, add column cubre_hasta date;
update facturas set cubre_desde = date_trunc('month', fecha_emision)::date,
                    cubre_hasta = (date_trunc('month', fecha_emision) + interval '1 month - 1 day')::date;
alter table facturas alter column cubre_desde set not null, alter column cubre_hasta set not null;
alter table facturas add constraint facturas_cubre_meses_completos check (
  cubre_desde <= cubre_hasta and extract(day from cubre_desde) = 1
  and cubre_hasta = (date_trunc('month', cubre_hasta) + interval '1 month - 1 day')::date);
create index facturas_cubre on facturas (cubre_desde, cubre_hasta);

-- La vista se rehace para traer las columnas nuevas.
drop view facturas_saldo;
create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo, neto_factura(f.id) as neto, pagado_factura(f.id) as pagado, falta_complemento(f.id) as falta_complemento
  from facturas f;

-- N meses por la regla: 'anteriores' = los N que terminan el mes anterior a la fecha; 'emision' = desde su mes; 'siguiente' = desde el que sigue.
create or replace function periodo_cubre(p_fecha date, p_meses integer, p_inicio text, out desde date, out hasta date)
language sql immutable set search_path = public as $$
  select d, (d + make_interval(months => p_meses) - interval '1 day')::date
    from (select (date_trunc('month', p_fecha)
                  + case p_inicio when 'anteriores' then make_interval(months => -p_meses)
                                  when 'siguiente' then interval '1 month'
                                  else interval '0' end)::date as d) x
$$;

-- Al dar de alta (XML, gasto sin CFDI): si no trae periodo, la nota de crédito toma el de su factura y lo demás, la regla del proveedor.
create or replace function periodo_cubre_factura() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_desde date; v_hasta date; v_meses integer; v_inicio text;
begin
  if new.cubre_desde is not null and new.cubre_hasta is not null then return new; end if;
  if new.tipo = 'egreso' and new.uuid_relacionado is not null then
    select cubre_desde, cubre_hasta into v_desde, v_hasta from facturas where uuid = new.uuid_relacionado and tipo = 'ingreso';
  end if;
  if v_desde is null then
    select cubre_meses, cubre_inicio into v_meses, v_inicio from proveedores where id = new.proveedor_id;
    select p.desde, p.hasta into v_desde, v_hasta from periodo_cubre(new.fecha_emision, coalesce(v_meses, 1), coalesce(v_inicio, 'emision')) p;
  end if;
  new.cubre_desde := v_desde;
  new.cubre_hasta := v_hasta;
  return new;
end $$;
create trigger facturas_periodo_cubre before insert on facturas for each row execute function periodo_cubre_factura();

-- Corregir el periodo (meses completos, de 1 a 24); sus notas de crédito vigentes lo siguen.
create or replace function cambiar_periodo_factura(p_factura uuid, p_desde date, p_hasta date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := (date_trunc('month', p_hasta) + interval '1 month - 1 day')::date;
  v_uuid text;
begin
  perform exigir_admin_compras();
  if p_desde is null or p_hasta is null then raise exception 'Elige de qué mes a qué mes cubre.'; end if;
  if v_hasta < v_desde then raise exception 'El periodo no puede terminar antes de empezar.'; end if;
  if v_hasta > (v_desde + interval '24 months - 1 day')::date then raise exception 'El periodo es de hasta 24 meses.'; end if;
  update facturas set cubre_desde = v_desde, cubre_hasta = v_hasta where id = p_factura and estado <> 'cancelada' returning uuid into v_uuid;
  if not found then raise exception 'Factura no encontrada o cancelada'; end if;
  if v_uuid is not null then
    update facturas set cubre_desde = v_desde, cubre_hasta = v_hasta
     where tipo = 'egreso' and uuid_relacionado = v_uuid and estado <> 'cancelada';
  end if;
end $$;

revoke execute on function periodo_cubre(date, integer, text), cambiar_periodo_factura(uuid, date, date) from public, anon;
grant execute on function periodo_cubre(date, integer, text), cambiar_periodo_factura(uuid, date, date) to authenticated;
```

- [ ] **Step 3: Revisar** que la migración y la prueba no tengan `%` sueltos en `raise` sin parámetro y que la prueba use `hoy_mx()`.

Run: `grep -n "raise" supabase/migrations/0029_periodo_cubre.sql supabase/pruebas/0029_periodo_cubre.sql`
Expected: cada `%` tiene su parámetro.

- [ ] **Step 4: Commit**

```bash
git add supabase
git commit -m "feat(compras): periodo que cubre cada factura en la base (0029)"
```

Sebastián corre la migración y la prueba en Supabase y pega "PRUEBAS OK" antes de fusionar.

---

### Task 3: El P&L reparte cada factura por su periodo y avisa lo que llegó tarde

**Files:** Modify `app/finanzas/datos.ts`.

**Interfaces — Consumes:** `fraccionCubre`, `textoCubre`, `esMesDeEmision`, `capturasTardias` (Tarea 1); columnas `cubre_desde`, `cubre_hasta` (Tarea 2). `facturasAGastos(facturas, (f) => number)` (Tarea 1).

- [ ] **Step 1: Cambios** en `app/finanzas/datos.ts`:

1. Imports: agrega `import { capturasTardias, esMesDeEmision, fraccionCubre, textoCubre } from "@/lib/finanzas/cubre";` y cambia `import { hoyMX, pesos } from "@/lib/formato";` por `import { fechaMX, hoyMX, pesos } from "@/lib/formato";`.
2. Comentario de `datosPL`: reemplaza `(nómina, gastos del mes, facturas, oficina) de cada mes que toca × la fracción de días de ese mes que entra.` por `(nómina, oficina) de cada mes que toca × la fracción de días de ese mes que entra; cada factura, por los días de su periodo (lo que cubre) que caen en el rango.`
3. Borra la línea `const fraccionDe = (f: string) => mesDe.get(f.slice(0, 7))?.fraccion ?? 0;` y las dos de `iniMeses` / `finMeses`.
4. En `FacturaPL`, después de `fecha_emision: string;` agrega `cubre_desde: string; cubre_hasta: string; creado_en: string;`.
5. La consulta de facturas pasa a ser:

```ts
    desde > hasta ? Promise.resolve([] as FacturaPL[]) : leerTodo<FacturaPL>((d, h) => supabase.from("facturas")
      .select("sucursal_id, tipo, estado, subtotal, descuento, cuenta_pl, serie, folio, nombre_emisor, fecha_emision, cubre_desde, cubre_hasta, creado_en, origen, factura_conceptos(descripcion, importe, cuenta_pl)")
      .lte("cubre_desde", hasta).gte("cubre_hasta", desde).order("id").range(d, h).returns<FacturaPL[]>()),
```

6. Reemplaza `// Cada factura se reparte entre sus conceptos (con su cuenta, o la de la factura).` y la línea `const facturas = …` por:

```ts
  // Cada factura entra por los días de su periodo que caen en el rango, repartida entre sus conceptos (con su cuenta, o la de la factura).
  const facturas = facturasLeidas
    .map((x) => ({ ...x, conceptos: x.factura_conceptos, parte: fraccionCubre({ desde: x.cubre_desde, hasta: x.cubre_hasta }, rango) }))
    .filter((x) => x.parte.dias > 0);
  const fraccionDe = (x: (typeof facturas)[number]) => x.parte.fraccion;
  /** "2 recibos llegaron después del cierre del mes: $3,950.00." (capturados cuando el mes del rango ya había terminado). */
  const avisoTardias = (lista: typeof facturas) => {
    const t = capturasTardias(lista.map((x) => ({
      capturada: fechaMX(x.creado_en), monto: partesFactura(x, x.parte.fraccion).reduce((s, p) => s + p.monto, 0),
    })), hasta);
    return t.n ? [`${t.n} ${t.n === 1 ? "recibo llegó" : "recibos llegaron"} después del cierre del mes: ${pesos(t.monto)}.`] : [];
  };
```

7. En el ciclo de facturas de la sucursal, `partesFactura(x, fraccionDe(x.fecha_emision))` pasa a `partesFactura(x, x.parte.fraccion)`, y la línea del detalle:

```ts
      const cubre = { desde: x.cubre_desde, hasta: x.cubre_hasta };
      const periodo = esMesDeEmision(cubre, x.fecha_emision) ? "" : ` · cubre ${textoCubre(cubre)}`;
      const parte = x.parte.fraccion < 1 ? ` · ${pesos(completo)} × ${x.parte.dias}/${x.parte.total}` : "";
      for (const [cuenta, monto] of porCuenta) {
        anotar(s.id, renglonDe(cuenta),
          `${nombre} ${x.serie ?? ""}${x.folio ?? ""} · ${x.nombre_emisor} · ${x.fecha_emision}${porCuenta.size > 1 ? " · parte" : ""}${periodo}${parte}${cuenta ? "" : " · sin cuenta"}`,
          monto);
      }
```

(las tres `const` van justo después de `const nombre = …`).
8. Después de `if (sinCuenta) avisos.push(…);` agrega `avisos.push(...avisoTardias(facturasSuc));`.
9. `avisosOficina` pasa a:

```ts
  const avisosOficina = [
    ...(sinCuentaOf ? [`Oficina central: ${sinCuentaOf} facturas sin sucursal ni cuenta del P&L (se reparten como gasto de oficina).`] : []),
    ...avisoTardias(facturasOf).map((a) => `Oficina central: ${a}`),
  ];
```

- [ ] **Step 2: Verificar**

Run: `node node_modules/typescript/bin/tsc --noEmit` (si `.next/types` está viejo, `rm -rf .next`) y `npm test 2>&1 | tail -5`
Expected: sin errores de tipos; todas las pruebas pasan.

- [ ] **Step 3: Commit**

```bash
git add app/finanzas/datos.ts
git commit -m "feat(finanzas): el P&L reparte cada factura por el periodo que cubre"
```

---

### Task 4: Pantallas — regla del proveedor, periodo en la factura y en el gasto sin CFDI

**Files:** Modify `app/compras/FormProveedor.tsx`, `app/compras/proveedores/[id]/page.tsx`, `app/compras/facturas/[id]/page.tsx`, `app/compras/facturas/acciones.ts`, `app/compras/facturas/nueva/page.tsx`, `app/compras/facturas/nueva/FormGastoManual.tsx`.

**Interfaces — Consumes:** `INICIOS_CUBRE`, `NOMBRE_INICIO_CUBRE`, `InicioCubre` (Tarea 1); `periodoCubre`, `textoCubre`, `leerPeriodoMeses` (Tarea 1); `cambiar_periodo_factura` (Tarea 2).

- [ ] **Step 1: Proveedor.** En `FormProveedor.tsx` importa `INICIOS_CUBRE, NOMBRE_INICIO_CUBRE` de `@/lib/compras/proveedores` y, dentro de la rejilla de "Pago", después del campo `sucursal_id`:

```tsx
        <div className="campo">
          <label htmlFor="cubre_meses">Cada recibo cubre (meses)</label>
          <input id="cubre_meses" name="cubre_meses" type="number" inputMode="numeric" min={1} max={12} step={1} defaultValue={String(inicial?.cubre_meses ?? 1)} />
          <small>Ej. CFE 2, fumigación 3, renta 1. El P&L reparte cada recibo en esos meses.</small>
        </div>
        <div className="campo">
          <label htmlFor="cubre_inicio">Desde qué mes</label>
          <select id="cubre_inicio" name="cubre_inicio" defaultValue={inicial?.cubre_inicio ?? "emision"}>
            {INICIOS_CUBRE.map((i) => <option key={i} value={i}>{NOMBRE_INICIO_CUBRE[i]}</option>)}
          </select>
        </div>
```

En `proveedores/[id]/page.tsx`: agrega `cubre_meses, cubre_inicio` al `select` (después de `sucursal_id`), importa `NOMBRE_INICIO_CUBRE` y, después del renglón "Cuenta del P&L":

```tsx
          <dt>Periodo de cada recibo</dt>
          <dd>{p.cubre_meses === 1 && p.cubre_inicio === "emision" ? "El mes de emisión" : `${p.cubre_meses} ${p.cubre_meses === 1 ? "mes" : "meses"} · ${NOMBRE_INICIO_CUBRE[p.cubre_inicio].toLowerCase()}`}</dd>
```

- [ ] **Step 2: Detalle de la factura.** En `facturas/[id]/page.tsx`: agrega `cubre_desde: string; cubre_hasta: string;` al tipo `Factura` y `cubre_desde, cubre_hasta` al `select` (después de `cuenta_pl`); importa `textoCubre` de `@/lib/finanzas/cubre` y `cambiarPeriodoFactura` de `../acciones`. Después del renglón "Cuenta del P&L" de la tarjeta: `<dt>Cubre</dt><dd>{textoCubre({ desde: f.cubre_desde, hasta: f.cubre_hasta })}</dd>`. Después del formulario de la cuenta:

```tsx
        {edita && (
          <form action={cambiarPeriodoFactura} className="acciones">
            <input type="hidden" name="id" value={f.id} />
            <label htmlFor="cubre_desde" className="etiqueta">Cubre desde</label>
            <input id="cubre_desde" name="cubre_desde" type="month" defaultValue={f.cubre_desde.slice(0, 7)} placeholder="AAAA-MM" required />
            <label htmlFor="cubre_hasta" className="etiqueta">hasta</label>
            <input id="cubre_hasta" name="cubre_hasta" type="month" defaultValue={f.cubre_hasta.slice(0, 7)} placeholder="AAAA-MM" required />
            <BotonEnviar className="boton boton-secundario">Guardar periodo</BotonEnviar>
          </form>
        )}
```

En `facturas/acciones.ts` importa `leerPeriodoMeses` de `@/lib/finanzas/cubre` y agrega después de `asignarCuentaFactura`:

```ts
export async function cambiarPeriodoFactura(fd: FormData) {
  const id = texto(fd, "id");
  const r = leerPeriodoMeses(texto(fd, "cubre_desde"), texto(fd, "cubre_hasta"));
  if ("error" in r) volver(rutaFactura(id), "error", r.error);
  const { periodo } = r as { periodo: { desde: string; hasta: string } | null };
  if (!periodo) volver(rutaFactura(id), "error", "Elige de qué mes a qué mes cubre.");
  await llamarFactura(fd, "cambiar_periodo_factura", { p_factura: id, p_desde: periodo!.desde, p_hasta: periodo!.hasta },
    "Periodo guardado: el P&L reparte la factura en esos meses.");
}
```

- [ ] **Step 3: Gasto sin CFDI.** En `facturas/nueva/page.tsx` el `select` de proveedores agrega `cubre_meses, cubre_inicio` (y su tipo en `returns`), y el `map` pasa `cubre_meses: p.cubre_meses, cubre_inicio: p.cubre_inicio`.

En `FormGastoManual.tsx`: importa `periodoCubre` de `@/lib/finanzas/cubre` y `type InicioCubre` de `@/lib/compras/proveedores`; el tipo `Proveedor` agrega `cubre_meses: number; cubre_inicio: InicioCubre`. Estado y cálculo:

```tsx
  const [fecha, setFecha] = useState(hoy);
  const [cubre, setCubre] = useState({ desde: hoy.slice(0, 7), hasta: hoy.slice(0, 7) });
  /** El periodo sale de la regla del proveedor y la fecha; se puede cambiar a mano. */
  const recalcular = (id: string, f: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) return;
    const p = proveedores.find((x) => x.id === id);
    const c = periodoCubre(f, p?.cubre_meses ?? 1, p?.cubre_inicio ?? "emision");
    setCubre({ desde: c.desde.slice(0, 7), hasta: c.hasta.slice(0, 7) });
  };
```

En `elegirProveedor`, después de `setProveedor(id);` agrega `recalcular(id, fecha);`. El campo de fecha queda controlado:

```tsx
        <div className="campo"><label htmlFor="fecha">Fecha</label><input id="fecha" name="fecha" type="date" value={fecha} max={hoy} required onChange={(e) => { setFecha(e.target.value); recalcular(proveedor, e.target.value); }} /></div>
```

y después del campo `vence_el`:

```tsx
        <div className="campo">
          <label htmlFor="cubre_desde">Cubre desde</label>
          <input id="cubre_desde" name="cubre_desde" type="month" placeholder="AAAA-MM" value={cubre.desde} onChange={(e) => setCubre({ ...cubre, desde: e.target.value })} required />
        </div>
        <div className="campo">
          <label htmlFor="cubre_hasta">Cubre hasta</label>
          <input id="cubre_hasta" name="cubre_hasta" type="month" placeholder="AAAA-MM" value={cubre.hasta} onChange={(e) => setCubre({ ...cubre, hasta: e.target.value })} required />
          <small>Sale de la regla del proveedor; el P&L reparte el gasto en esos meses.</small>
        </div>
```

En `registrarGastoManual` (acciones), después de leer `datos` y antes de subir el adjunto:

```ts
  const c = leerPeriodoMeses(texto(fd, "cubre_desde"), texto(fd, "cubre_hasta"));
  if ("error" in c) volver(ruta, "error", c.error);
  const { periodo } = c as { periodo: { desde: string; hasta: string } | null };
```

y reemplaza el `volver` final por:

```ts
  // La base ya le puso el periodo de la regla del proveedor; se guarda el del formulario (el admin pudo cambiarlo).
  let aviso = "";
  if (periodo) {
    const { error: errorPeriodo } = await supabase.rpc("cambiar_periodo_factura", { p_factura: id, p_desde: periodo.desde, p_hasta: periodo.hasta });
    if (errorPeriodo) aviso = ` El periodo no se guardó (${errorPeriodo.message}); corrígelo aquí.`;
  }
  revalidatePath("/compras", "layout");
  volver(`/compras/facturas/${id}`, "ok", `Gasto sin CFDI registrado.${aviso} Cuando llegue el CFDI, súbelo y elige qué gasto sustituye.`);
```

(borrando el `revalidatePath` que estaba antes de ese `volver`).

- [ ] **Step 4: Verificar**

Run: `node node_modules/typescript/bin/tsc --noEmit` y `npm test 2>&1 | tail -5`
Expected: sin errores; todas pasan.

Vista previa: página temporal `app/login/prueba-periodo/page.tsx` que muestre `FormGastoManual` (con un proveedor CFE `cubre_meses: 2, cubre_inicio: "anteriores"`) y `FormProveedor`. Elegir el proveedor CFE: "Cubre desde/hasta" cambia a los dos meses anteriores; cambiar la fecha los recalcula. Revisar en computadora y en celular (375 px) sin scroll horizontal. Borrar la página temporal.

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat(compras): periodo de cada recibo en proveedor, factura y gasto sin CFDI"
```
