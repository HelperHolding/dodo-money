import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261119210000_dodois_tiempos_pedidos.sql');
const pruebas=load('supabase/pruebas/20261119210000_dodois_tiempos_pedidos.sql');
const ADMIN='fab8c3e1-636d-45bc-80e3-a7185ebc75fd',S='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';

// Tablas que toca sincronizar_ventas_dodo, con los CHECK y llaves reales (0007_datos_brutos y 20261020180000).
async function base(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.role() returns text language sql as $$select nullif(current_setting('request.jwt.claims',true),'')::json->>'role'$$;
 create table perfiles(id uuid primary key);insert into perfiles values('${ADMIN}');
 create table sucursales(id uuid primary key,nombre text);insert into sucursales values('${S}','Zapopan-1 La Calma');
 create table dodois_conexion(id boolean primary key default true check(id),conectado_por uuid not null references perfiles(id));
 insert into dodois_conexion(conectado_por) values('${ADMIN}');
 create table importaciones_ventas(id uuid primary key default gen_random_uuid(),sucursal_id uuid,fecha date,archivo_ventas text,archivo_productos text,
  total numeric,suma_productos numeric,productos integer,pedidos integer,formato text,importado_por uuid,importado_en timestamptz default now());
 create sequence productos_venta_interno start 900000;
 create table productos_venta(dodo_id integer primary key,nombre text not null,tamano text);
 create table productos_codigos(dodo_uuid text primary key,dodo_id integer references productos_venta(dodo_id));
 create table pedidos(dodo_id text primary key,sucursal_id uuid not null,fecha date not null,hora time not null,
  pago text not null check (pago in ('efectivo','tarjeta','en_linea','otro')),tipo text not null check (tipo in ('en_tienda','entrega','personal')),
  origen text not null check (origen in ('mostrador','kiosco','app','sitio','otro')),origen_dodo text,para_llevar boolean not null default false,
  estado text not null check (estado in ('entregado','cancelado')),total numeric(12,2) not null,total_sin_descuento numeric(12,2) not null,
  iva numeric(12,2) not null default 0,productos integer not null default 0,promocion text,turno_dodo text,agregador text,
  inicio_coccion timestamptz,listo timestamptz,entregado timestamptz,importacion_id uuid not null references importaciones_ventas(id));
 create table pedido_productos(pedido_id text not null references pedidos(dodo_id) on delete cascade,renglon integer not null,dodo_uuid text not null,
  dodo_id integer not null references productos_venta(dodo_id),nombre text not null,precio numeric(12,2) not null,precio_sin_descuento numeric(12,2) not null,
  costo_dodo numeric,combo text,primary key(pedido_id,renglon));
 create table ventas_dia(id uuid primary key default gen_random_uuid(),sucursal_id uuid,fecha date,pedidos integer,total numeric,efectivo numeric,tarjeta numeric,
  en_linea numeric,iva numeric,venta_m2 numeric,importacion_id uuid,unique(sucursal_id,fecha));
 create table ventas_dia_desglose(ventas_dia_id uuid,tipo text,pedidos integer,total numeric,efectivo numeric,tarjeta numeric,en_linea numeric,iva numeric);
 create table ventas_producto(sucursal_id uuid,fecha date,dodo_id integer,nombre text,cantidad integer,importe numeric,importe_sin_descuento numeric);
 create table ventas_conciliaciones(importacion_id uuid,anulado_en timestamptz,anulado_por uuid,motivo_anulacion text,registrado_en timestamptz default now());`);
 await db.exec(migracion);
 return db;
}
const resultado=async(db,sql)=>{try{await db.exec(sql);return 'sin excepción';}catch(e){return e.message;}};

test('la prueba de producción pasa: guarda los tiempos, los conserva si no vienen y los reemplaza', async()=>{
 const db=await base();
 try{
  assert.equal(await resultado(db,pruebas),
   'PRUEBAS OK — guarda los tiempos del pedido · sin tiempos se conservan los que había · tiempos nuevos reemplazan; el día no cambia');
  // La prueba no deja cambios.
  assert.equal((await db.query('select count(*)::int n from pedidos')).rows[0].n,0);
 }finally{await db.close();}
});

test('la prueba de producción detecta la versión anterior, que no guarda los tiempos', async()=>{
 const db=await base();
 try{
  const viejo=load('supabase/migrations/20261020180000_sincronizacion_dodois.sql');
  const i=viejo.indexOf('create or replace function sincronizar_ventas_dodo'),j=viejo.indexOf('end $$;',i)+7;
  await db.exec(viejo.slice(i,j));
  assert.match(await resultado(db,pruebas),/^FALLÓ: guarda inicio de cocción, listo y entregado/);
 }finally{await db.close();}
});
