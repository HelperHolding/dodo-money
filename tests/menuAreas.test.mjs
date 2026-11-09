import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia del menú por áreas (docs/superpowers/specs/2026-11-09-menu-areas-dashboard-design.md).
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
