import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const anterior=load('supabase/migrations/20261020013338_recolecciones_entregas_parciales.sql');
const migracion=load('supabase/migrations/20261117180000_recolecciones_sin_cierres.sql');
const prueba=load('supabase/pruebas/20261117180000_recolecciones_sin_cierres.sql');
const S='11111111-0000-0000-0000-000000000001',S2='11111111-0000-0000-0000-000000000002';
const ADMIN='aaaaaaaa-0000-0000-0000-000000000001',GERENTE='aaaaaaaa-0000-0000-0000-000000000002';
const LUNES='2026-11-09',DOMINGO='2026-11-15';

// Copia de las estructuras reales (0001, 0010, 0063) que tocan vista_recoleccion y registrar_recoleccion.
async function nueva(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; grant usage on schema auth to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
 create type public.rol_usuario as enum('cajero','encargado','gerente','admin','corporativo','operacion','marketing');
 create type public.tipo_caja as enum('venta','cambios','boveda','caja_chica','corporativo');
 create type public.tipo_movimiento as enum('apertura','retiro_boveda','cambio_morralla','salida_corporativo','reposicion_caja_chica');
 create type public.estado_movimiento as enum('pendiente','confirmado','rechazado');
 create table public.sucursales(id uuid primary key,nombre text not null);
 create table public.perfiles(id uuid primary key,nombre text,rol public.rol_usuario not null,activo boolean not null default true,debe_cambiar_contrasena boolean not null default false,sucursal_id uuid references public.sucursales(id));
 create table public.cajas(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references public.sucursales(id),tipo public.tipo_caja not null,nombre text not null,saldo_inicial numeric(12,2) not null default 0,unique(sucursal_id,tipo));
 create table public.cierres_dia(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references public.sucursales(id),fecha date not null,efectivo numeric(12,2) not null default 0,
  boveda_inicial numeric(12,2) not null default 0,boveda_contado numeric(12,2) not null default 0,retiros_dia numeric(12,2) not null default 0,aperturas_dia numeric(12,2) not null default 0,
  deposito_dia numeric(12,2) not null default 0,gastos_boveda_dia numeric(12,2) not null default 0,gastos_ventas_dia numeric(12,2) not null default 0,unique(sucursal_id,fecha));
 create table public.movimientos(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references public.sucursales(id),turno_id uuid,tipo public.tipo_movimiento not null,
  caja_origen_id uuid not null references public.cajas(id),caja_destino_id uuid not null references public.cajas(id),monto numeric(12,2) not null check(monto>0),folio text,nota text,
  estado public.estado_movimiento not null default 'pendiente',registrado_por uuid not null references public.perfiles(id),confirmado_por uuid references public.perfiles(id),confirmado_en timestamptz,
  creado_en timestamptz not null default now(),check(caja_origen_id<>caja_destino_id),check(confirmado_por is null or confirmado_por<>registrado_por));
 create table public.recolecciones_corporativo(id uuid primary key references public.movimientos(id),sucursal_id uuid not null references public.sucursales(id),desde date not null,hasta date not null check(hasta>=desde),
  expediente jsonb not null,creado_por uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),contado_corporativo numeric(12,2),recibido_por uuid references public.perfiles(id),recibido_en timestamptz,nota_recepcion text);
 create table public.recoleccion_cierres(recoleccion_id uuid not null references public.recolecciones_corporativo(id),cierre_id uuid not null references public.cierres_dia(id),liberado_en timestamptz,primary key(recoleccion_id,cierre_id));
 create unique index cierre_una_recoleccion on public.recoleccion_cierres(cierre_id) where liberado_en is null;
 alter table public.movimientos add column recoleccion_id uuid references public.recolecciones_corporativo(id) deferrable initially deferred;
 create function public.exigir_expediente_salida() returns trigger language plpgsql security definer set search_path=public as $$
 begin
  if new.tipo='salida_corporativo' and (new.recoleccion_id is null or new.recoleccion_id<>new.id) then raise exception 'Registra la salida desde Recolecciones con sus cierres y respaldo.';end if;
  return new;
 end $$;
 create trigger exigir_expediente_salida before insert on public.movimientos for each row execute function public.exigir_expediente_salida();
 create function public.liberar_cierres_rechazados() returns trigger language plpgsql security definer set search_path=public as $$
 begin
  if new.estado='rechazado' and old.estado='pendiente' then update public.recoleccion_cierres set liberado_en=now() where recoleccion_id=new.id and liberado_en is null;end if;
  return new;
 end $$;
 create trigger recoleccion_rechazada after update of estado on public.movimientos for each row execute function public.liberar_cierres_rechazados();
 create table public.pagos(id uuid primary key,referencia text,nota_boveda text,comprobante_ruta text,anulado_en timestamptz,origen_fondos text,forma text,fecha date,monto numeric);
 create table public.pagos_boveda_eventos(id uuid,pago_id uuid,fecha_operativa date,creado_en timestamptz,tipo text,importe numeric,sucursal_id uuid);
 create table public.pagos_ventas_eventos(like public.pagos_boveda_eventos);
 create table public.pago_aplicaciones(pago_id uuid,factura_id uuid,monto numeric);
 create table public.facturas(id uuid,folio text,uuid text,origen text,sucursal_id uuid);
 create table public.factura_ordenes(factura_id uuid,orden_id uuid);
 create table public.ordenes_compra(id uuid,folio text);
 create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$
  select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create function public.mi_sucursal() returns uuid language sql stable security definer set search_path='' as $$ select sucursal_id from public.perfiles where id=auth.uid() $$;
 create function public.ve_todas_las_sucursales() returns boolean language sql stable security definer set search_path='' as $$ select coalesce(public.mi_rol()::text in ('admin','corporativo'),false) $$;
 create function public.hoy_mx() returns date language sql stable as $$ select date '2026-11-17' $$;
 create function public.disponibilidad_boveda(uuid) returns jsonb language sql stable as $$ select '{"saldo":30000,"fondo":4500,"reservado":0,"salidas":0,"disponible":25500}'::jsonb $$;
 revoke all on public.recolecciones_corporativo,public.recoleccion_cierres,public.movimientos from public,anon,authenticated;
 grant select on public.sucursales,public.perfiles,public.cajas,public.cierres_dia,public.movimientos,public.recolecciones_corporativo,public.recoleccion_cierres to authenticated;
 insert into public.sucursales values('${S}','Dodo La Calma (Dodo-1)'),('${S2}','Otra');
 insert into public.perfiles(id,nombre,rol,sucursal_id) values('${ADMIN}','Sebastián','admin','${S}'),('${GERENTE}','Gerente','gerente','${S2}');
 insert into public.cajas(sucursal_id,tipo,nombre) values('${S}','boveda','Bóveda'),('${S}','corporativo','Corporativo'),('${S2}','boveda','Bóveda'),('${S2}','corporativo','Corporativo');`);
 await db.exec(anterior);
 await db.exec(`revoke all on function public.vista_recoleccion(uuid,date,date),public.registrar_recoleccion(uuid,uuid,date,date,numeric,text,text,boolean) from public,anon;
 grant execute on function public.vista_recoleccion(uuid,date,date),public.registrar_recoleccion(uuid,uuid,date,date,numeric,text,text,boolean) to authenticated;`);
 return db;
}
const como=(db,id)=>db.exec(`select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',false); set role authenticated;`);
const vista=async(db,d=LUNES,h=DOMINGO,s=S)=>(await db.query(`select public.vista_recoleccion('${s}','${d}','${h}') as e`)).rows[0].e;
const registrar=(db,id,{monto=1000,revisado=true,s=S,d=LUNES,h=DOMINGO}={})=>db.query(`select public.registrar_recoleccion('${id}','${s}','${d}','${h}',${monto},'LC-PRUEBA','Entrega de prueba',true,${revisado}) as id`);
const R1='bbbbbbbb-0000-0000-0000-000000000001',R2='bbbbbbbb-0000-0000-0000-000000000002';

test('sin la migración, una semana sin cierres da el error de hoy',async()=>{
 const db=await nueva(); await como(db,ADMIN);
 await assert.rejects(vista(db),/No hay cierres en este rango/);
});
test('semana sin cierres: la vista muestra el disponible y marca sin_cierres',async()=>{
 const db=await nueva(); await db.exec(migracion); await como(db,ADMIN);
 const e=await vista(db);
 assert.equal(e.sin_cierres,true); assert.deepEqual(e.cierres,[]); assert.equal(e.incremento_periodo,null); assert.equal(Number(e.maximo),25500);
});
test('semana sin cierres: pide confirmar el conteo, registra sin ligar cierres y no duplica',async()=>{
 const db=await nueva(); await db.exec(migracion); await como(db,ADMIN);
 await assert.rejects(registrar(db,R1,{revisado:false}),/no tienen cierres del día/);
 assert.equal((await registrar(db,R1)).rows[0].id,R1);
 assert.equal((await registrar(db,R1)).rows[0].id,R1);
 await assert.rejects(registrar(db,R2),/Ya hay una recolección de estas fechas/);
 await assert.rejects(vista(db),/Ya hay una recolección de estas fechas/);
 await db.exec('reset role');
 const r=(await db.query(`select (r.expediente->>'sin_cierres')::boolean sc,m.monto::text,m.estado::text,(select count(*)::int from public.recoleccion_cierres where recoleccion_id=r.id) n from public.recolecciones_corporativo r join public.movimientos m on m.id=r.id`)).rows;
 assert.deepEqual(r,[{sc:true,monto:'1000.00',estado:'pendiente',n:0}]);
});
test('semana sin cierres: si se rechaza la entrega, se puede preparar otra',async()=>{
 const db=await nueva(); await db.exec(migracion); await como(db,ADMIN);
 await registrar(db,R1); await db.exec('reset role');
 await db.exec(`update public.movimientos set estado='rechazado' where id='${R1}'`);
 await como(db,ADMIN);
 assert.equal((await registrar(db,R2,{monto:500})).rows[0].id,R2);
});
test('semana con cierres: igual que antes, liga los cierres y no pide la casilla',async()=>{
 const db=await nueva(); await db.exec(migracion);
 await db.exec(`insert into public.cierres_dia(sucursal_id,fecha,efectivo,boveda_inicial,boveda_contado) values('${S}','2026-11-10',8000,20000,26000),('${S}','2026-11-12',7000,26000,30000)`);
 await como(db,ADMIN);
 const e=await vista(db);
 assert.equal(e.sin_cierres,false); assert.equal(e.cierres.length,2); assert.equal(Number(e.incremento_periodo),10000);
 await registrar(db,R1,{revisado:false});
 await db.exec('reset role');
 assert.equal((await db.query(`select count(*)::int n from public.recoleccion_cierres where recoleccion_id='${R1}' and liberado_en is null`)).rows[0].n,2);
 await como(db,ADMIN);
 await assert.rejects(vista(db),/ya está asociado/);
});
test('gerente de otra sucursal no registra',async()=>{
 const db=await nueva(); await db.exec(migracion); await como(db,GERENTE);
 await assert.rejects(registrar(db,R1),/Solo gerente de la sucursal/);
});
test('ensayo de producción termina en PRUEBAS OK y no guarda nada',async()=>{
 const db=await nueva(); await db.exec(migracion);
 await assert.rejects(db.exec(prueba),/PRUEBAS OK/);
 assert.equal((await db.query(`select count(*)::int n from public.recolecciones_corporativo`)).rows[0].n,0);
 assert.equal((await db.query(`select count(*)::int n from public.movimientos`)).rows[0].n,0);
});
