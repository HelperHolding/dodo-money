create role anon; create role authenticated;
create schema auth; grant usage on schema auth to authenticated, anon;
create function auth.uid() returns uuid language sql stable as $$ select nullif(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub','')::uuid $$;
create type public.rol_usuario as enum('admin','gerente','encargado','operacion','corporativo','marketing');
create type public.categoria_producto as enum('pizza','snack','postre','bebida','otro');
create table public.sucursales(id uuid primary key, nombre text);
create table public.perfiles(id uuid primary key, rol public.rol_usuario, activo boolean, debe_cambiar_contrasena boolean);
create function public.mi_rol() returns public.rol_usuario language sql stable security definer set search_path='' as $$
  select rol from public.perfiles where id = auth.uid() and activo and not debe_cambiar_contrasena $$;
create function public.ve_todas_las_sucursales() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(public.mi_rol()::text in ('admin','corporativo'), false) $$;
create table public.razon_social_sucursales(rfc text, sucursal_id uuid, primary key(rfc, sucursal_id));
create table public.ventas_dia(id uuid primary key default gen_random_uuid(), sucursal_id uuid, fecha date, pedidos integer, total numeric(12,2), iva numeric(12,2), unique(sucursal_id, fecha));
create table public.ventas_dia_desglose(ventas_dia_id uuid not null references public.ventas_dia(id) on delete cascade,
  tipo text not null check (tipo in ('entrega', 'llevadera', 'restaurante', 'centro_llamadas', 'sitio', 'app', 'agregador')), pedidos integer not null default 0,
  total numeric(12,2) not null default 0, efectivo numeric(12,2) not null default 0, tarjeta numeric(12,2) not null default 0, en_linea numeric(12,2) not null default 0,
  iva numeric(12,2) not null default 0, primary key (ventas_dia_id, tipo));
create table public.productos_venta(dodo_id integer primary key, nombre text, categoria public.categoria_producto);
create table public.pedidos(dodo_id text primary key, sucursal_id uuid, fecha date, hora time, pago text, tipo text, origen text, para_llevar boolean,
  estado text, total numeric(12,2), iva numeric(12,2), productos integer, agregador text);
create table public.pedido_productos(pedido_id text references public.pedidos(dodo_id), renglon integer, dodo_id integer, nombre text, precio numeric(12,2), combo text, primary key(pedido_id, renglon));
create table public.rappi_ordenes(rappi_id text primary key, sucursal_id uuid, fecha date, hora time, estado text, subtotal_restaurante numeric(16,2), sumar boolean, archivo text not null);
create table public.rappi_lineas(rappi_id text references public.rappi_ordenes(rappi_id), linea integer, nombre text, cantidad integer, importe numeric(16,2), primary key(rappi_id, linea));
grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;

insert into public.sucursales values ('11111111-0000-0000-0000-000000000001','Zapopan-1'),('11111111-0000-0000-0000-000000000002','Guadalajara-1');
insert into public.perfiles values ('aaaaaaaa-0000-0000-0000-000000000001','corporativo',true,false),('aaaaaaaa-0000-0000-0000-000000000002','gerente',true,false),('aaaaaaaa-0000-0000-0000-000000000003','admin',true,false);
insert into public.razon_social_sucursales values ('HEL0101011A1','11111111-0000-0000-0000-000000000001');
insert into public.ventas_dia(sucursal_id, fecha, pedidos, total, iva) values
 ('11111111-0000-0000-0000-000000000001','2024-01-01',1,116,16),
 ('11111111-0000-0000-0000-000000000001','2025-11-17',10,1160,160),
 ('11111111-0000-0000-0000-000000000001','2026-11-16',2,348,48),
 ('11111111-0000-0000-0000-000000000001','2026-11-17',1,232,32),
 ('11111111-0000-0000-0000-000000000002','2026-10-01',1,116,16);
-- El 17 de noviembre Zapopan-1 trae Rappi capturado en Dodo IS (agregador): ese día el portal ya no suma.
insert into public.ventas_dia_desglose(ventas_dia_id, tipo, pedidos, total, iva)
  select id, 'agregador', 1, 232, 32 from public.ventas_dia where sucursal_id = '11111111-0000-0000-0000-000000000001' and fecha = '2026-11-17';
insert into public.productos_venta values (1,'Pizza Pepperoni','pizza'),(2,'Refresco','bebida');
insert into public.pedidos values
 ('P1','11111111-0000-0000-0000-000000000001','2026-11-16','13:10','tarjeta','en_tienda','mostrador',false,'entregado',116,16,2,null),
 ('P2','11111111-0000-0000-0000-000000000001','2026-11-17','20:05','efectivo','entrega','app',false,'entregado',232,32,1,'Rappi'),
 ('P3','11111111-0000-0000-0000-000000000001','2026-11-17','12:00','efectivo','personal','mostrador',false,'entregado',116,16,1,null),
 ('P4','11111111-0000-0000-0000-000000000001','2026-11-17','12:00','efectivo','en_tienda','mostrador',false,'cancelado',116,16,1,null);
insert into public.pedido_productos values ('P1',1,1,'Pizza Pepperoni',92.80,null),('P1',2,2,'Refresco',23.20,null),('P2',1,1,'Pizza Pepperoni',232,null),('P3',1,1,'Pizza Pepperoni',116,null),('P4',1,1,'Pizza Pepperoni',116,null);
insert into public.rappi_ordenes values ('1000001','11111111-0000-0000-0000-000000000002','2026-11-16','19:30','Finalizado',116,true,'portal-rappi-2026-11-16_2026-11-16.json'),
 ('1000002','11111111-0000-0000-0000-000000000002','2026-11-16','19:40','Cancelado',116,true,'portal-rappi-2026-11-16_2026-11-16.json'),
 -- La misma venta que P2: el portal la registra, pero Dodo IS ya la trae como agregador ese día.
 ('1000003','11111111-0000-0000-0000-000000000001','2026-11-17','20:06','Finalizado',232,true,'portal-rappi-2026-11-17_2026-11-17.json'),
 -- Orden armada desde Dodo IS (esDeDodo, archivo «dodo-is»): nunca suma.
 ('dodo:P9','11111111-0000-0000-0000-000000000002','2026-11-18','13:00','Finalizado',116,true,'dodo-is');
insert into public.rappi_lineas values ('1000001',1,'Combo Familiar',1,116),('1000002',1,'Combo Familiar',1,116),('1000003',1,'Pizza Pepperoni',1,232),('dodo:P9',1,'Combo Familiar',1,116);
