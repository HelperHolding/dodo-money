import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^﻿/,'');
const migracion=load('supabase/migrations/20261117120000_agregar_foto_gasto.sql');
const prueba=load('supabase/pruebas/20261117120000_agregar_foto_gasto.sql');
const S='11111111-0000-0000-0000-000000000001',S2='11111111-0000-0000-0000-000000000002';
const ADMIN='aaaaaaaa-0000-0000-0000-000000000001',GERENTE='aaaaaaaa-0000-0000-0000-000000000002';

// Copia de las estructuras reales de 0065 y 20261020220000 que toca la función.
async function nueva(){
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated;
 create schema auth; grant usage on schema auth to authenticated,anon;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
 create type public.rol_usuario as enum('admin','gerente','encargado','operacion','corporativo');
 create type public.origen_gasto as enum('caja_chica','boveda','empleado');
 create type public.tipo_comprobante as enum('cfdi','nota','sin_comprobante');
 create table public.sucursales(id uuid primary key,nombre text);
 create table public.perfiles(id uuid primary key,nombre text,rol public.rol_usuario,activo boolean,debe_cambiar_contrasena boolean,sucursal_id uuid);
 create table public.cajas(id serial primary key,sucursal_id uuid,tipo text,saldo_inicial numeric);
 create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$
  select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena $$;
 create function public.hoy_mx() returns date language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;
 create table public.gastos_caja_chica(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null,fecha date,concepto text,proveedor text,monto numeric,
  comprobante public.tipo_comprobante,origen public.origen_gasto,cuenta_pl text,registrado_por uuid,foto_path text,
  informativo boolean not null default false,motivo_informativo text,referencia_informativa text,informado_por uuid,informado_en timestamptz,respaldo_informativo text,
  version bigint not null default 1,anulado_en timestamptz,anulado_por uuid,motivo_anulacion text,
  constraint gastos_foto_de_su_sucursal check (foto_path is null or foto_path like sucursal_id::text || '/%'),
  constraint gasto_informativo_respaldo check(
   (informativo and motivo_informativo is not null and length(trim(motivo_informativo)) between 10 and 1000 and referencia_informativa is not null and length(trim(referencia_informativa)) between 3 and 200 and informado_por is not null and informado_en is not null and respaldo_informativo is not null)
   or (not informativo and motivo_informativo is null and referencia_informativa is null and informado_por is null and informado_en is null and respaldo_informativo is null)),
  constraint gasto_anulado_con_autor check((anulado_en is null and anulado_por is null and motivo_anulacion is null)
   or(anulado_en is not null and anulado_por is not null and length(trim(motivo_anulacion)) between 5 and 1000)));
 create table public.gastos_historial(id uuid primary key,gasto_id uuid not null references public.gastos_caja_chica(id),autor_id uuid not null references public.perfiles(id),
  accion text not null,motivo text not null,solicitud jsonb not null,antes jsonb not null,despues jsonb not null,creado_en timestamptz not null default now());
 create function public.versionar_gasto_admin() returns trigger language plpgsql set search_path='' as $$
 begin
  if old.anulado_en is not null then raise exception 'El gasto eliminado conserva su historial y no se modifica.';end if;
  new.version:=old.version+1;
  return new;
 end $$;
 create trigger versionar_gasto_admin before update on public.gastos_caja_chica for each row execute function public.versionar_gasto_admin();
 create function public.proteger_gasto_informativo() returns trigger language plpgsql set search_path='' as $$
 begin
  if tg_op='UPDATE' and public.mi_rol()::text='admin' and current_setting('dodo.editar_gasto_admin',true)='si' then return new;end if;
  raise exception 'Un gasto informativo conserva su registro original y respaldo; usa la corrección administrativa.';
 end $$;
 create trigger proteger_gasto_informativo before update or delete on public.gastos_caja_chica for each row when(old.informativo) execute function public.proteger_gasto_informativo();
 create view public.saldos_cajas as select c.sucursal_id,c.tipo,c.saldo_inicial-coalesce((select sum(g.monto) from public.gastos_caja_chica g where g.sucursal_id=c.sucursal_id and g.origen::text=c.tipo and not g.informativo and g.anulado_en is null),0) as saldo from public.cajas c;
 revoke all on public.gastos_caja_chica,public.gastos_historial from public,anon,authenticated;
 grant select on public.gastos_caja_chica,public.gastos_historial,public.saldos_cajas,public.perfiles,public.cajas to authenticated;
 insert into public.sucursales values('${S}','La Calma'),('${S2}','Otra');
 insert into public.perfiles values('${ADMIN}','Sebastián','admin',true,false,'${S}'),('${GERENTE}','Gerente','gerente',true,false,'${S}');
 insert into public.cajas(sucursal_id,tipo,saldo_inicial) values('${S}','caja_chica',5000);`);
 return db;
}
const filas=r=>r.filter(x=>x.rows?.length).map(x=>x.rows).flat();
const como=(db,id)=>db.exec(`select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated"}',false); set role authenticated;`);
async function gasto(db){
 return (await db.query(`insert into public.gastos_caja_chica(sucursal_id,fecha,concepto,monto,comprobante,origen,cuenta_pl,registrado_por) values('${S}',current_date,'Jamon',1145.76,'nota','caja_chica','otros','${ADMIN}') returning id`)).rows[0].id;
}
const agregar=(db,g,v,foto,sol='gen_random_uuid()')=>db.query(`select public.agregar_foto_gasto_admin(${sol},'${g}',${v},'${foto}') as id`);

test('agregar foto: llena foto_path, sube versión, deja historial y no mueve el saldo',async()=>{
 const db=await nueva(); await db.exec(migracion); const g=await gasto(db);
 const saldo0=(await db.query(`select saldo from public.saldos_cajas`)).rows[0].saldo;
 await como(db,ADMIN);
 const sol=`'22222222-0000-0000-0000-000000000001'`;
 await agregar(db,g,1,`${S}/ticket.jpg`,sol); await agregar(db,g,1,`${S}/ticket.jpg`,sol);
 await db.exec('reset role');
 const r=(await db.query(`select foto_path,version,monto::text from public.gastos_caja_chica where id='${g}'`)).rows[0];
 assert.deepEqual(r,{foto_path:`${S}/ticket.jpg`,version:2,monto:'1145.76'});
 assert.equal((await db.query(`select saldo from public.saldos_cajas`)).rows[0].saldo,saldo0);
 assert.equal((await db.query(`select count(*)::int n from public.gastos_historial where gasto_id='${g}' and accion='agregar_foto'`)).rows[0].n,1);
});
test('agregar foto: rechaza otro rol, foto ajena, foto existente y versión vieja',async()=>{
 const db=await nueva(); await db.exec(migracion); const g=await gasto(db);
 await como(db,GERENTE);
 await assert.rejects(agregar(db,g,1,`${S}/a.jpg`),/Solo administración/);
 await db.exec('reset role'); await como(db,ADMIN);
 await assert.rejects(agregar(db,g,1,`${S2}/a.jpg`),/sucursal del gasto/);
 await assert.rejects(agregar(db,g,9,`${S}/a.jpg`),/cambió/);
 await agregar(db,g,1,`${S}/a.jpg`);
 await assert.rejects(agregar(db,g,2,`${S}/b.jpg`),/ya tiene foto/);
 await assert.rejects(db.query(`update public.gastos_caja_chica set foto_path=null where id='${g}'`),/permission denied/);
});
test('agregar foto: sin la migración no existe la función',async()=>{
 const db=await nueva(); const g=await gasto(db); await como(db,ADMIN);
 await assert.rejects(agregar(db,g,1,`${S}/a.jpg`),/does not exist/);
});
test('agregar foto: ensayo de producción termina en PRUEBAS OK y no guarda nada',async()=>{
 const db=await nueva(); await db.exec(migracion);
 await assert.rejects(db.exec(prueba),/PRUEBAS OK/);
 assert.equal((await db.query(`select count(*)::int n from public.gastos_caja_chica`)).rows[0].n,0);
 assert.equal((await db.query(`select count(*)::int n from public.gastos_historial`)).rows[0].n,0);
});
