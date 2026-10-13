-- Administración de perfiles existentes. No crea cuentas ni modifica contraseñas en Auth.
begin;
set local lock_timeout='5s';
create table public.usuarios_historial (
 id uuid primary key default gen_random_uuid(), usuario_id uuid not null references public.perfiles(id),
 autor_id uuid not null references public.perfiles(id), motivo text not null,
 antes jsonb not null, despues jsonb not null, creado_en timestamptz not null default now()
);
alter table public.usuarios_historial enable row level security;
revoke all on public.usuarios_historial from anon,authenticated;
grant select on public.usuarios_historial to authenticated;
create policy usuarios_historial_admin on public.usuarios_historial for select to authenticated
 using(public.mi_rol()::text='admin');
create function public.administrar_usuario(p_id uuid,p_original jsonb,p_nombre text,p_rol text,p_sucursal uuid,p_activo boolean,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.perfiles; v_antes jsonb; v_despues jsonb;
begin
 -- Serializa cambios de administración para proteger el último administrador incluso en paralelo.
 perform pg_advisory_xact_lock(575701);
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena and rol::text='admin') then raise exception 'Solo administración gestiona usuarios.';end if;
 if p_nombre is null or length(trim(p_nombre)) not between 2 and 160 then raise exception 'Escribe un nombre de 2 a 160 caracteres.';end if;
 if p_motivo is null or length(trim(p_motivo)) not between 5 and 1000 then raise exception 'Escribe un motivo de 5 a 1000 caracteres.';end if;
 if p_activo is null or p_rol is null or p_rol not in ('operacion','encargado','gerente','admin','corporativo') then raise exception 'Rol o estado inválido.';end if;
 if p_rol='corporativo' then p_sucursal:=null;
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
commit;
