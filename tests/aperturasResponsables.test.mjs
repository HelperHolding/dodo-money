import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const aperturas=load('supabase/migrations/0037_aperturas.sql');
const rol=load('supabase/migrations/20261127155000_rol_aperturas.sql');
const resp=load('supabase/migrations/20261127160000_aperturas_responsables.sql');

const ADMIN='00000000-0000-0000-0000-0000000000a1',CORP='00000000-0000-0000-0000-0000000000c1',OPER='00000000-0000-0000-0000-0000000000d1',INACT='00000000-0000-0000-0000-0000000000e1';
// Stubs fieles: rol_usuario es enum (0001/0008/marketing), mi_rol excluye inactivos y con cambio de contraseña pendiente (0048),
// ve_compras = admin|corporativo y edita_compras = admin (0011).
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;
 create type rol_usuario as enum('admin','gerente','encargado','operacion','corporativo','marketing');
 create table perfiles(id uuid primary key,activo boolean not null default true,rol rol_usuario not null,nombre text,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles values('${ADMIN}',true,'admin','Admin',false),('${CORP}',true,'corporativo','Corporativo',false),('${OPER}',true,'operacion','Operación',false),('${INACT}',false,'operacion','Inactivo',false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function ve_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text in ('admin','corporativo'),false)$$;
 create function edita_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text='admin',false)$$;
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);insert into sucursales(nombre) values('dodo-2');
 create table ordenes_compra(id uuid primary key,sucursal_id uuid);create table facturas(id uuid primary key,sucursal_id uuid);
 grant select on perfiles to authenticated;`;
const preparar=async db=>{await db.exec(BASE);await db.exec(aperturas);await db.exec(rol);await db.exec(resp);
 await db.exec(`insert into apertura_proyectos(id,sucursal_id,responsable,objetivo_desde,objetivo_hasta) select '00000000-0000-0000-0000-0000000000f2',id,'x','2026-01-01','2026-02-01' from sucursales;
  insert into apertura_items(id,proyecto_id,clave,tipo,etapa,nombre,fuente,original) values('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000f2','T-001','actividad','P1','x','t','{}')`);};
const como=(db,id)=>db.exec(`select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',false)`);
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
const ITEM='00000000-0000-0000-0000-0000000000f3';
const guardar=(db,id,nombre,perfil,externo,activo=true)=>db.query(`select public.guardar_responsable_apertura($1,$2,$3,$4,$5) id`,[id,nombre,perfil,externo,activo]).then(r=>r.rows[0].id);
const sesion=async(db,id,fn)=>{await como(db,id);await db.exec('set role authenticated');try{return await fn();}finally{await db.exec('reset role');}};
const miResp=async db=>(await db.query(`select public.mi_responsable_id() r`)).rows[0].r;

test('rol aperturas existe en el enum y la migración del rol solo lo agrega',async()=>{
 assert.match(rol.replace(/--.*\n/g,''),/^\s*begin;[\s\S]*alter type public\.rol_usuario add value if not exists 'aperturas';\s*commit;\s*$/);
 const db=new PGlite();
 try{await preparar(db);
  assert.equal((await db.query(`select 1 from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='rol_usuario' and e.enumlabel='aperturas'`)).rows.length,1);
 }finally{await db.close();}
});

test('catálogo: rechaza duplicados ignorando mayúsculas y espacios; externo debe coincidir con no tener usuario',async()=>{
 const db=new PGlite();
 try{await preparar(db);await como(db,ADMIN);
  await guardar(db,null,'Diego Michel',null,true);
  await rechaza(guardar(db,null,'  diego MICHEL ',null,true),/Ya existe/);
  await rechaza(db.exec(`insert into apertura_responsables(nombre,externo) values('DIEGO michel',true)`),/duplicate key|unique/);
  await rechaza(db.exec(`insert into apertura_responsables(nombre,perfil_id,externo) values('A',null,false)`),/check/);
  await rechaza(db.exec(`insert into apertura_responsables(nombre,perfil_id,externo) values('B','${OPER}',true)`),/check/);
  await rechaza(guardar(db,null,'Con usuario',OPER,true),/externo/);
  await rechaza(guardar(db,null,'Sin usuario',null,false),/externo/);
  await guardar(db,null,'Operador',OPER,false);
  await rechaza(guardar(db,null,'Otro operador',OPER,false),/ya está ligado/);
  await rechaza(guardar(db,null,'x'.repeat(81),null,true),/1 a 80/);
 }finally{await db.close();}
});

test('catálogo: solo administración guarda; todos los autenticados lo leen; sin DML directo',async()=>{
 const db=new PGlite();
 try{await preparar(db);
  await como(db,ADMIN);const id=await guardar(db,null,'César',null,true);
  for(const u of [CORP,OPER]){await como(db,u);await rechaza(guardar(db,null,'Otro',null,true),/Solo administración/);await rechaza(guardar(db,id,'César',null,true,false),/Solo administración/);}
  await sesion(db,OPER,async()=>{
   assert.equal((await db.query(`select count(*)::int n from apertura_responsables`)).rows[0].n,1);
   await rechaza(db.exec(`update apertura_responsables set nombre='X' where id='${id}'`),/permission denied/);
   await rechaza(db.exec(`insert into apertura_responsables(nombre,externo) values('Y',true)`),/permission denied/);
  });
  await como(db,ADMIN);
  await guardar(db,id,'César (TI)',null,true,false);
  assert.deepEqual((await db.query(`select nombre,activo from apertura_responsables where id=$1`,[id])).rows,[{nombre:'César (TI)',activo:false}]);
  await rechaza(guardar(db,'00000000-0000-0000-0000-0000000000ff','Fantasma',null,true),/no existe/);
 }finally{await db.close();}
});

test('trigger: responsable (texto) sigue al catálogo al asignar y al renombrar',async()=>{
 const db=new PGlite();
 try{await preparar(db);await como(db,ADMIN);
  const a=await guardar(db,null,'Julio Verdeja',ADMIN,false),b=await guardar(db,null,'Equipo marketing',null,true);
  const txt=async()=>(await db.query(`select responsable r from apertura_items where id=$1`,[ITEM])).rows[0].r;
  assert.equal(await txt(),null);
  await db.query(`update apertura_items set responsable_id=$1 where id=$2`,[a,ITEM]);assert.equal(await txt(),'Julio Verdeja');
  await db.query(`update apertura_items set responsable_id=$1 where id=$2`,[b,ITEM]);assert.equal(await txt(),'Equipo marketing');
  await guardar(db,b,'Marketing Dodo',null,true);assert.equal(await txt(),'Marketing Dodo');
  // renombrar a otro responsable no toca este registro
  await guardar(db,a,'Julio V.',ADMIN,false);assert.equal(await txt(),'Marketing Dodo');
  await db.query(`update apertura_items set responsable_id=null where id=$1`,[ITEM]);assert.equal(await txt(),null);
  // el alta con responsable_id también sincroniza
  await db.query(`insert into apertura_items(proyecto_id,clave,tipo,etapa,nombre,fuente,original,responsable_id) values('00000000-0000-0000-0000-0000000000f2','T-002','actividad','P1','y','t','{}',$1)`,[a]);
  assert.equal((await db.query(`select responsable r from apertura_items where clave='T-002'`)).rows[0].r,'Julio V.');
 }finally{await db.close();}
});

test('columnas nuevas: descripción acotada, origen_id y bitácora con sus checks',async()=>{
 const db=new PGlite();
 try{await preparar(db);
  await db.exec(`update apertura_items set descripcion='${'d'.repeat(4000)}' where id='${ITEM}'`);
  await rechaza(db.exec(`update apertura_items set descripcion='${'d'.repeat(4001)}' where id='${ITEM}'`),/check/);
  await db.exec(`update apertura_items set origen_id='${ITEM}' where id='${ITEM}'`);
  await rechaza(db.exec(`update apertura_items set origen_id='00000000-0000-0000-0000-0000000000ff' where id='${ITEM}'`),/foreign key/);
  const ins=(av,com)=>db.exec(`insert into apertura_bitacora(item_id,avance,comentario,usuario_id) values('${ITEM}',${av},'${com}','${ADMIN}')`);
  await ins('null','ok');await ins(100,'ok');
  await rechaza(ins(101,'ok'),/check/);await rechaza(ins(-1,'ok'),/check/);await rechaza(ins(50,''),/check/);
  assert.equal((await db.query(`select fecha=(now() at time zone 'America/Mexico_City')::date ok from apertura_bitacora limit 1`)).rows[0].ok,true);
 }finally{await db.close();}
});

test('mi_responsable_id: el del usuario activo; null si está inactivo, sin ligar o con la fila desactivada',async()=>{
 const db=new PGlite();
 try{await preparar(db);await como(db,ADMIN);
  const op=await guardar(db,null,'Operador',OPER,false);await guardar(db,null,'Inactivo',INACT,false);
  await como(db,OPER);assert.equal(await miResp(db),op);
  await como(db,INACT);assert.equal(await miResp(db),null);
  await como(db,CORP);assert.equal(await miResp(db),null);
  await db.exec(`update perfiles set debe_cambiar_contrasena=true where id='${OPER}'`);
  await como(db,OPER);assert.equal(await miResp(db),null);
  await db.exec(`update perfiles set debe_cambiar_contrasena=false where id='${OPER}'`);
  await como(db,ADMIN);await guardar(db,op,'Operador',OPER,false,false);
  await como(db,OPER);assert.equal(await miResp(db),null);
 }finally{await db.close();}
});
