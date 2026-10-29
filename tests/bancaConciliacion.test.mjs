import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const banregio=load('supabase/migrations/20261020230000_banca_banregio.sql');
const migracion=load('supabase/migrations/20261029200000_banca_conciliacion.sql');
const pruebas=load('supabase/pruebas/20261029200000_banca_conciliacion.sql');

// Lo mínimo de Supabase, Compras, Ventas, Rappi y Nómina que usan las migraciones; los CHECK y enums copian los reales.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum('cajero','encargado','gerente','admin','corporativo');
 create table perfiles(id uuid primary key,activo boolean not null default true,rol rol_usuario,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles(id,rol) values('00000000-0000-0000-0000-0000000000a1','admin'),('00000000-0000-0000-0000-0000000000c1','corporativo');
 create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function ve_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text in ('admin','corporativo'),false)$$;
 create table sucursales(id uuid primary key,nombre text);insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Centro');
 create table razones_sociales(rfc text primary key,razon_social text not null check(length(trim(razon_social))>0),activa boolean not null default true);
 insert into razones_sociales values('AAA010101AA1','EMPRESA DE PRUEBA',true);
 create table razon_social_sucursales(rfc text not null references razones_sociales(rfc),sucursal_id uuid not null references sucursales(id),primary key(rfc,sucursal_id));
 insert into razon_social_sucursales values('AAA010101AA1','00000000-0000-0000-0000-0000000000e1');
 create type forma_pago as enum('transferencia','efectivo','tarjeta','cheque');
 create table proveedores(id uuid primary key,clabe text);insert into proveedores values('00000000-0000-0000-0000-0000000000b1','002320000000000001');
 create table pagos(id uuid primary key default gen_random_uuid(),proveedor_id uuid not null references proveedores(id),fecha date not null,monto numeric(14,2) not null check(monto>0),forma forma_pago not null,anulado_en timestamptz);
 insert into pagos(proveedor_id,fecha,monto,forma) values('00000000-0000-0000-0000-0000000000b1','2026-10-06',4515.25,'transferencia');
 create table ventas_dia(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),fecha date not null,tarjeta numeric(12,2) not null default 0,unique(sucursal_id,fecha));
 insert into ventas_dia(sucursal_id,fecha,tarjeta) values('00000000-0000-0000-0000-0000000000e1','2026-10-05',2674);
 create table rappi_fin_importaciones(id uuid primary key,sucursal_id uuid not null references sucursales(id),rfc text not null references razones_sociales(rfc),reporte jsonb not null check(jsonb_typeof(reporte)='object'),sustituida_en timestamptz);
 insert into rappi_fin_importaciones values('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000e1','AAA010101AA1','{"movimientos":[{"lote":"123456","neto":5000},{"lote":"123456","neto":843.11},{"lote":null,"neto":10}]}',null);
 create table nomina_reales(id uuid primary key default gen_random_uuid(),anulada_en timestamptz);`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(banregio);await db.exec(migracion);return db;};

test('conciliación bancaria: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('conciliación bancaria: solo lectura para la app y RPC solo para autenticados',async()=>{
 const db=await nueva();
 try{
  for(const t of ['banca_conciliaciones','banca_conciliacion_movimientos','banca_conciliacion_documentos'])
   for(const p of ['insert','update','delete'])
    assert.equal((await db.query(`select has_table_privilege('authenticated','${t}','${p}') ok`)).rows[0].ok,false,`${t} ${p}`);
  assert.equal((await db.query(`select has_function_privilege('anon','conciliar_banca(uuid,uuid[],text,text,jsonb,text)','execute') ok`)).rows[0].ok,false);
  assert.equal((await db.query(`select has_function_privilege('authenticated','conciliar_banca(uuid,uuid[],text,text,jsonb,text)','execute') ok`)).rows[0].ok,true);
 }finally{await db.close();}
});
