import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261103120000_acepta_como_corporativo.sql');
const pruebas=load('supabase/pruebas/20261103120000_acepta_como_corporativo.sql');

// Lo mínimo de 0001, 0016 y 0063 que usan las funciones; los CHECK, enums y el disparador de conteo copian los reales.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum('operacion','encargado','gerente','admin','corporativo');
 create type estado_movimiento as enum('pendiente','confirmado','rechazado');
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null unique);
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null,sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles(id,nombre,rol) values('00000000-0000-0000-0000-0000000000a1','Admin uno','admin'),('00000000-0000-0000-0000-0000000000a2','Admin dos','admin'),
  ('00000000-0000-0000-0000-0000000000c1','Corporativo','corporativo'),('00000000-0000-0000-0000-0000000000d1','Gerente','gerente');
 create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create table cajas(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),tipo text not null,nombre text not null,saldo_inicial numeric(12,2) not null default 0);
 create table movimientos(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),tipo text not null,caja_origen_id uuid not null references cajas(id),caja_destino_id uuid not null references cajas(id),
  monto numeric(12,2) not null check(monto>0),folio text,nota text,estado estado_movimiento not null default 'pendiente',registrado_por uuid not null references perfiles(id),confirmado_por uuid references perfiles(id),confirmado_en timestamptz,creado_en timestamptz not null default now(),
  recepcion text check(recepcion in ('aceptada','rechazada')),recibido_por uuid references perfiles(id),recibido_en timestamptz,nota_recepcion text,recoleccion_id uuid,
  check(caja_origen_id<>caja_destino_id),check(confirmado_por is null or confirmado_por<>registrado_por),
  constraint recepcion_solo_salidas check(recepcion is null or (tipo='salida_corporativo' and estado='confirmado')),
  constraint recepcion_rechazada_con_motivo check(recepcion is distinct from 'rechazada' or coalesce(trim(nota_recepcion),'')<>''));
 create table recolecciones_corporativo(id uuid primary key references movimientos(id),sucursal_id uuid not null references sucursales(id),desde date not null,hasta date not null check(hasta>=desde),
  expediente jsonb not null,creado_por uuid not null references perfiles(id),creado_en timestamptz not null default now(),contado_corporativo numeric(12,2),recibido_por uuid references perfiles(id),recibido_en timestamptz,nota_recepcion text);
 create function public.exigir_conteo_recoleccion() returns trigger language plpgsql security definer set search_path=public as $$
 begin
  if new.recepcion is not null and exists(select 1 from public.recolecciones_corporativo where id=new.id and contado_corporativo is null) then raise exception 'Recibe esta entrega desde su expediente de recolección, con el conteo real.';end if;
  return new;
 end $$;
 create trigger exigir_conteo_recoleccion before update of recepcion on public.movimientos for each row execute function public.exigir_conteo_recoleccion();`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;};

test('acepta como corporativo: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('acepta como corporativo: la bandera nace apagada y la app puede consultar el permiso',async()=>{
 const db=await nueva();
 try{
  assert.equal((await db.query('select count(*)::int n from perfiles where acepta_como_corporativo')).rows[0].n,0);
  assert.equal((await db.query(`select has_function_privilege('authenticated','public.puede_recibir_en_corporativo()','execute') ok`)).rows[0].ok,true);
 }finally{await db.close();}
});
