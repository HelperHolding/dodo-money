begin;
create table public.operacion_importaciones(id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references public.sucursales(id),archivo text not null,sha256 text not null check(length(sha256)=64),actualizado_hasta date not null,creado_por uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),unique(sucursal_id,sha256));
create table public.operacion_dias(id uuid primary key default gen_random_uuid(),importacion_id uuid not null references public.operacion_importaciones(id),sucursal_id uuid not null references public.sucursales(id),fecha date not null,datos jsonb not null,original jsonb not null,sustituido_por uuid references public.operacion_importaciones(id),creado_en timestamptz not null default now());
create unique index operacion_dia_vigente on public.operacion_dias(sucursal_id,fecha) where sustituido_por is null;
alter table public.operacion_importaciones enable row level security;alter table public.operacion_dias enable row level security;
create policy operacion_importaciones_lectura on public.operacion_importaciones for select using(public.ve_ventas(sucursal_id));
create policy operacion_dias_lectura on public.operacion_dias for select using(public.ve_ventas(sucursal_id));
revoke all on public.operacion_importaciones,public.operacion_dias from public,anon,authenticated;
grant select on public.operacion_importaciones,public.operacion_dias to authenticated;
create function public.importar_operacion_analytics(p_sucursal uuid,p_archivo text,p_sha256 text,p_actualizado date,p_dias jsonb,p_reemplazar boolean default false) returns uuid
language plpgsql security definer set search_path='' as $$
declare n uuid;e jsonb;k text;v jsonb;f date;
begin
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena and rol::text='admin') then raise exception 'Solo administración importa operación.';end if;
 if not exists(select 1 from public.sucursales where id=p_sucursal) or length(trim(coalesce(p_archivo,''))) not between 1 and 300 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_actualizado is null or p_actualizado>(now() at time zone 'America/Mexico_City')::date then raise exception 'Revisa sucursal, archivo y cobertura.';end if;
 if jsonb_typeof(p_dias) is distinct from 'array' or jsonb_array_length(p_dias) not between 1 and 366 then raise exception 'Revisa días.';end if;
 for e in select value from jsonb_array_elements(p_dias) loop
  f:=(e->>'fecha')::date;
  if f is null or f<date '2020-01-01' or f>p_actualizado or jsonb_typeof(e->'datos') is distinct from 'object' then raise exception 'Fecha o métricas inválidas.';end if;
  if (select count(*) from jsonb_object_keys(e->'datos'))<>12 then raise exception 'Métricas incompletas.';end if;
  for k,v in select key,value from jsonb_each(e->'datos') loop
   if k not in ('pedidos','preparacion_ms','pedidos_preparados','demorados','cola_ms','horas','productos','productividad','paradas_producto','paradas_insumo','parada_tienda_ms','cola_larga') then raise exception 'Métrica desconocida.';end if;
   if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or v::text::numeric<0 or v::text::numeric>1e12) then raise exception 'Métrica inválida.';end if;
   if k='cola_larga' and v<>'null'::jsonb and v::text::numeric>1 then raise exception 'Porcentaje inválido.';end if;
   if k in ('pedidos','pedidos_preparados','demorados','productos','paradas_producto','paradas_insumo') and v<>'null'::jsonb and trunc(v::text::numeric)<>v::text::numeric then raise exception 'Cantidad inválida.';end if;
  end loop;
  if coalesce(e->'datos'->'pedidos','null')='null'::jsonb or coalesce(e->'datos'->'pedidos_preparados','null')='null'::jsonb or coalesce(e->'datos'->'demorados','null')='null'::jsonb or (e->'datos'->>'demorados')::numeric>(e->'datos'->>'pedidos')::numeric then raise exception 'Pedidos incompletos.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_dias) as d(valor) group by valor->>'fecha' having count(*)>1) then raise exception 'Días duplicados.';end if;
 perform pg_advisory_xact_lock(hashtext('operacion:'||p_sucursal::text));
 select id into n from public.operacion_importaciones where sucursal_id=p_sucursal and sha256=p_sha256;
 if n is not null then
  if exists(select 1 from public.operacion_dias where importacion_id=n and not exists(select 1 from jsonb_array_elements(p_dias) as item(valor) where item.valor=original)) or (select count(*) from public.operacion_dias where importacion_id=n)<>jsonb_array_length(p_dias) then raise exception 'La huella ya existe con otro contenido.';end if;
  return n;
 end if;
 if not coalesce(p_reemplazar,false) and exists(select 1 from public.operacion_dias d where d.sucursal_id=p_sucursal and d.sustituido_por is null and exists(select 1 from jsonb_array_elements(p_dias) as item(valor) where (item.valor->>'fecha')::date=d.fecha)) then raise exception 'Hay días existentes. Confirma reemplazo para conservarlos en historial.';end if;
 insert into public.operacion_importaciones(sucursal_id,archivo,sha256,actualizado_hasta,creado_por) values(p_sucursal,trim(p_archivo),p_sha256,p_actualizado,auth.uid()) returning id into n;
 update public.operacion_dias d set sustituido_por=n where d.sucursal_id=p_sucursal and d.sustituido_por is null and exists(select 1 from jsonb_array_elements(p_dias) as item(valor) where (item.valor->>'fecha')::date=d.fecha);
 insert into public.operacion_dias(importacion_id,sucursal_id,fecha,datos,original) select n,p_sucursal,(item.valor->>'fecha')::date,item.valor->'datos',item.valor from jsonb_array_elements(p_dias) as item(valor);
 return n;
end $$;
revoke all on function public.importar_operacion_analytics(uuid,text,text,date,jsonb,boolean) from public,anon;
grant execute on function public.importar_operacion_analytics(uuid,text,text,date,jsonb,boolean) to authenticated;
commit;

