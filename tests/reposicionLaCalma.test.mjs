import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const corr=load('supabase/correcciones/2026-11-17_reposicion_caja_chica_la_calma.sql');
const prueba=load('supabase/pruebas/2026-11-17_reposicion_caja_chica_la_calma.sql');
const LC='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e',SEB='aaaaaaaa-0000-0000-0000-000000000001';

// Copia de las columnas, enums y CHECK reales de movimientos (0001) y gastos_caja_chica.
async function nueva({extra=''}={}){
 const db=new PGlite();
 await db.exec(`create schema auth; create table auth.users(id uuid primary key,email text);
 create type public.tipo_caja as enum('boveda','venta','cambios','caja_chica','corporativo');
 create type public.tipo_movimiento as enum('apertura','retiro_boveda','cambio_morralla','deposito_banco','reposicion_caja_chica','salida_corporativo');
 create type public.estado_movimiento as enum('pendiente','confirmado','rechazado');
 create type public.origen_gasto as enum('caja_chica','boveda','empleado');
 create table public.perfiles(id uuid primary key,rol text,activo boolean,debe_cambiar_contrasena boolean);
 create table public.cajas(id uuid primary key default gen_random_uuid(),sucursal_id uuid,tipo public.tipo_caja);
 create table public.movimientos(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null,turno_id uuid,tipo public.tipo_movimiento not null,
  caja_origen_id uuid not null references public.cajas(id),caja_destino_id uuid not null references public.cajas(id),monto numeric(12,2) not null check(monto>0),
  folio text,nota text,estado public.estado_movimiento not null default 'pendiente',registrado_por uuid not null references public.perfiles(id),
  confirmado_por uuid references public.perfiles(id),confirmado_en timestamptz,creado_en timestamptz not null default now(),
  check(caja_origen_id<>caja_destino_id),check(confirmado_por is null or confirmado_por<>registrado_por));
 create table public.gastos_caja_chica(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null,fecha date,concepto text,proveedor text,
  monto numeric(12,2),origen public.origen_gasto,informativo boolean not null default false,anulado_en timestamptz,creado_en timestamptz not null);
 insert into auth.users values('${SEB}','scervera@dodopizza.mx');
 insert into public.perfiles values('${SEB}','admin',true,false),('aaaaaaaa-0000-0000-0000-000000000002','gerente',true,false);
 insert into public.cajas(sucursal_id,tipo) values('${LC}','corporativo'),('${LC}','caja_chica');
 insert into public.movimientos(sucursal_id,tipo,caja_origen_id,caja_destino_id,monto,estado,registrado_por,confirmado_por,creado_en)
  select '${LC}','reposicion_caja_chica',(select id from public.cajas where tipo='corporativo'),(select id from public.cajas where tipo='caja_chica'),500,'confirmado','${SEB}','aaaaaaaa-0000-0000-0000-000000000002','2026-10-30 12:00-06';
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,proveedor,monto,origen,informativo,anulado_en,creado_en) values
  ('${LC}','2026-10-29','Anterior','X',500,'caja_chica',false,null,'2026-10-29 10:00-06'),
  ('${LC}','2026-11-01','Varios','X',6600.59,'caja_chica',false,null,'2026-11-01 10:00-06'),
  ('${LC}','2026-11-09','Garrafones de agya','Purificadora',28,'caja_chica',false,null,'2026-11-09 10:00-06'),
  ('${LC}','2026-11-12','Garrafones de agya','Purificadora',42,'caja_chica',false,null,'2026-11-12 10:00-06'),
  ('${LC}','2026-11-07','Jamon · reembolso','Sams',1061.08,'caja_chica',false,null,'2026-11-13 18:00-06'),
  ('${LC}','2026-11-08','Jamon · reembolso','Sams',1145.76,'caja_chica',true,null,'2026-11-13 18:00:01-06'),
  ('${LC}','2026-11-03','Queso Mozarella · reembolso','Sam''s',1202,'caja_chica',false,null,'2026-11-13 18:00:02-06'),
  ('${LC}','2026-11-03','Queso Mozarella','Sam''s',1202,'empleado',false,'2026-11-12','2026-11-03 10:00-06'),
  ('${LC}','2026-11-14','Garrafones de agya','Purificadora',28,'caja_chica',false,null,'2026-11-14 09:00-06'),
  ('${LC}','2026-11-17','Fabuloso','Seven Eleven',66.50,'caja_chica',false,null,'2026-11-17 09:00-06');
 ${extra}`);
 return db;
}
const repos=async db=>(await db.query(`select monto::text,estado::text,creado_en from public.movimientos where nota like 'REPOSICION-LA-CALMA-20261117%'`)).rows;
const porReponer=async db=>(await db.query(`select coalesce(sum(monto),0)::text s from public.gastos_caja_chica where origen='caja_chica' and not informativo and anulado_en is null
 and creado_en>(select max(creado_en) from public.movimientos where tipo='reposicion_caja_chica' and estado<>'rechazado')`)).rows[0].s;

test('reposición La Calma: el ensayo termina en PRUEBAS OK y no guarda nada',async()=>{
 const db=await nueva();
 await assert.rejects(db.exec(prueba),/PRUEBAS OK — reposición de \$8933\.67/);
 assert.deepEqual(await repos(db),[]);
 assert.equal(await porReponer(db),'9028.17');
});
test('reposición La Calma: aplica pendiente por $8,933.67, deja solo 14 y 17 y es repetible',async()=>{
 const db=await nueva();
 await db.exec(corr); await db.exec(corr);
 const r=await repos(db);
 assert.equal(r.length,1); assert.equal(r[0].monto,'8933.67'); assert.equal(r[0].estado,'pendiente');
 assert.equal(r[0].creado_en.toISOString(),'2026-11-14T14:59:59.999Z');
 assert.equal(await porReponer(db),'94.50');
});
test('reposición La Calma: aborta si los montos ya no cuadran o hay capturas posteriores',async()=>{
 let db=await nueva({extra:`insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,origen,creado_en) values('${LC}','2026-11-10','Nuevo',10,'caja_chica','2026-11-10 10:00-06');`});
 await assert.rejects(db.exec(corr),/suman \$8943\.67/); assert.deepEqual(await repos(db),[]);
 db=await nueva({extra:`insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,origen,creado_en) values('${LC}','2026-11-15','Nuevo',10,'caja_chica','2026-11-15 10:00-06');`});
 await assert.rejects(db.exec(corr),/capturados después/); assert.deepEqual(await repos(db),[]);
 db=await nueva({extra:`update public.gastos_caja_chica set anulado_en=now() where fecha='2026-11-17';`});
 await assert.rejects(db.exec(corr),/encontrados: 1/);
});
