import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261109200000_aperturas_colores.sql');
const pruebas=load('supabase/pruebas/20261109200000_aperturas_colores.sql');

// Lo mínimo de Supabase y perfiles que usa la migración (mismos roles que 0011).
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean,rol text,nombre text);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin','Admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo','Corporativo');
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;`;

test('colores de apertura: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{await db.exec(BASE);await db.exec(migracion);await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK/);return true;});}
 finally{await db.close();}
});
test('colores de apertura: PRUEBAS OK no deja colores guardados',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);await db.exec(migracion);await db.exec(pruebas).catch(()=>{});
  assert.equal((await db.query('select count(*)::int n from apertura_colores')).rows[0].n,0);
 }finally{await db.close();}
});
