begin;
create table public.proveedor_contactos (
 id uuid primary key default gen_random_uuid(),
 proveedor_id uuid not null references public.proveedores(id),
 nombre text not null check(length(trim(nombre)) between 1 and 200),
 puesto text check(length(puesto)<=200),
 telefono text check(length(telefono)<=100),
 correo text check(length(correo)<=254 and correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
 activo boolean not null default true,
 creado_por uuid not null references public.perfiles(id),
 creado_en timestamptz not null default now(),
 actualizado_por uuid not null references public.perfiles(id),
 actualizado_en timestamptz not null default now(),
 check(nullif(trim(telefono),'') is not null or correo is not null)
);
create index proveedor_contactos_proveedor on public.proveedor_contactos(proveedor_id);
alter table public.proveedor_contactos enable row level security;
create policy contactos_consulta on public.proveedor_contactos for select using(public.ve_compras());
revoke all on public.proveedor_contactos from public,anon,authenticated;
grant select on public.proveedor_contactos to authenticated;
create function public.guardar_contacto_proveedor(p_proveedor uuid,p_id uuid,p_nombre text,p_puesto text,p_telefono text,p_correo text,p_activo boolean default true) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede gestionar contactos.';end if;
 if p_activo is null then raise exception 'Estado inválido.';end if;
 perform 1 from public.proveedores where id=p_proveedor for update;
 if not found then raise exception 'El proveedor no existe.';end if;
 if p_id is null then
  insert into public.proveedor_contactos(proveedor_id,nombre,puesto,telefono,correo,activo,creado_por,actualizado_por)
  values(p_proveedor,trim(p_nombre),nullif(trim(p_puesto),''),nullif(trim(p_telefono),''),nullif(trim(p_correo),''),p_activo,auth.uid(),auth.uid()) returning id into v_id;
 else
  update public.proveedor_contactos set nombre=trim(p_nombre),puesto=nullif(trim(p_puesto),''),telefono=nullif(trim(p_telefono),''),correo=nullif(trim(p_correo),''),activo=p_activo,actualizado_por=auth.uid(),actualizado_en=now()
  where id=p_id and proveedor_id=p_proveedor returning id into v_id;
  if not found then raise exception 'El contacto no pertenece a este proveedor.';end if;
 end if;
 return v_id;
end $$;
revoke all on function public.guardar_contacto_proveedor(uuid,uuid,text,text,text,text,boolean) from public,anon;
grant execute on function public.guardar_contacto_proveedor(uuid,uuid,text,text,text,text,boolean) to authenticated;
commit;
