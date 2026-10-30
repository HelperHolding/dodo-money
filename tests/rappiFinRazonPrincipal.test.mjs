import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const original=load('supabase/migrations/20261022190000_rappi_financiero.sql');
const migracion=load('supabase/migrations/20261030120000_rappi_fin_razon_principal.sql');
const pruebas=load('supabase/pruebas/20261030120000_rappi_fin_razon_principal.sql');

// Lo mínimo de Supabase, perfiles, sucursales y razones sociales (0068) que usa la importación financiera de Rappi.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum ('admin','corporativo','gerente');
 create table perfiles(id uuid primary key,rol rol_usuario,activo boolean,debe_cambiar_contrasena boolean default false);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1','admin',true,false);
 create function mi_rol() returns rol_usuario language sql stable as $$select rol from public.perfiles where id=auth.uid()$$;
 create function ve_compras() returns boolean language sql stable as $$select coalesce(public.mi_rol() in ('admin','corporativo'),false)$$;
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);
 insert into sucursales(nombre) values('Dodo La Calma (Dodo-1)');
 create table razones_sociales(rfc text primary key,razon_social text not null,principal boolean not null default false,activa boolean not null default true);
 create unique index razon_principal on razones_sociales(principal) where principal;
 create table razon_social_sucursales(rfc text not null references razones_sociales(rfc),sucursal_id uuid not null references sucursales(id),primary key(rfc,sucursal_id));
 insert into razones_sociales values('HCM260306B93','HELPER COMERCIALIZADORA MASTER',true,true),('CMS230321FI8','COMERCIALIZADORA MASTER SITRU',false,true);
 insert into razon_social_sucursales select 'CMS230321FI8',id from sucursales;
 grant select on perfiles,razones_sociales,razon_social_sucursales,sucursales to authenticated;
 create function public.razon_admite_sucursal(p_rfc text,p_sucursal uuid) returns boolean
 language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.razones_sociales e where e.rfc=p_rfc and e.activa and
  (e.principal or exists(select 1 from public.razon_social_sucursales s where s.rfc=e.rfc and s.sucursal_id=p_sucursal)))
 $$;
 revoke all on function public.razon_admite_sucursal(text,uuid) from public,anon,authenticated;`;

test('Rappi financiero: la prueba SQL de la razón principal termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);await db.exec(original);await db.exec(migracion);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});

test('Rappi financiero: antes de la migración la razón principal sin liga era rechazada',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);await db.exec(original);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/no autorizada/);return true;});
 }finally{await db.close();}
});
