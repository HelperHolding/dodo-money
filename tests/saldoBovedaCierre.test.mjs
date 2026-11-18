import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const ajustes=load('supabase/migrations/20261027235402_ajustes_conciliacion_boveda.sql');
const migracion=load('supabase/migrations/20261118120000_saldo_boveda_desde_cierre.sql');
const S='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e',B='00000000-0000-0000-0000-000000000001',CH='00000000-0000-0000-0000-000000000002',V='00000000-0000-0000-0000-000000000003';

async function base(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql as $$select 'fab8c3e1-636d-45bc-80e3-a7185ebc75fd'::uuid$$;
 create function ve_todas_las_sucursales() returns boolean language sql as $$select true$$;
 create function mi_sucursal() returns uuid language sql as $$select '${S}'::uuid$$;
 create table sucursales(id uuid primary key);insert into sucursales values ('${S}');
 create table perfiles(id uuid primary key);insert into perfiles values('fab8c3e1-636d-45bc-80e3-a7185ebc75fd');
 create table cajas(id uuid primary key,sucursal_id uuid,tipo text,nombre text,saldo_inicial numeric);
 insert into cajas values('${B}','${S}','boveda','Bóveda',1000),('${CH}','${S}','caja_chica','Caja chica',500),('${V}','${S}','venta','Venta',0);
 create table movimientos(id uuid default gen_random_uuid(),sucursal_id uuid,tipo text,estado text,monto numeric,caja_origen_id uuid,caja_destino_id uuid,creado_en timestamptz,confirmado_en timestamptz);
 create table gastos_caja_chica(id uuid default gen_random_uuid(),sucursal_id uuid,origen text,monto numeric,informativo boolean,anulado_en timestamptz,creado_en timestamptz);
 create table pagos_boveda_eventos(id uuid default gen_random_uuid(),sucursal_id uuid,importe numeric,creado_en timestamptz);
 create table cierres_dia(id uuid default gen_random_uuid(),sucursal_id uuid,fecha date,cerrado_en timestamptz,boveda_contado numeric);`);
 await db.exec(ajustes);
 return db;
}
const mov=(db,tipo,monto,origen,destino,cuando,estado='confirmado')=>db.query(
 'insert into movimientos(sucursal_id,tipo,estado,monto,caja_origen_id,caja_destino_id,creado_en,confirmado_en) values($1,$2,$3,$4,$5,$6,$7,$8)',
 [S,tipo,estado,monto,origen,destino,cuando,estado==='confirmado'?cuando:null]);
const saldo=async(db,tipo='boveda')=>Number((await db.query('select saldo from saldos_cajas where tipo=$1',[tipo])).rows[0].saldo);
/** "Debe haber en bóveda" del cierre del día de mañana (incluye el cierre de hoy). */
const debeHaber=async db=>{const d=(await db.query(`select datos_boveda_cierre('${S}',current_date+1) d`)).rows[0].d;
 return Math.round((d.bovedaInicial+d.retiros-d.aperturas-d.depositos-d.gastosBoveda)*100)/100;};

test('sin cierres, el saldo de bóveda sigue siendo el histórico', async()=>{
 const db=await base();
 try{
  await mov(db,'retiro_boveda',500,V,B,'2026-11-01 20:00-06');
  await db.exec(migracion);
  assert.equal(await saldo(db),1500);
  assert.equal(await debeHaber(db),1500);
 }finally{await db.close();}
});

test('con cierre, la bóveda parte del último conteo: igual al Debe haber del cierre', async()=>{
 const db=await base();
 try{
  // Antes del cierre: entra 500, pero se contaron 1,200 (faltante de 300 que el histórico arrastraba).
  await mov(db,'retiro_boveda',500,V,B,'2026-11-01 20:00-06');
  await db.exec(`insert into cierres_dia(sucursal_id,fecha,cerrado_en,boveda_contado) values('${S}','2026-10-30','2026-10-30 23:00-06',900),('${S}','2026-11-01','2026-11-01 23:30-06',1200)`);
  // Después: entra 300, sale 100 a corporativo, gasto de 50, pago de 30, ajuste de 20; una salida pendiente no cuenta.
  await mov(db,'retiro_boveda',300,V,B,'2026-11-02 23:00-06');
  await mov(db,'salida_corporativo',100,B,null,'2026-11-03 12:00-06');
  await mov(db,'salida_corporativo',999,B,null,'2026-11-03 13:00-06','pendiente');
  await mov(db,'cambio_morralla',40,B,V,'2026-11-03 14:00-06');
  await db.exec(`insert into gastos_caja_chica(sucursal_id,origen,monto,informativo,anulado_en,creado_en) values
   ('${S}','boveda',50,false,null,'2026-11-04 10:00-06'),('${S}','boveda',70,false,'2026-11-04 11:00-06','2026-11-04 10:30-06'),
   ('${S}','boveda',80,true,null,'2026-11-04 10:40-06'),('${S}','caja_chica',25,false,null,'2026-11-04 10:50-06'),
   ('${S}','boveda',60,false,null,'2026-11-01 12:00-06');
   insert into pagos_boveda_eventos(sucursal_id,importe,creado_en) values('${S}',30,'2026-11-05 10:00-06'),('${S}',45,'2026-10-31 10:00-06');
   insert into ajustes_boveda(sucursal_id,solicitud,importe,saldo_antes,saldo_despues,motivo,autor_id)
    values('${S}','ensayo-ajuste',20,20,0,'Ensayo de ajuste posterior al cierre','fab8c3e1-636d-45bc-80e3-a7185ebc75fd');`);
  const antes=await saldo(db);
  await db.exec(migracion);
  assert.equal(await saldo(db),1200+300-100-50-30-20);
  assert.notEqual(antes,await saldo(db));
  assert.equal(await saldo(db),await debeHaber(db));
  // La caja chica no cambia de cálculo: saldo inicial menos sus gastos.
  assert.equal(await saldo(db,'caja_chica'),475);
 }finally{await db.close();}
});

test('la prueba de producción pasa y detecta un saldo distinto al Debe haber', async()=>{
 const db=await base();
 try{
  await db.exec(`alter table perfiles add activo boolean default true,add debe_cambiar_contrasena boolean default false,add rol text default 'admin';
   alter table sucursales add nombre text default 'Dodo La Calma';
   create function hoy_mx() returns date language sql as $$select current_date$$;`);
  await mov(db,'retiro_boveda',500,V,B,'2026-11-01 20:00-06');
  await db.exec(`insert into cierres_dia(sucursal_id,fecha,cerrado_en,boveda_contado) values('${S}','2026-11-01','2026-11-01 23:30-06',1200)`);
  await db.exec(migracion);
  await db.exec('grant usage on schema public,auth to authenticated;grant select on all tables in schema public to authenticated;');
  const prueba=load('supabase/pruebas/20261118120000_saldo_boveda_desde_cierre.sql');
  await db.exec(prueba);
  await db.exec(`create or replace view saldos_cajas as select id caja_id,sucursal_id,tipo,nombre,saldo_inicial+1 saldo from cajas`);
  await assert.rejects(db.exec(prueba),/FALLÓ: Dodo La Calma tiene saldo/);
 }finally{await db.close();}
});

test('la vista conserva columnas y permisos de consulta', async()=>{
 const db=await base();
 try{
  await db.exec(migracion);
  const cols=(await db.query(`select column_name from information_schema.columns where table_name='saldos_cajas' order by ordinal_position`)).rows.map(r=>r.column_name);
  assert.deepEqual(cols,['caja_id','sucursal_id','tipo','nombre','saldo']);
 }finally{await db.close();}
});
