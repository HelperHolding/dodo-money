import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261127160000_ventas_permiso_rapido.sql');
const pruebas=load('supabase/pruebas/20261127160000_ventas_permiso_rapido.sql');
const A='00000000-0000-0000-0000-00000000000a',B='00000000-0000-0000-0000-00000000000b';
const U=n=>`00000000-0000-0000-0000-0000000000${n}`;
// Perfiles: [rol, sucursal, id, activo, debe_cambiar_contrasena]
const ROLES={adm:['admin',A,'e1'],cor:['corporativo',null,'e2'],ger:['gerente',A,'e3'],gerB:['gerente',B,'e4'],enc:['encargado',A,'e5'],ope:['operacion',A,'e6'],mkt:['marketing',A,'e7'],gerTemp:['gerente',A,'e8',true,true],gerBaja:['gerente',A,'e9',false,false]};
const TABLAS=['ventas_dia','ventas_dia_desglose','ventas_producto','importaciones_ventas','pedidos','pedido_productos','rappi_ordenes','rappi_lineas','ventas_conciliaciones'];

async function base(){
 const db=new PGlite();
 // Stubs que copian lo real: enum rol_usuario (0001/0004/0008), mi_sucursal/mi_rol (0048), ve_todas_las_sucursales (0004),
 // ve_ventas (0006) y las políticas de lectura originales de 0006, 0007, 0032 y 0034 (con sus mismos nombres).
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create type rol_usuario as enum ('operacion','encargado','gerente','admin','corporativo','marketing');
 create table sucursales(id uuid primary key);insert into sucursales values('${A}'),('${B}');
 create table perfiles(id uuid primary key,rol rol_usuario not null default 'operacion',sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$ select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create function public.mi_sucursal() returns uuid language sql stable security definer set search_path='' as $$ select sucursal_id from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create function ve_todas_las_sucursales() returns boolean language sql stable security definer set search_path=public as $$ select coalesce(mi_rol()::text in ('admin','corporativo'),false) $$;
 create function ve_ventas(p_sucursal uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce((p_sucursal = mi_sucursal() and mi_rol()::text in ('gerente','admin')) or ve_todas_las_sucursales(), false) $$;
 create table importaciones_ventas(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),fecha date not null);
 create table ventas_dia(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),fecha date not null,total numeric(12,2) not null default 0,importacion_id uuid not null references importaciones_ventas(id),unique(sucursal_id,fecha));
 create table ventas_dia_desglose(ventas_dia_id uuid not null references ventas_dia(id) on delete cascade,tipo text not null,total numeric(12,2) not null default 0,primary key(ventas_dia_id,tipo));
 create table ventas_producto(sucursal_id uuid not null references sucursales(id),fecha date not null,dodo_id integer not null,importe numeric(12,2) not null,primary key(sucursal_id,fecha,dodo_id));
 create table pedidos(dodo_id text primary key,sucursal_id uuid not null references sucursales(id),fecha date not null,total numeric(12,2) not null);
 create table pedido_productos(pedido_id text not null references pedidos(dodo_id) on delete cascade,renglon integer not null,nombre text not null,primary key(pedido_id,renglon));
 create table rappi_ordenes(rappi_id text primary key,sucursal_id uuid not null references sucursales(id),fecha date not null,subtotal_restaurante numeric(16,2) not null);
 create table rappi_lineas(rappi_id text not null references rappi_ordenes(rappi_id) on delete cascade,linea integer not null,importe numeric(16,2) not null,primary key(rappi_id,linea));
 create table ventas_conciliaciones(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),fecha date not null,importacion_id uuid not null references importaciones_ventas(id));
 ${TABLAS.map(t=>`alter table ${t} enable row level security;grant select on ${t} to authenticated;`).join('\n')}
 grant select on perfiles, sucursales to authenticated;
 create policy ver_importaciones on importaciones_ventas for select using (ve_ventas(sucursal_id));
 create policy ver_ventas_dia on ventas_dia for select using (ve_ventas(sucursal_id));
 create policy ver_ventas_desglose on ventas_dia_desglose for select using (exists (select 1 from ventas_dia v where v.id = ventas_dia_id and ve_ventas(v.sucursal_id)));
 create policy ver_ventas_producto on ventas_producto for select using (ve_ventas(sucursal_id));
 create policy ver_pedidos on pedidos for select using (ve_ventas(sucursal_id));
 create policy ver_pedido_productos on pedido_productos for select using (exists (select 1 from pedidos p where p.dodo_id = pedido_id and ve_ventas(p.sucursal_id)));
 create policy leer_rappi_ordenes on rappi_ordenes for select using(ve_ventas(sucursal_id));
 create policy leer_rappi_lineas on rappi_lineas for select using(exists(select 1 from rappi_ordenes o where o.rappi_id=rappi_lineas.rappi_id and ve_ventas(o.sucursal_id)));
 create policy leer_conciliaciones on ventas_conciliaciones for select using(ve_ventas(sucursal_id));`);
 for(const [rol,suc,n,activo=true,debe=false] of Object.values(ROLES))await db.query('insert into perfiles(id,rol,sucursal_id,activo,debe_cambiar_contrasena) values($1,$2,$3,$4,$5)',[U(n),rol,suc,activo,debe]);
 // Un día de cada sucursal con todo lo que cuelga de él, en fechas recientes para el script de producción.
 for(const [s,k] of [[A,'a'],[B,'b']]){
  const hoy=`(now() at time zone 'America/Mexico_City')::date - 1`;
  await db.exec(`insert into importaciones_ventas(id,sucursal_id,fecha) values('00000000-0000-0000-0000-0000000000${k}1','${s}',${hoy});
  insert into ventas_dia(id,sucursal_id,fecha,total,importacion_id) values('00000000-0000-0000-0000-0000000000${k}2','${s}',${hoy},100,'00000000-0000-0000-0000-0000000000${k}1');
  insert into ventas_dia_desglose values('00000000-0000-0000-0000-0000000000${k}2','entrega',60),('00000000-0000-0000-0000-0000000000${k}2','app',40);
  insert into ventas_producto values('${s}',${hoy},1,50),('${s}',${hoy},2,50);
  insert into pedidos values('P${k}1','${s}',${hoy},60),('P${k}2','${s}',${hoy},40);
  insert into pedido_productos values('P${k}1',1,'x'),('P${k}1',2,'y'),('P${k}2',1,'z');
  insert into rappi_ordenes values('1000${k==='a'?1:2}','${s}',${hoy},30);
  insert into rappi_lineas values('1000${k==='a'?1:2}',1,30);
  insert into ventas_conciliaciones(sucursal_id,fecha,importacion_id) values('${s}',${hoy},'00000000-0000-0000-0000-0000000000${k}1');`);
 }
 return db;
}
const como=async(db,k)=>{await db.exec(`reset role;select set_config('request.jwt.claims','{"sub":"${U(ROLES[k][2])}","role":"authenticated"}',false);set role authenticated`);};
/** Cuántos renglones de cada tabla ve el perfil, y de qué sucursales. */
async function visto(db,k){
 await como(db,k);
 const out={};
 for(const t of TABLAS)out[t]=Number((await db.query(`select count(*) n from ${t}`)).rows[0].n);
 out.sucursales=(await db.query(`select array_agg(distinct sucursal_id::text order by sucursal_id::text) s from ventas_dia`)).rows[0].s??[];
 await db.exec('reset role');
 return out;
}

test('cada perfil ve exactamente lo mismo antes y después de la migración',async()=>{
 const db=await base();
 try{
  const antes={};for(const k of Object.keys(ROLES))antes[k]=await visto(db,k);
  await db.exec(migracion);
  for(const k of Object.keys(ROLES))assert.deepEqual(await visto(db,k),antes[k],k);
  // Y lo esperado en concreto: admin y corporativo todo; gerente solo la suya; los demás nada.
  const todo={ventas_dia:2,ventas_dia_desglose:4,ventas_producto:4,importaciones_ventas:2,pedidos:4,pedido_productos:6,rappi_ordenes:2,rappi_lineas:2,ventas_conciliaciones:2,sucursales:[A,B]};
  assert.deepEqual(antes.adm,todo);assert.deepEqual(antes.cor,todo);
  assert.deepEqual(antes.ger,{ventas_dia:1,ventas_dia_desglose:2,ventas_producto:2,importaciones_ventas:1,pedidos:2,pedido_productos:3,rappi_ordenes:1,rappi_lineas:1,ventas_conciliaciones:1,sucursales:[A]});
  assert.deepEqual(antes.gerB.sucursales,[B]);
  for(const k of ['enc','ope','mkt','gerTemp','gerBaja'])assert.ok(Object.entries(antes[k]).every(([t,v])=>t==='sucursales'?v.length===0:v===0),k);
 }finally{await db.close();}
});

test('el permiso se calcula una vez por consulta (InitPlan), no con ve_ventas por renglón',async()=>{
 const db=await base();
 try{
  await db.exec(migracion);
  const {rows}=await db.query(`select tablename,qual from pg_policies where tablename = any($1) and cmd='SELECT'`,[TABLAS]);
  assert.equal(rows.length,TABLAS.length);
  for(const r of rows){assert.doesNotMatch(r.qual,/ve_ventas/,r.tablename);assert.match(r.qual,/SELECT sucursales_ventas\(\)|SELECT public\.sucursales_ventas\(\)/,r.tablename);}
  await como(db,'ger');
  const plan=(await db.query('explain select * from ventas_producto')).rows.map(r=>r['QUERY PLAN']).join('\n');
  await db.exec('reset role');
  assert.match(plan,/InitPlan/);
 }finally{await db.close();}
});

test('sucursales_ventas: security definer, search_path vacío; anon sin permiso',async()=>{
 const db=await base();
 try{
  await db.exec(migracion);
  const {rows:[f]}=await db.query(`select prosecdef,proconfig from pg_proc where proname='sucursales_ventas'`);
  assert.equal(f.prosecdef,true);assert.ok(f.proconfig.some(c=>/^search_path=("")?$/.test(c)),String(f.proconfig));
  const q=r=>db.query(`select has_function_privilege($1,'public.sucursales_ventas()','execute') p`,[r]).then(x=>x.rows[0].p);
  assert.equal(await q('anon'),false);assert.equal(await q('authenticated'),true);
 }finally{await db.close();}
});

test('el script de pruebas de producción termina en PRUEBAS OK',async()=>{
 const db=await base();
 try{await db.exec(migracion);await assert.rejects(db.exec(pruebas),/PRUEBAS OK/);}finally{await db.close();}
});
