import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const plan=JSON.parse(load('supabase/correcciones/2026-11-12_equivalencias_pendientes.json'));
const prueba=load('supabase/pruebas/2026-11-12_cuentas_pendientes.sql');
const corr=load('supabase/correcciones/2026-11-12_cuentas_pendientes.sql');
const sinTx=t=>t.replace(/^begin;|commit;s*$/gm,'');
const mig1=sinTx(load('supabase/migrations/20261024001536_cuentas_contables_exactas.sql'));
const mig2=sinTx(load('supabase/migrations/20261026164618_cuentas_respetar_razon_principal.sql'));
// Esquema mínimo de apoyo + catálogo, vistas y función de asignación reales. Los "Revisar" llevan asignación previa con huella vieja.
const LC='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e', D2='11111111-1111-1111-1111-111111111112', ADMIN='aaaaaaaa-0000-0000-0000-000000000001';
const oficina=new Set([76,77,78,90,91,100,101,107,116,123,124,125,126]);
async function nueva(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
 create table public.perfiles(id uuid primary key,nombre text,rol text,activo boolean,debe_cambiar_contrasena boolean);
 create function public.ve_finanzas() returns boolean language sql stable as $$ select exists(select 1 from public.perfiles where id=auth.uid() and rol in('admin','corporativo') and activo) $$;
 create table public.razones_sociales(rfc text primary key,activa boolean,principal boolean);
 create table public.razon_social_sucursales(rfc text,sucursal_id uuid);
 create function public.razon_admite_sucursal(p_rfc text,p_sucursal uuid) returns boolean language sql stable as $$ select exists(select 1 from public.razones_sociales e where e.rfc=p_rfc and e.activa and (e.principal or exists(select 1 from public.razon_social_sucursales s where s.rfc=e.rfc and s.sucursal_id=p_sucursal))) $$;
 create table public.sucursales(id uuid primary key,nombre text);
 create table public.facturas(id uuid primary key,fecha_emision date,sucursal_id uuid,rfc_receptor text,nombre_emisor text,serie text,folio text,cuenta_pl text,estado text,sustituido_por uuid,subtotal numeric,descuento numeric,cubre_desde date,cubre_hasta date,pagado numeric default 0);
 create table public.factura_conceptos(id bigint primary key,factura_id uuid,descripcion text,cuenta_pl text,importe numeric);
 create table public.gastos_caja_chica(id uuid primary key,fecha date,sucursal_id uuid,concepto text,cuenta_pl text,monto numeric,anulado_en timestamptz);
 create table public.gastos_mes(id uuid primary key,mes date,sucursal_id uuid,concepto text,cuenta text,monto numeric);
 insert into auth.users values('${ADMIN}','scervera@dodopizza.mx');
 insert into public.perfiles values('${ADMIN}','Sebastián','admin',true,false);
 insert into public.razones_sociales values('HCM260306B93',true,true),('CMS230321FI8',true,false),('PHM2603064RA',true,false);
 insert into public.razon_social_sucursales values('CMS230321FI8','${LC}');
 insert into public.sucursales values('${LC}','Dodo La Calma (Dodo-1)'),('${D2}','Dodo Lopez Mateos (Dodo-2)');`);
 await db.exec(mig1); await db.exec(mig2);
 for(const p of plan){
  const suc=oficina.has(p.n)?null:(p.n===61?D2:LC); const [tipo,id]=p.clave.split(':');
  if(tipo==='concepto'){const fid=`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`;
   await db.query(`insert into public.facturas(id,fecha_emision,sucursal_id,rfc_receptor,nombre_emisor,folio,estado,subtotal,descuento) values($1,'2026-10-20',$2,$3,'Prov',$4,'pendiente',$5,0)`,[fid,suc,p.rfc,'F'+id,p.importe]);
   await db.query(`insert into public.factura_conceptos values($1,$2,'concepto',$3,$4)`,[id,fid,p.categoria,p.importe]);}
  else if(tipo==='gasto') await db.query(`insert into public.gastos_caja_chica values($1,'2026-10-20',$2,'g',$3,$4,null)`,[id,suc,p.categoria,p.importe]);
  else await db.query(`insert into public.gastos_mes values($1,'2026-10-01',$2,'a',$3,$4)`,[id,suc,p.categoria,p.importe]);
 }
 // Revisar: asignación previa con huella vieja (n1-15,22,23,49-53,86,102,103,117)
 const revisar=[...Array(15).keys()].map(i=>i+1).concat([22,23,49,50,51,52,53,86,102,103,117]);
 for(const p of plan.filter(p=>revisar.includes(p.n)))
  await db.query(`insert into public.contabilidad_asignaciones(id,clave,revision,rfc,codigo,huella,origen,motivo,solicitud,autor,autor_nombre) values(gen_random_uuid(),$1,1,$2,$3,'vieja','{}','motivo de octubre ok','[]',$4,'Sebastián')`,[p.clave,p.rfc,p.codigo,ADMIN]);
 return db;
}
const filas=r=>r.filter(x=>x.rows.length).map(x=>x.rows).flat();
const delLote=async db=>(await db.query(`select count(*)::int as n from public.contabilidad_asignaciones where motivo like 'CUENTAS-PENDIENTES-20261112%'`)).rows[0].n;

test('cuentas pendientes: plan de 138, sin repetir claves y con cuentas compatibles con su categoría',()=>{
 assert.equal(plan.length,138);
 assert.equal(new Set(plan.map(p=>p.clave)).size,138);
 for(const p of plan){
  assert.ok(p.motivo.length>=12&&p.motivo.length<=1000);
  if(p.categoria==='insumos')assert.match(p.codigo,/^502-/);
  else if(p.categoria==='inversiones')assert.match(p.codigo,/^1[57][0-9]-/);
  else assert.match(p.codigo,oficina.has(p.n)?/^603-/:/^602-/);
 }
});
test('cuentas pendientes: el ensayo devuelve PRUEBAS OK y no guarda nada',async()=>{
 const db=await nueva();
 const r=filas(await db.exec(prueba));
 assert.match(r.at(-1).resultado,/^PRUEBAS OK/);
 assert.equal(await delLote(db),0);
});
test('cuentas pendientes: aplica 138 con la función oficial y repetir no duplica',async()=>{
 const db=await nueva();
 assert.deepEqual(filas(await db.exec(corr)),[{resultado:'CUENTAS PENDIENTES OK',registros:138,asignaciones_del_lote:138}]);
 assert.deepEqual(filas(await db.exec(corr)),[{resultado:'CUENTAS PENDIENTES OK',registros:138,asignaciones_del_lote:138}]);
 const viejas=(await db.query(`select count(*)::int as n from public.contabilidad_actual where huella='vieja'`)).rows[0].n;
 assert.equal(viejas,0);
});
test('cuentas pendientes: si algo cambió, no guarda nada',async()=>{
 for(const [cambio,error] of [
  ['update public.factura_conceptos set importe=999 where id=265',/n26 .*cambió la categoría o el importe/],
  ["update public.gastos_caja_chica set cuenta_pl='otros' where id='d2b101de-1719-41d7-a40f-fe857261fb16'",/n25 .*cambió la categoría/],
  ["delete from public.gastos_caja_chica where id='2cb72ab6-94f4-42b6-823a-21cd1d4f6e1f'",/n81 .*ya no está vigente/],
  ["update public.contabilidad_asignaciones set codigo='602-84-101' where clave='concepto:222'",/n1 .*ya tiene otra cuenta/],
 ]){
  const db=await nueva();await db.exec(cambio);
  await assert.rejects(db.exec(corr),error);
  await db.exec('rollback');
  assert.equal(await delLote(db),0);
 }
});
