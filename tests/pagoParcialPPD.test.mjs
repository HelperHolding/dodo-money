import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
// Funciones reales de producción, copiadas tal cual de sus migraciones (este cambio no trae migración).
const extraer=(archivo,re)=>{const m=load(archivo).match(re);assert.ok(m,`no se encontró ${re} en ${archivo}`);return m[0];};
const F14='supabase/migrations/0014_compras_pagos.sql';
const pagado=extraer(F14,/create or replace function pagado_factura[\s\S]*?\$\$;/);
const saldo=extraer(F14,/create or replace function saldo_factura[\s\S]*?\$\$;/);
const cubierto=extraer(F14,/create or replace function cubierto_por_complementos[\s\S]*?\$\$;/);
const falta=extraer(F14,/create or replace function falta_complemento[\s\S]*?\$\$;/);
const estado=extraer(F14,/create or replace function actualizar_estado_factura[\s\S]*?end \$\$;/);
const registrarPago=extraer('supabase/migrations/0028_dias_de_pago.sql',/create or replace function registrar_pago\([\s\S]*?end \$\$;/);
const programar=extraer('supabase/migrations/0045_programar_cualquier_dia.sql',/create or replace function programar_pago\([\s\S]*?end \$\$;/);
const programarDetalle=extraer('supabase/migrations/0046_programacion_facturas.sql',/create function public\.programar_pago_detalle[\s\S]*?end \$\$;/);

const A='00000000-0000-0000-0000-0000000000a1',P='00000000-0000-0000-0000-0000000000b1',PPD='00000000-0000-0000-0000-0000000000f1',PUE='00000000-0000-0000-0000-0000000000f2';
// Lo mínimo de Supabase y Compras, con los CHECK y enums reales de las tablas que tocan las funciones.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,rol text);insert into perfiles values('${A}','admin');
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid())$$;
 create function exigir_admin_compras() returns void language plpgsql as $$begin if not exists(select 1 from public.perfiles where id=auth.uid() and rol='admin') then raise exception 'Solo administración.';end if;end$$;
 create function hoy_mx() returns date language sql stable as $$select date '2026-11-06'$$;
 create function es_dia_de_pago(d date) returns boolean language sql stable as $$select true$$;
 create function cotejo_factura(p_id uuid) returns text language sql stable as $$select 'sin_orden'::text$$;
 create type estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create type forma_pago as enum('transferencia','efectivo','tarjeta','cheque');
 create table proveedores(id uuid primary key);insert into proveedores values('${P}');
 create table facturas(id uuid primary key,uuid text unique,serie text,folio text,tipo text not null,metodo_pago text check (metodo_pago in ('PUE','PPD')),
  total numeric(14,2) not null check (total>=0),proveedor_id uuid not null references proveedores(id),estado estado_factura not null default 'por_pagar',
  revisada boolean not null default false,motivo_cancelacion text,uuid_relacionado text,pago_programado_el date,pago_programado_forma forma_pago,
  check (estado <> 'cancelada' or coalesce(trim(motivo_cancelacion), '') <> ''));
 insert into facturas(id,uuid,folio,tipo,metodo_pago,total,proveedor_id,pago_programado_el,pago_programado_forma) values
  ('${PPD}','AAAAAAAA-0000-0000-0000-000000000001','PPD-1','ingreso','PPD',10000,'${P}','2026-11-06','transferencia'),
  ('${PUE}','AAAAAAAA-0000-0000-0000-000000000002','PUE-1','ingreso','PUE',500,'${P}',null,null);
 create function neto_factura(p_id uuid) returns numeric language sql stable as $$
  select f.total - coalesce((select sum(n.total) from facturas n where n.tipo='egreso' and n.estado<>'cancelada' and n.uuid_relacionado=f.uuid),0) from facturas f where f.id=p_id$$;
 create table pagos(id uuid primary key default gen_random_uuid(),proveedor_id uuid not null references proveedores(id),fecha date not null,monto numeric(14,2) not null check (monto>0),
  forma forma_pago not null,cuenta_origen text,referencia text,comprobante_ruta text,motivo_fuera_de_dia text,anulado_en timestamptz);
 create table pago_aplicaciones(id bigserial primary key,pago_id uuid not null references pagos(id),factura_id uuid not null references facturas(id),
  monto numeric(14,2) not null check (monto>0),unique(pago_id,factura_id));
 create table complementos_pago(id uuid primary key default gen_random_uuid());
 create table complemento_facturas(id bigserial primary key,complemento_id uuid not null references complementos_pago(id),factura_uuid text not null,monto_pagado numeric(14,2) not null default 0,parcialidad integer);
 create table factura_programacion_historial(id bigint generated always as identity primary key,factura_id uuid not null references facturas(id),
  tipo text not null check(tipo in ('recepcion','pago')),fecha_anterior date,fecha_nueva date,forma_anterior forma_pago,forma_nueva forma_pago,
  usuario_id uuid not null default auth.uid() references perfiles(id));
 ${pagado} ${saldo} ${cubierto} ${falta} ${estado} ${registrarPago} ${programar} ${programarDetalle}
 select set_config('request.jwt.claims','{"sub":"${A}"}',false);`;

const pagar=(db,factura,monto)=>db.query(`select registrar_pago('${P}',date '2026-11-06',${monto},'transferencia','BBVA',null,null,jsonb_build_array(jsonb_build_object('factura_id','${factura}'::uuid,'monto',${monto}))) id`);
const ver=async(db,f)=>(await db.query(`select estado::text estado,saldo_factura(id)::float saldo,falta_complemento(id) falta,pago_programado_el::text programada,pago_programado_forma::text forma from facturas where id='${f}'`)).rows[0];

test('pago parcial PPD: abono deja parcial con saldo; después se liquida y queda pagada',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await pagar(db,PPD,4000);
  assert.deepEqual(await ver(db,PPD),{estado:'parcial',saldo:6000,falta:true,programada:'2026-11-06',forma:'transferencia'});
  // Lo que hace la app tras el abono sin fecha nueva: libera la programación que era para este pago.
  await db.query(`select programar_pago_detalle('${PPD}',null,null)`);
  assert.deepEqual(await ver(db,PPD),{estado:'parcial',saldo:6000,falta:true,programada:null,forma:null});
  // Con fecha para el resto: queda programado con la forma prevista y su historial.
  await db.query(`select programar_pago_detalle('${PPD}',date '2026-11-27','transferencia')`);
  assert.equal((await ver(db,PPD)).programada,'2026-11-27');
  assert.equal((await db.query(`select count(*)::int n from factura_programacion_historial where factura_id='${PPD}'`)).rows[0].n,2);
  // No se programa el resto en una fecha que ya pasó.
  await assert.rejects(db.query(`select programar_pago_detalle('${PPD}',date '2026-11-05','transferencia')`),/ya pasó/);
  // Un segundo pago no puede pasar del saldo; la liquidación exacta la cierra.
  await assert.rejects(pagar(db,PPD,6000.01),/saldo es 6000/);
  await pagar(db,PPD,6000);
  const fin=await ver(db,PPD);
  assert.deepEqual([fin.estado,fin.saldo,fin.falta],['pagada',0,true]);
  // Los dos REP (uno por pago) amparan todo lo pagado.
  await db.exec(`insert into complementos_pago(id) values('00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c2');
   insert into complemento_facturas(complemento_id,factura_uuid,monto_pagado,parcialidad) values
    ('00000000-0000-0000-0000-0000000000c1','AAAAAAAA-0000-0000-0000-000000000001',4000,1),('00000000-0000-0000-0000-0000000000c2','AAAAAAAA-0000-0000-0000-000000000001',6000,2);`);
  assert.equal((await ver(db,PPD)).falta,false);
 }finally{await db.close();}
});

test('pago parcial: una PUE sigue como hoy (acepta abono) y no pide complemento',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await pagar(db,PUE,200);
  assert.deepEqual(await ver(db,PUE),{estado:'parcial',saldo:300,falta:false,programada:null,forma:null});
  await pagar(db,PUE,300);
  assert.equal((await ver(db,PUE)).estado,'pagada');
 }finally{await db.close();}
});
