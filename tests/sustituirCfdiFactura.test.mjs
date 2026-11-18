import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261106120000_sustituir_cfdi_factura.sql');
const pruebas=load('supabase/pruebas/20261106120000_sustituir_cfdi_factura.sql');
// Funciones reales que usa la prueba de Sebastián, copiadas tal cual de sus migraciones.
const extraer=(archivo,re)=>{const m=load(archivo).match(re);assert.ok(m,`no se encontró ${re} en ${archivo}`);return m[0];};
const registrarFactura=extraer('supabase/migrations/0068_razones_sociales_compras.sql',/create or replace function registrar_factura\([\s\S]*?end \$\$;/);
const razonAdmite=extraer('supabase/migrations/0068_razones_sociales_compras.sql',/create function public\.razon_admite_sucursal[\s\S]*?\$\$;/);
const uuidManual=extraer('supabase/migrations/0070_uuid_manual_factura.sql',/create function public\.validar_uuid_manual_factura[\s\S]*?execute function public\.validar_uuid_manual_factura\(\);/);
const estadoFactura=extraer('supabase/migrations/0014_compras_pagos.sql',/create or replace function actualizar_estado_factura[\s\S]*?end \$\$;/);
const pagado=extraer('supabase/migrations/0014_compras_pagos.sql',/create or replace function pagado_factura[\s\S]*?\$\$;/);

const A='00000000-0000-0000-0000-0000000000a1',C='00000000-0000-0000-0000-0000000000c1',RFC='HCM260306B93';
// Lo mínimo de Supabase y Compras, con los CHECK, enums y triggers reales de las tablas que toca la migración.
const BASE=`create role anon;create role authenticated;create schema auth;create schema storage;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean,debe_cambiar_contrasena boolean default false,rol text,nombre text);
 insert into perfiles(id,activo,rol) values('${A}',true,'admin'),('${C}',true,'corporativo');
 create function ve_compras() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_compras() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create function exigir_admin_compras() returns void language plpgsql security definer set search_path=public as $$begin if not public.edita_compras() then raise exception 'Solo administración.';end if;end$$;
 create type tipo_factura as enum('ingreso','egreso');
 create type estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create type forma_pago as enum('transferencia','efectivo','tarjeta','cheque');
 create table sucursales(id uuid primary key default gen_random_uuid(),nombre text not null);
 create table razones_sociales(rfc text primary key,razon_social text not null,principal boolean not null default false,activa boolean not null default true);
 create table razon_social_sucursales(rfc text references razones_sociales(rfc),sucursal_id uuid references sucursales(id));
 insert into razones_sociales values('${RFC}','Helper ensayo',true,true);
 create table proveedores(id uuid primary key default gen_random_uuid(),razon_social text not null,rfc text unique,regimen_fiscal text,sucursal_id uuid references sucursales(id),cuenta_pl text,
  dias_credito integer not null default 0 check (dias_credito between 0 and 365));
 create table facturas(id uuid primary key default gen_random_uuid(),uuid text unique,serie text,folio text,tipo tipo_factura not null,fecha_emision date not null,
  rfc_emisor text not null,nombre_emisor text not null,regimen_emisor text not null,rfc_receptor text not null references razones_sociales(rfc),
  metodo_pago text check (metodo_pago in ('PUE','PPD')),forma_pago text,moneda text not null default 'MXN' check (moneda='MXN'),
  subtotal numeric(14,2) not null,descuento numeric(14,2) not null default 0,iva numeric(14,2) not null default 0,retenciones numeric(14,2) not null default 0,
  retencion_iva numeric(14,2) not null default 0,retencion_isr numeric(14,2) not null default 0,total numeric(14,2) not null check (total>=0),
  proveedor_id uuid not null references proveedores(id),sucursal_id uuid references sucursales(id),uuid_relacionado text,vence_el date not null,
  estado estado_factura not null default 'por_pagar',revisada boolean not null default false,revision_nota text,xml_ruta text,pdf_ruta text,motivo_cancelacion text,
  origen text not null default 'cfdi' check (origen in ('cfdi','manual')),sustituido_por uuid references facturas(id),cuenta_pl text,
  uuid_manual text check(uuid_manual is null or uuid_manual ~ '^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$'),
  creado_en timestamptz not null default now(),
  check (estado <> 'cancelada' or coalesce(trim(motivo_cancelacion), '') <> ''),check (not revisada or coalesce(trim(revision_nota), '') <> ''),
  constraint facturas_cfdi_completo check (origen = 'manual' or (uuid is not null and xml_ruta is not null)),
  constraint facturas_manual_con_referencia check (origen = 'cfdi' or coalesce(trim(folio), '') <> ''));
 create table factura_conceptos(id bigserial primary key,factura_id uuid not null references facturas(id),descripcion text not null,cantidad numeric(14,4) not null,
  unidad text not null,valor_unitario numeric(14,4) not null,importe numeric(14,2) not null,cuenta_pl text);
 create table compra_notas(id uuid primary key default gen_random_uuid(),factura_id uuid references facturas(id),orden_id uuid,
  texto text not null check(length(trim(texto)) between 5 and 2000),usuario_id uuid not null default auth.uid() references perfiles(id),
  creado_en timestamptz not null default now(),check(num_nonnulls(factura_id,orden_id)=1));
 create table pagos(id uuid primary key default gen_random_uuid(),proveedor_id uuid not null references proveedores(id),fecha date not null,monto numeric(14,2) not null check (monto>0),
  forma forma_pago not null,creado_por uuid references perfiles(id),anulado_en timestamptz);
 create table pago_aplicaciones(id bigserial primary key,pago_id uuid not null references pagos(id),factura_id uuid not null references facturas(id),
  monto numeric(14,2) not null check (monto>0),unique(pago_id,factura_id));
 create table complementos_pago(id uuid primary key default gen_random_uuid(),uuid text not null unique,fecha date not null,rfc_emisor text not null,nombre_emisor text not null default '',
  proveedor_id uuid references proveedores(id),monto numeric(14,2) not null default 0,xml_ruta text not null,rfc_receptor text not null references razones_sociales(rfc));
 create table complemento_facturas(id bigserial primary key,complemento_id uuid not null references complementos_pago(id),factura_uuid text not null,
  monto_pagado numeric(14,2) not null default 0,parcialidad integer);
 create function neto_factura(p_id uuid) returns numeric language sql stable security definer set search_path=public as $$
  select f.total - coalesce((select sum(n.total) from facturas n where n.tipo='egreso' and n.estado<>'cancelada' and n.uuid_relacionado=f.uuid),0) from facturas f where f.id=p_id$$;
 ${pagado}
 create function saldo_factura(p_id uuid) returns numeric language sql stable security definer set search_path=public as $$select greatest(neto_factura(p_id)-pagado_factura(p_id),0)$$;
 ${estadoFactura}
 ${razonAdmite}
 ${uuidManual}
 ${registrarFactura}
 create table storage.objects(bucket_id text,name text,metadata jsonb);
 grant usage on schema storage to authenticated;
 grant select on all tables in schema public to authenticated;`;
const ADMIN=`select set_config('request.jwt.claims','{"sub":"${A}","role":"authenticated"}',false)`;

async function montar(){const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;}

test('sustituir CFDI: la prueba SQL de Sebastián termina en PRUEBAS OK',async()=>{
 const db=await montar();
 try{await assert.rejects(db.exec(pruebas),e=>{assert.match(e.message,/^PRUEBAS OK$/);return true;});}
 finally{await db.close();}
});

test('sustituir CFDI: la prueba revierte todo lo que ensaya',async()=>{
 const db=await montar();
 try{
  await db.exec(pruebas).catch(()=>{});
  const {rows:[r]}=await db.query(`select (select count(*)::int from facturas) f,(select count(*)::int from cfdi_sustituciones) s,(select count(*)::int from storage.objects) o`);
  assert.deepEqual(r,{f:0,s:0,o:0});
 }finally{await db.close();}
});

test('sustituir CFDI: caso Frutigo — factura pagada conserva pago, cambia UUID y folio, y el REP nuevo la cubre',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  const viejo='0A0A0A0A-1111-4111-8111-000000003079',nuevo='1DAFB285-3B68-4AC2-AAED-DBB6423832E6';
  const {rows:[{s}]}=await db.query(`insert into sucursales(nombre) values('Zapopan-1') returning id s`);
  const {rows:[{p}]}=await db.query(`insert into proveedores(razon_social,rfc,regimen_fiscal,sucursal_id,dias_credito) values('Frutigo','RESA730729J13','612',$1,15) returning id p`,[s]);
  const cfdi=(uuid,folio,fecha)=>JSON.stringify({uuid,folio,version:'4.0',tipo:'ingreso',moneda:'MXN',fecha,rfc_emisor:'RESA730729J13',rfc_receptor:RFC,nombre_emisor:'Frutigo',regimen_emisor:'612',
   metodo_pago:'PPD',forma_pago:'99',subtotal:751,descuento:0,iva:0,retenciones:0,retencion_iva:0,retencion_isr:0,total:751,uuids_relacionados:[],
   conceptos:[{descripcion:'Fruta',cantidad:1,unidad:'kg',valor_unitario:751,importe:751}]});
  const {rows:[{f}]}=await db.query(`select registrar_factura($1::jsonb,false,'xml/3079.xml','pdf/3079.pdf') f`,[cfdi(viejo,'3079','2026-10-09')]);
  const {rows:[{pago}]}=await db.query(`insert into pagos(proveedor_id,fecha,monto,forma,creado_por) values($1,'2026-10-23',751,'transferencia','${A}') returning id pago`,[p]);
  await db.query(`insert into pago_aplicaciones(pago_id,factura_id,monto) values($1,$2,751)`,[pago,f]);
  await db.query(`select actualizar_estado_factura($1)`,[f]);
  const antes=(await db.query(`select vence_el,sucursal_id,estado from facturas where id=$1`,[f])).rows[0];

  const sol='00000000-0000-0000-0000-00000000aa01';
  await db.exec(`set role authenticated`);
  const {rows:[{j}]}=await db.query(`select preparar_sustitucion_cfdi($1,$2,$3::jsonb,'Frutigo canceló el 3079 y timbró el 3088',5056,$4,324609) j`,[sol,f,cfdi(nuevo,'3088','2026-11-05'),'f'.repeat(64)]);
  assert.equal(j.ruta,`sustituciones/${f}/${sol}.xml`);assert.equal(j.ruta_pdf,`sustituciones/${f}/${sol}.pdf`);
  assert.deepEqual(j.complementos,{cantidad:0,monto:0});assert.equal(Number(j.pagado),751);
  await db.exec(`reset role`);
  await db.query(`insert into storage.objects values('facturas',$1,'{"size":5056,"mimetype":"application/xml"}'),('facturas',$2,'{"size":324609,"mimetype":"application/pdf"}')`,[j.ruta,j.ruta_pdf]);
  await db.exec(`set role authenticated`);
  await db.query(`select confirmar_sustitucion_cfdi($1)`,[sol]);
  await db.exec(`reset role`);

  const {rows:[d]}=await db.query(`select uuid,folio,fecha_emision::text fe,estado,vence_el,sucursal_id,xml_ruta,pdf_ruta,pagado_factura(id)::float pagado from facturas where id=$1`,[f]);
  assert.deepEqual({...d,vence_el:String(d.vence_el)},{uuid:nuevo,folio:'3088',fe:'2026-11-05',estado:antes.estado,vence_el:String(antes.vence_el),sucursal_id:antes.sucursal_id,xml_ruta:j.ruta,pdf_ruta:j.ruta_pdf,pagado:751});
  const {rows:[h]}=await db.query(`select uuid_anterior,original->>'folio' folio,original->>'xml_ruta' xml,original->>'pdf_ruta' pdf from cfdi_sustituciones where id=$1 and confirmado_en is not null`,[sol]);
  assert.deepEqual(h,{uuid_anterior:viejo,folio:'3079',xml:'xml/3079.xml',pdf:'pdf/3079.pdf'});

  // PAG5 se registra con el UUID nuevo y cubre la factura (el complemento se liga por UUID).
  const {rows:[{comp}]}=await db.query(`insert into complementos_pago(uuid,fecha,rfc_emisor,proveedor_id,monto,xml_ruta,rfc_receptor) values('PAG5-ENSAYO','2026-11-05','RESA730729J13',$1,751,'c.xml','${RFC}') returning id comp`,[p]);
  await db.query(`insert into complemento_facturas(complemento_id,factura_uuid,monto_pagado) values($1,$2,751)`,[comp,nuevo]);
  const {rows:[{cubierto}]}=await db.query(`select sum(cf.monto_pagado)::float cubierto from complemento_facturas cf join facturas x on x.uuid=cf.factura_uuid where x.id=$1`,[f]);
  assert.equal(cubierto,751);

  // Volver a subir el XML viejo como factura nueva queda bloqueado.
  await db.exec(`set role authenticated`);
  await assert.rejects(db.query(`select registrar_factura($1::jsonb,false,'xml/otra.xml',null)`,[cfdi(viejo,'3079','2026-10-09')]),/fue sustituido/);
 }finally{await db.close();}
});

test('sustituir CFDI: sin PDF deja pdf_ruta vacío y una prefactura no se sustituye',async()=>{
 const db=await montar();
 try{
  await db.exec(ADMIN);
  const {rows:[{s}]}=await db.query(`insert into sucursales(nombre) values('S') returning id s`);
  const {rows:[{p}]}=await db.query(`insert into proveedores(razon_social,rfc,regimen_fiscal,sucursal_id) values('P','PRB010101AB1','601',$1) returning id p`,[s]);
  const {rows:[{f}]}=await db.query(`insert into facturas(origen,folio,tipo,fecha_emision,rfc_emisor,nombre_emisor,regimen_emisor,rfc_receptor,subtotal,total,proveedor_id,sucursal_id,vence_el)
   values('manual','Prefactura','ingreso','2026-11-01','PRB010101AB1','P','601','${RFC}',10,10,$1,$2,'2026-11-01') returning id f`,[p,s]);
  await db.exec(`set role authenticated`);
  const cfdi=JSON.stringify({uuid:'2B2B2B2B-1111-4111-8111-000000000001',version:'4.0',tipo:'ingreso',moneda:'MXN',fecha:'2026-11-01',rfc_emisor:'PRB010101AB1',rfc_receptor:RFC,
   metodo_pago:'PUE',subtotal:10,descuento:0,iva:0,retenciones:0,retencion_iva:0,retencion_isr:0,total:10,conceptos:[{descripcion:'x',cantidad:1,unidad:'p',valor_unitario:10,importe:10}]});
  await assert.rejects(db.query(`select preparar_sustitucion_cfdi(gen_random_uuid(),$1,$2::jsonb,'Motivo de ensayo',10,$3)`,[f,cfdi,'a'.repeat(64)]),/Solo se sustituye/);
  assert.equal((await db.query(`select pdf_ruta from cfdi_sustituciones`)).rows.length,0);
 }finally{await db.close();}
});
