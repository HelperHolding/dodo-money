import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const sinTx=t=>t.replace(/^begin;|commit;\s*$/gm,'');
const prueba=load('supabase/pruebas/2026-11-13_reembolso_ricardo_caja_chica.sql');
const corr=load('supabase/correcciones/2026-11-13_reembolso_ricardo_caja_chica.sql');
const mig1=sinTx(load('supabase/migrations/20261024001536_cuentas_contables_exactas.sql'));
const mig2=sinTx(load('supabase/migrations/20261026164618_cuentas_respetar_razon_principal.sql'));
// Funciones oficiales tal cual: registrar gasto (0065), editar gasto (20261026155811), cancelar factura (0052) y versión de gastos.
const trozo=(texto,inicio)=>{const i=texto.indexOf(inicio);return texto.slice(i,texto.indexOf('end $$;',i)+7);};
const registrar=trozo(load('supabase/migrations/0065_gastos_informativos.sql'),'create function public.registrar_gasto_sucursal');
const revision=load('supabase/migrations/20261026155811_revision_octubre_cuentas.sql');
const editarGasto=revision.slice(revision.indexOf('create or replace function public.editar_anular_gasto_admin'),revision.lastIndexOf('end $$;')+7);
const cancelar=trozo(load('supabase/migrations/0052_cancelacion_facturas.sql'),'create or replace function public.cancelar_factura');
const versionar=load('supabase/migrations/20261020220000_editar_anular_gastos_admin.sql').match(/create function public\.versionar_gasto_admin[\s\S]*?execute function public\.versionar_gasto_admin\(\);/)[0];

const LC='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e', ADMIN='aaaaaaaa-0000-0000-0000-000000000001', RICARDO='aaaaaaaa-0000-0000-0000-000000000002';
const RV='2226df0b-0924-4fd1-ba2f-26062d2d277a', L2='CUENTAS-PENDIENTES-2-20261112';
const originales=[['ff49bf77-41cc-411f-9a3e-1e662c3dc5b6','2026-11-03','Queso Mozarella',1202.00],['ef91f528-f300-42a8-944c-7fe92854b8b2','2026-11-07','Jamon',1061.08],['f8b716b0-eee2-4001-b913-696e72d82eb3','2026-11-08','Jamon',1145.76]];
async function nueva({pago=0}={}){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
 create table public.perfiles(id uuid primary key,nombre text,rol text,activo boolean,debe_cambiar_contrasena boolean,sucursal_id uuid);
 create function public.mi_rol() returns text language sql stable as $$ select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create function public.mi_sucursal() returns uuid language sql stable as $$ select sucursal_id from public.perfiles where id=auth.uid() $$;
 create function public.edita_compras() returns boolean language sql stable as $$ select coalesce(public.mi_rol()='admin',false) $$;
 create function public.exigir_admin_compras() returns void language plpgsql as $$ begin if not public.edita_compras() then raise exception 'Solo un administrador maneja compras.'; end if; end $$;
 create function public.ve_finanzas() returns boolean language sql stable as $$ select public.mi_rol() in('admin','corporativo') $$;
 create function public.hoy_mx() returns date language sql stable as $$ select date '2026-11-13' $$;
 create table public.razones_sociales(rfc text primary key,activa boolean,principal boolean);
 create table public.razon_social_sucursales(rfc text,sucursal_id uuid);
 create function public.razon_admite_sucursal(p_rfc text,p_sucursal uuid) returns boolean language sql stable as $$ select exists(select 1 from public.razones_sociales e where e.rfc=p_rfc and e.activa and e.principal) $$;
 create table public.cajas(id serial primary key,sucursal_id uuid,tipo text,saldo_inicial numeric default 0);
 create table public.movimientos(id uuid default gen_random_uuid(),sucursal_id uuid,tipo text,estado text,creado_en timestamptz default now());
 create table public.facturas(id uuid primary key,uuid uuid,fecha_emision date,sucursal_id uuid,rfc_receptor text,nombre_emisor text,serie text,folio text,cuenta_pl text,estado text,sustituido_por uuid,
  subtotal numeric,descuento numeric,total numeric,cubre_desde date,cubre_hasta date,motivo_cancelacion text,cancelada_por uuid,cancelada_en timestamptz,pago_programado_el date,pago_programado_forma text,recepcion_programada_el date);
 create table public.factura_conceptos(id bigint primary key,factura_id uuid,descripcion text,cuenta_pl text,importe numeric);
 create table public.pago_aplicaciones(id serial primary key,factura_id uuid,monto numeric);
 create function public.pagado_factura(p uuid) returns numeric language sql stable as $$ select coalesce(sum(monto),0) from public.pago_aplicaciones where factura_id=p $$;
 create table public.reservas_boveda(id serial,factura_id uuid,anulado_en timestamptz);
 create table public.factura_cancelaciones(factura_id uuid,motivo text,anterior jsonb,ordenes uuid[]);
 create table public.factura_programacion_historial(factura_id uuid,tipo text,fecha_anterior date,forma_anterior text);
 create table public.factura_ordenes(factura_id uuid,orden_id uuid);
 create function public.reabrir_ordenes_incompletas(p uuid[]) returns void language sql as $$ select null::void $$;
 create type public.origen_gasto as enum('caja_chica','boveda','empleado');
 create type public.tipo_comprobante as enum('cfdi','nota','sin_comprobante');
 create table public.gastos_caja_chica(id uuid primary key default gen_random_uuid(),sucursal_id uuid,fecha date,concepto text,proveedor text,monto numeric,comprobante public.tipo_comprobante,uuid_cfdi text,foto_path text,
  cuenta_pl text,origen public.origen_gasto default 'caja_chica',pagado_por uuid,repuesto_en timestamptz,reposicion_id uuid,registrado_por uuid default auth.uid(),
  informativo boolean not null default false,motivo_informativo text,referencia_informativa text,informado_por uuid,informado_en timestamptz,respaldo_informativo text,solicitud_id uuid unique,solicitud_datos jsonb,
  fecha_capturada_original date,creado_en timestamptz default now(),version bigint default 1,anulado_en timestamptz,anulado_por uuid,motivo_anulacion text);
 create table public.gastos_mes(id uuid primary key,mes date,sucursal_id uuid,concepto text,cuenta text,monto numeric);
 create table public.gastos_historial(id uuid primary key,gasto_id uuid,autor_id uuid,accion text,motivo text,solicitud jsonb,antes jsonb,despues jsonb,creado_en timestamptz default now());
 create view public.saldos_cajas as select c.sucursal_id,c.tipo,c.saldo_inicial-coalesce((select sum(g.monto) from public.gastos_caja_chica g where g.sucursal_id=c.sucursal_id and g.origen::text=c.tipo and g.anulado_en is null and not g.informativo),0) as saldo from public.cajas c;
 ${versionar}
 ${registrar}
 ${editarGasto}
 ${cancelar}
 insert into auth.users values('${ADMIN}','scervera@dodopizza.mx');
 insert into public.perfiles values('${ADMIN}','Sebastián','admin',true,false,null),('${RICARDO}','Ricardo Villa','gerente',true,false,'${LC}');
 insert into public.razones_sociales values('HCM260306B93',true,true),('CMS230321FI8',true,false);
 insert into public.cajas(sucursal_id,tipo,saldo_inicial) values('${LC}','caja_chica',10000),('${LC}','boveda',50000);
 insert into public.facturas(id,fecha_emision,sucursal_id,rfc_receptor,nombre_emisor,folio,cuenta_pl,estado,subtotal,descuento,total) values('${RV}','2026-11-08','${LC}','HCM260306B93','Ricardo Villa','Sam''s nov 2026 (2)','insumos','por_pagar',3408.84,0,3408.84);
 insert into public.factura_conceptos values(355,'${RV}','mozzarella','insumos',1202.00),(356,'${RV}','jamón','insumos',1061.08),(357,'${RV}','jamón','insumos',1145.76);
 insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,proveedor,monto,comprobante,cuenta_pl,origen) values('${LC}','2026-11-05','Otro gasto','Oxxo',50,'nota','otros','caja_chica');
 ${originales.map(([id,f,c,m])=>`insert into public.gastos_caja_chica(id,sucursal_id,fecha,concepto,proveedor,monto,comprobante,cuenta_pl,origen,pagado_por,version,anulado_en,anulado_por,motivo_anulacion) values('${id}','${LC}','${f}','${c}','Sams',${m},'nota','otros','empleado','${RICARDO}',3,now(),'${ADMIN}','${L2} duplicado');
 insert into public.gastos_historial(id,gasto_id,autor_id,accion,motivo,solicitud,antes,despues) values(md5('${L2}gasto:${id}')::uuid,'${id}','${ADMIN}','eliminar','${L2} duplicado','{}','{}','{}');`).join('\n')}
 ${pago?`insert into public.pago_aplicaciones(factura_id,monto) values('${RV}',${pago});`:''}`);
 await db.exec(mig1); await db.exec(mig2);
 return db;
}
const filas=r=>r.filter(x=>x.rows.length).map(x=>x.rows).flat();
const q=async(db,s)=>(await db.query(s)).rows;

test('reembolso Ricardo: el ensayo devuelve PRUEBAS OK y no guarda nada',async()=>{
 const db=await nueva();
 assert.match(filas(await db.exec(prueba)).at(-1).resultado,/^PRUEBAS OK/);
 assert.deepEqual(await q(db,`select count(*)::int n from public.gastos_caja_chica`),[{n:4}]);
 assert.deepEqual(await q(db,`select estado from public.facturas`),[{estado:'por_pagar'}]);
});
test('reembolso Ricardo: registra 3 gastos de caja chica en 502, cancela la factura, baja la caja chica 3,408.84 y es repetible',async()=>{
 const db=await nueva();
 const r=filas(await db.exec(corr));
 assert.deepEqual(r,[{resultado:'LOTE 4 OK',gastos_caja_chica:3,factura_reembolso:'cancelada',caja_chica_antes:'9950',caja_chica_despues:'6541.16'}]);
 const r2=filas(await db.exec(corr));
 assert.equal(r2[0].caja_chica_despues,'6541.16');
 assert.deepEqual(await q(db,`select g.fecha::text,g.monto::numeric(12,2)::text as monto,g.cuenta_pl,g.origen::text,g.version::int,a.codigo from public.gastos_caja_chica g
  join public.contabilidad_actual a on a.clave='gasto:'||g.id::text where g.solicitud_id is not null order by g.fecha`),[
  {fecha:'2026-11-03',monto:'1202.00',cuenta_pl:'insumos',origen:'caja_chica',version:2,codigo:'502-01-000'},
  {fecha:'2026-11-07',monto:'1061.08',cuenta_pl:'insumos',origen:'caja_chica',version:2,codigo:'502-01-000'},
  {fecha:'2026-11-08',monto:'1145.76',cuenta_pl:'insumos',origen:'caja_chica',version:2,codigo:'502-01-000'}]);
 assert.equal((await q(db,`select count(*)::int n from public.contabilidad_movimientos where factura_id='${RV}'`))[0].n,0);
 assert.equal((await q(db,`select count(*)::int n from public.factura_cancelaciones`))[0].n,1);
});
test('reembolso Ricardo: si la factura ya tiene un pago, no guarda nada',async()=>{
 const db=await nueva({pago:3408.84});
 await assert.rejects(db.exec(corr),/ya no está por pagar sin pagos/);
 await db.exec('rollback');
 assert.deepEqual(await q(db,`select count(*)::int n from public.gastos_caja_chica`),[{n:4}]);
});
test('reembolso Ricardo: si el gasto original no fue eliminado por el lote 2, no guarda nada',async()=>{
 const db=await nueva();
 await db.exec(`delete from public.gastos_historial where gasto_id='ef91f528-f300-42a8-944c-7fe92854b8b2'`);
 await assert.rejects(db.exec(corr),/n129: el gasto original no está eliminado/);
});
