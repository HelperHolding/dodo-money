import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const sinTx=t=>t.replace(/^begin;|commit;\s*$/gm,'');
const mig1=sinTx(load('supabase/migrations/20261024001536_cuentas_contables_exactas.sql'));
const mig2=sinTx(load('supabase/migrations/20261026164618_cuentas_respetar_razon_principal.sql'));
const migracion=load('supabase/migrations/20261113020000_cuentas_deposito_garantia.sql');
const prueba=load('supabase/pruebas/2026-11-13_deposito_garantia_cfe.sql');
const corr=load('supabase/correcciones/2026-11-13_deposito_garantia_cfe.sql');
const LC='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e', ADMIN='aaaaaaaa-0000-0000-0000-000000000001', F='00000000-0000-0000-0000-000000000281';

async function nueva(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
 create table public.perfiles(id uuid primary key,nombre text,rol text,activo boolean,debe_cambiar_contrasena boolean);
 create function public.ve_finanzas() returns boolean language sql stable as $$ select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin' and activo) $$;
 create table public.razones_sociales(rfc text primary key,activa boolean,principal boolean);
 create table public.razon_social_sucursales(rfc text,sucursal_id uuid);
 create function public.razon_admite_sucursal(p_rfc text,p_sucursal uuid) returns boolean language sql stable as $$ select exists(select 1 from public.razones_sociales e where e.rfc=p_rfc and e.activa and (e.principal or exists(select 1 from public.razon_social_sucursales s where s.rfc=e.rfc and s.sucursal_id=p_sucursal))) $$;
 create table public.facturas(id uuid primary key,fecha_emision date,sucursal_id uuid,rfc_receptor text,nombre_emisor text,serie text,folio text,cuenta_pl text,estado text,sustituido_por uuid,subtotal numeric,descuento numeric,cubre_desde date,cubre_hasta date);
 create table public.factura_conceptos(id bigint primary key,factura_id uuid,descripcion text,cuenta_pl text,importe numeric);
 create table public.gastos_caja_chica(id uuid primary key,fecha date,sucursal_id uuid,concepto text,cuenta_pl text,monto numeric,anulado_en timestamptz);
 create table public.gastos_mes(id uuid primary key,mes date,sucursal_id uuid,concepto text,cuenta text,monto numeric);
 insert into auth.users values('${ADMIN}','scervera@dodopizza.mx');
 insert into public.perfiles values('${ADMIN}','Sebastián','admin',true,false);
 insert into public.razones_sociales values('HCM260306B93',true,true),('CMS230321FI8',true,false);
 insert into public.facturas(id,fecha_emision,sucursal_id,rfc_receptor,nombre_emisor,folio,cuenta_pl,estado,subtotal,descuento) values('${F}','2026-10-26','${LC}','HCM260306B93','COMISION FEDERAL DE ELECTRICIDAD','CFE deposito','inversiones','por_pagar',3404,0);
 insert into public.factura_conceptos values(281,'${F}','Depósito de garantía CFE servicio 444260803331',null,3404.00);`);
 await db.exec(mig1); await db.exec(mig2);
 return db;
}
const filas=r=>r.filter(x=>x.rows.length).map(x=>x.rows).flat();
const asignar=(db,codigo)=>db.exec(`select set_config('request.jwt.claims','{"sub":"${ADMIN}","role":"authenticated"}',false);
 select public.asignar_cuenta_contable(gen_random_uuid(),'concepto:281',null,(select huella from public.contabilidad_movimientos where clave='concepto:281'),'HCM260306B93','${codigo}','prueba de depósito en garantía',true);`);

test('depósito en garantía: sin la migración, 184 se rechaza para inversiones',async()=>{
 const db=await nueva();
 await assert.rejects(asignar(db,'184-03-000'),/cruza memo/);
});
test('depósito en garantía: con la migración se acepta 184, se conserva 15x y se rechaza lo demás',async()=>{
 for(const [codigo,ok] of [['184-03-000',true],['184-02-000',true],['155-01-000',true],['185-01-000',false],['602-56-000',false]]){
  const db=await nueva(); await db.exec(migracion);
  if(ok) await asignar(db,codigo); else await assert.rejects(asignar(db,codigo),/cruza memo/);
 }
});
test('depósito en garantía: ensayo PRUEBAS OK sin guardar, aplicación LOTE 3 OK y repetible',async()=>{
 const db=await nueva(); await db.exec(migracion);
 assert.match(filas(await db.exec(prueba)).at(-1).resultado,/^PRUEBAS OK/);
 assert.equal((await db.query(`select count(*)::int n from public.contabilidad_asignaciones`)).rows[0].n,0);
 assert.deepEqual(filas(await db.exec(corr)),[{resultado:'LOTE 3 OK',cuenta_deposito_cfe:'184-03-000'}]);
 assert.deepEqual(filas(await db.exec(corr)),[{resultado:'LOTE 3 OK',cuenta_deposito_cfe:'184-03-000'}]);
 assert.equal((await db.query(`select count(*)::int n from public.contabilidad_asignaciones`)).rows[0].n,1);
});
test('depósito en garantía: el ensayo sin la migración falla y no guarda nada',async()=>{
 const db=await nueva();
 await assert.rejects(db.exec(prueba),/cruza memo/);
});
