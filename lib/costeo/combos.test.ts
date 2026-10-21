import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Extensión explícita para las pruebas con Node strip-types.
import {resumirCombo} from './combos.ts';
// @ts-expect-error Extensión explícita para las pruebas con Node strip-types.
import {precioParaMargenConComision,margenConComision} from './margenes.ts';
// @ts-expect-error Extensión explícita para las pruebas con Node strip-types.
import {simularPromocion} from './promociones.ts';
test('combo: suma costo y precio por cantidad; un dato faltante no se vuelve cero',()=>{
 assert.deepEqual(resumirCombo([{costo:40,precio:116,cantidad:2},{costo:10.5,precio:35,cantidad:1}]),{costo:90.5,precio:267,piezas:3});
 assert.deepEqual(resumirCombo([{costo:40,precio:null,cantidad:1},{costo:10,precio:35,cantidad:1}]),{costo:50,precio:null,piezas:2});
 assert.equal(resumirCombo([{costo:null,precio:116,cantidad:1}]).costo,null);
 assert.equal(resumirCombo([{costo:40,precio:116,cantidad:0}]).costo,null);
 assert.equal(resumirCombo([{costo:40,precio:116,cantidad:1.5}]).costo,null);
 assert.equal(resumirCombo([]).costo,null);
 assert.equal(resumirCombo([{costo:NaN,precio:116,cantidad:1}]).costo,null);
 assert.equal(resumirCombo([{costo:-1,precio:116,cantidad:1}]).costo,null);
 assert.equal(resumirCombo([{costo:0,precio:116,cantidad:1}]).costo,0);
 assert.equal(resumirCombo([{costo:40,precio:0,cantidad:1}]).precio,null);
});
test('precio para margen con comisión: alcanza el objetivo y redondea hacia arriba',()=>{
 const p=precioParaMargenConComision(40,50,18)!;
 assert.ok(margenConComision(p,40,18)!.margenPct>=50);
 assert.ok(margenConComision(p-0.01,40,18)!.margenPct<50);
 assert.equal(precioParaMargenConComision(40,90,18),null);
 assert.equal(precioParaMargenConComision(null,50,18),null);
 assert.equal(precioParaMargenConComision(40,50,0),92.8);
});

test('calculadoras: tres productos reales coinciden con promoción y combo sin descuento',()=>{
 for(const [costo,precio] of [[39.84,165],[51.71,195],[47.04,199]])for(const comision of [0,18]){
  const esperado=(precio/1.16-costo-precio*comision/100)/(precio/1.16)*100;
  const margen=margenConComision(precio,costo,comision)!;
  const promo=simularPromocion({costo,precio,comision,unidades:1,descuento:0,iva:16,baseComision:'con-iva',extra:0,objetivo:60})!;
  const combo=resumirCombo([{costo,precio,cantidad:2}]);
  const combinado=simularPromocion({costo:combo.costo!,precio:combo.precio!,comision,unidades:1,descuento:0,iva:16,baseComision:'con-iva',extra:0,objetivo:60})!;
  assert.ok(Math.abs(margen.margenPct-esperado)<1e-9);
  assert.ok(Math.abs(promo.margen-esperado)<1e-9);
  assert.ok(Math.abs(combinado.margen-esperado)<1e-9);
  assert.ok(Math.abs(combinado.contribucion-2*margen.utilidad)<1e-9);
 }
});
