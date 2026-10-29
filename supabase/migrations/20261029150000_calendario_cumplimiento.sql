-- Calendario de cumplimiento: obligaciones (permisos, licencias, protección civil, extintores, trámites fiscales, seguros)
-- por sucursal o razón social, con evidencia (foto + PDF) y factura si llevan pago. Las fechas futuras se calculan de la
-- regla (fechas_cumplimiento); solo se guarda una fecha cuando alguien actúa sobre ella. cumplimiento_en_rango une
-- obligaciones, compromisos con servicio y mantenimientos; avisos_cumplimiento es lo que n8n entrega cada mañana.
begin;
create table public.cumplimiento_obligaciones (
 id uuid primary key default gen_random_uuid(),
 tipo text not null check(tipo in ('permiso','licencia','proteccion_civil','extintores','tramite_fiscal','seguro','otro')),
 nombre text not null check(length(trim(nombre)) between 3 and 150),
 descripcion text check(length(descripcion)<=300),
 autoridad text check(length(autoridad)<=150),
 folio text check(length(folio)<=100),
 notas text check(length(notas)<=1000),
 sucursal_id uuid references public.sucursales(id),
 razon_social_rfc text references public.razones_sociales(rfc),
 frecuencia text not null check(frecuencia in ('semanal','quincenal','mensual','bimestral','anual')),
 inicio date not null, fin date,
 con_pago boolean not null default false,
 proveedor_id uuid references public.proveedores(id),
 monto_estimado numeric(16,2) check(monto_estimado>0 and monto_estimado<1e12),
 revision integer not null default 1,
 creado_por uuid not null default auth.uid() references public.perfiles(id),
 creado_en timestamptz not null default now(),
 check((sucursal_id is null)<>(razon_social_rfc is null)),
 check(fin is null or fin>=inicio),
 check(not con_pago or proveedor_id is not null),
 check(con_pago or (proveedor_id is null and monto_estimado is null)),
 check(tipo<>'otro' or length(trim(coalesce(descripcion,'')))>=3)
);
create index cumplimiento_obligaciones_sucursal on public.cumplimiento_obligaciones(sucursal_id);
create table public.cumplimiento_fechas (
 id uuid primary key default gen_random_uuid(),
 obligacion_id uuid not null references public.cumplimiento_obligaciones(id),
 vence date not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','cumplida','omitida')),
 cumplida_fecha date,
 nota text check(nota is null or length(trim(nota)) between 5 and 2000),
 omitida_motivo text check(omitida_motivo is null or length(trim(omitida_motivo)) between 5 and 1000),
 factura_id uuid unique references public.facturas(id),
 revision integer not null default 0,
 unique(obligacion_id,vence),
 check(estado<>'cumplida' or (cumplida_fecha is not null and nota is not null)),
 check((estado='omitida')=(omitida_motivo is not null)),
 check(estado<>'omitida' or factura_id is null)
);
create table public.cumplimiento_historial (
 id bigint generated always as identity primary key,
 obligacion_id uuid not null references public.cumplimiento_obligaciones(id),
 evento text not null, anterior jsonb not null, nuevo jsonb not null,
 usuario_id uuid not null references public.perfiles(id), fecha timestamptz not null default now()
);
create index cumplimiento_historial_obligacion on public.cumplimiento_historial(obligacion_id,fecha);
-- Un renglón por aviso entregado y canal: n8n puede reintentar sin duplicar.
create table public.cumplimiento_avisos_enviados (
 id bigint generated always as identity primary key,
 clave text not null, canal text not null check(canal in ('correo','chat')),
 origen text not null check(origen in ('obligacion','compromiso','mantenimiento')),
 referencia_id uuid not null, vence date not null,
 tipo_aviso text not null check(tipo_aviso in ('vencida','por_vencer','sin_factura')),
 enviado_el date not null, usuario_id uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 unique(clave,canal)
);
alter table public.cumplimiento_obligaciones enable row level security;
alter table public.cumplimiento_fechas enable row level security;
alter table public.cumplimiento_historial enable row level security;
alter table public.cumplimiento_avisos_enviados enable row level security;
create policy ver_cumplimiento_obligaciones on public.cumplimiento_obligaciones for select using(public.ve_compras());
create policy ver_cumplimiento_fechas on public.cumplimiento_fechas for select using(public.ve_compras());
create policy ver_cumplimiento_historial on public.cumplimiento_historial for select using(public.ve_compras());
create policy ver_cumplimiento_avisos on public.cumplimiento_avisos_enviados for select using(public.ve_compras());
revoke all on public.cumplimiento_obligaciones,public.cumplimiento_fechas,public.cumplimiento_historial,public.cumplimiento_avisos_enviados from public,anon,authenticated;
grant select on public.cumplimiento_obligaciones,public.cumplimiento_fechas,public.cumplimiento_historial,public.cumplimiento_avisos_enviados to authenticated;

-- Única fuente de la regla. Semanal: cada 7 días desde el inicio. Quincenal: día 15 y último día de cada mes.
-- Mensual, bimestral y anual: el día del inicio cada 1, 2 o 12 meses (si el mes es más corto, su último día).
create function public.fechas_cumplimiento(p_obligacion uuid,p_desde date,p_hasta date) returns setof date
language sql stable set search_path='' as $$
 with o as (select * from public.cumplimiento_obligaciones where id=p_obligacion),
 meses as (
  select o.frecuencia,o.inicio,k,(date_trunc('month',o.inicio::timestamp)+make_interval(months=>k))::date m from o
  cross join lateral generate_series(0,greatest(0,((extract(year from p_hasta)-extract(year from o.inicio))*12+extract(month from p_hasta)-extract(month from o.inicio))::int)) k
  where o.frecuencia<>'semanal'),
 fechas as (
  select o.inicio+7*k d from o cross join lateral generate_series(0,greatest(0,(p_hasta-o.inicio)/7)) k where o.frecuencia='semanal'
  union all select m+14 from meses where frecuencia='quincenal'
  union all select (m+interval '1 month - 1 day')::date from meses where frecuencia='quincenal'
  union all select m+(least(extract(day from inicio)::int,extract(day from m+interval '1 month - 1 day')::int)-1) from meses
   where frecuencia in ('mensual','bimestral','anual') and k%(case frecuencia when 'mensual' then 1 when 'bimestral' then 2 else 12 end)=0)
 select f.d from fechas f cross join o where f.d>=o.inicio and (o.fin is null or f.d<=o.fin) and f.d between p_desde and p_hasta order by f.d
$$;

-- Días antes del vencimiento en que se avisa (0 = el mismo día).
create function public.dias_aviso_cumplimiento(p_frecuencia text) returns integer[]
language sql immutable set search_path='' as $$
 select case when p_frecuencia in ('semanal','quincenal') then array[2,0] when p_frecuencia='anual' then array[60,30,7,0] else array[7,2,0] end
$$;

create function public.guardar_obligacion(p_id uuid,p_revision integer,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.cumplimiento_obligaciones;n public.cumplimiento_obligaciones;v_fin date;v_pago boolean;
begin
 perform public.exigir_admin_compras();
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('tipo','nombre','descripcion','autoridad','folio','notas','sucursal_id','razon_social_rfc','frecuencia','inicio','fin','con_pago','proveedor_id','monto_estimado')) then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>1000) then raise exception 'Texto demasiado largo.';end if;
 v_fin:=nullif(p_datos->>'fin','')::date;
 v_pago:=coalesce((p_datos->>'con_pago')::boolean,false);
 if p_id is null then
  insert into public.cumplimiento_obligaciones(tipo,nombre,descripcion,autoridad,folio,notas,sucursal_id,razon_social_rfc,frecuencia,inicio,fin,con_pago,proveedor_id,monto_estimado)
  values(p_datos->>'tipo',trim(p_datos->>'nombre'),nullif(trim(p_datos->>'descripcion'),''),nullif(trim(p_datos->>'autoridad'),''),nullif(trim(p_datos->>'folio'),''),nullif(trim(p_datos->>'notas'),''),
   nullif(p_datos->>'sucursal_id','')::uuid,nullif(p_datos->>'razon_social_rfc',''),p_datos->>'frecuencia',(p_datos->>'inicio')::date,v_fin,v_pago,
   case when v_pago then nullif(p_datos->>'proveedor_id','')::uuid end,case when v_pago then nullif(p_datos->>'monto_estimado','')::numeric end) returning * into n;
 else
  select * into a from public.cumplimiento_obligaciones where id=p_id for update;
  if not found then raise exception 'Obligación inexistente.';end if;
  if a.revision is distinct from p_revision then raise exception 'La obligación cambió. Recarga antes de guardar.';end if;
  if p_datos->>'tipo' is distinct from a.tipo or nullif(p_datos->>'sucursal_id','')::uuid is distinct from a.sucursal_id
   or nullif(p_datos->>'razon_social_rfc','') is distinct from a.razon_social_rfc or p_datos->>'frecuencia' is distinct from a.frecuencia
   or (p_datos->>'inicio')::date is distinct from a.inicio then
   raise exception 'Tipo, sucursal o razón social, frecuencia e inicio no cambian. Ponle fin a esta obligación y crea otra.';
  end if;
  if v_fin is not null and exists(select 1 from public.cumplimiento_fechas where obligacion_id=p_id and vence>v_fin and (estado<>'pendiente' or factura_id is not null)) then
   raise exception 'Hay fechas cumplidas, omitidas o con factura después del fin.';end if;
  if not v_pago and exists(select 1 from public.cumplimiento_fechas where obligacion_id=p_id and factura_id is not null) then
   raise exception 'Hay facturas ligadas. Quítalas antes de marcarla sin pago.';end if;
  update public.cumplimiento_obligaciones set nombre=trim(p_datos->>'nombre'),descripcion=nullif(trim(p_datos->>'descripcion'),''),autoridad=nullif(trim(p_datos->>'autoridad'),''),
   folio=nullif(trim(p_datos->>'folio'),''),notas=nullif(trim(p_datos->>'notas'),''),fin=v_fin,con_pago=v_pago,
   proveedor_id=case when v_pago then nullif(p_datos->>'proveedor_id','')::uuid end,monto_estimado=case when v_pago then nullif(p_datos->>'monto_estimado','')::numeric end,
   revision=revision+1 where id=p_id returning * into n;
 end if;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(n.id,case when p_id is null then 'Alta' else 'Actualización' end,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
 return n.id;
end $$;

revoke all on function public.fechas_cumplimiento(uuid,date,date),public.dias_aviso_cumplimiento(text),public.guardar_obligacion(uuid,integer,jsonb) from public,anon;
grant execute on function public.fechas_cumplimiento(uuid,date,date),public.dias_aviso_cumplimiento(text),public.guardar_obligacion(uuid,integer,jsonb) to authenticated;
commit;
