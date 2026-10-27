import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migration = readFileSync(new URL('../supabase/migrations/20261027231046_cierre_boveda_acumulado.sql', import.meta.url),'utf8').replace(/^\uFEFF/,'');
test('cierre acumulado: saltos, fronteras, pagos, permisos y conservación', async () => {
 const db = new PGlite();
 try {
 await db.exec(`
 create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.usuario',true),'')::uuid$$;
 create function public.mi_sucursal() returns uuid language sql as $$select '00000000-0000-0000-0000-000000000001'::uuid$$;
 create function public.ve_todas_las_sucursales() returns boolean language sql as $$select false$$;
 create table public.cajas(id uuid,sucursal_id uuid,tipo text,saldo_inicial numeric);
 create table public.cierres_dia(id integer generated always as identity,sucursal_id uuid,fecha date,cerrado_en timestamptz default now(),boveda_contado numeric,boveda_inicial numeric,retiros_dia numeric,aperturas_dia numeric,deposito_dia numeric,gastos_boveda_dia numeric);
 create table public.movimientos(sucursal_id uuid,tipo text,monto numeric,estado text,caja_origen_id uuid,caja_destino_id uuid,confirmado_en timestamptz,creado_en timestamptz);
 create table public.gastos_caja_chica(sucursal_id uuid,origen text,monto numeric,informativo boolean,anulado_en timestamptz,creado_en timestamptz);
 create table public.pagos_boveda_eventos(sucursal_id uuid,importe numeric,creado_en timestamptz);
 select set_config('test.usuario','00000000-0000-0000-0000-000000000099',false);
 insert into cajas values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','boveda',4500);
 insert into cierres_dia(sucursal_id,fecha,cerrado_en,boveda_contado) values ('00000000-0000-0000-0000-000000000001','2020-01-21','2020-01-22T05:12:00Z',8361);
 `);
 const antes = (await db.query('select * from cierres_dia')).rows;
 await db.exec(migration);
 assert.deepEqual((await db.query('select * from cierres_dia')).rows,antes);
 const s='00000000-0000-0000-0000-000000000001',b='00000000-0000-0000-0000-000000000002',v='00000000-0000-0000-0000-000000000003';
 const mov = async (monto,at,estado='confirmado',tipo='retiro_boveda',origen=v,destino=b,created=at) => db.query('insert into movimientos values ($1,$2,$3,$4,$5,$6,$7,$8)',[s,tipo,monto,estado,origen,destino,at,created]);
 await mov(900,'2020-01-22T05:12:00Z'); // Incluido en el conteo anterior: no repetir.
 await mov(7758.5,'2020-01-23T05:03:00Z');
 await mov(5080,'2020-01-24T14:38:00Z');
 await mov(7271,'2020-01-25T05:05:00Z');
 await mov(999,'2020-01-25T10:00:01Z'); // Después del día operativo del 24.
 await mov(300,'2020-01-23T13:00:00Z','rechazado');
 await mov(20,'2020-01-23T14:00:00Z','pendiente');
 await mov(50,'2020-01-23T14:00:00Z','confirmado','cambio_morralla');
 const calc = async fecha => (await db.query('select public.datos_boveda_cierre($1,$2) as d',[s,fecha])).rows[0].d;
 let d=await calc('2020-01-24');
 assert.equal(d.retiros,20109.5); assert.equal(d.bovedaInicial,8361);assert.equal(d.pendientes,1);
 await mov(100,'2020-01-23T15:00:00Z','confirmado','reposicion_caja_chica',b,v);
 await mov(200,'2020-01-23T16:00:00Z','confirmado','salida_corporativo',b,v);
 // Creado antes del corte pero confirmado después: sí salió ahora.
 await mov(30,'2020-01-23T17:00:00Z','confirmado','apertura',b,v,'2020-01-21T12:00:00Z');
 await db.query(`insert into gastos_caja_chica values ($1,'boveda',5334,false,null,'2020-01-23T12:00:00Z'),($1,'boveda',59,true,null,'2020-01-23T12:00:00Z'),($1,'boveda',88,false,'2020-01-23T13:00:00Z','2020-01-23T12:00:00Z')`, [s]);
 await db.query(`insert into pagos_boveda_eventos values ($1,2610.5,'2020-01-24T12:00:00Z'),($1,-100,'2020-01-24T13:00:00Z')`,[s]);
 d=await calc('2020-01-24');assert.equal(d.aperturas,130);assert.equal(d.depositos,200);assert.equal(d.gastosBoveda,7844.5);
 assert.equal(d.bovedaInicial+d.retiros-d.aperturas-d.depositos-d.gastosBoveda,20296);
 await db.exec('create trigger incluir_pagos_boveda_corte before insert on cierres_dia for each row execute function incluir_pagos_boveda_corte()');
 await db.query(`insert into cierres_dia(sucursal_id,fecha,cerrado_en,boveda_contado,boveda_inicial,retiros_dia,gastos_boveda_dia) values ($1,'2020-01-24','2020-01-25T10:00:00Z',20200,0,0,0)`,[s]);
 const saved=(await db.query('select * from cierres_dia order by id desc limit 1')).rows[0];
 assert.equal(saved.boveda_contado,'20200');assert.equal(saved.retiros_dia,'20109.5');assert.equal(saved.gastos_boveda_dia,'7844.5');
 assert.deepEqual((await db.query('select * from cierres_dia where id=1')).rows,antes);
 d=await calc('2020-01-25');assert.equal(d.bovedaInicial,20200);assert.equal(d.retiros,999);assert.equal(d.gastosBoveda,0);
 await assert.rejects(db.query(`select datos_boveda_cierre('00000000-0000-0000-0000-000000000004','2020-01-24')`),/Sucursal sin acceso/);
 await db.exec('grant select on all tables in schema public to authenticated; set role authenticated');
 assert.equal((await calc('2020-01-25')).bovedaInicial,20200);
 await assert.rejects(db.exec("insert into cierres_dia(sucursal_id) values (null)"),/permission denied/);
 await db.exec('reset role; delete from cierres_dia');
 d=await calc('2020-01-24');assert.equal(d.bovedaInicial,4500);assert.equal(d.retiros,21009.5);
 await db.exec("select set_config('test.usuario','',false)");
 await assert.rejects(calc('2020-01-24'),/Sucursal sin acceso/);
 assert.equal((await db.query("select has_function_privilege('anon','datos_boveda_cierre(uuid,date)','execute') as ok")).rows[0].ok,false);
 } finally {await db.close();}
});
