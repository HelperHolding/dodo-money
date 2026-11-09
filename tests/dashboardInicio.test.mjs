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

test('en celular las cifras de los KPIs caben (sin recortarse)', () => {
  assert.match(leer('app/marca.css'), /@media \(max-width: 640px\) \{ \.seccion\.inicio-ventas \{ padding: [^}]+\} \.seccion\.inicio-ventas \.inicio-ventas-kpis strong \{ font-size: 1\.2rem;/);
});

test('orígenes leen el desglose solo de POS: Rappi ya viene sumado como agregador en los días combinados', () => {
  const d = leer('components/DashboardVentasInicio.tsx');
  assert.match(d, /origenesPedidos\(desgloseDe\(d\.canales\.pos\.dias\)/);
  assert.doesNotMatch(d, /origenesPedidos\(d\.dias/);
});
test('el historial se consulta en paralelo con las ventas del periodo', () => {
  assert.match(leer('components/DashboardVentasInicio.tsx'), /Promise\.all\(\[datosVentas\(/);
});
test('la nota al pie dice que el historial incluye Rappi', () => {
  const d = leer('components/DashboardVentasInicio.tsx');
  assert.doesNotMatch(d, /El historial usa la venta diaria importada de Dodo IS\./);
  assert.match(d, /El historial suma Dodo IS y el subtotal de Rappi/);
});
test('el buscador de páginas no repite destinos (Inicio va arriba y dentro de su área)', () => {
  assert.match(leer('components/BuscadorPaginas.tsx'), /\.filter\(\(p, i, todas\) => todas\.findIndex\(\(x\) => x\.href === p\.href\) === i\)/);
});
