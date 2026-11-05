// tests/facturacionClientes.test.mjs
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261106120000_facturacion_clientes.sql');
const pruebas=load('supabase/pruebas/20261106120000_facturacion_clientes.sql');

// Stubs que copian columnas, enums y CHECK reales (0001, 0004, 0006, 0007, 0068, 20261020180000).
const S='00000000-0000-0000-0000-0000000000a1',ADMIN='00000000-0000-0000-0000-0000000000ad',CORP='00000000-0000-0000-0000-0000000000c0',GER='00000000-0000-0000-0000-0000000000ae';
const BASE=`create role service_role;create role anon;create role authenticated;
 create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create type rol_usuario as enum('cajero','encargado','gerente','admin');alter type rol_usuario add value 'corporativo';
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null unique,dodois_unit_id text unique);
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null default 'cajero',sucursal_id uuid references sucursales(id),activo boolean not null default true);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path=public as $$select rol from perfiles where id=auth.uid() and activo$$;
 create table importaciones_ventas(id uuid primary key default gen_random_uuid());
 create table pedidos(dodo_id text primary key,sucursal_id uuid not null references sucursales(id),fecha date not null,hora time not null,
  pago text not null check (pago in ('efectivo','tarjeta','en_linea','otro')),tipo text not null check (tipo in ('en_tienda','entrega','personal')),
  estado text not null check (estado in ('entregado','cancelado')),total numeric(12,2) not null,agregador text,importacion_id uuid not null references importaciones_ventas(id));
 create table pedido_productos(pedido_id text not null references pedidos(dodo_id) on delete cascade,renglon integer not null,nombre text not null,precio numeric(12,2) not null,primary key(pedido_id,renglon));
 create table razones_sociales(rfc text primary key check(rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),razon_social text not null,activa boolean not null default true);
 insert into sucursales(id,nombre,dodois_unit_id) values('${S}','Zapopan-1','11f187558e757f53b0570d952420b810');
 insert into perfiles(id,nombre,rol) values('${ADMIN}','Admin','admin'),('${CORP}','Corp','corporativo'),('${GER}','Ger','gerente');
 insert into razones_sociales(rfc,razon_social) values('HCM260306B93','HELPER COMERCIALIZADORA MASTER');
 insert into importaciones_ventas(id) values('00000000-0000-0000-0000-00000000000f');`;

// "Hoy" fijo en México: 2026-11-05 12:00 (18:00 UTC). La migración lee la fecha de facturacion_hoy(), que en la prueba se reemplaza.
const HOY=`create or replace function public.facturacion_hoy() returns date language sql stable as $$select date '2026-11-05'$$;`;
const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);await db.exec(HOY);return db;};
const pedido=(db,id,c={})=>db.query(`insert into pedidos(dodo_id,sucursal_id,fecha,hora,pago,tipo,estado,total,agregador,importacion_id)
 values($1,$2,$3,$4,$5,$6,$7,$8,$9,'00000000-0000-0000-0000-00000000000f')`,
 [id,S,c.fecha??'2026-11-04',c.hora??'17:35',c.pago??'tarjeta',c.tipo??'en_tienda',c.estado??'entregado',c.total??383,c.agregador??null]);
const productos=async(db,id)=>{for(const [i,[n,p]] of [['Dodo Supreme Grande Tradicional',269],['Coca Light 2 L',59],['Rolls de manzana 8',55]].entries())
 await db.query(`insert into pedido_productos values($1,$2,$3,$4)`,[id,i+1,n,p]);};
const buscar=(db,{ip='ip1',fecha='2026-11-04',hora='17:36',total=383}={})=>db.query(`select * from facturacion_buscar_ticket($1,$2,$3,$4,$5)`,[ip,S,fecha,hora,total]).then(r=>r.rows[0]);
const DATOS={rfc:'XYZ010101AB1',nombre:'CLIENTE PRUEBA',regimen_fiscal:'601',codigo_postal:'45160',uso_cfdi:'G03',correo:'juan@gmail.com',forma_pago:'04'};
const reservar=(db,id,d=DATOS)=>db.query(`select facturacion_reservar($1,$2::jsonb) as id`,[id,JSON.stringify(d)]).then(r=>r.rows[0].id);
const como=(db,u)=>db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[u??'']);
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});

test('facturación: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();try{await rechaza(db.exec(pruebas),/^PRUEBAS OK$/);}finally{await db.close();}
});

test('facturación: encuentra el ticket con ±3 minutos y total exacto',async()=>{
 const db=await nueva();try{
  await pedido(db,'A');await productos(db,'A');
  const r=await buscar(db);
  assert.equal(r.resultado,'ok');assert.equal(r.pedido_id,'A');assert.equal(r.productos.length,3);
  assert.equal((await buscar(db,{hora:'17:38'})).resultado,'ok');
  assert.equal((await buscar(db,{hora:'17:39'})).resultado,'no_encontrado');
  assert.equal((await buscar(db,{total:383.01})).resultado,'no_encontrado');
 }finally{await db.close();}
});

test('facturación: dos pedidos iguales en la ventana dan "varios"',async()=>{
 const db=await nueva();try{await pedido(db,'A');await pedido(db,'B',{hora:'17:37'});
  const r=await buscar(db);assert.equal(r.resultado,'varios');assert.equal(r.pedido_id,null);}finally{await db.close();}
});

test('facturación: plazo del mes en curso según México',async()=>{
 const db=await nueva();try{
  // 1 de noviembre 05:30 UTC = 31 de octubre 23:30 en México.
  assert.equal((await db.query(`select facturacion_dia_mx('2026-11-01 05:30+00')::text as d`)).rows[0].d,'2026-10-31');
  assert.equal((await db.query(`select facturacion_dia_mx('2026-11-01 06:30+00')::text as d`)).rows[0].d,'2026-11-01');
  await pedido(db,'V',{fecha:'2026-10-31'});
  assert.equal((await buscar(db,{fecha:'2026-10-31'})).resultado,'fuera_de_plazo');
  assert.equal((await buscar(db,{fecha:'2026-11-06'})).resultado,'fuera_de_plazo');
 }finally{await db.close();}
});

test('facturación: cancelados, personal, agregadores y pago "otro" no se facturan',async()=>{
 const db=await nueva();try{
  for(const [id,c] of [['C',{estado:'cancelado'}],['P',{tipo:'personal',total:100}],['R',{agregador:'Rappi',total:200}],['O',{pago:'otro',total:300}]]){
   await pedido(db,id,c);
   assert.equal((await buscar(db,{total:c.total??383})).resultado,'no_facturable',id);
   await rechaza(reservar(db,id),/NO_FACTURABLE/);
  }
 }finally{await db.close();}
});

test('facturación: un ticket, una factura (reserva doble, liberar, cancelar)',async()=>{
 const db=await nueva();try{
  await pedido(db,'A');
  const id=await reservar(db,'A');
  await rechaza(reservar(db,'A'),/^EN_PROCESO:/);
  await db.query(`select facturacion_liberar($1,'RFC no coincide')`,[id]);
  const id2=await reservar(db,'A');
  await db.query(`select facturacion_confirmar($1,'fa_1','11111111-2222-3333-4444-555555555555','F',1,330.17,52.83)`,[id2]);
  await rechaza(reservar(db,'A'),/^YA_FACTURADO$/);
  const r=await buscar(db);assert.equal(r.resultado,'facturado');assert.equal(r.factura_id,id2);assert.equal(r.correo,'ju***@gmail.com');
  await como(db,GER);await rechaza(db.query(`select facturacion_registrar_cancelacion($1,'02')`,[id2]),/Solo administración/);
  await como(db,ADMIN);await db.query(`select facturacion_registrar_cancelacion($1,'02')`,[id2]);
  const f=(await db.query(`select estado,cancelada_por,motivo_cancelacion from facturas_clientes where id=$1`,[id2])).rows[0];
  assert.deepEqual(f,{estado:'cancelada',cancelada_por:ADMIN,motivo_cancelacion:'02'});
  await como(db,null);assert.ok(await reservar(db,'A'));
 }finally{await db.close();}
});

test('facturación: la factura sobrevive al borrado del pedido (reimportación)',async()=>{
 const db=await nueva();try{
  await pedido(db,'A');const id=await reservar(db,'A');
  await db.query(`select facturacion_confirmar($1,'fa_1','11111111-2222-3333-4444-555555555555','F',1,330.17,52.83)`,[id]);
  await db.query(`delete from pedidos where dodo_id='A'`);
  const f=(await db.query(`select sucursal_id,fecha::text as fecha,hora::text as hora,total::text as total from facturas_clientes where id=$1`,[id])).rows[0];
  assert.deepEqual(f,{sucursal_id:S,fecha:'2026-11-04',hora:'17:35:00',total:'383.00'});
 }finally{await db.close();}
});

test('facturación: un pedido cancelado en la ventana no estorba al entregado',async()=>{
 const db=await nueva();try{await pedido(db,'C',{estado:'cancelado',hora:'17:34'});await pedido(db,'E',{hora:'17:37'});
  const r=await buscar(db);assert.equal(r.resultado,'ok');assert.equal(r.pedido_id,'E');}finally{await db.close();}
});

test('facturación: datos inválidos se rechazan en la base',async()=>{
 const db=await nueva();try{await pedido(db,'A');
  await rechaza(reservar(db,'A',{...DATOS,rfc:'XAXX010101000'}),/facturas_clientes_rfc_check/);
  await rechaza(reservar(db,'A',{...DATOS,uso_cfdi:'G01'}),/facturas_clientes_uso_cfdi_check/);
  await rechaza(reservar(db,'A',{...DATOS,forma_pago:'03'}),/facturas_clientes_forma_pago_check/);
 }finally{await db.close();}
});

test('facturación: límite de 10 búsquedas por IP cada 10 minutos',async()=>{
 const db=await nueva();try{
  for(let i=0;i<10;i++) assert.equal((await buscar(db,{ip:'x'})).resultado,'no_encontrado');
  assert.equal((await buscar(db,{ip:'x'})).resultado,'limite');
  assert.equal((await buscar(db,{ip:'y'})).resultado,'no_encontrado');
 }finally{await db.close();}
});

test('facturación: descarga solo con el token correcto y factura timbrada',async()=>{
 const db=await nueva();try{await pedido(db,'A');const id=await reservar(db,'A');
  const tok=(await db.query(`select token_descarga from facturas_clientes where id=$1`,[id])).rows[0].token_descarga;
  const desc=t=>db.query(`select facturacion_para_descarga($1,$2) as f`,[id,t]).then(r=>r.rows[0].f);
  assert.equal(await desc(tok),null);
  await db.query(`select facturacion_confirmar($1,'fa_9','11111111-2222-3333-4444-555555555559','F',9,330.17,52.83)`,[id]);
  assert.equal(await desc(tok),'fa_9');
  assert.equal(await desc('00000000-0000-0000-0000-000000000000'),null);
 }finally{await db.close();}
});

test('facturación: permisos (anon y authenticated no ejecutan las funciones del servidor)',async()=>{
 const db=await nueva();try{
  const puede=(rol,fn)=>db.query(`select has_function_privilege($1,$2,'execute') as p`,[rol,fn]).then(r=>r.rows[0].p);
  for(const fn of ['facturacion_buscar_ticket(text,uuid,date,time,numeric)','facturacion_reservar(text,jsonb)','facturacion_liberar(uuid,text)'])
   for(const rol of ['anon','authenticated']) assert.equal(await puede(rol,fn),false,`${rol} ${fn}`);
  assert.equal(await puede('service_role','facturacion_reservar(text,jsonb)'),true);
  assert.equal(await puede('authenticated','facturacion_registrar_cancelacion(uuid,text)'),true);
 }finally{await db.close();}
});
