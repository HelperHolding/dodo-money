import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261102200000_pl_ajustes.sql');
const pruebas=load('supabase/pruebas/20261102200000_pl_ajustes.sql');

// Lo mínimo de Supabase y de 0025 (ve_finanzas, edita_finanzas) que usa la migración; los CHECK y enums copian los reales.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum('cajero','encargado','gerente','admin','corporativo');
 create table perfiles(id uuid primary key,activo boolean not null default true,rol rol_usuario,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles(id,rol) values('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000c1','corporativo');
 create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function ve_finanzas() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text in ('admin','corporativo'),false)$$;
 create function edita_finanzas() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text='admin',false)$$;
 create table sucursales(id uuid primary key,nombre text);insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Centro');`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;};
const como=(db,sub)=>db.query(`select set_config('request.jwt.claims','{"sub":"${sub}","role":"authenticated"}',false)`);
const SUC='00000000-0000-0000-0000-0000000000e1';

test('ajustes del P&L: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('ajustes del P&L: solo lectura para la app y RPC solo para autenticados',async()=>{
 const db=await nueva();
 try{
  for(const p of ['insert','update','delete'])
   assert.equal((await db.query(`select has_table_privilege('authenticated','pl_ajustes','${p}') ok`)).rows[0].ok,false,p);
  assert.equal((await db.query(`select has_table_privilege('authenticated','pl_ajustes','select') ok`)).rows[0].ok,true);
  for(const f of ['guardar_ajuste_pl(uuid,uuid,date,text,text,numeric,text)','anular_ajuste_pl(uuid,text)']){
   assert.equal((await db.query(`select has_function_privilege('anon','${f}','execute') ok`)).rows[0].ok,false,f);
   assert.equal((await db.query(`select has_function_privilege('authenticated','${f}','execute') ok`)).rows[0].ok,true,f);
  }
 }finally{await db.close();}
});

test('ajustes del P&L: corporativo lee pero no captura ni anula',async()=>{
 const db=await nueva();
 try{
  await como(db,'00000000-0000-0000-0000-0000000000a1');
  const id=(await db.query("select public.guardar_ajuste_pl(gen_random_uuid(),$1::uuid,date '2026-10-01','marketing','tope_pct',0.05,'Inauguración: solo el 5') id",[SUC])).rows[0].id;
  await como(db,'00000000-0000-0000-0000-0000000000c1');
  await assert.rejects(db.query("select public.guardar_ajuste_pl(gen_random_uuid(),$1::uuid,date '2026-10-01','renta','monto',-10,'Nota de corporativo')",[SUC]),/Solo administración/);
  await assert.rejects(db.query("select public.anular_ajuste_pl($1::uuid,'motivo de prueba')",[id]),/Solo administración/);
  await db.exec('set role authenticated');
  assert.equal((await db.query('select count(*)::int n from public.pl_ajustes')).rows[0].n,1);
 }finally{await db.close();}
});

test('ajustes del P&L: el mes empieza en octubre 2026',async()=>{
 const db=await nueva();
 try{
  await como(db,'00000000-0000-0000-0000-0000000000a1');
  await assert.rejects(db.query("select public.guardar_ajuste_pl(gen_random_uuid(),$1::uuid,date '2026-09-01','marketing','tope_pct',0.05,'Inauguración: solo el 5')",[SUC]),/El mes/);
 }finally{await db.close();}
});
