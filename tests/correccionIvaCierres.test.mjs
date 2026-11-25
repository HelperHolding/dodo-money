import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/correcciones/2026-11-25_iva_cierres.sql',import.meta.url),'utf8').replace(/^﻿/,'');
const bloque2=sql.slice(sql.indexOf('begin;'));
const S='00000000-0000-0000-0000-0000000000a1';
// Stub fiel a 0001: venta_total y venta_neta son columnas generadas.
async function base(){
 const db=new PGlite();
 await db.exec(`create table sucursales(id uuid primary key,nombre text not null);insert into sucursales values('${S}','La Calma');
 create table cierres_dia(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),fecha date not null,
  efectivo numeric(12,2) not null default 0,tarjeta numeric(12,2) not null default 0,app numeric(12,2) not null default 0,rappi numeric(12,2) not null default 0,
  venta_total numeric(12,2) generated always as (efectivo+tarjeta+app+rappi) stored,iva numeric(12,2) not null default 0,
  venta_neta numeric(12,2) generated always as (efectivo+tarjeta+app+rappi-iva) stored,unique(sucursal_id,fecha));
 insert into cierres_dia(sucursal_id,fecha,efectivo,tarjeta,iva) values
 ('${S}','2026-11-20',10000,16296,26295.50),('${S}','2026-11-21',5000,0,5000),('${S}','2026-11-22',10000,1600,1600);`);
 return db;
}
const correr=(db,n)=>db.exec(bloque2.replace('v_esperado integer := 0;',`v_esperado integer := ${n};`));
const filas=async db=>(await db.query('select fecha::text f,iva::text i,venta_neta::text n from cierres_dia order by fecha')).rows;

test('con el esperado en 2 corrige solo los 2 con IVA mal',async()=>{
 const db=await base();
 try{await correr(db,2);const r=await filas(db);
  assert.deepEqual(r.map(x=>x.i),['3627.03','689.66','1600.00']);
  assert.equal(r[0].n,'22668.97');
 }finally{await db.close();}
});
test('con el esperado en 3 aborta y no cambia nada',async()=>{
 const db=await base();
 try{const antes=await filas(db);await assert.rejects(correr(db,3),/esperabas 3/);await db.exec('rollback');
  assert.deepEqual(await filas(db),antes);
 }finally{await db.close();}
});
test('con 0 (sin editar) aborta y no cambia nada',async()=>{
 const db=await base();
 try{const antes=await filas(db);await assert.rejects(db.exec(bloque2),/Falta poner el conteo/);await db.exec('rollback');
  assert.deepEqual(await filas(db),antes);
 }finally{await db.close();}
});
