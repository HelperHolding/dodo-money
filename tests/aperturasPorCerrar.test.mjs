import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const aperturas=load('supabase/migrations/0037_aperturas.sql');
const cargaInicial=load('supabase/cargas/0037_dodo_2.sql');
const presupuesto=load('supabase/cargas/dodo_2_presupuesto_20261013.sql');
const migracion=load('supabase/migrations/20261102120000_aperturas_categorias.sql');
const carga=load('supabase/cargas/equipo_categorias_dodo_2.sql');
const actividades=load('supabase/migrations/20261103120000_aperturas_categoria_actividades.sql');
const porCerrar=load('supabase/migrations/20261125120000_aperturas_por_cerrar.sql');
const pruebas=load('supabase/pruebas/20261125120000_aperturas_por_cerrar.sql');

const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table auth.users(id uuid primary key,email text);insert into auth.users values('00000000-0000-0000-0000-0000000000a1','scervera@dodopizza.mx');
 create table perfiles(id uuid primary key,activo boolean,rol text,nombre text,debe_cambiar_contrasena boolean default false);
 insert into perfiles values('00000000-0000-0000-0000-0000000000a1',true,'admin','Admin'),('00000000-0000-0000-0000-0000000000c1',true,'corporativo','Corporativo');
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);insert into sucursales(nombre) values('dodo-2');
 create table ordenes_compra(id uuid primary key,sucursal_id uuid);create table facturas(id uuid primary key,sucursal_id uuid);
 grant usage on schema auth to authenticated;grant select on perfiles to authenticated;`;
const preparar=async db=>{await db.exec(BASE);await db.exec(aperturas);await db.exec(cargaInicial);await db.exec(presupuesto);await db.exec(`update sucursales set nombre='Dodo Lopez Mateos (Dodo-2)'`);await db.exec(migracion);await db.exec(carga);await db.exec(actividades);await db.exec(porCerrar);};
const ADMIN='00000000-0000-0000-0000-0000000000a1';
const comoAdmin=db=>db.exec(`select set_config('request.jwt.claims','{"sub":"${ADMIN}","role":"authenticated"}',false)`);
const rpc=(db,id,rev,datos)=>db.query(`select public.actualizar_apertura_item($1,$2,$3::jsonb)`,[id,rev,JSON.stringify(datos)]);
const item=async(db,tipo)=>(await db.query(`select id,revision from apertura_items where tipo=$1 order by clave limit 1`,[tipo])).rows[0];

test('por_cerrar: actividad y técnico lo aceptan sin evidencia y queda guardado',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);await comoAdmin(db);
  for(const tipo of ['actividad','tecnico']){
   const x=await item(db,tipo);
   await rpc(db,x.id,x.revision,{estado:'por_cerrar'});
   const r=(await db.query(`select estado,evidencia,revision from apertura_items where id=$1`,[x.id])).rows[0];
   assert.deepEqual({estado:r.estado,evidencia:r.evidencia},{estado:'por_cerrar',evidencia:null});
   assert.equal(r.revision,x.revision+1);
  }
 }finally{await db.close();}
});
test('por_cerrar: un equipo lo rechaza con el mensaje de estado inválido',async()=>{
 const db=new PGlite();
 try{await preparar(db);await comoAdmin(db);const e=await item(db,'equipo');await assert.rejects(rpc(db,e.id,e.revision,{estado:'por_cerrar'}),/Estado inválido para este registro\./);}
 finally{await db.close();}
});
test('por_cerrar: el CHECK de la tabla acepta el estado en un insert directo',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);
  const p=(await db.query(`select id from apertura_proyectos limit 1`)).rows[0].id;
  const ins=est=>db.query(`insert into apertura_items(proyecto_id,clave,tipo,etapa,nombre,fuente,original,estado) values($1,$2,'actividad','P1','x','t','{}',$3)`,[p,'T-'+est,est]);
  await ins('por_cerrar');
  await assert.rejects(ins('inventado'),/check/i);
 }finally{await db.close();}
});
test('por_cerrar: ningún update ni delete de la migración va sin where (safeupdate de PostgREST)',()=>{
 const sinComentarios=porCerrar.replace(/--[^\n]*/g,'');
 const updates=sinComentarios.match(/\bupdate\s+public\.\w+(\s+\w+)?\s+set\b[^;]*;/gi)??[];
 assert.ok(updates.length>=1);
 for(const u of updates)assert.match(u,/\bwhere\b/i,`update sin where: ${u}`);
 for(const d of sinComentarios.match(/\bdelete\s+from\s+public\.\w+[^;]*;/gi)??[])assert.match(d,/\bwhere\b/i,`delete sin where: ${d}`);
});
test('por_cerrar: la prueba SQL termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{await preparar(db);await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK/);return true;});}
 finally{await db.close();}
});
