begin;
set local lock_timeout='5s';
create table public.personal (
 id uuid primary key default gen_random_uuid(), sucursal_id uuid references public.sucursales(id), codigo text not null check(length(trim(codigo)) between 1 and 50),
 creado_por uuid not null references public.perfiles(id), creado_en timestamptz not null default now()
);
create unique index codigo_personal_unico on public.personal(coalesce(sucursal_id,'00000000-0000-0000-0000-000000000000'::uuid),(case when codigo ~ '^[0-9]+$' then coalesce(nullif(ltrim(codigo,'0'),''),'0') else lower(trim(codigo)) end));
create table public.personal_versiones (
 id uuid primary key default gen_random_uuid(),personal_id uuid not null references public.personal(id),desde date not null,hasta date check(hasta>=desde),datos jsonb not null,
 creado_por uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),sustituida_en timestamptz,sustituida_por uuid references public.perfiles(id)
);
create unique index personal_vigencia_activa on public.personal_versiones(personal_id,desde) where sustituida_en is null;
create table public.nomina_borradores (
 id uuid primary key default gen_random_uuid(),sucursal_id uuid references public.sucursales(id),mes date not null check(extract(day from mes)=1),fuente text not null,
 empleados jsonb not null,avisos jsonb not null,previa uuid references public.nomina_reales(id),
 creado_por uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),confirmada_id uuid references public.nomina_reales(id)
);
alter table public.personal enable row level security;
alter table public.personal_versiones enable row level security;
alter table public.nomina_borradores enable row level security;
create policy consulta_personal on public.personal for select using(public.ve_finanzas());
create policy consulta_personal_versiones on public.personal_versiones for select using(public.ve_finanzas());
create policy consulta_nomina_borradores on public.nomina_borradores for select using(public.ve_finanzas());
revoke all on public.personal,public.personal_versiones,public.nomina_borradores from public,anon,authenticated;
grant select on public.personal,public.personal_versiones,public.nomina_borradores to authenticated;

create function public.guardar_personal(p_id uuid,p_sucursal uuid,p_codigo text,p_desde date,p_hasta date,p_datos jsonb,p_previa uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare id_personal uuid:=p_id;v uuid;r public.personal;k text;n numeric;ingreso date;baja date;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración gestiona Personal.';end if;
 if p_desde is null or p_desde<date '2020-01-01' or p_desde>date '2100-12-31' or p_hasta<p_desde or length(trim(coalesce(p_codigo,''))) not between 1 and 50 then raise exception 'Revisa código y vigencia.';end if;
 if p_datos is null or jsonb_typeof(p_datos)<>'object' or length(trim(coalesce(p_datos->>'nombre',''))) not between 1 and 200 or length(trim(coalesce(p_datos->>'puesto',''))) not between 1 and 200 or coalesce(p_datos->>'renglon','') not in ('cocina','gerencia') or length(trim(coalesce(p_datos->>'nota',''))) not between 5 and 1000 then raise exception 'Revisa nombre, puesto y renglón.';end if;
 ingreso:=nullif(p_datos->>'ingreso','')::date;baja:=nullif(p_datos->>'baja','')::date;
 if baja<ingreso then raise exception 'La baja no puede ser anterior al ingreso.';end if;
 foreach k in array array['sueldo','bono','imss','cesantia','retiro','impuesto','infonavit','ajuste'] loop
  if not p_datos ? k then raise exception 'Completa los campos o déjalos pendientes.';end if;
  if jsonb_typeof(p_datos->k)='null' then continue;end if;
  if jsonb_typeof(p_datos->k)<>'number' then raise exception 'Revisa los importes de Personal.';end if;
  n:=(p_datos->>k)::numeric;
  if abs(n)>99999999 or n<>round(n,2) or (k<>'ajuste' and n<0) then raise exception 'Revisa los importes de Personal.';end if;
 end loop;
 if id_personal is null then
  if p_previa is not null then raise exception 'Revisa la versión del perfil.';end if;
  insert into public.personal(sucursal_id,codigo,creado_por) values(p_sucursal,trim(p_codigo),auth.uid()) returning id into id_personal;
 else
  select * into r from public.personal where id=id_personal for update;
  if not found then raise exception 'No existe el perfil de Personal.';end if;
  if r.sucursal_id is distinct from p_sucursal then raise exception 'Conserva la sucursal de este perfil.';end if;
  select id into v from public.personal_versiones where personal_id=id_personal and sustituida_en is null order by desde desc limit 1;
  if v is distinct from p_previa then raise exception 'El perfil cambió; recarga antes de guardar.';end if;
  update public.personal set codigo=trim(p_codigo) where id=id_personal;
 end if;
 update public.personal_versiones set sustituida_en=now(),sustituida_por=auth.uid() where personal_id=id_personal and desde=p_desde and sustituida_en is null;
 insert into public.personal_versiones(personal_id,desde,hasta,datos,creado_por) values(id_personal,p_desde,p_hasta,p_datos||jsonb_build_object('codigo',trim(p_codigo)),auth.uid());
 return id_personal;
end $$;

create function public.preparar_borrador_nomina(p_sucursal uuid,p_mes date,p_fuente text,p_empleados jsonb,p_avisos jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare nuevo uuid;prev uuid;e jsonb;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración prepara nómina.';end if;
 if p_mes is null or extract(day from p_mes)<>1 or p_mes<date '2020-01-01' or p_mes>date '2100-12-01' or length(trim(coalesce(p_fuente,''))) not between 5 and 1000 then raise exception 'Revisa mes y fuente.';end if;
 if p_empleados is null or jsonb_typeof(p_empleados)<>'array' or p_avisos is null or jsonb_typeof(p_avisos)<>'array' then raise exception 'Revisa el borrador.';end if;
 if jsonb_array_length(p_empleados) not between 1 and 100 or jsonb_array_length(p_avisos)>300 then raise exception 'Agrega de 1 a 100 empleados.';end if;
 for e in select value from jsonb_array_elements(p_empleados) loop
  if not exists(select 1 from public.personal p join public.personal_versiones v on v.personal_id=p.id where p.id=(e->>'personal_id')::uuid and v.id=(e->>'version_id')::uuid and p.sucursal_id is not distinct from p_sucursal) then raise exception 'El empleado no corresponde a este lugar.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_empleados)e group by e->>'personal_id' having count(*)>1) then raise exception 'Hay empleados repetidos.';end if;
 select id into prev from public.nomina_reales where sucursal_id is not distinct from p_sucursal and mes=p_mes and anulada_en is null;
 insert into public.nomina_borradores(sucursal_id,mes,fuente,empleados,avisos,previa,creado_por) values(p_sucursal,p_mes,trim(p_fuente),p_empleados,p_avisos,prev,auth.uid()) returning id into nuevo;
 return nuevo;
end $$;

-- Se conserva la validación de 0050 y se incorpora bono mensual opcional.
alter function public.guardar_nomina_real(uuid,date,text,jsonb,uuid) rename to _guardar_nomina_real_0050;
revoke all on function public._guardar_nomina_real_0050(uuid,date,text,jsonb,uuid) from public,anon,authenticated;
create function public.guardar_nomina_real(p_sucursal uuid,p_mes date,p_fuente text,p_empleados jsonb,p_previa uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare e jsonb;b numeric;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración gestiona nómina real.';end if;
 for e in select value from jsonb_array_elements(p_empleados) loop
  if e ? 'bono' then
   if jsonb_typeof(e->'bono')<>'number' then raise exception 'Revisa el bono.';end if;
   b:=(e->>'bono')::numeric;if b<0 or b>99999999 or b<>round(b,2) then raise exception 'Revisa el bono.';end if;
  end if;
 end loop;
 return public._guardar_nomina_real_0050(p_sucursal,p_mes,p_fuente,p_empleados,p_previa);
end $$;

create function public.confirmar_borrador_nomina(p_id uuid,p_empleados jsonb,p_fuente text) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.nomina_borradores;n uuid;e jsonb;
begin
 if not public.edita_finanzas() then raise exception 'Solo administración confirma nómina.';end if;
 select * into r from public.nomina_borradores where id=p_id for update;
 if not found then raise exception 'No existe el borrador.';end if;
 if r.confirmada_id is not null then raise exception 'El borrador ya fue confirmado.';end if;
 if p_empleados is null or jsonb_typeof(p_empleados)<>'array' then raise exception 'Revisa los empleados del borrador.';end if;
 if jsonb_array_length(p_empleados)<>jsonb_array_length(r.empleados) then raise exception 'Revisa todos los empleados del borrador.';end if;
 for e in select value from jsonb_array_elements(p_empleados) loop
  if not exists(select 1 from jsonb_array_elements(r.empleados)d where d->>'personal_id'=e->>'personal_id' and d->>'version_id'=e->>'version_id') then raise exception 'Revisa los empleados del borrador.';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(p_empleados)e group by e->>'personal_id' having count(*)>1) then raise exception 'Hay empleados repetidos.';end if;
 n:=public.guardar_nomina_real(r.sucursal_id,r.mes,p_fuente,p_empleados,r.previa);
 update public.nomina_borradores set confirmada_id=n where id=p_id;
 return n;
end $$;
revoke all on function public.guardar_personal(uuid,uuid,text,date,date,jsonb,uuid),public.preparar_borrador_nomina(uuid,date,text,jsonb,jsonb),public.guardar_nomina_real(uuid,date,text,jsonb,uuid),public.confirmar_borrador_nomina(uuid,jsonb,text) from public,anon;
grant execute on function public.guardar_personal(uuid,uuid,text,date,date,jsonb,uuid),public.preparar_borrador_nomina(uuid,date,text,jsonb,jsonb),public.guardar_nomina_real(uuid,date,text,jsonb,uuid),public.confirmar_borrador_nomina(uuid,jsonb,text) to authenticated;
commit;
