import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diasVencido,fechaConcepto,notasConcepto,porEtapa,tonoConcepto,avanceComparado,diasParaApertura,esperadoItem,filasCronograma,indicadoresProyecto,lecturaApertura,textoDiasApertura,textoPts,type Concepto} from './aperturasAkton.ts';
import type {ItemApertura} from './aperturas.ts';

export const c=(d:Partial<Concepto>):Concepto=>({id:'i',nombre:'Tarea',tipo:'actividad',etapa:'P1',estado:'pendiente',inicio:null,fin:null,responsable:null,notas:null,categoria:null,...d});

test('aperturas akton: esperado antes, durante y después del rango, contando hoy',()=>{
 const r={inicio:'2026-11-01',fin:'2026-11-10'};
 assert.equal(esperadoItem(r,'2026-10-31'),0);
 assert.equal(esperadoItem(r,'2026-11-01'),0.1);
 assert.equal(esperadoItem(r,'2026-11-05'),0.5);
 assert.equal(esperadoItem(r,'2026-11-10'),1);
 assert.equal(esperadoItem(r,'2026-11-11'),1);
 assert.equal(esperadoItem({inicio:null,fin:'2026-11-03'},'2026-11-03'),1);
 assert.equal(esperadoItem({inicio:null,fin:null},'2026-11-03'),null);
});
test('aperturas akton: el avance comparado usa solo conceptos con fecha para la variación',()=>{
 const a=avanceComparado([
  c({id:'a',estado:'completado',inicio:'2026-11-01',fin:'2026-11-10'}),
  c({id:'b',inicio:'2026-11-01',fin:'2026-11-10'}),
  c({id:'d',estado:'completado'}),
  c({id:'e'}),
  c({id:'f',estado:'no_aplica',inicio:'2026-11-01',fin:'2026-11-02'}),
  c({id:'g',tipo:'equipo',estado:'por_validar',fin:'2026-11-01'}),
 ],'2026-11-05');
 assert.equal(a.conceptos,4);assert.equal(a.listos,2);assert.equal(a.real,50);
 assert.equal(a.conFecha,2);assert.equal(a.realConFecha,50);
 assert.equal(a.esperado,50);assert.equal(a.variacion,0);assert.equal(a.favorable,'si');
});
test('aperturas akton: real es el global ponderado y el real con fecha promedia puntos',()=>{
 const a=avanceComparado([
  c({id:'a',etapa:'P1',estado:'por_cerrar',inicio:'2026-11-01',fin:'2026-11-10'}),
  c({id:'b',etapa:'P1',estado:'en_curso',inicio:'2026-11-01',fin:'2026-11-10'}),
  c({id:'d',tipo:'equipo',etapa:'P4',estado:'recibido'}),
 ],'2026-11-05');
 // Real: Proyecto (2/3 + 1/3) / 2 = 0.5 y Compras 0.75 → (0.20·0.5 + 0.35·0.75) / 0.55 = 0.66 → 66.
 assert.equal(a.real,66);assert.equal(a.listos,0);
 // Con fecha: solo a y b → (2/3 + 1/3) / 2 = 50, contra 50 esperado.
 assert.equal(a.realConFecha,50);assert.equal(a.esperado,50);assert.equal(a.variacion,0);
});
test('aperturas akton: tolerancia de 5 puntos',()=>{
 const items=(listos:number)=>Array.from({length:20},(_,n)=>c({id:`x${n}`,inicio:'2026-11-01',fin:'2026-11-10',estado:n<listos?'completado':'pendiente'}));
 assert.equal(avanceComparado(items(9),'2026-11-05').favorable,'si'); // 45 vs 50 → −5
 assert.equal(avanceComparado(items(8),'2026-11-05').favorable,'no'); // 40 vs 50 → −10
});
test('aperturas akton: sin fechas no hay esperado ni tono',()=>{
 const a=avanceComparado([c({estado:'completado'}),c({id:'b'})],'2026-11-05');
 assert.equal(a.real,50);assert.equal(a.esperado,null);assert.equal(a.variacion,null);assert.equal(a.favorable,null);
 const v=avanceComparado([],'2026-11-05');
 assert.equal(v.real,null);assert.equal(v.esperado,null);
});
test('aperturas akton: días para la apertura',()=>{
 assert.deepEqual(diasParaApertura('2026-12-01','2026-11-24',false),{tipo:'faltan',dias:7});
 assert.deepEqual(diasParaApertura('2026-11-24','2026-11-24',false),{tipo:'hoy',dias:0});
 assert.deepEqual(diasParaApertura('2026-11-20','2026-11-24',false),{tipo:'vencida',dias:4});
 assert.deepEqual(diasParaApertura('2026-11-20','2026-11-24',true),{tipo:'abierta',dias:4});
 assert.equal(textoPts(3),'+3 pts');assert.equal(textoPts(-8),'−8 pts');assert.equal(textoPts(0),'0 pts');
});
const it=(d:Partial<ItemApertura>):ItemApertura=>({id:'i',proyecto_id:'p',clave:'K',tipo:'actividad',etapa:'P1',nombre:'Tarea',fuente:'x',original:{},estado:'pendiente',responsable:null,inicio:null,fin:null,cantidad:null,recibido:0,precio:null,evidencia:null,notas:null,orden_id:null,factura_id:null,revision:1,categoria:null,...d});

test('aperturas akton: filas del cronograma con vencidas, bloqueadas y notas',()=>{
 const f=filasCronograma([
  c({id:'a',etapa:'P3',nombre:'Licencia',estado:'bloqueado',inicio:'2026-11-01',fin:'2026-11-10'}),
  c({id:'b',etapa:'P3',nombre:'Contrato',inicio:'2026-11-01',fin:'2026-11-20'}),
  c({id:'d',etapa:'P3',nombre:'Planos',fin:'2026-11-15'}),
  c({id:'e',etapa:'P3',nombre:'Sin fecha'}),
 ],'2026-11-24');
 assert.equal(f.length,7);
 const p3=f.find(x=>x.clave==='P3')!;
 assert.equal(p3.desde,'2026-11-01');assert.equal(p3.hasta,'2026-11-20');
 assert.equal(p3.sinFecha,1);
 assert.deepEqual(p3.vencidas.map(v=>[v.item.id,v.diasVencida]),[['a',14],['d',9],['b',4]]);
 assert.deepEqual(p3.bloqueadas.map(b=>b.id),['a']);
 assert.deepEqual(p3.notas,['1 bloqueada: Licencia','3 vencidas']);
 const p1=f.find(x=>x.clave==='P1')!;
 assert.equal(p1.avance.esperado,null);assert.deepEqual(p1.notas,[]);
});
test('aperturas akton: la nota de bloqueadas resume después de dos nombres',()=>{
 const p=filasCronograma(['A','B','C','D'].map(n=>c({id:n,nombre:n,etapa:'P5',estado:'bloqueado'})),'2026-11-24').find(x=>x.clave==='P5')!;
 assert.deepEqual(p.notas,['4 bloqueadas: A, B y 2 más']);
});
test('aperturas akton: indicadores del proyecto',()=>{
 const items=[
  it({id:'a',estado:'completado',inicio:'2026-11-01',fin:'2026-11-10'}),
  it({id:'b',estado:'bloqueado',fin:'2026-11-20'}),
  it({id:'d',tipo:'equipo',etapa:'P4',estado:'pedido',cantidad:4,recibido:1,precio:100}),
  it({id:'e',estado:'no_aplica'}),
 ];
 const k=indicadoresProyecto({objetivo_hasta:'2026-12-04',presupuesto:300},items,'2026-11-24');
 assert.deepEqual(k.dias,{tipo:'faltan',dias:10});
 assert.equal(k.vencidas,1);assert.equal(k.bloqueadas,1);assert.equal(k.aplicables,3);
 assert.equal(k.recepcion,25);assert.equal(k.recibidas,1);assert.equal(k.unidades,4);
 assert.deepEqual(k.compras,{monto:400,presupuesto:300,excede:true,firme:false,sinPrecio:0});
});
test('aperturas akton: lectura con las tres conclusiones y en su orden',()=>{
 const items=[
  ...Array.from({length:10},(_,n)=>it({id:`o${n}`,etapa:'P5',nombre:`Obra ${n}`,inicio:'2026-11-01',fin:'2026-11-10'})),
  it({id:'l',etapa:'P3',nombre:'Licencia',estado:'bloqueado',inicio:'2026-11-01',fin:'2026-11-18'}),
  it({id:'q',etapa:'P1',nombre:'Contrato',estado:'completado',inicio:'2026-11-01',fin:'2026-11-05'}),
  it({id:'eq',tipo:'equipo',etapa:'P4',nombre:'Horno',estado:'cotizado',cantidad:1,precio:null}),
 ];
 const filas=filasCronograma(items,'2026-11-24');
 const l=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:5000},items,'2026-11-24'),filas);
 assert.equal(l.length,3);
 assert.equal(l[0].titulo,'Avance de 8 % contra 100 % esperado a hoy');
 // Empate en −100: desempata por clave de etapa (P3 antes que P5).
 assert.equal(l[0].texto,'Faltan 92 puntos. Las etapas más atrasadas: Permisos y contratación (−100 pts) y Obra e instalaciones (−100 pts).');
 assert.equal(l[1].titulo,'11 tareas vencidas, 1 también bloqueada');
 // Primero las de más días de atraso; Licencia (6 días) queda dentro de «y 8 más».
 assert.equal(l[1].texto,'Las más urgentes: Obra 0 (vencida hace 14 días), Obra 1 (vencida hace 14 días), Obra 2 (vencida hace 14 días) y 8 más.');
 assert.equal(l[2].titulo,'Compras: $0.00 estimado de $5,000.00 de presupuesto');
 assert.equal(l[2].texto,'1 concepto sin precio o sin cantidad.');
});
test('aperturas akton: la lectura omite lo que no aplica',()=>{
 const items=[it({id:'a',estado:'completado',inicio:'2026-11-01',fin:'2026-11-10'})];
 const l=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},items,'2026-11-24'),filasCronograma(items,'2026-11-24'));
 assert.equal(l.length,1);
 assert.equal(l[0].titulo,'Avance de 100 % contra 100 % esperado a hoy');
 assert.equal(l[0].texto,'Va al día (0 pts). La etapa más adelantada es Local y alcance (0 pts).');
 assert.deepEqual(lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},[],'2026-11-24'),filasCronograma([],'2026-11-24')),[]);
});

// Revisión final.
test('aperturas akton: el valor de días nunca es negativo',()=>{
 assert.deepEqual(textoDiasApertura({tipo:'vencida',dias:4}),{valor:'Vencida hace 4 días',tono:'no'});
 assert.deepEqual(textoDiasApertura({tipo:'vencida',dias:1}),{valor:'Vencida hace 1 día',tono:'no'});
 assert.deepEqual(textoDiasApertura({tipo:'faltan',dias:7}),{valor:'7',tono:'destacado'});
 assert.deepEqual(textoDiasApertura({tipo:'hoy',dias:0}),{valor:'Hoy',tono:'destacado'});
 assert.deepEqual(textoDiasApertura({tipo:'abierta',dias:3}),{valor:'Abierta',tono:'destacado'});
});
test('aperturas akton: el KPI de vencidas cuenta lo mismo que la lectura y el cronograma',()=>{
 const items=[
  it({id:'a',inicio:'2026-11-10'}),                                   // solo inicio pasado: vencida
  it({id:'b',tipo:'equipo',estado:'por_validar',fin:'2026-11-10'}),  // por validar: no cuenta
 ];
 const k=indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},items,'2026-11-24');
 const filas=filasCronograma(items,'2026-11-24');
 assert.equal(k.vencidas,1);
 assert.equal(filas.flatMap(f=>f.vencidas).length,1);
});
test('aperturas akton: equipo instalado con fecha pasada no es vencido',()=>{
 const f=filasCronograma([c({id:'x',tipo:'equipo',etapa:'P4',estado:'instalado',fin:'2026-11-10'})],'2026-11-24').find(x=>x.clave==='P4')!;
 assert.equal(f.vencidas.length,0);assert.equal(f.tareas[0].diasVencida,null);
});
test('aperturas akton: al día sin etapas adelantadas no dice «más adelantada»',()=>{
 // Dos etapas de 20 conceptos, 9 listos cada una: 45 % contra 50 % esperado → −5 pts (al día), ninguna etapa arriba.
 const items=Array.from({length:40},(_,n)=>it({id:`x${n}`,etapa:n<20?'P1':'P2',inicio:'2026-11-01',fin:'2026-11-10',estado:n%20<9?'completado':'pendiente'}));
 const l=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},items,'2026-11-05'),filasCronograma(items,'2026-11-05'));
 assert.equal(l[0].texto,'Va al día (−5 pts). La que menos se atrasa es Local y alcance (−5 pts).');
});

// PR 2.
test('aperturas akton: tono y días de atraso de un concepto',()=>{
 const hoy='2026-11-24';
 assert.equal(tonoConcepto(c({estado:'completado',fin:'2026-11-01'}),hoy),'listo');
 assert.equal(tonoConcepto(c({tipo:'equipo',estado:'instalado',fin:'2026-11-01'}),hoy),'listo');
 assert.equal(tonoConcepto(c({fin:'2026-11-20'}),hoy),'alerta');
 assert.equal(tonoConcepto(c({inicio:'2026-11-20'}),hoy),'alerta');
 assert.equal(tonoConcepto(c({estado:'bloqueado',fin:'2026-12-20'}),hoy),'alerta');
 assert.equal(tonoConcepto(c({fin:'2026-12-20'}),hoy),'normal');
 assert.equal(tonoConcepto(c({}),hoy),'normal');
 assert.equal(diasVencido(c({fin:'2026-11-20'}),hoy),4);
 assert.equal(diasVencido(c({estado:'verificado',fin:'2026-11-20'}),hoy),null);
 assert.equal(diasVencido(c({estado:'no_aplica',fin:'2026-11-20'}),hoy),null);
});
test('aperturas akton: notas al margen de un concepto',()=>{
 const hoy='2026-11-24';
 assert.deepEqual(notasConcepto(c({fin:'2026-11-23'}),hoy),['Vencida hace 1 día']);
 assert.deepEqual(notasConcepto(c({estado:'bloqueado',notas:'Falta permiso de uso de suelo',fin:'2026-11-20'}),hoy),['Bloqueada: Falta permiso de uso de suelo','Vencida hace 4 días']);
 assert.deepEqual(notasConcepto(c({estado:'bloqueado'}),hoy),['Bloqueada']);
 assert.deepEqual(notasConcepto(c({tipo:'referencia',estado:'por_validar'}),hoy),['Referencia / lista de apoyo']);
 assert.deepEqual(notasConcepto(c({}),hoy),[]);
});
test('aperturas akton: agrupar por etapa en orden y sin etapas vacías',()=>{
 const g=porEtapa([c({id:'a',etapa:'P5'}),c({id:'b',etapa:'P1'}),c({id:'d',etapa:'P5'})]);
 assert.deepEqual(g.map(x=>[x.clave,x.items.map(i=>i.id)]),[['P1',['b']],['P5',['a','d']]]);
 assert.equal(g[0].nombre,'Local y alcance');
});
test('aperturas akton: vencida y bloqueada a la vez cuenta una sola vez en el título',()=>{
 const items=[it({id:'a',estado:'bloqueado',fin:'2026-11-20'})];
 const l=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},items,'2026-11-24'),filasCronograma(items,'2026-11-24'));
 assert.equal(l.find(x=>/vencida|bloqueada/.test(x.titulo))!.titulo,'1 tarea vencida, también bloqueada');
 const m=[it({id:'a',estado:'bloqueado',fin:'2026-11-20'}),it({id:'b',estado:'bloqueado',fin:'2026-12-20'})];
 const l2=lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},m,'2026-11-24'),filasCronograma(m,'2026-11-24'));
 assert.equal(l2.find(x=>/vencida|bloqueada/.test(x.titulo))!.titulo,'1 tarea vencida, también bloqueada, y 1 bloqueada más');
});
test('aperturas akton: títulos de vencidas y bloqueadas sin traslape',()=>{
 const titulo=(m:ItemApertura[])=>lecturaApertura(indicadoresProyecto({objetivo_hasta:'2026-12-20',presupuesto:null},m,'2026-11-24'),filasCronograma(m,'2026-11-24')).find(x=>/vencida|bloqueada/.test(x.titulo))!.titulo;
 assert.equal(titulo([it({id:'a',fin:'2026-11-20'}),it({id:'b',estado:'bloqueado'})]),'1 tarea vencida y 1 bloqueada');
 assert.equal(titulo([it({id:'a',estado:'bloqueado'}),it({id:'b',estado:'bloqueado'})]),'2 bloqueadas');
});
test('aperturas akton: la fecha que se muestra es la misma con la que se decide si está vencida',()=>{
 assert.equal(fechaConcepto(c({inicio:'2026-11-01'})),'2026-11-01');
 assert.equal(fechaConcepto(c({inicio:'2026-11-01',fin:'2026-11-09'})),'2026-11-09');
 assert.equal(fechaConcepto(c({})),null);
});
