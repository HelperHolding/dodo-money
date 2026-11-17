import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const S='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e',ADMIN='fab8c3e1-636d-45bc-80e3-a7185ebc75fd';

async function base(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
 create function auth.uid() returns uuid language sql as $$select nullif(current_setting('prueba.uid',true),'')::uuid$$;
 create function edita_finanzas() returns boolean language sql as $$select current_setting('prueba.uid',true)='${ADMIN}'$$;
 create function ve_finanzas() returns boolean language sql as $$select true$$;
 create function hoy_mx() returns date language sql as $$select date '2026-11-17'$$;
 create table sucursales(id uuid primary key);insert into sucursales values ('${S}');
 create table perfiles(id uuid primary key,activo boolean,rol text);insert into perfiles values('${ADMIN}',true,'admin');
 create table dodois_sincronizaciones(id bigint generated always as identity,tipo text not null default 'ventas',
  -- Nombre distinto al de producción: la migración debe quitarla por su definición, no por su nombre.
  constraint tipo_original check (tipo in ('ventas','recepciones')));`);
 await db.exec(load('supabase/migrations/0031_mermas_dodo.sql'));
 await db.exec(load('supabase/migrations/0035_mermas_pl.sql'));
 await db.exec(load('supabase/migrations/20261117200000_mermas_api_dodois.sql'));
 return db;
}
const dias=(fechas)=>JSON.stringify(fechas.map(fecha=>({sucursal_id:S,fecha,productos_completos:true})));
const fila=(fecha,clave,costo)=>({sucursal_id:S,fecha,tipo:'producto',clave,nombre:clave,unidad:'piezas',categoria:'Producto terminado',cantidad:1,costo,sin_costo:false});

test('mermas API: el cron importa sin usuario, marca «API Dodo IS» y reemplaza los días completos',async()=>{
 const db=await base();
 try{
  let r=(await db.query('select importar_mermas_dodo_api($1::jsonb,$2::jsonb) r',[dias(['2026-11-15','2026-11-16']),JSON.stringify([fila('2026-11-15','pizza',40),fila('2026-11-16','marketing:pizza',25)])])).rows[0].r;
  assert.deepEqual(r,{dias:2,filas:2,reemplazados:0});
  const d=(await db.query("select archivo,registrado_por,productos_completos,huella from mermas_dodo_dias order by fecha")).rows;
  assert.ok(d.every(x=>x.archivo==='API Dodo IS'&&x.registrado_por===null&&x.productos_completos&&/^[0-9a-f]{64}$/.test(x.huella)));
  // La siguiente corrida reemplaza el día: sin bajas, el día queda vacío y completo.
  r=(await db.query('select importar_mermas_dodo_api($1::jsonb,$2::jsonb) r',[dias(['2026-11-16']),'[]'])).rows[0].r;
  assert.deepEqual(r,{dias:1,filas:0,reemplazados:1});
  assert.deepEqual((await db.query('select fecha::text,clave from mermas_dodo order by fecha')).rows,[{fecha:'2026-11-15',clave:'pizza'}]);
 }finally{await db.close();}
});

test('mermas API: solo service_role ejecuta la versión sin usuario; la de la app sigue exigiendo admin y lo registra',async()=>{
 const db=await base();
 try{
  const priv=async(rol,f)=>(await db.query(`select has_function_privilege('${rol}','${f}','execute') p`)).rows[0].p;
  assert.equal(await priv('service_role','importar_mermas_dodo_api(jsonb,jsonb)'),true);
  assert.equal(await priv('authenticated','importar_mermas_dodo_api(jsonb,jsonb)'),false);
  assert.equal(await priv('anon','importar_mermas_dodo_api(jsonb,jsonb)'),false);
  assert.equal(await priv('authenticated','importar_mermas_dodo_interno(text,text,jsonb,jsonb,uuid)'),false);
  assert.equal(await priv('authenticated','importar_mermas_dodo(text,text,jsonb,jsonb)'),true);
  await assert.rejects(db.query(`select importar_mermas_dodo('API Dodo IS (manual)','${'a'.repeat(64)}',$1::jsonb,'[]'::jsonb)`,[dias(['2026-11-10'])]),/Solo el admin puede importar mermas/);
  await db.exec(`set prueba.uid='${ADMIN}'`);
  await db.query(`select importar_mermas_dodo('API Dodo IS (manual)','${'a'.repeat(64)}',$1::jsonb,'[]'::jsonb)`,[dias(['2026-11-10'])]);
  assert.equal((await db.query("select registrado_por from mermas_dodo_dias where fecha='2026-11-10'")).rows[0].registrado_por,ADMIN);
  // Sin usuario solo se permite el registro de la API.
  await assert.rejects(db.query(`select importar_mermas_dodo_interno('otro.xlsx','${'b'.repeat(64)}',$1::jsonb,'[]'::jsonb,null)`,[dias(['2026-11-11'])]),/Solo la API de Dodo IS registra sin usuario/);
  await assert.rejects(db.exec(`insert into mermas_dodo_dias(sucursal_id,fecha,archivo,huella,desde,hasta,registrado_por) values('${S}','2026-11-12','manual.xlsx','${'c'.repeat(64)}','2026-11-12','2026-11-12',null)`),/mermas_dodo_dias_registro_api/);
  // La bitácora acepta corridas de mermas.
  await db.exec("insert into dodois_sincronizaciones(tipo) values ('mermas')");
  await assert.rejects(db.exec("insert into dodois_sincronizaciones(tipo) values ('otra')"),/dodois_sincronizaciones_tipo_check/);
  // Se conservan las validaciones de siempre.
  await assert.rejects(db.query('select importar_mermas_dodo_api($1::jsonb,$2::jsonb)',[dias(['2026-11-18']),'[]']),/Sucursal o fecha inválida/);
 }finally{await db.close();}
});
