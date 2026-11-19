import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261119120000_grok_mcp.sql');
const pruebas=load('supabase/pruebas/20261119120000_grok_mcp.sql');

// Lo mínimo de Supabase: roles, auth.uid(), el enum real de roles, perfiles y kb_activo/kb_admin copiados de 0039.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum ('operacion','encargado','gerente','admin','corporativo','marketing');
 create table perfiles(id uuid primary key,nombre text not null default 'Ensayo',rol rol_usuario not null default 'operacion',sucursal_id uuid,activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles(id,rol,sucursal_id) values('00000000-0000-0000-0000-0000000000a1','admin',null),('00000000-0000-0000-0000-0000000000c1','corporativo',null),('00000000-0000-0000-0000-0000000000e1','gerente','00000000-0000-0000-0000-0000000000f1');
 create function public.kb_activo() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena)
 $$;
 create function public.kb_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena and rol::text='admin')
 $$;
 grant select on perfiles to authenticated;`;

test('Grok MCP: la prueba SQL termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);await db.exec(migracion);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});

test('Grok MCP: sin la migración la prueba SQL no pasa',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await assert.rejects(db.exec(pruebas),e=>{assert.doesNotMatch(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});
