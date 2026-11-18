import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const sinTx=t=>t.replace(/^begin;|commit;\s*$/gm,'');
const prueba=load('supabase/pruebas/2026-11-12_cuentas_pendientes_lote2.sql');
const corr=load('supabase/correcciones/2026-11-12_cuentas_pendientes_lote2.sql');
const mig1=sinTx(load('supabase/migrations/20261024001536_cuentas_contables_exactas.sql'));
const mig2=sinTx(load('supabase/migrations/20261026164618_cuentas_respetar_razon_principal.sql'));
// Funciones oficiales tal cual: editar/eliminar gasto (20261026155811) y categoría de conceptos (0026).
const revision=load('supabase/migrations/20261026155811_revision_octubre_cuentas.sql');
const editarGasto=revision.slice(revision.indexOf('create or replace function public.editar_anular_gasto_admin'),revision.lastIndexOf('end $$;')+7);
const g26=load('supabase/migrations/0026_gastos_unificados.sql');
const i26=g26.indexOf('create or replace function asignar_cuentas_conceptos');
const conceptos=g26.slice(i26,g26.indexOf('end $$;',i26)+7);
const versionar=load('supabase/migrations/20261020220000_editar_anular_gastos_admin.sql').match(/create function public\.versionar_gasto_admin[\s\S]*?execute function public\.versionar_gasto_admin\(\);/)[0];

const LC='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e', ADMIN='aaaaaaaa-0000-0000-0000-000000000001', RICARDO='aaaaaaaa-0000-0000-0000-000000000002';
const BGL='00000000-0000-0000-0000-000000006872', RV='2226df0b-0924-4fd1-ba2f-26062d2d277a', ARCA='5cbf66bc-4e1c-4b25-b3fc-3d653b89011e';
async function nueva(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
 create table public.perfiles(id uuid primary key,nombre text,rol text,activo boolean,debe_cambiar_contrasena boolean,sucursal_id uuid);
 create function public.mi_rol() returns text language sql stable as $$ select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create function public.edita_compras() returns boolean language sql stable as $$ select coalesce(public.mi_rol()='admin',false) $$;
 create function public.exigir_admin_compras() returns void language plpgsql as $$ begin if not public.edita_compras() then raise exception 'Solo un administrador maneja compras.'; end if; end $$;
 create function public.ve_finanzas() returns boolean language sql stable as $$ select public.mi_rol() in('admin','corporativo') $$;
 create function public.hoy_mx() returns date language sql stable as $$ select date '2026-11-12' $$;
 create table public.razones_sociales(rfc text primary key,activa boolean,principal boolean);
 create table public.razon_social_sucursales(rfc text,sucursal_id uuid);
 create function public.razon_admite_sucursal(p_rfc text,p_sucursal uuid) returns boolean language sql stable as $$ select exists(select 1 from public.razones_sociales e where e.rfc=p_rfc and e.activa and (e.principal or exists(select 1 from public.razon_social_sucursales s where s.rfc=e.rfc and s.sucursal_id=p_sucursal))) $$;
 create table public.sucursales(id uuid primary key,nombre text);
 create table public.cajas(id serial primary key,sucursal_id uuid,tipo text);
 create table public.movimientos(id uuid default gen_random_uuid(),sucursal_id uuid,tipo text,estado text,creado_en timestamptz default now());
 create table public.facturas(id uuid primary key,uuid uuid,fecha_emision date,sucursal_id uuid,rfc_receptor text,nombre_emisor text,serie text,folio text,cuenta_pl text,estado text,sustituido_por uuid,subtotal numeric,descuento numeric,cubre_desde date,cubre_hasta date);
 create table public.factura_conceptos(id bigint primary key,factura_id uuid,descripcion text,cuenta_pl text,importe numeric);
 create table public.compra_notas(id uuid primary key default gen_random_uuid(),factura_id uuid,texto text,usuario_id uuid,creado_en timestamptz default now());
 create table public.pago_aplicaciones(id serial primary key,factura_id uuid,monto numeric);
 create type public.origen_gasto as enum('caja_chica','boveda','empleado');
 create type public.tipo_comprobante as enum('cfdi','nota','sin_comprobante');
 create table public.gastos_caja_chica(id uuid primary key,sucursal_id uuid,fecha date,concepto text,proveedor text,monto numeric,comprobante public.tipo_comprobante,uuid_cfdi text,
  cuenta_pl text,origen public.origen_gasto default 'caja_chica',pagado_por uuid,repuesto_en timestamptz,reposicion_id uuid,informativo boolean default false,fecha_capturada_original date,
  creado_en timestamptz default now(),version bigint default 1,anulado_en timestamptz,anulado_por uuid,motivo_anulacion text);
 create table public.gastos_mes(id uuid primary key,mes date,sucursal_id uuid,concepto text,cuenta text,monto numeric);
 create table public.gastos_historial(id uuid primary key,gasto_id uuid,autor_id uuid,accion text,motivo text,solicitud jsonb,antes jsonb,despues jsonb,creado_en timestamptz default now());
 ${versionar}
 ${conceptos}
 ${editarGasto}
 insert into auth.users values('${ADMIN}','scervera@dodopizza.mx');
 insert into public.perfiles values('${ADMIN}','Sebastián','admin',true,false,null),('${RICARDO}','Ricardo Villa','gerente',true,false,'${LC}');
 insert into public.razones_sociales values('HCM260306B93',true,true),('CMS230321FI8',true,false);
 insert into public.razon_social_sucursales values('CMS230321FI8','${LC}');
 insert into public.sucursales values('${LC}','Dodo La Calma (Dodo-1)');
 insert into public.cajas(sucursal_id,tipo) values('${LC}','caja_chica'),('${LC}','boveda');
 insert into public.facturas(id,fecha_emision,sucursal_id,rfc_receptor,nombre_emisor,folio,cuenta_pl,estado,subtotal,descuento) values
  ('${BGL}','2026-09-18','${LC}','CMS230321FI8','BOLPACK COLIMA','BGL6872','insumos','pagada',1457.10,0),
  ('${RV}','2026-11-08','${LC}','HCM260306B93','Ricardo Villa','Sam''s nov 2026 (2)','insumos','por_pagar',3408.84,0),
  ('${ARCA}','2026-10-28','${LC}','HCM260306B93','ARCA CONTINENTAL','Ticket 6239604631','insumos','pagada',3164.50,0);
 insert into public.factura_conceptos values(133,'${BGL}','SUMA DIVOSAN','insumos',1174.60),(134,'${BGL}','GUANTE','insumos',172.50),(135,'${BGL}','TELAS ROJO','insumos',55.00),(136,'${BGL}','TELAS VERDE',null,55.00),
  (137,'${BGL}','OTRO CONCEPTO YA ASIGNADO','insumos',10.00),(355,'${RV}','mozzarella','insumos',1202.00),(271,'${ARCA}','Refrescos','insumos',3164.50);
 insert into public.pago_aplicaciones(factura_id,monto) values('${ARCA}',3164.50);
 insert into public.gastos_caja_chica(id,sucursal_id,fecha,concepto,proveedor,monto,comprobante,cuenta_pl,origen,pagado_por,version) values
  ('c7fa7e39-ce68-4c77-b29b-b07ebc025a60','${LC}','2026-11-02','Coca cola','Coca',3164.50,'nota','insumos','caja_chica',null,2),
  ('ff49bf77-41cc-411f-9a3e-1e662c3dc5b6','${LC}','2026-11-03','Queso Mozarella','Sam''s',1202.00,'nota','otros','empleado','${RICARDO}',2),
  ('ef91f528-f300-42a8-944c-7fe92854b8b2','${LC}','2026-11-07','Jamon','Sams',1061.08,'nota','otros','empleado','${RICARDO}',2),
  ('f8b716b0-eee2-4001-b913-696e72d82eb3','${LC}','2026-11-08','Jamon','Sams',1145.76,'nota','otros','empleado','${RICARDO}',3),
  ('d495916c-2afc-4492-bdec-1cc101fecf83','${LC}','2026-11-04','Mozzarella','Sams',940.00,'nota','otros','caja_chica',null,1),
  ('81a898bf-86fd-4d30-941f-dfc20e595a2c','${LC}','2026-11-03','Azucar','Seven',138.00,'nota','otros','caja_chica',null,1),
  ('11111111-0000-0000-0000-000000000099','${LC}','2026-11-05','Otro gasto','Oxxo',50.00,'nota','otros','caja_chica',null,1);`);
 await db.exec(mig1); await db.exec(mig2);
 return db;
}
const filas=r=>r.filter(x=>x.rows.length).map(x=>x.rows).flat();

test('lote 2: el ensayo devuelve PRUEBAS OK y no guarda nada',async()=>{
 const db=await nueva();
 assert.match(filas(await db.exec(prueba)).at(-1).resultado,/^PRUEBAS OK/);
 assert.equal((await db.query(`select count(*)::int n from public.gastos_historial`)).rows[0].n,0);
 assert.equal((await db.query(`select count(*)::int n from public.gastos_caja_chica where anulado_en is not null`)).rows[0].n,0);
 assert.equal((await db.query(`select count(*)::int n from public.factura_conceptos where cuenta_pl='consumibles_equipo'`)).rows[0].n,0);
});
test('lote 2: aplica con las funciones oficiales, deja historial y repetir no cambia nada',async()=>{
 const db=await nueva();
 const r=filas(await db.exec(corr));
 assert.deepEqual(r,[{resultado:'LOTE 2 OK',cuentas_asignadas:6,duplicados_eliminados:4,gastos_con_historial:6}]);
 assert.deepEqual(filas(await db.exec(corr)),r);
 const q=async s=>(await db.query(s)).rows;
 assert.deepEqual(await q(`select id::int,cuenta_pl from public.factura_conceptos where factura_id='${BGL}' order by id`),
  [{id:133,cuenta_pl:'consumibles_equipo'},{id:134,cuenta_pl:'consumibles_equipo'},{id:135,cuenta_pl:'consumibles_equipo'},{id:136,cuenta_pl:'consumibles_equipo'},{id:137,cuenta_pl:'insumos'}]);
 assert.deepEqual(await q(`select concepto,cuenta_pl,version::int,anulado_en is not null as anulado from public.gastos_caja_chica order by concepto,monto`),[
  {concepto:'Azucar',cuenta_pl:'insumos',version:2,anulado:false},
  {concepto:'Coca cola',cuenta_pl:'insumos',version:3,anulado:true},
  {concepto:'Jamon',cuenta_pl:'otros',version:3,anulado:true},
  {concepto:'Jamon',cuenta_pl:'otros',version:4,anulado:true},
  {concepto:'Mozzarella',cuenta_pl:'insumos',version:2,anulado:false},
  {concepto:'Otro gasto',cuenta_pl:'otros',version:1,anulado:false},
  {concepto:'Queso Mozarella',cuenta_pl:'otros',version:3,anulado:true}]);
 assert.deepEqual(await q(`select codigo,rfc,count(*)::int n from public.contabilidad_actual group by 1,2 order by 1`),
  [{codigo:'502-01-000',rfc:'HCM260306B93',n:2},{codigo:'602-54-000',rfc:'CMS230321FI8',n:4}]);
 assert.equal((await q(`select count(*)::int n from public.compra_notas where factura_id='${BGL}'`))[0].n,1);
 assert.equal((await q(`select count(*)::int n from public.factura_conceptos where factura_id in('${RV}','${ARCA}')`))[0].n,2);
});
test('lote 2: si algo cambió o ya tiene repuesto, no guarda nada',async()=>{
 for(const [cambio,error] of [
  [`update public.gastos_caja_chica set monto=999 where id='d495916c-2afc-4492-bdec-1cc101fecf83'`,/n128: el gasto cambió/],
  [`update public.factura_conceptos set importe=1 where id=134`,/n66: cambió el concepto/],
  [`update public.factura_conceptos set cuenta_pl='otros' where id=135`,/n67: cambió el concepto/],
  [`update public.gastos_caja_chica set repuesto_en=now() where id='ff49bf77-41cc-411f-9a3e-1e662c3dc5b6'`,/reposición o reembolso/],
  [`insert into public.movimientos(sucursal_id,tipo,estado) values('${LC}','reposicion_caja_chica','aprobado')`,/reposición o reembolso/],
 ]){
  const db=await nueva();
  if(cambio.includes('repuesto_en')){await db.exec(`drop trigger versionar_gasto_admin on public.gastos_caja_chica`);}
  await db.exec(cambio);
  await assert.rejects(db.exec(corr),error);
  await db.exec('rollback');
  assert.equal((await db.query(`select count(*)::int n from public.gastos_historial`)).rows[0].n,0);
  assert.equal((await db.query(`select count(*)::int n from public.contabilidad_asignaciones`)).rows[0].n,0);
 }
});
