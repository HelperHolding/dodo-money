begin;
set local lock_timeout='5s';
create table public.usuarios_invitaciones (
 id uuid primary key, correo text not null unique, nombre text not null, rol public.rol_usuario not null,
 sucursal_id uuid references public.sucursales(id), usuario_id uuid unique references public.perfiles(id),
 creado_por uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 estado text not null default 'pendiente' check(estado in ('pendiente','enviada','aceptada','error')),
 envio_id uuid, envio_por uuid references public.perfiles(id), reservado_hasta timestamptz, enviada_en timestamptz, aceptada_en timestamptz,
 envios integer not null default 0, error_envio text
);
create table public.usuarios_invitaciones_historial (
 id uuid primary key default gen_random_uuid(),invitacion_id uuid not null references public.usuarios_invitaciones(id),
 autor_id uuid not null references public.perfiles(id),evento text not null,creado_en timestamptz not null default now()
);
alter table public.usuarios_invitaciones enable row level security;
alter table public.usuarios_invitaciones_historial enable row level security;
revoke all on public.usuarios_invitaciones,public.usuarios_invitaciones_historial from anon,authenticated;
grant select on public.usuarios_invitaciones,public.usuarios_invitaciones_historial to authenticated;
grant all on public.usuarios_invitaciones,public.usuarios_invitaciones_historial to service_role;
create policy invitaciones_admin on public.usuarios_invitaciones for select to authenticated using(public.mi_rol()::text='admin');
create policy invitaciones_historial_admin on public.usuarios_invitaciones_historial for select to authenticated using(public.mi_rol()::text='admin');
create function public.preparar_invitacion_usuario(p_id uuid,p_envio uuid,p_correo text,p_nombre text,p_rol text,p_sucursal uuid) returns jsonb
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
  if p_rol is null or p_rol not in ('operacion','encargado','gerente','admin','corporativo') then raise exception 'Rol inválido.';end if;
  if p_rol='corporativo' then p_sucursal:=null;
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
-- La invitación queda asociada al perfil dentro de la transacción que crea Auth.
-- El identificador es una capacidad privada: nunca se publica en el enlace ni se confía en el rol del metadata.
create function public.perfil_desde_invitacion() returns trigger
language plpgsql security definer set search_path='' as $$
declare v public.usuarios_invitaciones; ident text;
begin
 ident:=new.raw_user_meta_data->>'dodo_invitacion_id';
 if ident is null then return new;end if;
 if ident !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Invitación inválida.';end if;
 select * into v from public.usuarios_invitaciones where id=ident::uuid for update;
 if not found or v.usuario_id is not null or v.estado='aceptada' or lower(new.email) is distinct from v.correo or v.envio_id is null then raise exception 'Invitación inválida.';end if;
 insert into public.perfiles(id,nombre,rol,sucursal_id,activo,debe_cambiar_contrasena) values(new.id,v.nombre,v.rol,v.sucursal_id,true,true);
 update public.usuarios_invitaciones set usuario_id=new.id where id=v.id;
 insert into public.usuarios_invitaciones_historial(invitacion_id,autor_id,evento) values(v.id,v.creado_por,'Cuenta creada con contraseña pendiente');
 return new;
end $$;
create trigger dodo_perfil_invitado after insert on auth.users for each row execute function public.perfil_desde_invitacion();
create function public.finalizar_envio_invitacion(p_id uuid,p_envio uuid,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.usuarios_invitaciones;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Solo el servidor registra el envío.';end if;
 select * into v from public.usuarios_invitaciones where id=p_id for update;
 if not found or v.envio_id is distinct from p_envio then raise exception 'Envío no vigente.';end if;
 if p_error is null and v.usuario_id is null then raise exception 'Falta la cuenta de la invitación.';end if;
 update public.usuarios_invitaciones set estado=case when estado='aceptada' then estado when p_error is null then 'enviada' else 'error' end,
 enviada_en=case when p_error is null then now() else enviada_en end,envios=envios+case when p_error is null then 1 else 0 end,
 error_envio=left(p_error,500),envio_id=null where id=p_id;
 insert into public.usuarios_invitaciones_historial(invitacion_id,autor_id,evento) values(p_id,v.envio_por,case when p_error is null then 'Correo enviado' else 'Envío no confirmado' end);
end $$;
create function public.mi_invitacion_pendiente() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.usuarios_invitaciones i join public.perfiles p on p.id=i.usuario_id join auth.users u on u.id=p.id
 where p.id=auth.uid() and p.activo and p.debe_cambiar_contrasena and u.email_confirmed_at is not null and i.estado<>'aceptada')
$$;
create function public.marcar_invitacion_aceptada() returns trigger
language plpgsql security definer set search_path='' as $$
declare v public.usuarios_invitaciones;
begin
 if new.encrypted_password is not distinct from old.encrypted_password or coalesce(new.encrypted_password,'')='' then return new;end if;
 select * into v from public.usuarios_invitaciones where usuario_id=new.id and estado<>'aceptada' for update;
 if found then
  update public.usuarios_invitaciones set estado='aceptada',aceptada_en=now() where id=v.id;
  insert into public.usuarios_invitaciones_historial(invitacion_id,autor_id,evento) values(v.id,new.id,'Contraseña establecida');
 end if;
 return new;
end $$;
create trigger dodo_invitacion_aceptada after update of encrypted_password on auth.users for each row execute function public.marcar_invitacion_aceptada();
revoke all on function public.perfil_desde_invitacion(),public.marcar_invitacion_aceptada() from public,anon,authenticated;
revoke all on function public.preparar_invitacion_usuario(uuid,uuid,text,text,text,uuid),public.mi_invitacion_pendiente() from public,anon;
grant execute on function public.preparar_invitacion_usuario(uuid,uuid,text,text,text,uuid),public.mi_invitacion_pendiente() to authenticated;
revoke all on function public.finalizar_envio_invitacion(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.finalizar_envio_invitacion(uuid,uuid,text) to service_role;
commit;
