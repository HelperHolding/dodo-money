# Tareas y backlog (fase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Módulo de Tareas en DODO MX: backlog con tablero por estado, *Mis tareas*, detalle con comentarios e historial, y asignación de tareas desde órdenes, facturas, días de venta y aperturas.

**Architecture:** Una migración crea `tareas`, `tarea_comentarios` y `tarea_historial`; todas las escrituras pasan por funciones `security definer` y una sola función `puede_ver_tarea` decide la visibilidad para la RLS y para las funciones de lectura (`tareas_visibles`, `hilo_tarea`), que además devuelven nombres de personas que la RLS de `perfiles` no deja ver. La lógica pura (transiciones, agrupación, filtros, validación de formularios) vive en `lib/tareas.ts`; las páginas en `app/tareas/` son server components con server actions, salvo el tablero (arrastrar y soltar).

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, Supabase (Postgres + RLS), pruebas con `node --test` y PGlite.

**Spec:** `docs/superpowers/specs/2026-11-02-tareas-backlog-design.md`

## Global Constraints

- Migración: `supabase/migrations/20261102120000_tareas.sql`, dentro de `begin; … commit;`. Prueba SQL para Sebastián: `supabase/pruebas/20261102120000_tareas.sql`, que termina con `raise exception 'PRUEBAS OK'`.
- Funciones: `language plpgsql|sql … security definer set search_path=''`, nombres calificados con `public.`; `revoke all … from public,anon` y `grant execute … to authenticated` solo en las que llama la app.
- Comparar puestos siempre como texto: `public.mi_rol()::text = 'admin'`.
- Mensajes de error en español, frase completa, listos para `Aviso` (vía `?error=`).
- Corporativo: solo consulta. El texto exacto es `SOLO_CONSULTA` = «Corporativo solo puede consultar.».
- Estados: `por_hacer`, `en_curso`, `en_revision`, `hecho`, `cancelada`. Prioridades: `alta`, `media`, `baja`. Clave visible `DODO-<numero>`.
- Tipos de documento: `orden`, `factura`, `ventas_dia`, `apertura_proyecto`, `apertura_item`; a lo más uno por tarea.
- UI con tarjetas (`tarjeta`, `insignia[data-tono]`), sin tablas anchas; funciona en celular.
- Cada archivo de prueba nuevo se agrega al script `test` de `package.json` (lista explícita).
- Flujo (AGENTS.md): todo en la rama `docs/tareas-backlog` (renombrar a `feat/tareas-backlog` antes del PR), PR a `main`; la migración la ejecuta Sebastián en producción y las pantallas no se publican hasta tener su resultado.

## Review Focus

- Usuario dado de baja que tenía tareas: `mi_rol()` es null → no ve ni mueve nada; sus tareas siguen visibles para los demás con «asignado inactivo». (Prueba en Task 3.)
- Dos personas mueven la misma tarjeta a la vez: la segunda recibe «La tarea cambió mientras la veías…» por `revision`, sin pisar el cambio. (Prueba en Task 3.)
- Gerente asignado a una tarea de factura (documento que no puede abrir): ve el texto del documento pero no un enlace roto. (Prueba en Task 1, `puedeAbrirDocumento`.)
- Campos con espacios o vacíos en formularios (`vence=""`, título de 2 letras con espacios): se rechazan con mensaje, no con error de cast de Postgres. (Pruebas en Task 1 y Task 2.)
- Encargado intenta asignar a su gerente o a alguien de otra sucursal: rechazado con «Esa persona no puede recibir esta tarea.». (Prueba en Task 2.)

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `lib/tareas.ts` | Tipos, catálogos (estados, prioridades, documentos), transiciones por puesto, agrupación por vencimiento, filtros, orden de pendientes, lectura/validación de formularios, texto del historial |
| `lib/tareas.test.ts` | Pruebas de lo anterior |
| `supabase/migrations/20261102120000_tareas.sql` | Tablas, trigger de historial, visibilidad, RLS, RPC |
| `supabase/pruebas/20261102120000_tareas.sql` | Prueba que corre Sebastián en producción (revierte con PRUEBAS OK) |
| `tests/tareas.test.mjs` | PGlite: migración sobre stubs + escenarios por puesto + la prueba SQL |
| `app/tareas/datos.ts` | Lecturas vía RPC (`leerTareas`, `leerHilo`, `leerPersonas`, `contarMisTareas`, `leerDocumento`) |
| `app/tareas/acciones.ts` | Server actions (`crearTarea`, `moverTarea`, `actualizarTarea`, `comentarTarea`) |
| `app/tareas/layout.tsx`, `loading.tsx`, `error.tsx` | Marco del módulo |
| `app/tareas/TarjetaTarea.tsx` | Tarjeta reutilizable |
| `app/tareas/page.tsx` | Mis tareas |
| `app/tareas/[numero]/page.tsx` | Detalle |
| `app/tareas/nueva/page.tsx` | Alta (con o sin documento) |
| `app/tareas/tablero/page.tsx`, `TableroTareas.tsx` | Tablero/Lista con filtros |
| `components/TareasDelDocumento.tsx` | Franja «Tareas abiertas» + botón «Asignar tarea» en documentos |
| `lib/roles.ts`, `components/Marco.tsx`, `components/MenuLateral.tsx` | Grupo Tareas y contador |
| `app/(app)/page.tsx` | Bloque «Tus pendientes» |
| `app/globals.css` | Estilos `.tablero-tareas`, `.contador-menu` |

---

### Task 1: Lógica pura de tareas

**Files:**
- Create: `lib/tareas.ts`
- Test: `lib/tareas.test.ts`
- Modify: `package.json` (script `test`: agregar `lib/tareas.test.ts` después de `lib/cumplimiento.test.ts`)

**Interfaces:**
- Produces (todo exportado desde `lib/tareas.ts`):
  - `ESTADOS: Record<EstadoTarea,string>`, `type EstadoTarea`, `COLUMNAS: EstadoTarea[]`, `abierta(e: EstadoTarea): boolean`
  - `PRIORIDADES`, `type Prioridad`, `TONO_PRIORIDAD: Record<Prioridad,string>`
  - `DOCUMENTOS: Record<TipoDocumento,string>`, `type TipoDocumento`, `MODULOS`, `type Modulo`, `moduloDe(tipo: TipoDocumento|null): Modulo`
  - `type Tarea`, `type Quien = { id: string; rol: Rol; sucursal_id: string | null }`
  - `clave(numero: number): string`, `numeroDeClave(texto: string): number | null`
  - `administra(t: Tarea, q: Quien): boolean`, `siguientes(t: Tarea, q: Quien): EstadoTarea[]`, `pideComentario(de: EstadoTarea, a: EstadoTarea): boolean`
  - `puedeCrearTareas(rol: Rol): boolean`, `puedeLigar(rol: Rol, tipo: TipoDocumento): boolean`, `puedeAbrirDocumento(rol: Rol, tipo: TipoDocumento): boolean`, `veTablero(rol: Rol): boolean`
  - `type GrupoVence`, `GRUPOS_VENCE`, `grupoVence(vence: string|null, hoy: string): GrupoVence`, `agrupar(ts: Tarea[], hoy: string): [GrupoVence, Tarea[]][]`, `vencida(t: Tarea, hoy: string): boolean`
  - `ordenPendientes(ts: Tarea[], hoy: string): Tarea[]`
  - `type FiltrosTablero`, `leerFiltros(p: Record<string,string|undefined>): FiltrosTablero`, `filtrar(ts: Tarea[], f: FiltrosTablero, hoy: string): Tarea[]`
  - `meTocaCerrar(t: Tarea, q: Quien): boolean`
  - `leerNuevaTarea(get: (c: string) => string): { datos: DatosTarea } | { error: string }`, `type DatosTarea`
  - `type EntradaHilo`, `textoCambio(e: EntradaHilo): string`

- [ ] **Step 1: Write the failing test**

`lib/tareas.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  administra, agrupar, clave, filtrar, grupoVence, leerFiltros, leerNuevaTarea, meTocaCerrar, moduloDe, numeroDeClave,
  ordenPendientes, pideComentario, puedeAbrirDocumento, puedeCrearTareas, puedeLigar, siguientes, textoCambio, vencida, veTablero,
  type Quien, type Tarea,
} from "./tareas.ts";

const tarea = (x: Partial<Tarea>): Tarea => ({
  id: "t1", numero: 1, titulo: "Subir remisión", descripcion: null, estado: "por_hacer", prioridad: "media", vence: null,
  asignado_a: "op", asignado: "Ana", asignado_activo: true, creado_por: "jefe", creador: "Julio", sucursal_id: "s1", sucursal: "Zapopan-1",
  origen: "manual", documento_tipo: null, documento_id: null, documento_texto: null, documento_ruta: null, documento_anulado: false,
  motivo_cierre: null, revision: 1, creada_en: "2026-11-02T10:00:00Z", actualizada_en: "2026-11-02T10:00:00Z", cerrada_en: null, ...x,
});
const q = (id: string, rol: Quien["rol"], sucursal_id: string | null = "s1"): Quien => ({ id, rol, sucursal_id });

test("clave: DODO-n y de regreso", () => {
  assert.equal(clave(142), "DODO-142");
  assert.equal(numeroDeClave("DODO-142"), 142);
  assert.equal(numeroDeClave("dodo-7"), 7);
  assert.equal(numeroDeClave("15"), 15);
  assert.equal(numeroDeClave("DODO-"), null);
  assert.equal(numeroDeClave("abc"), null);
});

test("transiciones: el asignado avanza hasta revisión; quien creó cierra o regresa", () => {
  const t = tarea({});
  assert.deepEqual(siguientes(t, q("op", "operacion")), ["en_curso", "en_revision"]);
  assert.deepEqual(siguientes(tarea({ estado: "en_curso" }), q("op", "operacion")), ["en_revision"]);
  assert.deepEqual(siguientes(tarea({ estado: "en_revision" }), q("op", "operacion")), []);
  assert.deepEqual(siguientes(tarea({ estado: "en_revision" }), q("jefe", "encargado")), ["hecho", "en_curso", "cancelada"]);
  assert.deepEqual(siguientes(t, q("otro", "admin", null)), ["en_curso", "en_revision", "cancelada"]);
  assert.deepEqual(siguientes(tarea({ estado: "en_revision" }), q("g", "gerente")), ["hecho", "en_curso", "cancelada"]);
  assert.deepEqual(siguientes(tarea({ estado: "en_revision" }), q("g", "gerente", "s2")), []);
  assert.deepEqual(siguientes(t, q("c", "corporativo", null)), []);
  assert.deepEqual(siguientes(tarea({ estado: "hecho" }), q("x", "admin", null)), []);
  assert.equal(administra(t, q("jefe", "encargado")), true);
  assert.equal(administra(t, q("op", "operacion")), false);
});

test("pideComentario: regresar y cancelar exigen texto", () => {
  assert.equal(pideComentario("en_revision", "en_curso"), true);
  assert.equal(pideComentario("por_hacer", "cancelada"), true);
  assert.equal(pideComentario("en_curso", "en_revision"), false);
});

test("permisos de puesto: crear, ligar, abrir documento y tablero", () => {
  assert.deepEqual((["operacion", "encargado", "gerente", "admin", "corporativo"] as const).map(puedeCrearTareas), [false, true, true, true, false]);
  assert.equal(puedeLigar("admin", "factura"), true);
  assert.equal(puedeLigar("gerente", "factura"), false);
  assert.equal(puedeLigar("gerente", "ventas_dia"), true);
  assert.equal(puedeLigar("encargado", "ventas_dia"), false);
  assert.equal(puedeAbrirDocumento("gerente", "factura"), false);
  assert.equal(puedeAbrirDocumento("gerente", "ventas_dia"), true);
  assert.equal(puedeAbrirDocumento("corporativo", "apertura_item"), true);
  assert.equal(puedeAbrirDocumento("encargado", "ventas_dia"), false);
  assert.equal(veTablero("operacion"), false);
  assert.equal(veTablero("encargado"), true);
});

test("vencimiento: grupos y orden de pendientes", () => {
  const hoy = "2026-11-02";
  assert.equal(grupoVence(null, hoy), "sin_fecha");
  assert.equal(grupoVence("2026-11-01", hoy), "vencidas");
  assert.equal(grupoVence("2026-11-02", hoy), "hoy");
  assert.equal(grupoVence("2026-11-09", hoy), "semana");
  assert.equal(grupoVence("2026-11-10", hoy), "despues");
  assert.equal(vencida(tarea({ vence: "2026-11-01" }), hoy), true);
  assert.equal(vencida(tarea({ vence: "2026-11-01", estado: "hecho" }), hoy), false);
  const ts = [tarea({ numero: 1, vence: "2026-11-05", prioridad: "baja" }), tarea({ numero: 2, vence: null, prioridad: "alta" }),
    tarea({ numero: 3, vence: "2026-10-30", prioridad: "baja" }), tarea({ numero: 4, vence: "2026-11-03", prioridad: "alta" })];
  assert.deepEqual(ordenPendientes(ts, hoy).map((t) => t.numero), [3, 4, 2, 1]);
  assert.deepEqual(agrupar(ts, hoy).map(([g, l]) => [g, l.map((t) => t.numero)]), [["vencidas", [3]], ["semana", [4, 1]], ["sin_fecha", [2]]]);
});

test("filtros del tablero: se leen de la URL y se aplican", () => {
  const hoy = "2026-11-02";
  const f = leerFiltros({ persona: "op", modulo: "facturas", prioridad: "alta", vencidas: "1", origen: "nada", sucursal: "" });
  assert.deepEqual(f, { persona: "op", sucursal: "", prioridad: "alta", modulo: "facturas", vencidas: true, origen: "" });
  const ts = [tarea({ numero: 1, documento_tipo: "factura", prioridad: "alta", vence: "2026-11-01" }),
    tarea({ numero: 2, documento_tipo: "factura", prioridad: "alta", vence: "2026-11-05" }),
    tarea({ numero: 3, documento_tipo: null, prioridad: "alta", vence: "2026-11-01" })];
  assert.deepEqual(filtrar(ts, f, hoy).map((t) => t.numero), [1]);
  assert.deepEqual(filtrar(ts, leerFiltros({ modulo: "sin" }), hoy).map((t) => t.numero), [3]);
  assert.equal(moduloDe("apertura_item"), "aperturas");
  assert.equal(moduloDe(null), "sin");
});

test("me toca cerrar: lo que creé y está en revisión; el gerente, lo de su sucursal", () => {
  assert.equal(meTocaCerrar(tarea({ estado: "en_revision" }), q("jefe", "admin", null)), true);
  assert.equal(meTocaCerrar(tarea({ estado: "en_revision" }), q("otro", "admin", null)), false);
  assert.equal(meTocaCerrar(tarea({ estado: "en_revision" }), q("g", "gerente")), true);
  assert.equal(meTocaCerrar(tarea({ estado: "en_curso" }), q("jefe", "admin", null)), false);
});

test("leerNuevaTarea: limpia, valida y rechaza con mensaje", () => {
  const campos = (x: Record<string, string>) => (c: string) => x[c] ?? "";
  const ok = leerNuevaTarea(campos({ titulo: "  Subir remisión  ", prioridad: "alta", vence: "2026-11-06", asignado_a: "11111111-1111-1111-1111-111111111111", documento_tipo: "factura", documento_id: "22222222-2222-2222-2222-222222222222" }));
  assert.deepEqual(ok, { datos: { titulo: "Subir remisión", descripcion: "", prioridad: "alta", vence: "2026-11-06", asignado_a: "11111111-1111-1111-1111-111111111111", sucursal_id: "", documento_tipo: "factura", documento_id: "22222222-2222-2222-2222-222222222222" } });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: " a ", asignado_a: "11111111-1111-1111-1111-111111111111" })), { error: "El título debe tener de 3 a 200 caracteres." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "" })), { error: "Elige a quién se asigna la tarea." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "11111111-1111-1111-1111-111111111111", vence: "2026-13-40" })), { error: "La fecha de vencimiento no es válida." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "11111111-1111-1111-1111-111111111111", prioridad: "urgente" })), { error: "Prioridad inválida." });
  assert.deepEqual(leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "11111111-1111-1111-1111-111111111111", documento_tipo: "factura" })), { error: "El documento ligado está incompleto." });
  assert.equal("datos" in leerNuevaTarea(campos({ titulo: "Revisar", asignado_a: "11111111-1111-1111-1111-111111111111" })), true);
});

test("textoCambio: historial en palabras", () => {
  const e = { tipo: "cambio" as const, autor: "Julio", texto: null, fecha: "2026-11-02T10:00:00Z" };
  assert.equal(textoCambio({ ...e, campo: "creada", antes: null, despues: "por_hacer" }), "creó la tarea");
  assert.equal(textoCambio({ ...e, campo: "estado", antes: "en_curso", despues: "en_revision" }), "la movió de En curso a En revisión");
  assert.equal(textoCambio({ ...e, campo: "asignado_a", antes: "Ana", despues: "Luis" }), "la reasignó de Ana a Luis");
  assert.equal(textoCambio({ ...e, campo: "prioridad", antes: "media", despues: "alta" }), "cambió la prioridad de Media a Alta");
  assert.equal(textoCambio({ ...e, campo: "vence", antes: null, despues: "2026-11-06" }), "cambió el vencimiento de sin fecha a 2026-11-06");
  assert.equal(textoCambio({ ...e, campo: "titulo", antes: "a", despues: "b" }), "cambió el título");
  assert.equal(textoCambio({ ...e, campo: "descripcion", antes: "a", despues: "b" }), "editó la descripción");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/tareas.test.ts`
Expected: FAIL con `Cannot find module '.../lib/tareas.ts'`.

- [ ] **Step 3: Write minimal implementation**

`lib/tareas.ts`:

```ts
import type { Rol } from "./tipos";

/** Estados del backlog. `hecho` y `cancelada` cierran la tarea. */
export const ESTADOS = { por_hacer: "Por hacer", en_curso: "En curso", en_revision: "En revisión", hecho: "Hecho", cancelada: "Cancelada" } as const;
export type EstadoTarea = keyof typeof ESTADOS;
/** Columnas del tablero (las canceladas no se muestran). */
export const COLUMNAS: EstadoTarea[] = ["por_hacer", "en_curso", "en_revision", "hecho"];
export const abierta = (e: EstadoTarea) => e !== "hecho" && e !== "cancelada";

export const PRIORIDADES = { alta: "Alta", media: "Media", baja: "Baja" } as const;
export type Prioridad = keyof typeof PRIORIDADES;
export const TONO_PRIORIDAD: Record<Prioridad, string> = { alta: "peligro", media: "aviso", baja: "info" };
const PESO_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };

export const DOCUMENTOS = { orden: "Orden de compra", factura: "Factura", ventas_dia: "Día de venta", apertura_proyecto: "Apertura", apertura_item: "Ítem de apertura" } as const;
export type TipoDocumento = keyof typeof DOCUMENTOS;
export const MODULOS = { compras: "Compras", facturas: "Facturas", ventas: "Ventas", aperturas: "Aperturas", sin: "Sin documento" } as const;
export type Modulo = keyof typeof MODULOS;
export const moduloDe = (tipo: TipoDocumento | null): Modulo =>
  tipo === "orden" ? "compras" : tipo === "factura" ? "facturas" : tipo === "ventas_dia" ? "ventas" : tipo ? "aperturas" : "sin";

/** Una fila de `tareas_visibles`. */
export type Tarea = {
  id: string; numero: number; titulo: string; descripcion: string | null; estado: EstadoTarea; prioridad: Prioridad; vence: string | null;
  asignado_a: string; asignado: string; asignado_activo: boolean; creado_por: string | null; creador: string | null;
  sucursal_id: string | null; sucursal: string | null; origen: "manual" | "automatica";
  documento_tipo: TipoDocumento | null; documento_id: string | null; documento_texto: string | null; documento_ruta: string | null; documento_anulado: boolean;
  motivo_cierre: string | null; revision: number; creada_en: string; actualizada_en: string; cerrada_en: string | null;
};
export type Quien = { id: string; rol: Rol; sucursal_id: string | null };

export const clave = (numero: number) => `DODO-${numero}`;
export function numeroDeClave(texto: string): number | null {
  const m = /^(?:dodo-)?(\d{1,12})$/i.exec(texto.trim());
  return m ? Number(m[1]) : null;
}

/** Quien creó la tarea, un admin o el gerente de la sucursal: edita, cierra, regresa y cancela. Espejo de mover_tarea. */
export const administra = (t: Tarea, q: Quien) =>
  q.rol === "admin" || (t.creado_por !== null && t.creado_por === q.id) || (q.rol === "gerente" && t.sucursal_id !== null && t.sucursal_id === q.sucursal_id);

const AVANCE: Partial<Record<EstadoTarea, EstadoTarea[]>> = { por_hacer: ["en_curso", "en_revision"], en_curso: ["en_revision"] };
const CIERRE: Partial<Record<EstadoTarea, EstadoTarea[]>> = { en_revision: ["hecho", "en_curso"] };

/** Estados a los que esta persona puede mover la tarea, en el orden de los botones. La base de datos vuelve a validar. */
export function siguientes(t: Tarea, q: Quien): EstadoTarea[] {
  if (q.rol === "corporativo" || !abierta(t.estado)) return [];
  const manda = administra(t, q), out: EstadoTarea[] = [];
  if (manda || t.asignado_a === q.id) out.push(...(AVANCE[t.estado] ?? []));
  if (manda) out.push(...(CIERRE[t.estado] ?? []), "cancelada");
  return out;
}
export const pideComentario = (de: EstadoTarea, a: EstadoTarea) => a === "cancelada" || (de === "en_revision" && a === "en_curso");

export const puedeCrearTareas = (rol: Rol) => rol === "admin" || rol === "gerente" || rol === "encargado";
/** Ligar exige ver el documento: compras y aperturas son de oficina; el gerente liga días de venta de su sucursal. */
export const puedeLigar = (rol: Rol, tipo: TipoDocumento) => rol === "admin" || (rol === "gerente" && tipo === "ventas_dia");
/** Si no puede abrirlo, la tarea muestra el texto del documento sin enlace. */
export const puedeAbrirDocumento = (rol: Rol, tipo: TipoDocumento) =>
  rol === "admin" || rol === "corporativo" || (rol === "gerente" && tipo === "ventas_dia");
export const veTablero = (rol: Rol) => rol !== "operacion";

export const GRUPOS_VENCE = { vencidas: "Vencidas", hoy: "Hoy", semana: "Esta semana", despues: "Después", sin_fecha: "Sin fecha" } as const;
export type GrupoVence = keyof typeof GRUPOS_VENCE;
const masDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
};
export function grupoVence(vence: string | null, hoy: string): GrupoVence {
  if (!vence) return "sin_fecha";
  if (vence < hoy) return "vencidas";
  if (vence === hoy) return "hoy";
  return vence <= masDias(hoy, 7) ? "semana" : "despues";
}
export const vencida = (t: Tarea, hoy: string) => abierta(t.estado) && t.vence !== null && t.vence < hoy;

/** Vencidas primero, luego prioridad, luego fecha (sin fecha al final) y número. */
export function ordenPendientes(ts: Tarea[], hoy: string): Tarea[] {
  return [...ts].sort((a, b) =>
    Number(vencida(b, hoy)) - Number(vencida(a, hoy)) || PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad]
    || (a.vence ?? "9999-12-31").localeCompare(b.vence ?? "9999-12-31") || a.numero - b.numero);
}
/** Grupos no vacíos en el orden de GRUPOS_VENCE; dentro, por fecha y prioridad. */
export function agrupar(ts: Tarea[], hoy: string): [GrupoVence, Tarea[]][] {
  const orden = [...ts].sort((a, b) => (a.vence ?? "9999-12-31").localeCompare(b.vence ?? "9999-12-31") || PESO_PRIORIDAD[a.prioridad] - PESO_PRIORIDAD[b.prioridad] || a.numero - b.numero);
  return (Object.keys(GRUPOS_VENCE) as GrupoVence[]).map((g) => [g, orden.filter((t) => grupoVence(t.vence, hoy) === g)] as [GrupoVence, Tarea[]]).filter(([, l]) => l.length);
}

export type FiltrosTablero = { persona: string; sucursal: string; prioridad: Prioridad | ""; modulo: Modulo | ""; vencidas: boolean; origen: "manual" | "automatica" | "" };
export function leerFiltros(p: Record<string, string | undefined>): FiltrosTablero {
  const de = <T extends string>(v: string | undefined, validos: Record<T, unknown>): T | "" => (v && Object.hasOwn(validos, v) ? (v as T) : "");
  return {
    persona: p.persona ?? "", sucursal: p.sucursal ?? "", prioridad: de(p.prioridad, PRIORIDADES), modulo: de(p.modulo, MODULOS),
    vencidas: p.vencidas === "1", origen: de(p.origen, { manual: 1, automatica: 1 }),
  };
}
export function filtrar(ts: Tarea[], f: FiltrosTablero, hoy: string): Tarea[] {
  return ts.filter((t) => (!f.persona || t.asignado_a === f.persona) && (!f.sucursal || (f.sucursal === "oficina" ? t.sucursal_id === null : t.sucursal_id === f.sucursal))
    && (!f.prioridad || t.prioridad === f.prioridad) && (!f.modulo || moduloDe(t.documento_tipo) === f.modulo)
    && (!f.vencidas || vencida(t, hoy)) && (!f.origen || t.origen === f.origen));
}

/** Pestaña «En revisión (me toca cerrar)»: lo que creé, o lo de mi sucursal si soy gerente. */
export const meTocaCerrar = (t: Tarea, q: Quien) =>
  t.estado === "en_revision" && ((t.creado_por !== null && t.creado_por === q.id) || (q.rol === "gerente" && t.sucursal_id !== null && t.sucursal_id === q.sucursal_id));

export type DatosTarea = {
  titulo: string; descripcion: string; prioridad: Prioridad; vence: string; asignado_a: string; sucursal_id: string;
  documento_tipo: TipoDocumento | ""; documento_id: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fechaValida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;
/** Lee el formulario de alta o edición. Lo vacío queda como "" (la función SQL lo convierte en null). */
export function leerNuevaTarea(get: (c: string) => string): { datos: DatosTarea } | { error: string } {
  const titulo = get("titulo").trim(), descripcion = get("descripcion").trim(), prioridad = get("prioridad").trim() || "media";
  const vence = get("vence").trim(), asignado_a = get("asignado_a").trim(), sucursal_id = get("sucursal_id").trim();
  const documento_tipo = get("documento_tipo").trim(), documento_id = get("documento_id").trim();
  if (titulo.length < 3 || titulo.length > 200) return { error: "El título debe tener de 3 a 200 caracteres." };
  if (descripcion.length > 4000) return { error: "La descripción es demasiado larga (máximo 4000 caracteres)." };
  if (!Object.hasOwn(PRIORIDADES, prioridad)) return { error: "Prioridad inválida." };
  if (vence && !fechaValida(vence)) return { error: "La fecha de vencimiento no es válida." };
  if (!UUID.test(asignado_a)) return { error: "Elige a quién se asigna la tarea." };
  if (sucursal_id && !UUID.test(sucursal_id)) return { error: "Sucursal inválida." };
  if (!documento_tipo !== !documento_id || (documento_tipo && (!Object.hasOwn(DOCUMENTOS, documento_tipo) || !UUID.test(documento_id))))
    return { error: "El documento ligado está incompleto." };
  return { datos: { titulo, descripcion, prioridad: prioridad as Prioridad, vence, asignado_a, sucursal_id, documento_tipo: documento_tipo as TipoDocumento | "", documento_id } };
}

/** Una fila de `hilo_tarea`: comentario o cambio. En `asignado_a`, antes/después ya vienen como nombres. */
export type EntradaHilo = { tipo: "comentario" | "cambio"; autor: string | null; texto: string | null; campo: string | null; antes: string | null; despues: string | null; fecha: string };
const nombreDe = (catalogo: Record<string, string>, v: string | null) => (v && catalogo[v]) ?? v ?? "sin fecha";
export function textoCambio(e: EntradaHilo): string {
  switch (e.campo) {
    case "creada": return "creó la tarea";
    case "estado": return `la movió de ${nombreDe(ESTADOS, e.antes)} a ${nombreDe(ESTADOS, e.despues)}`;
    case "asignado_a": return `la reasignó de ${e.antes ?? "nadie"} a ${e.despues ?? "nadie"}`;
    case "prioridad": return `cambió la prioridad de ${nombreDe(PRIORIDADES, e.antes)} a ${nombreDe(PRIORIDADES, e.despues)}`;
    case "vence": return `cambió el vencimiento de ${e.antes ?? "sin fecha"} a ${e.despues ?? "sin fecha"}`;
    case "titulo": return "cambió el título";
    case "descripcion": return "editó la descripción";
    default: return "actualizó la tarea";
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/tareas.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Register test and commit**

En `package.json`, dentro del script `test`, insertar ` lib/tareas.test.ts` justo después de `lib/cumplimiento.test.ts`.

```bash
git add lib/tareas.ts lib/tareas.test.ts package.json
git commit -m "Tareas: lógica de transiciones, vencimientos y filtros"
```

---

### Task 2: Migración — tablas, visibilidad y alta

**Files:**
- Create: `supabase/migrations/20261102120000_tareas.sql`
- Test: `tests/tareas.test.mjs`
- Modify: `package.json` (agregar `tests/tareas.test.mjs` al final del script `test`)

**Interfaces:**
- Consumes (de la base existente): `public.mi_rol()` → `rol_usuario`, `public.mi_sucursal()` → uuid, `public.hoy_mx()` → date, tablas `perfiles(id,nombre,rol,sucursal_id,activo)`, `sucursales(id,nombre)`, `proveedores(id,razon_social,nombre_comercial)`, `ordenes_compra(id,folio,proveedor_id,sucursal_id,estado)`, `facturas(id,uuid,serie,folio,nombre_emisor,sucursal_id,estado)`, `ventas_dia(id,sucursal_id,fecha)`, `apertura_proyectos(id,sucursal_id)`, `apertura_items(id,proyecto_id,clave,nombre)`.
- Produces (RPC para la app):
  - `crear_tarea(p_datos jsonb) returns bigint` — claves de `p_datos`: las de `DatosTarea`; devuelve `numero`.
  - `tareas_visibles(p_numero bigint default null, p_documento uuid default null)` → columnas de `Tarea` (Task 1).
  - `personas_asignables(p_sucursal uuid) returns table(id uuid, nombre text, rol text)`.
  - `documento_para_tarea(p_tipo text, p_id uuid) returns table(texto text, sucursal_id uuid, ruta text, anulado boolean)`.
  - `contar_mis_tareas() returns table(abiertas integer, vencidas integer)`.
- Produces (internas): `documento_tarea(text,uuid)`, `puede_ver_tarea(uuid,uuid,uuid)`, `puede_ligar_documento(text,uuid)`.

- [ ] **Step 1: Write the failing test**

`tests/tareas.test.mjs`:

```js
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261102120000_tareas.sql');

// Lo mínimo de Supabase y de los módulos ligados. Enums y checks copian los reales (0001, 0008, 0012, 0013, 0037, 0048).
export const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create type rol_usuario as enum('operacion','encargado','gerente','admin','corporativo');
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Zapopan-1'),('00000000-0000-0000-0000-0000000000e2','Tlaquepaque');
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null,sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles values
  ('00000000-0000-0000-0000-0000000000a1','Julio','admin',null,true,false),
  ('00000000-0000-0000-0000-0000000000c1','Halim','corporativo',null,true,false),
  ('00000000-0000-0000-0000-0000000000d0','Gerente Z','gerente','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000d1','Encargado Z','encargado','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000f1','Ana (op Z)','operacion','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000f2','Luis (op T)','operacion','00000000-0000-0000-0000-0000000000e2',true,false),
  ('00000000-0000-0000-0000-0000000000f3','Baja (op Z)','operacion','00000000-0000-0000-0000-0000000000e1',false,false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function mi_sucursal() returns uuid language sql stable security definer set search_path='' as $$select sucursal_id from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 grant execute on function mi_rol(),mi_sucursal() to authenticated;
 create function hoy_mx() returns date language sql stable as $$select date '2026-11-02'$$;
 create table proveedores(id uuid primary key,razon_social text not null,nombre_comercial text);
 insert into proveedores values('00000000-0000-0000-0000-0000000000b1','HARINAS DEL BAJIO SA','Harinas Bajío');
 create type estado_orden as enum('borrador','enviada','confirmada','cerrada','cancelada');
 create table ordenes_compra(id uuid primary key,folio text not null unique,proveedor_id uuid not null references proveedores(id),sucursal_id uuid references sucursales(id),estado estado_orden not null default 'borrador');
 insert into ordenes_compra values('00000000-0000-0000-0000-00000000000a','OC-0042','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','cancelada');
 create type estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create table facturas(id uuid primary key,uuid text not null unique,serie text,folio text,nombre_emisor text not null,sucursal_id uuid references sucursales(id),estado estado_factura not null default 'por_pagar');
 insert into facturas values('00000000-0000-0000-0000-0000000000fa','8f1c2d3e-aaaa-bbbb-cccc-000000000001','A','1234','HARINAS DEL BAJIO SA','00000000-0000-0000-0000-0000000000e1','por_pagar'),
  ('00000000-0000-0000-0000-0000000000fb','9e2d3c4b-aaaa-bbbb-cccc-000000000002',null,null,'CFE',null,'por_pagar');
 create table ventas_dia(id uuid primary key,sucursal_id uuid not null references sucursales(id),fecha date not null);
 insert into ventas_dia values('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000e1','2026-11-01'),('00000000-0000-0000-0000-0000000000a6','00000000-0000-0000-0000-0000000000e2','2026-11-01');
 create table apertura_proyectos(id uuid primary key,sucursal_id uuid not null unique references sucursales(id));
 insert into apertura_proyectos values('00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000e2');
 create table apertura_items(id uuid primary key,proyecto_id uuid not null references apertura_proyectos(id),clave text not null,nombre text not null);
 insert into apertura_items values('00000000-0000-0000-0000-0000000000a8','00000000-0000-0000-0000-0000000000a7','E-12','Horno de banda');`;

export const U={admin:'00000000-0000-0000-0000-0000000000a1',corp:'00000000-0000-0000-0000-0000000000c1',gerente:'00000000-0000-0000-0000-0000000000d0',
 encargado:'00000000-0000-0000-0000-0000000000d1',ana:'00000000-0000-0000-0000-0000000000f1',luis:'00000000-0000-0000-0000-0000000000f2',baja:'00000000-0000-0000-0000-0000000000f3'};
export const S={z:'00000000-0000-0000-0000-0000000000e1',t:'00000000-0000-0000-0000-0000000000e2'};
export const como=(db,id)=>db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);
export const crear=async(db,id,datos)=>{await como(db,id);return Number((await db.query(`select public.crear_tarea($1::jsonb) n`,[JSON.stringify(datos)])).rows[0].n);};
export const visibles=async(db,id)=>{await como(db,id);return (await db.query(`select numero,titulo,documento_texto,documento_ruta,documento_anulado,asignado,asignado_activo,sucursal from public.tareas_visibles()`)).rows;};
export const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;};
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});

test('tareas: admin crea ligada a factura; toma sucursal y texto del documento',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Subir remisión firmada',prioridad:'alta',vence:'2026-11-06',asignado_a:U.gerente,documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fa'});
  assert.equal(n,1);
  const [t]=await visibles(db,U.admin);
  assert.equal(t.documento_texto,'Factura A-1234 · HARINAS DEL BAJIO SA');
  assert.equal(t.documento_ruta,'/compras/facturas/00000000-0000-0000-0000-0000000000fa');
  assert.equal(t.sucursal,'Zapopan-1');
  const sinFolio=await crear(db,U.admin,{titulo:'Revisar recibo',asignado_a:U.admin,documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fb'});
  assert.equal((await visibles(db,U.admin)).find(x=>Number(x.numero)===sinFolio).documento_texto,'Factura 9e2d3c4b · CFE');
 }finally{await db.close();}
});

test('tareas: textos y rutas de cada tipo de documento; orden cancelada sale anulada',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Orden',asignado_a:U.admin,documento_tipo:'orden',documento_id:'00000000-0000-0000-0000-00000000000a'});
  await crear(db,U.admin,{titulo:'Venta',asignado_a:U.admin,documento_tipo:'ventas_dia',documento_id:'00000000-0000-0000-0000-0000000000a5'});
  await crear(db,U.admin,{titulo:'Proyecto',asignado_a:U.admin,documento_tipo:'apertura_proyecto',documento_id:'00000000-0000-0000-0000-0000000000a7'});
  await crear(db,U.admin,{titulo:'Item',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:'00000000-0000-0000-0000-0000000000a8'});
  const filas=Object.fromEntries((await visibles(db,U.admin)).map(x=>[x.titulo,x]));
  assert.equal(filas.Orden.documento_texto,'Orden OC-0042 · Harinas Bajío');assert.equal(filas.Orden.documento_anulado,true);
  assert.equal(filas.Venta.documento_texto,'Venta Zapopan-1 · 01/11/2026');
  assert.equal(filas.Venta.documento_ruta,`/ventas/conciliacion?mes=2026-11&sucursal=${S.z}`);
  assert.equal(filas.Proyecto.documento_texto,'Apertura Tlaquepaque');
  assert.equal(filas.Item.documento_texto,'Apertura Tlaquepaque · E-12 Horno de banda');
  assert.equal(filas.Item.documento_ruta,'/aperturas/00000000-0000-0000-0000-0000000000a7/items/00000000-0000-0000-0000-0000000000a8');
 }finally{await db.close();}
});

test('tareas: quién puede crear y a quién puede asignar',async()=>{
 const db=await nueva();
 try{
  await rechaza(crear(db,U.corp,{titulo:'Algo',asignado_a:U.ana}),/Corporativo solo puede consultar/);
  await rechaza(crear(db,U.ana,{titulo:'Algo',asignado_a:U.ana}),/no puede crear tareas/);
  await rechaza(crear(db,U.encargado,{titulo:'Algo',asignado_a:U.gerente}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.gerente,{titulo:'Algo',asignado_a:U.luis}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.baja}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.corp}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.luis,documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fa'}),/Esa persona no puede recibir esta tarea/);
  await rechaza(crear(db,U.gerente,{titulo:'Algo',asignado_a:U.ana,documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fa'}),/No puedes ligar tareas a este documento/);
  await rechaza(crear(db,U.gerente,{titulo:'Algo',asignado_a:U.ana,documento_tipo:'ventas_dia',documento_id:'00000000-0000-0000-0000-0000000000a6'}),/No puedes ligar tareas a este documento/);
  await rechaza(crear(db,U.admin,{titulo:'  a ',asignado_a:U.ana}),/El título debe tener de 3 a 200 caracteres/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.ana,prioridad:'urgente'}),/Prioridad inválida/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.ana,extra:'x'}),/Datos de tarea inválidos/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.ana,documento_tipo:'factura'}),/Documento incompleto/);
  // Válidas: gerente liga día de su sucursal; encargado asigna a operación; el gerente no puede elegir otra sucursal.
  await crear(db,U.gerente,{titulo:'Revisar día',asignado_a:U.encargado,documento_tipo:'ventas_dia',documento_id:'00000000-0000-0000-0000-0000000000a5'});
  const n=await crear(db,U.encargado,{titulo:'Limpiar cámara',asignado_a:U.ana,sucursal_id:S.t});
  assert.equal((await visibles(db,U.admin)).find(x=>Number(x.numero)===n).sucursal,'Zapopan-1');
 }finally{await db.close();}
});

test('tareas: personas asignables por puesto',async()=>{
 const db=await nueva();
 try{
  const nombres=async(id,s)=>{await como(db,id);return (await db.query(`select nombre from public.personas_asignables($1)`,[s])).rows.map(r=>r.nombre);};
  assert.deepEqual(await nombres(U.admin,S.z),['Ana (op Z)','Encargado Z','Gerente Z','Julio']);
  assert.deepEqual(await nombres(U.admin,null),['Ana (op Z)','Encargado Z','Gerente Z','Julio','Luis (op T)']);
  assert.deepEqual(await nombres(U.gerente,S.t),['Ana (op Z)','Encargado Z','Gerente Z']);
  assert.deepEqual(await nombres(U.encargado,null),['Ana (op Z)','Encargado Z']);
  assert.deepEqual(await nombres(U.ana,null),[]);
  assert.deepEqual(await nombres(U.corp,null),[]);
 }finally{await db.close();}
});

test('tareas: cada puesto ve solo lo suyo',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Oficina para Julio',asignado_a:U.admin});
  await crear(db,U.admin,{titulo:'Para Ana',asignado_a:U.ana,sucursal_id:S.z});
  await crear(db,U.admin,{titulo:'Para Luis',asignado_a:U.luis,sucursal_id:S.t});
  await crear(db,U.gerente,{titulo:'Para encargado',asignado_a:U.encargado});
  const titulos=async id=>(await visibles(db,id)).map(x=>x.titulo).sort();
  assert.deepEqual(await titulos(U.corp),['Oficina para Julio','Para Ana','Para Luis','Para encargado']);
  assert.deepEqual(await titulos(U.gerente),['Para Ana','Para encargado']);
  assert.deepEqual(await titulos(U.encargado),['Para Ana','Para encargado']);
  assert.deepEqual(await titulos(U.ana),['Para Ana']);
  assert.deepEqual(await titulos(U.luis),['Para Luis']);
  assert.deepEqual(await titulos(U.baja),[]);
 }finally{await db.close();}
});

test('tareas: la RLS aplica el mismo criterio y nadie escribe directo',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Para Ana',asignado_a:U.ana,sucursal_id:S.z});
  await crear(db,U.admin,{titulo:'Para Luis',asignado_a:U.luis,sucursal_id:S.t});
  await como(db,U.ana);
  await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select titulo from public.tareas')).rows.map(r=>r.titulo),['Para Ana']);
  await rechaza(db.query(`insert into public.tareas(titulo,asignado_a,creado_por) values('x','${U.ana}','${U.ana}')`),/permission denied/);
  await rechaza(db.query(`update public.tareas set estado='hecho'`),/permission denied/);
  await db.exec('reset role');
 }finally{await db.close();}
});

test('tareas: contador de mis tareas abiertas y vencidas',async()=>{
 const db=await nueva();
 try{
  await crear(db,U.admin,{titulo:'Vencida',asignado_a:U.ana,sucursal_id:S.z,vence:'2026-11-01'});
  await crear(db,U.admin,{titulo:'Al día',asignado_a:U.ana,sucursal_id:S.z,vence:'2026-11-09'});
  await como(db,U.ana);
  assert.deepEqual((await db.query('select * from public.contar_mis_tareas()')).rows[0],{abiertas:2,vencidas:1});
 }finally{await db.close();}
});

test('tareas: documento_para_tarea exige poder ligar',async()=>{
 const db=await nueva();
 try{
  await como(db,U.admin);
  assert.equal((await db.query(`select texto from public.documento_para_tarea('factura','00000000-0000-0000-0000-0000000000fa')`)).rows[0].texto,'Factura A-1234 · HARINAS DEL BAJIO SA');
  await como(db,U.gerente);
  await rechaza(db.query(`select * from public.documento_para_tarea('factura','00000000-0000-0000-0000-0000000000fa')`),/No puedes ligar tareas a este documento/);
  await rechaza(db.query(`select * from public.documento_para_tarea('factura','00000000-0000-0000-0000-000000000999')`),/El documento no existe/);
 }finally{await db.close();}
});

test('tareas: a lo más un documento por tarea',async()=>{
 const db=await nueva();
 try{
  await rechaza(db.query(`insert into public.tareas(titulo,asignado_a,creado_por,factura_id,orden_id) values('Dos docs','${U.admin}','${U.admin}','00000000-0000-0000-0000-0000000000fa','00000000-0000-0000-0000-00000000000a')`),/tareas_un_documento/);
 }finally{await db.close();}
});

test('tareas: la prueba SQL de Sebastián termina en PRUEBAS OK',{skip:!existsSync(new URL('../supabase/pruebas/20261102120000_tareas.sql',import.meta.url))},async()=>{
 const db=await nueva();
 try{
  await db.exec(`insert into facturas values('00000000-0000-0000-0000-0000000000fc','7a7a7a7a-aaaa-bbbb-cccc-000000000003','B','77','GAS DEL NORTE','${S.z}','por_pagar')`);
  await assert.rejects(db.exec(load('supabase/pruebas/20261102120000_tareas.sql')),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/tareas.test.mjs`
Expected: FAIL con `ENOENT ... 20261102120000_tareas.sql`.

- [ ] **Step 3: Write the migration (parte 1: tablas, historial, visibilidad, alta, lecturas)**

`supabase/migrations/20261102120000_tareas.sql`:

```sql
-- Tareas y backlog: pendientes asignados a una persona, ligados a lo más a un documento (orden, factura, día de
-- venta, proyecto o ítem de apertura). Toda escritura pasa por funciones; puede_ver_tarea decide qué ve cada puesto
-- y la usan la RLS y las funciones de lectura (que además devuelven nombres que la RLS de perfiles no deja ver).
begin;
create type public.estado_tarea as enum ('por_hacer','en_curso','en_revision','hecho','cancelada');
create type public.prioridad_tarea as enum ('alta','media','baja');
create sequence public.tareas_numero;

create table public.tareas (
 id uuid primary key default gen_random_uuid(),
 numero bigint not null unique default nextval('public.tareas_numero'),
 titulo text not null check(length(trim(titulo)) between 3 and 200),
 descripcion text check(length(descripcion)<=4000),
 estado public.estado_tarea not null default 'por_hacer',
 prioridad public.prioridad_tarea not null default 'media',
 vence date,
 asignado_a uuid not null references public.perfiles(id),
 creado_por uuid references public.perfiles(id),
 sucursal_id uuid references public.sucursales(id),
 origen text not null default 'manual' check(origen in ('manual','automatica')),
 regla text,
 orden_id uuid references public.ordenes_compra(id),
 factura_id uuid references public.facturas(id),
 ventas_dia_id uuid references public.ventas_dia(id),
 apertura_proyecto_id uuid references public.apertura_proyectos(id),
 apertura_item_id uuid references public.apertura_items(id),
 -- Texto del documento al crear la tarea: el asignado lo lee aunque no pueda abrir el documento.
 documento_texto text check(length(documento_texto)<=300),
 motivo_cierre text check(length(motivo_cierre)<=1000),
 revision integer not null default 1,
 creada_en timestamptz not null default now(),
 actualizada_en timestamptz not null default now(),
 cerrada_en timestamptz,
 constraint tareas_un_documento check(num_nonnulls(orden_id,factura_id,ventas_dia_id,apertura_proyecto_id,apertura_item_id)<=1),
 check((num_nonnulls(orden_id,factura_id,ventas_dia_id,apertura_proyecto_id,apertura_item_id)=1)=(documento_texto is not null)),
 check((estado in ('hecho','cancelada'))=(cerrada_en is not null)),
 check(estado<>'cancelada' or length(trim(coalesce(motivo_cierre,'')))>=5),
 check((origen='manual')=(creado_por is not null)),
 check((origen='automatica')=(regla is not null))
);
create index tareas_asignado_abiertas on public.tareas(asignado_a) where estado not in ('hecho','cancelada');
create index tareas_sucursal_estado on public.tareas(sucursal_id,estado);
create index tareas_orden on public.tareas(orden_id) where orden_id is not null;
create index tareas_factura on public.tareas(factura_id) where factura_id is not null;
create index tareas_ventas_dia on public.tareas(ventas_dia_id) where ventas_dia_id is not null;
create index tareas_apertura_proyecto on public.tareas(apertura_proyecto_id) where apertura_proyecto_id is not null;
create index tareas_apertura_item on public.tareas(apertura_item_id) where apertura_item_id is not null;

create table public.tarea_comentarios (
 id bigint generated always as identity primary key,
 tarea_id uuid not null references public.tareas(id) on delete cascade,
 autor_id uuid not null references public.perfiles(id),
 texto text not null check(length(trim(texto)) between 1 and 4000),
 fecha timestamptz not null default now()
);
create index tarea_comentarios_tarea on public.tarea_comentarios(tarea_id,fecha);
create table public.tarea_historial (
 id bigint generated always as identity primary key,
 tarea_id uuid not null references public.tareas(id) on delete cascade,
 usuario_id uuid references public.perfiles(id), -- null = sistema (tareas automáticas)
 campo text not null, antes text, despues text,
 fecha timestamptz not null default now()
);
create index tarea_historial_tarea on public.tarea_historial(tarea_id,fecha);

-- Un registro por campo que cambió, más 'creada' al insertar. Nadie escribe el historial directo.
create function public.registrar_historial_tarea() returns trigger
language plpgsql security definer set search_path='' as $$
declare c text;a text;d text;
begin
 if tg_op='INSERT' then
  insert into public.tarea_historial(tarea_id,usuario_id,campo,antes,despues) values(new.id,auth.uid(),'creada',null,new.estado::text);
  return new;
 end if;
 foreach c in array array['estado','prioridad','vence','asignado_a','titulo','descripcion'] loop
  a:=to_jsonb(old)->>c;d:=to_jsonb(new)->>c;
  if a is distinct from d then insert into public.tarea_historial(tarea_id,usuario_id,campo,antes,despues) values(new.id,auth.uid(),c,a,d);end if;
 end loop;
 return new;
end $$;
create trigger tareas_historial after insert or update on public.tareas for each row execute function public.registrar_historial_tarea();

-- Texto, sucursal, ruta y si está anulado, para cualquier tipo de documento. Solo uso interno.
create function public.documento_tarea(p_tipo text,p_id uuid)
returns table(texto text,sucursal_id uuid,ruta text,anulado boolean)
language sql stable security definer set search_path='' as $$
 select 'Orden '||o.folio||' · '||coalesce(p.nombre_comercial,p.razon_social),o.sucursal_id,'/compras/ordenes/'||o.id,o.estado::text='cancelada'
  from public.ordenes_compra o join public.proveedores p on p.id=o.proveedor_id where p_tipo='orden' and o.id=p_id
 union all
 select 'Factura '||coalesce(nullif(concat_ws('-',f.serie,f.folio),''),left(f.uuid,8))||' · '||f.nombre_emisor,f.sucursal_id,'/compras/facturas/'||f.id,f.estado::text='cancelada'
  from public.facturas f where p_tipo='factura' and f.id=p_id
 union all
 select 'Venta '||s.nombre||' · '||to_char(v.fecha,'DD/MM/YYYY'),v.sucursal_id,'/ventas/conciliacion?mes='||to_char(v.fecha,'YYYY-MM')||'&sucursal='||v.sucursal_id,false
  from public.ventas_dia v join public.sucursales s on s.id=v.sucursal_id where p_tipo='ventas_dia' and v.id=p_id
 union all
 select 'Apertura '||s.nombre,a.sucursal_id,'/aperturas/'||a.id,false
  from public.apertura_proyectos a join public.sucursales s on s.id=a.sucursal_id where p_tipo='apertura_proyecto' and a.id=p_id
 union all
 select 'Apertura '||s.nombre||' · '||i.clave||' '||i.nombre,a.sucursal_id,'/aperturas/'||a.id||'/items/'||i.id,false
  from public.apertura_items i join public.apertura_proyectos a on a.id=i.proyecto_id join public.sucursales s on s.id=a.sucursal_id
  where p_tipo='apertura_item' and i.id=p_id
$$;

-- Admin y corporativo ven todo; cada quien lo suyo y lo que creó; el gerente, su sucursal; el encargado, además,
-- lo asignado a operación de su sucursal. Un usuario inactivo no ve nada.
create function public.puede_ver_tarea(p_asignado uuid,p_creador uuid,p_sucursal uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.mi_rol() is not null and (
  public.mi_rol()::text in ('admin','corporativo')
  or p_asignado=auth.uid() or p_creador=auth.uid()
  or (public.mi_rol()::text='gerente' and p_sucursal=public.mi_sucursal())
  or (public.mi_rol()::text='encargado' and p_sucursal=public.mi_sucursal()
      and exists(select 1 from public.perfiles x where x.id=p_asignado and x.rol::text='operacion'))),false)
$$;

-- Ligar exige ver el documento: compras y aperturas son de oficina (admin); el gerente, días de venta de su sucursal.
create function public.puede_ligar_documento(p_tipo text,p_sucursal uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.mi_rol()::text='admin' or (public.mi_rol()::text='gerente' and p_tipo='ventas_dia' and p_sucursal=public.mi_sucursal()),false)
$$;

alter table public.tareas enable row level security;
alter table public.tarea_comentarios enable row level security;
alter table public.tarea_historial enable row level security;
create policy ver_tareas on public.tareas for select using(public.puede_ver_tarea(asignado_a,creado_por,sucursal_id));
create policy ver_tarea_comentarios on public.tarea_comentarios for select using(exists(select 1 from public.tareas t where t.id=tarea_id));
create policy ver_tarea_historial on public.tarea_historial for select using(exists(select 1 from public.tareas t where t.id=tarea_id));
revoke all on public.tareas,public.tarea_comentarios,public.tarea_historial from anon,authenticated;
grant select on public.tareas,public.tarea_comentarios,public.tarea_historial to authenticated;

-- Admin: a cualquiera activo (menos corporativo); en tareas de sucursal, a admins o a gente de esa sucursal.
-- Gerente: a su sucursal. Encargado: a encargados y operación de su sucursal. Los demás, a nadie.
create function public.personas_asignables(p_sucursal uuid)
returns table(id uuid,nombre text,rol text)
language sql stable security definer set search_path='' as $$
 select p.id,p.nombre,p.rol::text from public.perfiles p
 where p.activo and p.rol::text<>'corporativo' and case public.mi_rol()::text
  when 'admin' then p_sucursal is null or p.sucursal_id=p_sucursal or p.rol::text='admin'
  when 'gerente' then p.sucursal_id=public.mi_sucursal() and p.rol::text in ('gerente','encargado','operacion')
  when 'encargado' then p.sucursal_id=public.mi_sucursal() and p.rol::text in ('encargado','operacion')
  else false end
 order by p.nombre
$$;

create function public.documento_para_tarea(p_tipo text,p_id uuid)
returns table(texto text,sucursal_id uuid,ruta text,anulado boolean)
language plpgsql stable security definer set search_path='' as $$
declare d record;
begin
 select * into d from public.documento_tarea(p_tipo,p_id);
 if not found then raise exception 'El documento no existe.';end if;
 if not public.puede_ligar_documento(p_tipo,d.sucursal_id) then raise exception 'No puedes ligar tareas a este documento.';end if;
 return query select d.texto,d.sucursal_id,d.ruta,d.anulado;
end $$;

-- Valida los datos comunes de alta y edición; devuelve el mensaje de error o null.
create function public.error_datos_tarea(p_datos jsonb,p_permitidas text[]) returns text
language sql immutable set search_path='' as $$
 select case
  when jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k<>all(p_permitidas)) then 'Datos de tarea inválidos.'
  when length(trim(coalesce(p_datos->>'titulo',''))) not between 3 and 200 then 'El título debe tener de 3 a 200 caracteres.'
  when length(coalesce(p_datos->>'descripcion',''))>4000 then 'La descripción es demasiado larga (máximo 4000 caracteres).'
  when coalesce(nullif(p_datos->>'prioridad',''),'media') not in ('alta','media','baja') then 'Prioridad inválida.'
  when coalesce(p_datos->>'vence','')<>'' and p_datos->>'vence' !~ '^\d{4}-\d{2}-\d{2}$' then 'La fecha de vencimiento no es válida.'
  when coalesce(p_datos->>'asignado_a','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'Esa persona no puede recibir esta tarea.'
 end
$$;

create function public.crear_tarea(p_datos jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare r text:=public.mi_rol()::text;tipo text;doc uuid;d record;txt text;s uuid;asignado uuid;n bigint;msg text;
begin
 if r is null then raise exception 'Tu usuario no está activo.';end if;
 if r='corporativo' then raise exception 'Corporativo solo puede consultar.';end if;
 if r not in ('admin','gerente','encargado') then raise exception 'Tu puesto no puede crear tareas.';end if;
 msg:=public.error_datos_tarea(p_datos,array['titulo','descripcion','prioridad','vence','asignado_a','sucursal_id','documento_tipo','documento_id']);
 if msg is not null then raise exception '%',msg;end if;
 tipo:=nullif(p_datos->>'documento_tipo','');
 if (tipo is null)<>(nullif(p_datos->>'documento_id','') is null) then raise exception 'Documento incompleto.';end if;
 if tipo is not null then
  if tipo not in ('orden','factura','ventas_dia','apertura_proyecto','apertura_item') then raise exception 'Tipo de documento inválido.';end if;
  doc:=(p_datos->>'documento_id')::uuid;
  select * into d from public.documento_tarea(tipo,doc);
  if not found then raise exception 'El documento no existe.';end if;
  if not public.puede_ligar_documento(tipo,d.sucursal_id) then raise exception 'No puedes ligar tareas a este documento.';end if;
  s:=d.sucursal_id;txt:=d.texto;
 elsif r='admin' then s:=nullif(p_datos->>'sucursal_id','')::uuid;
 else s:=public.mi_sucursal();
 end if;
 asignado:=(p_datos->>'asignado_a')::uuid;
 if not exists(select 1 from public.personas_asignables(s) x where x.id=asignado) then raise exception 'Esa persona no puede recibir esta tarea.';end if;
 insert into public.tareas(titulo,descripcion,prioridad,vence,asignado_a,creado_por,sucursal_id,
   orden_id,factura_id,ventas_dia_id,apertura_proyecto_id,apertura_item_id,documento_texto)
 values(trim(p_datos->>'titulo'),nullif(trim(coalesce(p_datos->>'descripcion','')),''),coalesce(nullif(p_datos->>'prioridad',''),'media')::public.prioridad_tarea,
   nullif(p_datos->>'vence','')::date,asignado,auth.uid(),s,
   case when tipo='orden' then doc end,case when tipo='factura' then doc end,case when tipo='ventas_dia' then doc end,
   case when tipo='apertura_proyecto' then doc end,case when tipo='apertura_item' then doc end,txt)
 returning numero into n;
 return n;
end $$;

-- Lo que esta persona ve, con nombres y datos vivos del documento. Las cerradas, solo los últimos 30 días
-- (una tarea pedida por número o por documento sale siempre).
create function public.tareas_visibles(p_numero bigint default null,p_documento uuid default null)
returns table(id uuid,numero bigint,titulo text,descripcion text,estado text,prioridad text,vence date,
 asignado_a uuid,asignado text,asignado_activo boolean,creado_por uuid,creador text,sucursal_id uuid,sucursal text,origen text,
 documento_tipo text,documento_id uuid,documento_texto text,documento_ruta text,documento_anulado boolean,
 motivo_cierre text,revision integer,creada_en timestamptz,actualizada_en timestamptz,cerrada_en timestamptz)
language sql stable security definer set search_path='' as $$
 select t.id,t.numero,t.titulo,t.descripcion,t.estado::text,t.prioridad::text,t.vence,
  t.asignado_a,a.nombre,a.activo,t.creado_por,c.nombre,t.sucursal_id,s.nombre,t.origen,
  x.tipo,x.doc,t.documento_texto,d.ruta,coalesce(d.anulado,false),
  t.motivo_cierre,t.revision,t.creada_en,t.actualizada_en,t.cerrada_en
 from public.tareas t
 join public.perfiles a on a.id=t.asignado_a
 left join public.perfiles c on c.id=t.creado_por
 left join public.sucursales s on s.id=t.sucursal_id
 cross join lateral (select case when t.orden_id is not null then 'orden' when t.factura_id is not null then 'factura'
   when t.ventas_dia_id is not null then 'ventas_dia' when t.apertura_proyecto_id is not null then 'apertura_proyecto'
   when t.apertura_item_id is not null then 'apertura_item' end tipo,
   coalesce(t.orden_id,t.factura_id,t.ventas_dia_id,t.apertura_proyecto_id,t.apertura_item_id) doc) x
 left join lateral public.documento_tarea(x.tipo,x.doc) d on true
 where public.puede_ver_tarea(t.asignado_a,t.creado_por,t.sucursal_id)
  and (p_numero is null or t.numero=p_numero)
  and (p_documento is null or x.doc=p_documento)
  and (p_numero is not null or p_documento is not null or t.cerrada_en is null or t.cerrada_en>now()-interval '30 days')
 order by t.numero desc
$$;

create function public.contar_mis_tareas() returns table(abiertas integer,vencidas integer)
language sql stable security definer set search_path='' as $$
 select count(*)::integer,(count(*) filter(where vence<public.hoy_mx()))::integer
 from public.tareas where asignado_a=auth.uid() and public.mi_rol() is not null and estado not in ('hecho','cancelada')
$$;

-- (Task 3 agrega aquí mover_tarea, actualizar_tarea, comentar_tarea e hilo_tarea.)

revoke all on function public.registrar_historial_tarea(),public.documento_tarea(text,uuid),public.puede_ligar_documento(text,uuid),
 public.error_datos_tarea(jsonb,text[]) from public,anon,authenticated;
revoke all on function public.puede_ver_tarea(uuid,uuid,uuid),public.personas_asignables(uuid),public.documento_para_tarea(text,uuid),
 public.crear_tarea(jsonb),public.tareas_visibles(bigint,uuid),public.contar_mis_tareas() from public,anon;
-- puede_ver_tarea también la necesita la RLS, que corre como el usuario.
grant execute on function public.puede_ver_tarea(uuid,uuid,uuid),public.personas_asignables(uuid),public.documento_para_tarea(text,uuid),
 public.crear_tarea(jsonb),public.tareas_visibles(bigint,uuid),public.contar_mis_tareas() to authenticated;
commit;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/tareas.test.mjs`
Expected: PASS en las 9 primeras; «la prueba SQL de Sebastián» queda en `skip` hasta Task 4.

- [ ] **Step 5: Register test and commit**

Agregar ` tests/tareas.test.mjs` al final del script `test` de `package.json`.

```bash
git add supabase/migrations/20261102120000_tareas.sql tests/tareas.test.mjs package.json
git commit -m "Tareas: tablas, visibilidad por puesto y alta ligada a documentos"
```

---

### Task 3: Migración — mover, editar, comentar e hilo

**Files:**
- Modify: `supabase/migrations/20261102120000_tareas.sql` (reemplazar la línea `-- (Task 3 agrega aquí …)` y ampliar `revoke`/`grant`)
- Test: `tests/tareas.test.mjs` (agregar pruebas antes de la de «Sebastián»)

**Interfaces:**
- Consumes: `crear_tarea`, `tareas_visibles`, `puede_ver_tarea`, `personas_asignables`, `error_datos_tarea` (Task 2); helpers `como`, `crear`, `visibles`, `nueva`, `U`, `S` de `tests/tareas.test.mjs`.
- Produces:
  - `mover_tarea(p_numero bigint, p_revision integer, p_estado text, p_comentario text) returns void`
  - `actualizar_tarea(p_numero bigint, p_revision integer, p_datos jsonb) returns void` — claves: `titulo`, `descripcion`, `prioridad`, `vence`, `asignado_a`
  - `comentar_tarea(p_numero bigint, p_texto text) returns void`
  - `hilo_tarea(p_numero bigint) returns table(tipo text, autor text, texto text, campo text, antes text, despues text, fecha timestamptz)`

- [ ] **Step 1: Write the failing tests**

Agregar a `tests/tareas.test.mjs`, antes de la prueba de «Sebastián»:

```js
const mover=async(db,id,n,estado,comentario='')=>{await como(db,id);
 const rev=(await db.query('select revision from public.tareas where numero=$1',[n])).rows[0].revision;
 await db.query('select public.mover_tarea($1,$2,$3,$4)',[n,rev,estado,comentario]);};
const estado=async(db,n)=>(await db.query('select estado::text e,cerrada_en is not null cerrada from public.tareas where numero=$1',[n])).rows[0];

test('tareas: el asignado lleva a revisión; quien creó aprueba o regresa',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Subir remisión',asignado_a:U.ana,sucursal_id:S.z});
  await mover(db,U.ana,n,'en_curso');
  await rechaza(mover(db,U.ana,n,'hecho'),/No puedes hacer ese cambio de estado/);
  await mover(db,U.ana,n,'en_revision');
  await rechaza(mover(db,U.ana,n,'en_curso','me equivoqué'),/No puedes hacer ese cambio de estado/);
  await rechaza(mover(db,U.admin,n,'en_curso'),/Para regresar la tarea escribe qué falta/);
  await mover(db,U.admin,n,'en_curso','Falta la firma del proveedor');
  await mover(db,U.ana,n,'en_revision');
  await mover(db,U.admin,n,'hecho');
  assert.deepEqual(await estado(db,n),{e:'hecho',cerrada:true});
  await rechaza(mover(db,U.admin,n,'en_curso','reabrir'),/No puedes hacer ese cambio de estado/);
 }finally{await db.close();}
});

test('tareas: el gerente cierra lo de su sucursal; el encargado lo que creó; corporativo nada',async()=>{
 const db=await nueva();
 try{
  const a=await crear(db,U.admin,{titulo:'De oficina para Ana',asignado_a:U.ana,sucursal_id:S.z});
  await mover(db,U.ana,a,'en_revision');
  await mover(db,U.gerente,a,'hecho');
  const b=await crear(db,U.encargado,{titulo:'Del encargado',asignado_a:U.ana});
  await mover(db,U.ana,b,'en_revision');
  await mover(db,U.encargado,b,'hecho');
  const c=await crear(db,U.gerente,{titulo:'Del gerente para Ana',asignado_a:U.ana});
  await mover(db,U.ana,c,'en_revision');
  await rechaza(mover(db,U.encargado,c,'hecho'),/No puedes hacer ese cambio de estado/);
  await rechaza(mover(db,U.corp,c,'hecho'),/Corporativo solo puede consultar/);
  await rechaza(mover(db,U.luis,c,'hecho'),/Tarea no encontrada/);
 }finally{await db.close();}
});

test('tareas: cancelar exige motivo y lo guarda',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Duplicada',asignado_a:U.ana,sucursal_id:S.z});
  await rechaza(mover(db,U.admin,n,'cancelada','x'),/Escribe el motivo de la cancelación/);
  await rechaza(mover(db,U.ana,n,'cancelada','No me toca a mí'),/No puedes hacer ese cambio de estado/);
  await mover(db,U.admin,n,'cancelada','Duplicada de DODO-1');
  assert.deepEqual(await estado(db,n),{e:'cancelada',cerrada:true});
  assert.equal((await db.query('select motivo_cierre from public.tareas where numero=$1',[n])).rows[0].motivo_cierre,'Duplicada de DODO-1');
 }finally{await db.close();}
});

test('tareas: revisión vieja se rechaza sin pisar el cambio',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Concurrente',asignado_a:U.ana,sucursal_id:S.z});
  await como(db,U.ana);
  await db.query('select public.mover_tarea($1,1,$2,$3)',[n,'en_curso','']);
  await como(db,U.admin);
  await rechaza(db.query('select public.mover_tarea($1,1,$2,$3)',[n,'cancelada','Ya no aplica']),/La tarea cambió mientras la veías/);
  assert.equal((await estado(db,n)).e,'en_curso');
 }finally{await db.close();}
});

test('tareas: usuario dado de baja no mueve; sus tareas quedan marcadas',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Para Ana',asignado_a:U.ana,sucursal_id:S.z});
  await db.exec(`update perfiles set activo=false where id='${U.ana}'`);
  await rechaza(mover(db,U.ana,n,'en_curso'),/Tu usuario no está activo/);
  assert.equal((await visibles(db,U.admin))[0].asignado_activo,false);
 }finally{await db.close();}
});

test('tareas: editar y reasignar; el asignado no edita',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.gerente,{titulo:'Revisar cámara',asignado_a:U.ana,prioridad:'baja'});
  const editar=async(id,datos)=>{await como(db,id);const rev=(await db.query('select revision from public.tareas where numero=$1',[n])).rows[0].revision;
   await db.query('select public.actualizar_tarea($1,$2,$3::jsonb)',[n,rev,JSON.stringify(datos)]);};
  await rechaza(editar(U.ana,{titulo:'Otra',asignado_a:U.ana}),/Solo quien creó la tarea/);
  await rechaza(editar(U.gerente,{titulo:'Revisar cámara',asignado_a:U.luis}),/Esa persona no puede recibir esta tarea/);
  await editar(U.gerente,{titulo:'Revisar cámara fría',descripcion:'Temperatura',prioridad:'alta',vence:'2026-11-04',asignado_a:U.encargado});
  const [t]=await visibles(db,U.gerente);
  assert.equal(t.titulo,'Revisar cámara fría');assert.equal(t.asignado,'Encargado Z');
  assert.deepEqual((await visibles(db,U.ana)),[]);
 }finally{await db.close();}
});

test('tareas: comentarios e hilo con historial en orden',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Con hilo',asignado_a:U.ana,sucursal_id:S.z});
  await como(db,U.ana);await db.query('select public.comentar_tarea($1,$2)',[n,'Ya la estoy revisando']);
  await rechaza((async()=>{await como(db,U.corp);await db.query('select public.comentar_tarea($1,$2)',[n,'hola']);})(),/Corporativo solo puede consultar/);
  await rechaza((async()=>{await como(db,U.luis);await db.query('select public.comentar_tarea($1,$2)',[n,'hola']);})(),/Tarea no encontrada/);
  await rechaza((async()=>{await como(db,U.ana);await db.query('select public.comentar_tarea($1,$2)',[n,'   ']);})(),/Escribe un comentario/);
  await mover(db,U.ana,n,'en_revision');
  await como(db,U.admin);
  const hilo=(await db.query('select tipo,autor,texto,campo,antes,despues from public.hilo_tarea($1)',[n])).rows;
  assert.deepEqual(hilo.map(h=>[h.tipo,h.autor,h.campo??h.texto]),[['cambio','Julio','creada'],['comentario','Ana (op Z)','Ya la estoy revisando'],['cambio','Ana (op Z)','estado']]);
  assert.deepEqual([hilo[2].antes,hilo[2].despues],['por_hacer','en_revision']);
  await como(db,U.luis);
  assert.deepEqual((await db.query('select * from public.hilo_tarea($1)',[n])).rows,[]);
 }finally{await db.close();}
});

test('tareas: el historial de reasignación muestra nombres',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Reasignar',asignado_a:U.ana,sucursal_id:S.z});
  await como(db,U.admin);
  await db.query('select public.actualizar_tarea($1,1,$2::jsonb)',[n,JSON.stringify({titulo:'Reasignar',asignado_a:U.gerente})]);
  const h=(await db.query(`select antes,despues from public.hilo_tarea($1) where campo='asignado_a'`,[n])).rows[0];
  assert.deepEqual(h,{antes:'Ana (op Z)',despues:'Gerente Z'});
 }finally{await db.close();}
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/tareas.test.mjs`
Expected: FAIL en las nuevas con `function public.mover_tarea(...) does not exist`.

- [ ] **Step 3: Implement**

En `supabase/migrations/20261102120000_tareas.sql`, reemplazar la línea `-- (Task 3 agrega aquí mover_tarea, actualizar_tarea, comentar_tarea e hilo_tarea.)` por:

```sql
-- Lee la tarea para escribir: activa, visible y en la revisión que vio la pantalla.
create function public.tarea_para_escribir(p_numero bigint,p_revision integer) returns public.tareas
language plpgsql security definer set search_path='' as $$
declare t public.tareas;
begin
 if public.mi_rol() is null then raise exception 'Tu usuario no está activo.';end if;
 if public.mi_rol()::text='corporativo' then raise exception 'Corporativo solo puede consultar.';end if;
 select * into t from public.tareas where numero=p_numero for update;
 if not found or not public.puede_ver_tarea(t.asignado_a,t.creado_por,t.sucursal_id) then raise exception 'Tarea no encontrada.';end if;
 if p_revision is not null and t.revision<>p_revision then raise exception 'La tarea cambió mientras la veías. Recarga e intenta de nuevo.';end if;
 return t;
end $$;

-- Quien creó la tarea, un admin o el gerente de su sucursal.
create function public.administra_tarea(t public.tareas) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.mi_rol()::text='admin' or t.creado_por=auth.uid()
  or (public.mi_rol()::text='gerente' and t.sucursal_id=public.mi_sucursal()),false)
$$;

create function public.mover_tarea(p_numero bigint,p_revision integer,p_estado text,p_comentario text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.tareas;paso text;manda boolean;nota text:=trim(coalesce(p_comentario,''));
begin
 t:=public.tarea_para_escribir(p_numero,p_revision);
 paso:=t.estado::text||'>'||coalesce(p_estado,'');
 manda:=public.administra_tarea(t);
 if not ((paso in ('por_hacer>en_curso','por_hacer>en_revision','en_curso>en_revision') and (manda or t.asignado_a=auth.uid()))
   or (manda and (paso in ('en_revision>hecho','en_revision>en_curso') or (p_estado='cancelada' and t.estado::text not in ('hecho','cancelada'))))) then
  raise exception 'No puedes hacer ese cambio de estado.';
 end if;
 if paso='en_revision>en_curso' and length(nota)<5 then raise exception 'Para regresar la tarea escribe qué falta (al menos 5 caracteres).';end if;
 if p_estado='cancelada' and length(nota)<5 then raise exception 'Escribe el motivo de la cancelación (al menos 5 caracteres).';end if;
 if length(nota)>4000 then raise exception 'El comentario es demasiado largo (máximo 4000 caracteres).';end if;
 update public.tareas set estado=p_estado::public.estado_tarea,revision=revision+1,actualizada_en=now(),
  cerrada_en=case when p_estado in ('hecho','cancelada') then now() end,
  motivo_cierre=case when p_estado='cancelada' then nota else motivo_cierre end
 where id=t.id;
 if nota<>'' then insert into public.tarea_comentarios(tarea_id,autor_id,texto) values(t.id,auth.uid(),nota);end if;
end $$;

create function public.actualizar_tarea(p_numero bigint,p_revision integer,p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare t public.tareas;msg text;
begin
 t:=public.tarea_para_escribir(p_numero,p_revision);
 if not public.administra_tarea(t) then raise exception 'Solo quien creó la tarea, su gerente o un admin pueden editarla.';end if;
 if t.estado::text in ('hecho','cancelada') then raise exception 'La tarea ya está cerrada.';end if;
 msg:=public.error_datos_tarea(p_datos,array['titulo','descripcion','prioridad','vence','asignado_a']);
 if msg is not null then raise exception '%',msg;end if;
 if (p_datos->>'asignado_a')::uuid<>t.asignado_a
   and not exists(select 1 from public.personas_asignables(t.sucursal_id) x where x.id=(p_datos->>'asignado_a')::uuid) then
  raise exception 'Esa persona no puede recibir esta tarea.';
 end if;
 update public.tareas set titulo=trim(p_datos->>'titulo'),descripcion=nullif(trim(coalesce(p_datos->>'descripcion','')),''),
  prioridad=coalesce(nullif(p_datos->>'prioridad',''),'media')::public.prioridad_tarea,vence=nullif(p_datos->>'vence','')::date,
  asignado_a=(p_datos->>'asignado_a')::uuid,revision=revision+1,actualizada_en=now()
 where id=t.id;
end $$;

create function public.comentar_tarea(p_numero bigint,p_texto text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.tareas;
begin
 t:=public.tarea_para_escribir(p_numero,null);
 if length(trim(coalesce(p_texto,'')))=0 then raise exception 'Escribe un comentario.';end if;
 if length(trim(p_texto))>4000 then raise exception 'El comentario es demasiado largo (máximo 4000 caracteres).';end if;
 insert into public.tarea_comentarios(tarea_id,autor_id,texto) values(t.id,auth.uid(),trim(p_texto));
 update public.tareas set actualizada_en=now() where id=t.id;
end $$;

-- Comentarios e historial juntos, en orden. En reasignaciones, antes/después ya vienen como nombres.
create function public.hilo_tarea(p_numero bigint)
returns table(tipo text,autor text,texto text,campo text,antes text,despues text,fecha timestamptz)
language sql stable security definer set search_path='' as $$
 with t as (select x.id from public.tareas x where x.numero=p_numero and public.puede_ver_tarea(x.asignado_a,x.creado_por,x.sucursal_id))
 select * from (
  select 'comentario'::text tipo,p.nombre autor,c.texto,null::text campo,null::text antes,null::text despues,c.fecha
  from public.tarea_comentarios c join t on t.id=c.tarea_id join public.perfiles p on p.id=c.autor_id
  union all
  select 'cambio',p.nombre,null,h.campo,
   case when h.campo='asignado_a' then (select y.nombre from public.perfiles y where y.id=h.antes::uuid) else h.antes end,
   case when h.campo='asignado_a' then (select y.nombre from public.perfiles y where y.id=h.despues::uuid) else h.despues end,h.fecha
  from public.tarea_historial h join t on t.id=h.tarea_id left join public.perfiles p on p.id=h.usuario_id
 ) u order by 7,1 desc
$$;
```

> Nota de orden: comentario y cambio de la misma transacción comparten `now()`; `order by fecha, tipo desc` pone el
> cambio de estado antes que su comentario («cambio» > «comentario»). En la prueba del hilo el comentario va en una
> llamada aparte, así que el orden es por fecha. Si PGlite devuelve el mismo `now()` en llamadas distintas
> (todas en autocommit, no debería), cambiar `fecha` por `clock_timestamp()` en los `default` de ambas tablas.

Y cambiar los bloques finales `revoke`/`grant` por:

```sql
revoke all on function public.registrar_historial_tarea(),public.documento_tarea(text,uuid),public.puede_ligar_documento(text,uuid),
 public.error_datos_tarea(jsonb,text[]),public.tarea_para_escribir(bigint,integer),public.administra_tarea(public.tareas) from public,anon,authenticated;
revoke all on function public.puede_ver_tarea(uuid,uuid,uuid),public.personas_asignables(uuid),public.documento_para_tarea(text,uuid),
 public.crear_tarea(jsonb),public.tareas_visibles(bigint,uuid),public.contar_mis_tareas(),
 public.mover_tarea(bigint,integer,text,text),public.actualizar_tarea(bigint,integer,jsonb),public.comentar_tarea(bigint,text),public.hilo_tarea(bigint) from public,anon;
-- puede_ver_tarea también la necesita la RLS, que corre como el usuario.
grant execute on function public.puede_ver_tarea(uuid,uuid,uuid),public.personas_asignables(uuid),public.documento_para_tarea(text,uuid),
 public.crear_tarea(jsonb),public.tareas_visibles(bigint,uuid),public.contar_mis_tareas(),
 public.mover_tarea(bigint,integer,text,text),public.actualizar_tarea(bigint,integer,jsonb),public.comentar_tarea(bigint,text),public.hilo_tarea(bigint) to authenticated;
```

- [ ] **Step 4: Run tests**

Run: `node --test tests/tareas.test.mjs`
Expected: PASS en todas (la de Sebastián sigue en skip).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261102120000_tareas.sql tests/tareas.test.mjs
git commit -m "Tareas: mover con revisión, editar, comentar e hilo con historial"
```

---

### Task 4: Prueba SQL para producción

**Files:**
- Create: `supabase/pruebas/20261102120000_tareas.sql`
- Test: `tests/tareas.test.mjs` (la prueba con `skip` deja de saltarse sola)

**Interfaces:**
- Consumes: todas las RPC de Tasks 2–3. Datos reales necesarios: un admin activo, un corporativo activo, un gerente activo con sucursal, un usuario de operación activo de esa sucursal y una factura no cancelada de esa sucursal.

- [ ] **Step 1: Write the SQL test**

`supabase/pruebas/20261102120000_tareas.sql`:

```sql
-- Ejecutar completo después de 20261102120000_tareas.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;c uuid;g record;o uuid;f uuid;n bigint;rev integer;ok boolean;k integer;
begin
  select id into a from public.perfiles where activo and rol::text='admin' order by nombre limit 1;
  select id into c from public.perfiles where activo and rol::text='corporativo' limit 1;
  select p.id,p.sucursal_id into g from public.perfiles p where p.activo and p.rol::text='gerente' and p.sucursal_id is not null
   and exists(select 1 from public.perfiles x where x.activo and x.rol::text='operacion' and x.sucursal_id=p.sucursal_id) limit 1;
  select id into o from public.perfiles where activo and rol::text='operacion' and sucursal_id=g.sucursal_id limit 1;
  select id into f from public.facturas where estado::text<>'cancelada' and sucursal_id=g.sucursal_id limit 1;
  if a is null or c is null or g.id is null or o is null or f is null then
   raise exception 'FALTAN DATOS: admin, corporativo, gerente con operación en su sucursal y una factura vigente de esa sucursal.';
  end if;

  -- 1. Admin crea ligada a factura; la tarea toma la sucursal de la factura.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  n:=public.crear_tarea(jsonb_build_object('titulo','Prueba de tareas','prioridad','alta','vence','','asignado_a',o,'documento_tipo','factura','documento_id',f));
  if (select sucursal_id from public.tareas where numero=n) is distinct from g.sucursal_id then raise exception 'FALLÓ: sucursal de la factura';end if;
  if (select documento_texto from public.tareas where numero=n) not like 'Factura %' then raise exception 'FALLÓ: texto del documento';end if;

  -- 2. Gerente no puede ligar facturas.
  perform set_config('request.jwt.claims',json_build_object('sub',g.id,'role','authenticated')::text,true);
  ok:=false;begin perform public.crear_tarea(jsonb_build_object('titulo','No debe','asignado_a',o,'documento_tipo','factura','documento_id',f));
  exception when others then ok:=sqlerrm like 'No puedes ligar%';end;
  if not ok then raise exception 'FALLÓ: gerente ligó una factura';end if;

  -- 3. Operación ve su tarea, la manda a revisión y no la puede cerrar.
  perform set_config('request.jwt.claims',json_build_object('sub',o,'role','authenticated')::text,true);
  if not exists(select 1 from public.tareas_visibles(n)) then raise exception 'FALLÓ: el asignado no ve su tarea';end if;
  perform public.mover_tarea(n,1,'en_revision','Listo');
  ok:=false;begin perform public.mover_tarea(n,2,'hecho','');exception when others then ok:=sqlerrm like 'No puedes hacer ese cambio%';end;
  if not ok then raise exception 'FALLÓ: operación cerró su tarea';end if;

  -- 4. Corporativo solo consulta.
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  if not exists(select 1 from public.tareas_visibles(n)) then raise exception 'FALLÓ: corporativo no ve la tarea';end if;
  ok:=false;begin perform public.comentar_tarea(n,'hola');exception when others then ok:=sqlerrm like 'Corporativo solo puede consultar%';end;
  if not ok then raise exception 'FALLÓ: corporativo comentó';end if;

  -- 5. Regresar exige comentario; con revisión vieja se rechaza; aprobar cierra.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false;begin perform public.mover_tarea(n,2,'en_curso','');exception when others then ok:=sqlerrm like 'Para regresar%';end;
  if not ok then raise exception 'FALLÓ: regresó sin comentario';end if;
  ok:=false;begin perform public.mover_tarea(n,1,'hecho','');exception when others then ok:=sqlerrm like 'La tarea cambió%';end;
  if not ok then raise exception 'FALLÓ: aceptó revisión vieja';end if;
  perform public.mover_tarea(n,2,'hecho','');
  if (select estado::text from public.tareas where numero=n)<>'hecho' or (select cerrada_en from public.tareas where numero=n) is null then raise exception 'FALLÓ: no cerró';end if;

  -- 6. Historial: creada + 2 cambios de estado; dos comentarios ('Listo' y ninguno al aprobar).
  select count(*) into k from public.hilo_tarea(n) where tipo='cambio';
  if k<>3 then raise exception 'FALLÓ: historial con % cambios',k;end if;
  select count(*) into k from public.hilo_tarea(n) where tipo='comentario';
  if k<>1 then raise exception 'FALLÓ: % comentarios',k;end if;

  -- 7. Nadie escribe directo en las tablas.
  if has_table_privilege('authenticated','public.tareas','insert') or has_table_privilege('authenticated','public.tarea_historial','insert') then
   raise exception 'FALLÓ: authenticated puede escribir directo';end if;

  raise exception 'PRUEBAS OK';
end $$;
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test tests/tareas.test.mjs`
Expected: PASS en todas, incluida «la prueba SQL de Sebastián termina en PRUEBAS OK» (ya no se salta). Si falla con «FALTAN DATOS», revisar que el `insert` de la factura `…fc` de la prueba quedó en su sucursal.

- [ ] **Step 3: Commit**

```bash
git add supabase/pruebas/20261102120000_tareas.sql
git commit -m "Tareas: prueba SQL para ejecutar en producción"
```

---

### Task 5: Datos y acciones del servidor

**Files:**
- Create: `app/tareas/datos.ts`, `app/tareas/acciones.ts`

**Interfaces:**
- Consumes: RPC de Tasks 2–3; `Tarea`, `EntradaHilo`, `leerNuevaTarea`, `numeroDeClave`, `pideComentario`, `ESTADOS` de `lib/tareas.ts`; `obtenerPerfil` de `lib/contexto.ts`; `volver` de `app/compras/servidor.ts`; `SOLO_CONSULTA` de `lib/roles.ts`.
- Produces:
  - `leerTareas(supabase, { numero?: number; documento?: string }?): Promise<Tarea[]>`
  - `leerHilo(supabase, numero: number): Promise<EntradaHilo[]>`
  - `type Persona = { id: string; nombre: string; rol: string }`, `leerPersonas(supabase, sucursal: string | null): Promise<Persona[]>`
  - `contarMisTareas(supabase): Promise<{ abiertas: number; vencidas: number }>` (0/0 si falla)
  - `leerDocumento(supabase, tipo: TipoDocumento, id: string): Promise<{ texto: string; sucursal_id: string | null; ruta: string; anulado: boolean } | { error: string }>`
  - Server actions (FormData): `crearTarea`, `moverTarea`, `actualizarTarea`, `comentarTarea`. Campos: `numero`, `revision`, `estado`, `comentario`, `volver_a` y los de `DatosTarea`.

- [ ] **Step 1: Write `app/tareas/datos.ts`**

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntradaHilo, Tarea, TipoDocumento } from "@/lib/tareas";

export type Persona = { id: string; nombre: string; rol: string };

export async function leerTareas(supabase: SupabaseClient, o: { numero?: number; documento?: string } = {}): Promise<Tarea[]> {
  const { data, error } = await supabase.rpc("tareas_visibles", { p_numero: o.numero ?? null, p_documento: o.documento ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Tarea[]).map((t) => ({ ...t, numero: Number(t.numero) }));
}

export async function leerHilo(supabase: SupabaseClient, numero: number): Promise<EntradaHilo[]> {
  const { data, error } = await supabase.rpc("hilo_tarea", { p_numero: numero });
  if (error) throw new Error(error.message);
  return (data ?? []) as EntradaHilo[];
}

export async function leerPersonas(supabase: SupabaseClient, sucursal: string | null): Promise<Persona[]> {
  const { data, error } = await supabase.rpc("personas_asignables", { p_sucursal: sucursal });
  if (error) throw new Error(error.message);
  return (data ?? []) as Persona[];
}

/** Para el menú: si la migración no está o falla, el contador no aparece y la página sigue. */
export async function contarMisTareas(supabase: SupabaseClient): Promise<{ abiertas: number; vencidas: number }> {
  const { data, error } = await supabase.rpc("contar_mis_tareas");
  const fila = (data as { abiertas: number; vencidas: number }[] | null)?.[0];
  return error || !fila ? { abiertas: 0, vencidas: 0 } : { abiertas: Number(fila.abiertas), vencidas: Number(fila.vencidas) };
}

export async function leerDocumento(supabase: SupabaseClient, tipo: TipoDocumento, id: string) {
  const { data, error } = await supabase.rpc("documento_para_tarea", { p_tipo: tipo, p_id: id });
  if (error) return { error: error.message };
  const d = (data as { texto: string; sucursal_id: string | null; ruta: string; anulado: boolean }[] | null)?.[0];
  return d ?? { error: "El documento no existe." };
}
```

- [ ] **Step 2: Write `app/tareas/acciones.ts`**

```ts
"use server";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { SOLO_CONSULTA, esCorporativo } from "@/lib/roles";
import { clave, leerNuevaTarea, numeroDeClave } from "@/lib/tareas";
import { volver } from "../compras/servidor";

const texto = (fd: FormData, c: string) => String(fd.get(c) ?? "").trim();
/** Solo rutas internas: evita redirigir a otro sitio con `volver_a`. */
const rutaSegura = (r: string, otra: string) => (r.startsWith("/") && !r.startsWith("//") ? r : otra);

async function cliente(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (esCorporativo(perfil.rol)) volver(ruta, "error", SOLO_CONSULTA);
  return supabase;
}
const listo = (ruta: string, msg: string): never => { revalidatePath("/tareas", "layout"); revalidatePath("/"); return volver(ruta, "ok", msg); };

export async function crearTarea(fd: FormData) {
  const ruta = rutaSegura(texto(fd, "volver_a"), "/tareas/nueva");
  const supabase = await cliente(ruta);
  const r = leerNuevaTarea((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const { data, error } = await supabase.rpc("crear_tarea", { p_datos: r.datos });
  if (error) return volver(ruta, "error", error.message);
  listo(`/tareas/${data}`, `${clave(Number(data))} creada y asignada.`);
}

export async function moverTarea(fd: FormData) {
  const numero = numeroDeClave(texto(fd, "numero"));
  const ruta = rutaSegura(texto(fd, "volver_a"), numero ? `/tareas/${numero}` : "/tareas");
  if (!numero) return volver(ruta, "error", "Tarea no encontrada.");
  const supabase = await cliente(ruta);
  const { error } = await supabase.rpc("mover_tarea", {
    p_numero: numero, p_revision: Number(texto(fd, "revision")), p_estado: texto(fd, "estado"), p_comentario: texto(fd, "comentario"),
  });
  if (error) return volver(ruta, "error", error.message);
  listo(ruta, `${clave(numero)} actualizada.`);
}

export async function actualizarTarea(fd: FormData) {
  const numero = numeroDeClave(texto(fd, "numero"));
  const ruta = numero ? `/tareas/${numero}` : "/tareas";
  if (!numero) return volver(ruta, "error", "Tarea no encontrada.");
  const supabase = await cliente(ruta);
  const r = leerNuevaTarea((c) => texto(fd, c));
  if ("error" in r) return volver(ruta, "error", r.error);
  const { titulo, descripcion, prioridad, vence, asignado_a } = r.datos;
  const { error } = await supabase.rpc("actualizar_tarea", {
    p_numero: numero, p_revision: Number(texto(fd, "revision")), p_datos: { titulo, descripcion, prioridad, vence, asignado_a },
  });
  if (error) return volver(ruta, "error", error.message);
  listo(ruta, "Cambios guardados.");
}

export async function comentarTarea(fd: FormData) {
  const numero = numeroDeClave(texto(fd, "numero"));
  const ruta = numero ? `/tareas/${numero}` : "/tareas";
  if (!numero) return volver(ruta, "error", "Tarea no encontrada.");
  const supabase = await cliente(ruta);
  const { error } = await supabase.rpc("comentar_tarea", { p_numero: numero, p_texto: texto(fd, "comentario") });
  if (error) return volver(ruta, "error", error.message);
  listo(ruta, "Comentario agregado.");
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/tareas/datos.ts app/tareas/acciones.ts
git commit -m "Tareas: lecturas por RPC y acciones del servidor"
```

---

### Task 6: Marco del módulo, tarjeta y «Mis tareas»

**Files:**
- Create: `app/tareas/layout.tsx`, `app/tareas/loading.tsx`, `app/tareas/error.tsx`, `app/tareas/TarjetaTarea.tsx`, `app/tareas/page.tsx`

**Interfaces:**
- Consumes: `leerTareas` (Task 5); `agrupar`, `clave`, `meTocaCerrar`, `puedeAbrirDocumento`, `puedeCrearTareas`, `vencida`, `veTablero`, `GRUPOS_VENCE`, `ESTADOS`, `PRIORIDADES`, `TONO_PRIORIDAD`, `type Tarea`, `type Quien` (Task 1); `hoyCalendarioMX`, `fechaTexto` de `lib/formato`.
- Produces: `TarjetaTarea({ t, hoy, rol }: { t: Tarea; hoy: string; rol: Rol })` (server component) usado por Tasks 9–11.

- [ ] **Step 1: Layout, loading y error**

Copiar `app/cumplimiento/loading.tsx` y `app/cumplimiento/error.tsx` a `app/tareas/` y, en `error.tsx`, cambiar el texto del módulo a «Tareas». `app/tareas/layout.tsx`:

```tsx
import { Marco } from "@/components/Marco";
import { obtenerPerfil } from "@/lib/contexto";
export const dynamic = "force-dynamic";
/** Todos los puestos entran: cada quien ve sus tareas (la base decide qué). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  return <Marco perfil={perfil} titulo="Tareas" detalle="Pendientes y seguimiento">{children}</Marco>;
}
```

- [ ] **Step 2: Tarjeta**

`app/tareas/TarjetaTarea.tsx`:

```tsx
import Link from "next/link";
import { fechaTexto } from "@/lib/formato";
import { ESTADOS, PRIORIDADES, TONO_PRIORIDAD, clave, puedeAbrirDocumento, vencida, type Tarea } from "@/lib/tareas";
import type { Rol } from "@/lib/tipos";

/** Tarjeta de una tarea: clave, título, prioridad, vencimiento, persona, sucursal y documento ligado. */
export function TarjetaTarea({ t, hoy, rol }: { t: Tarea; hoy: string; rol: Rol }) {
  const abrir = t.documento_tipo && t.documento_ruta && puedeAbrirDocumento(rol, t.documento_tipo);
  return (
    <article className="tarjeta tarjeta-tarea" data-vencida={vencida(t, hoy) || undefined}>
      <p className="tarea-cabecera">
        <Link href={`/tareas/${t.numero}`} className="tarea-clave">{clave(t.numero)}</Link>
        <span className="insignia" data-tono={TONO_PRIORIDAD[t.prioridad]}>{PRIORIDADES[t.prioridad]}</span>
        <span className="insignia">{ESTADOS[t.estado]}</span>
        {t.origen === "automatica" && <span className="insignia" data-tono="info">Automática</span>}
      </p>
      <h3><Link href={`/tareas/${t.numero}`}>{t.titulo}</Link></h3>
      <p className="tarea-datos">
        <span>{t.asignado}{!t.asignado_activo && <> · <strong>asignado inactivo</strong></>}</span>
        <span>{t.sucursal ?? "Oficina"}</span>
        <span>{t.vence ? <>{vencida(t, hoy) ? "Venció" : "Vence"} {fechaTexto(t.vence)}</> : "Sin fecha"}</span>
      </p>
      {t.documento_texto && (
        <p className="tarea-documento">
          {abrir ? <Link href={t.documento_ruta!}>{t.documento_texto}</Link> : t.documento_texto}
          {t.documento_anulado && <> · <span className="insignia" data-tono="peligro">documento anulado</span></>}
        </p>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Página Mis tareas**

`app/tareas/page.tsx`:

```tsx
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { GRUPOS_VENCE, abierta, agrupar, meTocaCerrar, puedeCrearTareas, veTablero, type Quien } from "@/lib/tareas";
import { leerTareas } from "./datos";
import { TarjetaTarea } from "./TarjetaTarea";

const PESTANAS = { asignadas: "Asignadas a mí", creadas: "Creadas por mí", revision: "En revisión (me toca cerrar)" } as const;
type Pestana = keyof typeof PESTANAS;

export default async function MisTareas({ searchParams }: { searchParams: Promise<{ ver?: string; ok?: string; error?: string }> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const quien: Quien = { id: perfil.id, rol: perfil.rol, sucursal_id: perfil.sucursal_id };
  const ver: Pestana = p.ver && Object.hasOwn(PESTANAS, p.ver) ? (p.ver as Pestana) : "asignadas";
  let tareas;
  try { tareas = await leerTareas(supabase); }
  catch { return <p className="aviso aviso-error">No se pudieron consultar las tareas. Revisa que la migración 20261102120000_tareas esté aplicada y vuelve a intentar.</p>; }
  const hoy = hoyCalendarioMX();
  const lista = tareas.filter((t) => abierta(t.estado) && (
    ver === "asignadas" ? t.asignado_a === perfil.id : ver === "creadas" ? t.creado_por === perfil.id : meTocaCerrar(t, quien)));
  return <>
    <EncabezadoPagina titulo="Mis tareas" info="Lo que tienes pendiente, lo que pediste y lo que te toca revisar para cerrar."
      acciones={<>
        {veTablero(perfil.rol) && <Link className="boton boton-secundario" href="/tareas/tablero">Tablero</Link>}
        {puedeCrearTareas(perfil.rol) && <Link className="boton" href="/tareas/nueva">Nueva tarea</Link>}
      </>} />
    <Aviso ok={p.ok} error={p.error} />
    <nav className="accesos" aria-label="Pestañas">
      {(Object.keys(PESTANAS) as Pestana[]).filter((k) => k === "asignadas" || puedeCrearTareas(perfil.rol)).map((k) =>
        <Link key={k} href={k === "asignadas" ? "/tareas" : `/tareas?ver=${k}`} aria-current={ver === k ? "page" : undefined}>{PESTANAS[k]}</Link>)}
    </nav>
    {lista.length === 0
      ? <EstadoVacio titulo="Nada pendiente aquí" descripcion={ver === "asignadas" ? "Cuando alguien te asigne una tarea aparecerá en esta lista." : undefined} />
      : agrupar(lista, hoy).map(([g, ts]) => (
        <section className="seccion" key={g}>
          <h2>{GRUPOS_VENCE[g]} <span className="insignia" data-tono={g === "vencidas" ? "peligro" : undefined}>{ts.length}</span></h2>
          <div className="rejilla-tarjetas">{ts.map((t) => <TarjetaTarea key={t.id} t={t} hoy={hoy} rol={perfil.rol} />)}</div>
        </section>
      ))}
  </>;
}
```

- [ ] **Step 4: Styles**

Al final de `app/globals.css`:

```css
/* Tareas */
.tarjeta-tarea { display: grid; gap: 0.35rem; }
.tarjeta-tarea[data-vencida] { border-left: 4px solid var(--alerta-texto); }
.tarea-cabecera { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin: 0; }
.tarea-clave { font-weight: 700; font-variant-numeric: tabular-nums; }
.tarjeta-tarea h3 { margin: 0; font-size: 1rem; }
.tarea-datos { display: flex; flex-wrap: wrap; gap: 0.25rem 0.9rem; margin: 0; color: var(--neutro-texto); font-size: 0.9rem; }
.tarea-documento { margin: 0; font-size: 0.9rem; }
```

Antes de escribir, comprobar con `grep -n "rejilla-tarjetas" app/globals.css` que la clase existe; si no, usar la que usen las tarjetas de `app/activos/page.tsx` (`grep -n "className=\"rejilla" app/activos/page.tsx`).

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` → sin errores.

```bash
git add app/tareas app/globals.css
git commit -m "Tareas: Mis tareas con pestañas y grupos por vencimiento"
```

---

### Task 7: Detalle de la tarea

**Files:**
- Create: `app/tareas/[numero]/page.tsx`

**Interfaces:**
- Consumes: `leerTareas({numero})`, `leerHilo`, `leerPersonas` (Task 5); `moverTarea`, `actualizarTarea`, `comentarTarea` (Task 5); `TarjetaTarea` no se usa aquí; `siguientes`, `administra`, `pideComentario`, `textoCambio`, `clave`, `numeroDeClave`, `ESTADOS`, `PRIORIDADES`, `puedeAbrirDocumento`, `abierta` (Task 1).

- [ ] **Step 1: Write the page**

`app/tareas/[numero]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hora } from "@/lib/formato";
import {
  ESTADOS, PRIORIDADES, abierta, administra, clave, numeroDeClave, pideComentario, puedeAbrirDocumento, siguientes, textoCambio,
  type EstadoTarea, type Prioridad, type Quien,
} from "@/lib/tareas";
import { actualizarTarea, comentarTarea, moverTarea } from "../acciones";
import { leerHilo, leerPersonas, leerTareas } from "../datos";

const BOTON: Record<EstadoTarea, string> = { por_hacer: "", en_curso: "Empezar", en_revision: "Mandar a revisión", hecho: "Aprobar", cancelada: "Cancelar tarea" };

export default async function DetalleTarea({ params, searchParams }: { params: Promise<{ numero: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ numero: n }, avisos] = await Promise.all([params, searchParams]);
  const numero = numeroDeClave(n);
  if (!numero) notFound();
  const { supabase, perfil } = await obtenerPerfil();
  const [t] = await leerTareas(supabase, { numero });
  if (!t) notFound();
  const quien: Quien = { id: perfil.id, rol: perfil.rol, sucursal_id: perfil.sucursal_id };
  const edita = abierta(t.estado) && administra(t, quien) && perfil.rol !== "corporativo";
  const [hilo, personas] = await Promise.all([leerHilo(supabase, numero), edita ? leerPersonas(supabase, t.sucursal_id) : Promise.resolve([])]);
  const pasos = siguientes(t, quien);
  const abrir = t.documento_tipo && t.documento_ruta && puedeAbrirDocumento(perfil.rol, t.documento_tipo);
  // Si el asignado actual ya no es elegible (baja), igual se muestra para poder reasignar.
  const opciones = personas.some((p) => p.id === t.asignado_a) ? personas : [{ id: t.asignado_a, nombre: `${t.asignado} (actual)`, rol: "" }, ...personas];
  return <>
    <EncabezadoPagina titulo={<>{clave(t.numero)} · {t.titulo}</>} descripcion={<>{ESTADOS[t.estado]} · {PRIORIDADES[t.prioridad]} · {t.sucursal ?? "Oficina"}</>} />
    <Link href="/tareas">Volver a mis tareas</Link>
    <Aviso {...avisos} />
    <section className="seccion">
      <dl className="tarjeta-datos">
        <dt>Asignada a</dt><dd>{t.asignado}{!t.asignado_activo && " · asignado inactivo"}</dd>
        <dt>Creada por</dt><dd>{t.creador ?? "Sistema"} · {fechaTexto(t.creada_en.slice(0, 10))}</dd>
        <dt>Vence</dt><dd>{t.vence ? fechaTexto(t.vence) : "Sin fecha"}</dd>
        {t.documento_texto && <><dt>Documento</dt><dd>{abrir ? <Link href={t.documento_ruta!}>{t.documento_texto}</Link> : t.documento_texto}{t.documento_anulado && " · documento anulado"}</dd></>}
        {t.descripcion && <><dt>Descripción</dt><dd className="texto-saltos">{t.descripcion}</dd></>}
        {t.motivo_cierre && <><dt>Motivo de cancelación</dt><dd>{t.motivo_cierre}</dd></>}
      </dl>
    </section>
    {pasos.length > 0 && <section className="seccion"><h2>Mover</h2><div className="acciones-tarea">
      {pasos.map((a) => (
        <form key={a} action={moverTarea} className="formulario">
          <input type="hidden" name="numero" value={t.numero} /><input type="hidden" name="revision" value={t.revision} /><input type="hidden" name="estado" value={a} />
          {pideComentario(t.estado, a) && <div className="campo"><label htmlFor={`c-${a}`}>{a === "cancelada" ? "Motivo de cancelación" : "Qué falta"}</label>
            <textarea id={`c-${a}`} name="comentario" rows={2} minLength={5} maxLength={4000} required /></div>}
          <BotonEnviar className={a === "cancelada" ? "boton boton-secundario" : "boton"}>{a === "en_curso" && t.estado === "en_revision" ? "Regresar" : BOTON[a]}</BotonEnviar>
        </form>
      ))}
    </div></section>}
    {edita && <section className="seccion"><h2>Editar</h2>
      <form action={actualizarTarea} className="formulario">
        <input type="hidden" name="numero" value={t.numero} /><input type="hidden" name="revision" value={t.revision} />
        <div className="campo"><label htmlFor="titulo">Título</label><input id="titulo" name="titulo" required minLength={3} maxLength={200} defaultValue={t.titulo} /></div>
        <div className="campo"><label htmlFor="descripcion">Descripción</label><textarea id="descripcion" name="descripcion" rows={3} maxLength={4000} defaultValue={t.descripcion ?? ""} /></div>
        <div className="rejilla">
          <div className="campo"><label htmlFor="asignado_a">Asignada a</label><select id="asignado_a" name="asignado_a" defaultValue={t.asignado_a}>{opciones.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div className="campo"><label htmlFor="prioridad">Prioridad</label><select id="prioridad" name="prioridad" defaultValue={t.prioridad}>{(Object.keys(PRIORIDADES) as Prioridad[]).map((k) => <option key={k} value={k}>{PRIORIDADES[k]}</option>)}</select></div>
          <div className="campo"><label htmlFor="vence">Vence</label><input id="vence" name="vence" type="date" defaultValue={t.vence ?? ""} /></div>
        </div>
        <BotonEnviar>Guardar cambios</BotonEnviar>
      </form>
    </section>}
    <section className="seccion"><h2>Seguimiento</h2>
      <ol className="hilo-tarea">
        {hilo.map((e, i) => <li key={i} data-tipo={e.tipo}>
          <strong>{e.autor ?? "Sistema"}</strong> {e.tipo === "comentario" ? <span className="texto-saltos">{e.texto}</span> : textoCambio(e)}
          <small> · {fechaTexto(e.fecha.slice(0, 10))} {hora(e.fecha)}</small>
        </li>)}
      </ol>
      {perfil.rol !== "corporativo" && <form action={comentarTarea} className="formulario">
        <input type="hidden" name="numero" value={t.numero} />
        <div className="campo"><label htmlFor="comentario">Comentario</label><textarea id="comentario" name="comentario" rows={2} required maxLength={4000} /></div>
        <BotonEnviar pendiente="Enviando…">Comentar</BotonEnviar>
      </form>}
    </section>
  </>;
}
```

Antes de usar `hora`, comprobar su firma con `grep -n "export function hora\|export const hora" lib/formato.ts`; si recibe `Date`, pasar `new Date(e.fecha)`.

Agregar a `app/globals.css`:

```css
.acciones-tarea { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; }
.hilo-tarea { list-style: none; padding: 0; display: grid; gap: 0.6rem; }
.hilo-tarea li { padding: 0.5rem 0.75rem; border-radius: 8px; background: var(--neutro-fondo); }
.hilo-tarea li[data-tipo="cambio"] { background: transparent; color: var(--neutro-texto); font-size: 0.9rem; }
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck` → sin errores.

```bash
git add "app/tareas/[numero]" app/globals.css
git commit -m "Tareas: detalle con mover, editar, comentarios e historial"
```

---

### Task 8: Nueva tarea (con o sin documento)

**Files:**
- Create: `app/tareas/nueva/page.tsx`

**Interfaces:**
- Consumes: `leerPersonas`, `leerDocumento`, `crearTarea` (Task 5); `DOCUMENTOS`, `PRIORIDADES`, `puedeCrearTareas`, `type TipoDocumento`, `type Prioridad` (Task 1).
- Produces: URL `/tareas/nueva?tipo=<TipoDocumento>&id=<uuid>` que usan Tasks 10 (documentos). Para admin sin documento, `?sucursal=<uuid>|oficina` recarga la lista de personas.

- [ ] **Step 1: Write the page**

`app/tareas/nueva/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { DOCUMENTOS, PRIORIDADES, puedeCrearTareas, type Prioridad, type TipoDocumento } from "@/lib/tareas";
import { crearTarea } from "../acciones";
import { leerDocumento, leerPersonas } from "../datos";

export default async function NuevaTarea({ searchParams }: { searchParams: Promise<{ tipo?: string; id?: string; sucursal?: string; error?: string }> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeCrearTareas(perfil.rol)) redirect("/tareas");
  const tipo = p.tipo && Object.hasOwn(DOCUMENTOS, p.tipo) ? (p.tipo as TipoDocumento) : null;
  const doc = tipo && p.id ? await leerDocumento(supabase, tipo, p.id) : null;
  if (doc && "error" in doc) return <><EncabezadoPagina titulo="Nueva tarea" /><Aviso error={doc.error} /><Link href="/tareas">Volver</Link></>;
  const admin = perfil.rol === "admin";
  const { data: sucursales } = admin && !doc ? await supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>() : { data: null };
  // Sucursal de la tarea: la del documento; el admin elige; los demás, la suya.
  const sucursal = doc ? doc.sucursal_id : admin ? (p.sucursal && p.sucursal !== "oficina" ? p.sucursal : null) : perfil.sucursal_id;
  const personas = await leerPersonas(supabase, sucursal);
  const aqui = `/tareas/nueva?${new URLSearchParams(Object.entries({ tipo: p.tipo, id: p.id, sucursal: p.sucursal }).filter(([, v]) => v) as [string, string][])}`;
  return <>
    <EncabezadoPagina titulo="Nueva tarea" descripcion={doc ? <>{DOCUMENTOS[tipo!]} · {doc.texto}</> : undefined} />
    <Aviso error={p.error} />
    {admin && !doc && <form className="barra-filtros" aria-label="Sucursal de la tarea">
      <label htmlFor="sucursal">Sucursal</label>
      <select id="sucursal" name="sucursal" defaultValue={p.sucursal ?? "oficina"}>
        <option value="oficina">Oficina</option>{sucursales?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
      </select>
      <button className="boton boton-secundario" type="submit">Elegir</button>
    </form>}
    <form action={crearTarea} className="formulario">
      <input type="hidden" name="volver_a" value={aqui} />
      <input type="hidden" name="sucursal_id" value={!doc && admin ? sucursal ?? "" : ""} />
      {doc && <><input type="hidden" name="documento_tipo" value={tipo!} /><input type="hidden" name="documento_id" value={p.id} /></>}
      <div className="campo"><label htmlFor="titulo">Qué hay que hacer</label><input id="titulo" name="titulo" required minLength={3} maxLength={200} defaultValue={doc?.texto ?? ""} /></div>
      <div className="campo"><label htmlFor="descripcion">Detalle</label><textarea id="descripcion" name="descripcion" rows={3} maxLength={4000} /></div>
      <div className="rejilla">
        <div className="campo"><label htmlFor="asignado_a">Asignar a</label>
          <select id="asignado_a" name="asignado_a" required defaultValue=""><option value="" disabled>Elige una persona</option>{personas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></div>
        <div className="campo"><label htmlFor="prioridad">Prioridad</label>
          <select id="prioridad" name="prioridad" defaultValue="media">{(Object.keys(PRIORIDADES) as Prioridad[]).map((k) => <option key={k} value={k}>{PRIORIDADES[k]}</option>)}</select></div>
        <div className="campo"><label htmlFor="vence">Vence</label><input id="vence" name="vence" type="date" /></div>
      </div>
      {personas.length === 0 && <p className="aviso aviso-error">No hay personas activas a quienes puedas asignar esta tarea.</p>}
      <BotonEnviar>Crear tarea</BotonEnviar>
    </form>
    <Link href={doc ? doc.ruta : "/tareas"}>Cancelar</Link>
  </>;
}
```

- [ ] **Step 2: Typecheck and commit**

Run: `npm run typecheck` → sin errores.

```bash
git add app/tareas/nueva
git commit -m "Tareas: alta con documento ligado y personas elegibles"
```

---

### Task 9: Tablero y lista con filtros

**Files:**
- Create: `app/tareas/tablero/page.tsx`, `app/tareas/tablero/TableroTareas.tsx`

**Interfaces:**
- Consumes: `leerTareas` (Task 5), `moverTarea` (Task 5); `COLUMNAS`, `ESTADOS`, `MODULOS`, `PRIORIDADES`, `filtrar`, `leerFiltros`, `ordenPendientes`, `siguientes`, `veTablero`, `type Tarea`, `type Quien` (Task 1); `TarjetaTarea` (Task 6); `SelectorVista`, `leerVista` (existentes).
- Produces: nada que usen otras tareas.

- [ ] **Step 1: Client board**

`app/tareas/tablero/TableroTareas.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { COLUMNAS, ESTADOS, PRIORIDADES, TONO_PRIORIDAD, clave, pideComentario, type EstadoTarea, type Tarea } from "@/lib/tareas";
import { moverTarea } from "../acciones";

/**
 * Columnas por estado. En computadora se arrastra la tarjeta a otra columna; en celular (o sin ratón) cada tarjeta
 * trae un selector con los estados a los que esta persona puede moverla. Ambos envían el mismo formulario.
 * Regresar y cancelar piden texto: esos pasos se hacen desde el detalle.
 */
export function TableroTareas({ tareas, pasos, volverA }: { tareas: Tarea[]; pasos: Record<string, EstadoTarea[]>; volverA: string }) {
  const [columna, setColumna] = useState<EstadoTarea>("por_hacer");
  const [arrastrando, setArrastrando] = useState<Tarea | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const enviar = (t: Tarea, a: EstadoTarea) => {
    const f = form.current; if (!f) return;
    (f.elements.namedItem("numero") as HTMLInputElement).value = String(t.numero);
    (f.elements.namedItem("revision") as HTMLInputElement).value = String(t.revision);
    (f.elements.namedItem("estado") as HTMLInputElement).value = a;
    f.requestSubmit();
  };
  const directos = (t: Tarea) => (pasos[t.id] ?? []).filter((a) => !pideComentario(t.estado, a));
  return <>
    <form ref={form} action={moverTarea} hidden>
      <input name="numero" /><input name="revision" /><input name="estado" /><input name="volver_a" defaultValue={volverA} />
    </form>
    <nav className="accesos solo-celular" aria-label="Columna">
      {COLUMNAS.map((c) => <button key={c} type="button" aria-current={columna === c ? "page" : undefined} onClick={() => setColumna(c)}>{ESTADOS[c]} ({tareas.filter((t) => t.estado === c).length})</button>)}
    </nav>
    <div className="tablero-tareas">
      {COLUMNAS.map((c) => (
        <section key={c} className="tablero-columna" data-activa={columna === c || undefined}
          onDragOver={(e) => { if (arrastrando && directos(arrastrando).includes(c)) e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); if (arrastrando && directos(arrastrando).includes(c)) enviar(arrastrando, c); setArrastrando(null); }}>
          <h2>{ESTADOS[c]} <span className="insignia">{tareas.filter((t) => t.estado === c).length}</span></h2>
          {tareas.filter((t) => t.estado === c).map((t) => (
            <article key={t.id} className="tarjeta tarjeta-tarea" draggable={directos(t).length > 0}
              onDragStart={() => setArrastrando(t)} onDragEnd={() => setArrastrando(null)}>
              <p className="tarea-cabecera"><Link href={`/tareas/${t.numero}`} className="tarea-clave">{clave(t.numero)}</Link>
                <span className="insignia" data-tono={TONO_PRIORIDAD[t.prioridad]}>{PRIORIDADES[t.prioridad]}</span></p>
              <h3><Link href={`/tareas/${t.numero}`}>{t.titulo}</Link></h3>
              <p className="tarea-datos"><span>{t.asignado}</span><span>{t.sucursal ?? "Oficina"}</span>{t.vence && <span>{t.vence}</span>}</p>
              {directos(t).length > 0 && (
                <label className="tarea-mover">Mover a{" "}
                  <select defaultValue="" onChange={(e) => e.target.value && enviar(t, e.target.value as EstadoTarea)}>
                    <option value="" disabled>Elegir</option>{directos(t).map((a) => <option key={a} value={a}>{ESTADOS[a]}</option>)}
                  </select>
                </label>
              )}
            </article>
          ))}
        </section>
      ))}
    </div>
  </>;
}
```

- [ ] **Step 2: Page with filters and list view**

`app/tareas/tablero/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { EstadoVacio } from "@/components/EstadoVacio";
import { SelectorVista } from "@/components/SelectorVista";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyCalendarioMX } from "@/lib/formato";
import { leerVista } from "@/lib/vista";
import { MODULOS, PRIORIDADES, filtrar, leerFiltros, ordenPendientes, puedeCrearTareas, siguientes, veTablero, type Modulo, type Prioridad, type Quien } from "@/lib/tareas";
import { leerTareas } from "../datos";
import { TarjetaTarea } from "../TarjetaTarea";
import { TableroTareas } from "./TableroTareas";

type Params = Record<string, string | undefined>;

export default async function Tablero({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!veTablero(perfil.rol)) redirect("/tareas");
  let tareas;
  try { tareas = await leerTareas(supabase); }
  catch { return <p className="aviso aviso-error">No se pudieron consultar las tareas. Revisa que la migración 20261102120000_tareas esté aplicada y vuelve a intentar.</p>; }
  const hoy = hoyCalendarioMX(), f = leerFiltros(p), vista = leerVista(p.vista);
  const quien: Quien = { id: perfil.id, rol: perfil.rol, sucursal_id: perfil.sucursal_id };
  const lista = filtrar(tareas, f, hoy).filter((t) => t.estado !== "cancelada");
  const personas = [...new Map(tareas.map((t) => [t.asignado_a, t.asignado])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sucursales = [...new Map(tareas.filter((t) => t.sucursal_id).map((t) => [t.sucursal_id!, t.sucursal!])).entries()];
  const aqui = `/tareas/tablero?${new URLSearchParams(Object.entries(p).filter(([k, v]) => v && !["ok", "error"].includes(k)) as [string, string][])}`;
  return <>
    <EncabezadoPagina titulo="Tablero de tareas" info="Todo el backlog que puedes ver. Arrastra una tarjeta o usa «Mover a»; regresar y cancelar se hacen desde el detalle."
      acciones={puedeCrearTareas(perfil.rol) && <Link className="boton" href="/tareas/nueva">Nueva tarea</Link>} />
    <Aviso ok={p.ok} error={p.error} />
    <form className="barra-filtros" aria-label="Filtros">
      {vista === "lista" && <input type="hidden" name="vista" value="lista" />}
      <select name="persona" defaultValue={f.persona} aria-label="Persona"><option value="">Todas las personas</option>{personas.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      <select name="sucursal" defaultValue={f.sucursal} aria-label="Sucursal"><option value="">Todas las sucursales</option><option value="oficina">Oficina</option>{sucursales.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
      <select name="prioridad" defaultValue={f.prioridad} aria-label="Prioridad"><option value="">Toda prioridad</option>{(Object.keys(PRIORIDADES) as Prioridad[]).map((k) => <option key={k} value={k}>{PRIORIDADES[k]}</option>)}</select>
      <select name="modulo" defaultValue={f.modulo} aria-label="Módulo"><option value="">Todo módulo</option>{(Object.keys(MODULOS) as Modulo[]).map((k) => <option key={k} value={k}>{MODULOS[k]}</option>)}</select>
      <select name="origen" defaultValue={f.origen} aria-label="Origen"><option value="">Manual y automática</option><option value="manual">Manual</option><option value="automatica">Automática</option></select>
      <label><input type="checkbox" name="vencidas" value="1" defaultChecked={f.vencidas} /> Solo vencidas</label>
      <button className="boton boton-secundario" type="submit">Filtrar</button>
    </form>
    <SelectorVista ruta="/tareas/tablero" params={p} vista={vista} />
    {lista.length === 0 ? <EstadoVacio titulo="No hay tareas con estos filtros" />
      : vista === "lista"
        ? <div className="rejilla-tarjetas">{ordenPendientes(lista, hoy).map((t) => <TarjetaTarea key={t.id} t={t} hoy={hoy} rol={perfil.rol} />)}</div>
        : <TableroTareas tareas={lista} pasos={Object.fromEntries(lista.map((t) => [t.id, siguientes(t, quien)]))} volverA={aqui} />}
  </>;
}
```

`SelectorVista` muestra «Tarjetas / Lista»; aquí «Tarjetas» es el tablero. No hace falta cambiar el componente.

- [ ] **Step 3: Styles**

Agregar a `app/globals.css`:

```css
.tablero-tareas { display: grid; grid-template-columns: repeat(4, minmax(220px, 1fr)); gap: 0.75rem; align-items: start; }
.tablero-columna { display: grid; gap: 0.5rem; padding: 0.5rem; border-radius: 10px; background: var(--neutro-fondo); min-height: 6rem; }
.tablero-columna h2 { font-size: 0.95rem; margin: 0.25rem; }
.tarjeta-tarea[draggable="true"] { cursor: grab; }
.tarea-mover { font-size: 0.85rem; }
.solo-celular { display: none; }
@media (max-width: 767px) {
  .solo-celular { display: flex; }
  .tablero-tareas { grid-template-columns: 1fr; }
  .tablero-columna:not([data-activa]) { display: none; }
}
```

Antes, `grep -n "solo-celular" app/globals.css`: si ya existe, no redefinirla.

- [ ] **Step 4: Typecheck and commit**

Run: `npm run typecheck` → sin errores.

```bash
git add app/tareas/tablero app/globals.css
git commit -m "Tareas: tablero por estado y lista con filtros en la URL"
```

---

### Task 10: Tareas dentro de los documentos

**Files:**
- Create: `components/TareasDelDocumento.tsx`
- Modify: `app/compras/facturas/[id]/page.tsx:235` (después de `<Aviso ok={ok} error={error} />`)
- Modify: `app/compras/ordenes/[id]/page.tsx:206` (después de `<Aviso ok={ok} error={error} />`)
- Modify: `app/aperturas/[id]/page.tsx:24` (después de `<Aviso ok={f.ok} error={f.error}/>`)
- Modify: `app/aperturas/[id]/items/[item]/page.tsx` (después de `<Aviso {...avisos}/>`)
- Modify: `app/ventas/conciliacion/page.tsx` y `app/ventas/conciliacion/ConciliacionMes.tsx` (id del día y enlace)

**Interfaces:**
- Consumes: `leerTareas({documento})` (Task 5), `TarjetaTarea` (Task 6), `puedeLigar`, `abierta`, `type TipoDocumento` (Task 1), `/tareas/nueva?tipo=&id=` (Task 8).
- Produces: `TareasDelDocumento({ supabase, tipo, id, rol, hoy }: { supabase: SupabaseClient; tipo: TipoDocumento; id: string; rol: Rol; hoy: string })` (server component asíncrono).

- [ ] **Step 1: Component**

`components/TareasDelDocumento.tsx`:

```tsx
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerTareas } from "@/app/tareas/datos";
import { TarjetaTarea } from "@/app/tareas/TarjetaTarea";
import { abierta, puedeLigar, type TipoDocumento } from "@/lib/tareas";
import type { Rol } from "@/lib/tipos";

/** Franja de tareas abiertas del documento y botón para asignar una nueva. Si la migración falta, no estorba. */
export async function TareasDelDocumento({ supabase, tipo, id, rol, hoy }: { supabase: SupabaseClient; tipo: TipoDocumento; id: string; rol: Rol; hoy: string }) {
  const tareas = await leerTareas(supabase, { documento: id }).then((ts) => ts.filter((t) => abierta(t.estado))).catch(() => null);
  if (tareas === null) return null;
  const liga = puedeLigar(rol, tipo);
  if (!tareas.length && !liga) return null;
  return (
    <section className="seccion tareas-documento">
      <h2>Tareas abiertas {tareas.length > 0 && <span className="insignia">{tareas.length}</span>}</h2>
      {tareas.length > 0 && <div className="rejilla-tarjetas">{tareas.map((t) => <TarjetaTarea key={t.id} t={t} hoy={hoy} rol={rol} />)}</div>}
      {liga && <Link className="boton boton-secundario" href={`/tareas/nueva?tipo=${tipo}&id=${id}`}>Asignar tarea</Link>}
    </section>
  );
}
```

- [ ] **Step 2: Insert in facturas, órdenes y aperturas**

En cada página: importar `import { TareasDelDocumento } from "@/components/TareasDelDocumento";` y, si no lo importa ya, `hoyCalendarioMX` de `@/lib/formato`. Insertar justo después de la línea del `Aviso` indicada en **Files**:

- `app/compras/facturas/[id]/page.tsx`: `<TareasDelDocumento supabase={supabase} tipo="factura" id={id} rol={perfil.rol} hoy={hoyCalendarioMX()} />`
- `app/compras/ordenes/[id]/page.tsx`: `<TareasDelDocumento supabase={supabase} tipo="orden" id={id} rol={perfil.rol} hoy={hoyCalendarioMX()} />`
- `app/aperturas/[id]/page.tsx`: `<TareasDelDocumento supabase={supabase} tipo="apertura_proyecto" id={id} rol={perfil.rol} hoy={hoyCalendarioMX()} />`
- `app/aperturas/[id]/items/[item]/page.tsx`: `<TareasDelDocumento supabase={supabase} tipo="apertura_item" id={item} rol={perfil.rol} hoy={hoyCalendarioMX()} />`

Confirmar antes en cada archivo que la variable del id se llama `id` (o `item`) con `grep -n "params" <archivo>`.

- [ ] **Step 3: Días de venta**

`ConciliacionMes.tsx` es un client component; el día no puede renderizar el server component, así que lleva un enlace y el conteo:

1. En `app/ventas/conciliacion/page.tsx`, en el `select` de `ventas_dia`, agregar `id` al inicio: `"id,sucursal_id,fecha,importacion_id,total,efectivo,tarjeta,en_linea,iva"`, y agregar `id: string` al tipo `Dia` del archivo.
2. En el `map` que arma `filas`, agregar `ventas_dia_id: d.id,` y, antes del `return`, leer los conteos:

```tsx
 const abiertas: Record<string, number> = {};
 for (const t of await leerTareas(supabase).catch(() => [])) if (t.documento_tipo === "ventas_dia" && t.documento_id && abierta(t.estado)) abiertas[t.documento_id] = (abiertas[t.documento_id] ?? 0) + 1;
```

con `import { leerTareas } from "@/app/tareas/datos";` e `import { abierta, puedeLigar } from "@/lib/tareas";`. Pasar a `<ConciliacionMes … tareas={abiertas} ligaTareas={puedeLigar(perfil.rol, "ventas_dia")} />`.

3. En `ConciliacionMes.tsx`: agregar `ventas_dia_id: string;` a `DiaConciliacion`, `tareas: Record<string, number>; ligaTareas: boolean;` a las props de `ConciliacionMes` y de `DetalleDia` (pasarlas de uno a otro), y dentro de `DetalleDia`, después de `<div className="dia-diferencia">…</div>`:

```tsx
      {(ligaTareas || (tareas[d.ventas_dia_id] ?? 0) > 0) && <p className="dia-tareas">
        {(tareas[d.ventas_dia_id] ?? 0) > 0 && <Link href="/tareas/tablero?modulo=ventas">{tareas[d.ventas_dia_id]} tarea(s) abierta(s)</Link>}
        {ligaTareas && <> <Link className="boton boton-secundario" href={`/tareas/nueva?tipo=ventas_dia&id=${d.ventas_dia_id}`}>Asignar tarea</Link></>}
      </p>}
```

(con `import Link from "next/link";` si el archivo no lo importa).

- [ ] **Step 4: Verify tests and types**

Run: `npm run typecheck && npm test`
Expected: sin errores; todas las pruebas pasan (las de conciliación no cambian porque solo se agregan campos).

- [ ] **Step 5: Commit**

```bash
git add components/TareasDelDocumento.tsx app/compras/facturas app/compras/ordenes app/aperturas app/ventas/conciliacion
git commit -m "Tareas: asignar y ver tareas abiertas desde facturas, órdenes, días de venta y aperturas"
```

---

### Task 11: Menú con contador e Inicio

**Files:**
- Modify: `lib/roles.ts` (`Enlace`, `menuLateral`)
- Modify: `lib/roles.test.ts:72-80`
- Modify: `components/Marco.tsx`, `components/MenuLateral.tsx`
- Modify: `app/(app)/page.tsx` (bloque «Tus pendientes» después de `{alertasCumplimiento && <FranjaAlertas … />}`)

**Interfaces:**
- Consumes: `contarMisTareas`, `leerTareas` (Task 5); `ordenPendientes`, `abierta` (Task 1); `TarjetaTarea` (Task 6); `crearClienteServidor` de `lib/supabase/server`.
- Produces: `Enlace.contador?: { n: number; urgente: boolean }`.

- [ ] **Step 1: Failing test for the menu**

En `lib/roles.test.ts`, reemplazar el cuerpo de `test("menú lateral: cada puesto ve solo sus grupos", …)` por:

```ts
  assert.deepEqual(grupos("operacion"), ["Sucursal", "Tareas", "Conocimiento"]);
  assert.deepEqual(grupos("encargado"), ["Sucursal", "Tareas", "Conocimiento"]);
  assert.deepEqual(grupos("gerente"), ["Sucursal", "Tareas", "Efectivo", "Ventas", "Conocimiento"]);
  assert.deepEqual(grupos("admin"), ["Sucursal", "Tareas", "Efectivo", "Ventas", "Compras", "Finanzas", "Catálogos", "Proyectos y admin.", "Conocimiento"]);
  assert.deepEqual(grupos("corporativo"), ["Sucursal", "Tareas", "Efectivo", "Ventas", "Compras", "Finanzas", "Catálogos", "Proyectos y admin.", "Conocimiento"]);
  assert.deepEqual(grupo("operacion", "Tareas"), ["/tareas"]);
  assert.deepEqual(grupo("encargado", "Tareas"), ["/tareas", "/tareas/tablero"]);
  assert.deepEqual(grupo("admin", "Proyectos y admin."), ["/aperturas", "/activos", "/cumplimiento", "/administracion/usuarios"]);
  assert.deepEqual(grupo("corporativo", "Proyectos y admin."), ["/aperturas", "/activos", "/cumplimiento"]);
```

Run: `node --experimental-strip-types --test lib/roles.test.ts` → FAIL (no hay grupo «Tareas»).

- [ ] **Step 2: Menu group**

En `lib/roles.ts`, cambiar el tipo:

```ts
export type Enlace = { href: string; texto: string; aliases?:readonly string[]; contador?: { n: number; urgente: boolean } };
```

y en `menuLateral`, justo después de cerrar el arreglo inicial `grupos` (antes de `if (puedeVerEfectivo(rol)||rol==='gerente')`):

```ts
  // Todos reciben tareas; operación solo ve las suyas, sin tablero.
  grupos.push({ titulo: "Tareas", enlaces: [{ href: "/tareas", texto: "Mis tareas" }, ...(rol !== "operacion" ? [{ href: "/tareas/tablero", texto: "Tablero" }] : [])] });
```

Run: `node --experimental-strip-types --test lib/roles.test.ts` → PASS.

- [ ] **Step 3: Counter in Marco and MenuLateral**

`components/Marco.tsx`: volver la función `async`, leer el contador y ponerlo en el enlace `/tareas`:

```tsx
import { contarMisTareas } from "@/app/tareas/datos";
import { crearClienteServidor } from "@/lib/supabase/server";
// …
export async function Marco({ perfil, titulo, detalle, aviso, children }: { /* mismos tipos */ }) {
  const base = menuLateral(perfil.rol);
  const { abiertas, vencidas } = await contarMisTareas(await crearClienteServidor()).catch(() => ({ abiertas: 0, vencidas: 0 }));
  const menu = !abiertas ? base : { ...base, grupos: base.grupos.map((g) => ({ ...g, enlaces: g.enlaces.map((e) =>
    e.href === "/tareas" ? { ...e, contador: { n: abiertas, urgente: vencidas > 0 } } : e) })) };
  // … resto igual, usando `menu`
```

`components/MenuLateral.tsx`: en la línea del enlace de grupo (`<Link className="lateral-enlace" href={e.href} …>{e.texto}</Link>`), cambiar el contenido a:

```tsx
{e.texto}{e.contador && <span className="contador-menu" data-urgente={e.contador.urgente || undefined} aria-label={`${e.contador.n} pendientes${e.contador.urgente ? ", con vencidas" : ""}`}>{e.contador.n}</span>}
```

Agregar `Tareas: "lista"` a `ICONO_GRUPO`. En `app/globals.css`:

```css
.contador-menu { margin-left: auto; min-width: 1.4rem; padding: 0 0.35rem; border-radius: 999px; text-align: center; font-size: 0.75rem; font-weight: 700; background: var(--neutro-fondo); color: var(--neutro-texto); }
.contador-menu[data-urgente] { background: var(--alerta-fondo); color: var(--alerta-texto); }
.lateral-enlace { display: flex; align-items: center; gap: 0.4rem; }
```

Antes, `grep -n "\.lateral-enlace {" app/globals.css`; si ya define `display`, solo agregar `gap` y `align-items` si faltan.

Comprobar que ningún client component importa `Marco`: `grep -rln "use client" app components | xargs grep -l "components/Marco"` → sin resultados.

- [ ] **Step 4: Inicio «Tus pendientes»**

En `app/(app)/page.tsx`, importar `leerTareas` de `@/app/tareas/datos`, `ordenPendientes`, `abierta` de `@/lib/tareas` y `TarjetaTarea` de `@/app/tareas/TarjetaTarea`. Junto a donde se lee `alertasCumplimiento`, agregar:

```tsx
  const pendientes = ordenPendientes((await leerTareas(supabase).catch(() => [])).filter((t) => t.asignado_a === perfil.id && abierta(t.estado)), hoyCalendarioMX()).slice(0, 3);
```

y después de `{alertasCumplimiento && <FranjaAlertas alertas={alertasCumplimiento} />}`:

```tsx
      {pendientes.length > 0 && <section className="seccion">
        <h2>Tus pendientes <Link href="/tareas">Ver todas</Link></h2>
        <div className="rejilla-tarjetas">{pendientes.map((t) => <TarjetaTarea key={t.id} t={t} hoy={hoyCalendarioMX()} rol={perfil.rol} />)}</div>
      </section>}
```

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm test` → sin errores, todo pasa.

```bash
git add lib/roles.ts lib/roles.test.ts components/Marco.tsx components/MenuLateral.tsx "app/(app)/page.tsx" app/globals.css
git commit -m "Tareas: grupo en el menú con contador y pendientes en Inicio"
```

---

### Task 12: Verificación final y entrega

**Files:** ninguno nuevo (solo correcciones que salgan).

- [ ] **Step 1: Suite completa y build**

Run: `npm run typecheck && npm test && npm run build`
Expected: todo en verde. Si `build` falla por variables de entorno de Supabase, copiar `.env.local` del clon principal (no versionado) y repetir.

- [ ] **Step 2: Prueba en el navegador (vista previa local)**

Con la migración aplicada en un proyecto de prueba de Supabase (no producción; ver memoria «Proyecto Supabase correcto»), iniciar el dev server con `preview_start` y revisar con un admin:
1. `/tareas/nueva` → crear tarea de oficina asignada a sí mismo → aparece en *Mis tareas* y el contador del menú sube.
2. Abrir una factura → «Asignar tarea» → la tarea muestra «Factura … · …» y la factura la lista en «Tareas abiertas».
3. `/tareas/tablero` → arrastrar de *Por hacer* a *En curso*; en ancho 375 px, cambiar de columna con las pestañas y mover con «Mover a».
4. Detalle → Mandar a revisión → Regresar (pide texto) → Mandar a revisión → Aprobar; el hilo muestra cada paso.
Tomar captura del tablero en escritorio y en celular.

- [ ] **Step 3: Entrega de la migración**

Pasar a Sebastián, en ese orden: `supabase/migrations/20261102120000_tareas.sql` y luego `supabase/pruebas/20261102120000_tareas.sql`; esperar su resultado («PRUEBAS OK») antes de fusionar el PR.

- [ ] **Step 4: PR**

```bash
git branch -m docs/tareas-backlog feat/tareas-backlog
git push -u origin feat/tareas-backlog
```

Crear el PR a `main` en `HelperHolding/dodo-money` con resumen, pasos de prueba y la nota de la migración pendiente; deben pasar `Historial válido` y `Pruebas y tipos`.
