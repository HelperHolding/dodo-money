import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resumenApertura,estadosPara,type ItemApertura} from './aperturas.ts';
const item=(d:Partial<ItemApertura>):ItemApertura=>({id:'i',proyecto_id:'p',clave:'e',tipo:'equipo',etapa:'P4',nombre:'Horno',fuente:'plano',original:{},estado:'pedido',responsable:null,inicio:null,fin:null,cantidad:2,recibido:0,precio:100,evidencia:null,notas:null,orden_id:null,factura_id:null,revision:1,categoria:null,...d});
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
import {avanceCategorias,esCategoria} from './aperturas.ts';
test('categorías de apertura: la obra no infla el equipo recibido',()=>{
 const r=indicadoresApertura([item({categoria:'equipo_cocina',cantidad:2,recibido:2,estado:'recibido'}),item({categoria:'pisos',cantidad:30,recibido:0,estado:'por_cotizar'})],'2026-11-02');
 assert.equal(r.unidades,2);assert.equal(r.recepcion,100);assert.equal(r.equipo.length,1);
});
test('categorías de apertura: avance por instalado o verificado, sin no aplica ni por validar',()=>{
 const c=avanceCategorias([item({categoria:'iluminacion',estado:'instalado'}),item({categoria:'iluminacion',estado:'pedido'}),item({categoria:'iluminacion',estado:'no_aplica'}),item({categoria:'iluminacion',estado:'bloqueado'}),item({estado:'verificado'}),item({tipo:'referencia',estado:'cotizado'}),item({tipo:'actividad',estado:'completado'})]);
 const luz=c.find(x=>x.clave==='iluminacion')!;
 assert.equal(luz.conceptos,3);assert.equal(luz.listos,1);assert.equal(luz.porcentaje,33);assert.equal(luz.pedidos,1);assert.equal(luz.bloqueados,1);assert.equal(luz.obra,true);
 assert.deepEqual(c.map(x=>x.clave),['iluminacion',null]);
 assert.equal(esCategoria('pisos'),true);assert.equal(esCategoria('toString'),false);assert.equal(esCategoria(''),false);
});
import {checklistApertura} from './aperturas.ts';
test('checklist de apertura: módulos por etapa, equipo por categoría y general promediado',()=>{
 const c=checklistApertura([
  item({id:'a1',tipo:'actividad',etapa:'P1',estado:'completado'}),item({id:'a2',tipo:'actividad',etapa:'P2',estado:'en_curso'}),item({id:'a3',tipo:'actividad',etapa:'P3',estado:'no_aplica'}),
  item({id:'t1',tipo:'tecnico',etapa:'P2',estado:'completado'}),item({id:'t2',tipo:'tecnico',etapa:'P2',estado:'bloqueado'}),
  item({categoria:'equipo_cocina',estado:'verificado'}),item({categoria:'equipo_cocina',estado:'pedido'}),item({categoria:'equipo_cocina',estado:'por_validar'}),item({estado:'por_cotizar'}),
  item({categoria:'pisos',estado:'instalado'}),item({categoria:'pisos',estado:'instalado'}),item({tipo:'referencia',estado:'cotizado'}),
 ]);
 const [proyecto,compras,obra,apertura]=c.modulos;
 assert.deepEqual(proyecto.lineas.map(l=>[l.nombre,l.marca,l.listos,l.total]),[['Validaciones técnicas','bloqueado',1,2],['Horno','listo',1,1],['Horno','curso',0,1]]);
 assert.equal(proyecto.porcentaje,50);
 assert.deepEqual(compras.lineas.map(l=>[l.clave,l.marca,l.listos,l.total]),[['equipo_cocina','curso',1,2],['sin','pendiente',0,1]]);
 assert.equal(compras.porcentaje,33);
 assert.deepEqual(obra.lineas.map(l=>[l.clave,l.marca,l.listos,l.total]),[['pisos','listo',2,2]]);
 assert.equal(apertura.porcentaje,null);assert.equal(c.general,Math.round((50+33+100)/3));
 assert.deepEqual(checklistApertura([]).general,null);
 const v=checklistApertura([item({tipo:'tecnico',etapa:'P7',estado:'por_validar'}),item({tipo:'tecnico',etapa:'P7',estado:'por_validar'})]).modulos[3].lineas[0];
 assert.deepEqual([v.marca,v.listos,v.total],['pendiente',0,2]);
});
