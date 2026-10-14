begin;
set local lock_timeout='5s';
create table public.personal_puestos (
 id uuid primary key,sucursal_id uuid references public.sucursales(id),nombre text not null check(length(trim(nombre)) between 3 and 200),
 datos jsonb not null,version_fuente uuid not null references public.personal_versiones(id),fuente text not null,
 motivo text not null check(length(trim(motivo)) between 5 and 1000),creado_por uuid not null references public.perfiles(id),creado_en timestamptz not null default now()
);
create table public.personal_movimientos (
 id uuid primary key,personal_id uuid not null references public.personal(id),tipo text not null check(tipo in ('alta','cambio','baja')),
 fecha date not null,motivo text not null,datos_solicitud jsonb not null,version_anterior uuid references public.personal_versiones(id),version_nueva uuid not null references public.personal_versiones(id),
 usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now()
);
alter table public.personal_puestos enable row level security;
alter table public.personal_movimientos enable row level security;
create policy personal_puestos_consulta on public.personal_puestos for select using(public.ve_finanzas());
create policy personal_movimientos_consulta on public.personal_movimientos for select using(public.ve_finanzas());
revoke all on public.personal_puestos,public.personal_movimientos from public,anon,authenticated;
grant select on public.personal_puestos,public.personal_movimientos to authenticated;
create function public.guardar_plantilla_puesto(p_id uuid,p_nombre text,p_version uuid,p_motivo text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v public.personal_versiones;s uuid;d jsonb;r public.personal_puestos;k text;
begin
 if not coalesce(public.edita_finanzas(),false) then raise exception 'Solo administración gestiona puestos.';end if;
 if p_id is null or length(trim(coalesce(p_nombre,''))) not between 3 and 200 or length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Revisa nombre y motivo de la plantilla.';end if;
 select * into v from public.personal_versiones where id=p_version;
 if not found then raise exception 'No existe el desglose de origen.';end if;
 select sucursal_id into s from public.personal where id=v.personal_id;
 d:=jsonb_build_object('puesto',v.datos->>'puesto','renglon',v.datos->>'renglon');
 foreach k in array array['sueldo','bono','imss','cesantia','retiro','impuesto','infonavit','ajuste'] loop
  if jsonb_typeof(v.datos->k) is distinct from 'number' then raise exception 'El desglose tiene importes pendientes. Completa la fuente antes de crear la plantilla.';end if;
  d:=d||jsonb_build_object(k,v.datos->k);
 end loop;
 perform pg_advisory_xact_lock(hashtextextended('puesto-personal:'||p_id,0));
 select * into r from public.personal_puestos where id=p_id;
 if found then
  if r.creado_por<>auth.uid() or r.nombre<>trim(p_nombre) or r.version_fuente<>p_version or r.motivo<>trim(p_motivo) then raise exception 'Esta solicitud ya corresponde a otra plantilla.';end if;
  return r.id;
 end if;
 if exists(select 1 from public.personal_puestos where sucursal_id is not distinct from s and lower(nombre)=lower(trim(p_nombre))) then raise exception 'Ya existe una plantilla con ese nombre en esta sucursal.';end if;
 insert into public.personal_puestos(id,sucursal_id,nombre,datos,version_fuente,fuente,motivo,creado_por)
 values(p_id,s,trim(p_nombre),d,v.id,'Desglose registrado con vigencia '||v.desde||coalesce(' a '||v.hasta,''),trim(p_motivo),auth.uid());
 return p_id;
end $$;
create function public.guardar_personal_con_puesto(p_solicitud uuid,p_id uuid,p_sucursal uuid,p_codigo text,p_desde date,p_hasta date,p_datos jsonb,p_previa uuid,p_puesto uuid default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare r public.personal_movimientos;plantilla public.personal_puestos;sol jsonb;d jsonb:=p_datos;n uuid;v uuid;
begin
 if not coalesce(public.edita_finanzas(),false) then raise exception 'Solo administración gestiona Personal.';end if;
 if p_solicitud is null then raise exception 'Falta la solicitud.';end if;
 sol:=jsonb_build_object('id',p_id,'sucursal',p_sucursal,'codigo',p_codigo,'desde',p_desde,'hasta',p_hasta,'datos',p_datos,'previa',p_previa,'puesto',p_puesto);
 perform pg_advisory_xact_lock(hashtextextended('personal-movimiento:'||p_solicitud,0));
 select * into r from public.personal_movimientos where id=p_solicitud;
 if found then
  if r.usuario_id<>auth.uid() or r.datos_solicitud<>sol then raise exception 'La solicitud ya corresponde a otro cambio.';end if;
  return r.personal_id;
 end if;
 if p_id is null and nullif(p_datos->>'ingreso','') is null then raise exception 'Indica la fecha de ingreso para dar de alta.';end if;
 if p_id is null and p_datos->>'baja' is not null then raise exception 'La baja se registra desde la ficha de Personal.';end if;
 if p_puesto is not null then
  select * into plantilla from public.personal_puestos where id=p_puesto;
  if not found or plantilla.sucursal_id is distinct from p_sucursal then raise exception 'La plantilla no corresponde a esta sucursal.';end if;
  d:=d||jsonb_build_object('plantilla_puesto_id',plantilla.id,'plantilla_fuente',plantilla.fuente);
 end if;
 n:=public.guardar_personal(p_id,p_sucursal,p_codigo,p_desde,p_hasta,d,p_previa);
 select id into v from public.personal_versiones where personal_id=n and desde=p_desde and sustituida_en is null;
 insert into public.personal_movimientos(id,personal_id,tipo,fecha,motivo,datos_solicitud,version_anterior,version_nueva,usuario_id)
 values(p_solicitud,n,case when p_id is null then 'alta' else 'cambio' end,p_desde,p_datos->>'nota',sol,p_previa,v,auth.uid());
 return n;
end $$;
create function public.registrar_baja_personal(p_solicitud uuid,p_personal uuid,p_previa uuid,p_fecha date,p_motivo text) returns uuid
language plpgsql security definer set search_path=public as $$
declare p public.personal;v public.personal_versiones;r public.personal_movimientos;sol jsonb;d jsonb;nv uuid;k text;
begin
 if not coalesce(public.edita_finanzas(),false) then raise exception 'Solo administración registra bajas.';end if;
 if p_solicitud is null or p_fecha is null or p_fecha<date '2020-01-01' or p_fecha>date '2100-12-31' or length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Revisa fecha y motivo de baja.';end if;
 sol:=jsonb_build_object('personal',p_personal,'previa',p_previa,'fecha',p_fecha,'motivo',trim(p_motivo));
 perform pg_advisory_xact_lock(hashtextextended('personal-movimiento:'||p_solicitud,0));
 select * into r from public.personal_movimientos where id=p_solicitud;
 if found then
  if r.usuario_id<>auth.uid() or r.datos_solicitud<>sol then raise exception 'La solicitud ya corresponde a otra baja.';end if;
  return r.personal_id;
 end if;
 select * into p from public.personal where id=p_personal for update;
 if not found then raise exception 'Persona no encontrada.';end if;
 select * into v from public.personal_versiones where personal_id=p.id and sustituida_en is null order by desde desc limit 1;
 if v.id is distinct from p_previa then raise exception 'El perfil cambió. Recarga antes de registrar la baja.';end if;
 if v.datos->>'baja' is not null then raise exception 'Esta persona ya tiene una baja registrada.';end if;
 if p_fecha<v.desde or p_fecha<nullif(v.datos->>'ingreso','')::date then raise exception 'La baja es anterior al ingreso o a la última vigencia. Revisa el historial antes de registrarla.';end if;
 d:=v.datos||jsonb_build_object('baja',p_fecha,'nota','Baja: '||trim(p_motivo));
 if v.hasta<p_fecha then
  foreach k in array array['sueldo','bono','imss','cesantia','retiro','impuesto','infonavit','ajuste'] loop d:=jsonb_set(d,array[k],'null'::jsonb);end loop;
 end if;
 perform public.guardar_personal(p.id,p.sucursal_id,p.codigo,p_fecha,case when v.hasta>=p_fecha then v.hasta end,d,v.id);
 select id into nv from public.personal_versiones where personal_id=p.id and desde=p_fecha and sustituida_en is null;
 insert into public.personal_movimientos(id,personal_id,tipo,fecha,motivo,datos_solicitud,version_anterior,version_nueva,usuario_id) values(p_solicitud,p.id,'baja',p_fecha,trim(p_motivo),sol,v.id,nv,auth.uid());
 return p.id;
end $$;
revoke all on function public.guardar_plantilla_puesto(uuid,text,uuid,text),public.guardar_personal_con_puesto(uuid,uuid,uuid,text,date,date,jsonb,uuid,uuid),public.registrar_baja_personal(uuid,uuid,uuid,date,text) from public,anon;
grant execute on function public.guardar_plantilla_puesto(uuid,text,uuid,text),public.guardar_personal_con_puesto(uuid,uuid,uuid,text,date,date,jsonb,uuid,uuid),public.registrar_baja_personal(uuid,uuid,uuid,date,text) to authenticated;
commit;
