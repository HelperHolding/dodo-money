import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261030150000_rappi_piezas.sql');
const pruebas=load('supabase/pruebas/20261030150000_rappi_piezas.sql');

// Lo mínimo de Supabase, perfiles, catálogo y productos Rappi (0032) que usa la migración.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean,rol text);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo');
 create function mi_rol() returns text language sql stable as $$select rol from public.perfiles where id=auth.uid()$$;
 create function ve_catalogo_ventas() returns boolean language sql stable as $$select coalesce(public.mi_rol() in ('gerente','admin','corporativo'),false)$$;
 create function edita_finanzas() returns boolean language sql stable as $$select coalesce(public.mi_rol()='admin',false)$$;
 create table productos_venta(dodo_id integer primary key,nombre text not null);
 insert into productos_venta values(40,'Pepperoni Mediano'),(232,'Dip Ranch Dip');
 create table rappi_productos(id bigint generated always as identity primary key,clave text not null unique check(clave ~ '^[0-9a-f]{64}$'),nombre text not null,dodo_id integer references productos_venta(dodo_id));
 grant usage on schema auth to authenticated;grant select on perfiles,productos_venta,rappi_productos to authenticated;`;

test('piezas Rappi: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{await db.exec(BASE);await db.exec(migracion);await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});
test('piezas Rappi: la app solo lee; guardar pasa por la función',async()=>{
 const db=new PGlite();
 try{
  await db.exec(BASE);await db.exec(migracion);
  for(const p of ['insert','update','delete'])assert.equal((await db.query(`select has_table_privilege('authenticated','rappi_producto_piezas','${p}') ok`)).rows[0].ok,false);
  assert.equal((await db.query(`select has_function_privilege('anon','guardar_piezas_rappi(bigint,jsonb)','execute') ok`)).rows[0].ok,false);
 }finally{await db.close();}
});
