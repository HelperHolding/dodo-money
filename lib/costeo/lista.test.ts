import test from 'node:test';
import assert from 'node:assert/strict';
import {filtrarCosteo,agruparCosteo,margenFila,type FilaCosteo} from './lista.ts';
// @ts-expect-error Extensión explícita para las pruebas con Node strip-types.
import {margenConComision} from './margenes.ts';
const base:FilaCosteo={id:1,nombre:'Pizza Álamo',categoria:'Pizzas',tamano:'Grande',costo:40,desde:'2026-10-01',fuente:null,nota:null,pos:116,rappi:232,rappiFecha:'2026-10-08',rappiOficial:false,bom:true,costoBOM:40,insumos:['Queso mozzarella']};

test('costeo: aproximación en producto e insumo, códigos literales y orden por columna',()=>{
 const filas=[{...base,id:2,nombre:'Pizza Alano',costo:20},base];
 assert.equal(filtrarCosteo(filas,{q:'alamo'})[0].id,1);
 assert.equal(filtrarCosteo(filas,{q:'alamo',orden:'costo'})[0].id,2);
 assert.equal(filtrarCosteo([base],{q:'mozarela'}).length,1);
 assert.equal(filtrarCosteo([base],{q:'alammo',categoria:'Bebidas'}).length,0);
 assert.equal(filtrarCosteo([{...base,id:12345}],{q:'12346'}).length,0);
});
test('costeo lista: palabras, acentos, insumos y filtros combinados',()=>{
 assert.equal(filtrarCosteo([base],{q:'alamo queso',categoria:'Pizzas',tamano:'Grande',min:'40',max:'40',posMin:'116',posMax:'116'}).length,1);
 assert.equal(filtrarCosteo([base],{q:'alamo inexistente'}).length,0);
 assert.equal(filtrarCosteo([base],{max:'39'}).length,0);
});
test('costeo lista: margen por canal, rangos y umbral editable',()=>{
 assert.equal(margenFila(base,'pos'),60);assert.equal(margenFila(base,'rappi'),80);
 assert.equal(filtrarCosteo([base],{rapido:'margen-bajo',umbral:'70',canal:'pos'}).length,1);
 assert.equal(filtrarCosteo([base],{rapido:'margen-bajo',umbral:'70',canal:'rappi'}).length,0);
 assert.equal(filtrarCosteo([base],{margenMin:'60',margenMax:'60'}).length,1);
});
test('costeo lista: cero es costo válido; sin datos no equivale a cero',()=>{
 const filas=[base,{...base,id:2,costo:0},{...base,id:3,costo:null,pos:null,rappi:null}];
 assert.equal(filtrarCosteo(filas,{rapido:'sin-costo'})[0].id,3);
 assert.equal(filtrarCosteo(filas,{rapido:'sin-rappi'}).length,1);
 assert.deepEqual(filtrarCosteo([...filas,{...base,id:4,rappiOficial:true}],{rapido:'lista-rappi'}).map(p=>p.id),[4]);
 assert.equal(filtrarCosteo(filas,{min:'0'}).length,2);
 assert.equal(filtrarCosteo(filas,{orden:'costo',direccion:'desc'}).at(-1)?.id,3);
 assert.equal(filtrarCosteo(filas,{rapido:'diferencia'}).length,1);
 assert.equal(agruparCosteo(filas,'costo').length,2);
 assert.equal(agruparCosteo([base,{...base,id:2,bom:false}],'bom').length,2);
});
test('costeo lista: margen con comisión Rappi sobre el precio con IVA, filtro y orden',()=>{
 // Rappi 232 con IVA → venta 200; costo 40; comisión 18 % de 232 = 41.76 → 118.24 / 200 = 59.12 %
 const m=margenConComision(232,40,18)!;assert.ok(Math.abs(m.comision-41.76)<1e-9);assert.ok(Math.abs(m.margenPct-59.12)<1e-9);
 assert.equal(margenConComision(232,40,0)?.margenPct,80);assert.equal(margenConComision(null,40,18),null);assert.equal(margenConComision(232,null,18),null);assert.equal(margenConComision(232,40,100),null);
 assert.equal(margenFila(base,'rappi-comision',null),null);
 assert.ok(Math.abs(margenFila(base,'rappi-comision',18)!-59.12)<1e-9);
 assert.equal(filtrarCosteo([base],{rapido:'margen-bajo',umbral:'60',canal:'rappi-comision'},18).length,1);
 assert.equal(filtrarCosteo([base],{rapido:'margen-bajo',umbral:'60',canal:'rappi-comision'},0).length,0);
 const otro={...base,id:2,rappi:300};
 assert.equal(filtrarCosteo([otro,base],{orden:'margenRappi'},18)[0].id,1);
 assert.equal(filtrarCosteo([base,{...base,id:3,rappi:null}],{orden:'margenRappi',direccion:'desc'},18).at(-1)?.id,3);
});
