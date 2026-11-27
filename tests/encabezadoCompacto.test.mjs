import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia del encabezado compacto: migas y pestañas en una fila; título, contexto y botones en otra; poco aire antes del contenido.
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');
const g = leer('app/globals.css'), m = leer('app/marca.css');

test('el Marco pone migas y pestañas juntas en una sola fila', () => {
  assert.match(leer('components/Marco.tsx'), /<div className="pagina-cabeza"><MigasDePan menu=\{menu\} \/><PestanasArea menu=\{menu\} \/><\/div>/);
  assert.match(m, /\.pagina-cabeza \{[^}]*display: flex[^}]*justify-content: space-between/);
  assert.match(m, /\.pagina-cabeza:empty \{ display: none; \}/);
  assert.match(m, /\.pagina-cabeza :is\(\.migas, \.pestanas-area\) \{ margin: 0; \}/);
  // Mientras carga un periodo, la fila de migas y pestañas no se atenúa.
  assert.match(g, /:not\(\.migas\):not\(\.pagina-cabeza\)/);
});

test('título, contexto y botones van en una sola fila, con la D y el título más chicos', () => {
  const e = leer('components/EncabezadoPagina.tsx');
  assert.match(e, /<p className="encabezado-contexto">\{descripcion\}<\/p>/);
  assert.doesNotMatch(e, /encabezado-vitrina/);
  assert.doesNotMatch(m, /encabezado-vitrina/);
  assert.match(m, /\.encabezado-pagina \{[^}]*flex-direction: row[^}]*flex-wrap: wrap[^}]*align-items: center/);
  assert.match(m, /\.encabezado-marca \{[^}]*width: 30px/);
  assert.match(m, /\.encabezado-titulo h1 \{ font-size: clamp\(1\.4rem, 2vw, 1\.75rem\); \}/);
  assert.match(m, /\.encabezado-acciones \{[^}]*margin-left: auto/);
});

test('menos aire arriba y entre el encabezado y el contenido', () => {
  assert.match(g, /\n\.pagina \{[^}]*padding: 18px clamp\(16px, 2vw, 28px\) 64px;/);
  assert.match(m, /\.pagina > \.pagina-cabeza \{ margin-bottom: -14px; \}/);
  assert.match(m, /\.pagina > \.encabezado-pagina \{ margin-bottom: -8px; \}/);
  assert.match(m, /\.pestanas-area a \{[^}]*padding: 6px 12px/);
});
