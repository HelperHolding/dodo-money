import {test} from 'node:test';
import assert from 'node:assert/strict';
import {avanceComparado,diasParaApertura,esperadoItem,textoPts,type Concepto} from './aperturasAkton.ts';

export const c=(d:Partial<Concepto>):Concepto=>({id:'i',nombre:'Tarea',tipo:'actividad',etapa:'P1',estado:'pendiente',inicio:null,fin:null,responsable:null,notas:null,...d});

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
