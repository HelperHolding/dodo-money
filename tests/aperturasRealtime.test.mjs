import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const aperturas=load('supabase/migrations/0037_aperturas.sql');
const migracion=load('supabase/migrations/20261102180000_aperturas_realtime.sql');
const pruebas=load('supabase/pruebas/20261102180000_aperturas_realtime.sql');

// Lo mínimo de Supabase que usa 0037, más la publicación que Supabase crea en cada proyecto.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean,rol text);
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create table sucursales(id uuid primary key);create table ordenes_compra(id uuid primary key,sucursal_id uuid);create table facturas(id uuid primary key,sucursal_id uuid);`;

test('realtime de aperturas: la prueba SQL termina en PRUEBAS OK y la migración se puede repetir',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);await db.exec('create publication supabase_realtime');await db.exec(aperturas);
  await db.exec(migracion);await db.exec(migracion);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK/);return true;});
 }finally{await db.close();}
});
test('realtime de aperturas: sin la publicación de Supabase avisa en lugar de crear otra',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);await db.exec(aperturas);
  await assert.rejects(db.exec(migracion),/Falta la publicación supabase_realtime/);
 }finally{await db.close();}
});
