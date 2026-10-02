-- Qué proveedores surten cada artículo (muchos a muchos), con un proveedor principal por artículo.
-- Es aparte de precios_proveedor: los precios se siguen llenando solos al confirmar órdenes; esto se edita a mano
-- (o se carga por Excel) y también se llena solo cuando se confirma una orden con un proveedor nuevo para el artículo.
-- Al migrar, cada artículo queda ligado a los proveedores con los que ya tiene precio (principal: la compra más reciente).
-- Requiere 0001–0019.

create table articulo_proveedores (
  articulo_id  uuid not null references articulos(id),
  proveedor_id uuid not null references proveedores(id),
  principal    boolean not null default false,
  creado_por   uuid references perfiles(id) default auth.uid(),
  creado_en    timestamptz not null default now(),
  primary key (articulo_id, proveedor_id)
);
create unique index articulo_un_principal on articulo_proveedores (articulo_id) where principal;
create index on articulo_proveedores (proveedor_id);

alter table articulo_proveedores enable row level security;
create policy ver_articulo_proveedores on articulo_proveedores for select using (ve_compras());
create policy alta_articulo_proveedor on articulo_proveedores for insert with check (edita_compras());
-- Cambiar o quitar proveedores de un artículo va por guardar_proveedores_articulo().

insert into articulo_proveedores (articulo_id, proveedor_id, principal, creado_por)
select pp.articulo_id, pp.proveedor_id,
       row_number() over (partition by pp.articulo_id order by pp.fecha desc, pp.proveedor_id) = 1,
       null
  from precios_proveedor pp;

-- Al confirmar una orden se escribe el precio; si el proveedor aún no estaba ligado al artículo, se liga
-- (como principal si el artículo no tenía ninguno).
create or replace function ligar_proveedor_por_precio() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into articulo_proveedores (articulo_id, proveedor_id, principal)
  values (new.articulo_id, new.proveedor_id,
          not exists (select 1 from articulo_proveedores where articulo_id = new.articulo_id and principal))
  on conflict (articulo_id, proveedor_id) do nothing;
  return new;
end $$;

create trigger precios_ligar_proveedor
  after insert or update on precios_proveedor
  for each row execute function ligar_proveedor_por_precio();

-- Reemplaza los proveedores de un artículo de una vez; el principal tiene que estar entre ellos.
create or replace function guardar_proveedores_articulo(p_articulo uuid, p_proveedores uuid[], p_principal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_lista uuid[] := array(select distinct unnest(coalesce(p_proveedores, '{}')));
begin
  perform exigir_admin_compras();
  perform 1 from articulos where id = p_articulo for update;
  if not found then raise exception 'Artículo no encontrado'; end if;
  if exists (select 1 from unnest(v_lista) x(id) where not exists (select 1 from proveedores p where p.id = x.id)) then
    raise exception 'Uno de los proveedores no existe';
  end if;
  if cardinality(v_lista) > 0 and (p_principal is null or not p_principal = any(v_lista)) then
    raise exception 'El proveedor principal tiene que estar entre los que lo surten';
  end if;

  delete from articulo_proveedores where articulo_id = p_articulo and not proveedor_id = any(v_lista);
  update articulo_proveedores set principal = false where articulo_id = p_articulo and principal and proveedor_id <> p_principal;
  insert into articulo_proveedores (articulo_id, proveedor_id, principal)
  select p_articulo, x.id, x.id = p_principal from unnest(v_lista) x(id)
  on conflict (articulo_id, proveedor_id) do update set principal = excluded.principal;
end $$;
revoke execute on function guardar_proveedores_articulo(uuid, uuid[], uuid) from public, anon;
grant execute on function guardar_proveedores_articulo(uuid, uuid[], uuid) to authenticated;
