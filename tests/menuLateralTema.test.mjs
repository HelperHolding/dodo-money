import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia del menú lateral estilo Google Calendar: sigue el tema de día y de noche y se pliega con ☰.
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
