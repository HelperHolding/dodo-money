import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261028180000_compromisos_recurrentes.sql');
const pruebas=load('supabase/pruebas/20261028180000_compromisos_recurrentes.sql');
const retenciones=load('supabase/migrations/20261029120000_compromisos_retenciones.sql');
const pruebasRetenciones=load('supabase/pruebas/20261029120000_compromisos_retenciones.sql');

// Lo mínimo de Supabase y de Compras que usa la migración; la prueba SQL que corre Sebastián se ejecuta completa.
const BASE=`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean,rol text);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo');
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create function exigir_admin_compras() returns void language plpgsql as $$begin if not public.edita_compras() then raise exception 'Solo administración.';end if;end$$;
 create function hoy_mx() returns date language sql stable as $$select current_date$$;
 create type forma_pago as enum('transferencia','efectivo','tarjeta','cheque');
 create table sucursales(id uuid primary key);insert into sucursales values('00000000-0000-0000-0000-0000000000e1');
 create table proveedores(id uuid primary key);insert into proveedores values('00000000-0000-0000-0000-0000000000b1'),('00000000-0000-0000-0000-0000000000b2');
 create type estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create table facturas(id uuid primary key,tipo text,estado estado_factura,proveedor_id uuid,sucursal_id uuid,sustituido_por uuid,saldo numeric,motivo_cancelacion text,
  check (estado <> 'cancelada' or coalesce(trim(motivo_cancelacion), '') <> ''));
 create table factura_recepciones(id uuid primary key,factura_id uuid,anulada_en timestamptz);
 insert into facturas values('00000000-0000-0000-0000-0000000000f1','ingreso','por_pagar','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1',null,45000),
  ('00000000-0000-0000-0000-0000000000f2','ingreso','por_pagar','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e1',null,100);
 create view facturas_saldo as select id,tipo,estado,proveedor_id,sucursal_id,saldo from facturas;
 create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`;

test('compromisos recurrentes: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await db.exec(migracion);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});

test('compromisos recurrentes: solo lectura para la app',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await db.exec(migracion);
  for(const t of ['compromisos','compromiso_fechas','compromiso_historial'])
   assert.equal((await db.query(`select has_table_privilege('authenticated','${t}','insert') ok`)).rows[0].ok,false);
 }finally{await db.close();}
});

test('compromisos: retenciones — la prueba SQL termina en PRUEBAS OK y la primera sigue pasando',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await db.exec(migracion);
  await db.exec(retenciones);
  await assert.rejects(db.exec(pruebasRetenciones),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});
