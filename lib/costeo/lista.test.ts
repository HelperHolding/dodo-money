import test from 'node:test';
import assert from 'node:assert/strict';
import {filtrarCosteo,agruparCosteo,margenFila,type FilaCosteo} from './lista.ts';
const base:FilaCosteo={id:1,nombre:'Pizza Álamo',categoria:'Pizzas',tamano:'Grande',costo:40,desde:'2026-10-01',fuente:null,nota:null,pos:116,rappi:232,rappiFecha:'2026-10-08',bom:true,costoBOM:40,insumos:['Queso mozzarella']};
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
 assert.equal(filtrarCosteo(filas,{min:'0'}).length,2);
 assert.equal(filtrarCosteo(filas,{orden:'costo',direccion:'desc'}).at(-1)?.id,3);
 assert.equal(filtrarCosteo(filas,{rapido:'diferencia'}).length,1);
 assert.equal(agruparCosteo(filas,'costo').length,2);
 assert.equal(agruparCosteo([base,{...base,id:2,bom:false}],'bom').length,2);
});
