import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261105120000_cuenta_regalias_memo.sql');
const pruebas=load('supabase/pruebas/20261105120000_cuenta_regalias_memo.sql');

// Columnas como las crean 0025 y 0026 (CHECK en línea, con su nombre automático) y caja chica como la deja 20261026155811.
const CUENTAS=`('repartidores', 'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'otros', 'insumos', 'inversiones')`;
const BASE=`create table proveedores(id serial primary key);create table facturas(id serial primary key);
 create table factura_conceptos(id serial primary key,factura_id int references facturas(id));create table gastos_caja_chica(id serial primary key,cuenta_pl text);
 alter table proveedores add column cuenta_pl text check (cuenta_pl in ${CUENTAS});
 alter table facturas add column cuenta_pl text check (cuenta_pl in ${CUENTAS});
 alter table factura_conceptos add column cuenta_pl text check (cuenta_pl in ${CUENTAS});
 alter table public.gastos_caja_chica add constraint gastos_caja_chica_cuenta_pl_check check(cuenta_pl in
  ('repartidores','marketing_agregadores','marketing','renta','servicios','mantenimiento','consumibles_equipo','otros','insumos'));`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);return db;};

test('cuenta regalías: antes de la migración se rechaza',async()=>{
 const db=await nueva();
 try{await assert.rejects(db.query("insert into proveedores(cuenta_pl) values('regalias')"),/proveedores_cuenta_pl_check/);}
 finally{await db.close();}
});

test('cuenta regalías: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{
  await db.exec(migracion);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});

test('cuenta regalías: proveedores, facturas y conceptos la aceptan; caja chica no',async()=>{
 const db=await nueva();
 try{
  await db.exec(migracion);
  await db.query("insert into proveedores(cuenta_pl) values('regalias'),('inversiones'),(null)");
  const f=(await db.query("insert into facturas(cuenta_pl) values('regalias') returning id")).rows[0].id;
  await db.query("insert into factura_conceptos(factura_id,cuenta_pl) values($1,'regalias'),($1,'otros')",[f]);
  for(const t of ['proveedores','facturas','factura_conceptos'])
   await assert.rejects(db.query(`insert into ${t}(cuenta_pl) values('regalia')`),new RegExp(`${t}_cuenta_pl_check`));
  await assert.rejects(db.query("insert into gastos_caja_chica(cuenta_pl) values('regalias')"),/gastos_caja_chica_cuenta_pl_check/);
 }finally{await db.close();}
});
