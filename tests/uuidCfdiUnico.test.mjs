import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261127140000_uuid_cfdi_unico.sql');
const pruebas=load('supabase/pruebas/20261127140000_uuid_cfdi_unico.sql');
const extraer=(archivo,re)=>{const m=load(archivo).match(re);assert.ok(m,`no se encontró ${re} en ${archivo}`);return m[0];};
// El trigger real de 0070 sigue vivo junto al nuevo: se monta para comprobar que conviven.
const uuidManual=extraer('supabase/migrations/0070_uuid_manual_factura.sql',/create function public\.validar_uuid_manual_factura[\s\S]*?execute function public\.validar_uuid_manual_factura\(\);/);

const A='00000000-0000-0000-0000-0000000000a1',G='00000000-0000-0000-0000-0000000000a2',RFC='HCM260306B93';
const S='11111111-0000-0000-0000-000000000001',P='22222222-0000-0000-0000-000000000001';
const U1='1DAFB285-3B68-4AC2-AAED-DBB6423832E6',U2='2B2B2B2B-1111-4111-8111-000000000002',U3='3C3C3C3C-1111-4111-8111-000000000003';
// Copia de las estructuras reales (0001, 0013, 0017, 0025, 0026, 0065, 0070, 20261020220000, 20261026155811) con sus CHECK y enums.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid$$;
 create function public.hoy_mx() returns date language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;
 create type public.rol_usuario as enum('admin','gerente','encargado','operacion','corporativo');
 create type public.tipo_comprobante as enum('cfdi','nota','sin_comprobante');
 create type public.origen_gasto as enum('caja_chica','boveda','empleado');
 create type public.tipo_factura as enum('ingreso','egreso');
 create type public.estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create table public.sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);
 insert into public.sucursales values('${S}','Zapopan-1 La Calma');
 create table public.perfiles(id uuid primary key,nombre text not null,rol public.rol_usuario,activo boolean default true,debe_cambiar_contrasena boolean default false,sucursal_id uuid references public.sucursales(id));
 insert into public.perfiles(id,nombre,rol,sucursal_id) values('${A}','Julio','admin',null),('${G}','Ana','gerente','${S}');
 create table public.razones_sociales(rfc text primary key,razon_social text not null);
 insert into public.razones_sociales values('${RFC}','Helper ensayo');
 create table public.proveedores(id uuid primary key default gen_random_uuid(),razon_social text not null,rfc text unique);
 insert into public.proveedores(id,razon_social,rfc) values('${P}','Frutigo','RESA730729J13');
 create table public.facturas(id uuid primary key default gen_random_uuid(),uuid text unique,serie text,folio text,tipo public.tipo_factura not null,fecha_emision date not null,
  rfc_emisor text not null,nombre_emisor text not null,regimen_emisor text not null,rfc_receptor text not null references public.razones_sociales(rfc),
  metodo_pago text check (metodo_pago in ('PUE','PPD')),moneda text not null default 'MXN' check (moneda='MXN'),
  subtotal numeric(14,2) not null,total numeric(14,2) not null check (total>=0),
  proveedor_id uuid not null references public.proveedores(id),sucursal_id uuid references public.sucursales(id),vence_el date not null,
  estado public.estado_factura not null default 'por_pagar',xml_ruta text,pdf_ruta text,motivo_cancelacion text,
  origen text not null default 'cfdi' check (origen in ('cfdi','manual')),
  uuid_manual text check(uuid_manual is null or uuid_manual ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'),
  creado_por uuid references public.perfiles(id) default auth.uid(),creado_en timestamptz not null default now(),
  check (estado <> 'cancelada' or coalesce(trim(motivo_cancelacion), '') <> ''),
  constraint facturas_cfdi_completo check (origen = 'manual' or (uuid is not null and xml_ruta is not null)),
  constraint facturas_manual_con_referencia check (origen = 'cfdi' or coalesce(trim(folio), '') <> ''));
 ${uuidManual}
 create table public.gastos_caja_chica(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references public.sucursales(id),fecha date not null,concepto text not null,proveedor text,
  monto numeric(12,2) not null check (monto>0),comprobante public.tipo_comprobante not null,uuid_cfdi text,registrado_por uuid not null references public.perfiles(id) default auth.uid(),
  creado_en timestamptz not null default now(),origen public.origen_gasto not null default 'caja_chica',pagado_por uuid references public.perfiles(id),
  cuenta_pl text check(cuenta_pl in ('repartidores','marketing_agregadores','marketing','renta','servicios','mantenimiento','consumibles_equipo','otros','insumos')),
  version bigint not null default 1,anulado_en timestamptz,anulado_por uuid references public.perfiles(id),motivo_anulacion text,
  check (comprobante <> 'cfdi' or uuid_cfdi is not null),
  constraint gasto_empleado_dice_quien check ((origen = 'empleado') = (pagado_por is not null)),
  constraint gasto_anulado_con_autor check((anulado_en is null and anulado_por is null and motivo_anulacion is null)
   or(anulado_en is not null and anulado_por is not null and length(trim(motivo_anulacion)) between 5 and 1000)));`;

const factura=(uuid,{id='gen_random_uuid()',sucursal=`'${S}'`,manual=null,origen='cfdi',por=`'${A}'`,creado=`'2026-10-10T02:30:00Z'`}={})=>
 `insert into public.facturas(id,uuid,uuid_manual,origen,folio,tipo,fecha_emision,rfc_emisor,nombre_emisor,regimen_emisor,rfc_receptor,subtotal,total,proveedor_id,sucursal_id,vence_el,xml_ruta,creado_por,creado_en)
  values(${id},${uuid===null?'null':`'${uuid}'`},${manual===null?'null':`'${manual}'`},'${origen}','F1','ingreso','2026-10-09','RESA730729J13','Frutigo','612','${RFC}',10,10,'${P}',${sucursal},'2026-10-09',
  ${origen==='cfdi'?`'xml/x.xml'`:'null'},${por},${creado}) returning id`;
const gasto=(uuid,{anulado=false}={})=>`insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,uuid_cfdi,registrado_por,cuenta_pl,creado_en${anulado?',anulado_en,anulado_por,motivo_anulacion':''})
  values('${S}','2026-11-01','Agua',50,'cfdi','${uuid}','${G}','otros','2026-11-01T18:00:00Z'${anulado?`,now(),'${A}','Captura equivocada'`:''}) returning id`;
const id=async(db,sql)=>(await db.query(sql)).rows[0].id;
const repetido=e=>{assert.match(e.message,/^Este UUID ya se subió el /);return true;};

async function montar(previo=''){const db=new PGlite();await db.exec(BASE);if(previo)await db.exec(previo);await db.exec(migracion);return db;}

test('UUID único: mayúsculas y espacios no esquivan el bloqueo entre facturas',async()=>{
 const db=await montar();
 try{
  await id(db,factura(U1));
  await assert.rejects(db.query(factura(U1.toLowerCase())),e=>{
   assert.equal(e.message,'Este UUID ya se subió el 09/10/2026 por Julio en Zapopan-1 La Calma (factura).');
   assert.equal(e.code,'23505');assert.match(e.hint,/^\/compras\/facturas\/[0-9a-f-]{36}$/);return true;});
  await assert.rejects(db.query(factura(` ${U1} `)),repetido);
 }finally{await db.close();}
});

test('UUID único: una factura contra un gasto se rechaza en ambos sentidos',async()=>{
 const db=await montar();
 try{
  const f=await id(db,factura(U1));
  await assert.rejects(db.query(gasto(U1.toLowerCase())),e=>{assert.match(e.message,/\(factura\)\.$/);assert.equal(e.hint,`/compras/facturas/${f}`);return true;});
  const g=await id(db,gasto(U2));
  await assert.rejects(db.query(factura(U2.toLowerCase())),e=>{
   assert.equal(e.message,'Este UUID ya se subió el 01/11/2026 por Ana en Zapopan-1 La Calma (gasto de caja chica).');
   assert.equal(e.hint,`/caja-chica#gasto-${g}`);return true;});
  // Un gasto contra otro gasto también.
  await assert.rejects(db.query(gasto(U2)),repetido);
 }finally{await db.close();}
});

test('UUID único: uuid_manual igual al uuid de la misma fila se permite; de otra factura, no',async()=>{
 const db=await montar();
 try{
  const f=await id(db,factura(U1,{manual:U1}));
  await db.query(`update public.facturas set uuid_manual=null where id=$1`,[f]);
  await db.query(`update public.facturas set uuid_manual=$2 where id=$1`,[f,U1]);
  const pre=await id(db,factura(null,{origen:'manual',sucursal:'null'}));
  await assert.rejects(db.query(`update public.facturas set uuid_manual=$2 where id=$1`,[pre,U1]),repetido);
  // Al revés: la prefactura con UUID manual bloquea el XML de otra factura, con liga a la prefactura.
  await db.query(`update public.facturas set uuid_manual=$2 where id=$1`,[pre,U3]);
  await assert.rejects(db.query(factura(U3)),e=>{assert.match(e.message,/ en Oficina \(factura\)\.$/);assert.equal(e.hint,`/compras/facturas/${pre}`);return true;});
 }finally{await db.close();}
});

test('UUID único: editar un registro sin cambiar su UUID se permite',async()=>{
 const db=await montar();
 try{
  const f=await id(db,factura(U1,{manual:U1}));
  await db.query(`update public.facturas set uuid=uuid,uuid_manual=uuid_manual,folio='F2' where id=$1`,[f]);
  const g=await id(db,gasto(U2.toLowerCase()));
  await db.query(`update public.gastos_caja_chica set uuid_cfdi=$2,concepto='Agua y hielo' where id=$1`,[g,U2]);
  assert.equal((await db.query(`select count(*)::int n from public.gastos_caja_chica where concepto='Agua y hielo'`)).rows[0].n,1);
 }finally{await db.close();}
});

test('UUID único: un gasto eliminado (anulado) sigue bloqueando su UUID para facturas y gastos nuevos',async()=>{
 const db=await montar();
 try{
  const g=await id(db,gasto(U2,{anulado:true}));
  await assert.rejects(db.query(gasto(U2.toLowerCase())),e=>{repetido(e);assert.equal(e.hint,`/caja-chica#gasto-${g}`);return true;});
  await assert.rejects(db.query(factura(U2)),e=>{assert.match(e.message,/\(gasto de caja chica\)\.$/);return true;});
  assert.equal((await db.query(`select registro_id from public.buscar_uuid_cfdi($1)`,[U2])).rows[0].registro_id,g);
 }finally{await db.close();}
});

test('buscar_uuid_cfdi: devuelve origen, fecha, sucursal, usuario y liga; excluye el registro editado',async()=>{
 const db=await montar();
 try{
  const f=await id(db,factura(U1,{manual:U1,sucursal:'null',por:'null'}));
  const g=await id(db,gasto(U2));
  await db.exec(`set role authenticated`);
  const {rows:[r]}=await db.query(`select origen,registro_id,fecha::text fecha,sucursal,usuario,creado_en,liga from public.buscar_uuid_cfdi($1)`,[` ${U1.toLowerCase()} `]);
  assert.deepEqual({...r,creado_en:r.creado_en.toISOString()},{origen:'factura',registro_id:f,fecha:'2026-10-09',sucursal:'Oficina',usuario:null,creado_en:'2026-10-10T02:30:00.000Z',liga:`/compras/facturas/${f}`});
  // La misma factura con uuid y uuid_manual iguales aparece una sola vez.
  assert.equal((await db.query(`select * from public.buscar_uuid_cfdi($1)`,[U1])).rows.length,1);
  assert.equal((await db.query(`select * from public.buscar_uuid_cfdi($1,$2)`,[U1,f])).rows.length,0);
  const {rows:[q]}=await db.query(`select origen,sucursal,usuario,liga from public.buscar_uuid_cfdi($1)`,[U2]);
  assert.deepEqual(q,{origen:'gasto',sucursal:'Zapopan-1 La Calma',usuario:'Ana',liga:`/caja-chica#gasto-${g}`});
  assert.equal((await db.query(`select * from public.buscar_uuid_cfdi($1,$2)`,[U2,g])).rows.length,0);
  assert.equal((await db.query(`select * from public.buscar_uuid_cfdi('   ')`)).rows.length,0);
  await db.exec(`reset role`);
  const {rows:[p]}=await db.query(`select has_function_privilege('anon','public.buscar_uuid_cfdi(text,uuid)','execute') anon,has_function_privilege('authenticated','public.buscar_uuid_cfdi(text,uuid)','execute') aut`);
  assert.deepEqual(p,{anon:false,aut:true});
 }finally{await db.close();}
});

test('UUID único: la migración aborta si ya hay UUIDs repetidos entre registros distintos',async()=>{
 for(const previo of [
  `${factura(U1)};${factura(U1.toLowerCase())};`,
  `${factura(U1)};${gasto(U1.toLowerCase())};`,
  `${factura(null,{origen:'manual',manual:U1})};${gasto(U1)};`,
  `${factura(U1)};${gasto(U1,{anulado:true})};`,
 ]){
  const db=new PGlite();
  try{
   await db.exec(BASE);await db.exec(previo);
   await assert.rejects(db.exec(migracion),/UUID repetidos.*1DAFB285-3B68-4AC2-AAED-DBB6423832E6/s);
  }finally{await db.close();}
 }
 // La misma fila con uuid y uuid_manual iguales no cuenta como repetido.
 const db=await montar(`${factura(U1,{manual:U1})};`);await db.close();
});

test('UUID único: índice de respaldo sobre el UUID normalizado aunque se salte el trigger',async()=>{
 const db=await montar();
 try{
  await id(db,factura(U1));
  await db.exec(`alter table public.facturas disable trigger uuid_cfdi_unico;alter table public.facturas disable trigger validar_uuid_manual`);
  await assert.rejects(db.query(factura(U1.toLowerCase())),/facturas_uuid_normalizado_unico/);
 }finally{await db.close();}
});

test('UUID único: la prueba SQL de Sebastián termina en PRUEBAS OK y no deja nada',async()=>{
 const db=await montar();
 try{
  await id(db,factura(U1));
  await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK — /);return true;});
  const {rows:[r]}=await db.query(`select (select count(*)::int from public.facturas) f,(select count(*)::int from public.gastos_caja_chica) g`);
  assert.deepEqual(r,{f:1,g:0});
 }finally{await db.close();}
});

test('UUID único: ningún update ni delete sin where y funciones definer con search_path vacío',()=>{
 const sinComentarios=migracion.replace(/--[^\n]*/g,'');
 assert.match(sinComentarios,/^\s*begin;\s*set local lock_timeout='5s';/);assert.match(sinComentarios,/commit;\s*$/);
 const updates=sinComentarios.match(/\bupdate\s+public\.\w+(\s+\w+)?\s+set\b[^;]*;/gi)??[];
 for(const u of updates)assert.match(u,/\bwhere\b/i,`update sin where: ${u}`);
 const deletes=sinComentarios.match(/\bdelete\s+from\s+public\.\w+[^;]*;/gi)??[];
 for(const d of deletes)assert.match(d,/\bwhere\b/i,`delete sin where: ${d}`);
 assert.equal((sinComentarios.match(/security definer set search_path=''/g)??[]).length,(sinComentarios.match(/security definer/g)??[]).length);
});
