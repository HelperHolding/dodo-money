import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const sql=readFileSync(new URL('../supabase/correcciones/2026-10-27_reposicion_602_50_boveda.sql',import.meta.url),'utf8').replace(/^\uFEFF/,'');
const confirmation=readFileSync(new URL('../supabase/migrations/0016_salida_sucursal.sql',import.meta.url),'utf8').match(/create or replace function confirmar_movimiento[\s\S]*?end \$\$;/)[0];
test('corrección de reposición: ensayo reversible, aplicación única e historial sin otro gasto',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`
 create schema auth;
 create function auth.uid() returns uuid language sql as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 create function mi_rol() returns text language sql as $$select 'admin'::text$$;
 create function mi_sucursal() returns uuid language sql as $$select '260324e5-6f5a-44d8-9a75-f4a4ba3ed10e'::uuid$$;
 create function hoy_mx() returns date language sql as $$select current_date$$;
 create type estado_movimiento as enum('pendiente','confirmado','rechazado');
 create table perfiles(id uuid,activo boolean,rol text);
 insert into perfiles values ('fab8c3e1-636d-45bc-80e3-a7185ebc75fd',true,'admin');
 create table cajas(id uuid,sucursal_id uuid,tipo text,saldo_inicial numeric);
 insert into cajas values
 ('00000000-0000-0000-0000-000000000001','260324e5-6f5a-44d8-9a75-f4a4ba3ed10e','boveda',30541.28),
 ('00000000-0000-0000-0000-000000000002','260324e5-6f5a-44d8-9a75-f4a4ba3ed10e','caja_chica',4376.50),
 ('00000000-0000-0000-0000-000000000003','260324e5-6f5a-44d8-9a75-f4a4ba3ed10e','corporativo',0);
 create table movimientos(id uuid,sucursal_id uuid,tipo text,monto numeric,estado estado_movimiento,caja_origen_id uuid,caja_destino_id uuid,nota text,registrado_por uuid,confirmado_por uuid,confirmado_en timestamptz,creado_en timestamptz);
 insert into movimientos values ('ba9e398f-24d6-4bab-a001-164c0b0a981c','260324e5-6f5a-44d8-9a75-f4a4ba3ed10e','reposicion_caja_chica',602.50,'pendiente','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002','Reposición por gastos comprobados','00000000-0000-0000-0000-000000000099',null,null,'2026-10-27T16:16:40Z');
 create view saldos_cajas as select c.id caja_id,c.saldo_inicial+coalesce((select sum(monto) from movimientos where caja_destino_id=c.id and estado='confirmado'),0)-coalesce((select sum(monto) from movimientos where caja_origen_id=c.id and estado='confirmado'),0) saldo from cajas c;
 create table gastos_caja_chica(id uuid,monto numeric);insert into gastos_caja_chica values('00000000-0000-0000-0000-000000000004',602.50);
 create table pagos(id uuid);create table pago_aplicaciones(pago_id uuid,factura_id uuid);
 create table pagos_boveda_eventos(id uuid);create table pagos_ventas_eventos(id uuid);
 create table cierres_dia(id uuid,sucursal_id uuid,fecha date);create table arqueos(id uuid);create table recolecciones_corporativo(id uuid);
 `);
 await db.exec(confirmation);
 const before=(await db.query('select * from movimientos')).rows;
 let result=await db.exec(sql);
 let row=result.flatMap(r=>r.rows??[]).find(r=>r.resultado);
 assert.equal(row.resultado,'CORRECCIÓN VALIDADA');assert.equal(row.saldo_boveda_despues,'29938.78');assert.equal(row.saldo_caja_chica_despues,'4979.00');
 assert.deepEqual((await db.query('select * from movimientos')).rows,before);
 const apply=sql.replace(/ROLLBACK;\s*$/,'COMMIT;');
 await db.exec("create function adverso() returns trigger language plpgsql as $$begin update gastos_caja_chica set monto=1;return new;end $$;create trigger adverso after update of estado on movimientos for each row execute function adverso()");
 await assert.rejects(db.exec(apply),/Cambió un registro protegido/);
 await db.exec('rollback;drop trigger adverso on movimientos;drop function adverso()');
 assert.deepEqual((await db.query('select * from movimientos')).rows,before);
 assert.equal((await db.query('select sum(monto) monto from gastos_caja_chica')).rows[0].monto,'602.50');
 await db.exec(apply);
 const saved=(await db.query('select * from movimientos')).rows;
 assert.equal(saved.length,1);assert.equal(saved[0].estado,'confirmado');assert.match(saved[0].nota,/Estado original completo/);
 assert.equal((await db.query('select sum(monto) monto from gastos_caja_chica')).rows[0].monto,'602.50');
 result=await db.exec(apply);row=result.flatMap(r=>r.rows??[]).find(r=>r.resultado);
 assert.equal(row.resultado,'YA APLICADA · SIN OTRO DESCUENTO');assert.deepEqual((await db.query('select * from movimientos')).rows,saved);
 }finally{await db.close();}
});
