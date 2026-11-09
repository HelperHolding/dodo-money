import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

// Guardia del rebranding plano (docs/superpowers/specs/2026-11-09-rebranding-plano-design.md):
// que no regresen el muro, las luces, el cristal ni las letras 3D del tema de sucursal.
const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), 'utf8');
const existe = (ruta) => existsSync(new URL(`../${ruta}`, import.meta.url));

test('el tema de sucursal ya no existe y layout carga marca.css', () => {
  assert.equal(existe('app/sucursal.css'), false);
  const layout = leer('app/layout.tsx');
  assert.match(layout, /import "\.\/marca\.css";/);
  assert.doesNotMatch(layout, /sucursal\.css|Rubik|encender/);
  assert.match(layout, /Archivo\(/);
});

test('marca.css no trae luces, cristal ni letras 3D', () => {
  const css = leer('app/marca.css');
  for (const prohibido of ['@property --enc', '@property --led', 'data-encender', 'backdrop-filter', '--sala', '--cristal',
    '-webkit-text-stroke', 'figura-dodo', 'letrero', 'feTurbulence', '--fuente-rubik']) {
    assert.equal(css.includes(prohibido), false, `marca.css aún contiene ${prohibido}`);
  }
  // text-shadow de varias capas = relieve
  assert.doesNotMatch(css, /text-shadow:[^;]*,/);
});

test('el brandbook manda en los tokens', () => {
  const css = leer('app/marca.css');
  assert.match(css, /--papel-2:\s*#f9f1e6/i);
  assert.match(css, /--display:\s*var\(--fuente-archivo/);
  // En celular la primera columna fija (globals) no rompe el encabezado beige de la tabla
  assert.match(css, /thead th:first-child \{ background: var\(--papel-2\); \}/);
  // El acceso dividido sigue el papel del tema (blanco de día, casi negro de noche), no --blanco fijo
  assert.match(css, /\.login\.login-dividida \{ background: var\(--papel\); \}/);
});

test('el encabezado usa la D oficial plana y el interruptor no enciende nada', () => {
  const enc = leer('components/EncabezadoPagina.tsx');
  assert.match(enc, /\/marca\/dodo-d-naranja\.svg/);
  assert.doesNotMatch(enc, /figura|letrero|data-texto|dodo-figura/);
  assert.doesNotMatch(leer('components/InterruptorLuz.tsx'), /encender/);
  assert.equal(existe('public/marca/dodo-d-naranja.svg'), true);
  assert.equal(existe('public/marca/dodo-d-blanca.svg'), true);
});
