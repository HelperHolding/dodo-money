import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia: el avance de Aperturas se lee de un vistazo (barra y % grandes) y su color dice si va en tiempo.
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');
const css = leer('app/globals.css');

test('cada tarjeta de la portada trae una barra de avance con el % grande y el estado', () => {
  const p = leer('app/aperturas/page.tsx');
  assert.match(p, /<div className="ap-avance" data-favorable=\{a\.favorable\?\?undefined\}>/);
  assert.match(p, /<b className="ap-avance-pct">\{a\.real===null\?'—':`\$\{a\.real\} %`\}<\/b>/);
  assert.match(p, /role="progressbar"[^>]*aria-valuenow=\{a\.real\?\?undefined\}/);
  assert.match(p, /<i style=\{\{width:`\$\{a\.real\?\?0\}%`\}\}\/>/);
  // El % ya no se repite en la línea chica de comparación.
  assert.doesNotMatch(p, />Avance \{a\.real/);
});

test('la barra de la portada es gruesa, el % grande y los colores salen de tokens pastel', () => {
  assert.match(css, /\.ap-avance-pista \{[^}]*height:12px/);
  assert.match(css, /\.ap-avance-pct \{[^}]*font-size:1\.75rem[^}]*font-weight:800/);
  assert.match(css, /\.ap-avance\[data-favorable="si"\] \{[^}]*--avance:var\(--cuadra-borde\)/);
  assert.match(css, /\.ap-avance\[data-favorable="no"\] \{[^}]*--avance:var\(--accion-suave-borde\)/);
  assert.match(css, /\.ap-avance-pista > i \{[^}]*background:var\(--avance\)/);
});

test('el Gantt pinta cada etapa por estado, con barra más alta y % más grande', () => {
  const g = leer('app/aperturas/Gantt.tsx');
  assert.match(g, /avanceComparado\(e\.tareas\.map\(t=>t\.item\),hoy\)\.favorable/);
  assert.match(g, /className="ap-gantt-barra" data-favorable=\{favorable\?\?undefined\}/);
  assert.match(css, /\.ap-gantt-etapa > summary \.ap-gantt-barra \{[^}]*height:26px/);
  assert.match(css, /\.ap-gantt-etapa > summary \.ap-gantt-barra > span \{[^}]*font-size:\.9rem[^}]*font-weight:800/);
  assert.match(css, /\.ap-gantt-barra\[data-favorable="si"\] > i \{ background:var\(--cuadra-borde\); \}/);
  assert.match(css, /\.ap-gantt-barra\[data-favorable="no"\] > i \{ background:var\(--accion-suave-borde\); \}/);
  assert.doesNotMatch(css, /\.ap-gantt-barra > i \{[^}]*background:var\(--tinta-2\)/);
});
