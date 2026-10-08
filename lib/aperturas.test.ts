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

import {indicadoresApertura,grupoApertura} from './aperturas.ts';
test('panel de apertura: avance solo de actividades aplicables, no de compras',()=>{
 const r=indicadoresApertura([item({tipo:'actividad',estado:'completado'}),item({tipo:'actividad',estado:'en_curso'}),item({tipo:'actividad',estado:'no_aplica'}),item({estado:'verificado'})],'2026-10-08');
 assert.equal(r.avance,50);assert.equal(r.terminadas,1);assert.equal(r.actividades.length,2);
 assert.equal(indicadoresApertura([],'2026-10-08').avance,null);
});
test('panel de apertura: recibe parcialmente sin inflar por excedentes ni referencias',()=>{
 const r=indicadoresApertura([item({cantidad:4,recibido:2}),item({cantidad:2,recibido:3}),item({cantidad:null,recibido:10}),item({tipo:'referencia',cantidad:500,recibido:500}),item({estado:'por_validar',cantidad:100})],'2026-10-08');
 assert.equal(r.unidades,6);assert.equal(r.recibidas,4);assert.equal(r.recepcion,67);assert.equal(r.sinCantidad,1);assert.equal(r.porValidar,1);
 assert.equal(indicadoresApertura([],'2026-10-08').recepcion,null);
});
test('panel de apertura: alertas únicas, hoy no vencido y terminados excluidos',()=>{
 const r=indicadoresApertura([item({id:'a',estado:'bloqueado',fin:'2026-10-07'}),item({id:'b',fin:'2026-10-08'}),item({id:'c',estado:'verificado',fin:'2026-10-07'}),item({id:'d',estado:'no_aplica',fin:'2026-10-07'})],'2026-10-08');
 assert.equal(r.alertas.length,1);assert.equal(r.bloqueados.length,1);assert.equal(r.atrasados.length,1);
});
test('panel de apertura: grupos conservan diferencia entre recepción y verificación',()=>{
 assert.equal(grupoApertura(item({estado:'recibido'})),'recibido');
 assert.equal(grupoApertura(item({estado:'verificado'})),'terminado');
 assert.equal(grupoApertura(item({estado:'recibido_parcial'})),'en_curso');
});
