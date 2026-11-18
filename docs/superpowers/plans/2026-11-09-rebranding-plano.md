# Rebranding plano Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quitar el tema «Sucursal» (muro, LED, letras de canal 3D, cristal, encendido) y dejar la app plana según el brandbook de Dodo, sin cambiar acomodo ni funcionalidad.

**Architecture:** `app/globals.css` ya es un tema plano blanco/naranja/negro; `app/sucursal.css` se carga después y lo sobreescribe con la sucursal. Se renombra `sucursal.css` → `marca.css` (git mv, para conservar historial y las reglas de acomodo de los tableros) y se recorta sección por sección: lo decorativo se borra y globals vuelve a mandar; los tokens de noche pasan a superficies sólidas. Una prueba de node fija que no regresen los efectos.

**Tech Stack:** Next.js 15 (app router), CSS plano, `next/font/google`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-09-rebranding-plano-design.md`

## Global Constraints

- Naranja de marca `#FF4E00` (`--accion`), solo en rellenos y líneas; como texto `--accion-oscuro` (`#b83800` de día, `#ff9a5c` de noche).
- Beige del brandbook `#F9F1E6` en `--papel-2` (bandas, encabezados de tabla, rellenos secundarios).
- Texto en Manrope (`--fuente`); títulos y cifras en `--display` = Archivo 700/800. Cambiar a Rooftop después = solo `--display` y `app/layout.tsx`.
- Títulos de página: negros (`--tinta`), `text-transform: uppercase`, peso 800, `line-height: .95`, sin `text-shadow`, sin `-webkit-text-stroke`.
- Logo «D» oficial sin modificar: `public/marca/dodo-d-naranja.svg` y `public/marca/dodo-d-blanca.svg` (copias exactas de Drive).
- `/logo-dodo.png` (avatar redondo) se queda en login, cuenta, menú, 404, invitación, orden de compra y reporte.
- Modo noche se conserva (`html[data-luz="noche"]`, `localStorage["luz"]`), plano y sólido.
- Contraste: texto ≥ 4.5:1, bordes de control ≥ 3:1.
- Sin animación de encendido; nada de `backdrop-filter`.
- Impresión sin cambio visible.
- Flujo: rama `feat/rebranding-plano` → PR a `main`; pasan `Historial válido` y `Pruebas y tipos`.

## Review Focus

- **Modo noche en pantallas con estados** (chips de segmento, `.paso`, `.compra-etapas`, totales de P&L): texto legible sobre fondo sólido; se conservan los overrides de noche que ya existen.
- **Tableros de Ventas y Rappi a 375 px**: mismas rejillas y orden que antes; ninguna tarjeta se encima ni desborda.
- **Páginas con `h1` propio** (sin `EncabezadoPagina`): quedan negras y planas, no blancas sobre blanco (la regla `main.pagina h1` pintaba `#fffdf8`).
- **Login y 404**: fuera del marco; fondo liso y tarjeta blanca, logo visible.
- **Impresión de P&L y orden de compra**: igual que hoy.

Cada línea queda cubierta por la prueba de `tests/marcaPlana.test.mjs` (lo estático) y por la revisión visual de la Tarea 5 (lo que solo se ve en el navegador).

---

### Task 1: Prueba de guardia del estilo plano

**Files:**
- Create: `tests/marcaPlana.test.mjs`
- Modify: `package.json` (script `test`: agregar `tests/marcaPlana.test.mjs` al final de la lista)

**Interfaces:**
- Produces: prueba que lee `app/layout.tsx`, `app/marca.css`, `app/globals.css`, `components/EncabezadoPagina.tsx`, `components/InterruptorLuz.tsx` y falla si regresa algún efecto.

- [ ] **Step 1: Escribir la prueba**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');

test('el tema de sucursal ya no existe y layout carga marca.css', () => {
  assert.equal(existsSync(new URL('../app/sucursal.css', import.meta.url)), false);
  const layout = leer('app/layout.tsx');
  assert.match(layout, /import "\.\/marca\.css";/);
  assert.doesNotMatch(layout, /sucursal\.css|Rubik|encender/);
  assert.match(layout, /Archivo\(/);
});

test('marca.css no trae luces, cristal ni letras 3D', () => {
  const css = leer('app/marca.css');
  for (const prohibido of ['@property --enc', '@property --led', 'data-encender', 'backdrop-filter', '--sala', '--cristal',
    '-webkit-text-stroke', 'figura-dodo', 'letrero', 'feTurbulence', 'repeating-linear-gradient', '--fuente-rubik']) {
    assert.equal(css.includes(prohibido), false, `marca.css aún contiene ${prohibido}`);
  }
  // text-shadow de varias capas = relieve
  assert.doesNotMatch(css, /text-shadow:[^;]*,/);
});

test('el brandbook manda en los tokens', () => {
  const css = leer('app/marca.css');
  assert.match(css, /--papel-2:\s*#f9f1e6/i);
  assert.match(css, /--display:\s*var\(--fuente-archivo/);
});

test('el encabezado usa la D oficial plana y el interruptor no enciende nada', () => {
  const enc = leer('components/EncabezadoPagina.tsx');
  assert.match(enc, /\/marca\/dodo-d-naranja\.svg/);
  assert.doesNotMatch(enc, /figura|letrero|data-texto|dodo-figura/);
  const interruptor = leer('components/InterruptorLuz.tsx');
  assert.doesNotMatch(interruptor, /encender/);
  assert.equal(existsSync(new URL('../public/marca/dodo-d-naranja.svg', import.meta.url)), true);
  assert.equal(existsSync(new URL('../public/marca/dodo-d-blanca.svg', import.meta.url)), true);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `node --test tests/marcaPlana.test.mjs`
Expected: FAIL (existe `app/sucursal.css`, no existe `app/marca.css`).

- [ ] **Step 3: Agregarla al script `test` de `package.json`** (al final de la lista, después de `tests/promocionesVista.cjs`).

- [ ] **Step 4: Commit**

```bash
git add tests/marcaPlana.test.mjs package.json
git commit -m "test: guardia del estilo plano del brandbook"
```

---

### Task 2: Fuente, logos, script de luz e interruptor

**Files:**
- Create: `public/marca/dodo-d-naranja.svg` (Drive id `1hBvuo83qKMqMS0jDFvTzUKifx0r0N4_K`, sin modificar)
- Create: `public/marca/dodo-d-blanca.svg` (Drive: *Logos → English Sign → RGB → Monochrome White*, el `.svg`, sin modificar)
- Modify: `app/layout.tsx`
- Modify: `components/InterruptorLuz.tsx`
- Delete: `public/dodo-figura.png` (solo lo usa `EncabezadoPagina`, que cambia en la Tarea 4)

**Interfaces:**
- Produces: variable CSS `--fuente-archivo` en `<html>`; `<html data-luz="noche">` sigue igual; ya no existe `data-encender`.

- [ ] **Step 1: Descargar los dos SVG con el conector de Drive** y guardarlos tal cual (decodificar base64, sin reformatear).

- [ ] **Step 2: `app/layout.tsx`** — reemplazar importaciones, fuentes y script:

```tsx
import type { Metadata, Viewport } from "next";
import { Archivo, Manrope } from "next/font/google";
import "./globals.css";
import "./marca.css";

// Manrope servida desde el propio sitio: sin parpadeo de fuente ni petición a Google en cada visita.
const manrope = Manrope({ subsets: ["latin"], display: "swap", variable: "--fuente-manrope" });
// Archivo para títulos y cifras: sustituto libre de Rooftop (la licencia de Rooftop es de escritorio; ver app/marca.css).
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--fuente-archivo" });

/** Antes de pintar: modo noche guardado en este navegador (sin parpadeo de tema). */
const LUZ = `try{if(localStorage.getItem("luz")==="noche")document.documentElement.dataset.luz="noche"}catch(e){}`;
```

y en el `<html>`: `className={`${manrope.variable} ${archivo.variable}`}`.

- [ ] **Step 3: `components/InterruptorLuz.tsx`** — `alternar` queda:

```tsx
  const alternar = () => {
    const html = document.documentElement;
    const nueva = !noche;
    html.dataset.luz = nueva ? "noche" : "dia";
    try { localStorage.setItem("luz", html.dataset.luz); } catch { /* sin almacenamiento: solo esta visita */ }
    setNoche(nueva);
  };
```

y el comentario del componente: `Interruptor sol / luna del modo noche. El modo vive en <html data-luz> y en localStorage (solo este navegador); app/layout.tsx lo aplica antes de pintar para que no parpadee.`

- [ ] **Step 4: `git rm public/dodo-figura.png`** y `npm run typecheck` → Expected: PASS (todavía falla la guardia; se completa en Tareas 3–4).

- [ ] **Step 5: Commit**

```bash
git add public/marca app/layout.tsx components/InterruptorLuz.tsx
git commit -m "feat(marca): Archivo en títulos, D oficial y modo noche sin encendido"
```

---

### Task 3: `app/marca.css` — tokens, marco, superficies y piezas comunes

**Files:**
- Rename: `app/sucursal.css` → `app/marca.css` (`git mv`)
- Modify: `app/marca.css` líneas 1–482 (todo antes de «Tablero de Ventas») y 852–878 (celular, movimiento reducido, impresión)
- Modify: `app/globals.css:11` (comentario: «el tema de sucursal las vuelve cristal; ver app/sucursal.css» → «tokens de marca y modo noche: ver app/marca.css»)

**Interfaces:**
- Consumes: `--fuente-archivo` (Tarea 2).
- Produces: clases `.encabezado-marca` (img de la D) y `.encabezado-titulo` (fila D + h1 + ConInfo) que usa la Tarea 4; `.encabezado-vitrina` se conserva como nombre.

- [ ] **Step 1: `git mv app/sucursal.css app/marca.css`**

- [ ] **Step 2: Reemplazar el bloque de líneas 1–107 (cabecera, `@property`, keyframes, tokens de día y de noche, `html[data-encender]`) por:**

```css
/*
 * Marca Dodo plana (docs/superpowers/specs/2026-11-09-rebranding-plano-design.md), según el brandbook de Dodo Pizza:
 * naranja #FF4E00 para acciones y marca, beige #F9F1E6 de fondo secundario, negro para texto y navegación.
 * Sin relieve, sin luces, sin cristal. Se carga después de globals.css y solo ajusta tokens y detalles.
 * Títulos y cifras en Archivo (sustituto libre de Rooftop: su licencia es de escritorio y no permite servirla en la web).
 */

/* ─── Tokens de día ─── */
:root {
  --papel-2: #f9f1e6;
  --display: var(--fuente-archivo, "Archivo"), var(--fuente);
  --dodo-naranja: #ff4e00;
}

/* ─── Noche: fondos sólidos casi negros, texto beige, naranja en acciones. Solo con el marco o el acceso:
   las vistas de impresión siguen en blanco. ─── */
html[data-luz="noche"]:has(.marco, .login) {
  color-scheme: dark;
  --papel: #121212;   /* --blanco NO se toca: es el texto del menú negro y de los totales del P&L */
  --tinta: #f9f1e6; --tinta-2: #d4cdc6; --tinta-3: #b8b0a8;
  --linea: #2e2e2e; --linea-fuerte: #4a4a4a;
  --papel-2: #242424;
  --superficie: #1c1c1c;
  --superficie-solida: #1c1c1c;
  --campo: #242424;
  --accion-oscuro: #ff9a5c;
  --anillo: #ff9a5c;
  --accion-tinte: rgb(255 154 92 / .14);
  --accion-suave: rgb(255 120 40 / .22);
  --accion-suave-borde: rgb(255 140 70 / .4);
  /* (se conservan sin cambio todas las líneas de estados, datos y P&L que ya estaban: --cuadra-*, --alerta-*,
     --aviso-*, --info*, --violeta*, --turquesa*, --ambar, --neutro-*, --pl-*, --fondo-suave, --cuadra, --dato-pista) */
}
```

Al pegarlo, copiar textualmente de la versión anterior las líneas de estados/datos/P&L indicadas en el comentario (eran las líneas 70–80) y borrar el comentario entre paréntesis. Las líneas 95–105 (overrides de noche de `.segmentos`, `.cuadre-fijo`, `.pl-cuenta-padre`, `.indicador-cambio`, `.login-marca`, `.compra-etapas`, `.tabla-pl`) se quedan tal cual.

- [ ] **Step 3: Borrar la sección «La sala» completa** (regla `html { --luz-tira; --sala: … }`).

- [ ] **Step 4: Sección «Marco»** — queda solo:

```css
/* ─── Marco ─── */
/* El panel del menú se estira con la página (el menú en sí sigue fijo a la vista); filete naranja de marca */
@media (min-width: 901px) {
  .marco { background: linear-gradient(90deg, #000 0 260px, var(--accion) 260px 264px, transparent 264px); }
}
.lateral, .franja-movil { background: #000; }
.marco-contenido { min-height: 100vh; background: var(--papel); overflow-x: clip; }
```

Se borran `.pagina { padding-bottom: calc(var(--y-barra)…) }`, la regla `.franja-lectura { … backdrop-filter … }` y la de `::after/::before` con `--luz-tira`. Se conservan intactos «Interruptor sol / luna» (cambiar solo `box-shadow: 0 0 6px …` del `::after` del riel por nada: borrar esa declaración), «Detalles que nadie diseña» y «Vínculos».

- [ ] **Step 5: Sección «Cristal»** — se borra completa, incluida la «red de seguridad», los `h2/h3` sueltos con `text-shadow`, los bloques `@supports not (backdrop-filter…)` y `prefers-reduced-transparency`. Se reemplaza por:

```css
/* ─── Superficies planas: tarjeta blanca, línea fina, sin sombra ─── */
:is(.seccion, .tarjeta, .ap-panel, .zona-plegable, .error-pagina) { border-radius: var(--r-md); box-shadow: none; }
.compra-grupo, .compra-barra, :where(.pagina, .panel-admin) > .indicadores-marco:where(:has(> h2, > p)) {
  background: var(--superficie); border: 1px solid var(--linea); border-radius: var(--r-md); padding: 14px 16px;
}
.pestanas-nav { background: var(--superficie); border: 1px solid var(--linea); border-radius: var(--r-md); padding: 4px 8px; width: fit-content; max-width: 100%; }
.migas { width: fit-content; max-width: 100%; }
.migas:has(.migas-regresar) { width: auto; }
```

- [ ] **Step 6: Sección «Letrero»** — se borra completa (desde `.encabezado-pagina { --enc… }` hasta la regla `main.pagina :is(.encabezado, .compra-cabecera) p…`) y se reemplaza por:

```css
/* ─── Encabezado de página: la D oficial y el título en mayúsculas, plano ─── */
.encabezado-pagina { display: flex; flex-direction: column; align-items: stretch; gap: 16px; }
.encabezado-titulo { display: flex; align-items: center; gap: 16px; }
.encabezado-marca { flex: none; width: 48px; height: auto; }
.encabezado-titulo h1, main.pagina h1:not(.seccion h1, .tarjeta h1, .ap-panel h1, .zona-plegable h1, .error-pagina h1, .estado-vacio h1) {
  margin: 0; min-width: 0; overflow-wrap: anywhere; text-wrap: balance;
  font-family: var(--display); font-weight: 800; text-transform: uppercase; line-height: .95; letter-spacing: 0;
  color: var(--tinta);
}
.encabezado-titulo h1 { font-size: clamp(2rem, 3.6vw, 3rem); }
.encabezado-vitrina { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; }
.encabezado-vitrina > p { flex: 1 1 320px; color: var(--tinta-2); max-width: 75ch; }
```

- [ ] **Step 7: Sección «Botones»** — se borra completa (globals ya define `.boton` naranja liso con texto negro y `.boton-secundario` blanco). Se agrega solo el seleccionado:

```css
/* ─── Botones: los de globals (planos). Secundario elegido: tinte naranja con borde de marca ─── */
.boton-secundario:is([aria-pressed="true"], [aria-current="page"]), .costeo-rapidos button[aria-pressed="true"] {
  border-color: var(--accion); background: var(--accion-tinte);
}
```

- [ ] **Step 8: Sección «Tablas»** — el `th` queda:

```css
.tabla:not(.tabla-pl) th {
  background: var(--papel-2); color: var(--tinta);
  font-family: var(--display); font-weight: 600; font-size: .86rem;
  border-bottom: 1px solid var(--linea-fuerte);
}
```

El resto de la sección (radios de esquinas, hover, `td.monto`, P&L, celular) se queda.

- [ ] **Step 9: Sección «Dashboards»** — borrar la regla `:is(.indicador, .ap-indicador, .ficha-indicadores > div)::before { … }` y la de `.saldo { border-left-width… --cristal-borde }`; cambiar el título a `/* ─── Dashboards: cifras grandes en la fuente de títulos ─── */`. Lo demás se queda.

- [ ] **Step 10: Pop-up, Carga, Acceso**

- `.letrero .con-info` → `.encabezado-titulo .con-info`; borrar la regla `.letrero .con-info-boton { … }`.
- `.con-info-pop`: cambiar `box-shadow: 0 22px 50px -12px rgb(0 0 0 / .45), 0 0 0 1px rgb(0 0 0 / .05);` por `box-shadow: var(--sombra-1), 0 0 0 1px rgb(0 0 0 / .08);`.
- Regla `:is(.pagina, .panel-admin, .formulario-pagina) > .con-info { … }`: dejar solo `width: fit-content;`.
- `.seccion:has(.con-info-pop:popover-open)`: borrar `transform: translateY(-2px);`; borrar `.seccion { transition: transform … }`.
- Carga: borrar las tres reglas `.esqueleto*` (globals ya tiene esqueletos planos); dejar `html[data-luz="noche"]:has(.marco) .esqueleto { background-color: #242424; }`.
- Acceso: reemplazar por

```css
/* ─── Acceso: fondo beige liso y tarjeta blanca ─── */
.login { background: var(--papel-2); }
.login form, .login-tarjeta { background: var(--superficie); border: 1px solid var(--linea); border-radius: var(--r-md); padding: 24px; }
```

- [ ] **Step 11: Celular, movimiento reducido, impresión** (final del archivo) quedan:

```css
/* ─── Celular ─── */
@media (max-width: 900px) {
  .encabezado-titulo { gap: 12px; }
  .encabezado-titulo h1 { font-size: 1.9rem; }
  .encabezado-marca { width: 36px; }
  .barra-inferior { background: var(--superficie-solida); }
}

/* ─── Movimiento reducido ─── */
@media (prefers-reduced-motion: reduce) {
  .con-info-pop { animation: none; }
}

/* ─── Impresión: blanco y negro, sin filete ni fondos de marca ─── */
@media print {
  .marco { background: none; }
  .marco-contenido, .login { background: #fff; }
  .encabezado-marca { display: none; }
  :is(.seccion, .tarjeta, .indicador, .saldo) { box-shadow: none; background: #fff; }
}
```

- [ ] **Step 12: Correr** `node --test tests/marcaPlana.test.mjs` → Expected: falla solo en `EncabezadoPagina` (Tarea 4) y, si quedan, en efectos dentro de los tableros (Tarea 4b). `npm run typecheck` → PASS.

- [ ] **Step 13: Commit**

```bash
git add app/marca.css app/globals.css
git commit -m "feat(marca): tema plano del brandbook en lugar de la sucursal con luces"
```

---

### Task 4: Encabezado de página con la D oficial

**Files:**
- Modify: `components/EncabezadoPagina.tsx`

**Interfaces:**
- Consumes: `.encabezado-titulo`, `.encabezado-marca`, `.encabezado-vitrina` (Tarea 3); `/marca/dodo-d-naranja.svg` (Tarea 2).

- [ ] **Step 1: Reemplazar comentario y marcado:**

```tsx
import { ConInfo } from "@/components/ConInfo";

/**
 * Título de cada página: la «D» oficial de Dodo y el h1 en mayúsculas (app/marca.css). Debajo, la línea de
 * contexto (sucursal · periodo) y las acciones a la derecha (en celular, debajo y a todo lo ancho).
 * Las migas de pan ya las pone el Marco arriba.
 * `info` es la explicación de la pantalla: va en el (i) junto al título en lugar de un párrafo fijo.
 */
export function EncabezadoPagina({ titulo, descripcion, info, acciones }: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  info?: React.ReactNode;
  acciones?: React.ReactNode;
}) {
  return (
    <header className="encabezado-pagina">
      <div className="encabezado-titulo">
        <img className="encabezado-marca" src="/marca/dodo-d-naranja.svg" alt="" width={48} height={50} />
        <h1>{titulo}</h1>
        {info && <ConInfo titulo={typeof titulo === "string" ? titulo : "Esta pantalla"}>{info}</ConInfo>}
      </div>
      {(descripcion || acciones) && (
        <div className="encabezado-vitrina">
          {descripcion && <p>{descripcion}</p>}
          {acciones && <div className="encabezado-acciones">{acciones}</div>}
        </div>
      )}
    </header>
  );
}
```

(El SVG mide 81.82 × 85.04 → 48 × 50.)

- [ ] **Step 2:** `npm run typecheck` → PASS.

- [ ] **Step 3: Commit**

```bash
git add components/EncabezadoPagina.tsx
git commit -m "feat(marca): encabezado con la D oficial plana"
```

---

### Task 4b: Tableros de Ventas y Rappi en vivo sin pantalla oscura ni luz

**Files:**
- Modify: `app/marca.css` secciones «Pantalla de ventas» (`.seccion.inicio-ventas`, ~líneas 363–437 del archivo original), «Tablero de Ventas» (~483–700) y «Rappi en vivo» (~701–851)

**Interfaces:**
- Consumes: tokens de la Tarea 3.

- [ ] **Step 1: Capturas «antes»** (con `origin/main` en otro worktree o antes de esta tarea): Ventas y Rappi en vivo a 1280 px y 375 px, de día y de noche. Guardarlas en el scratchpad.

- [ ] **Step 2: «Pantalla de ventas»**: en `.seccion.inicio-ventas` borrar la redefinición de tokens oscuros (`--tinta` … `--alerta-fondo`), `background: radial…/repeating…/#141416`, `border: 1px solid #2e2e33`, `backdrop-filter` y `box-shadow` del bisel; conservar `--dato-pos: var(--dato-1); --dato-rappi: var(--dato-2);`, `gap`, `padding`, `border-radius: var(--r-md)`. En las reglas hijas reemplazar colores fijos de pantalla oscura por tokens: `#fff` → `var(--tinta)`, `#18181b` / `#1b1b1e` → `var(--superficie)`, `rgb(255 120 40 / .1)` → `var(--papel-2)`, `rgb(255 120 40 / .45)` → `var(--linea-fuerte)`; borrar `.seccion.inicio-ventas select option { color: #000; }` solo si ya no hace falta (de día sí hace falta en noche: conservar).

- [ ] **Step 3: «Tablero de Ventas» y «Rappi en vivo»**: recorrer regla por regla. **Se queda** toda declaración de acomodo: `display`, `grid-*`, `gap`, `container*`, `@container`, `flex*`, `order`, `width/height/min-*/max-*`, `padding`, `margin`, `position`, `inset`, `overflow`, `font-size`, `font-weight`, `line-height`, `clip-path` de solo-lectores. **Se va o se cambia**: `backdrop-filter` (borrar), `box-shadow` con resplandor o bisel (borrar), `text-shadow` (borrar), `repeating-linear-gradient` / `radial-gradient` decorativos (borrar), `border-color: var(--cristal-borde)` → `var(--linea)`, `background` semitransparente blanca (`rgb(255 255 255 / …)`) → `var(--superficie)`, `border-radius` 14–20 px → `var(--r-md)`. Los colores de datos validados (naranja, azul, verde agua, violeta) **se quedan**. Comentarios que hablen de «cristal», «muro», «pantalla montada» o «luz» se reescriben en plano.

- [ ] **Step 4:** `node --test tests/marcaPlana.test.mjs` → PASS. `npm run typecheck` → PASS.

- [ ] **Step 5: Capturas «después»** iguales al Step 1 y comparar: mismas rejillas, mismo orden, nada encimado.

- [ ] **Step 6: Commit**

```bash
git add app/marca.css
git commit -m "feat(marca): tableros de Ventas y Rappi planos, mismo acomodo"
```

---

### Task 5: Verificación completa y PR

**Files:** ninguno nuevo (correcciones que salgan van en el archivo que toque).

- [ ] **Step 1:** `npm run typecheck` y `npm test` → PASS completo.
- [ ] **Step 2:** Búsqueda final: `grep -rnE "data-encender|--enc\b|--led\b|backdrop-filter|fuente-rubik|figura-dodo|letrero" app components` → sin resultados.
- [ ] **Step 3:** Servidor de desarrollo (preview) y revisar de día y de noche a 1280 y 375 px: inicio admin, Ventas, Rappi en vivo, efectivo (formulario), P&L, compras/pagos, una página con `h1` propio, login, 404. Medir con `javascript_tool` el contraste de `--tinta-2`/`--tinta-3` sobre `--superficie` de noche (≥ 4.5:1).
- [ ] **Step 4:** Vista de impresión del P&L y de una orden de compra: sin cambios.
- [ ] **Step 5:** Push de la rama y PR a `main` con capturas antes/después y la nota de licencia de Rooftop; revisar el diff completo; esperar `Historial válido` y `Pruebas y tipos`.
