import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia del dashboard de inicio (docs/superpowers/specs/2026-11-09-menu-areas-dashboard-design.md §4).
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

test('cada origen tiene su color de la paleta validada', () => {
  const css = leer('app/marca.css');
  for (const c of ['mostrador', 'app', 'sitio', 'centro_llamadas', 'agregador', 'rappi']) assert.match(css, new RegExp(`\\.cat-${c} \\{ --cat: var\\(--dato-`), c);
});
