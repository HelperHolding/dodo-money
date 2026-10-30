-- Piezas de un producto de Rappi: un renglón que trae pizza + dip, refresco o rolls, o un combo propio de Rappi
-- (Plan Dúo, Solo Dodo, Completo y Dulce…), se liga a varios productos del catálogo con su cantidad para sumar su costo.
-- Las piezas mandan sobre el vínculo simple (rappi_productos.dodo_id), que se limpia al guardarlas.
begin;
set local lock_timeout='5s';
create table public.rappi_producto_piezas(
 rappi_producto_id bigint not null references public.rappi_productos(id) on delete cascade,
 dodo_id integer not null references public.productos_venta(dodo_id),
 cantidad numeric(10,3) not null check(cantidad>0 and cantidad<=100),
 primary key(rappi_producto_id,dodo_id)
);
alter table public.rappi_producto_piezas enable row level security;
revoke all on public.rappi_producto_piezas from public,anon,authenticated;
grant select on public.rappi_producto_piezas to authenticated;
create policy leer_rappi_producto_piezas on public.rappi_producto_piezas for select to authenticated using(public.ve_catalogo_ventas());

create function public.guardar_piezas_rappi(p_id bigint,p_piezas jsonb) returns void
language plpgsql security definer set search_path='' as $piezas$
declare n integer;
begin
 if not public.edita_finanzas() then raise exception 'Solo el admin liga productos de Rappi.';end if;
 if p_id is null or not exists(select 1 from public.rappi_productos r where r.id=p_id) then raise exception 'Producto Rappi no encontrado.';end if;
 if jsonb_typeof(p_piezas) is distinct from 'array' or jsonb_array_length(p_piezas)>20 then raise exception 'Se esperan hasta 20 piezas.';end if;
 if exists(select 1 from jsonb_array_elements(p_piezas) x where jsonb_typeof(x->'dodo_id')<>'number' or jsonb_typeof(x->'cantidad')<>'number'
   or (x->>'cantidad')::numeric<=0 or (x->>'cantidad')::numeric>100 or (x->>'cantidad')::numeric<>round((x->>'cantidad')::numeric,3)
   or not exists(select 1 from public.productos_venta v where v.dodo_id=(x->>'dodo_id')::integer)) then raise exception 'Revisa productos y cantidades de las piezas.';end if;
 select count(distinct (x->>'dodo_id')::integer) into n from jsonb_array_elements(p_piezas) x;
 if n<>jsonb_array_length(p_piezas) then raise exception 'Un producto se repite en las piezas: suma su cantidad.';end if;
 perform 1 from public.rappi_productos r where r.id=p_id for update;
 delete from public.rappi_producto_piezas where rappi_producto_id=p_id;
 insert into public.rappi_producto_piezas(rappi_producto_id,dodo_id,cantidad)
  select p_id,(x->>'dodo_id')::integer,(x->>'cantidad')::numeric from jsonb_array_elements(p_piezas) x;
 if n>0 then update public.rappi_productos set dodo_id=null where id=p_id;end if;
end $piezas$;
revoke all on function public.guardar_piezas_rappi(bigint,jsonb) from public,anon;
grant execute on function public.guardar_piezas_rappi(bigint,jsonb) to authenticated;
commit;
