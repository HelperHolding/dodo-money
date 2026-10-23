import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGO_HELPER, cuentasHelper, MAPEO_HELPER, referenciaHelper } from './catalogoHelper.ts';

test('catálogo: fuente conserva códigos únicos, cuentas activas y aplicación por entidad',()=>{
  assert.equal(CATALOGO_HELPER.length,565);
  assert.equal(new Set(CATALOGO_HELPER.map(c=>c.codigo)).size,565);
  assert.equal(cuentasHelper('03').length,550);
  assert.equal(cuentasHelper('06').length,512);
  assert.ok(cuentasHelper('06').some(c=>c.codigo==='502-02-003'));
  assert.ok(!cuentasHelper('03').some(c=>c.codigo==='502-02-003'));
  assert.ok(CATALOGO_HELPER.every(c=>/^\d{3}-\d{2}-\d{3}$/.test(c.codigo)&&c.fila>=5));
});
test('búsqueda y correspondencias: no inventa cuentas ni asigna un auxiliar a categorías ambiguas',()=>{
  assert.ok(cuentasHelper('06','energia electrica').some(c=>c.codigo==='602-52-000'));
  assert.equal(cuentasHelper('06','cuenta inexistente').length,0);
  for(const m of Object.values(MAPEO_HELPER))for(const codigo of m.cuentas)assert.ok(CATALOGO_HELPER.some(c=>c.codigo===codigo),codigo);
  assert.match(referenciaHelper('servicios')!,/requiere desglose/);
  assert.match(referenciaHelper('otros')!,/R312 \/ R319/);
  assert.equal(referenciaHelper('ebitda'),null);
  assert.equal(referenciaHelper('rappi_ajustes'),null);
});
