# Aperturas: presupuesto vivo desde CAPEX (HD-3) — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el bloque «Presupuesto del proyecto» de la apertura muestre presupuesto, pagado, facturado, comprometido, cotizado sin OC y faltante por categoría CAPEX, en lugar de la foto del 13-oct.

**Architecture:** Una función pura en `lib/aperturas/presupuestoVivo.ts` combina las filas de `capex_resumen` con las partidas cotizadas sin OC. Un componente de servidor la pinta para quien tiene acceso a Finanzas, con el corte viejo plegado. Un script de carga crea el presupuesto CAPEX de López Mateos desde el corte. No hay migración de esquema.

**Tech Stack:** Next.js 15.5 (componentes de servidor), Supabase, PGlite, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-aperturas-presupuesto-vivo-design.md`

## Global Constraints

- **Rama y commits**
  - Rama `feat/aperturas-presupuesto-vivo` (worktree `C:\Users\sebcm\Downloads\dodo-control-efectivo\wt-help-desk`) con PR hacia `main`.
  - Nada de commits a `main` ni push.
  - Los commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Montos y reglas**
  - Montos sin IVA. El precio de una partida de apertura es unitario con IVA, así que cotizado sin OC = `cantidad × precio / 1.16`.
  - Redondeo a centavos con enteros (`Math.round(n*100)`), como `resumir` en `lib/finanzas/capex.ts`.
  - Cotizado sin OC: `tipo in ('equipo','referencia')`, `estado in ('cotizado','aprobado')`, `cantidad>0`, `precio>0`, `orden_id===null`, categoría con `equivalenciaItem(categoria)`.
  - Falta cotizar = `max(0, presupuesto − comprometido − facturado − cotizado)`; `null` si la categoría no tiene presupuesto.
- **Visibilidad:** la tabla viva solo se muestra con `puedeVerFinanzas(perfil.rol)`. Sin ese permiso queda `CortePresupuesto` como hoy.
- **Carga de López Mateos** (sin IVA): `obra_civil` 1325236.75, `equipo_cocina` 1226257.79, `tecnologia` 128000.00, `mobiliario` 19800.00, `smallware` 170586.80, `proyecto_permisos` 28500.00. Total 2898381.34. Motivo: «Corte del presupuesto del 13-oct-2026 (Dodo2_Presupuesto_Final.xlsx)».
- **Sucursal:** se busca por nombre que empieza con `Guadalajara-1`, nunca por «Dodo-N».
- **Pruebas:** cada archivo de prueba nuevo se agrega al script `test` de `package.json`. Los imports entre archivos de `lib/` probados con node usan extensión `.ts` relativa con `// @ts-expect-error Node strip-types requiere extensión explícita.`
- **Estilo:** Akton, con las clases que ya usan los bloques vecinos (`akton`, `akton-tabla-marco`, `akton-titulo`, `akton-subtitulo`, `akton-tabla`, `tabla-tarjetas`, `akton-subtotal`). Pastel, nada llamativo.

## Review Focus

1. Una categoría sobre presupuesto (comprometido > presupuesto) no puede dar «Falta cotizar» negativo. Prueba en Task 1.
2. Una apertura sin presupuesto CAPEX debe mostrar el aviso y el corte, sin tabla de ceros. Pruebas en Tasks 1 y 2.
3. Una partida cotizada que ya tiene `orden_id` no se cuenta dos veces: ya está en comprometido. Prueba en Task 1.
4. La carga no debe duplicar el presupuesto si ya existe y debe abortar si hay dos sucursales `Guadalajara-1…`. Prueba en Task 3.
5. Quien no tiene acceso a Finanzas no debe ver montos de CAPEX. Prueba en Task 2.

---

### Task 1: Función `presupuestoVivo`

**Files:**
- Create: `lib/aperturas/presupuestoVivo.ts`
- Create: `lib/aperturas/presupuestoVivo.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Consumes:
  - `FilaCapex`, `nombreCategoriaCapex`, `equivalenciaItem` y `CATEGORIAS_CAPEX` de `lib/finanzas/capex.ts`.
  - `ItemApertura` de `lib/aperturas.ts`.
- Produces: `presupuestoVivo(filas: FilaCapex[], items: Pick<ItemApertura,'tipo'|'estado'|'cantidad'|'precio'|'orden_id'|'categoria'>[]): PresupuestoVivo`, donde
  - `type FilaVivo = { clave: string; nombre: string; presupuesto: number|null; pagado: number; facturado: number; comprometido: number; cotizado: number; faltante: number|null }`
  - `type PresupuestoVivo = { categorias: FilaVivo[]; total: FilaVivo; conPresupuesto: boolean }`. En el total, `clave='total'`, `nombre='Total'`, `presupuesto` es null si ninguna categoría tiene presupuesto, y `faltante` es la suma de los faltantes no nulos (null si no hay presupuesto).
- Las filas salen en el orden de `CATEGORIAS_CAPEX`. Se omiten las categorías sin presupuesto y con todo en 0.

- [ ] **Step 1: Write the failing test** — `lib/aperturas/presupuestoVivo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error Node strip-types requiere extensión explícita.
import { presupuestoVivo } from "./presupuestoVivo.ts";

const fila = (categoria: string, o: Partial<Record<"presupuesto"|"comprometido"|"facturado"|"pagado", number|null>> = {}) =>
  ({ proyecto_id: "p", categoria, presupuesto: o.presupuesto === undefined ? null : o.presupuesto, comprometido: o.comprometido ?? 0, facturado: o.facturado ?? 0,
     pagado: o.pagado ?? 0, pagado_con_iva: 0, por_pagar_con_iva: 0, por_ejercer: null, desviacion: null });
const item = (o: Partial<{ tipo: string; estado: string; cantidad: number|null; precio: number|null; orden_id: string|null; categoria: string|null }>) =>
  ({ tipo: "equipo", estado: "cotizado", cantidad: 1, precio: 116, orden_id: null, categoria: "equipo_cocina", ...o }) as never;

test("columnas por categoría, total y faltante", () => {
  const r = presupuestoVivo([fila("obra_civil", { presupuesto: 1325236.75, comprometido: 1327071.52 }), fila("equipo_cocina", { presupuesto: 1226257.79, facturado: 553356.47, pagado: 553356.47 })],
    [item({ precio: 113620.5 * 1.16, cantidad: 1 })]);
  const obra = r.categorias.find((c) => c.clave === "obra_civil")!, eq = r.categorias.find((c) => c.clave === "equipo_cocina")!;
  assert.equal(obra.faltante, 0, "sobre presupuesto no da negativo");
  assert.equal(eq.cotizado, 113620.5);
  assert.equal(eq.faltante, Math.round((1226257.79 - 553356.47 - 113620.5) * 100) / 100);
  assert.equal(r.total.presupuesto, 2551494.54);
  assert.equal(r.total.faltante, eq.faltante);
  assert.equal(r.conPresupuesto, true);
  assert.deepEqual(r.categorias.map((c) => c.clave), ["obra_civil", "equipo_cocina"]);
});

test("cotizado sin OC: solo cotizado/aprobado, con cantidad y precio, sin orden; sin IVA y por equivalencia", () => {
  const r = presupuestoVivo([], [
    item({ estado: "cotizado", cantidad: 2, precio: 116 }),
    item({ estado: "aprobado", cantidad: 1, precio: 232, categoria: "pisos" }),
    item({ estado: "pedido", cantidad: 1, precio: 1160 }),
    item({ estado: "cotizado", orden_id: "o1", precio: 1160 }),
    item({ estado: "cotizado", precio: null }),
    item({ estado: "cotizado", cantidad: 0 }),
    item({ tipo: "actividad", estado: "cotizado" }),
    item({ tipo: "referencia", estado: "aprobado", cantidad: 1, precio: 116, categoria: null }),
  ]);
  assert.deepEqual(r.categorias.map((c) => [c.clave, c.cotizado]), [["obra_civil", 200], ["equipo_cocina", 200], ["otros", 100]]);
  assert.equal(r.conPresupuesto, false);
  assert.ok(r.categorias.every((c) => c.presupuesto === null && c.faltante === null));
  assert.equal(r.total.presupuesto, null); assert.equal(r.total.faltante, null);
});

test("omite categorías sin presupuesto ni movimiento; centavos exactos", () => {
  const r = presupuestoVivo([fila("tecnologia", { presupuesto: 128000 }), fila("senaletica")], [item({ precio: 0.1 * 1.16, cantidad: 3 })]);
  assert.deepEqual(r.categorias.map((c) => c.clave), ["equipo_cocina", "tecnologia"]);
  assert.equal(r.categorias[0].cotizado, 0.3);
  assert.equal(r.categorias[1].faltante, 128000);
});
```

- [ ] **Step 2: Run to verify it fails**

  Run: `node --experimental-strip-types --test lib/aperturas/presupuestoVivo.test.ts`. Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement** — `lib/aperturas/presupuestoVivo.ts`:

```ts
// Presupuesto vivo de una apertura (HD-3): CAPEX (presupuesto, comprometido, facturado, pagado) más lo cotizado sin orden de compra.
// @ts-expect-error Node strip-types requiere extensión explícita.
import { CATEGORIAS_CAPEX, equivalenciaItem, nombreCategoriaCapex, type FilaCapex } from "../finanzas/capex.ts";
import type { ItemApertura } from "../aperturas";

export type FilaVivo = { clave: string; nombre: string; presupuesto: number | null; pagado: number; facturado: number; comprometido: number; cotizado: number; faltante: number | null };
export type PresupuestoVivo = { categorias: FilaVivo[]; total: FilaVivo; conPresupuesto: boolean };
type ItemCotizado = Pick<ItemApertura, "tipo" | "estado" | "cantidad" | "precio" | "orden_id" | "categoria">;

const c = (n: number) => Math.round(n * 100);
const IVA = 1.16;

/** Cotizado sin OC: equipo o referencia cotizado/aprobado con cantidad y precio y sin orden ligada (lo que ya tiene orden está en comprometido). */
const cotizadoSinOrden = (i: ItemCotizado) =>
  (i.tipo === "equipo" || i.tipo === "referencia") && (i.estado === "cotizado" || i.estado === "aprobado") && i.orden_id === null
  && Number(i.cantidad) > 0 && Number(i.precio) > 0;

export function presupuestoVivo(filas: FilaCapex[], items: ItemCotizado[]): PresupuestoVivo {
  const cotizado = new Map<string, number>();
  for (const i of items.filter(cotizadoSinOrden)) {
    const k = equivalenciaItem(i.categoria);
    cotizado.set(k, (cotizado.get(k) ?? 0) + Math.round(Number(i.cantidad) * Number(i.precio) / IVA * 100));
  }
  const categorias = CATEGORIAS_CAPEX.map(({ clave }): FilaVivo => {
    const de = filas.filter((f) => f.categoria === clave);
    const pres = de.some((f) => f.presupuesto !== null) ? de.reduce((a, f) => a + c(f.presupuesto ?? 0), 0) : null;
    const sum = (k: "pagado" | "facturado" | "comprometido") => de.reduce((a, f) => a + c(Number(f[k])), 0);
    const pagado = sum("pagado"), facturado = sum("facturado"), comprometido = sum("comprometido"), cot = cotizado.get(clave) ?? 0;
    return { clave, nombre: nombreCategoriaCapex(clave), presupuesto: pres === null ? null : pres / 100, pagado: pagado / 100, facturado: facturado / 100,
      comprometido: comprometido / 100, cotizado: cot / 100, faltante: pres === null ? null : Math.max(0, pres - comprometido - facturado - cot) / 100 };
  }).filter((f) => f.presupuesto !== null || f.pagado || f.facturado || f.comprometido || f.cotizado);
  const conPresupuesto = categorias.some((f) => f.presupuesto !== null);
  const suma = (k: "pagado" | "facturado" | "comprometido" | "cotizado") => categorias.reduce((a, f) => a + c(f[k]), 0) / 100;
  const total: FilaVivo = { clave: "total", nombre: "Total",
    presupuesto: conPresupuesto ? categorias.reduce((a, f) => a + c(f.presupuesto ?? 0), 0) / 100 : null,
    pagado: suma("pagado"), facturado: suma("facturado"), comprometido: suma("comprometido"), cotizado: suma("cotizado"),
    faltante: conPresupuesto ? categorias.reduce((a, f) => a + c(f.faltante ?? 0), 0) / 100 : null };
  return { categorias, total, conPresupuesto };
}
```

- [ ] **Step 4: Agrega** ` lib/aperturas/presupuestoVivo.test.ts` al script `test` de `package.json`, junto a `lib/aperturas.test.ts`.

- [ ] **Step 5: Run**

  Run: `node --experimental-strip-types --test lib/aperturas/presupuestoVivo.test.ts && npm run -s typecheck`. Expected: PASS. Si `lib/aperturas/` como carpeta choca con `lib/aperturas.ts` en la resolución de módulos de TS o de Next, reporta BLOCKED con el error exacto en vez de renombrar.

- [ ] **Step 6: Commit** — `feat(aperturas): cálculo del presupuesto vivo desde CAPEX (HD-3)`

---

### Task 2: Componente, página y KPI

**Files** (léelos antes de cambiar):
- Create: `app/aperturas/PresupuestoVivo.tsx`
- Modify: `app/aperturas/CortePresupuesto.tsx`. Agrega la prop opcional `plegado?: boolean`. Con `plegado`, en vez de la sección suelta, devuelve un `<details className="akton">` con `<summary>` «Presupuesto original (corte {fecha})» y la misma tabla y desglose adentro.
- Modify: `app/aperturas/[id]/page.tsx`. Hoy pinta `<CortePresupuesto items={items}/>` en la línea 40 y la tarjeta CAPEX en la 41. Con `puedeVerFinanzas(perfil.rol)` pinta `<PresupuestoVivo db={supabase} proyecto={p} items={items}/>`; sin ese permiso, `<CortePresupuesto items={items}/>`. La tarjeta CAPEX queda igual.
- Modify: `lib/aperturasAkton.ts` (`indicadoresProyecto` y `lecturaApertura`) y `app/aperturas/AktonProyecto.tsx`.
  - Agrega un parámetro opcional `vivo?: { monto: number; presupuesto: number } | null`.
  - Si viene, el KPI «Compras con precio firme» usa `monto` = comprometido + facturado + cotizado sin OC, sobre `presupuesto` CAPEX.
  - Si no, se comporta como hoy.
  - La página obtiene `vivo` con la misma función. Para no consultar `capex_resumen` dos veces, carga los datos en la página y pásalos a `PresupuestoVivo` como prop en lugar de que el componente consulte.
- Create: `tests/aperturasPresupuestoVivoVista.test.mjs`, con pruebas por lectura de fuente (estilo `tests/soporteVista.test.mjs`):
  - la página usa `<PresupuestoVivo` dentro de una condición con `puedeVerFinanzas(` y `<CortePresupuesto` en la otra rama;
  - `PresupuestoVivo.tsx` usa `presupuestoVivo(`, el texto «sin categoría CAPEX», un enlace a `/finanzas/capex/` y `<CortePresupuesto` con `plegado`;
  - `capex_resumen` se consulta con `.eq("proyecto_id"`.
- Modify: `package.json`. Agrega la prueba nueva al script `test`.

**Detalle del componente `PresupuestoVivo`** (recibe `vivo: PresupuestoVivo`, `sinCategoria: number`, `proyectoId`, `items` y un `error: boolean`):

- **Error:** con `error`, muestra `<p className="aviso aviso-error">No se pudo cargar el presupuesto vivo. <Link href=/finanzas/capex/{id}>Abrir en Finanzas</Link></p>` y debajo `<CortePresupuesto items plegado={false}/>`.
- **Sin presupuesto:** con `!vivo.conPresupuesto`, muestra `<p className="aviso">Sin presupuesto CAPEX aprobado para esta apertura. <Link …>Capturarlo en Finanzas</Link></p>`. Si además hay movimientos, los pinta en la tabla. Debajo va el corte sin plegar.
- **Con presupuesto:**
  - Bloque `akton` con título «Presupuesto del proyecto».
  - Subtítulo: «Desde CAPEX · sin IVA · {pesos(total.presupuesto)} presupuestado · {pct ejercido} ejercido».
  - Tabla con columnas Categoría | Presupuesto | Pagado | Facturado | Comprometido | Cotizado sin OC | Falta cotizar. Cada `<td>` lleva `data-label` para celular. La última fila es `akton-subtotal` con el total.
  - Ejercido = comprometido + facturado.
- **Documentos sin categoría:** con `sinCategoria>0`, muestra `<p className="akton-nota">{n} documentos de esta sucursal sin categoría CAPEX: no suman al presupuesto. <Link href=/finanzas/capex/{id}>Asignar categoría</Link></p>`.
- **Al final:** `<CortePresupuesto items={items} plegado/>`. Devuelve null si no hay corte, como hoy.

**Conteo de documentos sin categoría** (en la página, solo con `puedeVerFinanzas`):

- **Órdenes:** `ordenes_compra` con `sucursal_id = proyecto.sucursal_id`, estado `confirmada` y fecha `<= objetivo_hasta + 60 días`, cuyo `id` no esté en `capex_asignaciones.orden_id`.
- **Facturas:** `facturas` de la sucursal, no canceladas, con la misma fecha tope, cuyo `id` no esté en `capex_asignaciones.factura_id`.
- **Columnas:** antes de escribir la consulta, lee `app/finanzas/capex/datos.ts` y las migraciones de `ordenes_compra`/`facturas` para usar los nombres reales de las columnas de fecha y estado. Si no hay una columna de fecha clara, omite el tope de fecha y anótalo en el reporte.
- **Si falla:** el conteo vale 0 y no se muestra el aviso.

- [ ] **Step 1: Write the failing test** (`tests/aperturasPresupuestoVivoVista.test.mjs`) y córrela para verla fallar.
- [ ] **Step 2: Implement.**
- [ ] **Step 3: Run**

  Run: `node --experimental-strip-types --test tests/aperturasPresupuestoVivoVista.test.mjs lib/aperturasAkton.test.ts && npm run -s typecheck && npm run -s build 2>&1 | grep -E "aperturas|Failed|rror"`. Expected: PASS y build sin errores.
- [ ] **Step 4: Commit** — `feat(aperturas): bloque de presupuesto vivo con CAPEX y corte original plegado (HD-3)`

---

### Task 3: Carga del presupuesto CAPEX de López Mateos

**Files:**
- Create: `supabase/cargas/capex_presupuesto_guadalajara1_corte_20261013.sql`
- Create: `supabase/pruebas/capex_presupuesto_guadalajara1_corte_20261013.sql`
- Create: `tests/capexCargaGuadalajara1.test.mjs`
- Modify: `package.json` (script `test`)

- [ ] **Step 1: Lee la base.** Lee `supabase/migrations/20261109180000_capex_aperturas.sql` (`capex_categorias`, `capex_presupuestos` y `aprobar_capex_presupuesto`, que exige `edita_finanzas()` y revisión optimista) y busca cómo otra prueba PGlite arma los stubs para migraciones de finanzas (por ejemplo `tests/capexAperturas.test.mjs`). Reusa ese arranque.

- [ ] **Step 2: Write the failing test** — `tests/capexCargaGuadalajara1.test.mjs`, sobre PGlite con las migraciones o stubs necesarios.
  - **Sembrado:** una sucursal «Guadalajara-1 López Mateos» con su `apertura_proyectos` y un admin activo.
  - **Verifica:**
    1. Correr la carga crea la revisión 1, con los 6 montos del reparto (Global Constraints) y el resto de las categorías en 0. La suma es 2898381.34 y el motivo es el indicado.
    2. Correrla otra vez no crea la revisión 2: el log de notice no se verifica, solo que el conteo de revisiones sigue en 1.
    3. Con una segunda sucursal «Guadalajara-1 Otra» y su proyecto, la carga aborta con un mensaje que menciona `Guadalajara-1`.
    4. El script de `supabase/pruebas` termina en «PRUEBAS OK».

- [ ] **Step 3: Run to verify it fails.**

- [ ] **Step 4: Escribe la carga.** Es un bloque `do $$ … $$;` sin begin/commit externos:
  - busca el proyecto con `join public.sucursales s on s.id=p.sucursal_id where s.nombre ilike 'Guadalajara-1%'`, y si encuentra cero o más de uno aborta con `raise exception 'Se esperaba una sola apertura de Guadalajara-1 y hay %'`;
  - si `exists(select 1 from public.capex_presupuestos where proyecto_id=…)`, hace `raise notice 'Ya hay presupuesto CAPEX: no se carga nada.'` y `return`;
  - toma un admin activo, igual que los scripts de `supabase/pruebas`, y fija `request.jwt.claims`;
  - hace `perform public.aprobar_capex_presupuesto(v_proyecto, 0, jsonb_build_object(...6 montos...), 'Corte del presupuesto del 13-oct-2026 (Dodo2_Presupuesto_Final.xlsx)')`;
  - verifica que la suma de la revisión 1 sea 2898381.34 y, si no, aborta;
  - avisa con `raise notice` qué cargó.

  Agrega al inicio un comentario con el reparto concepto → categoría del spec.

- [ ] **Step 5: Escribe el script de pruebas.** Usa la misma lógica dentro de un `do $$` que, después de cargar (o de encontrar ya cargado), comprueba que el total de la última revisión es 2898381.34 y termina en `raise exception 'PRUEBAS OK'`, que revierte. Si ya había un presupuesto distinto en producción, debe decir «PRUEBAS OK — ya existía presupuesto (revisión N), no se tocó».

- [ ] **Step 6: Agrega** la prueba al script `test`. Run: `node --experimental-strip-types --test tests/capexCargaGuadalajara1.test.mjs`. Expected: PASS.

- [ ] **Step 7: Commit** — `feat(capex): carga del presupuesto de López Mateos desde el corte del 13-oct (HD-3)`

---

### Task 4: Verificación completa

- [ ] `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`: fail 0.
- [ ] `npm run -s typecheck && npm run -s build 2>&1 | grep -E "aperturas|Failed|rror"`: sin errores.
- [ ] Commit de correcciones, si hubo.
