-- Lista oficial de precios Rappi por producto, con vigencia. Costeo la usa en lugar del último precio observado en
-- órdenes; sin lista vigente sigue mostrando el observado. Los costos siguen saliendo del BOM.
-- cargar_precios_rappi liga cada renglón del menú a los productos del catálogo por nombre exacto normalizado
-- (sin acentos, mayúsculas ni espacios dobles); no inventa productos. Devuelve los renglones que no encontraron producto.
begin;
create table public.precios_rappi (
 id uuid primary key default gen_random_uuid(),
 dodo_id integer not null references public.productos_venta(dodo_id),
 precio numeric(10,2) not null check(precio>0 and precio<100000),
 vigente_desde date not null,
 fuente text not null check(length(trim(fuente)) between 1 and 255),
 registrado_por uuid references public.perfiles(id) default auth.uid(),
 creado_en timestamptz not null default now(),
 unique(dodo_id,vigente_desde)
);
alter table public.precios_rappi enable row level security;
create policy ver_precios_rappi on public.precios_rappi for select using(public.ve_catalogo_ventas());
revoke all on public.precios_rappi from public,anon,authenticated;
grant select on public.precios_rappi to authenticated;

create function public.normalizar_nombre_producto(p text) returns text
language sql immutable set search_path='' as $$
  select translate(regexp_replace(lower(trim(p)),'\s+',' ','g'),'áéíóúüñ','aeiouun')
$$;

-- p_renglones: [{"renglon":"Pepperoni 30 cm","nombres":["Pepperoni Mediano","Pepperoni Mediano T"],"precio":159}]
create function public.cargar_precios_rappi(p_vigente date,p_fuente text,p_renglones jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cargados integer; sin_producto jsonb;
begin
  if not public.edita_finanzas() then raise exception 'Solo el admin carga precios Rappi.';end if;
  if p_vigente is null or p_fuente is null or length(trim(p_fuente)) not between 1 and 255 then raise exception 'Fecha o fuente inválida.';end if;
  if p_renglones is null or jsonb_typeof(p_renglones)<>'array' or jsonb_array_length(p_renglones) not between 1 and 1000 then raise exception 'Se requieren renglones.';end if;
  if exists(select 1 from jsonb_array_elements(p_renglones) r
    where jsonb_typeof(r->'renglon')<>'string' or length(trim(r->>'renglon')) not between 1 and 200
    or jsonb_typeof(r->'nombres')<>'array' or jsonb_array_length(r->'nombres') not between 1 and 20
    or exists(select 1 from jsonb_array_elements(r->'nombres') n where jsonb_typeof(n)<>'string' or length(trim(n#>>'{}')) not between 1 and 200)
    or jsonb_typeof(r->'precio')<>'number' or not((r->>'precio')::numeric>0 and (r->>'precio')::numeric<100000) or (r->>'precio')::numeric<>round((r->>'precio')::numeric,2)) then
    raise exception 'Renglón inválido.';end if;
  drop table if exists tmp_precios_rappi;
  create temp table tmp_precios_rappi on commit drop as
    select distinct r->>'renglon' renglon,p.dodo_id,(r->>'precio')::numeric precio
    from jsonb_array_elements(p_renglones) r
    cross join jsonb_array_elements_text(r->'nombres') n
    join public.productos_venta p on public.normalizar_nombre_producto(p.nombre)=public.normalizar_nombre_producto(n);
  if exists(select 1 from tmp_precios_rappi group by dodo_id having count(distinct precio)>1) then
    raise exception 'Un producto quedó con dos precios distintos: %.',(select string_agg(distinct p.nombre,', ') from tmp_precios_rappi t join public.productos_venta p using(dodo_id)
      where t.dodo_id in (select dodo_id from tmp_precios_rappi group by dodo_id having count(distinct precio)>1));end if;
  insert into public.precios_rappi(dodo_id,precio,vigente_desde,fuente)
    select distinct dodo_id,precio,p_vigente,trim(p_fuente) from tmp_precios_rappi
  on conflict(dodo_id,vigente_desde) do update set precio=excluded.precio,fuente=excluded.fuente,registrado_por=auth.uid(),creado_en=now();
  get diagnostics cargados=row_count;
  select coalesce(jsonb_agg(r->>'renglon' order by o),'[]'::jsonb) into sin_producto from jsonb_array_elements(p_renglones) with ordinality x(r,o)
    where not exists(select 1 from tmp_precios_rappi t where t.renglon=r->>'renglon');
  return jsonb_build_object('cargados',cargados,'sin_producto',sin_producto);
end $$;
revoke all on function public.cargar_precios_rappi(date,text,jsonb) from public,anon;
grant execute on function public.cargar_precios_rappi(date,text,jsonb) to authenticated;
commit;
