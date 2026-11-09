import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

// Diseño: docs/superpowers/specs/2026-11-09-capex-aperturas-design.md
const load=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/^\uFEFF/,'');
const migracion=load('supabase/migrations/20261109180000_capex_aperturas.sql');
export const ADMIN='00000000-0000-0000-0000-0000000000a1',CORP='00000000-0000-0000-0000-0000000000c1',GER='00000000-0000-0000-0000-0000000000e1';
export const S1='10000000-0000-0000-0000-000000000001',S2='10000000-0000-0000-0000-000000000002';
export const P1='20000000-0000-0000-0000-000000000001',P2='20000000-0000-0000-0000-000000000002';
const CATEGORIAS=['proyecto_permisos','obra_civil','instalaciones','equipo_cocina','camara_fria','mobiliario','tecnologia','senaletica','smallware','otros'];

// Lo mínimo de Supabase, perfiles, compras y aperturas; CHECK y enums copiados de 0012, 0013, 0014 y 0037.
const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 create table perfiles(id uuid primary key,activo boolean not null default true,rol text not null,nombre text);
 insert into perfiles values('${ADMIN}',true,'admin','Admin'),('${CORP}',true,'corporativo','Corporativo'),('${GER}',true,'gerente','Gerente');
 create function ve_finanzas() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create function edita_finanzas() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol='admin')$$;
 create function ve_compras() returns boolean language sql stable as $$select exists(select 1 from public.perfiles where id=auth.uid() and rol in ('admin','corporativo'))$$;
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('${S1}','Dodo Uno'),('${S2}','Dodo Dos');
 create type estado_orden as enum ('borrador','enviada','confirmada','cerrada','cancelada');
 create type tipo_factura as enum ('ingreso','egreso');
 create type estado_factura as enum ('por_pagar','parcial','pagada','cancelada');
 create table proveedores(id uuid primary key default gen_random_uuid(),razon_social text not null);
 create table ordenes_compra(id uuid primary key,folio text,proveedor_id uuid references proveedores(id),sucursal_id uuid references sucursales(id),estado estado_orden not null default 'borrador');
 create table orden_renglones(id uuid primary key default gen_random_uuid(),orden_id uuid not null references ordenes_compra(id),cantidad numeric(12,3) not null check(cantidad>0),precio numeric(12,2) not null default 0 check(precio>=0));
 create table facturas(id uuid primary key,uuid text not null unique,folio text,tipo tipo_factura not null,proveedor_id uuid references proveedores(id),sucursal_id uuid references sucursales(id),uuid_relacionado text,
  subtotal numeric(14,2) not null,descuento numeric(14,2) not null default 0,total numeric(14,2) not null check(total>=0),estado estado_factura not null default 'por_pagar');
 create table factura_ordenes(factura_id uuid not null references facturas(id),orden_id uuid not null references ordenes_compra(id),primary key(factura_id,orden_id));
 create table pagos(id uuid primary key default gen_random_uuid(),monto numeric(14,2) not null check(monto>0),anulado_en timestamptz);
 create table pago_aplicaciones(id bigserial primary key,pago_id uuid not null references pagos(id),factura_id uuid not null references facturas(id),monto numeric(14,2) not null check(monto>0),unique(pago_id,factura_id));
 create table apertura_proyectos(id uuid primary key,sucursal_id uuid not null unique references sucursales(id),responsable text not null,objetivo_desde date not null,objetivo_hasta date not null check(objetivo_hasta>=objetivo_desde),presupuesto numeric(16,2),revision integer not null default 1);
 insert into apertura_proyectos values('${P1}','${S1}','Julio','2026-11-01','2026-12-15',null,1),('${P2}','${S2}','Julio','2026-12-01','2027-01-15',null,1);
 create table apertura_items(id uuid primary key default gen_random_uuid(),proyecto_id uuid not null references apertura_proyectos(id),tipo text not null,categoria text,nombre text not null default 'Item',orden_id uuid references ordenes_compra(id),factura_id uuid references facturas(id));
 create table inversion_apertura_fuentes(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references sucursales(id),nombre text not null,fecha date not null,total numeric(16,2) not null,datos jsonb not null);
 grant usage on schema auth to authenticated;grant select on perfiles to authenticated;`;

export async function preparar(){const db=new PGlite();await db.exec(BASE);await db.exec(migracion);return db;}
export async function como(db,id){await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);}
const aprobar=(db,p,rev,montos,motivo='Presupuesto inicial')=>db.query('select public.aprobar_capex_presupuesto($1,$2,$3::jsonb,$4) r',[p,rev,JSON.stringify(montos),motivo]).then(x=>x.rows[0].r);

test('capex: diez categorías con las claves del diseño',async()=>{
 const db=await preparar();
 try{assert.deepEqual((await db.query('select clave from capex_categorias order by orden')).rows.map(r=>r.clave),CATEGORIAS);}
 finally{await db.close();}
});

test('capex: aprobar presupuesto crea revisiones completas y detecta conflictos',async()=>{
 const db=await preparar();
 try{
  await como(db,ADMIN);
  assert.equal(await aprobar(db,P1,0,{obra_civil:1300000,equipo_cocina:450000.555}),1);
  const r1=(await db.query(`select categoria,monto::float8 m from capex_presupuestos where proyecto_id=$1 and revision=1 order by categoria`,[P1])).rows;
  assert.equal(r1.length,10);
  assert.equal(r1.find(x=>x.categoria==='obra_civil').m,1300000);
  assert.equal(r1.find(x=>x.categoria==='equipo_cocina').m,450000.56);
  assert.equal(r1.find(x=>x.categoria==='otros').m,0);
  await assert.rejects(aprobar(db,P1,0,{obra_civil:1}),/El presupuesto cambió/);
  assert.equal(await aprobar(db,P1,1,{obra_civil:1400000},'Ajuste por cotización de obra'),2);
  await assert.rejects(aprobar(db,P1,2,{pisos:1}),/Categoría inválida/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:-1}),/Monto inválido/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:'mil'}),/Monto inválido/);
  await assert.rejects(aprobar(db,P1,2,{},'Sin montos'),/al menos una categoría/);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:1},'abc'),/motivo/);
  await assert.rejects(aprobar(db,'30000000-0000-0000-0000-000000000009',0,{obra_civil:1}),/La apertura no existe/);
  await como(db,CORP);
  await assert.rejects(aprobar(db,P1,2,{obra_civil:1}),/Solo administración/);
  assert.equal((await db.query(`select has_function_privilege('anon','public.aprobar_capex_presupuesto(uuid,integer,jsonb,text)','EXECUTE') p`)).rows[0].p,false);
 }finally{await db.close();}
});
