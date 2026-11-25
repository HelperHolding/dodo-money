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
test('con el menú plegado, Ctrl K abre un buscador visible y el foco no se pierde', () => {
  const css = leer('app/marca.css');
  assert.match(css, /\.lateral \.buscador \{ visibility: visible; \}/);
  const menu = leer('components/MenuLateral.tsx');
  assert.match(menu, /plegarRef/);
  assert.match(menu, /mostrarRef/);
  assert.match(menu, /requestAnimationFrame\(\(\) => \(nuevo \? mostrarRef : plegarRef\)\.current\?\.focus\(\)\)/);
});
test('el interruptor se distingue de día y la impresión no deja franja en blanco', () => {
  const css = leer('app/marca.css');
  assert.match(css, /\.interruptor-luz-riel \{ background: var\(--tinta-3\); \}/);
  assert.match(css, /@media print \{ \.marco-mostrar-menu, \.lateral-plegar \{[^}]*\} html\[data-menu="plegado"\] \.marco-contenido \{ padding-top: 0; \} \}/);
});
