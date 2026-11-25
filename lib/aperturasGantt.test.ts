import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cuentaEnAvance,escalaGantt,ganttEtapas,type TareaGantt} from './aperturasGantt.ts';

const t=(d:Partial<TareaGantt>):TareaGantt=>({id:'i',nombre:'Tarea',tipo:'actividad',etapa:'P1',estado:'pendiente',inicio:null,fin:null,responsable:null,...d});

test('gantt de aperturas: el avance de la etapa cuenta actividades, equipo y validaciones como el Checklist',()=>{
 const e=ganttEtapas([
  t({id:'a',etapa:'P4',estado:'completado'}),
  t({id:'b',etapa:'P4',tipo:'equipo',estado:'instalado'}),
  t({id:'c',etapa:'P4',tipo:'equipo',estado:'pedido'}),
  t({id:'d',etapa:'P4',tipo:'tecnico',estado:'en_curso'}),
  t({id:'e',etapa:'P4',tipo:'equipo',estado:'por_validar'}),
  t({id:'f',etapa:'P4',estado:'no_aplica'}),
 ],'2026-11-19').find(x=>x.clave==='P4')!;
 // Promedio de puntos: completado 1 + instalado 1 + pedido 0.5 + en curso 1/3 = 2.83 / 4 → 71.
 assert.equal(e.conceptos,4);assert.equal(e.listos,2);assert.equal(e.porcentaje,71);
 assert.ok(!cuentaEnAvance({tipo:'referencia',estado:'por_validar'}));
});
test('gantt de aperturas: la ventana va de la primera fecha a la última; sin fecha se cuenta aparte',()=>{
 const e=ganttEtapas([
  t({id:'a',etapa:'P5',inicio:'2026-11-10',fin:'2026-11-20'}),
  t({id:'b',etapa:'P5',inicio:'2026-11-02',fin:'2026-11-05'}),
  t({id:'c',etapa:'P5',fin:'2026-12-01'}),
  t({id:'d',etapa:'P5'}),
 ],'2026-11-19').find(x=>x.clave==='P5')!;
 assert.equal(e.desde,'2026-11-02');assert.equal(e.hasta,'2026-12-01');
 assert.deepEqual(e.tareas.map(x=>x.item.id),['b','a','c']);
 assert.equal(e.sinFecha,1);
});
test('gantt de aperturas: vencidas y bloqueadas',()=>{
 const e=ganttEtapas([
  t({id:'a',fin:'2026-11-10'}),t({id:'b',fin:'2026-11-10',estado:'completado'}),t({id:'c',fin:'2026-11-30',estado:'bloqueado'}),
 ],'2026-11-19').find(x=>x.clave==='P1')!;
 assert.equal(e.vencidos,1);assert.equal(e.bloqueados,1);
 assert.equal(e.tareas.find(x=>x.item.id==='a')!.vencida,true);
});
test('gantt de aperturas: etapas vacías no tienen porcentaje',()=>{
 const e=ganttEtapas([],'2026-11-19');
 assert.equal(e.length,7);assert.ok(e.every(x=>x.porcentaje===null&&x.desde===null));
});
test('gantt de aperturas: escala por semanas que empieza en lunes y cabe en 0–100',()=>{
 const s=escalaGantt(['2026-11-04','2026-12-10',null])!;
 assert.equal(s.desde,'2026-11-02');assert.equal(s.hasta,'2026-12-13');
 assert.equal(s.porMes,false);
 assert.equal(s.marcas[0].dia,'2026-11-02');assert.equal(s.marcas[0].etiqueta,'2 nov');
 assert.equal(s.pos('2026-11-02'),0);
 assert.equal(Math.round(s.ancho('2026-11-02','2026-12-13')),100);
 assert.equal(s.pos('2025-01-01'),0);assert.equal(s.pos('2030-01-01'),100);
 assert.ok(s.ancho('2026-11-10','2026-11-10')>0);
});
test('gantt de aperturas: más de cuatro meses marca meses',()=>{
 const s=escalaGantt(['2026-09-15','2027-03-01'])!;
 assert.equal(s.porMes,true);
 assert.deepEqual(s.marcas.map(m=>m.etiqueta),['oct 2026','nov 2026','dic 2026','ene 2027','feb 2027','mar 2027']);
 assert.equal(escalaGantt([null,undefined]),null);
});
test('gantt de aperturas: equipo instalado con fecha pasada no sale vencido',()=>{
 const e=ganttEtapas([t({id:'x',tipo:'equipo',etapa:'P4',estado:'instalado',fin:'2026-11-10'})],'2026-11-19').find(x=>x.clave==='P4')!;
 assert.equal(e.vencidos,0);assert.equal(e.tareas[0].vencida,false);
});
test('gantt de aperturas: la etapa muestra 100 solo si todo tiene 1 punto; si no, tope 99',()=>{
 const casi=[...Array.from({length:199},(_,n)=>t({id:`a${n}`,estado:'completado'})),t({id:'z',estado:'por_cerrar'})];
 assert.equal(ganttEtapas(casi,'2026-11-19').find(x=>x.clave==='P1')!.porcentaje,99); // 0.998 → 99
 assert.equal(ganttEtapas(casi.map(i=>({...i,estado:'completado'})),'2026-11-19').find(x=>x.clave==='P1')!.porcentaje,100);
});
