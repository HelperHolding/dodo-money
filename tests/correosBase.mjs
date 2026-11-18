// Lo mínimo de Supabase para correos. Enums y checks copian los reales (0001, 0004, 0008).
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
export const BASE=`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create type rol_usuario as enum('operacion','encargado','gerente','admin','corporativo');
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Zapopan-1');
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null,sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 alter table perfiles add constraint perfiles_corporativo_sin_sucursal check ((rol::text = 'corporativo') = (sucursal_id is null));
 insert into perfiles values
  ('00000000-0000-0000-0000-0000000000a1','Julio','admin','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000c1','Halim','corporativo',null,true,false),
  ('00000000-0000-0000-0000-0000000000d0','Gerente Z','gerente','00000000-0000-0000-0000-0000000000e1',true,false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 grant execute on function mi_rol() to authenticated;`;
export const U={admin:'00000000-0000-0000-0000-0000000000a1',corp:'00000000-0000-0000-0000-0000000000c1',gerente:'00000000-0000-0000-0000-0000000000d0',mkt:'00000000-0000-0000-0000-0000000000b7'};
// Como en Supabase: las pruebas corren con el rol authenticated (aplica RLS) o service_role (n8n/seguimiento).
export const como=async(db,id)=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);await db.exec('set role authenticated');};
export const servicio=async(db)=>{await db.exec('reset role');await db.query(`select set_config('request.jwt.claims','',false)`);await db.exec('set role service_role');};
// La migración real menos las funciones de invitación (sus tablas no existen en el stub): se cortan entre marcas.
export const migracion=()=>load('supabase/migrations/20261109120000_correos_marketing.sql').replace(/-- <invitaciones>[\s\S]*?-- <\/invitaciones>/,'');
export const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion());
 await db.exec(`insert into perfiles values('${U.mkt}','Mariana','marketing',null,true,false)`);return db;};
