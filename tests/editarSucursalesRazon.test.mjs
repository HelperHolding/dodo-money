import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261118120000_editar_sucursales_razon_social.sql');
const pruebas=load('supabase/pruebas/20261118120000_editar_sucursales_razon_social.sql');

// Lo mínimo de Supabase, roles de compras y razones sociales (0068) que usa la edición de sucursales.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum ('admin','corporativo','gerente');
 create table perfiles(id uuid primary key,rol rol_usuario,activo boolean,debe_cambiar_contrasena boolean default false);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1','admin',true,false),('00000000-0000-0000-0000-0000000000c1','corporativo',true,false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path=public as $$select rol from public.perfiles where id=auth.uid()$$;
 create function edita_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text='admin',false)$$;
 create function exigir_admin_compras() returns void language plpgsql stable security definer set search_path=public as $$
 begin
  if mi_rol()::text='corporativo' then raise exception 'Corporativo solo puede consultar.';end if;
  if not edita_compras() then raise exception 'Solo un administrador maneja compras.';end if;
 end $$;
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);
 create table razones_sociales(rfc text primary key check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),razon_social text not null,principal boolean not null default false,activa boolean not null default true);
 create unique index razon_principal on razones_sociales(principal) where principal;
 create table razon_social_sucursales(rfc text not null references razones_sociales(rfc),sucursal_id uuid not null references sucursales(id),primary key(rfc,sucursal_id));
 create table razones_sociales_historial(id bigint generated always as identity primary key,rfc text not null references razones_sociales,datos jsonb not null,usuario_id uuid not null references perfiles(id),creado_en timestamptz not null default now());
 insert into razones_sociales values('HCM260306B93','HELPER COMERCIALIZADORA MASTER',true,true);
 revoke all on razones_sociales,razon_social_sucursales,razones_sociales_historial from public,anon,authenticated;
 grant select on perfiles,sucursales,razones_sociales,razon_social_sucursales,razones_sociales_historial to authenticated;
 grant insert on sucursales to authenticated;`;

test('Razones sociales: la prueba SQL de editar sucursales termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);await db.exec(migracion);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});

test('Razones sociales: sin la migración la prueba SQL no pasa',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await assert.rejects(db.exec(pruebas),e=>{assert.doesNotMatch(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});
