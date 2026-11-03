import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {BASE,EXTRA,U,S,como} from './tareasBase.mjs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const fase1=load('supabase/migrations/20261102120000_tareas.sql');
const fase2=load('supabase/migrations/20261102200000_tareas_automaticas.sql');
const migracion=load('supabase/migrations/20261102220000_tareas_recurrentes.sql');

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(EXTRA);await db.exec(fase1);await db.exec(fase2);await db.exec(migracion);return db;};
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
const hoy=async(db,d)=>db.exec(`create or replace function hoy_mx() returns date language sql stable as $$select date '${d}'$$`);
const crear=async(db,id,datos)=>{await como(db,id);return Number((await db.query(`select public.crear_tarea($1::jsonb) n`,[JSON.stringify(datos)])).rows[0].n);};
const ver=async(db,id,n)=>{await como(db,id);return (await db.query(`select * from public.tareas_visibles($1)`,[n])).rows[0];};
const mover=async(db,id,n,estado,nota='',detener=false)=>{
 await como(db,id);
 const rev=(await db.query(`select revision from public.tareas where numero=$1`,[n])).rows[0].revision;
 const s=(await db.query(`select public.mover_tarea($1,$2,$3,$4,$5) s`,[n,rev,estado,nota,detener])).rows[0].s;
 return s===null?null:Number(s);
};
const aprobar=async(db,id,n)=>{await mover(db,id,n,'en_revision');return mover(db,id,n,'hecho');};
const fecha=d=>d instanceof Date?d.toISOString().slice(0,10):d;

test('recurrentes: DODO-82 cada lunes; al aprobarla sale la siguiente con lo mismo y una semana después',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Recoger efectivo y reponer bóveda',descripcion:'Cada lunes',prioridad:'alta',vence:'2026-11-02',asignado_a:U.gerente,sucursal_id:S.z,repite:'semanal'});
  const t=await ver(db,U.admin,n);
  assert.equal(t.repite,'semanal');assert.equal(t.anterior_numero,null);assert.equal(t.siguiente_numero,null);
  const s=await aprobar(db,U.admin,n);
  assert.equal(s,n+1);
  const sig=await ver(db,U.admin,s);
  assert.equal(sig.titulo,'Recoger efectivo y reponer bóveda');assert.equal(sig.descripcion,'Cada lunes');
  assert.equal(sig.prioridad,'alta');assert.equal(sig.asignado_a,U.gerente);assert.equal(sig.sucursal_id,S.z);
  assert.equal(sig.creado_por,U.admin);assert.equal(sig.estado,'por_hacer');assert.equal(sig.repite,'semanal');
  assert.equal(fecha(sig.vence),'2026-11-09');assert.equal(Number(sig.anterior_numero),n);
  assert.equal(Number((await ver(db,U.admin,n)).siguiente_numero),s);
  // El asignado la ve y la puede trabajar; mandarla a revisión no crea otra.
  assert.equal(await mover(db,U.gerente,s,'en_curso'),null);
 }finally{await db.close();}
});

test('recurrentes: cerrada tarde salta a la próxima fecha que no haya pasado; cerrada antes, un periodo después',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Recoger efectivo',vence:'2026-11-02',asignado_a:U.admin,repite:'semanal'});
  await hoy(db,'2026-11-18');
  assert.equal(fecha((await ver(db,U.admin,await aprobar(db,U.admin,n))).vence),'2026-11-23');
  await hoy(db,'2026-11-16');
  const m=await crear(db,U.admin,{titulo:'Exactamente hoy',vence:'2026-11-02',asignado_a:U.admin,repite:'semanal'});
  assert.equal(fecha((await ver(db,U.admin,await aprobar(db,U.admin,m))).vence),'2026-11-16');
  await hoy(db,'2026-11-01');
  const k=await crear(db,U.admin,{titulo:'Adelantada',vence:'2026-11-09',asignado_a:U.admin,repite:'semanal'});
  assert.equal(fecha((await ver(db,U.admin,await aprobar(db,U.admin,k))).vence),'2026-11-16');
 }finally{await db.close();}
});

test('recurrentes: DODO-89 cada mes conserva el día; el 31 cae al último del mes y regresa',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Programar pago de Totalplay',vence:'2026-11-27',asignado_a:U.admin,repite:'mensual'});
  const s=await aprobar(db,U.admin,n);
  assert.equal(fecha((await ver(db,U.admin,s)).vence),'2026-12-27');
  await hoy(db,'2027-01-01');
  const a=await crear(db,U.admin,{titulo:'Cierre de mes',vence:'2027-01-31',asignado_a:U.admin,repite:'mensual'});
  const b=await aprobar(db,U.admin,a);assert.equal(fecha((await ver(db,U.admin,b)).vence),'2027-02-28');
  await hoy(db,'2027-02-15');
  const c=await aprobar(db,U.admin,b);assert.equal(fecha((await ver(db,U.admin,c)).vence),'2027-03-31');
  // Varios meses tarde: salta hasta el primero que no haya pasado.
  await hoy(db,'2027-06-05');
  const d=await aprobar(db,U.admin,c);assert.equal(fecha((await ver(db,U.admin,d)).vence),'2027-06-30');
 }finally{await db.close();}
});

test('recurrentes: cancelar con «dejar de repetir» corta la serie; sin la casilla solo salta esa vez',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Recoger efectivo',vence:'2026-11-02',asignado_a:U.ana,sucursal_id:S.z,repite:'semanal'});
  const s=await mover(db,U.admin,n,'cancelada','No se abrió la tienda',false);
  assert.equal(fecha((await ver(db,U.admin,s)).vence),'2026-11-09');
  assert.equal(await mover(db,U.admin,s,'cancelada','Ya no se hace',true),null);
  const t=await ver(db,U.admin,s);
  assert.equal(t.estado,'cancelada');assert.equal(t.repite,null);assert.equal(t.siguiente_numero,null);
  // La casilla no afecta a «hecho» ni a tareas que no se repiten.
  const m=await crear(db,U.admin,{titulo:'Una vez',asignado_a:U.admin});
  assert.equal(await mover(db,U.admin,m,'cancelada','Ya no aplica',false),null);
 }finally{await db.close();}
});

test('recurrentes: editar prende, cambia o apaga la repetición; el historial lo anota',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Pagar Totalplay',vence:'2026-11-27',asignado_a:U.admin});
  const editar=async(datos)=>{await como(db,U.admin);const rev=(await db.query(`select revision from public.tareas where numero=$1`,[n])).rows[0].revision;
   await db.query(`select public.actualizar_tarea($1,$2,$3::jsonb)`,[n,rev,JSON.stringify({titulo:'Pagar Totalplay',asignado_a:U.admin,vence:'2026-11-27',...datos})]);};
  await editar({repite:'mensual'});
  let t=(await db.query(`select repite,repite_dia from public.tareas where numero=$1`,[n])).rows[0];
  assert.deepEqual(t,{repite:'mensual',repite_dia:27});
  await editar({repite:'mensual',vence:'2026-11-30'});
  assert.equal((await db.query(`select repite_dia from public.tareas where numero=$1`,[n])).rows[0].repite_dia,30);
  await editar({repite:''});
  t=(await db.query(`select repite,repite_dia from public.tareas where numero=$1`,[n])).rows[0];
  assert.deepEqual(t,{repite:null,repite_dia:null});
  const cambios=(await db.query(`select antes,despues from public.hilo_tarea($1) where campo='repite'`,[n])).rows;
  assert.deepEqual(cambios,[{antes:null,despues:'mensual'},{antes:'mensual',despues:null}]);
  await rechaza(editar({repite:'mensual',vence:''}),/ponle fecha de vencimiento/);
 }finally{await db.close();}
});

test('recurrentes: validaciones al crear y la siguiente no copia el documento',async()=>{
 const db=await nueva();
 try{
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.admin,repite:'diario',vence:'2026-11-02'}),/Repetición inválida/);
  await rechaza(crear(db,U.admin,{titulo:'Algo',asignado_a:U.admin,repite:'semanal'}),/ponle fecha de vencimiento/);
  const n=await crear(db,U.admin,{titulo:'Revisar factura',asignado_a:U.admin,vence:'2026-11-05',repite:'semanal',documento_tipo:'factura',documento_id:'00000000-0000-0000-0000-0000000000fa'});
  const s=await aprobar(db,U.admin,n);
  const sig=await ver(db,U.admin,s);
  assert.equal(sig.documento_texto,null);assert.equal(sig.documento_tipo,null);assert.equal(sig.sucursal_id,S.z);
  // Una tarea automática no puede repetirse.
  await rechaza(db.query(`update public.tareas set origen='automatica',regla='factura_sin_revisar',creado_por=null where numero=$1`,[s]),/tareas_repite_manual|check constraint/);
 }finally{await db.close();}
});

test('recurrentes: la siguiente sale una sola vez y nadie llama directo a las funciones internas',async()=>{
 const db=await nueva();
 try{
  const n=await crear(db,U.admin,{titulo:'Recoger efectivo',vence:'2026-11-02',asignado_a:U.admin,repite:'semanal'});
  const s=await aprobar(db,U.admin,n);
  await rechaza(db.query(`insert into public.tareas(titulo,asignado_a,creado_por,anterior_id) select 'Doble',asignado_a,creado_por,id from public.tareas where numero=$1`,[n]),/duplicate key|tareas_anterior/);
  assert.equal(Number((await db.query(`select count(*) c from public.tareas where anterior_id is not null`)).rows[0].c),1);
  assert.ok(s);
  const priv=async(f)=>(await db.query(`select has_function_privilege('authenticated',$1,'execute') p`,[f])).rows[0].p;
  assert.equal(await priv('public.siguiente_vence(date,text,smallint,date)'),false);
  assert.equal(await priv('public.crear_siguiente_tarea()'),false);
  assert.equal(await priv('public.mover_tarea(bigint,integer,text,text,boolean)'),true);
  assert.equal(Number((await db.query(`select count(*) c from pg_proc where proname='mover_tarea'`)).rows[0].c),1);
 }finally{await db.close();}
});

test('recurrentes: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{
  await assert.rejects(db.exec(load('supabase/pruebas/20261102220000_tareas_recurrentes.sql')),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});
