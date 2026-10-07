-- Catálogo de precios de menú; no modifica ventas, costos vigentes ni BOM. Requiere 0039.
begin;
create table public.menu_rappi_versiones (
 id uuid primary key default gen_random_uuid(),vigente_desde date not null,
 archivo text not null check(length(trim(archivo)) between 1 and 200),
 huella text not null check(huella ~ '^[a-f0-9]{64}$'),
 origen jsonb not null check(jsonb_typeof(origen)='array'),
 registrado_por uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),
 unique(vigente_desde),unique(huella,vigente_desde)
);
create table public.menu_rappi_productos (
 id uuid primary key default gen_random_uuid(),version_id uuid not null references public.menu_rappi_versiones(id),
 fila integer not null check(fila>1),nombre text not null check(length(trim(nombre)) between 1 and 200),
 categoria text not null,tamano text not null,descripcion text not null,
 precio numeric(12,2) not null check(precio>0 and precio<1e9),
 costo_referencia numeric(12,4) check(costo_referencia>=0 and costo_referencia<1e9),
 pos_referencia numeric(12,2) check(pos_referencia>0 and pos_referencia<1e9),referencia text not null,
 dodo_id integer references public.productos_venta(dodo_id),revision integer not null default 1,
 unique(version_id,fila),unique(version_id,dodo_id)
);
create table public.menu_rappi_historial (
 id bigint generated always as identity primary key,producto_id uuid not null references public.menu_rappi_productos(id),
 anterior integer,nuevo integer,usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now()
);
alter table public.menu_rappi_versiones enable row level security;
alter table public.menu_rappi_productos enable row level security;
alter table public.menu_rappi_historial enable row level security;
create policy ver_menu_versiones on public.menu_rappi_versiones for select using(public.kb_activo() and public.mi_rol() in ('admin','corporativo'));
create policy ver_menu_productos on public.menu_rappi_productos for select using(public.kb_activo() and public.mi_rol() in ('admin','corporativo'));
create policy ver_menu_historial on public.menu_rappi_historial for select using(public.kb_activo() and public.mi_rol() in ('admin','corporativo'));
revoke all on public.menu_rappi_versiones,public.menu_rappi_productos,public.menu_rappi_historial from public,anon,authenticated;
grant select on public.menu_rappi_versiones,public.menu_rappi_productos,public.menu_rappi_historial to authenticated;

create function public.importar_menu_rappi(p_fecha date,p_archivo text,p_huella text,p_items jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v uuid;prev public.menu_rappi_versiones;item jsonb;n integer;
begin
 if not public.kb_admin() then raise exception 'Solo administración carga el menú.';end if;
 if p_fecha is null or p_fecha<'2020-01-01' or p_fecha>'2100-12-31' or p_archivo is null or length(trim(p_archivo)) not between 1 and 200 or p_huella is null or p_huella !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Carga inválida.';end if;
 n:=jsonb_array_length(p_items);if n<1 or n>1000 then raise exception 'Carga inválida.';end if;
 perform pg_advisory_xact_lock(hashtext('menu-rappi-'||p_fecha::text));
 select * into prev from public.menu_rappi_versiones where vigente_desde=p_fecha;
 if found then
  if prev.huella=p_huella and prev.archivo=trim(p_archivo) and prev.origen=p_items then return prev.id;end if;
  raise exception 'Ya existe otra versión para esa fecha. No se sobrescribió.';
 end if;
 insert into public.menu_rappi_versiones(vigente_desde,archivo,huella,origen,registrado_por) values(p_fecha,trim(p_archivo),p_huella,p_items,auth.uid()) returning id into v;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'precio') is distinct from 'number' or jsonb_typeof(item->'fila') is distinct from 'number' or jsonb_typeof(item->'nombre') is distinct from 'string' or jsonb_typeof(item->'categoria') is distinct from 'string' or jsonb_typeof(item->'tamano') is distinct from 'string' or jsonb_typeof(item->'descripcion') is distinct from 'string' or jsonb_typeof(item->'referencia') is distinct from 'string' then raise exception 'Renglón inválido.';end if;
  if item->>'fila' !~ '^[0-9]+$' or (item->>'precio')::numeric<>round((item->>'precio')::numeric,2) or (item->>'costo_referencia' is not null and jsonb_typeof(item->'costo_referencia')<>'number') or (item->>'pos_referencia' is not null and jsonb_typeof(item->'pos_referencia')<>'number') then raise exception 'Renglón inválido.';end if;
  insert into public.menu_rappi_productos(version_id,fila,nombre,categoria,tamano,descripcion,precio,costo_referencia,pos_referencia,referencia) values(v,(item->>'fila')::integer,trim(item->>'nombre'),item->>'categoria',item->>'tamano',item->>'descripcion',(item->>'precio')::numeric,(item->>'costo_referencia')::numeric,(item->>'pos_referencia')::numeric,item->>'referencia');
 end loop;
 return v;
end $$;
create function public.vincular_menu_rappi(p_id uuid,p_revision integer,p_dodo_id integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.menu_rappi_productos;
begin
 if not public.kb_admin() then raise exception 'Solo administración vincula productos.';end if;
 select * into r from public.menu_rappi_productos where id=p_id for update;
 if not found then raise exception 'Producto de menú inexistente.';end if;
 if p_revision is distinct from r.revision then raise exception 'El vínculo cambió. Recarga antes de guardar.';end if;
 if r.dodo_id is not distinct from p_dodo_id then return;end if;
 if p_dodo_id is not null and not exists(select 1 from public.productos_venta where dodo_id=p_dodo_id) then raise exception 'Producto de Dodo IS inexistente.';end if;
 update public.menu_rappi_productos set dodo_id=p_dodo_id,revision=revision+1 where id=p_id;
 insert into public.menu_rappi_historial(producto_id,anterior,nuevo,usuario_id) values(p_id,r.dodo_id,p_dodo_id,auth.uid());
end $$;
revoke all on function public.importar_menu_rappi(date,text,text,jsonb),public.vincular_menu_rappi(uuid,integer,integer) from public,anon;
grant execute on function public.importar_menu_rappi(date,text,text,jsonb),public.vincular_menu_rappi(uuid,integer,integer) to authenticated;
commit;
