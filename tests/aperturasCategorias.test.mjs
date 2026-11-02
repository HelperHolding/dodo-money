import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const aperturas=load('supabase/migrations/0037_aperturas.sql');
const cargaInicial=load('supabase/cargas/0037_dodo_2.sql');
const presupuesto=load('supabase/cargas/dodo_2_presupuesto_20261013.sql');
const pruebasIniciales=load('supabase/pruebas/0037_aperturas.sql');
const migracion=load('supabase/migrations/20261102120000_aperturas_categorias.sql');
const carga=load('supabase/cargas/equipo_categorias_dodo_2.sql');
const pruebas=load('supabase/pruebas/20261102120000_aperturas_categorias.sql');

// Lo mínimo de Supabase, perfiles, sucursales y compras que usa 0037.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table auth.users(id uuid primary key,email text);insert into auth.users values('00000000-0000-0000-0000-0000000000a1','scervera@dodopizza.mx');
 create table perfiles(id uuid primary key,activo boolean,rol text,nombre text,debe_cambiar_contrasena boolean default false);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin','Admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo','Corporativo');
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);insert into sucursales(nombre) values('dodo-2');
 create table ordenes_compra(id uuid primary key,sucursal_id uuid);create table facturas(id uuid primary key,sucursal_id uuid);
 grant usage on schema auth to authenticated;grant select on perfiles to authenticated;`;
// Como en producción: carga inicial, presupuesto del 13/10 y después el cambio de nombre de la sucursal.
const preparar=async db=>{await db.exec(BASE);await db.exec(aperturas);await db.exec(cargaInicial);await db.exec(presupuesto);await db.exec(`update sucursales set nombre='Dodo Lopez Mateos (Dodo-2)'`);await db.exec(migracion);await db.exec(carga);};

test('categorías de apertura: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{await preparar(db);await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK/);return true;});}
 finally{await db.close();}
});
test('categorías de apertura: la prueba de 0037 sigue pasando con la nueva columna y la carga',async()=>{
 const db=new PGlite();
 try{await preparar(db);await db.exec(`update sucursales set nombre='dodo-2'`);await assert.rejects(db.exec(pruebasIniciales),e=>{assert.match(e.message,/^PRUEBAS OK/);return true;});}
 finally{await db.close();}
});
test('categorías de apertura: repetir la carga no duplica ni pisa el seguimiento',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);
  await db.exec(`update apertura_items set estado='pedido',responsable='Julio' where clave='ESP-06-001'`);
  await db.exec(carga);
  assert.equal((await db.query(`select count(*)::int n from apertura_items where clave like 'ESP-%'`)).rows[0].n,67);
  assert.equal((await db.query(`select count(*)::int n from apertura_items`)).rows[0].n,663+67);
  assert.deepEqual((await db.query(`select clave from apertura_items where categoria='baja_tension' order by clave`)).rows.map(r=>r.clave),['ESP-12-005','PRE26-HQ-086','PRE26-HQ-087','PRE26-HQ-088','PRE26-HQ-089','PRE26-HQ-090']);
  assert.deepEqual((await db.query(`select estado,responsable from apertura_items where clave='ESP-06-001'`)).rows[0],{estado:'pedido',responsable:'Julio'});
 }finally{await db.close();}
});
