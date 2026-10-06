-- Catálogo de insumos y BOM de UC Mexico, con versiones por fecha. Requiere 0001–0032.
begin;
create table bom_versiones (
  id uuid primary key default gen_random_uuid(),
  vigente_desde date not null,
  archivo text not null check (length(trim(archivo)) between 1 and 200),
  huella text not null check (huella ~ '^[a-f0-9]{64}$'),
  modelo jsonb not null,
  periferico boolean not null,
  registrado_por uuid not null references perfiles(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique(vigente_desde, huella, periferico)
);
create table bom_recetas (
  version_id uuid not null references bom_versiones(id),
  clave text not null,
  nombre text not null,
  receta jsonb not null,
  costo numeric(10,2),
  dodo_id integer references productos_venta(dodo_id),
  primary key(version_id, clave),
  unique(version_id, dodo_id)
);
create table bom_equivalencias (
  clave text primary key,
  dodo_id integer not null references productos_venta(dodo_id)
);
alter table bom_versiones enable row level security;
alter table bom_recetas enable row level security;
alter table bom_equivalencias enable row level security;
create policy ver_bom_versiones on bom_versiones for select using (ve_catalogo_ventas());
create policy ver_bom_recetas on bom_recetas for select using (ve_catalogo_ventas());
create policy ver_bom_equivalencias on bom_equivalencias for select using (ve_catalogo_ventas());
revoke all on bom_versiones, bom_recetas, bom_equivalencias from anon, authenticated;
grant select on bom_versiones, bom_recetas, bom_equivalencias to authenticated;

create function importar_bom(p_fecha date, p_archivo text, p_huella text, p_modelo jsonb, p_asignaciones jsonb, p_periferico boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v uuid; r jsonb; m jsonb; a jsonb; i jsonb; c numeric; extra numeric; suma numeric;
  producto integer; claves text[] := '{}'; productos integer[] := '{}'; costos jsonb := '[]'; n integer := 0;
begin
  if coalesce(mi_rol()::text,'') <> 'admin' then raise exception 'Solo un administrador importa el BOM.'; end if;
  if p_fecha is null or p_fecha < '2020-01-01' or p_fecha > (now() at time zone 'America/Mexico_City')::date + 366
     or p_periferico is null or p_huella is null or p_huella !~ '^[a-f0-9]{64}$' or coalesce(length(trim(p_archivo)),0) not between 1 and 200 then raise exception 'Fecha o archivo inválido.'; end if;
  if jsonb_typeof(p_modelo->'recetas') is distinct from 'array' or jsonb_typeof(p_modelo->'insumos') is distinct from 'array'
     or jsonb_typeof(p_asignaciones) is distinct from 'array' then raise exception 'Modelo inválido.'; end if;
  if jsonb_array_length(p_modelo->'recetas') not between 1 and 500 or jsonb_array_length(p_modelo->'insumos') not between 1 and 1000
     or jsonb_array_length(p_asignaciones) > 500 or octet_length(p_modelo::text) > 2000000 then raise exception 'Modelo demasiado grande.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('importar_bom',0));
  for i in select * from jsonb_array_elements(p_modelo->'insumos') loop
    if coalesce(length(trim(i->>'nombre')),0) not between 1 and 200 or
       (i->>'precio' is not null and ((i->>'precio')::numeric < 0 or (i->>'precio')::numeric > 1000000)) then raise exception 'Insumo inválido.'; end if;
  end loop;
  insert into bom_versiones(vigente_desde,archivo,huella,modelo,periferico,registrado_por)
  values(p_fecha,p_archivo,p_huella,p_modelo,p_periferico,auth.uid())
  on conflict(vigente_desde,huella,periferico) do update set archivo=excluded.archivo, actualizado_en=now()
  returning id into v;
  -- La reimportación de la misma versión reemplaza solo sus vínculos; no duplica costos.
  delete from bom_recetas where version_id=v;
  for r in select * from jsonb_array_elements(p_modelo->'recetas') loop
    if coalesce(length(r->>'clave'),0) not between 1 and 200 or (r->>'clave')=any(claves)
       or coalesce(length(trim(r->>'nombre')),0) not between 1 and 200
       or jsonb_typeof(r->'materiales') is distinct from 'array' or jsonb_typeof(r->'avisos') is distinct from 'array'
       or r->>'categoria' is null or r->>'categoria' not in ('pizza','snack','postre') then raise exception 'Receta inválida o repetida.'; end if;
    claves := array_append(claves,r->>'clave');
    c := null; suma := 0;
    if r->>'costo' is not null then
      if jsonb_array_length(r->'avisos') <> 0 or jsonb_array_length(r->'materiales') not between 1 and 100 then raise exception 'Una receta pendiente no puede actualizar costos.'; end if;
      for m in select * from jsonb_array_elements(r->'materiales') loop
        if m->>'cantidad' is null or m->>'precio' is null or m->>'importe' is null or m->>'unidad' is null
           or m->>'unidad' not in ('g','pieza') or (m->>'cantidad')::numeric < 0 or (m->>'precio')::numeric < 0
           or (m->>'cantidad')::numeric > 1000000 or (m->>'precio')::numeric > 1000000 or (m->>'importe')::numeric < 0
           or ((m->>'precio')::numeric=0 and (m->>'cantidad')::numeric>0)
           or abs((m->>'cantidad')::numeric * (m->>'precio')::numeric / case when m->>'unidad'='g' then 1000 else 1 end - (m->>'importe')::numeric) > .011
           then raise exception 'Cantidad, unidad o precio de material inválido.'; end if;
        suma := suma + (m->>'importe')::numeric;
      end loop;
      if round(suma,2) <> (r->>'costo')::numeric or suma <= 0 or suma > 1000000 then raise exception 'El BOM no cuadra.'; end if;
      c := round(suma,2);
    end if;
    producto := null;
    select x into a from jsonb_array_elements(p_asignaciones) x where x->>'clave'=r->>'clave';
    if found then
      producto := (a->>'dodo_id')::integer;
      if c is null or producto is null or producto=any(productos) or not exists(select 1 from productos_venta where dodo_id=producto)
         then raise exception 'Vínculo de producto inválido o repetido.'; end if;
      productos := array_append(productos,producto);
      extra := 0;
      if p_periferico then
        if r->>'precioVenta' is null or (r->>'precioVenta')::numeric <= 0 then raise exception 'Falta precio para calcular el periférico.'; end if;
        extra := (r->>'precioVenta')::numeric*.01;
      end if;
      costos := costos || jsonb_build_array(jsonb_build_object('dodo_id',producto,'costo',round(c+extra,2),
        'categoria',r->>'categoria','tamano',r->>'tamano','nota',null));
      insert into bom_equivalencias(clave,dodo_id) values(r->>'clave',producto)
      on conflict(clave) do update set dodo_id=excluded.dodo_id;
    end if;
    insert into bom_recetas values(v,r->>'clave',r->>'nombre',r,c,producto);
  end loop;
  if jsonb_array_length(p_asignaciones) <> cardinality(productos) then raise exception 'Asignaciones desconocidas o repetidas.'; end if;
  if jsonb_array_length(costos)>0 then n := cargar_costos(p_fecha, p_archivo || ' · BOM' || case when p_periferico then ' + 1 % periférico' else '' end, costos); end if;
  return n;
end $$;
revoke all on function importar_bom(date,text,text,jsonb,jsonb,boolean) from public,anon;
grant execute on function importar_bom(date,text,text,jsonb,jsonb,boolean) to authenticated;
commit;
