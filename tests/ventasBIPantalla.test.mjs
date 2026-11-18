import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const leer = (r) => readFileSync(new URL(`../${r}`, import.meta.url), 'utf8');

test('Parámetros tiene la meta de venta mensual por sucursal y solo admin la guarda', () => {
  const p = leer('app/finanzas/parametros/page.tsx');
  assert.match(p, /Meta de venta mensual/);
  assert.match(p, /guardarMetasVenta/);
  const a = leer('app/finanzas/parametros/acciones.ts');
  assert.match(a, /export async function guardarMetasVenta/);
  assert.match(a, /from\("ventas_metas"\)\.upsert/);
  const accion = a.slice(a.indexOf('export async function guardarMetasVenta'));
  assert.match(accion, /puedeEditarFinanzas\(perfil\.rol\)/);
  assert.match(accion, /actualizado_en/);
  assert.match(accion, /actualizado_por: perfil\.id/);
});

test('la página BI es solo de admin y corporativo y usa las funciones SQL', () => {
  const p = leer('app/ventas/bi/page.tsx');
  assert.match(p, /veVentasDeTodas\(perfil\.rol\)/);
  assert.match(p, /redirect\("\/ventas"\)/);
  const d = leer('app/ventas/bi/datos.ts');
  assert.match(d, /rpc\("ventas_bi"/); assert.match(d, /rpc\("ventas_bi_historico"/);
  assert.match(d, /from\("ventas_metas"\)/); assert.match(d, /puntoEquilibrio\(/);
});
test('la página BI trae todos los bloques del tablero', () => {
  const p = leer('app/ventas/bi/page.tsx');
  for (const b of ['Ventas netas', 'Ticket promedio', '# de tickets', 'Promedio UPT', 'Total de productos', 'Venta vs P.E.', 'Venta vs Meta',
    'Ventas por categoría', 'Ventas por canal', 'Ventas por origen', 'Ventas vs transacciones por semana', 'Método de pago', 'Método de pago por sucursal',
    'Venta por día de la semana', 'Venta por hora', 'Ranking de productos', 'Ventas por semana', 'Ventas por mes y año']) assert.ok(p.includes(b), b);
});
test('los filtros de BI navegan sin recargar', () => {
  const f = leer('components/FiltrosBI.tsx');
  assert.match(f, /^"use client";/); assert.match(f, /router\.push\([^)]*\{ scroll: false \}\)/); assert.match(f, /aria-busy/);
});
