import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia de la portada de Aperturas: tarjetas que son el enlace, con días para abrir y avance contra lo esperado (estilo Akton).
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');

test('la portada muestra una tarjeta enlace por sucursal, sin el botón repetido', () => {
  const p = leer('app/aperturas/page.tsx');
  assert.match(p, /className="ap-portada"/);
  assert.match(p, /<Link key=\{p\.id\} href=\{`\/aperturas\/\$\{p\.id\}`\} className="ap-tarjeta ap-tarjeta-akton"/);
  assert.doesNotMatch(p, /Abrir proyecto/);
  assert.match(p, /resumenPortada\(/);
  assert.match(p, /textoDiasApertura\(/);
  assert.match(p, /ordenarProyectos\(/);
});
test('los estilos de la portada usan tokens y resaltan solo el borde', () => {
  const css = leer('app/marca.css');
  assert.match(css, /\.ap-tarjeta \{[^}]*border: 1px solid var\(--linea\)/);
  assert.match(css, /\.ap-tarjeta:hover[^{]*\{ border-color: var\(--accion\); \}/);
});

test('cada tarjeta muestra el avance contra lo esperado, con estilo Akton', () => {
  const p = leer('app/aperturas/page.tsx');
  assert.match(p, /<div className="akton">/);
  assert.match(p, /esperado \{a\.esperado===null/);
  assert.match(p, /className="akton-var" data-favorable=/);
  assert.match(leer('app/globals.css'), /\.ap-tarjeta\.ap-tarjeta-akton \{/);
});
