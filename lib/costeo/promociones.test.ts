import test from 'node:test';
import assert from 'node:assert/strict';
import {simularPromocion,type EscenarioPromo} from './promociones.ts';
const base:EscenarioPromo={costo:40,unidades:1,precio:116,descuento:0,iva:16,comision:0,baseComision:'sin-iva',extra:0,objetivo:50};
test('promoción: descuento y combo se aplican una vez; comisión cambia con su base',()=>{
 const neto=simularPromocion({...base,precio:232,descuento:50,unidades:2,comision:10,extra:5})!;
 assert.equal(neto.cobro,116);assert.ok(Math.abs(neto.neto-100)<1e-8);assert.equal(neto.costo,80);assert.ok(Math.abs(neto.contribucion-5)<1e-8);
 const bruto=simularPromocion({...base,comision:10,baseComision:'con-iva'})!;assert.equal(bruto.comision,11.6);assert.ok(Math.abs(bruto.contribucion-48.4)<1e-8);
});
test('precio objetivo redondea hacia arriba y cumple después del descuento',()=>{
 const e={...base,descuento:20,comision:15,baseComision:'con-iva' as const,extra:3};const r=simularPromocion(e)!;
 const objetivo=simularPromocion({...e,precio:r.precioObjetivo!})!;assert.ok(objetivo.margen>=50);assert.ok(simularPromocion({...e,precio:r.precioObjetivo!-.01})!.margen<50);
 assert.ok(Math.abs(simularPromocion({...e,precio:r.precioEquilibrio!})!.contribucion)<.01);
});
test('escenarios inválidos no dan cifras; objetivo imposible no da precio',()=>{
 for(const cambio of [{precio:0},{costo:-1},{descuento:100},{comision:100},{unidades:1.5},{extra:NaN},{objetivo:100}])assert.equal(simularPromocion({...base,...cambio}),null);
 assert.equal(simularPromocion({...base,comision:90,baseComision:'con-iva'})!.precioObjetivo,null);
 assert.ok(simularPromocion({...base,precio:20})!.contribucion<0);
});
