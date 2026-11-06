import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const correccion=load('supabase/correcciones/2026-11-05_boveda_octubre_salidas.sql');
const aplicar=correccion.replace('v_aplicar boolean := false;','v_aplicar boolean := true;');
const SUC='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';

// cierres_dia con las columnas calculadas como las deja 0017 (diferencia = contado − esperado).
const BASE=`create table public.sucursales(id uuid primary key);
 create table public.movimientos(id uuid primary key default gen_random_uuid(),sucursal_id uuid,tipo text,folio text,monto numeric,
  creado_en timestamptz not null default now(),confirmado_en timestamptz);
 create table public.cierres_dia(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null,fecha date not null,
  boveda_inicial numeric(12,2) not null default 0,retiros_dia numeric(12,2) not null default 0,aperturas_dia numeric(12,2) not null default 0,
  deposito_dia numeric(12,2) not null default 0,gastos_boveda_dia numeric(12,2) not null default 0,boveda_contado numeric(12,2) not null default 0,
  deposito_banco text,deposito_ficha text,deposito_fecha timestamptz,
  boveda_esperado numeric(12,2) generated always as (boveda_inicial + retiros_dia - aperturas_dia - deposito_dia - gastos_boveda_dia) stored,
  boveda_diferencia numeric(12,2) generated always as (boveda_contado - (boveda_inicial + retiros_dia - aperturas_dia - deposito_dia - gastos_boveda_dia)) stored,
  unique(sucursal_id,fecha));
 insert into public.sucursales values('${SUC}');
 insert into public.movimientos(sucursal_id,tipo,folio,monto,creado_en,confirmado_en) values
  ('${SUC}','salida_corporativo','0003',17344,'2026-10-05 20:00-06','2026-10-05 20:00-06'),
  ('${SUC}','salida_corporativo','003',19428.50,'2026-10-13 13:21-06','2026-10-13 16:53-06'),
  ('${SUC}','salida_corporativo','004',22001,'2026-10-19 19:35-06','2026-10-19 19:36-06');
 -- Los 6 cierres como están en producción (inicial, retiros, gastos, contado) y uno sano que no se toca.
 insert into public.cierres_dia(sucursal_id,fecha,boveda_inicial,retiros_dia,gastos_boveda_dia,boveda_contado) values
  ('${SUC}','2026-10-04',5000,0,0,2500),('${SUC}','2026-10-07',2500,3229,0,4500),('${SUC}','2026-10-12',4500,3462,0,4500),
  ('${SUC}','2026-10-14',4500,1254,0,4500),('${SUC}','2026-10-16',4500,4432,1350.16,4500),('${SUC}','2026-10-18',4500,8756,0,4500),
  ('${SUC}','2026-10-20',4500,1705,0,6205);`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);return db;};
const estado=async db=>(await db.query(`select fecha::text,boveda_diferencia::float d,deposito_dia::float dep,deposito_ficha f,boveda_contado::float c from public.cierres_dia order by fecha`)).rows;

test('corrección bóveda: los cierres de prueba reproducen los −$20,282.84',async()=>{
 const db=await nueva();
 try{
  const r=await estado(db);
  assert.equal(Math.round(r.slice(0,6).reduce((t,x)=>t+x.d,0)*100)/100,-20282.84);
  assert.equal(r[6].d,0);
 }finally{await db.close();}
});

test('corrección bóveda: tal como está solo simula y no cambia nada',async()=>{
 const db=await nueva();
 try{
  const antes=await estado(db);
  await assert.rejects(db.exec(correccion),e=>{assert.match(e.message,/^SIMULACIÓN OK/);return true;});
  assert.deepEqual(await estado(db),antes);
 }finally{await db.close();}
});

test('corrección bóveda: al aplicar deja los 6 cierres en $0 con su folio y no toca lo contado ni otros cierres',async()=>{
 const db=await nueva();
 try{
  const antes=await estado(db);
  await db.exec(aplicar);
  const r=await estado(db);
  assert.deepEqual(r.slice(0,6).map(x=>x.d),[0,0,0,0,0,0]);
  assert.deepEqual(r.slice(0,6).map(x=>x.dep),[2500,1229,3462,1254,3081.84,8756]);
  assert.deepEqual(r.slice(0,6).map(x=>x.f.split(' ')[0]),['0003','003','003','004','004','004']);
  assert.deepEqual(r.map(x=>x.c),antes.map(x=>x.c));
  assert.deepEqual(r[6],antes[6]);
  const f=(await db.query(`select deposito_fecha from public.cierres_dia where fecha='2026-10-18'`)).rows[0].deposito_fecha;
  assert.equal(new Date(f).toISOString(),'2026-10-20T01:36:00.000Z');
 }finally{await db.close();}
});

test('corrección bóveda: correrla otra vez no cambia nada',async()=>{
 const db=await nueva();
 try{
  await db.exec(aplicar);
  const despues=await estado(db);
  await db.exec(aplicar);
  await db.exec(correccion); // ya aplicada: termina sin error y sin simular otra vez
  assert.deepEqual(await estado(db),despues);
 }finally{await db.close();}
});

test('corrección bóveda: si un cierre cambió, no aplica nada',async()=>{
 const db=await nueva();
 try{
  await db.query(`update public.cierres_dia set boveda_contado=4400 where fecha='2026-10-12'`);
  const antes=await estado(db);
  await assert.rejects(db.exec(aplicar),/El cierre del 2026-10-12 cambió/);
  assert.deepEqual(await estado(db),antes);
 }finally{await db.close();}
});

test('corrección bóveda: si falta una salida, no aplica nada',async()=>{
 const db=await nueva();
 try{
  await db.query(`delete from public.movimientos where folio='004'`);
  const antes=await estado(db);
  await assert.rejects(db.exec(aplicar),/No encontré la salida a corporativo con folio 004/);
  assert.deepEqual(await estado(db),antes);
 }finally{await db.close();}
});
