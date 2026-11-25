import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Carga del presupuesto CAPEX de López Mateos (HD-3). Stubs con los CHECK reales de 0012, 0013, 0014 y 0037.
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261109180000_capex_aperturas.sql');
const carga=load('supabase/cargas/capex_presupuesto_guadalajara1_corte_20261013.sql');
const pruebas=load('supabase/pruebas/capex_presupuesto_guadalajara1_corte_20261013.sql');
const ADMIN='00000000-0000-0000-0000-0000000000a1',CORP='00000000-0000-0000-0000-0000000000c1';
const S1='10000000-0000-0000-0000-000000000001',S2='10000000-0000-0000-0000-000000000002';
const P1='20000000-0000-0000-0000-000000000001',P2='20000000-0000-0000-0000-000000000002';

const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean not null default true,rol text not null,nombre text);
 insert into perfiles values('${ADMIN}',true,'admin','Admin'),('${CORP}',true,'corporativo','Corporativo');
 create function ve_finanzas() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_finanzas() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('${S1}','Guadalajara-1 López Mateos'),('${S2}','Zapopan-1 La Calma');
 create type estado_orden as enum ('borrador','enviada','confirmada','cerrada','cancelada');
 create type tipo_factura as enum ('ingreso','egreso');
 create type estado_factura as enum ('por_pagar','parcial','pagada','cancelada');
 create table proveedores(id uuid primary key default gen_random_uuid(),razon_social text not null);
 create table ordenes_compra(id uuid primary key,folio text,proveedor_id uuid references proveedores(id),sucursal_id uuid references sucursales(id),estado estado_orden not null default 'borrador');
 create table orden_renglones(id uuid primary key default gen_random_uuid(),orden_id uuid not null references ordenes_compra(id),cantidad numeric(12,3) not null check(cantidad>0),precio numeric(14,4) not null default 0 check(precio>=0));
 create table facturas(id uuid primary key,uuid text not null unique,folio text,tipo tipo_factura not null,proveedor_id uuid references proveedores(id),sucursal_id uuid references sucursales(id),uuid_relacionado text,
  subtotal numeric(14,2) not null,descuento numeric(14,2) not null default 0,total numeric(14,2) not null check(total>=0),estado estado_factura not null default 'por_pagar');
 create table factura_ordenes(factura_id uuid not null references facturas(id),orden_id uuid not null references ordenes_compra(id),primary key(factura_id,orden_id));
 create table pagos(id uuid primary key default gen_random_uuid(),monto numeric(14,2) not null check(monto>0),anulado_en timestamptz);
 create table pago_aplicaciones(id bigserial primary key,pago_id uuid not null references pagos(id),factura_id uuid not null references facturas(id),monto numeric(14,2) not null check(monto>0),unique(pago_id,factura_id));
 create table apertura_proyectos(id uuid primary key,sucursal_id uuid not null unique references sucursales(id),responsable text not null,objetivo_desde date not null,objetivo_hasta date not null check(objetivo_hasta>=objetivo_desde),presupuesto numeric(16,2),revision integer not null default 1);
 insert into apertura_proyectos values('${P1}','${S1}','Julio','2026-11-01','2026-12-15',null,1);
 create table apertura_items(id uuid primary key default gen_random_uuid(),proyecto_id uuid not null references apertura_proyectos(id),tipo text not null,categoria text,nombre text not null default 'Item',orden_id uuid references ordenes_compra(id),factura_id uuid references facturas(id));
 create table inversion_apertura_fuentes(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),nombre text not null,fecha date not null,total numeric(16,2) not null,datos jsonb not null);
 grant usage on schema auth to authenticated;grant select on perfiles to authenticated;`;

async function preparar(){const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;}
const MONTOS={obra_civil:1325236.75,equipo_cocina:1226257.79,tecnologia:128000,mobiliario:19800,smallware:170586.8,proyecto_permisos:28500};

test('carga: crea la revisión 1 con el reparto del corte y el resto en 0',async()=>{
 const db=await preparar();
 try{
  await db.exec(carga);
  const f=(await db.query('select categoria,monto::float8 m,revision,motivo from capex_presupuestos where proyecto_id=$1 order by categoria',[P1])).rows;
  assert.equal(f.length,10);
  assert.ok(f.every(x=>x.revision===1&&x.motivo==='Corte del presupuesto del 13-oct-2026 (Dodo2_Presupuesto_Final.xlsx)'));
  for(const x of f)assert.equal(x.m,MONTOS[x.categoria]??0,x.categoria);
  assert.equal((await db.query('select sum(monto)::text s from capex_presupuestos where proyecto_id=$1',[P1])).rows[0].s,'2898381.34');
 }finally{await db.close();}
});

test('carga: correrla otra vez no crea otra revisión',async()=>{
 const db=await preparar();
 try{
  await db.exec(carga);await db.exec(carga);
  assert.equal((await db.query('select count(distinct revision)::int n from capex_presupuestos where proyecto_id=$1',[P1])).rows[0].n,1);
 }finally{await db.close();}
});

test('carga: aborta si hay dos aperturas de Guadalajara-1',async()=>{
 const db=await preparar();
 try{
  await db.query(`update sucursales set nombre='Guadalajara-1 Otra' where id=$1`,[S2]);
  await db.query(`insert into apertura_proyectos values($1,$2,'Julio','2026-12-01','2027-01-15',null,1)`,[P2,S2]);
  await assert.rejects(db.exec(carga),/Guadalajara-1/);
  assert.equal((await db.query('select count(*)::int n from capex_presupuestos')).rows[0].n,0);
 }finally{await db.close();}
});

test('carga: aborta si no hay apertura de Guadalajara-1',async()=>{
 const db=await preparar();
 try{
  await db.query(`update sucursales set nombre='Zapopan-9' where id=$1`,[S1]);
  await assert.rejects(db.exec(carga),/Guadalajara-1/);
 }finally{await db.close();}
});

test('carga: el script de pruebas termina en PRUEBAS OK y no deja cambios',async()=>{
 const db=await preparar();
 try{
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK/);return true;});
  assert.equal((await db.query('select count(*)::int n from capex_presupuestos')).rows[0].n,0);
  await db.exec(carga);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK — ya existía presupuesto \(revisión 1\)/);return true;});
 }finally{await db.close();}
});
