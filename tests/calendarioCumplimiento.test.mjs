import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const compromisos=load('supabase/migrations/20261028180000_compromisos_recurrentes.sql');
const retenciones=load('supabase/migrations/20261029120000_compromisos_retenciones.sql');
const migracion=load('supabase/migrations/20261029150000_calendario_cumplimiento.sql');
const pruebas=load('supabase/pruebas/20261029150000_calendario_cumplimiento.sql');

// Lo mínimo de Supabase, Compras y Activos que usan las migraciones. Los checks copian los reales (0038, 0068).
export const BASE=`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table auth.users(id uuid primary key,email text);
 create table perfiles(id uuid primary key,activo boolean,rol text);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo'),('00000000-0000-0000-0000-0000000000a2',false,'admin');
 insert into auth.users values('00000000-0000-0000-0000-0000000000a1','julio@ejemplo.mx'),('00000000-0000-0000-0000-0000000000c1','halim@ejemplo.mx'),('00000000-0000-0000-0000-0000000000a2','baja@ejemplo.mx');
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create function exigir_admin_compras() returns void language plpgsql as $$begin if not public.edita_compras() then raise exception 'Solo administración.';end if;end$$;
 create function hoy_mx() returns date language sql stable as $$select current_date$$;
 create type forma_pago as enum('transferencia','efectivo','tarjeta','cheque');
 create table sucursales(id uuid primary key,nombre text);insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Zapopan-1');
 create table razones_sociales(rfc text primary key check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),razon_social text not null);
 insert into razones_sociales values('CMS230321FI8','COMERCIALIZADORA MASTER SITRU');
 create table proveedores(id uuid primary key);insert into proveedores values('00000000-0000-0000-0000-0000000000b1'),('00000000-0000-0000-0000-0000000000b2');
 create type estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create table facturas(id uuid primary key,tipo text,estado estado_factura,proveedor_id uuid,sucursal_id uuid,rfc_receptor text,sustituido_por uuid,saldo numeric,motivo_cancelacion text,
  check (estado <> 'cancelada' or coalesce(trim(motivo_cancelacion), '') <> ''));
 create table factura_recepciones(id uuid primary key,factura_id uuid,anulada_en timestamptz);
 insert into facturas values('00000000-0000-0000-0000-0000000000f1','ingreso','por_pagar','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','CMS230321FI8',null,45000),
  ('00000000-0000-0000-0000-0000000000f2','ingreso','por_pagar','00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000e1','CMS230321FI8',null,100),
  ('00000000-0000-0000-0000-0000000000f3','ingreso','por_pagar','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','CMS230321FI8',null,900);
 create view facturas_saldo as select id,tipo,estado,proveedor_id,sucursal_id,rfc_receptor,saldo from facturas;
 create table activos(id uuid primary key,nombre text not null,sucursal_id uuid);
 insert into activos values('00000000-0000-0000-0000-0000000000d1','Horno de cocina','00000000-0000-0000-0000-0000000000e1');
 create table activo_mantenimientos (
  id uuid primary key default gen_random_uuid(),activo_id uuid not null references activos(id),
  tipo text not null check(tipo in ('preventivo','correctivo')),tarea text not null check(length(trim(tarea)) between 5 and 1000),
  programado date not null,estado text not null default 'pendiente' check(estado in ('pendiente','completado','anulado')),
  realizado date,costo numeric(16,2) check(costo>=0 and costo<1e12),tecnico text,evidencia text,
  revision integer not null default 1,creado_en timestamptz not null default now(),
  check(estado<>'completado' or (realizado is not null and costo is not null and length(trim(coalesce(evidencia,'')))>=5)),
  check(estado<>'anulado' or length(trim(coalesce(evidencia,'')))>=5));
 create table storage.objects(bucket_id text,name text,metadata jsonb);alter table storage.objects enable row level security;`;

export async function montar(){
 const db=new PGlite();
 await db.exec(BASE);await db.exec(compromisos);await db.exec(retenciones);await db.exec(migracion);
 return db;
}

test('cumplimiento: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await montar();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('cumplimiento: la app solo lee las tablas',async()=>{
 const db=await montar();
 try{
  for(const t of ['cumplimiento_obligaciones','cumplimiento_fechas','cumplimiento_historial','cumplimiento_avisos_enviados'])
   for(const p of ['insert','update','delete'])
    assert.equal((await db.query(`select has_table_privilege('authenticated','${t}','${p}') ok`)).rows[0].ok,false,`${t} ${p}`);
 }finally{await db.close();}
});

const ADMIN=`select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}',false)`;

test('cumplimiento: la evidencia se confirma solo si el archivo existe con el mismo tamaño y tipo',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  const {rows:[{id:o}]}=await db.query(`select public.guardar_obligacion(null,0,'{"tipo":"permiso","nombre":"Uso de suelo","sucursal_id":"00000000-0000-0000-0000-0000000000e1","frecuencia":"anual","inicio":"2027-01-10","con_pago":"false"}'::jsonb) id`);
  const ev='00000000-0000-0000-0000-00000000ee01';
  const {rows:[{r}]}=await db.query(`select public.preparar_evidencia_cumplimiento('${ev}','${o}','2027-01-10','uso.pdf','pdf','application/pdf',2000,repeat('b',64)) r`);
  assert.equal(r.disponible,false);assert.match(r.ruta,/^cumplimiento\/[0-9a-f-]{36}\/0{8}-0{4}-0{4}-0{4}-00000000ee01\.pdf$/);
  await assert.rejects(db.exec(`select public.confirmar_evidencia_cumplimiento('${ev}')`),/no está subido/);
  await db.query(`insert into storage.objects values('adjuntos-compras',$1,'{"size":"2000","mimetype":"application/pdf"}')`,[r.ruta]);
  await db.exec(`select public.confirmar_evidencia_cumplimiento('${ev}')`);
  assert.ok((await db.query(`select confirmado_en from cumplimiento_evidencias where id='${ev}'`)).rows[0].confirmado_en);
 }finally{await db.close();}
});

test('cumplimiento: al sustituir un gasto sin CFDI por su CFDI la liga pasa al CFDI',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  const {rows:[{id:o}]}=await db.query(`select public.guardar_obligacion(null,0,'{"tipo":"seguro","nombre":"Póliza","sucursal_id":"00000000-0000-0000-0000-0000000000e1","frecuencia":"anual","inicio":"2027-01-10","con_pago":"true","proveedor_id":"00000000-0000-0000-0000-0000000000b1"}'::jsonb) id`);
  await db.exec(`select public.ligar_factura_cumplimiento('${o}','2027-01-10',0,'00000000-0000-0000-0000-0000000000f1')`);
  await db.exec(`update facturas set sustituido_por='00000000-0000-0000-0000-0000000000f3' where id='00000000-0000-0000-0000-0000000000f1'`);
  assert.equal((await db.query(`select factura_id from cumplimiento_fechas where obligacion_id='${o}'`)).rows[0].factura_id,'00000000-0000-0000-0000-0000000000f3');
 }finally{await db.close();}
});

test('cumplimiento: la factura de una obligación de razón social debe ser de ese RFC receptor',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  await db.exec(`update facturas set rfc_receptor=null where id='00000000-0000-0000-0000-0000000000f3'`);
  const {rows:[{id:o}]}=await db.query(`select public.guardar_obligacion(null,0,'{"tipo":"tramite_fiscal","nombre":"Declaración anual","razon_social_rfc":"CMS230321FI8","frecuencia":"anual","inicio":"2027-03-31","con_pago":"true","proveedor_id":"00000000-0000-0000-0000-0000000000b1"}'::jsonb) id`);
  await assert.rejects(db.exec(`select public.ligar_factura_cumplimiento('${o}','2027-03-31',0,'00000000-0000-0000-0000-0000000000f3')`),/razón social/);
  await db.exec(`select public.ligar_factura_cumplimiento('${o}','2027-03-31',0,'00000000-0000-0000-0000-0000000000f1')`);
 }finally{await db.close();}
});
