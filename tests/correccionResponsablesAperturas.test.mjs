import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/correcciones/2026-11-27_responsables_aperturas.sql',import.meta.url),'utf8').replace(/^﻿/,'');
const bloque1=sql.slice(sql.indexOf('with equiv'),sql.indexOf('-- ============ BLOQUE 2'));
const bloque2=sql.slice(sql.indexOf('begin;'));
const USUARIOS=['Julio Verdeja','Ricardo Villa','Sebastián Cervera','Adrian Flores','Halim Simon','Renata Perez'];
const TEXTOS=[['Julio Verdeja',2],['Julio Veredeja',1],['Diego Michel',2],['Ricardo Villa',1],['José Villa',1],['Sebastián Cervera',1],['Diego Barreto',1],
 ['Diego Barreto (CFE) / Julio Verdeja (UVIE)',1],['César',1],['César (360°)',1],['Sebas (TI) / César',1],['Equipo marketing',1],['Adrian Flores',1],
 ['Gaby Landeros',1],['Halim Simon',1],['Renata',1]];
const CON_TEXTO=TEXTOS.reduce((a,[,n])=>a+n,0);
// Stubs fieles: catálogo con sus CHECK y su índice único, y el trigger de sincronización de la migración.
async function base({usuarios=USUARIOS,extra=[]}={}){
 const db=new PGlite();
 await db.exec(`create table perfiles(id uuid primary key default gen_random_uuid(),nombre text,activo boolean not null default true);
 create table apertura_responsables(id uuid primary key default gen_random_uuid(),nombre text not null check(length(nombre) between 1 and 80),
  perfil_id uuid unique references perfiles(id),externo boolean not null default false,activo boolean not null default true,check(externo=(perfil_id is null)));
 create unique index apertura_responsables_nombre_uq on apertura_responsables(lower(btrim(nombre)));
 create table apertura_items(id uuid primary key default gen_random_uuid(),nombre text,responsable text,notas text,responsable_id uuid references apertura_responsables(id));
 create function sincronizar_responsable_item() returns trigger language plpgsql as $$
 begin
  if new.responsable_id is not null then select nombre into new.responsable from apertura_responsables where id=new.responsable_id;
  elsif tg_op='UPDATE' and old.responsable_id is not null then new.responsable:=null;end if;
  return new;
 end $$;
 create trigger apertura_items_sincroniza_responsable before insert or update of responsable_id on apertura_items for each row execute function sincronizar_responsable_item();`);
 for(const u of usuarios) await db.query('insert into perfiles(nombre) values($1)',[u]);
 for(const [t,n] of [...TEXTOS,...extra]) for(let k=0;k<n;k++) await db.query('insert into apertura_items(nombre,responsable) values($1,$2)',['x',t]);
 await db.exec(`insert into apertura_items(nombre,responsable) values('sin1',null),('sin2',''),('sin3','  ')`);
 return db;
}
const correr=(db,n)=>db.exec(bloque2.replace('v_esperado integer := 0;',`v_esperado integer := ${n};`));
const catalogo=async db=>(await db.query('select nombre,externo from apertura_responsables order by nombre')).rows;
const cuenta=async(db,donde)=>(await db.query(`select count(*)::int n from apertura_items where ${donde}`)).rows[0].n;

test('aplica las equivalencias, los externos y las notas de los compuestos',async()=>{
 const db=await base();
 try{await correr(db,CON_TEXTO);
  const cat=await catalogo(db);
  assert.deepEqual(cat.map(c=>c.nombre),['Adrian Flores','César','Diego Barreto','Diego Michel','Equipo marketing','Gaby Landeros','Halim Simon','José Villa','Julio Verdeja','Renata Perez','Ricardo Villa','Sebastián Cervera']);
  assert.deepEqual(cat.filter(c=>c.externo).map(c=>c.nombre),['César','Diego Barreto','Diego Michel','Equipo marketing','Gaby Landeros','José Villa']);
  const filas=(await db.query('select responsable,notas,count(*)::int n from apertura_items where responsable_id is not null group by 1,2')).rows;
  const n=(r,no=null)=>filas.find(f=>f.responsable===r&&f.notas===no)?.n;
  assert.equal(n('Julio Verdeja'),3);assert.equal(n('Renata Perez'),1);assert.equal(n('César'),2);
  assert.equal(n('César','TI: Sebastián'),1);assert.equal(n('Diego Barreto','UVIE: Julio Verdeja'),1);assert.equal(n('Diego Barreto'),1);
  assert.equal(await cuenta(db,'responsable_id is not null'),CON_TEXTO);
  assert.equal(await cuenta(db,'responsable_id is null'),3);
  assert.equal((await db.query('select count(*)::int n from apertura_responsables where perfil_id is not null')).rows[0].n,6);
 }finally{await db.close();}
});
test('el bloque 1 propone el responsable y marca lo que no tiene equivalencia',async()=>{
 const db=await base({extra:[['Fulano Raro',2]]});
 try{const r=(await db.query(bloque1.slice(0,bloque1.indexOf('select count(*) as registros_con_texto')).trim().replace(/;$/,''))).rows;
  assert.equal(r.find(x=>x.texto_actual==='Renata').responsable_propuesto,'Renata Perez');
  assert.match(r.find(x=>x.texto_actual==='Fulano Raro').responsable_propuesto,/SIN EQUIVALENCIA/);
  assert.equal(Number(r.find(x=>x.texto_actual==='Fulano Raro').registros),2);
 }finally{await db.close();}
});
test('aborta nombrando un texto sin equivalencia',async()=>{
 const db=await base({extra:[['Fulano Raro',2]]});
 try{await assert.rejects(correr(db,CON_TEXTO+2),/Fulano Raro/);await db.exec('rollback');
  assert.equal(await cuenta(db,'responsable_id is not null'),0);
  assert.equal((await catalogo(db)).length,0);
 }finally{await db.close();}
});
test('aborta nombrando al usuario que falta o está duplicado',async()=>{
 for(const [usuarios,quien] of [[USUARIOS.filter(u=>u!=='Renata Perez'),'Renata Perez'],[[...USUARIOS,'Halim Simon'],'Halim Simon']]){
  const db=await base({usuarios});
  try{await assert.rejects(correr(db,CON_TEXTO),new RegExp(quien));await db.exec('rollback');
   assert.equal(await cuenta(db,'responsable_id is not null'),0);
   assert.equal((await catalogo(db)).length,0);
  }finally{await db.close();}
 }
});
test('aborta con el esperado en 0 o distinto, sin cambiar nada',async()=>{
 const db=await base();
 try{await assert.rejects(db.exec(bloque2),/Falta poner/);await db.exec('rollback');
  await assert.rejects(correr(db,CON_TEXTO+1),new RegExp(`esperabas ${CON_TEXTO+1}`));await db.exec('rollback');
  assert.equal(await cuenta(db,'responsable_id is not null'),0);
  assert.equal((await catalogo(db)).length,0);
 }finally{await db.close();}
});
test('es idempotente: una segunda corrida no duplica el catálogo ni las notas',async()=>{
 const db=await base();
 try{await correr(db,CON_TEXTO);const cat=await catalogo(db);
  await correr(db,CON_TEXTO);
  assert.deepEqual(await catalogo(db),cat);
  const notas=(await db.query('select notas from apertura_items where notas is not null order by notas')).rows.map(r=>r.notas);
  assert.deepEqual(notas,['TI: Sebastián','UVIE: Julio Verdeja']);
 }finally{await db.close();}
});
