import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const aperturas=load('supabase/migrations/0037_aperturas.sql');
// Lo que la migración de responsables toca y ya está en producción: categoría, por_cerrar, colores, planos y fotos.
const previas=['20261102120000_aperturas_categorias','20261103120000_aperturas_categoria_actividades','20261109200000_aperturas_colores',
 '20261125120000_aperturas_por_cerrar','20261125130000_aperturas_planos','20261125140000_aperturas_fotos'].map(n=>load(`supabase/migrations/${n}.sql`));
const rol=load('supabase/migrations/20261127155000_rol_aperturas.sql');
const resp=load('supabase/migrations/20261127160000_aperturas_responsables.sql');

const ADMIN='00000000-0000-0000-0000-0000000000a1',CORP='00000000-0000-0000-0000-0000000000c1',OPER='00000000-0000-0000-0000-0000000000d1',INACT='00000000-0000-0000-0000-0000000000e1';
const OPER2='00000000-0000-0000-0000-0000000000d2',APERT='00000000-0000-0000-0000-0000000000b1';
// Stubs fieles: rol_usuario es enum (0001/0008/marketing), mi_rol excluye inactivos y con cambio de contraseña pendiente (0048),
// ve_compras = admin|corporativo y edita_compras = admin (0011).
const BASE=`create role anon;create role authenticated;create schema auth;create schema storage;
 create table storage.buckets(id text primary key,name text not null,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]$$;
 grant usage on schema storage to authenticated;grant select on storage.objects to authenticated;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;
 create type rol_usuario as enum('admin','gerente','encargado','operacion','corporativo','marketing');
 create table perfiles(id uuid primary key,activo boolean not null default true,rol rol_usuario not null,nombre text,debe_cambiar_contrasena boolean not null default false,sucursal_id uuid);
 insert into perfiles values('${ADMIN}',true,'admin','Admin',false),('${CORP}',true,'corporativo','Corporativo',false),('${OPER}',true,'operacion','Operación',false),('${INACT}',false,'operacion','Inactivo',false),('${OPER2}',true,'gerente','Gerente',false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function ve_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text in ('admin','corporativo'),false)$$;
 create function edita_compras() returns boolean language sql stable security definer set search_path=public as $$select coalesce(mi_rol()::text='admin',false)$$;
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);insert into sucursales(nombre) values('dodo-2');update perfiles set sucursal_id=(select id from sucursales limit 1) where rol::text not in ('corporativo','marketing');alter table perfiles add constraint perfiles_sin_sucursal check ((rol::text in ('corporativo','marketing'))=(sucursal_id is null));
 create table auth.users(id uuid primary key,email text);
 create table usuarios_historial(id uuid primary key default gen_random_uuid(),usuario_id uuid not null references perfiles(id),autor_id uuid not null references perfiles(id),motivo text not null,antes jsonb not null,despues jsonb not null,creado_en timestamptz not null default now());
 create table usuarios_invitaciones(id uuid primary key,correo text not null unique,nombre text not null,rol rol_usuario not null,sucursal_id uuid references sucursales(id),usuario_id uuid unique references perfiles(id),creado_por uuid not null references perfiles(id),creado_en timestamptz not null default now(),estado text not null default 'pendiente' check(estado in ('pendiente','enviada','aceptada','error')),envio_id uuid,envio_por uuid references perfiles(id),reservado_hasta timestamptz,enviada_en timestamptz,aceptada_en timestamptz,envios integer not null default 0,error_envio text);
 create table usuarios_invitaciones_historial(id uuid primary key default gen_random_uuid(),invitacion_id uuid not null references usuarios_invitaciones(id),autor_id uuid not null references perfiles(id),evento text not null,creado_en timestamptz not null default now());
 create table ordenes_compra(id uuid primary key,sucursal_id uuid);create table facturas(id uuid primary key,sucursal_id uuid);
 grant select on perfiles to authenticated;`;
const preparar=async db=>{await db.exec(BASE);await db.exec(aperturas);for(const m of previas)await db.exec(m);await db.exec(rol);
 await db.exec(resp);await db.exec(`insert into perfiles values('${APERT}',true,'aperturas','Solo aperturas',false)`);
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

// ── Task 2: acceso por responsable, edición acotada, bitácora, alta completa y división ──
const P1='00000000-0000-0000-0000-0000000000f2',P2='00000000-0000-0000-0000-0000000000f4';
const ITEM_B='00000000-0000-0000-0000-0000000000f5',ITEM_C='00000000-0000-0000-0000-0000000000f6',ITEM_X='00000000-0000-0000-0000-0000000000f7',LEGADO='00000000-0000-0000-0000-0000000000f8';
const PLANO1='00000000-0000-0000-0000-000000000101',PLANO2='00000000-0000-0000-0000-000000000102';
// Dos aperturas. OPER (operación) es responsable de ITEM; OPER2 (gerente) de ITEM_B (equipo con precio, en P1) e ITEM_C (en P2);
// ITEM_X es de un externo; LEGADO solo tiene el texto (sin responsable_id), como los registros de producción antes de la limpieza.
const escenario=async db=>{
 await preparar(db);await como(db,ADMIN);
 const A=await guardar(db,null,'Operador A',OPER,false),B=await guardar(db,null,'Gerente B',OPER2,false),X=await guardar(db,null,'César',null,true);
 await db.exec(`insert into sucursales(nombre) values('dodo-3');
  insert into apertura_proyectos(id,sucursal_id,responsable,objetivo_desde,objetivo_hasta) select '${P2}',id,'y','2026-01-01','2026-02-01' from sucursales where nombre='dodo-3';
  insert into apertura_items(id,proyecto_id,clave,tipo,etapa,nombre,fuente,original,estado,categoria,cantidad,precio) values
   ('${ITEM_B}','${P1}','E-001','equipo','P4','Horno','t','{}','por_cotizar','equipo_cocina',2,100),
   ('${ITEM_C}','${P2}','T-001','actividad','P1','Permiso','t','{}','pendiente',null,null,null),
   ('${ITEM_X}','${P1}','T-003','actividad','P2','Fachada','t','{}','pendiente',null,null,null),
   ('${LEGADO}','${P1}','T-004','actividad','P3','Instalación','t','{}','pendiente',null,null,null);
  update apertura_items set precio=50,cantidad=1 where id='${ITEM}';
  update apertura_items set responsable='Julio Veredeja' where id='${LEGADO}';
  insert into apertura_planos(id,proyecto_id,hoja,nombre,version_fecha,archivo,imagen,ancho,alto) values
   ('${PLANO1}','${P1}','E01','Planta','2026-11-25','${P1}/a.pdf','${P1}/a.png',10,10),('${PLANO2}','${P2}','E01','Planta','2026-11-25','${P2}/a.pdf','${P2}/a.png',10,10);
  insert into apertura_plano_marcas(plano_id,item_id,x,y) values('${PLANO1}','${ITEM}',0.1,0.1),('${PLANO1}','${ITEM_B}',0.2,0.2),('${PLANO2}','${ITEM_C}',0.3,0.3);
  insert into apertura_item_dodo(item_id,proyecto_id,foto_real,foto_proyecto) values('${ITEM}','${P1}','${P1}/real-a.png',null),('${ITEM_B}','${P1}',null,'${P1}/proy-b.png');
  insert into storage.objects(bucket_id,name) values('aperturas-planos','${P1}/a.png'),('aperturas-planos','${P2}/a.png'),('aperturas-planos','sin-carpeta.png'),
   ('aperturas-fotos','${P1}/real-a.png'),('aperturas-fotos','${P1}/proy-b.png'),('aperturas-fotos','${P2}/otra.png');
  insert into apertura_proyecto_historial(proyecto_id,anterior,nuevo,usuario_id) values('${P1}','{}','{}','${ADMIN}');`);
 for(const [i,r] of [[ITEM,A],[ITEM_B,B],[ITEM_C,B],[ITEM_X,X]])await db.query(`update apertura_items set responsable_id=$1 where id=$2`,[r,i]);
 await db.exec(`insert into apertura_historial(item_id,anterior,nuevo,usuario_id) select id,'{}','{}','${ADMIN}' from apertura_items;
  insert into apertura_bitacora(item_id,comentario,usuario_id) select id,'Inicio','${ADMIN}' from apertura_items;`);
 return {A,B,X};
};
const ids=async(db,sql)=>(await db.query(sql)).rows.map(r=>Object.values(r)[0]).sort();
const rev=async(db,id)=>(await db.query(`select revision from apertura_items where id=$1`,[id])).rows[0].revision;
const actualizar=async(db,id,datos,revision)=>db.query(`select public.actualizar_apertura_item($1,$2,$3::jsonb)`,[id,revision??await rev(db,id),JSON.stringify(datos)]);
const fila=async(db,id)=>(await db.query(`select * from apertura_items where id=$1`,[id])).rows[0];

test('visibilidad: cada responsable ve solo sus registros y sus aperturas; admin y corporativo, todo; el rol aperturas sin registros, nada',async()=>{
 const db=new PGlite();
 try{await escenario(db);
  const todos=[ITEM,ITEM_B,ITEM_C,ITEM_X,LEGADO].sort();
  const vista=u=>sesion(db,u,async()=>({
   items:await ids(db,`select id from apertura_items`),proyectos:await ids(db,`select id from apertura_proyectos`),
   historial:await ids(db,`select distinct item_id from apertura_historial`),bitacora:await ids(db,`select distinct item_id from apertura_bitacora`),
   marcas:await ids(db,`select item_id from apertura_plano_marcas`),planos:await ids(db,`select id from apertura_planos`),
   dodo:await ids(db,`select item_id from apertura_item_dodo`),proyHist:(await db.query(`select count(*)::int n from apertura_proyecto_historial`)).rows[0].n,
   colores:(await db.query(`select count(*)::int n from apertura_colores`)).rows[0].n}));
  for(const u of [ADMIN,CORP]){const v=await vista(u);
   assert.deepEqual(v.items,todos);assert.deepEqual(v.proyectos,[P1,P2].sort());assert.deepEqual(v.historial,todos);assert.deepEqual(v.bitacora,todos);
   assert.equal(v.marcas.length,3);assert.equal(v.planos.length,2);assert.equal(v.dodo.length,2);assert.equal(v.proyHist,1);}
  const a=await vista(OPER);
  assert.deepEqual(a,{items:[ITEM],proyectos:[P1],historial:[ITEM],bitacora:[ITEM],marcas:[ITEM],planos:[PLANO1],dodo:[ITEM],proyHist:0,colores:0});
  const b=await vista(OPER2);
  assert.deepEqual(b.items,[ITEM_B,ITEM_C].sort());assert.deepEqual(b.proyectos,[P1,P2].sort());assert.deepEqual(b.marcas,[ITEM_B,ITEM_C].sort());
  assert.deepEqual(b.planos,[PLANO1,PLANO2].sort());assert.deepEqual(b.dodo,[ITEM_B]);assert.equal(b.proyHist,0);
  // Rol aperturas sin fila en el catálogo, y luego con fila pero sin registros: no ve nada.
  const nada={items:[],proyectos:[],historial:[],bitacora:[],marcas:[],planos:[],dodo:[],proyHist:0,colores:0};
  assert.deepEqual(await vista(APERT),nada);
  await como(db,ADMIN);await guardar(db,null,'Solo aperturas',APERT,false);
  assert.deepEqual(await vista(APERT),nada);
  // Inactivo con registros asignados: nada.
  await como(db,ADMIN);const ri=await guardar(db,null,'Inactivo',INACT,false);
  await db.query(`update apertura_items set responsable_id=$1 where id=$2`,[ri,ITEM_X]);
  assert.deepEqual(await vista(INACT),nada);
  // Las funciones de acceso dicen lo mismo.
  await como(db,OPER);
  assert.deepEqual((await db.query(`select public.ve_item_apertura($1) a,public.ve_item_apertura($2) b,public.ve_proyecto_apertura($3) p1,public.ve_proyecto_apertura($4) p2`,[ITEM,ITEM_B,P1,P2])).rows[0],{a:true,b:false,p1:true,p2:false});
  // Quitarle el registro le quita la apertura.
  await db.query(`update apertura_items set responsable_id=null where id=$1`,[ITEM]);
  assert.deepEqual((await vista(OPER)).proyectos,[]);
 }finally{await db.close();}
});

test('buckets: el responsable lee los planos de sus aperturas y solo las fotos de sus registros',async()=>{
 const db=new PGlite();
 try{await escenario(db);
  const ver=u=>sesion(db,u,()=>ids(db,`select bucket_id||':'||name from storage.objects`));
  assert.deepEqual(await ver(OPER),[`aperturas-fotos:${P1}/real-a.png`,`aperturas-planos:${P1}/a.png`].sort());
  assert.deepEqual(await ver(OPER2),[`aperturas-fotos:${P1}/proy-b.png`,`aperturas-planos:${P1}/a.png`,`aperturas-planos:${P2}/a.png`].sort());
  assert.equal((await ver(CORP)).length,6);
  assert.deepEqual(await ver(APERT),[]);
  // Sigue sin poder subir ni borrar.
  await db.exec('grant insert,delete on storage.objects to authenticated');
  await sesion(db,OPER,async()=>{
   await rechaza(db.exec(`insert into storage.objects(bucket_id,name) values('aperturas-fotos','${P1}/00000000-0000-0000-0000-000000000999.png')`),/row-level security/);
   await db.exec(`delete from storage.objects where bucket_id='aperturas-planos' and name='${P1}/a.png'`);
  });
  assert.equal((await ver(CORP)).length,6);
 }finally{await db.close();}
});

test('edición acotada: el responsable cambia estado, fechas, notas y evidencia de lo suyo, y nada más',async()=>{
 const db=new PGlite();
 try{await escenario(db);await como(db,OPER);
  await actualizar(db,ITEM,{estado:'en_curso',inicio:'2026-12-01',fin:'2026-12-05',notas:'Voy',evidencia:''});
  let f=await fila(db,ITEM);
  assert.deepEqual({estado:f.estado,notas:f.notas,precio:Number(f.precio),cantidad:Number(f.cantidad),responsable:f.responsable,nombre:f.nombre},
   {estado:'en_curso',notas:'Voy',precio:50,cantidad:1,responsable:'Operador A',nombre:'x'});
  assert.equal(f.inicio.toISOString().slice(0,10),'2026-12-01');
  // Solo notas: conserva el estado.
  await actualizar(db,ITEM,{notas:'Sigue'});assert.equal((await fila(db,ITEM)).estado,'en_curso');
  for(const k of ['precio','nombre','cantidad','recibido','responsable','responsable_id','descripcion','orden_id','factura_id','categoria']){
   await rechaza(actualizar(db,ITEM,{estado:'en_curso',[k]:k==='precio'?'1':''}),new RegExp(`Solo administración puede cambiar ${k}`));
  }
  await rechaza(actualizar(db,ITEM,{estado:'en_curso',inventado:'1'}),/Datos de apertura inválidos/);
  await rechaza(actualizar(db,ITEM,{estado:'pedido'}),/Estado inválido/);
  await rechaza(actualizar(db,ITEM,{estado:'completado',evidencia:'ok'}),/Registra evidencia/);
  await rechaza(actualizar(db,ITEM,{estado:'en_curso'},1),/El registro cambió/);
  await actualizar(db,ITEM,{estado:'completado',evidencia:'Foto en carpeta'});
  f=await fila(db,ITEM);assert.equal(f.estado,'completado');assert.equal(Number(f.precio),50);
  // Lo ajeno: mismo mensaje exista o no, sin filtrar nada.
  await rechaza(actualizar(db,ITEM_B,{estado:'por_cotizar'}),/Solo administración puede editar aperturas/);
  await rechaza(actualizar(db,'00000000-0000-0000-0000-0000000000ff',{estado:'pendiente'},1),/Solo administración puede editar aperturas/);
  for(const u of [CORP,APERT]){await como(db,u);await rechaza(actualizar(db,ITEM_X,{estado:'en_curso'}),/Solo administración puede editar aperturas/);}
  // El historial registra quién y qué.
  const h=(await db.query(`select usuario_id,anterior->>'notas' a,nuevo->>'notas' n from apertura_historial where item_id=$1 and nuevo->>'notas'='Sigue' and anterior->>'notas'='Voy'`,[ITEM])).rows;
  assert.deepEqual(h,[{usuario_id:OPER,a:'Voy',n:'Sigue'}]);
 }finally{await db.close();}
});

test('admin: cambia nombre, descripción y responsable con historial; el texto sigue al catálogo',async()=>{
 const db=new PGlite();
 try{const {A,X}=await escenario(db);await como(db,ADMIN);
  await actualizar(db,ITEM,{estado:'pendiente',nombre:'  Trámite de licencia  ',descripcion:'Con planos sellados'});
  const h=(await db.query(`select anterior->>'nombre' a,nuevo->>'nombre' n,nuevo->>'descripcion' d,usuario_id from apertura_historial where item_id=$1 order by fecha desc,id limit 1`,[ITEM])).rows[0];
  assert.deepEqual(h,{a:'x',n:'Trámite de licencia',d:'Con planos sellados',usuario_id:ADMIN});
  // La clave no cambia y lo que no se manda se conserva (las pantallas actuales mandan todo; antes una clave ausente se vaciaba).
  assert.deepEqual([(await fila(db,ITEM)).clave,Number((await fila(db,ITEM)).precio),Number((await fila(db,ITEM)).cantidad)],['T-001',50,1]);
  await rechaza(actualizar(db,ITEM,{nombre:'   '}),/nombre de 1 a 300/);
  await rechaza(actualizar(db,ITEM,{nombre:'n'.repeat(301)}),/nombre de 1 a 300/);
  await rechaza(actualizar(db,ITEM,{descripcion:'d'.repeat(4001)}),/demasiado largo/);
  await actualizar(db,ITEM,{descripcion:''});assert.equal((await fila(db,ITEM)).descripcion,null);
  // Responsable: del catálogo y activo.
  await actualizar(db,ITEM,{responsable_id:X});assert.equal((await fila(db,ITEM)).responsable,'César');
  await guardar(db,A,'Operador A',OPER,false,false);
  await rechaza(actualizar(db,ITEM,{responsable_id:A}),/responsable no existe o está inactivo/);
  await rechaza(actualizar(db,ITEM,{responsable_id:'00000000-0000-0000-0000-0000000000ff'}),/responsable no existe o está inactivo/);
  // Con responsable_id, el texto que manda la pantalla vieja se ignora.
  await actualizar(db,ITEM,{estado:'pendiente',responsable:'Otro texto'});assert.equal((await fila(db,ITEM)).responsable,'César');
  await actualizar(db,ITEM,{responsable_id:''});const f=await fila(db,ITEM);assert.deepEqual([f.responsable_id,f.responsable],[null,null]);
  // Admin sigue editando precio y cantidades como antes.
  await actualizar(db,ITEM_B,{estado:'recibido',cantidad:'2',recibido:'2',precio:'120',evidencia:'Llegó completo'});
  assert.equal(Number((await fila(db,ITEM_B)).precio),120);
  await rechaza(actualizar(db,ITEM_B,{estado:'recibido',recibido:'1'}),/recepción completa/);
 }finally{await db.close();}
});

test('legado: el texto de un registro sin responsable_id se conserva y solo admin lo cambia',async()=>{
 const db=new PGlite();
 try{await escenario(db);await como(db,ADMIN);
  const txt=async()=>(await fila(db,LEGADO)).responsable;
  await actualizar(db,LEGADO,{estado:'en_curso'});assert.equal(await txt(),'Julio Veredeja');
  await db.query(`update apertura_items set responsable_id=null where id=$1`,[LEGADO]);assert.equal(await txt(),'Julio Veredeja');
  await db.query(`update apertura_items set notas='x' where id=$1`,[LEGADO]);assert.equal(await txt(),'Julio Veredeja');
  // La pantalla vieja manda el texto completo: se respeta mientras no haya responsable_id.
  await actualizar(db,LEGADO,{estado:'en_curso',responsable:'Julio Verdeja',inicio:'',fin:'',notas:''});assert.equal(await txt(),'Julio Verdeja');
  await rechaza(actualizar(db,LEGADO,{responsable:'r'.repeat(201)}),/demasiado largo/);
 }finally{await db.close();}
});

test('bitácora: la agrega el responsable o admin; la rechaza un tercero; valida sus campos',async()=>{
 const db=new PGlite();
 try{await escenario(db);
  const agregar=(item,fecha,avance,estatus,comentario)=>db.query(`select public.agregar_bitacora_apertura($1,$2,$3,$4,$5) id`,[item,fecha,avance,estatus,comentario]).then(r=>r.rows[0].id);
  await como(db,OPER);
  const id=await agregar(ITEM,null,40,' Avanzando ','Se colaron cimientos');
  const r=(await db.query(`select item_id,avance,estatus,comentario,usuario_id,fecha=(now() at time zone 'America/Mexico_City')::date hoy from apertura_bitacora where id=$1`,[id])).rows[0];
  assert.deepEqual(r,{item_id:ITEM,avance:40,estatus:'Avanzando',comentario:'Se colaron cimientos',usuario_id:OPER,hoy:true});
  await agregar(ITEM,'2026-11-01',null,null,'Atrasado un día');
  await rechaza(agregar(ITEM_B,null,null,null,'No es mío'),/Solo administración o el responsable/);
  await rechaza(agregar(ITEM,null,101,null,'x'),/avance debe ser de 0 a 100/);
  await rechaza(agregar(ITEM,null,null,'e'.repeat(81),'x'),/estatus/);
  await rechaza(agregar(ITEM,null,null,null,'   '),/comentario de 1 a 2000/);
  await rechaza(agregar(ITEM,'2099-01-01',null,null,'Futuro'),/fecha no puede ser futura/);
  for(const u of [CORP,APERT,OPER2]){await como(db,u);await rechaza(agregar(ITEM,null,null,null,'Hola'),/Solo administración o el responsable/);}
  await como(db,ADMIN);await agregar(ITEM_B,null,null,null,'Admin escribe');
  await rechaza(agregar('00000000-0000-0000-0000-0000000000ff',null,null,null,'x'),/no existe/);
  await sesion(db,OPER,async()=>{
   await rechaza(db.exec(`insert into apertura_bitacora(item_id,comentario,usuario_id) values('${ITEM}','x','${OPER}')`),/permission denied/);
   assert.equal((await db.query(`select count(*)::int n from apertura_bitacora`)).rows[0].n,3);
  });
 }finally{await db.close();}
});

test('alta completa: solo admin, en un paso, con responsable del catálogo y el mismo generador de clave',async()=>{
 const db=new PGlite();
 try{const {A,X}=await escenario(db);
  const crear=(...a)=>db.query(`select public.crear_apertura_item_completo($1,$2,$3,$4,$5,$6,$7,$8,$9) id`,a).then(r=>r.rows[0].id);
  for(const u of [CORP,OPER]){await como(db,u);await rechaza(crear(P1,'actividad','P2',null,'Nueva',null,A,null,null),/Solo administración/);}
  await como(db,ADMIN);
  const id=await crear(P1,'actividad','P5','iluminacion',' Instalar luminarias ','Todas las del área de comedor',A,'2026-12-01','2026-12-03');
  const f=await fila(db,id);
  assert.deepEqual({nombre:f.nombre,descripcion:f.descripcion,tipo:f.tipo,etapa:f.etapa,categoria:f.categoria,responsable_id:f.responsable_id,responsable:f.responsable,estado:f.estado,fuente:f.fuente},
   {nombre:'Instalar luminarias',descripcion:'Todas las del área de comedor',tipo:'actividad',etapa:'P5',categoria:'iluminacion',responsable_id:A,responsable:'Operador A',estado:'pendiente',fuente:'Alta manual'});
  assert.match(f.clave,/^MAN-[0-9a-f-]{36}$/);
  assert.equal((await db.query(`select count(*)::int n from apertura_historial where item_id=$1 and anterior='{}'::jsonb`,[id])).rows[0].n,1);
  const eq=await crear(P1,'equipo','P4','',' Campana ','',null,null,null);
  assert.deepEqual([(await fila(db,eq)).estado,(await fila(db,eq)).descripcion,(await fila(db,eq)).categoria],['por_cotizar',null,null]);
  await rechaza(crear(P1,'referencia','P4',null,'R',null,null,null,null),/inválidos/);
  await rechaza(crear(P1,'actividad','P9',null,'R',null,null,null,null),/inválidos/);
  await rechaza(crear(P1,'actividad','P1',null,'n'.repeat(301),null,null,null,null),/nombre de 1 a 300/);
  await rechaza(crear(P1,'actividad','P1',null,'Ok','d'.repeat(4001),null,null,null),/demasiado largo/);
  await rechaza(crear(P1,'actividad','P1',null,'Ok',null,null,'2026-12-05','2026-12-01'),/fin no puede ser anterior/);
  await rechaza(crear('00000000-0000-0000-0000-0000000000ff','actividad','P1',null,'Ok',null,null,null,null),/apertura no existe/);
  await guardar(db,X,'César',null,true,false);
  await rechaza(crear(P1,'actividad','P1',null,'Ok',null,X,null,null),/responsable no existe o está inactivo/);
  // Ve el registro el responsable asignado.
  assert.deepEqual(await sesion(db,OPER,()=>ids(db,`select id from apertura_items`)),[ITEM,id].sort());
 }finally{await db.close();}
});

test('dividir: crea de 2 a 10 partes con origen_id y deja la original en no_aplica; es atómica',async()=>{
 const db=new PGlite();
 try{const {A,B}=await escenario(db);
  const dividir=(item,partes)=>db.query(`select public.dividir_apertura_item($1,$2::jsonb) claves`,[item,JSON.stringify(partes)]).then(r=>r.rows[0].claves);
  const cuenta=async()=>(await db.query(`select count(*)::int n from apertura_items`)).rows[0].n;
  const parte=(n,extra={})=>({nombre:`Parte ${n}`,...extra});
  for(const u of [CORP,OPER2]){await como(db,u);await rechaza(dividir(ITEM_B,[parte(1),parte(2)]),/Solo administración/);}
  await como(db,ADMIN);const antes=await cuenta(),revAntes=await rev(db,ITEM_B);
  await rechaza(dividir(ITEM_B,[parte(1)]),/de 2 a 10 partes/);
  await rechaza(dividir(ITEM_B,Array.from({length:11},(_,i)=>parte(i))),/de 2 a 10 partes/);
  await rechaza(dividir(ITEM_B,{nombre:'x'}),/de 2 a 10 partes/);
  // Una parte inválida (la última) no deja nada creado ni la original cambiada.
  await rechaza(dividir(ITEM_B,[parte(1),parte(2),{nombre:'  '}]),/nombre de 1 a 300/);
  await rechaza(dividir(ITEM_B,[parte(1),parte(2,{precio:'1'})]),/Datos de la parte/);
  await rechaza(dividir(ITEM_B,[parte(1),parte(2,{inicio:'2026-12-05',fin:'2026-12-01'})]),/fin no puede ser anterior/);
  await rechaza(dividir(ITEM_B,[parte(1),parte(2,{responsable_id:'00000000-0000-0000-0000-0000000000ff'})]),/responsable no existe/);
  await rechaza(dividir(ITEM_B,[parte(1),'texto']),/Datos de la parte/);
  assert.equal(await cuenta(),antes);assert.equal(await rev(db,ITEM_B),revAntes);assert.equal((await fila(db,ITEM_B)).estado,'por_cotizar');
  const claves=await dividir(ITEM_B,[parte(1,{responsable_id:A,descripcion:'Horno 1',inicio:'2026-12-01',fin:'2026-12-02'}),parte(2,{responsable_id:B})]);
  assert.deepEqual(claves,['E-001-1','E-001-2']);
  const nuevas=(await db.query(`select clave,nombre,descripcion,proyecto_id,tipo,etapa,categoria,origen_id,responsable,estado,precio,fuente from apertura_items where origen_id=$1 order by nombre`,[ITEM_B])).rows;
  assert.deepEqual(nuevas.map(n=>n.clave),claves);
  assert.deepEqual(nuevas.map(({clave,...n})=>n),[
   {nombre:'Parte 1',descripcion:'Horno 1',proyecto_id:P1,tipo:'equipo',etapa:'P4',categoria:'equipo_cocina',origen_id:ITEM_B,responsable:'Operador A',estado:'por_cotizar',precio:null,fuente:'División'},
   {nombre:'Parte 2',descripcion:null,proyecto_id:P1,tipo:'equipo',etapa:'P4',categoria:'equipo_cocina',origen_id:ITEM_B,responsable:'Gerente B',estado:'por_cotizar',precio:null,fuente:'División'}]);
  const o=await fila(db,ITEM_B);
  assert.deepEqual([o.estado,o.evidencia,o.revision],['no_aplica',`Dividida en ${claves.join(', ')}`,revAntes+1]);
  const h=(await db.query(`select anterior->>'estado' a,nuevo->>'estado' n from apertura_historial where item_id=$1 and nuevo->>'estado'='no_aplica'`,[ITEM_B])).rows;
  assert.deepEqual(h,[{a:'por_cotizar',n:'no_aplica'}]);
  assert.equal((await db.query(`select count(*)::int n from apertura_historial h join apertura_items i on i.id=h.item_id where i.origen_id=$1`,[ITEM_B])).rows[0].n,2);
  await rechaza(dividir(ITEM_B,[parte(1),parte(2)]),/ya no aplica/);
  // Diez partes, saltando una clave que ya existe en la apertura.
  await db.exec(`insert into apertura_items(proyecto_id,clave,tipo,etapa,nombre,fuente,original) values('${P1}','T-003-1','actividad','P2','Ya existía','t','{}')`);
  assert.deepEqual(await dividir(ITEM_X,Array.from({length:10},(_,i)=>parte(i))),Array.from({length:10},(_,i)=>`T-003-${i+2}`));
  assert.equal((await fila(db,ITEM_X)).evidencia,`Dividida en ${Array.from({length:10},(_,i)=>`T-003-${i+2}`).join(', ')}`);
  // La parte asignada a OPER le aparece; la original, no.
  assert.ok((await sesion(db,OPER,()=>ids(db,`select nombre from apertura_items`))).includes('Parte 1'));
 }finally{await db.close();}
});

test('security definer: toda función que lee apertura_* exige acceso o no se puede ejecutar; un responsable no usa las de administración',async()=>{
 // Última definición de cada función, en orden de archivo.
 const {readdirSync}=await import('node:fs');
 const dir='supabase/migrations/',defs=new Map();
 for(const f of readdirSync(new URL('../'+dir,import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
  const sql=load(dir+f).replace(/--[^\n]*/g,'');
  for(const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\$(\w*)\$([\s\S]*?)\$\3\$/gi))defs.set(m[1],{archivo:f,cabecera:m[2],cuerpo:m[4]});
 }
 const leen=[...defs].filter(([,d])=>/security\s+definer/i.test(d.cabecera)&&/public\.(apertura_|inversion_apertura_)/.test(d.cuerpo));
 // Revisadas a mano: o están cerradas a authenticated, o son disparadores, o filtran por la tarea visible.
 const revisadas={
  documento_tarea:'revocada a authenticated (20261102120000_tareas.sql:346); la llaman funciones que ya filtran',
  pendientes_tareas_automaticas:'revocada a authenticated; solo generar_tareas_automaticas (service_role) y resumen (admin)',
  tarea_automatica_resuelta:'revocada a authenticated',
  completar_apertura_por_pendientes:'disparador; revocada a authenticated',
  sincronizar_responsable_item:'disparador; revocada',sincronizar_nombre_responsable:'disparador; revocada',
  mi_responsable_id:'solo devuelve el id propio',
  ve_item_apertura:'función de acceso',ve_proyecto_apertura:'función de acceso',
  ve_carpeta_apertura_responsable:'función de acceso',ve_foto_apertura_responsable:'función de acceso',
 };
 const guardas=/public\.(edita_compras|ve_compras|edita_finanzas|ve_finanzas|mi_responsable_id)\(\)|mi_rol\(\)::text,''\)<>'admin'/;
 const sinGuarda=leen.filter(([n,d])=>!revisadas[n]&&!guardas.test(d.cuerpo)).map(([n,d])=>`${n} (${d.archivo})`);
 assert.deepEqual(sinGuarda,[]);
 assert.ok(leen.length>=20,`solo ${leen.length} funciones encontradas`);
 // Comportamiento: un responsable con registro no puede usar las funciones de administración de aperturas.
 const db=new PGlite();
 try{await escenario(db);await como(db,OPER);
  const llamadas=[
   [`select public.agregar_apertura_item('${P1}','actividad','P1','x',null)`],
   [`select public.actualizar_apertura_proyecto('${P1}',1,'y','2026-01-01','2026-02-01',null)`],
   [`select public.guardar_apertura_plano('${P1}','E02','x','2026-11-25','${P1}/a.pdf','${P1}/a.png',10,10,null)`],
   [`select public.colocar_apertura_marca('${PLANO1}','${ITEM}',0.5,0.5)`],
   [`select public.quitar_apertura_marca('${PLANO1}','${ITEM}')`],
   [`select public.borrar_apertura_plano('${PLANO1}')`],
   [`select public.importar_apertura_dodo('${P1}','[]'::jsonb)`],
   [`select public.guardar_foto_real('${ITEM}',null)`],
   [`select public.guardar_color_apertura('etapa','P1','#aabbcc')`],
   [`select public.guardar_responsable_apertura(null,'Yo',null,true,true)`],
  ];
  for(const [sql] of llamadas)await rechaza(db.exec(sql),/Solo administración/);
  assert.equal((await db.query(`select count(*)::int n from apertura_plano_marcas`)).rows[0].n,3);
  // Las funciones nuevas de acceso son ejecutables por authenticated y no por anon.
  for(const f of ['ve_item_apertura(uuid)','ve_proyecto_apertura(uuid)','agregar_bitacora_apertura(uuid,date,integer,text,text)','dividir_apertura_item(uuid,jsonb)',
   'crear_apertura_item_completo(uuid,text,text,text,text,text,uuid,date,date)'])
   assert.deepEqual((await db.query(`select has_function_privilege('authenticated','public.${f}','EXECUTE') a,has_function_privilege('anon','public.${f}','EXECUTE') n`)).rows[0],{a:true,n:false});
 }finally{await db.close();}
});

test('migración: ningún update ni delete sin where (safeupdate) y toda security definer fija search_path',()=>{
 const sinComentarios=resp.replace(/--[^\n]*/g,'');
 const updates=sinComentarios.match(/\bupdate\s+public\.\w+(\s+\w+)?\s+set\b[^;]*;/gi)??[];
 assert.ok(updates.length>=4);
 for(const u of updates)assert.match(u,/\bwhere\b/i,`update sin where: ${u}`);
 for(const d of sinComentarios.match(/\bdelete\s+from\s+public\.\w+[^;]*;/gi)??[])assert.match(d,/\bwhere\b/i,`delete sin where: ${d}`);
 assert.equal((sinComentarios.match(/security definer set search_path=''/g)??[]).length,(sinComentarios.match(/security definer/g)??[]).length);
 assert.match(sinComentarios,/commit;\s*$/);
});

test('prueba SQL de producción: termina en PRUEBAS OK y no deja nada',async()=>{
 const pruebas=load('supabase/pruebas/20261127160000_aperturas_responsables.sql');
 const db=new PGlite();
 try{await escenario(db);
  const conteo=async()=>(await db.query(`select (select count(*) from apertura_items)+(select count(*) from apertura_responsables)+(select count(*) from apertura_bitacora)+(select count(*) from apertura_historial) n`)).rows[0].n;
  const antes=await conteo();
  await rechaza(db.exec(pruebas),/^PRUEBAS OK.*usuario responsable: ve solo su registro/);
  assert.equal(await conteo(),antes);
  // Sin perfiles no admin libres: también termina bien (se salta la parte del responsable con usuario).
  await db.exec(`update perfiles set rol='admin',sucursal_id=(select id from sucursales limit 1) where rol::text not in ('admin','corporativo')`);
  await rechaza(db.exec(pruebas),/^PRUEBAS OK(?!.*usuario responsable)/);
 }finally{await db.close();}
});

test('usuarios e invitaciones aceptan el puesto aperturas sin sucursal y rechazan roles desconocidos',async()=>{
 const db=new PGlite();
 try{await preparar(db);await como(db,ADMIN);
  const suc=(await db.query('select id from sucursales limit 1')).rows[0].id;
  const orig=JSON.stringify({id:OPER,nombre:'Operación',rol:'operacion',sucursal_id:suc,activo:true,debe_cambiar_contrasena:false});
  await rechaza(db.query(`select public.administrar_usuario($1,$2::jsonb,'Operación','inventado',$3,true,'Pasa a aperturas')`,[OPER,orig,suc]),/Rol o estado inválido/);
  // Con sucursal enviada, la función la fuerza a null (oficina o externo).
  await db.query(`select public.administrar_usuario($1,$2::jsonb,'Operación','aperturas',$3,true,'Pasa a aperturas')`,[OPER,orig,suc]);
  const u=(await db.query('select rol::text r,sucursal_id s from perfiles where id=$1',[OPER])).rows[0];
  assert.equal(u.r,'aperturas');assert.equal(u.s,null);
  // La restricción de perfiles exige null para aperturas y sucursal para el resto.
  await rechaza(db.exec(`update perfiles set sucursal_id='${suc}' where id='${OPER}'`),/perfiles_sin_sucursal/);
  await rechaza(db.exec(`update perfiles set sucursal_id=null where id='${OPER2}'`),/perfiles_sin_sucursal/);
  const inv='00000000-0000-0000-0000-0000000000aa',env='00000000-0000-0000-0000-0000000000ab';
  await rechaza(db.query(`select public.preparar_invitacion_usuario($1,$2,'a@x.mx','Ana Perez','inventado',$3)`,[inv,env,suc]),/Rol inválido/);
  await db.query(`select public.preparar_invitacion_usuario($1,$2,'a@x.mx','Ana Perez','aperturas',$3)`,[inv,env,suc]);
  const i=(await db.query('select rol::text r,sucursal_id s from usuarios_invitaciones where id=$1',[inv])).rows[0];
  assert.equal(i.r,'aperturas');assert.equal(i.s,null);
 }finally{await db.close();}
});
