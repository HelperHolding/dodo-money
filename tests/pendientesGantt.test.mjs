import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {BASE,U,como} from './tareasBase.mjs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const tareas=load('supabase/migrations/20261102120000_tareas.sql');
const migracion=load('supabase/migrations/20261124120000_pendientes_gantt.sql');
const ITEM='00000000-0000-0000-0000-0000000000a8',EQUIPO='00000000-0000-0000-0000-0000000000a9';

async function nueva(){
 const db=new PGlite();
 await db.exec(BASE);
 // Columnas reales de apertura_items que usa el disparador (0037_aperturas.sql) y su historial.
 await db.exec(`alter table apertura_items add tipo text not null default 'actividad' check(tipo in ('actividad','equipo','referencia','tecnico')),
  add etapa text not null default 'P4' check(etapa in ('P1','P2','P3','P4','P5','P6','P7')),
  add estado text not null default 'pendiente' check(estado in ('pendiente','por_validar','en_curso','bloqueado','completado','no_aplica','por_cotizar','cotizado','aprobado','pedido','recibido_parcial','recibido','instalado','verificado')),
  add evidencia text,add revision integer not null default 1,add actualizado_en timestamptz not null default now();
  insert into apertura_items(id,proyecto_id,clave,nombre,tipo,estado) values('${EQUIPO}','00000000-0000-0000-0000-0000000000a7','E-13','Refrigerador','equipo','pedido');
  create table apertura_historial(id uuid primary key default gen_random_uuid(),item_id uuid not null references apertura_items(id),anterior jsonb not null,nuevo jsonb not null,usuario_id uuid not null,fecha timestamptz not null default now());`);
 await db.exec(tareas);
 await db.exec(migracion);
 return db;
}
const crear=async(db,datos)=>{await como(db,U.admin);return Number((await db.query(`select public.crear_tarea($1::jsonb) n`,[JSON.stringify(datos)])).rows[0].n);};
const revision=async(db,n)=>(await db.query('select revision from tareas where numero=$1',[n])).rows[0].revision;
const mover=async(db,n,estado,nota='')=>{await como(db,U.admin);await db.query('select public.mover_tarea($1,$2,$3,$4)',[n,await revision(db,n),estado,nota]);};
const cerrar=async(db,n)=>{await mover(db,n,'en_revision');await mover(db,n,'hecho');};
const item=async(db,id=ITEM)=>(await db.query('select estado,evidencia,revision from apertura_items where id=$1',[id])).rows[0];

test('pendientes del Gantt: la tarea se completa cuando todos sus pendientes están hechos (los cancelados no cuentan)',async()=>{
 const db=await nueva();
 try{
  const a=await crear(db,{titulo:'Contratar gas',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:ITEM});
  const b=await crear(db,{titulo:'Firmar contrato de gas',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:ITEM});
  const c=await crear(db,{titulo:'Duplicado',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:ITEM});
  await cerrar(db,a);
  assert.equal((await item(db)).estado,'pendiente');
  await mover(db,c,'cancelada','Se duplicó con el otro');
  assert.equal((await item(db)).estado,'pendiente');
  await cerrar(db,b);
  const i=await item(db);
  assert.equal(i.estado,'completado');
  assert.match(i.evidencia,new RegExp(`Pendiente DODO-${b} hecho por .+ el \\d{2}/\\d{2}/\\d{4}\\.`));
  assert.equal(i.revision,2);
  const h=(await db.query('select anterior->>\'estado\' a,nuevo->>\'estado\' n,usuario_id from apertura_historial where item_id=$1',[ITEM])).rows;
  assert.deepEqual(h.map(x=>[x.a,x.n,x.usuario_id]),[['pendiente','completado',U.admin]]);
 }finally{await db.close();}
});

test('pendientes del Gantt: equipo, tareas ya completadas y pendientes automáticos no mueven la tarea',async()=>{
 const db=await nueva();
 try{
  const e=await crear(db,{titulo:'Pedir refrigerador',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:EQUIPO});
  await cerrar(db,e);
  assert.equal((await item(db,EQUIPO)).estado,'pedido');
  // Un pendiente automático (regla de atraso) cerrado no completa la tarea.
  const n=await crear(db,{titulo:'Atraso',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:ITEM});
  await db.query(`update tareas set origen='automatica',regla='apertura_item_atrasado',creado_por=null where numero=$1`,[n]);
  await cerrar(db,n);
  assert.equal((await item(db)).estado,'pendiente');
  // Ya completada: no se vuelve a escribir.
  await db.query(`update apertura_items set estado='completado',evidencia='Visto en obra' where id=$1`,[ITEM]);
  const m=await crear(db,{titulo:'Otro',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:ITEM});
  await cerrar(db,m);
  assert.deepEqual(await item(db),{estado:'completado',evidencia:'Visto en obra',revision:1});
 }finally{await db.close();}
});

test('pendientes del Gantt: el texto del documento lleva la etapa, también en los ya creados',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await db.exec(`alter table apertura_items add tipo text not null default 'actividad',add etapa text not null default 'P4',add estado text not null default 'pendiente',add evidencia text,add revision integer not null default 1,add actualizado_en timestamptz not null default now();
   create table apertura_historial(id uuid primary key default gen_random_uuid(),item_id uuid not null,anterior jsonb not null,nuevo jsonb not null,usuario_id uuid not null,fecha timestamptz not null default now());`);
  await db.exec(tareas);
  const viejo=await crear(db,{titulo:'Antes',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:ITEM});
  assert.equal((await db.query('select documento_texto from tareas where numero=$1',[viejo])).rows[0].documento_texto,'Apertura Tlaquepaque · E-12 Horno de banda');
  await db.exec(migracion);
  const nuevo=await crear(db,{titulo:'Después',asignado_a:U.admin,documento_tipo:'apertura_item',documento_id:ITEM});
  const textos=(await db.query('select documento_texto from tareas where numero in ($1,$2) order by numero',[viejo,nuevo])).rows.map(r=>r.documento_texto);
  assert.deepEqual(textos,Array(2).fill('Apertura Tlaquepaque · P4 Compras y abastecimiento · E-12 Horno de banda'));
 }finally{await db.close();}
});
