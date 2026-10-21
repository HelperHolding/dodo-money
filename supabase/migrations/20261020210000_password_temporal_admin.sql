-- Supabase Auth cambia el password; el trigger impone la obligación de cambio en la misma transacción.
begin;
set local lock_timeout='5s';
create table public.password_temporal_solicitudes (
 id uuid primary key,usuario_id uuid not null references public.perfiles(id),
 autor_id uuid not null references public.perfiles(id),motivo text not null check(length(motivo) between 5 and 1000),
 original jsonb not null,estado text not null default 'preparada' check(estado in ('preparada','aplicada','error')),
 creado_en timestamptz not null default now(),aplicado_en timestamptz
);
create unique index password_temporal_una_pendiente on public.password_temporal_solicitudes(usuario_id) where estado='preparada';
alter table public.password_temporal_solicitudes enable row level security;
revoke all on public.password_temporal_solicitudes from public,anon,authenticated;

create function public.preparar_password_temporal(p_id uuid,p_usuario uuid,p_motivo text) returns text
language plpgsql security definer set search_path='' as $$
declare v public.perfiles;r public.password_temporal_solicitudes;
begin
 perform pg_advisory_xact_lock(575701);
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena and rol::text='admin') then raise exception 'Solo administración asigna contraseñas temporales.';end if;
 if p_id is null or p_usuario is null or length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Revisa usuario, solicitud y motivo.';end if;
 if p_usuario=auth.uid() then raise exception 'Para tu propia cuenta utiliza Mi contraseña.';end if;
 select * into r from public.password_temporal_solicitudes where id=p_id for update;
 if found then
  if r.autor_id<>auth.uid() or r.usuario_id<>p_usuario or r.motivo<>trim(p_motivo) then raise exception 'La solicitud corresponde a otra operación.';end if;
  if r.estado='aplicada' then return 'aplicada';end if;
  raise exception 'Esta solicitud ya fue procesada o está en curso. Recarga para reintentar.';
 end if;
 select * into v from public.perfiles where id=p_usuario for update;
 if not found or not v.activo then raise exception 'El usuario no está activo.';end if;
 -- Las cuentas pendientes de invitación se gestionan desde Invitaciones.
 if exists(select 1 from public.usuarios_invitaciones where usuario_id=p_usuario and estado<>'aceptada') then raise exception 'Completa o reenvía la invitación pendiente de esta cuenta.';end if;
 update public.password_temporal_solicitudes set estado='error' where usuario_id=p_usuario and estado='preparada' and creado_en<now()-interval '10 minutes';
 if exists(select 1 from public.password_temporal_solicitudes where usuario_id=p_usuario and estado='preparada') then raise exception 'Hay otra asignación en curso para esta cuenta.';end if;
 if exists(select 1 from public.password_temporal_solicitudes where usuario_id=p_usuario and estado='aplicada' and aplicado_en>now()-interval '1 minute') then raise exception 'Espera un minuto antes de volver a restablecer esta cuenta.';end if;
 insert into public.password_temporal_solicitudes(id,usuario_id,autor_id,motivo,original) values(p_id,p_usuario,auth.uid(),trim(p_motivo),
 jsonb_build_object('id',v.id,'nombre',v.nombre,'rol',v.rol,'sucursal_id',v.sucursal_id,'activo',v.activo,'debe_cambiar_contrasena',v.debe_cambiar_contrasena));
 return 'preparada';
end $$;
revoke all on function public.preparar_password_temporal(uuid,uuid,text) from public,anon;
grant execute on function public.preparar_password_temporal(uuid,uuid,text) to authenticated;

create function public.fallar_password_temporal(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena and rol::text='admin') then raise exception 'Solo administración.';end if;
 update public.password_temporal_solicitudes set estado='error' where id=p_id and autor_id=auth.uid() and estado='preparada';
end $$;
revoke all on function public.fallar_password_temporal(uuid) from public,anon;
grant execute on function public.fallar_password_temporal(uuid) to authenticated;

create or replace function public.registrar_cambio_password_auth() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.password_temporal_solicitudes;v public.perfiles;antes jsonb;despues jsonb;marca text;final_auth auth.users;
begin
 -- GoTrue actualiza contraseña y app_metadata en sentencias separadas de la misma transacción.
 -- El trigger diferido lee el estado final, no la fila intermedia de UpdatePassword.
 select * into final_auth from auth.users where id=new.id;
 if final_auth.encrypted_password is distinct from old.encrypted_password and coalesce(final_auth.encrypted_password,'')<>'' then
  marca:=final_auth.raw_app_meta_data->>'dodo_password_temporal_id';
  if marca is not null and marca is distinct from (old.raw_app_meta_data->>'dodo_password_temporal_id') then
   perform pg_advisory_xact_lock(575701);
   select * into r from public.password_temporal_solicitudes where id::text=marca and usuario_id=new.id for update;
   if not found or r.estado<>'preparada' or r.creado_en<now()-interval '10 minutes' then raise exception 'Solicitud de contraseña temporal inválida o vencida.';end if;
   if not exists(select 1 from public.perfiles where id=r.autor_id and activo and not debe_cambiar_contrasena and rol::text='admin') then raise exception 'El administrador ya no tiene acceso.';end if;
   select * into v from public.perfiles where id=new.id for update;
   antes:=jsonb_build_object('id',v.id,'nombre',v.nombre,'rol',v.rol,'sucursal_id',v.sucursal_id,'activo',v.activo,'debe_cambiar_contrasena',v.debe_cambiar_contrasena);
   if not v.activo or antes is distinct from r.original then raise exception 'El usuario cambió durante la asignación; recarga.';end if;
   update public.perfiles set debe_cambiar_contrasena=true where id=new.id;
   despues:=antes||jsonb_build_object('debe_cambiar_contrasena',true);
   update public.password_temporal_solicitudes set estado='aplicada',aplicado_en=now() where id=r.id;
   insert into public.usuarios_historial(usuario_id,autor_id,motivo,antes,despues) values(new.id,r.autor_id,'Contraseña temporal asignada: '||r.motivo,antes,despues);
  else
   -- Cambio posterior del propio usuario: conserva el mecanismo existente.
   update public.perfiles set debe_cambiar_contrasena=false where id=new.id and debe_cambiar_contrasena;
  end if;
 end if;
 return new;
end $$;
revoke all on function public.registrar_cambio_password_auth() from public,anon,authenticated;
drop trigger password_cambiado_perfil on auth.users;
create constraint trigger password_cambiado_perfil after update on auth.users
deferrable initially deferred for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function public.registrar_cambio_password_auth();
commit;
