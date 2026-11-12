import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

// Guardia del rediseño de Correos: mismos componentes y tokens que el resto de la app (se ve bien de día y de noche).
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');
const PAGINAS = ['app/correos/page.tsx', 'app/correos/[id]/page.tsx', 'app/correos/contactos/page.tsx', 'app/correos/nueva/page.tsx', 'app/correos/[id]/editar/page.tsx'];

test('los estilos de Correos solo usan tokens: sin colores fijos ni la variable --borde que no existe', () => {
  const css = leer('app/correos/correos.module.css');
  assert.doesNotMatch(css, /--borde/);
  assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
});

test('cada pantalla de Correos usa el encabezado de la app', () => {
  for (const p of PAGINAS) {
    const s = leer(p);
    assert.match(s, /<EncabezadoPagina /, p);
    assert.doesNotMatch(s, /<h1>/, p);
  }
});

test('detalle de campaña: cifras en franjas, clics por enlace en tabla, actividad en barras y destinatarios en tabla', () => {
  const d = leer('app/correos/[id]/page.tsx');
  assert.match(d, /ficha-indicadores/);
  assert.match(d, /enlaceCorto\(/);
  assert.match(d, /<BarrasVerticales /);
  assert.match(d, /barrasPorHora\(/);
  assert.match(d, /tabla tabla-tarjetas/);
  assert.doesNotMatch(d, /<ul>/);
  assert.match(d, /className="estado" data-tono=\{TONO_ESTADO/);
});

test('contactos en tabla y altas en secciones plegables', () => {
  const c = leer('app/correos/contactos/page.tsx');
  assert.match(c, /tabla tabla-tarjetas/);
  assert.match(c, /<Plegable /);
});

test('el estado con tono existe en marca.css para día y noche', () => {
  const css = leer('app/marca.css');
  for (const t of ['ok', 'aviso', 'alerta', 'info', 'neutro']) assert.match(css, new RegExp(`\\.estado\\[data-tono="${t}"\\]`), t);
});
