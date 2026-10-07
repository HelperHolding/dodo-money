import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenApertura,estadosPara,type ItemApertura} from './aperturas.ts';
const item=(d:Partial<ItemApertura>):ItemApertura=>({id:'i',proyecto_id:'p',clave:'e',tipo:'equipo',etapa:'P4',nombre:'Horno',fuente:'plano',original:{},estado:'pedido',responsable:null,inicio:null,fin:null,cantidad:2,recibido:0,precio:100,evidencia:null,notas:null,orden_id:null,factura_id:null,revision:1,...d});
test('aperturas: pedido o recibido no significan verificado; no aplicar sale del avance',()=>{
 const r=resumenApertura([item({}),item({estado:'recibido'}),item({estado:'verificado'}),item({estado:'no_aplica'})]);
 assert.equal(r.total,3);assert.equal(r.terminados,1);assert.equal(r.cotizado,600);
});
test('aperturas: referencia por validar no infla el costo; precio desconocido queda pendiente',()=>{
 const r=resumenApertura([item({tipo:'referencia',estado:'por_validar',cantidad:2000,precio:100}),item({precio:null}),item({cantidad:null})]);
 assert.equal(r.cotizado,0);assert.equal(r.sinPrecio,2);assert.equal(r.porValidar,1);
 assert.ok(!estadosPara('actividad').includes('pedido'));assert.ok(estadosPara('equipo').includes('verificado'));
});
