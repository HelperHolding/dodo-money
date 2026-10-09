-- Nómina real mensual; reemplaza la plantilla estimada únicamente en ese mes y lugar.
begin;
set local lock_timeout='5s';
create table public.nomina_reales (
 id uuid primary key default gen_random_uuid(), sucursal_id uuid references public.sucursales(id),
 mes date not null check(extract(day from mes)=1), fuente text not null,
 empleados jsonb not null, creado_por uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 anulada_por uuid references public.perfiles(id), anulada_en timestamptz, motivo_anulacion text
);
create unique index nomina_real_activa on public.nomina_reales(coalesce(sucursal_id,'00000000-0000-0000-0000-000000000000'::uuid),mes) where anulada_en is null;
alter table public.nomina_reales enable row level security;
create policy consulta_nomina_real on public.nomina_reales for select using(public.ve_finanzas());
revoke all on public.nomina_reales from public,anon,authenticated;
grant select on public.nomina_reales to authenticated;

create function public.guardar_nomina_real(p_sucursal uuid,p_mes date,p_fuente text,p_empleados jsonb,p_previa uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare actual uuid; nuevo uuid; e jsonb; k text; n numeric;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración gestiona nómina real.';end if;
 if p_mes is null or extract(day from p_mes)<>1 or p_mes<date '2020-01-01' or p_mes>date '2100-12-01' or length(trim(coalesce(p_fuente,''))) not between 5 and 1000 then raise exception 'Revisa mes y fuente de la nómina.';end if;
 if p_empleados is null or jsonb_typeof(p_empleados)<>'array' then raise exception 'Agrega empleados.';end if;
 if jsonb_array_length(p_empleados) not between 1 and 100 then raise exception 'Agrega de 1 a 100 empleados.';end if;
 for e in select value from jsonb_array_elements(p_empleados) loop
  if jsonb_typeof(e)<>'object' or length(trim(coalesce(e->>'nombre',''))) not between 1 and 200 or length(trim(coalesce(e->>'puesto',''))) not between 1 and 200 or coalesce(e->>'renglon','') not in ('cocina','gerencia') or length(coalesce(e->>'nota',''))>1000 then raise exception 'Revisa nombre, puesto y renglón.';end if;
  foreach k in array array['sueldo','imss','cesantia','retiro','impuesto','infonavit','ajuste'] loop
   if jsonb_typeof(e->k) is distinct from 'number' then raise exception 'Revisa los importes de nómina.';end if;
   n:=(e->>k)::numeric;
   if abs(n)>99999999 or n<>round(n,2) or (k<>'ajuste' and n<0) then raise exception 'Revisa los importes de nómina.';end if;
  end loop;
  if (e->>'imss')::numeric+(e->>'cesantia')::numeric+(e->>'retiro')::numeric+(e->>'impuesto')::numeric+(e->>'infonavit')::numeric+(e->>'ajuste')::numeric<0 then raise exception 'Las obligaciones no pueden ser negativas.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_empleados) x group by lower(trim(x->>'nombre')) having count(*)>1) then raise exception 'Hay empleados repetidos.';end if;
 perform pg_advisory_xact_lock(hashtextextended('nomina-real:'||coalesce(p_sucursal::text,'oficina')||':'||p_mes::text,0));
 select id into actual from public.nomina_reales where sucursal_id is not distinct from p_sucursal and mes=p_mes and anulada_en is null for update;
 if actual is distinct from p_previa then raise exception 'La nómina cambió; recarga antes de guardar.';end if;
 update public.nomina_reales set anulada_en=now(),anulada_por=auth.uid(),motivo_anulacion='Sustituida por nueva versión' where id=actual;
 insert into public.nomina_reales(sucursal_id,mes,fuente,empleados,creado_por) values(p_sucursal,p_mes,trim(p_fuente),p_empleados,auth.uid()) returning id into nuevo;
 return nuevo;
end $$;
create function public.anular_nomina_real(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
declare r public.nomina_reales;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración gestiona nómina real.';end if;
 if length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Escribe un motivo específico.';end if;
 select * into r from public.nomina_reales where id=p_id;
 if not found then raise exception 'No existe la nómina.';end if;
 perform pg_advisory_xact_lock(hashtextextended('nomina-real:'||coalesce(r.sucursal_id::text,'oficina')||':'||r.mes::text,0));
 update public.nomina_reales set anulada_en=now(),anulada_por=auth.uid(),motivo_anulacion=trim(p_motivo) where id=p_id and anulada_en is null;
 if not found then raise exception 'La nómina ya está anulada.';end if;
end $$;
revoke all on function public.guardar_nomina_real(uuid,date,text,jsonb,uuid),public.anular_nomina_real(uuid,text) from public,anon;
grant execute on function public.guardar_nomina_real(uuid,date,text,jsonb,uuid),public.anular_nomina_real(uuid,text) to authenticated;
commit;
