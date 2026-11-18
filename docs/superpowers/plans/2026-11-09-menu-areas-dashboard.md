# Menú por áreas y dashboard de inicio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menú lateral por áreas con ícono bajo secciones, pestañas automáticas del área arriba de cada página, y un dashboard de inicio para admin y corporativo con KPIs, orígenes de pedidos, venta diaria e historial de ventas.

**Architecture:** `lib/roles.ts` sigue siendo la única fuente del menú: cada grupo pasa a ser un **área** (`titulo`, `icono`, `seccion`, `enlaces`). Se conserva el nombre `grupos` en el tipo `Menu` para no romper buscador, migas ni `Marco`. `MenuLateral` pinta secciones y áreas; un componente nuevo `PestanasArea` pinta las pestañas del área activa dentro del `Marco`. El dashboard (`DashboardVentasInicio`) se rearma con dos funciones puras nuevas en `lib/ventas/inicio.ts` y una gráfica SVG nueva `LineaHistorial`.

**Tech Stack:** Next.js 15 (app router, server components), TypeScript, CSS plano (`app/marca.css`), `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-09-menu-areas-dashboard-design.md`

## Global Constraints

- Ninguna ruta, permiso, consulta de escritura ni migración cambia.
- Cada puesto ve exactamente las mismas páginas que hoy (conjunto de `href` de `enlacesDelMenu`).
- Orden de secciones: General · Operación · Finanzas · Proyectos · Marca · Inteligencia.
- Un área con una sola página no muestra pestañas.
- Íconos solo de `components/Icono.tsx`; sin librerías nuevas (ni de íconos ni de gráficas).
- Dashboard solo para admin y corporativo; gerente y operación conservan su inicio.
- Sin «contra año anterior»; se quita la tabla por canal.
- Controles del historial con enlaces y parámetros (`hist`, `alcance`), sin JavaScript obligatorio.
- Fechas sin importación nunca se dibujan como cero.
- Flujo: rama `feat/menu-areas-dashboard` → PR a `main`; pasan `Historial válido` y `Pruebas y tipos`.

## Review Focus

- **Corporativo en `/`** (inicio de la sucursal que está viendo): el área activa debe ser «Vista general» y la pestaña «Inicio de sucursal» marcada.
- **Gerente en `/recepciones`**: pestaña Recepciones dentro de «Operación diaria»; admin en `/recepciones` cae en Compras por alias.
- **Ruta de detalle** (`/compras/proveedores/123`, `/finanzas/asignacion/concepto:1`): pestañas del área correcta con la pestaña padre marcada.
- **Historial con sucursal nueva** (pocos días de datos): la línea dibuja solo los meses con datos, sin ceros ni división entre cero.
- **Periodo sin pedidos POS pero con Rappi**: orígenes muestra Rappi 100 % y mostrador 0, sin negativos.

Las tres primeras se prueban en la Tarea 1; las dos últimas en la Tarea 3.

---

## Mapeo de áreas (referencia para Tareas 1 y 2)

| Sección | Área (`titulo`) | `icono` | Enlaces, en este orden y con las condiciones de hoy |
|---|---|---|---|
| General | `Inicio` (admin/gerente/encargado/operación) o `Vista general` (corporativo) | `casa` | no corporativo: `/` Inicio, y si `puedeCambiarSucursal` `/corporativo` Vista general · corporativo: `/corporativo` Vista general, `/` Inicio de sucursal |
| General | `Tareas` | `ok` | `/tareas` Mis tareas · si `rol !== "operacion"` `/tareas/tablero` Tablero |
| General | `Ventas` | `grafica` | si `puedeVerVentas`: los 6 de hoy con sus condiciones |
| Operación | `Operación diaria` | `tienda` | `/arqueo` Arqueo de turno · si `puedeVerTurnos` `/turnos` · `/movimientos` · `/caja-chica` · `/cierre` · `/checklists` · si `puedeRecibirCompras && !puedeVerCompras` `/recepciones` |
| Operación | `Efectivo` | `billete` | si `puedeVerEfectivo || gerente`: `/recolecciones` · si `puedeVerEfectivo` `/efectivo` |
| Operación | `Compras` | `carrito` | si `puedeVerCompras`: los 7 de hoy con alias y condiciones |
| Operación | `Inventario` | `lista` | si `puedeVerCompras`: `/inventario`, `/inventario/uniformes` |
| Finanzas | `P&L` | `documento` | si `puedeVerFinanzas`: `/finanzas` P&L · `/finanzas/flujo` · `/finanzas/mermas` · `/finanzas/parametros` |
| Finanzas | `Banca` | `banco` | si `puedeVerFinanzas`: `/banca` |
| Finanzas | `Nómina` | `cartera` | si `puedeVerFinanzas`: `/finanzas/nomina` · `/finanzas/personal` · `/finanzas/retenciones` |
| Finanzas | `Catálogos` | `libro` | si `puedeVerCompras`: los 4 de hoy |
| Proyectos | `Aperturas` | `ubicacion` | si `puedeVerCompras`: `/aperturas` |
| Proyectos | `Activos` | `maletin` | si `puedeVerCompras`: `/activos` |
| Proyectos | `Cumplimiento` | `calendario` | si `puedeVerCompras`: `/cumplimiento` «Calendario de cumplimiento» |
| Proyectos | `Usuarios y sucursales` | `nombre` | si `admin`: `/administracion/usuarios` |
| Marca | `Correos` | `bandeja` | si `puedeVerCorreos`: `/correos` Campañas · si `puedeEditarCorreos` `/correos/contactos` |
| Inteligencia | `Conocimiento` | `brillo` | `/conocimiento` Manuales y Q&A · si `puedeVerVentas` `/asistente` Asistente IA |

Íconos ajustados respecto del spec (el spec lo permite): Tareas `ok`, Inventario `lista`, Aperturas `ubicacion`, Activos `maletin`, Correos `bandeja`, Conocimiento `brillo`.

---

### Task 1: Áreas en `lib/roles.ts`

**Files:**
- Modify: `lib/roles.ts:62-183`
- Modify: `lib/roles.test.ts:69-153,175-177,213-217`
- Modify: `lib/catalogos.test.ts` (sin cambios de expectativa: debe seguir pasando)

**Interfaces:**
- Produces:
  - `export type Seccion = "General" | "Operación" | "Finanzas" | "Proyectos" | "Marca" | "Inteligencia"`
  - `export const SECCIONES: readonly Seccion[]` (en ese orden)
  - `export type GrupoMenu = { titulo: string; icono: NombreIcono; seccion: Seccion; enlaces: Enlace[] }` (con `import type { NombreIcono } from "../components/Icono"`)
  - `Menu = { inicio: Enlace; grupos: GrupoMenu[] }` (sin cambio de forma)
  - `export function areaActiva(menu: Menu, ruta: string): GrupoMenu | undefined`
  - `grupoAbierto` se conserva (devuelve `areaActiva(...)?.titulo`).

- [ ] **Step 1: Prueba de igualdad de páginas (foto de hoy) y de áreas.** Agregar a `lib/roles.test.ts`:

```ts
// Foto tomada de main (6258adf) antes de reorganizar: cada puesto debe seguir viendo exactamente estas páginas.
const FOTO: Record<R, string[]> = {
  operacion: ["/","/arqueo","/caja-chica","/checklists","/cierre","/conocimiento","/movimientos","/tareas"],
  encargado: ["/","/arqueo","/caja-chica","/checklists","/cierre","/conocimiento","/movimientos","/recepciones","/tareas","/tareas/tablero","/turnos"],
  gerente: ["/","/arqueo","/asistente","/caja-chica","/checklists","/cierre","/conocimiento","/movimientos","/recepciones","/recolecciones","/tareas","/tareas/tablero","/turnos","/ventas","/ventas/conciliacion","/ventas/rappi"],
  admin: ["/","/activos","/administracion/usuarios","/aperturas","/arqueo","/asistente","/banca","/caja-chica","/catalogos","/checklists","/cierre","/compras","/compras/articulos","/compras/cargar","/compras/documentos","/compras/pagos","/compras/pagos/reservas","/compras/razones-sociales","/compras/recepciones","/conocimiento","/corporativo","/correos","/correos/contactos","/cumplimiento","/efectivo","/finanzas","/finanzas/asignacion","/finanzas/catalogo","/finanzas/flujo","/finanzas/mermas","/finanzas/nomina","/finanzas/parametros","/finanzas/personal","/finanzas/retenciones","/inventario","/inventario/uniformes","/movimientos","/recolecciones","/tareas","/tareas/tablero","/turnos","/ventas","/ventas/conciliacion","/ventas/costos","/ventas/dodois","/ventas/importar","/ventas/rappi"],
  corporativo: ["/","/activos","/aperturas","/arqueo","/asistente","/banca","/caja-chica","/catalogos","/checklists","/cierre","/compras","/compras/articulos","/compras/documentos","/compras/pagos","/compras/pagos/reservas","/compras/razones-sociales","/compras/recepciones","/conocimiento","/corporativo","/correos","/cumplimiento","/efectivo","/finanzas","/finanzas/asignacion","/finanzas/catalogo","/finanzas/flujo","/finanzas/mermas","/finanzas/nomina","/finanzas/parametros","/finanzas/personal","/finanzas/retenciones","/inventario","/inventario/uniformes","/movimientos","/recolecciones","/tareas","/tareas/tablero","/turnos","/ventas","/ventas/conciliacion","/ventas/costos","/ventas/rappi"],
  marketing: ["/correos","/correos/contactos"],
};
test("menú por áreas: cada puesto ve exactamente las mismas páginas que antes", () => {
  for (const rol of Object.keys(FOTO) as R[]) {
    assert.deepEqual([...new Set(enlacesDelMenu(menuLateral(rol)).map((e) => e.href))].sort(), FOTO[rol], rol);
  }
});
test("menú por áreas: toda área tiene ícono, sección válida y al menos una página; secciones en orden", () => {
  for (const rol of Object.keys(FOTO) as R[]) {
    const areas = menuLateral(rol).grupos;
    for (const a of areas) { assert.ok(a.icono, a.titulo); assert.ok(SECCIONES.includes(a.seccion), a.titulo); assert.ok(a.enlaces.length > 0, a.titulo); }
    const orden = areas.map((a) => SECCIONES.indexOf(a.seccion));
    assert.deepEqual(orden, [...orden].sort((x, y) => x - y), rol);
  }
});
test("areaActiva: rutas de detalle, alias y la raíz", () => {
  const admin = menuLateral("admin"), corp = menuLateral("corporativo"), gerente = menuLateral("gerente");
  assert.equal(areaActiva(admin, "/compras/proveedores/123")?.titulo, "Compras");
  assert.equal(areaActiva(admin, "/recepciones")?.titulo, "Compras");
  assert.equal(areaActiva(gerente, "/recepciones")?.titulo, "Operación diaria");
  assert.equal(areaActiva(admin, "/finanzas/asignacion/concepto:1")?.titulo, "Catálogos");
  assert.equal(areaActiva(admin, "/")?.titulo, "Inicio");
  assert.equal(areaActiva(corp, "/")?.titulo, "Vista general");
  assert.equal(areaActiva(corp, "/corporativo")?.titulo, "Vista general");
  assert.equal(areaActiva(admin, "/finanzas/nomina")?.titulo, "Nómina");
  assert.equal(areaActiva(admin, "/banca/movimientos")?.titulo, "Banca");
});
```

Agregar `areaActiva` y `SECCIONES` al `import` de la línea 13.

- [ ] **Step 2: Actualizar las expectativas viejas** (mismas páginas, nuevos títulos):
  - Líneas 73–77:
    - `operacion`/`encargado`: `["Inicio", "Tareas", "Operación diaria", "Conocimiento"]`
    - `gerente`: `["Inicio", "Tareas", "Ventas", "Operación diaria", "Efectivo", "Conocimiento"]`
    - `admin`: `["Inicio", "Tareas", "Ventas", "Operación diaria", "Efectivo", "Compras", "Inventario", "P&L", "Banca", "Nómina", "Catálogos", "Aperturas", "Activos", "Cumplimiento", "Usuarios y sucursales", "Correos", "Conocimiento"]`
    - `corporativo`: igual que admin pero `"Vista general"` en lugar de `"Inicio"` y sin `"Usuarios y sucursales"`.
  - Líneas 81–82 (`Proyectos y admin.`) → `grupo("admin","Aperturas")` = `["/aperturas"]`, `grupo("admin","Usuarios y sucursales")` = `["/administracion/usuarios"]`, `grupo("corporativo","Usuarios y sucursales")` = `undefined`.
  - Líneas 92, 96: `"Sucursal"` → `"Operación diaria"` (mismas listas).
  - Línea 100: `grupo("admin","Operación diaria")` = `["/arqueo","/turnos","/movimientos","/caja-chica","/cierre","/checklists"]` y `grupo("admin","Inicio")` = `["/","/corporativo"]`.
  - Línea 101: `grupo("corporativo","Operación diaria")` = misma lista que admin; `grupo("corporativo","Vista general")` = `["/corporativo","/"]`.
  - Líneas 150–153: `"/cierre"` → `"Operación diaria"`; admin `"/"` → `"Inicio"`; corporativo `"/"` → `"Vista general"`; corporativo `"/corporativo"` → `"Vista general"`.
  - Líneas 175–177: `grupo("admin","P&L")` = `["/finanzas","/finanzas/flujo","/finanzas/mermas","/finanzas/parametros"]`, `grupo("admin","Banca")` = `["/banca"]`, `grupo("admin","Nómina")` = `["/finanzas/nomina","/finanzas/personal","/finanzas/retenciones"]`, corporativo igual que admin en las tres, `grupo("gerente","P&L")` = `undefined`.

- [ ] **Step 3: Correr y ver que falla**

Run: `node --experimental-strip-types --test lib/roles.test.ts lib/catalogos.test.ts`
Expected: FAIL (no existen `areaActiva`/`SECCIONES`; títulos viejos).

- [ ] **Step 4: Implementar en `lib/roles.ts`.** Reemplazar las líneas 70–164 por:

```ts
import type { NombreIcono } from "../components/Icono";

export type Seccion = "General" | "Operación" | "Finanzas" | "Proyectos" | "Marca" | "Inteligencia";
export const SECCIONES: readonly Seccion[] = ["General", "Operación", "Finanzas", "Proyectos", "Marca", "Inteligencia"];
/** Área del menú: un ícono en el menú lateral y sus páginas como pestañas arriba de la página. */
export type GrupoMenu = { titulo: string; icono: NombreIcono; seccion: Seccion; enlaces: Enlace[] };
export type Menu = { inicio: Enlace; grupos: GrupoMenu[] };

/** Un área solo existe si el puesto ve al menos una de sus páginas. */
const area = (titulo: string, icono: NombreIcono, seccion: Seccion, enlaces: Enlace[]): GrupoMenu[] =>
  enlaces.length ? [{ titulo, icono, seccion, enlaces }] : [];

/** Menú lateral por áreas, en el orden de SECCIONES. Cada puesto ve solo lo suyo (mismas reglas de siempre). */
export function menuLateral(rol: Rol): Menu {
  const correos = area("Correos", "bandeja", "Marca", puedeVerCorreos(rol)
    ? [{ href: "/correos", texto: "Campañas" }, ...(puedeEditarCorreos(rol) ? [{ href: "/correos/contactos", texto: "Contactos" }] : [])] : []);
  // Marketing solo usa Correos.
  if (esMarketing(rol)) return { inicio: { href: "/correos", texto: "Campañas" }, grupos: correos };
  const corporativo = esCorporativo(rol);
  const inicio: Enlace = corporativo ? { href: "/corporativo", texto: "Vista general" } : { href: "/", texto: "Inicio" };
  const compras = puedeVerCompras(rol), finanzas = puedeVerFinanzas(rol);
  const grupos: GrupoMenu[] = [
    // Corporativo entra por la vista general; el inicio de la sucursal que está viendo va como segunda pestaña.
    ...area(corporativo ? "Vista general" : "Inicio", "casa", "General", [
      inicio,
      ...(corporativo ? [{ href: "/", texto: "Inicio de sucursal" }] : []),
      ...(puedeCambiarSucursal(rol) ? [{ href: "/corporativo", texto: "Vista general" }] : []),
    ]),
    // Todos reciben tareas; operación solo ve las suyas, sin tablero.
    ...area("Tareas", "ok", "General", [{ href: "/tareas", texto: "Mis tareas" }, ...(rol !== "operacion" ? [{ href: "/tareas/tablero", texto: "Tablero" }] : [])]),
    ...area("Ventas", "grafica", "General", puedeVerVentas(rol) ? [
      { href: "/ventas", texto: "Tablero" },
      { href: "/ventas/rappi", texto: "Rappi" },
      { href: "/ventas/conciliacion", texto: "Conciliación" },
      ...(puedeImportarVentas(rol) ? [{ href: "/ventas/importar", texto: "Importar" }] : []),
      ...(puedeImportarVentas(rol) ? [{ href: "/ventas/dodois", texto: "Dodo IS" }] : []),
      ...(["admin", "corporativo"].includes(rol) ? [{ href: "/ventas/costos", texto: "Costeo" }] : []),
    ] : []),
    ...area("Operación diaria", "tienda", "Operación", [
      ENLACE_ARQUEO,
      ...(puedeVerTurnos(rol) ? [{ href: "/turnos", texto: "Turnos" }] : []),
      ...ENLACES_SUCURSAL,
      // El admin ve las dos recepciones en una sola entrada (Compras), con pestañas En tienda / De compras.
      ...(puedeRecibirCompras(rol) && !compras ? [{ href: "/recepciones", texto: "Recepciones" }] : []),
    ]),
    ...area("Efectivo", "billete", "Operación", puedeVerEfectivo(rol) || rol === "gerente"
      ? [{ href: "/recolecciones", texto: "Recolecciones" }, ...(puedeVerEfectivo(rol) ? [{ href: "/efectivo", texto: "Salidas a corporativo" }] : [])] : []),
    ...area("Compras", "carrito", "Operación", compras ? [
      { href: "/compras", texto: "Proveedores" },
      { href: "/compras/articulos", texto: "Artículos" },
      { href: "/compras/documentos", texto: "Compras y facturas", aliases: ["/compras/ordenes", "/compras/facturas"] },
      { href: "/compras/recepciones", texto: "Recepciones", ...(puedeRecibirCompras(rol) ? { aliases: ["/recepciones"] } : {}) },
      { href: "/compras/pagos", texto: "Pagos" },
      { href: "/compras/pagos/reservas", texto: "Reservas de bóveda" },
      ...(puedeEditarCompras(rol) ? [{ href: "/compras/cargar", texto: "Cargar Excel" }] : []),
    ] : []),
    ...area("Inventario", "lista", "Operación", compras ? [{ href: "/inventario", texto: "Insumos Dodo IS" }, { href: "/inventario/uniformes", texto: "Uniformes" }] : []),
    ...area("P&L", "documento", "Finanzas", finanzas ? [
      { href: "/finanzas", texto: "P&L" },
      { href: "/finanzas/flujo", texto: "Flujo de efectivo" },
      { href: "/finanzas/mermas", texto: "Mermas Dodo IS" },
      { href: "/finanzas/parametros", texto: "Parámetros y metas" },
    ] : []),
    ...area("Banca", "banco", "Finanzas", finanzas ? [{ href: "/banca", texto: "Banca" }] : []),
    ...area("Nómina", "cartera", "Finanzas", finanzas ? [
      { href: "/finanzas/nomina", texto: "Nómina" },
      { href: "/finanzas/personal", texto: "Personal" },
      { href: "/finanzas/retenciones", texto: "Retenciones" },
    ] : []),
    ...area("Catálogos", "libro", "Finanzas", compras ? [
      { href: "/catalogos", texto: "Todos los catálogos" },
      { href: "/finanzas/catalogo", texto: "Cuentas contables" },
      { href: "/finanzas/asignacion", texto: "Asignación de cuentas" },
      { href: "/compras/razones-sociales", texto: "Razones sociales" },
    ] : []),
    ...area("Aperturas", "ubicacion", "Proyectos", compras ? [{ href: "/aperturas", texto: "Aperturas" }] : []),
    ...area("Activos", "maletin", "Proyectos", compras ? [{ href: "/activos", texto: "Activos" }] : []),
    ...area("Cumplimiento", "calendario", "Proyectos", compras ? [{ href: "/cumplimiento", texto: "Calendario de cumplimiento" }] : []),
    ...area("Usuarios y sucursales", "nombre", "Proyectos", rol === "admin" ? [{ href: "/administracion/usuarios", texto: "Usuarios y sucursales" }] : []),
    ...correos,
    ...area("Conocimiento", "brillo", "Inteligencia", [{ href: "/conocimiento", texto: "Manuales y Q&A" }, ...(puedeVerVentas(rol) ? [{ href: "/asistente", texto: "Asistente IA" }] : [])]),
  ];
  return { inicio, grupos };
}
```

Y reemplazar `grupoAbierto` (líneas 179–183) por:

```ts
/** Área de la página actual (la de su pestaña más específica); undefined si la página no está en el menú. */
export function areaActiva(menu: Menu, ruta: string): GrupoMenu | undefined {
  const actual = enlaceActivo(ruta, menu.grupos.flatMap((g) => g.enlaces));
  return menu.grupos.find((g) => g.enlaces.some((e) => e.href === actual));
}
/** Título del área de la página actual (compatibilidad con buscador y pruebas). */
export const grupoAbierto = (menu: Menu, ruta: string) => areaActiva(menu, ruta)?.titulo;
```

- [ ] **Step 5: Correr y ver que pasa**

Run: `node --experimental-strip-types --test lib/roles.test.ts lib/catalogos.test.ts lib/migas.test.ts`
Expected: PASS. Si `lib/migas.test.ts` espera títulos de grupo viejos en las migas, actualizar esos textos con el mapeo de arriba (mismas rutas).

- [ ] **Step 6:** `npm run typecheck` → Expected: errores solo en `components/MenuLateral.tsx` si usa `ICONO_GRUPO`/`<details>` con tipos viejos; si no hay errores, mejor. (Se arregla en la Tarea 2.)

- [ ] **Step 7: Commit**

```bash
git add lib/roles.ts lib/roles.test.ts lib/catalogos.test.ts lib/migas.test.ts
git commit -m "feat(menu): áreas con ícono y sección, mismas páginas por puesto"
```

---

### Task 2: Menú lateral por secciones y pestañas del área

**Files:**
- Create: `components/PestanasArea.tsx`
- Modify: `components/MenuLateral.tsx`
- Modify: `components/Marco.tsx` (agregar `<PestanasArea menu={menu} />` después de `<MigasDePan menu={menu} />`)
- Modify: `app/marca.css` (sección nueva «Menú por áreas y pestañas», antes de «Celular»)

**Interfaces:**
- Consumes: `SECCIONES`, `areaActiva`, `enlaceActivo`, `GrupoMenu`, `Menu` (Tarea 1).
- Produces: clases `.lateral-seccion`, `.lateral-seccion-titulo`, `.lateral-area`, `.pestanas-area`.

- [ ] **Step 1: Prueba de guardia del marcado.** Crear `tests/menuAreas.test.mjs`:

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');

test('el menú lateral pinta secciones y áreas, sin grupos plegables', () => {
  const m = leer('components/MenuLateral.tsx');
  assert.match(m, /SECCIONES\.map/);
  assert.match(m, /areaActiva\(/);
  assert.doesNotMatch(m, /<details|ICONO_GRUPO|grupoAbierto/);
});
test('el marco pone las pestañas del área debajo de las migas', () => {
  assert.match(leer('components/Marco.tsx'), /<MigasDePan menu=\{menu\} \/>\s*<PestanasArea menu=\{menu\} \/>/);
  const p = leer('components/PestanasArea.tsx');
  assert.match(p, /enlaces\.length < 2/);
  assert.match(p, /aria-current/);
});
test('marca.css trae los estilos del menú por áreas', () => {
  const css = leer('app/marca.css');
  for (const c of ['.lateral-seccion-titulo', '.lateral-area', '.pestanas-area']) assert.ok(css.includes(c), c);
});
```

Agregar `tests/menuAreas.test.mjs` al final del script `test` de `package.json`.

- [ ] **Step 2:** `node --test tests/menuAreas.test.mjs` → Expected: FAIL (no existe `PestanasArea.tsx`).

- [ ] **Step 3: `components/PestanasArea.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { areaActiva, enlaceActivo, type Menu } from "@/lib/roles";

/** Pestañas del área actual (las páginas que antes eran enlaces del menú). Con una sola página no se pinta nada. */
export function PestanasArea({ menu }: { menu: Menu }) {
  const ruta = usePathname();
  const area = areaActiva(menu, ruta);
  if (!area || area.enlaces.length < 2) return null;
  const actual = enlaceActivo(ruta, area.enlaces);
  return (
    <nav className="pestanas-area" aria-label={`Secciones de ${area.titulo}`}>
      {area.enlaces.map((e) => (
        <Link key={e.href} href={e.href} aria-current={e.href === actual ? "page" : undefined}>
          {e.texto}
          {e.contador && <span className="contador-menu" data-urgente={e.contador.urgente || undefined}>{e.contador.n}</span>}
        </Link>
      ))}
    </nav>
  );
}
```

- [ ] **Step 4: `components/MenuLateral.tsx`**
  - Import: `import { areaActiva, enlaceActivo, SECCIONES, type Enlace, type Menu } from "@/lib/roles";` (quitar `enlacesDelMenu`, `grupoAbierto`).
  - Borrar `ICONO_GRUPO`, el estado `abiertos`, `alternar`, `marcar`, `actual` y el `setAbiertos` del efecto (el efecto queda `useEffect(() => { setCajon(false); }, [ruta]);`).
  - Comentario del componente: «Menú lateral por áreas, agrupadas en secciones…».
  - Reemplazar el contenido de `<nav className="lateral-nav">` por:

```tsx
          {SECCIONES.map((s) => {
            const areas = menu.grupos.filter((g) => g.seccion === s);
            if (!areas.length) return null;
            return (
              <div key={s} className="lateral-seccion">
                <p className="lateral-seccion-titulo">{s}</p>
                <ul>
                  {areas.map((a) => {
                    const pendientes = a.enlaces.reduce((n, e) => n + (e.contador?.n ?? 0), 0);
                    const urgente = a.enlaces.some((e) => e.contador?.urgente);
                    return (
                      <li key={a.titulo}>
                        <Link className="lateral-enlace lateral-area" href={a.enlaces[0].href} aria-current={a.titulo === areaActual ? "page" : undefined}>
                          <Icono nombre={a.icono} tamano={18} /><span>{a.titulo}</span>
                          {pendientes > 0 && <span className="contador-menu" data-urgente={urgente || undefined}><span aria-hidden="true">{pendientes}</span><span className="solo-lector">{etiquetaContador({ n: pendientes, urgente })}</span></span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
```

  con `const areaActual = areaActiva(menu, ruta)?.titulo;` arriba.

- [ ] **Step 5: `components/Marco.tsx`:** `<main className="pagina"><MigasDePan menu={menu} /><PestanasArea menu={menu} />{children}</main>` y su `import { PestanasArea } from "@/components/PestanasArea";`.

- [ ] **Step 6: CSS en `app/marca.css`** (antes de `/* ─── Celular ─── */`):

```css
/* ─── Menú por áreas: secciones con título pequeño y áreas con ícono; pestañas del área arriba de la página ─── */
.lateral-seccion { padding: 10px 8px 2px; }
.lateral-seccion ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.lateral-seccion-titulo { margin: 4px 8px 6px; font-size: var(--t-xs); font-weight: 600; color: var(--oscuro-texto-2); }
.lateral-area { display: flex; align-items: center; gap: 10px; border-radius: var(--r-sm); }
.lateral-area[aria-current="page"] { background: var(--oscuro-activo); color: var(--blanco); font-weight: 700; box-shadow: inset 3px 0 0 var(--accion); }
.lateral-area .contador-menu { margin-left: auto; }
.pestanas-area { display: flex; gap: 4px; margin: 0 0 16px; padding: 4px; width: fit-content; max-width: 100%; overflow-x: auto;
  background: var(--superficie); border: 1px solid var(--linea); border-radius: var(--r-full); scrollbar-width: none; }
.pestanas-area a { flex: none; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: var(--r-full);
  color: var(--tinta-2); font-weight: 600; font-size: var(--t-sm); white-space: nowrap; }
.pestanas-area a:hover { background: var(--accion-tinte); color: var(--tinta); }
.pestanas-area a[aria-current="page"] { background: var(--accion); color: var(--accion-texto); }
```

Y en `@media print { … }` agregar `.pestanas-area { display: none; }`.

- [ ] **Step 7:** `node --test tests/menuAreas.test.mjs` → PASS; `npm run typecheck` → PASS; `npm test` → PASS.

- [ ] **Step 8: Commit**

```bash
git add components/PestanasArea.tsx components/MenuLateral.tsx components/Marco.tsx app/marca.css tests/menuAreas.test.mjs package.json
git commit -m "feat(menu): menú lateral por secciones y pestañas del área"
```

---

### Task 3: Orígenes de pedidos e historial (funciones puras)

**Files:**
- Modify: `lib/ventas/inicio.ts`
- Modify: `lib/ventas/inicio.test.ts`

**Interfaces:**
- Consumes: `TipoDesglose`, `separarDesglose` (`lib/ventas/calculos.ts`), `ventasMensuales` (`lib/ventas/graficasReporte.ts`).
- Produces:
  - `export type Origen = { clave: "mostrador" | "app" | "sitio" | "centro_llamadas" | "agregador" | "rappi"; etiqueta: string; pedidos: number; porcentaje: number }`
  - `export function origenesPedidos(desglose: readonly { tipo: TipoDesglose; pedidos: number; total: number }[], pedidosPos: number, pedidosRappi: number): Origen[]`
  - `export type PuntoHistorial = { clave: string; rotulo: string; total: number; parcial: boolean }`
  - `export function historialVentas(venta: Record<string, number>, hasta: string, modo: "semanal" | "mensual" | "anual"): PuntoHistorial[]`

**Regla de Rappi (decisión):** el total y los pedidos del sistema ya suman POS (Dodo IS) y Rappi (n8n) como canales separados (`combinarDiasRappi`), así que en orígenes Rappi es su propio origen («Rappi») y «Agregadores» es solo el agregador que reporta Dodo IS. Así la dona suma lo mismo que los KPIs. En el PR se anota cuántos pedidos de agregador trae Dodo IS en un mes real para que Sebastián confirme que no son Rappi.

- [ ] **Step 1: Pruebas** en `lib/ventas/inicio.test.ts`:

```ts
import { historialVentas, origenesPedidos } from "./inicio.ts";

test("orígenes: mostrador es el resto de POS, Rappi aparte y los % suman 100", () => {
  const o = origenesPedidos([
    { tipo: "app", pedidos: 10, total: 1000 }, { tipo: "agregador", pedidos: 20, total: 2000 },
    { tipo: "entrega", pedidos: 25, total: 2500 }, // servicio: no cuenta como origen
  ], 100, 50);
  assert.deepEqual(o.map((x) => [x.clave, x.pedidos]), [["mostrador", 70], ["app", 10], ["sitio", 0], ["centro_llamadas", 0], ["agregador", 20], ["rappi", 50]]);
  assert.equal(Math.round(o.reduce((s, x) => s + x.porcentaje, 0) * 1000) / 1000, 1);
});
test("orígenes: sin POS pero con Rappi no hay negativos ni división entre cero", () => {
  const o = origenesPedidos([{ tipo: "app", pedidos: 3, total: 1 }], 0, 8);
  assert.equal(o.find((x) => x.clave === "mostrador")?.pedidos, 0);
  assert.equal(o.find((x) => x.clave === "rappi")?.porcentaje, 8 / 11);
  assert.deepEqual(origenesPedidos([], 0, 0).map((x) => x.porcentaje), [0, 0, 0, 0, 0, 0]);
});
test("historial mensual: últimos 12 meses con datos, mes actual parcial, sin ceros inventados", () => {
  const venta = { "2025-10-31": 5, "2025-11-02": 100, "2026-03-01": 50, "2026-03-02": 25, "2026-11-08": 10 };
  const h = historialVentas(venta, "2026-11-09", "mensual");
  assert.deepEqual(h.map((p) => [p.clave, p.total, p.parcial]), [["2026-03", 75, false], ["2026-11", 10, true]]);
});
test("historial semanal y anual", () => {
  const venta = { "2026-11-02": 10, "2026-11-08": 5, "2026-11-09": 7, "2024-05-01": 3 };
  assert.deepEqual(historialVentas(venta, "2026-11-09", "semanal").map((p) => [p.clave, p.total, p.parcial]), [["2026-11-02", 15, false], ["2026-11-09", 7, true]]);
  assert.deepEqual(historialVentas(venta, "2026-11-09", "anual").map((p) => [p.clave, p.total, p.parcial]), [["2024", 3, false], ["2026", 22, true]]);
});
```

(El primer historial: el 2025-10-31 queda fuera de los 12 meses que terminan en noviembre 2026 —diciembre 2025 a noviembre 2026— y noviembre 2025 también; solo quedan marzo y noviembre 2026.)

- [ ] **Step 2:** `node --experimental-strip-types --test lib/ventas/inicio.test.ts` → Expected: FAIL (funciones no existen).

- [ ] **Step 3: Implementar** al final de `lib/ventas/inicio.ts`:

```ts
import { separarDesglose, type TipoDesglose } from "./calculos.ts";
import { ventasMensuales } from "./graficasReporte.ts";

export type Origen = { clave: "mostrador" | "app" | "sitio" | "centro_llamadas" | "agregador" | "rappi"; etiqueta: string; pedidos: number; porcentaje: number };
const ORIGENES: readonly [Origen["clave"], string][] = [
  ["mostrador", "Mostrador"], ["app", "App"], ["sitio", "Sitio"], ["centro_llamadas", "Centro de llamadas"], ["agregador", "Agregadores"], ["rappi", "Rappi"],
];

/** Pedidos por origen. Mostrador = pedidos POS que Dodo IS no marca con otro origen; Rappi (n8n) va aparte. */
export function origenesPedidos(desglose: readonly { tipo: TipoDesglose; pedidos: number; total: number }[], pedidosPos: number, pedidosRappi: number): Origen[] {
  const porTipo = new Map(separarDesglose(desglose).origen.map((t) => [t.tipo as string, t.pedidos]));
  const conOrigen = [...porTipo.values()].reduce((s, n) => s + n, 0);
  const pedidos: Record<Origen["clave"], number> = {
    mostrador: Math.max(0, pedidosPos - conOrigen), app: porTipo.get("app") ?? 0, sitio: porTipo.get("sitio") ?? 0,
    centro_llamadas: porTipo.get("centro_llamadas") ?? 0, agregador: porTipo.get("agregador") ?? 0, rappi: pedidosRappi,
  };
  const total = Object.values(pedidos).reduce((s, n) => s + n, 0);
  return ORIGENES.map(([clave, etiqueta]) => ({ clave, etiqueta, pedidos: pedidos[clave], porcentaje: total ? pedidos[clave] / total : 0 }));
}

export type PuntoHistorial = { clave: string; rotulo: string; total: number; parcial: boolean };
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const lunesDe = (fecha: string) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };
const sumarDias = (fecha: string, dias: number) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + dias); return d.toISOString().slice(0, 10); };

/** Venta por semana (12), mes (12) o año (todos), hasta `hasta`. Solo periodos con datos; el último en curso va como parcial. */
export function historialVentas(venta: Record<string, number>, hasta: string, modo: "semanal" | "mensual" | "anual"): PuntoHistorial[] {
  if (modo === "mensual") {
    const [a, m] = hasta.split("-").map(Number);
    const desdeMes = new Date(Date.UTC(a, m - 12, 1)).toISOString().slice(0, 10);
    return ventasMensuales(venta, desdeMes, hasta).map((x) => ({
      clave: x.mes, rotulo: `${MESES[Number(x.mes.slice(5)) - 1]} ${x.mes.slice(2, 4)}`, total: x.total, parcial: x.mes === hasta.slice(0, 7),
    }));
  }
  const clave = modo === "semanal" ? lunesDe : (f: string) => f.slice(0, 4);
  const desde = modo === "semanal" ? sumarDias(lunesDe(hasta), -77) : "0000-01-01";
  const actual = clave(hasta);
  const mapa = new Map<string, number>();
  for (const [fecha, total] of Object.entries(venta)) {
    if (fecha < desde || fecha > hasta) continue;
    mapa.set(clave(fecha), Math.round(((mapa.get(clave(fecha)) ?? 0) + total) * 100) / 100);
  }
  return [...mapa].sort(([x], [y]) => x.localeCompare(y)).map(([k, total]) => ({
    clave: k, rotulo: modo === "semanal" ? `${Number(k.slice(8))} ${MESES[Number(k.slice(5, 7)) - 1]}` : k, total, parcial: k === actual,
  }));
}
```

Si `lib/ventas/inicio.ts` ya importa algo de esos módulos, unir los imports. Si `ventasMensuales` no considera parcial (no lo hace), el cálculo de `parcial` arriba lo cubre.

- [ ] **Step 4:** `node --experimental-strip-types --test lib/ventas/inicio.test.ts` → Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ventas/inicio.ts lib/ventas/inicio.test.ts
git commit -m "feat(inicio): orígenes de pedidos e historial de ventas"
```

---

### Task 4: Dashboard de inicio rediseñado

**Files:**
- Create: `components/LineaHistorial.tsx`
- Modify: `components/DashboardVentasInicio.tsx`
- Modify: `app/(app)/page.tsx` y `app/corporativo/page.tsx` (solo pasar los nuevos parámetros `hist` y `alcance`)
- Modify: `app/marca.css` (sección «Dashboard de inicio»)
- Test: `tests/dashboardInicio.test.mjs` (guardia del marcado)

**Interfaces:**
- Consumes: `origenesPedidos`, `historialVentas`, `PuntoHistorial` (Tarea 3); `ventaDiariaDesde(supabase, sucursal | null, desde)` (`app/ventas/datos.ts:48`); `Dona` (`components/Dona.tsx`), `BarrasVerticales`.
- Produces: `DashboardVentasInicio` acepta además `hist?: string; alcance?: string`.

- [ ] **Step 1: Guardia** `tests/dashboardInicio.test.mjs` (y agregarlo al script `test`):

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');

test('el dashboard trae orígenes, venta diaria e historial y ya no la tabla por canal', () => {
  const d = leer('components/DashboardVentasInicio.tsx');
  assert.match(d, /origenesPedidos\(/);
  assert.match(d, /historialVentas\(/);
  assert.match(d, /<LineaHistorial /);
  assert.match(d, /<BarrasVerticales /);
  assert.doesNotMatch(d, /Última fecha con datos/);
});
test('los dos inicios pasan hist y alcance', () => {
  for (const r of ['app/(app)/page.tsx', 'app/corporativo/page.tsx']) assert.match(leer(r), /hist=\{[^}]+\}[^>]*alcance=\{/, r);
});
```

- [ ] **Step 2:** `node --test tests/dashboardInicio.test.mjs` → FAIL.

- [ ] **Step 3: `components/LineaHistorial.tsx`** (server component, SVG propio):

```tsx
import type { PuntoHistorial } from "@/lib/ventas/inicio";
import { pesos } from "@/lib/formato";

const abreviar = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;

/** Línea de venta con puntos; eje de montos abreviado. El último punto, si está en curso, va hueco. */
export function LineaHistorial({ titulo, puntos }: { titulo: string; puntos: readonly PuntoHistorial[] }) {
  if (!puntos.length) return <p className="vacio">Sin ventas importadas en este rango.</p>;
  const W = 800, H = 280, izq = 56, der = 16, arr = 12, abj = 28;
  const max = Math.max(...puntos.map((p) => p.total), 1);
  const tope = Math.ceil(max / 10 ** Math.floor(Math.log10(max))) * 10 ** Math.floor(Math.log10(max));
  const x = (i: number) => izq + (puntos.length === 1 ? (W - izq - der) / 2 : (i * (W - izq - der)) / (puntos.length - 1));
  const y = (v: number) => arr + (1 - v / tope) * (H - arr - abj);
  const lineas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * tope);
  const d = puntos.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.total).toFixed(1)}`).join(" ");
  return (
    <figure className="linea-historial">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${titulo}: ${puntos.map((p) => `${p.rotulo} ${pesos(p.total)}${p.parcial ? " (en curso)" : ""}`).join(", ")}`}>
        {lineas.map((v) => <g key={v}><line className="linea-historial-guia" x1={izq} x2={W - der} y1={y(v)} y2={y(v)} /><text className="linea-historial-eje" x={izq - 8} y={y(v) + 4} textAnchor="end">{abreviar(v)}</text></g>)}
        <path className="linea-historial-trazo" d={d} />
        {puntos.map((p, i) => <g key={p.clave}>
          <circle className="linea-historial-punto" data-parcial={p.parcial || undefined} cx={x(i)} cy={y(p.total)} r={5}><title>{`${p.rotulo}: ${pesos(p.total)}${p.parcial ? " (en curso)" : ""}`}</title></circle>
          <text className="linea-historial-eje" x={x(i)} y={H - 8} textAnchor="middle">{p.rotulo}</text>
        </g>)}
      </svg>
    </figure>
  );
}
```

- [ ] **Step 4: `components/DashboardVentasInicio.tsx`** — conservar firma, carga de sucursales, `periodoInicioVentas`, `datosVentas`, KPIs, filtros y `try/catch`; cambios:
  - Firma: agregar `hist?: string; alcance?: string`.
  - Después de `const d = await datosVentas(...)`:

```ts
 const modo = hist === "semanal" || hist === "anual" ? hist : "mensual";
 const red = !seleccion || alcance === "red";
 const desdeHist = modo === "anual" ? "2000-01-01" : modo === "semanal" ? sumarDiasISO(p.hasta, -84) : `${Number(p.hasta.slice(0, 4)) - 1}${p.hasta.slice(4, 7)}-01`;
 const ventaHist = await ventaDiariaDesde(supabase, red ? null : seleccion, desdeHist);
 const puntos = historialVentas(ventaHist, p.hasta, modo);
 const origenes = origenesPedidos(d.dias.flatMap((x) => x.ventas_dia_desglose ?? []), resumenVentas(d.canales.pos.dias).pedidos ?? 0, resumenVentas(d.canales.rappi.dias).pedidos ?? 0);
 const liga = (cambios: Record<string, string>) => `${ruta}?${new URLSearchParams({ ...(fecha ? { fecha } : {}), ventas_mes: p.desde.slice(0, 7), ventas_sucursal: seleccion ?? "todas", hist: modo, alcance: red ? "red" : "sucursal", ...cambios })}#inicio-historial`;
```

  con `const sumarDiasISO = (f: string, n: number) => { const x = new Date(`${f}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };` arriba del componente e imports de `ventaDiariaDesde` (`@/app/ventas/datos`), `historialVentas`, `origenesPedidos` (`@/lib/ventas/inicio`), `LineaHistorial`.
  - Si `d.dias` no trae `ventas_dia_desglose` en su tipo, usar `(x as { ventas_dia_desglose?: FilaDesglose[] }).ventas_dia_desglose ?? []` importando el tipo de `@/app/ventas/datos`.
  - Reemplazar la `tablero-fila` y la tabla por canal por:

```tsx
 <div className="inicio-fila">
   <section className="inicio-tarjeta" aria-labelledby="inicio-origenes"><h3 id="inicio-origenes">Orígenes de pedidos</h3>
     <div className="inicio-origenes">
       <ul className="inicio-origenes-lista">{origenes.map((o) => <li key={o.clave} data-origen={o.clave}><span className="inicio-origen-nombre"><span className="dona-punto" aria-hidden="true" />{o.etiqueta}</span><strong>{o.pedidos.toLocaleString("es-MX")}</strong><small>{porcentaje(o.porcentaje)}</small></li>)}</ul>
       <Dona titulo="Pedidos por origen" partes={origenes.filter((o) => o.pedidos > 0).map((o) => ({ clave: o.clave, etiqueta: o.etiqueta, valor: o.pedidos, detalle: `${o.pedidos} pedidos` }))} />
     </div>
   </section>
   <section className="inicio-tarjeta" aria-labelledby="inicio-venta-diaria"><h3 id="inicio-venta-diaria">Venta diaria con IVA</h3>
     {/* BarrasVerticales exactamente como hoy */}
   </section>
 </div>
 <section className="inicio-historial" id="inicio-historial" aria-labelledby="inicio-historial-titulo">
   <div className="inicio-historial-cabecera">
     <h2 id="inicio-historial-titulo">Historial de ventas</h2>
     {seleccion && <nav className="segmentos" aria-label="Alcance">{(["sucursal", "red"] as const).map((a) => <a key={a} href={liga({ alcance: a })} aria-current={(a === "red") === red ? "page" : undefined}>{a === "red" ? "Toda la red" : "Esta sucursal"}</a>)}</nav>}
   </div>
   <LineaHistorial titulo="Venta con IVA" puntos={puntos} />
   <nav className="segmentos inicio-historial-modo" aria-label="Periodo del historial">{(["semanal", "mensual", "anual"] as const).map((m) => <a key={m} href={liga({ hist: m })} aria-current={m === modo ? "page" : undefined}>{m === "semanal" ? "Semanal" : m === "mensual" ? "Mensual" : "Anual"}</a>)}</nav>
 </section>
```

  - Nota al pie: agregar «Mostrador se calcula como los pedidos de Dodo IS sin otro origen; Rappi viene de su portal.»
  - Verificar con `grep -n "segmentos" app/globals.css` que la clase existe para enlaces con `aria-current`; si solo cubre botones, agregar en el CSS de este paso `.segmentos a[aria-current="page"]` con el mismo estilo del botón activo.

- [ ] **Step 5: Inicios.** En `app/(app)/page.tsx` agregar `hist?: string; alcance?: string` al tipo de `searchParams`, leerlos y pasarlos: `<DashboardVentasInicio … hist={hist} alcance={alcance} />`. Igual en `app/corporativo/page.tsx`.

- [ ] **Step 6: CSS en `app/marca.css`** (sección «Dashboard de inicio», junto a «Inicio de ventas»):

```css
/* ─── Dashboard de inicio: orígenes y venta diaria lado a lado; historial con título grande ─── */
.inicio-fila { display: grid; gap: 16px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 1100px) { .inicio-fila { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
.inicio-tarjeta { background: var(--superficie); border: 1px solid var(--linea); border-radius: var(--r-lg); padding: 20px 22px; }
.inicio-origenes { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 16px; align-items: center; }
@media (max-width: 640px) { .inicio-origenes { grid-template-columns: minmax(0, 1fr); } }
.inicio-origenes-lista { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 18px; }
.inicio-origenes-lista li { display: grid; gap: 2px; }
.inicio-origen-nombre { display: flex; align-items: center; gap: 6px; font-size: var(--t-sm); color: var(--tinta-2); }
.inicio-origenes-lista strong { font-family: var(--display); font-size: 1.6rem; font-weight: 700; line-height: 1; }
.inicio-origenes-lista small { color: var(--tinta-3); }
.inicio-historial { display: grid; gap: 12px; }
.inicio-historial-cabecera { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; }
.inicio-historial h2 { font-family: var(--display); font-weight: 800; font-size: clamp(1.8rem, 3.4vw, 2.6rem); line-height: 1.05; }
.inicio-historial-modo { justify-self: center; }
.linea-historial { margin: 0; }
.linea-historial svg { width: 100%; height: auto; display: block; }
.linea-historial-guia { stroke: var(--linea); stroke-width: 1; }
.linea-historial-eje { fill: var(--tinta-3); font-size: 12px; font-family: var(--fuente); }
.linea-historial-trazo { fill: none; stroke: var(--accion); stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.linea-historial-punto { fill: var(--accion); stroke: var(--superficie); stroke-width: 2; }
.linea-historial-punto[data-parcial] { fill: var(--superficie); stroke: var(--accion); }
```

  Los colores de la dona por origen usan la serie validada: `.cat-mostrador` `--dato-1`, `.cat-app` `--dato-2`, `.cat-sitio` `--dato-3`, `.cat-centro_llamadas` `--dato-4`, `.cat-agregador` `--dato-otro`, `.cat-rappi` `--dato-sin`… **verificar** cómo `Dona` asigna clases (`grep -n "cat-" components/Dona.tsx`) y seguir ese patrón (como `.inicio-dona-canales .cat-pos` en `marca.css`), aplicando el mismo color al `.dona-punto` de la lista con `[data-origen="…"] .dona-punto`.

- [ ] **Step 7:** `node --test tests/dashboardInicio.test.mjs` → PASS; `npm run typecheck` → PASS; `npm test` → PASS.

- [ ] **Step 8: Commit**

```bash
git add components/LineaHistorial.tsx components/DashboardVentasInicio.tsx "app/(app)/page.tsx" app/corporativo/page.tsx app/marca.css tests/dashboardInicio.test.mjs package.json
git commit -m "feat(inicio): dashboard con orígenes, venta diaria e historial"
```

---

### Task 5: Fondo beige, verificación y PR

**Files:**
- Modify: `app/marca.css`
- Modify: `tests/marcaPlana.test.mjs` (aserción del fondo)

- [ ] **Step 1: Prueba:** en `tests/marcaPlana.test.mjs`, prueba «el brandbook manda en los tokens», agregar:

```js
  assert.match(css, /--fondo-pagina:\s*var\(--papel-2\)/);
  assert.match(css, /\.marco-contenido \{[^}]*background: var\(--fondo-pagina\)/);
```

  → `node --test tests/marcaPlana.test.mjs` FAIL.

- [ ] **Step 2: CSS:** en `:root` de `marca.css` agregar `--fondo-pagina: var(--papel-2);`; en el bloque de noche `--fondo-pagina: #121212;`; en «Marco» cambiar `.marco-contenido { … background: var(--papel); … }` por `background: var(--fondo-pagina)`. En «Superficies planas» cambiar el radio de `:is(.seccion, .tarjeta, .ap-panel, .zona-plegable, .error-pagina)` a `var(--r-lg)`. → PASS.

- [ ] **Step 3:** `npm run typecheck`, `npm test`, y `next build` con variables de Supabase de mentira → todo PASS.

- [ ] **Step 4: Revisión visual local:** `next start` y revisar `/login` (fuera del marco, no debe cambiar). Arnés estático del rebranding (scratchpad) con el marcado nuevo del menú por áreas y pestañas, a 1280 y 375 px, día y noche.

- [ ] **Step 5:** Push de la rama y PR a `main` con: tabla de áreas, capturas, nota de Rappi/agregador (pedir a Sebastián que confirme en un mes real), y lista de pantallas a revisar en el preview de Vercel (inicio admin y corporativo, Compras con pestañas, gerente en `/recepciones`, 375 px y noche).
