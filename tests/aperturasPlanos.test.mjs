import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const aperturas=load('supabase/migrations/0037_aperturas.sql');
const cargaInicial=load('supabase/cargas/0037_dodo_2.sql');
const planos=load('supabase/migrations/20261125130000_aperturas_planos.sql');
const pruebas=load('supabase/pruebas/20261125130000_aperturas_planos.sql');

const ADMIN='00000000-0000-0000-0000-0000000000a1',CORP='00000000-0000-0000-0000-0000000000c1',OPER='00000000-0000-0000-0000-0000000000d1';
// Los stubs copian el comportamiento real: ve_compras = admin|corporativo, edita_compras = admin (0011); storage imita buckets/objects/foldername.
const BASE=`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table auth.users(id uuid primary key,email text);
 grant usage on schema auth to authenticated;grant usage on schema storage to authenticated;
 create table storage.buckets(id text primary key,name text not null,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 create table perfiles(id uuid primary key,activo boolean,rol text,nombre text,debe_cambiar_contrasena boolean default false);
 insert into perfiles values('${ADMIN}',true,'admin','Admin'),('${CORP}',true,'corporativo','Corporativo'),('${OPER}',true,'operacion','Operación');
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);insert into sucursales(nombre) values('dodo-2');
 create table ordenes_compra(id uuid primary key,sucursal_id uuid);create table facturas(id uuid primary key,sucursal_id uuid);
 grant select on perfiles to authenticated;`;
const preparar=async db=>{await db.exec(BASE);await db.exec(aperturas);await db.exec(cargaInicial);await db.exec(planos);};
const como=(db,id)=>db.exec(`select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',false)`);
const rechaza=(p,re)=>assert.rejects(p,e=>{assert.match(e.message,re);return true;});
const proyecto=async db=>(await db.query(`select id from apertura_proyectos limit 1`)).rows[0].id;
const item=async(db,n=0)=>(await db.query(`select id from apertura_items order by clave limit 1 offset $1`,[n])).rows[0].id;
const guardar=(db,p,hoja,rev=null,extra={})=>db.query(`select public.guardar_apertura_plano($1,$2,$3,'2026-11-25',$4,$5,1000,800,$6) id`,[p,hoja,extra.nombre??'Planta baja',extra.archivo??`${p}/o.pdf`,extra.imagen??`${p}/i.png`,rev]).then(r=>r.rows[0].id);
const marca=(db,h,i,x,y)=>db.query(`select public.colocar_apertura_marca($1,$2,$3,$4)`,[h,i,x,y]);
const conRol=async(db,fn)=>{await db.exec('grant select,insert,delete on storage.objects to authenticated');await db.exec('set role authenticated');try{await fn();}finally{await db.exec('reset role');}};

test('planos: el admin crea la hoja E01 y la lee; operación no puede crearla ni verla',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);const p=await proyecto(db);
  await como(db,OPER);await rechaza(guardar(db,p,'E01'),/Solo administración/);
  await como(db,CORP);await rechaza(guardar(db,p,'E01'),/Solo administración/);
  await como(db,ADMIN);const h=await guardar(db,p,'E01');
  const [r]=(await db.query(`select hoja,nombre,revision,ancho,alto,creado_por from apertura_planos where id=$1`,[h])).rows;
  assert.deepEqual(r,{hoja:'E01',nombre:'Planta baja',revision:1,ancho:1000,alto:800,creado_por:ADMIN});
  await rechaza(guardar(db,p,'E 01'),/hoja debe tener/);
  await rechaza(guardar(db,p,'E01'),/cambió/);
 }finally{await db.close();}
});

test('planos: colocar inserta y actualiza; rechaza fuera de [0,1] y partidas de otro proyecto',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);const p=await proyecto(db);const i=await item(db);
  await como(db,ADMIN);const h=await guardar(db,p,'E01');
  await marca(db,h,i,0.1,0.2);
  await marca(db,h,i,0.9,1);
  assert.deepEqual((await db.query(`select x::float8 x,y::float8 y from apertura_plano_marcas where plano_id=$1`,[h])).rows,[{x:0.9,y:1}]);
  for(const [x,y] of [[-0.01,0.5],[0.5,1.01],[1.5,0],[null,0.5]])await rechaza(marca(db,h,i,x,y),/dentro del plano/);
  await db.exec(`insert into sucursales(id,nombre) values('00000000-0000-0000-0000-0000000000f1','otra');
   insert into apertura_proyectos(id,sucursal_id,responsable,objetivo_desde,objetivo_hasta) values('00000000-0000-0000-0000-0000000000f2','00000000-0000-0000-0000-0000000000f1','x','2026-01-01','2026-02-01');
   insert into apertura_items(id,proyecto_id,clave,tipo,etapa,nombre,fuente,original) values('00000000-0000-0000-0000-0000000000f3','00000000-0000-0000-0000-0000000000f2','Z1','actividad','P1','x','t','{}')`);
  await rechaza(marca(db,h,'00000000-0000-0000-0000-0000000000f3',0.5,0.5),/no es de esta apertura/);
  await como(db,OPER);await rechaza(marca(db,h,i,0.5,0.5),/Solo administración/);
 }finally{await db.close();}
});

test('planos: reemplazar con la revisión vigente conserva marcas y sube la revisión; una vieja se rechaza',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);const p=await proyecto(db);const i=await item(db);
  await como(db,ADMIN);const h=await guardar(db,p,'E01');
  await marca(db,h,i,0.3,0.4);
  assert.equal(await guardar(db,p,'E01',1,{nombre:'Nueva',imagen:`${p}/i2.png`}),h);
  const [r]=(await db.query(`select revision,nombre,imagen from apertura_planos where id=$1`,[h])).rows;
  assert.deepEqual(r,{revision:2,nombre:'Nueva',imagen:`${p}/i2.png`});
  assert.equal((await db.query(`select 1 from apertura_plano_marcas where plano_id=$1 and item_id=$2`,[h,i])).rows.length,1);
  await rechaza(guardar(db,p,'E01',1),/cambió/);
  assert.equal((await db.query(`select revision from apertura_planos where id=$1`,[h])).rows[0].revision,2);
 }finally{await db.close();}
});

test('planos: quitar marca y borrar hoja (cascada) devolviendo las rutas',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);const p=await proyecto(db);const i=await item(db),j=await item(db,1);
  await como(db,ADMIN);const h=await guardar(db,p,'E01');
  await marca(db,h,i,0.1,0.1);await marca(db,h,j,0.2,0.2);
  await db.query(`select public.quitar_apertura_marca($1,$2)`,[h,i]);
  assert.equal((await db.query(`select count(*)::int n from apertura_plano_marcas`)).rows[0].n,1);
  await como(db,OPER);await rechaza(db.query(`select * from public.borrar_apertura_plano($1)`,[h]),/Solo administración/);
  await como(db,ADMIN);
  assert.deepEqual((await db.query(`select * from public.borrar_apertura_plano($1)`,[h])).rows,[{archivo:`${p}/o.pdf`,imagen:`${p}/i.png`}]);
  assert.equal((await db.query(`select count(*)::int n from apertura_plano_marcas`)).rows[0].n,0);
  assert.equal((await db.query(`select count(*)::int n from apertura_planos`)).rows[0].n,0);
  await rechaza(db.query(`select * from public.borrar_apertura_plano($1)`,[h]),/no existe/);
 }finally{await db.close();}
});

test('planos: RLS — sin escritura directa y el select respeta ve_compras()',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);const p=await proyecto(db);const i=await item(db);
  await como(db,ADMIN);const h=await guardar(db,p,'E01');await marca(db,h,i,0.5,0.5);
  for(const t of ['apertura_planos','apertura_plano_marcas']){
   for(const op of ['insert','update','delete'])assert.equal((await db.query(`select has_table_privilege('authenticated',$1,$2) p`,[`public.${t}`,op])).rows[0].p,false,`${op} ${t}`);
   assert.equal((await db.query(`select has_table_privilege('authenticated',$1,'select') p`,[`public.${t}`])).rows[0].p,true);
   assert.equal((await db.query(`select relrowsecurity r from pg_class where oid=$1::regclass`,[`public.${t}`])).rows[0].r,true);
  }
  for(const fn of ['guardar_apertura_plano(uuid,text,text,date,text,text,integer,integer,integer)','colocar_apertura_marca(uuid,uuid,numeric,numeric)','quitar_apertura_marca(uuid,uuid)','borrar_apertura_plano(uuid)']){
   assert.equal((await db.query(`select has_function_privilege('authenticated',$1,'execute') p`,['public.'+fn])).rows[0].p,true,fn);
   assert.equal((await db.query(`select has_function_privilege('anon',$1,'execute') p`,['public.'+fn])).rows[0].p,false,fn);
  }
  await db.exec('grant usage on schema public to authenticated');
  await db.exec('set role authenticated');
  try{
   for(const [id,n] of [[ADMIN,1],[CORP,1],[OPER,0]]){
    await como(db,id);
    assert.equal((await db.query(`select count(*)::int n from public.apertura_planos`)).rows[0].n,n,id);
    assert.equal((await db.query(`select count(*)::int n from public.apertura_plano_marcas`)).rows[0].n,n,id);
   }
   await como(db,ADMIN);
   await rechaza(db.exec(`delete from public.apertura_planos where true`),/permission denied/);
  }finally{await db.exec('reset role');}
 }finally{await db.close();}
});

test('planos: bucket privado con límite y tipos; políticas de subida y rutas fuera de la carpeta',async()=>{
 const db=new PGlite();
 try{
  await preparar(db);const p=await proyecto(db);
  const [b]=(await db.query(`select public,file_size_limit,allowed_mime_types from storage.buckets where id='aperturas-planos'`)).rows;
  assert.deepEqual({...b,file_size_limit:Number(b.file_size_limit)},{public:false,file_size_limit:26214400,allowed_mime_types:['application/pdf','image/png','image/jpeg']});
  const ins=(id,ruta)=>como(db,id).then(()=>db.query(`insert into storage.objects(bucket_id,name) values('aperturas-planos',$1)`,[ruta]));
  await conRol(db,async()=>{
   await ins(ADMIN,`${p}/x.png`);
   await rechaza(ins(OPER,`${p}/y.png`),/row-level security/);
   await rechaza(ins(CORP,`${p}/y.png`),/row-level security/);
   await rechaza(ins(ADMIN,`00000000-0000-0000-0000-00000000ffff/y.png`),/row-level security/);
   await rechaza(ins(ADMIN,`suelto.png`),/row-level security/);
   for(const [id,n] of [[ADMIN,1],[CORP,1],[OPER,0]]){await como(db,id);assert.equal((await db.query(`select count(*)::int n from storage.objects`)).rows[0].n,n,id);}
   await como(db,CORP);await db.query(`delete from storage.objects where bucket_id='aperturas-planos'`);
   assert.equal((await db.query(`select count(*)::int n from storage.objects`)).rows[0].n,1);
   await como(db,ADMIN);await db.query(`delete from storage.objects where bucket_id='aperturas-planos'`);
   assert.equal((await db.query(`select count(*)::int n from storage.objects`)).rows[0].n,0);
  });
  await como(db,ADMIN);
  await rechaza(guardar(db,p,'E01',null,{archivo:'otra/o.pdf'}),/empezar con la carpeta/);
  await rechaza(guardar(db,p,'E01',null,{imagen:`00000000-0000-0000-0000-00000000ffff/i.png`}),/empezar con la carpeta/);
  await rechaza(guardar(db,p,'E01',null,{archivo:`${p}o.pdf`}),/empezar con la carpeta/);
 }finally{await db.close();}
});

test('planos: ningún update ni delete de la migración va sin where (safeupdate de PostgREST)',()=>{
 const sinComentarios=planos.replace(/--[^\n]*/g,'');
 const updates=sinComentarios.match(/\bupdate\s+public\.\w+(\s+\w+)?\s+set\b[^;]*;/gi)??[];
 assert.ok(updates.length>=1);
 for(const u of updates)assert.match(u,/\bwhere\b/i,`update sin where: ${u}`);
 const deletes=sinComentarios.match(/\bdelete\s+from\s+public\.\w+[^;]*;/gi)??[];
 assert.ok(deletes.length>=2);
 for(const d of deletes)assert.match(d,/\bwhere\b/i,`delete sin where: ${d}`);
});

test('planos: la prueba SQL termina en PRUEBAS OK',async()=>{
 const db=new PGlite();
 try{await preparar(db);await rechaza(db.exec(pruebas),/^PRUEBAS OK/);}
 finally{await db.close();}
});
