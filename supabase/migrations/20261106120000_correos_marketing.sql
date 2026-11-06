-- Correos de marketing: puesto marketing, contactos, campañas, envíos por n8n y seguimiento (spec 2026-11-05).
-- Ojo: el valor nuevo del enum no se puede usar en esta misma transacción; siempre se compara mi_rol()::text.
alter type public.rol_usuario add value if not exists 'marketing';

-- Corporativo y marketing son de oficina central: sin sucursal. Los demás puestos, con sucursal.
alter table public.perfiles drop constraint perfiles_corporativo_sin_sucursal;
alter table public.perfiles add constraint perfiles_sin_sucursal
  check ((rol::text in ('corporativo','marketing')) = (sucursal_id is null));

create function public.puede_ver_correos() returns boolean language sql stable security definer set search_path='' as
$$select coalesce(public.mi_rol()::text in ('marketing','admin','corporativo'),false)$$;
create function public.puede_editar_correos() returns boolean language sql stable security definer set search_path='' as
$$select coalesce(public.mi_rol()::text in ('marketing','admin'),false)$$;
revoke all on function public.puede_ver_correos(),public.puede_editar_correos() from public,anon;
grant execute on function public.puede_ver_correos(),public.puede_editar_correos() to authenticated;

-- <invitaciones>
-- Administración e invitaciones aceptan el puesto marketing (sin sucursal), igual que corporativo.
create or replace function public.administrar_usuario(p_id uuid,p_original jsonb,p_nombre text,p_rol text,p_sucursal uuid,p_activo boolean,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.perfiles; v_antes jsonb; v_despues jsonb;
begin
 -- Serializa cambios de administración para proteger el último administrador incluso en paralelo.
 perform pg_advisory_xact_lock(575701);
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena and rol::text='admin') then raise exception 'Solo administración gestiona usuarios.';end if;
 if p_nombre is null or length(trim(p_nombre)) not between 2 and 160 then raise exception 'Escribe un nombre de 2 a 160 caracteres.';end if;
 if p_motivo is null or length(trim(p_motivo)) not between 5 and 1000 then raise exception 'Escribe un motivo de 5 a 1000 caracteres.';end if;
 if p_activo is null or p_rol is null or p_rol not in ('operacion','encargado','gerente','admin','corporativo','marketing') then raise exception 'Rol o estado inválido.';end if;
 if p_rol in ('corporativo','marketing') then p_sucursal:=null;
 elsif p_sucursal is null or not exists(select 1 from public.sucursales where id=p_sucursal) then raise exception 'Selecciona una sucursal válida.';end if;
 select * into v from public.perfiles where id=p_id for update;
 if not found then raise exception 'Usuario no encontrado.';end if;
 v_antes:=jsonb_build_object('id',v.id,'nombre',v.nombre,'rol',v.rol,'sucursal_id',v.sucursal_id,'activo',v.activo,'debe_cambiar_contrasena',v.debe_cambiar_contrasena);
 v_despues:=v_antes||jsonb_build_object('nombre',trim(p_nombre),'rol',p_rol,'sucursal_id',p_sucursal,'activo',p_activo);
 -- Repetición del mismo envío: no duplica el historial.
 if v_antes=v_despues then return;end if;
 if p_original is distinct from v_antes then raise exception 'El usuario cambió desde que abriste la pantalla. Recarga antes de guardar.';end if;
 if p_id=auth.uid() and (p_rol<>'admin' or not p_activo) then raise exception 'No puedes quitarte el acceso de administración.';end if;
 if v.rol::text='admin' and v.activo and not v.debe_cambiar_contrasena and (p_rol<>'admin' or not p_activo)
 and not exists(select 1 from public.perfiles where id<>p_id and rol::text='admin' and activo and not debe_cambiar_contrasena) then raise exception 'Debe permanecer un administrador activo.';end if;
 update public.perfiles set nombre=trim(p_nombre),rol=p_rol::public.rol_usuario,sucursal_id=p_sucursal,activo=p_activo where id=p_id;
 insert into public.usuarios_historial(usuario_id,autor_id,motivo,antes,despues) values(p_id,auth.uid(),trim(p_motivo),v_antes,v_despues);
end $$;
revoke all on function public.administrar_usuario(uuid,jsonb,text,text,uuid,boolean,text) from public,anon;
grant execute on function public.administrar_usuario(uuid,jsonb,text,text,uuid,boolean,text) to authenticated;
create or replace function public.preparar_invitacion_usuario(p_id uuid,p_envio uuid,p_correo text,p_nombre text,p_rol text,p_sucursal uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.usuarios_invitaciones;
begin
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena and rol::text='admin') then raise exception 'Solo administración invita usuarios.';end if;
 perform pg_advisory_xact_lock(585801);
 if p_id is null or p_envio is null then raise exception 'Identificador de envío requerido.';end if;
 select * into v from public.usuarios_invitaciones where id=p_id for update;
 if not found then
  p_correo:=lower(trim(p_correo));
  if p_correo is null or length(p_correo)>254 or p_correo !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Correo inválido.';end if;
  if p_nombre is null or length(trim(p_nombre)) not between 2 and 160 then raise exception 'Nombre inválido.';end if;
  if p_rol is null or p_rol not in ('operacion','encargado','gerente','admin','corporativo','marketing') then raise exception 'Rol inválido.';end if;
  if p_rol in ('corporativo','marketing') then p_sucursal:=null;
  elsif p_sucursal is null or not exists(select 1 from public.sucursales where id=p_sucursal) then raise exception 'Selecciona una sucursal válida.';end if;
  if exists(select 1 from public.usuarios_invitaciones where correo=p_correo) then raise exception 'Ya hay una invitación para ese correo. Reenvíala desde la lista.';end if;
  if exists(select 1 from auth.users where lower(email)=p_correo) then raise exception 'Ese correo ya tiene una cuenta. Administra el usuario existente.';end if;
  insert into public.usuarios_invitaciones(id,correo,nombre,rol,sucursal_id,creado_por) values(p_id,p_correo,trim(p_nombre),p_rol::public.rol_usuario,p_sucursal,auth.uid()) returning * into v;
  insert into public.usuarios_invitaciones_historial(invitacion_id,autor_id,evento) values(p_id,auth.uid(),'Alta solicitada');
 end if;
 if v.estado='aceptada' then raise exception 'La persona ya creó su contraseña.';end if;
 if v.reservado_hasta>now() then raise exception 'Espera un minuto antes de reenviar la invitación.';end if;
 if v.usuario_id is not null and not exists(select 1 from public.perfiles where id=v.usuario_id and activo and debe_cambiar_contrasena) then raise exception 'La cuenta no está activa o ya completó su contraseña.';end if;
 update public.usuarios_invitaciones set envio_id=p_envio,envio_por=auth.uid(),reservado_hasta=now()+interval '1 minute' where id=p_id;
 insert into public.usuarios_invitaciones_historial(invitacion_id,autor_id,evento) values(p_id,auth.uid(),'Envío solicitado');
 return jsonb_build_object('id',v.id,'correo',v.correo,'usuario_id',v.usuario_id);
end $$;
revoke all on function public.preparar_invitacion_usuario(uuid,uuid,text,text,text,uuid) from public,anon;
grant execute on function public.preparar_invitacion_usuario(uuid,uuid,text,text,text,uuid) to authenticated;
-- </invitaciones>

create table public.correo_contactos(
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email ~ '^[\x21-\x7e]+$' and email ~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$'),
  nombre text check (nombre is null or length(nombre) <= 160),
  etiquetas text[] not null default '{}',
  estado text not null default 'activo' check (estado in ('activo','baja','rebote')),
  origen text, fecha_baja timestamptz,
  creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now());
create table public.correo_campanas(
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 120),
  asunto text not null check (length(btrim(asunto)) between 1 and 150),
  html text not null check (length(html) between 1 and 500000),
  etiqueta text,
  programada_para timestamptz,
  estado text not null default 'borrador' check (estado in ('borrador','programada','enviando','detenida','enviada','cancelada')),
  iniciada_en timestamptz, terminada_en timestamptz,
  creada_por uuid references public.perfiles(id),
  creado_en timestamptz not null default now(), actualizado_en timestamptz not null default now(),
  check (estado <> 'programada' or programada_para is not null));
create table public.correo_envios(
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references public.correo_campanas(id) on delete cascade,
  contacto_id uuid references public.correo_contactos(id),
  email text not null,
  token text not null unique default replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''),
  es_prueba boolean not null default false,
  estado text not null default 'pendiente' check (estado in ('pendiente','procesando','aceptado','problema')),
  reservado_en timestamptz, enviado_en timestamptz, message_id text, detalle text,
  creado_en timestamptz not null default now(),
  check (es_prueba or contacto_id is not null));
create unique index correo_envios_uno_por_contacto on public.correo_envios(campana_id, contacto_id) where not es_prueba;
create index correo_envios_pendientes on public.correo_envios(estado, creado_en) where estado in ('pendiente','procesando');
create table public.correo_eventos(
  id bigint generated always as identity primary key,
  envio_id uuid not null references public.correo_envios(id) on delete cascade,
  tipo text not null check (tipo in ('apertura','clic','baja')),
  enlace text, agente text, sospechoso boolean not null default false,
  creado_en timestamptz not null default now());
create index correo_eventos_envio on public.correo_eventos(envio_id);
create table public.correo_estado_n8n(id int primary key check (id = 1), ultima_consulta timestamptz);
insert into public.correo_estado_n8n values (1, null);

alter table public.correo_contactos enable row level security;
alter table public.correo_campanas enable row level security;
alter table public.correo_envios enable row level security;
alter table public.correo_eventos enable row level security;
alter table public.correo_estado_n8n enable row level security;
create policy correo_contactos_ver on public.correo_contactos for select to authenticated using (public.puede_editar_correos());
create policy correo_campanas_ver on public.correo_campanas for select to authenticated using (public.puede_ver_correos());
create policy correo_envios_ver on public.correo_envios for select to authenticated using (public.puede_ver_correos());
create policy correo_eventos_ver on public.correo_eventos for select to authenticated using (public.puede_ver_correos());
create policy correo_estado_n8n_ver on public.correo_estado_n8n for select to authenticated using (public.puede_ver_correos());
grant select on public.correo_contactos, public.correo_campanas, public.correo_envios, public.correo_eventos, public.correo_estado_n8n to authenticated;

create function public.correo_exigir_editor() returns void language plpgsql stable security definer set search_path='' as $$
begin if not public.puede_editar_correos() then raise exception 'Solo marketing o administración puede hacer esto.'; end if; end $$;

create function public.correo_normalizar_email(p text) returns text language sql immutable set search_path='' as $$
select lower(regexp_replace(coalesce(p,''), '^[\s ﻿​]+|[\s ﻿​]+$', '', 'g'))$$;

create function public.correo_email_valido(p text) returns text language plpgsql immutable set search_path='' as $$
declare e text := public.correo_normalizar_email(p);
begin if e !~ '^[\x21-\x7e]+$' or e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' then raise exception 'Correo inválido: %', left(coalesce(p,''),80); end if; return e; end $$;

create function public.correo_etiquetas(p jsonb) returns text[] language sql immutable set search_path='' as $$
select coalesce(array(select distinct lower(btrim(x)) from jsonb_array_elements_text(coalesce(p,'[]'::jsonb)) x where btrim(x) <> '' order by 1), '{}')$$;

create function public.correo_guardar_contacto(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare e text; v uuid;
begin
  perform public.correo_exigir_editor();
  e := public.correo_email_valido(p->>'email');
  if p ? 'id' and p->>'id' is not null then
    update public.correo_contactos set email = e, nombre = nullif(btrim(p->>'nombre'),''), etiquetas = public.correo_etiquetas(p->'etiquetas'), actualizado_en = now()
      where id = (p->>'id')::uuid returning id into v;
    if v is null then raise exception 'Contacto no encontrado.'; end if;
    return v;
  end if;
  insert into public.correo_contactos(email, nombre, etiquetas, origen) values (e, nullif(btrim(p->>'nombre'),''), public.correo_etiquetas(p->'etiquetas'), 'manual')
  on conflict (email) do update set etiquetas = array(select distinct x from unnest(public.correo_contactos.etiquetas || excluded.etiquetas) x order by 1),
    nombre = coalesce(public.correo_contactos.nombre, excluded.nombre), actualizado_en = now()
  returning id into v;
  return v;
end $$;

create function public.correo_importar_contactos(p_filas jsonb, p_origen text, p_confirmar boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare f jsonb; e text; vistos text[] := '{}'; r jsonb := '{"nuevos":0,"existentes":0,"bajas":0,"invalidos":0}'; previo text;
begin
  perform public.correo_exigir_editor();
  if jsonb_typeof(p_filas) <> 'array' or jsonb_array_length(p_filas) > 20000 then raise exception 'El archivo debe tener de 1 a 20 000 contactos.'; end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    e := public.correo_normalizar_email(f->>'email');
    if e !~ '^[\x21-\x7e]+$' or e !~ '^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$' then r := jsonb_set(r,'{invalidos}',to_jsonb((r->>'invalidos')::int+1)); continue; end if;
    if e = any(vistos) then continue; end if;
    vistos := vistos || e;
    select estado into previo from public.correo_contactos where email = e;
    if previo is null then r := jsonb_set(r,'{nuevos}',to_jsonb((r->>'nuevos')::int+1));
    elsif previo in ('baja','rebote') then r := jsonb_set(r,'{bajas}',to_jsonb((r->>'bajas')::int+1)); continue;
    else r := jsonb_set(r,'{existentes}',to_jsonb((r->>'existentes')::int+1)); end if;
    if p_confirmar then
      insert into public.correo_contactos(email, nombre, etiquetas, origen) values (e, nullif(btrim(f->>'nombre'),''), public.correo_etiquetas(f->'etiquetas'), left(coalesce(nullif(btrim(p_origen),''),'CSV'),120))
      on conflict (email) do update set etiquetas = array(select distinct x from unnest(public.correo_contactos.etiquetas || excluded.etiquetas) x order by 1),
        nombre = coalesce(public.correo_contactos.nombre, excluded.nombre), actualizado_en = now();
    end if;
  end loop;
  return r;
end $$;

create function public.correo_baja_manual(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.correo_exigir_editor();
  update public.correo_contactos set estado = 'baja', fecha_baja = coalesce(fecha_baja, now()), actualizado_en = now() where id = p_id;
end $$;

create function public.correo_contar_destinatarios(p_etiqueta text) returns int language sql stable security definer set search_path='' as $$
select case when public.puede_ver_correos() then (select count(*)::int from public.correo_contactos where estado = 'activo' and (nullif(btrim(p_etiqueta),'') is null or lower(btrim(p_etiqueta)) = any(etiquetas))) else 0 end$$;

create function public.correo_guardar_campana(p jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; est text;
begin
  perform public.correo_exigir_editor();
  if p ? 'id' and p->>'id' is not null then
    select estado into est from public.correo_campanas where id = (p->>'id')::uuid for update;
    if est is null then raise exception 'Campaña no encontrada.'; end if;
    if est not in ('borrador','programada') then raise exception 'Solo se editan borradores o programadas.'; end if;
    update public.correo_campanas set nombre = btrim(p->>'nombre'), asunto = btrim(p->>'asunto'), html = p->>'html',
      etiqueta = nullif(lower(btrim(p->>'etiqueta')),''), actualizado_en = now() where id = (p->>'id')::uuid returning id into v;
    return v;
  end if;
  insert into public.correo_campanas(nombre, asunto, html, etiqueta, creada_por)
    values (btrim(p->>'nombre'), btrim(p->>'asunto'), p->>'html', nullif(lower(btrim(p->>'etiqueta')),''), auth.uid()) returning id into v;
  return v;
exception when check_violation then raise exception 'Revisa nombre (1–120), asunto (1–150) y HTML (hasta 500 000 caracteres).';
end $$;

create function public.correo_cambiar_estado(p_id uuid, p_accion text, p_cuando timestamptz default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.correo_campanas;
begin
  perform public.correo_exigir_editor();
  select * into c from public.correo_campanas where id = p_id for update;
  if c.id is null then raise exception 'Campaña no encontrada.'; end if;
  if p_accion = 'programar' then
    if c.estado <> 'borrador' then raise exception 'Esta campaña no se puede programar (está %).', c.estado; end if;
    if p_cuando is not null and p_cuando < now() - interval '1 minute' then raise exception 'La fecha ya pasó; elige una hora futura.'; end if;
    if public.correo_contar_destinatarios(c.etiqueta) = 0 then raise exception 'No hay contactos activos para esta campaña.'; end if;
    update public.correo_campanas set estado = 'programada', programada_para = coalesce(p_cuando, now()), actualizado_en = now() where id = p_id;
  elsif p_accion = 'borrador' then
    if c.estado <> 'programada' then raise exception 'Solo una campaña programada regresa a borrador.'; end if;
    update public.correo_campanas set estado = 'borrador', programada_para = null, actualizado_en = now() where id = p_id;
  elsif p_accion = 'cancelar' then
    if c.estado not in ('borrador','programada') then raise exception 'Esta campaña no se puede cancelar (está %).', c.estado; end if;
    update public.correo_campanas set estado = 'cancelada', actualizado_en = now() where id = p_id;
  elsif p_accion = 'detener' then
    if c.estado <> 'enviando' then raise exception 'Esta campaña no se puede detener (está %).', c.estado; end if;
    update public.correo_campanas set estado = 'detenida', actualizado_en = now() where id = p_id;
  elsif p_accion = 'reanudar' then
    if c.estado <> 'detenida' then raise exception 'Solo una campaña detenida se reanuda.'; end if;
    update public.correo_campanas set estado = 'enviando', actualizado_en = now() where id = p_id;
  elsif p_accion = 'reintentar' then
    if c.estado not in ('enviada','detenida','enviando') then raise exception 'Esta campaña aún no tiene envíos que reintentar.'; end if;
    update public.correo_envios e set estado = 'pendiente', reservado_en = null, detalle = null
      from public.correo_contactos k where e.campana_id = p_id and not e.es_prueba and e.estado = 'problema' and k.id = e.contacto_id and k.estado = 'activo';
    update public.correo_campanas set estado = 'enviando', terminada_en = null, actualizado_en = now() where id = p_id and estado = 'enviada';
  else raise exception 'Acción inválida.';
  end if;
end $$;

create function public.correo_mandar_prueba(p_id uuid, p_correos text[]) returns int language plpgsql security definer set search_path='' as $$
declare e text; n int := 0; correos text[];
begin
  perform public.correo_exigir_editor();
  if not exists (select 1 from public.correo_campanas where id = p_id and estado <> 'cancelada') then raise exception 'Campaña no encontrada.'; end if;
  correos := array(select distinct public.correo_email_valido(x) from unnest(coalesce(p_correos,'{}')) x where btrim(x) <> '');
  if cardinality(correos) not between 1 and 5 then raise exception 'La prueba va de 1 hasta 5 correos.'; end if;
  foreach e in array correos loop
    insert into public.correo_envios(campana_id, email, es_prueba) values (p_id, e, true); n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.correo_exigir_editor(), public.correo_normalizar_email(text), public.correo_email_valido(text), public.correo_etiquetas(jsonb) from public, anon, authenticated;
revoke all on function public.correo_guardar_contacto(jsonb), public.correo_importar_contactos(jsonb,text,boolean), public.correo_baja_manual(uuid),
  public.correo_contar_destinatarios(text), public.correo_guardar_campana(jsonb), public.correo_cambiar_estado(uuid,text,timestamptz), public.correo_mandar_prueba(uuid,text[]) from public, anon;
grant execute on function public.correo_guardar_contacto(jsonb), public.correo_importar_contactos(jsonb,text,boolean), public.correo_baja_manual(uuid),
  public.correo_contar_destinatarios(text), public.correo_guardar_campana(jsonb), public.correo_cambiar_estado(uuid,text,timestamptz), public.correo_mandar_prueba(uuid,text[]) to authenticated;

create function public.correo_tomar_lote(p_lote int) returns jsonb language plpgsql security definer set search_path='' as $$
declare n int := least(greatest(coalesce(p_lote,8),1),8); r jsonb;
begin
  update public.correo_estado_n8n set ultima_consulta = now() where id = 1;
  -- Campañas cuya hora llegó: se arma la lista con los contactos activos de ese momento.
  with listas as (
    update public.correo_campanas set estado = 'enviando', iniciada_en = coalesce(iniciada_en, now()), actualizado_en = now()
    where estado = 'programada' and programada_para <= now() returning id, etiqueta)
  insert into public.correo_envios(campana_id, contacto_id, email)
    select l.id, k.id, k.email from listas l join public.correo_contactos k on k.estado = 'activo' and (l.etiqueta is null or l.etiqueta = any(k.etiquetas))
  on conflict do nothing;
  -- Reservados sin respuesta: pudieron haber salido; no se reintentan solos.
  update public.correo_envios set estado = 'problema', detalle = 'Sin respuesta de n8n; puede haber salido, revisar antes de reintentar.'
    where estado = 'procesando' and reservado_en < now() - interval '15 minutes';
  -- Pendientes de contactos que ya no están activos: no salen.
  update public.correo_envios e set estado = 'problema', detalle = 'El contacto se dio de baja o rebotó antes del envío.'
    from public.correo_contactos k where e.estado = 'pendiente' and not e.es_prueba and k.id = e.contacto_id and k.estado <> 'activo';
  with elegidos as (
    select e.id from public.correo_envios e join public.correo_campanas c on c.id = e.campana_id left join public.correo_contactos k on k.id = e.contacto_id
    where e.estado = 'pendiente' and (e.es_prueba or k.estado = 'activo') and (e.es_prueba and c.estado <> 'cancelada' or not e.es_prueba and c.estado = 'enviando')
    order by e.es_prueba desc, c.iniciada_en nulls first, e.creado_en, e.id
    limit n for update of e skip locked),
  reservados as (
    update public.correo_envios e set estado = 'procesando', reservado_en = now() from elegidos where e.id = elegidos.id
    returning e.id, e.token, e.email, e.es_prueba, e.campana_id, e.creado_en)
  select coalesce(jsonb_agg(jsonb_build_object('envio_id', r.id, 'token', r.token, 'para', r.email, 'es_prueba', r.es_prueba,
      'asunto', case when r.es_prueba then '[PRUEBA] ' else '' end || c.asunto, 'html', c.html, 'campana_nombre', c.nombre)
      order by r.es_prueba desc, r.creado_en, r.id), '[]'::jsonb)
    into r from reservados r join public.correo_campanas c on c.id = r.campana_id;
  update public.correo_campanas c set estado = 'enviada', terminada_en = now(), actualizado_en = now()
    where c.estado = 'enviando' and not exists (select 1 from public.correo_envios e where e.campana_id = c.id and not e.es_prueba and e.estado in ('pendiente','procesando'));
  return r;
end $$;

create function public.correo_registrar_resultado(p_envio uuid, p_aceptado boolean, p_message_id text, p_detalle text, p_rebote boolean) returns void language plpgsql security definer set search_path='' as $$
declare e public.correo_envios;
begin
  update public.correo_envios set estado = case when p_aceptado then 'aceptado' else 'problema' end, enviado_en = case when p_aceptado then now() end,
    message_id = left(p_message_id, 300), detalle = left(coalesce(p_detalle, case when p_aceptado then 'Aceptado por SMTP; no confirma entrega a bandeja.' end), 1500)
    where id = p_envio and (estado = 'procesando' or (p_aceptado and estado = 'problema' and detalle like 'Sin respuesta de n8n;%'))
    returning * into e; -- un éxito tardío, después del barrido de 15 min, se acepta para que reintentar no lo duplique
  if e.id is null then return; end if;
  if not p_aceptado and p_rebote and e.contacto_id is not null then
    update public.correo_contactos set estado = 'rebote', actualizado_en = now() where id = e.contacto_id and estado = 'activo';
  end if;
  update public.correo_campanas c set estado = 'enviada', terminada_en = now(), actualizado_en = now()
    where c.id = e.campana_id and c.estado = 'enviando' and not exists (select 1 from public.correo_envios x where x.campana_id = c.id and not x.es_prueba and x.estado in ('pendiente','procesando'));
end $$;

create function public.correo_registrar_evento(p_token text, p_tipo text, p_enlace text, p_agente text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.correo_envios; nombre text;
begin
  if p_tipo not in ('apertura','clic') then raise exception 'Tipo inválido.'; end if;
  select * into e from public.correo_envios where token = p_token;
  if e.id is null then return null; end if;
  insert into public.correo_eventos(envio_id, tipo, enlace, agente, sospechoso)
    values (e.id, p_tipo, left(p_enlace, 500), left(p_agente, 300), p_tipo = 'clic' and (e.enviado_en is null or now() - e.enviado_en < interval '10 seconds'));
  select c.nombre into nombre from public.correo_campanas c where c.id = e.campana_id;
  return jsonb_build_object('campana_nombre', nombre);
end $$;

create function public.correo_baja_por_token(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e public.correo_envios; correo text;
begin
  select * into e from public.correo_envios where token = p_token;
  if e.id is null then return null; end if;
  if e.contacto_id is not null then
    update public.correo_contactos set estado = 'baja', fecha_baja = coalesce(fecha_baja, now()), actualizado_en = now() where id = e.contacto_id and estado <> 'baja';
    if found then insert into public.correo_eventos(envio_id, tipo) values (e.id, 'baja'); end if;
  end if;
  correo := left(e.email, 1) || '***@' || split_part(e.email, '@', 2);
  return jsonb_build_object('email', correo);
end $$;

revoke all on function public.correo_tomar_lote(int), public.correo_registrar_resultado(uuid,boolean,text,text,boolean),
  public.correo_registrar_evento(text,text,text,text), public.correo_baja_por_token(text) from public, anon, authenticated;
grant execute on function public.correo_tomar_lote(int), public.correo_registrar_resultado(uuid,boolean,text,text,boolean),
  public.correo_registrar_evento(text,text,text,text), public.correo_baja_por_token(text) to service_role;
grant select, insert, update on public.correo_envios, public.correo_eventos, public.correo_contactos, public.correo_campanas, public.correo_estado_n8n to service_role;
