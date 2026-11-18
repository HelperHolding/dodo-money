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
