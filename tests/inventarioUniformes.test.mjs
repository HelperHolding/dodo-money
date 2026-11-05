import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261105180000_inventario_uniformes.sql');
const pruebas=load('supabase/pruebas/20261105180000_inventario_uniformes.sql');

// Stubs como en Supabase: rol es enum en perfiles; ve_compras/edita_compras como en 0011 (por mi_rol).
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum('operacion','encargado','gerente','admin','corporativo');
 create table public.perfiles(id uuid primary key,activo boolean not null default true,rol rol_usuario not null);
 insert into public.perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo'),('00000000-0000-0000-0000-0000000000e1',true,'encargado');
 create function public.mi_rol() returns rol_usuario language sql stable as $$select rol from public.perfiles where id=auth.uid() and activo$$;
 create function public.ve_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(public.mi_rol()::text in ('admin','corporativo'),false)$$;
 create function public.edita_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(public.mi_rol()::text='admin',false)$$;`;

const nueva=async()=>{const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;};
const como=(db,id)=>db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);

test('inventario: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await nueva();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('inventario: carga inicial igual a la foto de Zoho (11 artículos, 89 piezas)',async()=>{
 const db=await nueva();
 try{
  const {rows}=await db.query('select sku,cantidad,zoho_item_id from inventario_articulos order by sku');
  assert.equal(rows.length,11);
  assert.deepEqual(rows.map(r=>r.cantidad),[8,15,17,6,11,7,4,8,6,4,3]);
  assert.equal(rows[10].zoho_item_id,'6602667000028133298');
 }finally{await db.close();}
});

test('inventario: encargado no ajusta; datos inválidos se rechazan',async()=>{
 const db=await nueva();
 try{
  await como(db,'00000000-0000-0000-0000-0000000000e1');
  await assert.rejects(db.query("select ajustar_inventario('DOD-UNI-002',1,null)"),/Solo administración/);
  await como(db,'00000000-0000-0000-0000-0000000000a1');
  await assert.rejects(db.query("insert into inventario_articulos(sku,nombre) values('dod uni','x')"),/inventario_articulos_sku_check/);
  await assert.rejects(db.query("select ajustar_inventario('DOD-UNI-002',100001,null)"),/Cantidad inválida/);
  await db.query("select ajustar_inventario('DOD-UNI-002',0,'Conteo')");
  const {rows}=await db.query("select anterior,nueva,nota from inventario_movimientos");
  assert.deepEqual(rows,[{anterior:15,nueva:0,nota:'Conteo'}]);
 }finally{await db.close();}
});
