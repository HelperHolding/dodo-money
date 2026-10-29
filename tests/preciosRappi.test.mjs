import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261029120000_precios_rappi.sql');
const pruebas=load('supabase/pruebas/20261029120000_precios_rappi.sql');
const carga=load('supabase/cargas/precios_rappi_menu_final_3.sql');

// Lo mínimo de Supabase y del catálogo de ventas que usa la migración; la prueba SQL que corre Sebastián se ejecuta completa.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean,rol text);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo');
 create function mi_rol() returns text language sql stable as $$select rol from public.perfiles where id=auth.uid()$$;
 create function ve_catalogo_ventas() returns boolean language sql stable as $$select coalesce(public.mi_rol() in ('gerente','admin','corporativo'),false)$$;
 create function edita_finanzas() returns boolean language sql stable as $$select coalesce(public.mi_rol()='admin',false)$$;
 create type categoria_producto as enum ('pizza','snack','postre','bebida','otro');
 create table productos_venta(dodo_id integer primary key,nombre text not null,categoria categoria_producto,
  tamano text check (tamano in ('pequeno','mediano','grande')),creado_en timestamptz not null default now());`;

test('precios Rappi: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await db.exec(migracion);
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});
 }finally{await db.close();}
});

test('precios Rappi: solo lectura para la app',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await db.exec(migracion);
  for(const p of ['insert','update','delete'])
   assert.equal((await db.query(`select has_table_privilege('authenticated','precios_rappi','${p}') ok`)).rows[0].ok,false);
 }finally{await db.close();}
});

test('carga del menú: liga pizzas por tamaño y masa, y reporta lo que no encuentra',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);
  await db.exec(migracion);
  await db.exec(`insert into productos_venta(dodo_id,nombre) values(1,'Pepperoni Mediano'),(2,'Pepperoni Mediano T'),(3,'Pepperoni Grande'),(4,'Pepperoni Pequeño'),
   (5,'Jamón y champiñones Grande'),(6,'Ranch Picante Mediano'),(7,'Papas francesas Medium'),(8,'Coca Cola 0,6 L'),(9,'Sprite 2 L'),(10,'Dip BBQ'),(11,'Boneless M')`);
  await db.exec(carga);
  const precios=Object.fromEntries((await db.query(`select p.nombre,r.precio::float precio from precios_rappi r join productos_venta p using(dodo_id)`)).rows.map(r=>[r.nombre,r.precio]));
  assert.deepEqual(precios,{'Pepperoni Mediano':159,'Pepperoni Mediano T':159,'Pepperoni Grande':189,'Jamón y champiñones Grande':239,'Ranch Picante Mediano':239,
   'Papas francesas Medium':65,'Coca Cola 0,6 L':41,'Sprite 2 L':71,'Dip BBQ':27,'Boneless M':199});
  const sin=(await db.query(`select s from carga_precios_rappi,jsonb_array_elements_text(r->'sin_producto') s`)).rows.map(r=>r.s);
  assert.ok(sin.includes('Margherita 30 cm')&&!sin.includes('Pepperoni 30 cm'));
 }finally{await db.close();}
});
