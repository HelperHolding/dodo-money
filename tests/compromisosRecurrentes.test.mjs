import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261028180000_compromisos_recurrentes.sql');
const pruebas=load('supabase/pruebas/20261028180000_compromisos_recurrentes.sql');
const retenciones=load('supabase/migrations/20261029120000_compromisos_retenciones.sql');
const pruebasRetenciones=load('supabase/pruebas/20261029120000_compromisos_retenciones.sql');
const cumplimiento=load('supabase/migrations/20261029150000_calendario_cumplimiento.sql');
const internet=load('supabase/migrations/20261104120000_compromisos_internet_monto_variable.sql');
const pruebasInternet=load('supabase/pruebas/20261104120000_compromisos_internet_monto_variable.sql');
const extractor=load('supabase/migrations/20261109180000_compromisos_extractor_minisplits.sql');
const pruebasExtractor=load('supabase/pruebas/20261109180000_compromisos_extractor_minisplits.sql');

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

// La migración de internet y monto variable reemplaza cumplimiento_en_rango: necesita el calendario de cumplimiento y lo
// que lee (copiado de tests/calendarioCumplimiento.test.mjs).
const BASE_CUMPLIMIENTO=`create table auth.users(id uuid primary key,email text);
 alter table sucursales add column nombre text;
 create table razones_sociales(rfc text primary key check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),razon_social text not null);
 alter table facturas add column rfc_receptor text;
 create or replace view facturas_saldo as select id,tipo,estado,proveedor_id,sucursal_id,saldo,rfc_receptor from facturas;
 create table activos(id uuid primary key,nombre text not null,sucursal_id uuid);
 create table activo_mantenimientos (
  id uuid primary key default gen_random_uuid(),activo_id uuid not null references activos(id),
  tipo text not null check(tipo in ('preventivo','correctivo')),tarea text not null check(length(trim(tarea)) between 5 and 1000),
  programado date not null,estado text not null default 'pendiente' check(estado in ('pendiente','completado','anulado')),
  realizado date,costo numeric(16,2) check(costo>=0 and costo<1e12),tecnico text,evidencia text,
  revision integer not null default 1,creado_en timestamptz not null default now(),
  check(estado<>'completado' or (realizado is not null and costo is not null and length(trim(coalesce(evidencia,'')))>=5)),
  check(estado<>'anulado' or length(trim(coalesce(evidencia,'')))>=5));`;
const ADMIN=`select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false)`;
async function montarTodo(){
 const db=new PGlite();
 await db.exec(BASE);await db.exec(BASE_CUMPLIMIENTO);
 await db.exec(migracion);await db.exec(retenciones);await db.exec(cumplimiento);await db.exec(internet);await db.exec(extractor);
 return db;
}

test('compromisos: internet y monto variable — la prueba SQL termina en PRUEBAS OK y las anteriores siguen pasando',async()=>{
 const db=await montarTodo();
 try{
  for(const p of [pruebasInternet,pruebasRetenciones,pruebas])
   await assert.rejects(db.exec(p),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});

test('compromisos: concepto internet y teléfono; uno desconocido, rechazado',async()=>{
 const db=await montarTodo();
 try{
  const ins=c=>db.exec(`insert into compromisos(sucursal_id,concepto,proveedor_id,monto_estimado,forma_pago,unidad,cada,dia_mes,inicio,requiere_servicio,creado_por)
   values('00000000-0000-0000-0000-0000000000e1','${c}','00000000-0000-0000-0000-0000000000b1',100,'efectivo','mes',1,1,'2027-01-01',false,'00000000-0000-0000-0000-0000000000a1')`);
  await ins('internet');await ins('telefono');
  await assert.rejects(ins('agua'),/compromisos_concepto/);
  assert.equal((await db.query(`select count(*)::int n from pg_constraint where conrelid='compromisos'::regclass and pg_get_constraintdef(oid) like '%fumigacion%'`)).rows[0].n,1);
 }finally{await db.close();}
});

test('compromisos: monto variable — sin monto solo si es variable; se puede cambiar al editar',async()=>{
 const db=await montarTodo();
 try{
  await db.exec(ADMIN);
  const datos=x=>JSON.stringify({sucursal_id:'00000000-0000-0000-0000-0000000000e1',concepto:'telefono',descripcion:'',proveedor_id:'00000000-0000-0000-0000-0000000000b1',monto_estimado:'',forma_pago:'transferencia',unidad:'mes',cada:'1',dia_mes:'5',inicio:'2027-01-05',fin:'',requiere_servicio:'false',iva:'0.16',ret_iva:'dos_tercios',ret_isr:'diez',...x});
  await assert.rejects(db.query(`select public.guardar_compromiso(null,0,$1::jsonb)`,[datos({})]),/monto/);
  const {rows:[{id}]}=await db.query(`select public.guardar_compromiso(null,0,$1::jsonb) id`,[datos({monto_variable:'true',monto_estimado:'500'})]);
  const leer=async()=>(await db.query(`select monto_variable,monto_estimado,iva::float iva,ret_iva,ret_isr,revision from compromisos where id=$1`,[id])).rows[0];
  assert.deepEqual(await leer(),{monto_variable:true,monto_estimado:null,iva:0,ret_iva:'ninguna',ret_isr:'ninguna',revision:1});
  await db.query(`select public.guardar_compromiso($1,1,$2::jsonb)`,[id,datos({monto_variable:'false',monto_estimado:'650',ret_iva:'ninguna',ret_isr:'ninguna'})]);
  const fijo=await leer();assert.equal(fijo.monto_variable,false);assert.equal(Number(fijo.monto_estimado),650);assert.equal(fijo.iva,0.16);assert.equal(fijo.revision,2);
  await assert.rejects(db.exec(`update compromisos set monto_estimado=null where id='${id}'`),/compromisos_monto_variable/);
 }finally{await db.close();}
});

test('compromisos: extractor y minisplits — la prueba SQL termina en PRUEBAS OK y las anteriores siguen pasando',async()=>{
 const db=await montarTodo();
 try{
  for(const p of [pruebasExtractor,pruebasInternet,pruebasRetenciones,pruebas])
   await assert.rejects(db.exec(p),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
  assert.equal((await db.query(`select count(*)::int n from pg_constraint where conrelid='compromisos'::regclass and pg_get_constraintdef(oid) like '%fumigacion%'`)).rows[0].n,1);
 }finally{await db.close();}
});
