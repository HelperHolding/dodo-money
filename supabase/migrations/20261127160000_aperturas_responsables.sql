-- Aperturas: responsables únicos, acceso por responsable, bitácora y división (HD-17, HD-27, HD-18).
-- Spec 2026-11-27-aperturas-responsables. Requiere 20261127155000_rol_aperturas.sql ya ejecutada.
begin;
set local lock_timeout = '5s';

-- <catalogo>
-- Catálogo de responsables: una fila por persona. perfil_id si es usuario de Dodo MX; externo=true si no tiene usuario.
create table public.apertura_responsables (
 id uuid primary key default gen_random_uuid(),
 nombre text not null check(length(nombre) between 1 and 80),
 perfil_id uuid unique references public.perfiles(id),
 externo boolean not null default false,
 activo boolean not null default true,
 check(externo = (perfil_id is null))
);
create unique index apertura_responsables_nombre_uq on public.apertura_responsables(lower(btrim(nombre)));
alter table public.apertura_responsables enable row level security;
-- El catálogo es solo nombres: lo lee cualquier usuario autenticado. Escriben únicamente las funciones de administración.
create policy ver_apertura_responsables on public.apertura_responsables for select to authenticated using(true);
revoke all on public.apertura_responsables from public,anon,authenticated;
grant select on public.apertura_responsables to authenticated;
-- </catalogo>

-- <columnas>
alter table public.apertura_items
 add column responsable_id uuid references public.apertura_responsables(id),
 add column descripcion text check(length(descripcion)<=4000),
 add column origen_id uuid references public.apertura_items(id);
create index apertura_items_responsable_idx on public.apertura_items(responsable_id) where responsable_id is not null;
create index apertura_items_origen_idx on public.apertura_items(origen_id) where origen_id is not null;
-- </columnas>

-- <bitacora>
-- Entradas por registro: avance opcional, estatus corto y comentario. Las políticas y el alta van en la sección de acceso.
create table public.apertura_bitacora (
 id uuid primary key default gen_random_uuid(),
 item_id uuid not null references public.apertura_items(id) on delete cascade,
 fecha date not null default (now() at time zone 'America/Mexico_City')::date,
 avance integer check(avance between 0 and 100),
 estatus text check(length(estatus)<=80),
 comentario text not null check(length(comentario) between 1 and 2000),
 usuario_id uuid not null references public.perfiles(id),
 creado_en timestamptz not null default now()
);
create index apertura_bitacora_item_idx on public.apertura_bitacora(item_id,fecha desc,creado_en desc);
alter table public.apertura_bitacora enable row level security;
revoke all on public.apertura_bitacora from public,anon,authenticated;
-- </bitacora>

-- <sincronizacion>
-- apertura_items.responsable (texto) se conserva igual al nombre del catálogo para no romper las pantallas que lo leen.
create function public.sincronizar_responsable_item() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.responsable_id is not null then
  select nombre into new.responsable from public.apertura_responsables where id=new.responsable_id;
 elsif tg_op='UPDATE' and old.responsable_id is not null then
  new.responsable:=null;
 end if;
 return new;
end $$;
create trigger apertura_items_sincroniza_responsable before insert or update of responsable_id on public.apertura_items
 for each row execute function public.sincronizar_responsable_item();

create function public.sincronizar_nombre_responsable() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.apertura_items set responsable=new.nombre where responsable_id=new.id;
 return null;
end $$;
create trigger apertura_responsables_renombra after update of nombre on public.apertura_responsables
 for each row when (old.nombre is distinct from new.nombre) execute function public.sincronizar_nombre_responsable();
revoke all on function public.sincronizar_responsable_item(),public.sincronizar_nombre_responsable() from public,anon,authenticated;
-- </sincronizacion>

-- <funciones-catalogo>
-- El responsable del usuario en sesión: solo si el usuario está activo (igual que mi_rol: sin cambio de contraseña pendiente) y la fila del catálogo está activa.
create function public.mi_responsable_id() returns uuid language sql stable security definer set search_path='' as $$
 select r.id from public.apertura_responsables r join public.perfiles p on p.id=r.perfil_id
 where r.perfil_id=auth.uid() and r.activo and p.activo and not p.debe_cambiar_contrasena
$$;
revoke all on function public.mi_responsable_id() from public,anon;
grant execute on function public.mi_responsable_id() to authenticated;

-- Alta (p_id null) o edición del catálogo. Solo administración.
create function public.guardar_responsable_apertura(p_id uuid,p_nombre text,p_perfil uuid,p_externo boolean,p_activo boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_nombre text:=btrim(coalesce(p_nombre,''));
begin
 if not public.edita_compras() then raise exception 'Solo administración gestiona responsables.';end if;
 if length(v_nombre) not between 1 and 80 then raise exception 'Escribe un nombre de 1 a 80 caracteres.';end if;
 if p_externo is distinct from (p_perfil is null) then raise exception 'Un responsable es externo si no tiene usuario, o tiene usuario si no es externo.';end if;
 if p_perfil is not null and not exists(select 1 from public.perfiles where id=p_perfil) then raise exception 'El usuario elegido no existe.';end if;
 if p_activo is null then raise exception 'Indica si el responsable está activo.';end if;
 if exists(select 1 from public.apertura_responsables where lower(btrim(nombre))=lower(v_nombre) and id is distinct from p_id) then raise exception 'Ya existe un responsable con ese nombre.';end if;
 if p_perfil is not null and exists(select 1 from public.apertura_responsables where perfil_id=p_perfil and id is distinct from p_id) then raise exception 'Ese usuario ya está ligado a otro responsable.';end if;
 if p_id is null then
  insert into public.apertura_responsables(nombre,perfil_id,externo,activo) values(v_nombre,p_perfil,p_externo,p_activo) returning id into v_id;
 else
  update public.apertura_responsables set nombre=v_nombre,perfil_id=p_perfil,externo=p_externo,activo=p_activo where id=p_id returning id into v_id;
  if v_id is null then raise exception 'El responsable no existe.';end if;
 end if;
 return v_id;
end $$;
revoke all on function public.guardar_responsable_apertura(uuid,text,uuid,boolean,boolean) from public,anon;
grant execute on function public.guardar_responsable_apertura(uuid,text,uuid,boolean,boolean) to authenticated;
-- </funciones-catalogo>

commit;
