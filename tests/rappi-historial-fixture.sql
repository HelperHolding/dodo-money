-- Entorno aislado de pruebas para las migraciones de Rappi (0032 y siguientes): no ejecutar en la base de producción.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema if not exists auth;
create function auth.uid() returns uuid language sql stable as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::json->>'sub')::uuid $$;
create table public.sucursales(id uuid primary key, nombre text);
create table public.perfiles(id uuid primary key, activo boolean not null default true, rol text not null, sucursal_id uuid);
create table public.productos_venta(dodo_id integer primary key, nombre text);
create function public.hoy_mx() returns date language sql as $$ select current_date $$;
create function public.mi_rol() returns text language sql stable as $$ select rol from public.perfiles where id = auth.uid() $$;
create function public.edita_finanzas() returns boolean language sql stable as $$ select coalesce(public.mi_rol() = 'admin', false) $$;
create function public.ve_ventas(uuid) returns boolean language sql stable as $$ select public.mi_rol() in ('admin', 'corporativo') $$;
create function public.ve_catalogo_ventas() returns boolean language sql stable as $$ select public.mi_rol() in ('admin', 'corporativo') $$;
insert into public.sucursales values ('00000000-0000-0000-0000-0000000000a1', 'Sucursal prueba');
insert into public.perfiles values ('00000000-0000-0000-0000-0000000000b1', true, 'admin', null),
                                   ('00000000-0000-0000-0000-0000000000b2', true, 'corporativo', null);
