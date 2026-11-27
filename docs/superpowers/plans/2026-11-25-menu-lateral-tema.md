# Menú lateral con tema y plegable · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el menú lateral de toda la app siga el tema de día y de noche como Google Calendar, y que se pueda plegar con ☰ en computadora, recordando la elección.

**Architecture:** Hoy el menú es negro por reglas repartidas en `app/globals.css` y `app/marca.css`. Se agregan tokens `--menu-*` (día en `:root` y noche en el bloque `html[data-luz="noche"]` de marca.css), más un bloque de CSS **al final de `app/marca.css`** (que se carga después) que pinta el menú con esos tokens. El plegado vive en `html[data-menu="plegado"]`: lo aplica antes de pintar un script en `app/layout.tsx`, como el modo noche, y lo cambian dos botones en `components/MenuLateral.tsx`.

**Tech Stack:** Next.js 15, React client component, CSS global, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-25-estilo-google-calendar-design.md` (PR 1).

## Global Constraints

- **Tokens** (día · noche):
  - `--menu-fondo`: `var(--papel-2)` · `#121212`
  - `--menu-texto`: `var(--tinta)` · `var(--tinta)`
  - `--menu-texto-2`: `var(--tinta-2)` · `var(--tinta-2)`
  - `--menu-linea`: `var(--linea)` · `var(--linea)`
  - `--menu-hover`: `rgb(0 0 0 / .05)` · `rgb(255 255 255 / .06)`
  - `--menu-activo-fondo`: `var(--accion-tinte)` · `var(--accion-tinte)`
  - `--menu-activo-texto`: `var(--accion-oscuro)` · `var(--accion-oscuro)`
- **Área activa:** píldora con el lado derecho redondo (`border-radius: 0 999px 999px 0`), fondo `--menu-activo-fondo`, texto `--menu-activo-texto` y peso 700. Sin borde naranja izquierdo.
- **Borde derecho del menú:** 1 px `--menu-linea`, no 4 px naranja.
- **Plegado:** `html[data-menu="plegado"]` + `localStorage('menu')`, solo en ≥ 901 px. En celular (≤ 900 px), el cajón y la barra inferior no cambian.
- El contador urgente sigue en rojo. El interruptor de luz, el buscador y el pie siguen funcionando igual.
- Sin migración. Rama `feat/menu-lateral-tema` en el worktree `wt-estilo-google`.

## Review Focus

1. **Recargar con el menú plegado** no debe mostrarlo un instante antes de plegarlo. El script va en `<head>`, como `LUZ` (Task 2).
2. **Menú plegado y ventana angosta (≤ 900 px):** el cajón de celular debe abrirse normal con ☰; `data-menu` no lo bloquea (Task 2).
3. **Impresión:** el menú no aparece (regla `@media print` existente), esté plegado o no (Task 2).
4. **Modo noche + plegado + botón flotante «Mostrar menú»:** el botón se ve y se lee en los dos temas (Task 2).
5. **Páginas sin marco** (login, impresión): los tokens nuevos no las afectan (Task 1).

---

### Task 1: Menú lateral con tema de día y de noche

**Files:**
- Modify: `app/marca.css` (tokens en `:root` y en el bloque de noche; bloque nuevo al final; quitar el fondo negro fijo)
- Create: `tests/menuLateralTema.test.mjs`
- Modify: `package.json` (script `test`: agregar `tests/menuLateralTema.test.mjs` al final)

- [ ] **Step 1: Failing test**

```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');

test('el menú lateral usa tokens que cambian con el tema', () => {
  const marca = leer('app/marca.css');
  for (const t of ['--menu-fondo', '--menu-texto', '--menu-texto-2', '--menu-linea', '--menu-hover', '--menu-activo-fondo', '--menu-activo-texto'])
    assert.ok((marca.match(new RegExp(`${t}:`, 'g')) ?? []).length >= 2, `${t} en día y en noche`);
  assert.doesNotMatch(marca, /\.lateral, \.franja-movil \{ background: #000; \}/);
  assert.match(marca, /\.lateral, \.franja-movil \{[^}]*background: var\(--menu-fondo\)/);
});
test('el área activa es una píldora tenue, sin borde naranja', () => {
  const marca = leer('app/marca.css');
  assert.match(marca, /\.lateral \.lateral-area\[aria-current="page"\] \{[^}]*background: var\(--menu-activo-fondo\)[^}]*box-shadow: none/);
});
```

- [ ] **Step 2:** Run `node --test tests/menuLateralTema.test.mjs`. Expected: FAIL (no existen los tokens).

- [ ] **Step 3: Implement.** En `app/marca.css`:

1. En el bloque `:root` de «Tokens de día», agrega:
   ```css
   --menu-fondo: var(--papel-2); --menu-texto: var(--tinta); --menu-texto-2: var(--tinta-2); --menu-linea: var(--linea);
   --menu-hover: rgb(0 0 0 / .05); --menu-activo-fondo: var(--accion-tinte); --menu-activo-texto: var(--accion-oscuro);
   ```
2. En el bloque `html[data-luz="noche"]:has(.marco, .login) { … }`, agrega:
   ```css
   --menu-fondo: #121212; --menu-texto: var(--tinta); --menu-texto-2: var(--tinta-2); --menu-linea: var(--linea);
   --menu-hover: rgb(255 255 255 / .06); --menu-activo-fondo: var(--accion-tinte); --menu-activo-texto: var(--accion-oscuro);
   ```
3. Cambia `.lateral, .franja-movil { background: #000; }` por:
   ```css
   .lateral, .franja-movil { background: var(--menu-fondo); color: var(--menu-texto); }
   ```
4. En `@media (min-width: 901px) { .marco { background: linear-gradient(...#000...) } }`, cambia el gradiente por:
   ```css
   .marco { background: linear-gradient(90deg, var(--menu-fondo) 0 263px, var(--menu-linea) 263px 264px, transparent 264px); }
   ```
5. Al final del archivo, agrega:
   ```css
   /* ─── Menú lateral con tema (estilo Google Calendar): claro de día, oscuro de noche; activo como píldora tenue ─── */
   .lateral { border-right: 1px solid var(--menu-linea); }
   .lateral-cabecera, .lateral-luz { border-color: var(--menu-linea); }
   .lateral-pie { border-top-color: var(--menu-linea); }
   .lateral-detalle, .lateral-usuario span { color: var(--menu-texto-2); opacity: 1; }
   .lateral .lateral-seccion-titulo { color: var(--menu-texto-2); }
   .lateral .lateral-enlace { color: var(--menu-texto); border-left: 0; }
   .lateral .lateral-enlace .icono { color: var(--menu-texto-2); }
   .lateral .lateral-enlace:hover { background: var(--menu-hover); color: var(--menu-texto); }
   .lateral .lateral-area[aria-current="page"] { background: var(--menu-activo-fondo); color: var(--menu-activo-texto); font-weight: 700; box-shadow: none; border-radius: 0 999px 999px 0; margin-left: -8px; padding-left: 20px; }
   .lateral .lateral-area[aria-current="page"] .icono { color: var(--menu-activo-texto); }
   .lateral-acciones a { color: var(--menu-texto); }
   .lateral-acciones button { color: var(--menu-texto); border-color: var(--menu-linea); }
   .lateral-acciones button:hover { background: var(--menu-hover); }
   .lateral .buscador-boton { background: var(--superficie); color: var(--menu-texto-2); border-color: var(--menu-linea); }
   .lateral .buscador-boton:hover { color: var(--menu-texto); border-color: var(--linea-fuerte); }
   .lateral .buscador-boton kbd { border-color: var(--menu-linea); color: var(--menu-texto-2); }
   .interruptor-luz { background: var(--superficie); border-color: var(--menu-linea); color: var(--menu-texto-2); }
   .interruptor-luz-riel { background: var(--linea-fuerte); }
   @media (max-width: 900px) {
     .franja-movil { color: var(--menu-texto); border-bottom: 1px solid var(--menu-linea); }
     .franja-movil-boton, .lateral-cerrar { color: var(--menu-texto); }
   }
   ```
   El selector `.lateral .lateral-…` gana a las reglas viejas de globals.css y marca.css, que siguen ahí pero quedan cubiertas. No las borres en este PR: otras pantallas usan `--oscuro-*`.

- [ ] **Step 4:** Run `node --test tests/menuLateralTema.test.mjs tests/marcaPlana.test.mjs tests/menuAreas.test.mjs`. Expected: PASS.
- [ ] **Step 5:** Agrega la prueba al script `test` de `package.json`. **Commit:** `feat(menu): menú lateral con tema de día y de noche`.

### Task 2: Menú plegable con ☰

**Files:**
- Modify: `app/layout.tsx`, `components/MenuLateral.tsx`, `app/marca.css`
- Modify: `tests/menuLateralTema.test.mjs`

**Interfaces:** `MenuLateral` conserva sus props. Internamente agrega `const [plegado,setPlegado]=useState(false)` y `alternarMenu()`.

- [ ] **Step 1: Failing test** (agregar a `tests/menuLateralTema.test.mjs`):

```js
test('el menú se pliega con ☰ y se recuerda sin parpadear', () => {
  const layout = leer('app/layout.tsx');
  assert.match(layout, /localStorage\.getItem\("menu"\)==="plegado"/);
  assert.match(layout, /dataset\.menu="plegado"/);
  const menu = leer('components/MenuLateral.tsx');
  assert.match(menu, /className="lateral-plegar"/);
  assert.match(menu, /className="marco-mostrar-menu"/);
  assert.match(menu, /aria-expanded=\{!plegado\}/);
  assert.match(menu, /localStorage\.setItem\("menu"/);
  const css = leer('app/marca.css');
  assert.match(css, /html\[data-menu="plegado"\] \.marco \{ grid-template-columns: 0 minmax\(0, 1fr\); background: none; \}/);
  // Solo en computadora: la regla vive dentro del bloque de ≥ 901 px, después de su apertura.
  const bloque = css.slice(css.lastIndexOf('@media (min-width: 901px) {'));
  assert.match(bloque, /html\[data-menu="plegado"\] \.marco \{/);
});
```

- [ ] **Step 2:** Run `node --test tests/menuLateralTema.test.mjs`. Expected: FAIL.
- [ ] **Step 3: Implement.**

`app/layout.tsx`: junto a `LUZ`, agrega `MENU` y ponlo en el mismo `<script>`:

```ts
const MENU = `try{if(localStorage.getItem("menu")==="plegado")document.documentElement.dataset.menu="plegado"}catch(e){}`;
// …
<head><script dangerouslySetInnerHTML={{ __html: LUZ + MENU }} /></head>
```

`components/MenuLateral.tsx`:

```tsx
const [plegado, setPlegado] = useState(false);
useEffect(() => { setPlegado(document.documentElement.dataset.menu === "plegado"); }, []);
// Computadora: ☰ pliega o muestra el menú (Google Calendar). Se recuerda en este navegador.
const alternarMenu = () => {
  const nuevo = !plegado;
  if (nuevo) document.documentElement.dataset.menu = "plegado"; else delete document.documentElement.dataset.menu;
  try { localStorage.setItem("menu", nuevo ? "plegado" : "abierto"); } catch { /* sin almacenamiento: solo esta visita */ }
  setPlegado(nuevo);
};
```

En `lateral-cabecera`, **antes** de `{cabecera}`:

```tsx
<button type="button" className="lateral-plegar" aria-expanded={!plegado} aria-controls="menu-lateral" aria-label="Plegar menú" onClick={alternarMenu}><Icono nombre="menu" tamano={22} /></button>
```

Fuera del `<aside>`, junto a `franja-movil`:

```tsx
<button type="button" className="marco-mostrar-menu" aria-expanded={!plegado} aria-controls="menu-lateral" aria-label="Mostrar menú" onClick={alternarMenu}><Icono nombre="menu" tamano={22} /></button>
```

Al final de `app/marca.css`:

```css
/* ─── Menú plegable (computadora): ☰ lo oculta y el contenido usa todo el ancho ─── */
.lateral-plegar, .marco-mostrar-menu {
  display: none; align-items: center; justify-content: center; width: 40px; height: 40px; flex: none;
  border: 0; border-radius: 50%; background: transparent; color: var(--menu-texto-2); cursor: pointer;
}
.lateral-plegar:hover, .marco-mostrar-menu:hover { background: var(--menu-hover); color: var(--menu-texto); }
@media (min-width: 901px) {
  .lateral-plegar { display: inline-flex; margin: -2px 0 0 -6px; }
  .marco { transition: grid-template-columns 200ms ease; }
  html[data-menu="plegado"] .marco { grid-template-columns: 0 minmax(0, 1fr); background: none; }
  html[data-menu="plegado"] .lateral { visibility: hidden; overflow: hidden; }
  html[data-menu="plegado"] .marco-mostrar-menu { display: inline-flex; position: fixed; top: 12px; left: 12px; z-index: 25; background: var(--superficie); box-shadow: 0 0 0 1px var(--menu-linea); }
  html[data-menu="plegado"] .marco-contenido { padding-top: 8px; }
}
@media print { .marco-mostrar-menu, .lateral-plegar { display: none !important; } }
```

- [ ] **Step 4:** Run `node --test tests/menuLateralTema.test.mjs && npx tsc --noEmit`. Expected: PASS y sin errores.
- [ ] **Step 5: Commit** `feat(menu): menú lateral plegable con ☰, recordado en el navegador`.

### Task 3: Revisión visual, revisión final y PR

- [ ] Página temporal `app/login/prueba-menu/page.tsx` (no se sube) que renderice `<Marco>`. Si `Marco` pide sesión y no se puede, renderiza `MenuLateral` con un `menu` de ejemplo (`menuLateral('admin')` de `lib/roles`) dentro de `<div className="marco">` y un `<div className="marco-contenido">` con texto. Revisa con `preview_start`, a 1300 px y 375 px, en día y en noche (cambia `data-luz` con el interruptor):
  - menú claro de día y oscuro de noche;
  - píldora activa;
  - contador urgente en rojo;
  - plegar y desplegar, y recargar plegado sin parpadeo;
  - cajón en celular.
- [ ] Borra lo temporal y `.next`. Corre `npx tsc --noEmit && npm test`.
- [ ] Revisión final con un revisor nuevo (modelo más capaz) y el Review Focus. Corrige lo Critical/Important con prueba en rojo y luego en verde.
- [ ] Integra `origin/main` si avanzó. Sube la rama y abre el PR (con la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Espera los checks. No integres sin el visto bueno de Sebastián.
