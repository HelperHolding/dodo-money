import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const page=load('app/(app)/cierre/page.tsx');
const acciones=load('app/(app)/cierre/actions.ts');

test('la página del cierre consulta ventas_para_cierre y pinta VentasCierre',()=>{
  assert.match(page,/ventas_para_cierre/);
  assert.match(page,/<VentasCierre/);
});
test('el cierre ya no captura el IVA',()=>{
  assert.doesNotMatch(page,/campo\("iva"/);
  assert.doesNotMatch(page,/name="iva"/);
  assert.doesNotMatch(load('app/(app)/cierre/VentasCierre.tsx'),/name="iva"/);
});
test('cerrarDia calcula el IVA',()=>{
  assert.match(acciones,/ivaDeVenta\(/);
  assert.doesNotMatch(acciones,/formData\.get\("iva"\)/);
});
test('VentasCierre compara y calcula el IVA al teclear',()=>{
  const v=load('app/(app)/cierre/VentasCierre.tsx');
  assert.match(v,/compararVentas\(/);
  assert.match(v,/tarjetaComoEfectivo/);
  assert.match(v,/ivaDeVenta\(/);
});
