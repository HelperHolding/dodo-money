// Lo mínimo de Supabase y de los módulos ligados. Enums y checks copian los reales (0001, 0008, 0012, 0013, 0037, 0048).
export const BASE=`create role anon;create role authenticated;create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select (nullif(current_setting('request.jwt.claims',true),'')::json->>'sub')::uuid$$;
 grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
 create type rol_usuario as enum('operacion','encargado','gerente','admin','corporativo');
 create table sucursales(id uuid primary key,nombre text not null);
 insert into sucursales values('00000000-0000-0000-0000-0000000000e1','Zapopan-1'),('00000000-0000-0000-0000-0000000000e2','Tlaquepaque');
 create table perfiles(id uuid primary key,nombre text not null,rol rol_usuario not null,sucursal_id uuid references sucursales(id),activo boolean not null default true,debe_cambiar_contrasena boolean not null default false);
 insert into perfiles values
  ('00000000-0000-0000-0000-0000000000a1','Julio','admin',null,true,false),
  ('00000000-0000-0000-0000-0000000000c1','Halim','corporativo',null,true,false),
  ('00000000-0000-0000-0000-0000000000d0','Gerente Z','gerente','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000d1','Encargado Z','encargado','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000f1','Ana (op Z)','operacion','00000000-0000-0000-0000-0000000000e1',true,false),
  ('00000000-0000-0000-0000-0000000000f2','Luis (op T)','operacion','00000000-0000-0000-0000-0000000000e2',true,false),
  ('00000000-0000-0000-0000-0000000000f3','Baja (op Z)','operacion','00000000-0000-0000-0000-0000000000e1',false,false);
 create function mi_rol() returns rol_usuario language sql stable security definer set search_path='' as $$select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 create function mi_sucursal() returns uuid language sql stable security definer set search_path='' as $$select sucursal_id from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena$$;
 grant execute on function mi_rol(),mi_sucursal() to authenticated;
 create function hoy_mx() returns date language sql stable as $$select date '2026-11-02'$$;
 create table proveedores(id uuid primary key,razon_social text not null,nombre_comercial text);
 insert into proveedores values('00000000-0000-0000-0000-0000000000b1','HARINAS DEL BAJIO SA','Harinas Bajío');
 create type estado_orden as enum('borrador','enviada','confirmada','cerrada','cancelada');
 create table ordenes_compra(id uuid primary key,folio text not null unique,proveedor_id uuid not null references proveedores(id),sucursal_id uuid references sucursales(id),estado estado_orden not null default 'borrador');
 insert into ordenes_compra values('00000000-0000-0000-0000-00000000000a','OC-0042','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000e1','cancelada');
 create type estado_factura as enum('por_pagar','parcial','pagada','cancelada');
 create table facturas(id uuid primary key,uuid text not null unique,serie text,folio text,nombre_emisor text not null,sucursal_id uuid references sucursales(id),estado estado_factura not null default 'por_pagar');
 insert into facturas values('00000000-0000-0000-0000-0000000000fa','8f1c2d3e-aaaa-bbbb-cccc-000000000001','A','1234','HARINAS DEL BAJIO SA','00000000-0000-0000-0000-0000000000e1','por_pagar'),
  ('00000000-0000-0000-0000-0000000000fb','9e2d3c4b-aaaa-bbbb-cccc-000000000002',null,null,'CFE',null,'por_pagar');
 create table ventas_dia(id uuid primary key,sucursal_id uuid not null references sucursales(id),fecha date not null);
 insert into ventas_dia values('00000000-0000-0000-0000-0000000000a5','00000000-0000-0000-0000-0000000000e1','2026-11-01'),('00000000-0000-0000-0000-0000000000a6','00000000-0000-0000-0000-0000000000e2','2026-11-01');
 create table apertura_proyectos(id uuid primary key,sucursal_id uuid not null unique references sucursales(id));
 insert into apertura_proyectos values('00000000-0000-0000-0000-0000000000a7','00000000-0000-0000-0000-0000000000e2');
 create table apertura_items(id uuid primary key,proyecto_id uuid not null references apertura_proyectos(id),clave text not null,nombre text not null);
 insert into apertura_items values('00000000-0000-0000-0000-0000000000a8','00000000-0000-0000-0000-0000000000a7','E-12','Horno de banda');`;

export const U={admin:'00000000-0000-0000-0000-0000000000a1',corp:'00000000-0000-0000-0000-0000000000c1',gerente:'00000000-0000-0000-0000-0000000000d0',
 encargado:'00000000-0000-0000-0000-0000000000d1',ana:'00000000-0000-0000-0000-0000000000f1',luis:'00000000-0000-0000-0000-0000000000f2',baja:'00000000-0000-0000-0000-0000000000f3'};
export const S={z:'00000000-0000-0000-0000-0000000000e1',t:'00000000-0000-0000-0000-0000000000e2'};
export const como=(db,id)=>db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify({sub:id,role:'authenticated'})]);
