begin;
create extension if not exists supabase_vault with schema vault;
-- Vault no se expone a clientes: las únicas lecturas de contraseña pasan por el RPC admin.
revoke all on schema vault from public, anon, authenticated;
revoke all on all tables in schema vault from public, anon, authenticated;
revoke all on all functions in schema vault from public, anon, authenticated;
-- El propietario de los RPC conserva acceso incluso si la extensión tiene otro propietario.
grant usage on schema vault to current_user;
grant select,insert,update,delete on all tables in schema vault to current_user;
grant execute on all functions in schema vault to current_user;

create table public.proveedor_portales (
 proveedor_id uuid primary key references public.proveedores(id),
 url text not null check(length(url)<=2000 and url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'),
 usuario text not null check(length(trim(usuario)) between 1 and 200),
 notas text check(length(notas)<=2000),
 secreto_id uuid references vault.secrets(id),
 tiene_password boolean generated always as (secreto_id is not null) stored,
 actualizado_por uuid not null references public.perfiles(id),
 actualizado_en timestamptz not null default now()
);
create table public.proveedor_portales_historial (
 id uuid primary key default gen_random_uuid(), proveedor_id uuid not null references public.proveedores(id),
 accion text not null check(accion in ('guardar','revelar')), usuario_id uuid not null references public.perfiles(id), fecha timestamptz not null default now()
);
alter table public.proveedor_portales enable row level security;
alter table public.proveedor_portales_historial enable row level security;
create policy portal_admin on public.proveedor_portales for select using(public.edita_compras());
create policy portal_historial_admin on public.proveedor_portales_historial for select using(public.edita_compras());
revoke all on public.proveedor_portales, public.proveedor_portales_historial from public, anon, authenticated;
grant select(proveedor_id,url,usuario,notas,tiene_password,actualizado_por,actualizado_en) on public.proveedor_portales to authenticated;
grant select on public.proveedor_portales_historial to authenticated;

create function public.guardar_portal_proveedor(p_proveedor uuid,p_url text,p_usuario text,p_password text,p_notas text,p_quitar_password boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare secreto uuid;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede gestionar accesos de portal.';end if;
 if p_url is null or length(p_url)>2000 or p_url !~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
 or p_usuario is null or length(trim(p_usuario)) not between 1 and 200
 or length(p_password)>1000 or length(p_notas)>2000 or (p_quitar_password and coalesce(p_password,'')<>'') then
 raise exception 'Datos del portal inválidos.';end if;
 -- Serializa alta/cambio del mismo proveedor para no generar secretos huérfanos.
 perform 1 from public.proveedores where id=p_proveedor for update;
 if not found then raise exception 'El proveedor no existe.';end if;
 select secreto_id into secreto from public.proveedor_portales where proveedor_id=p_proveedor;
 if coalesce(p_quitar_password,false) then
   update public.proveedor_portales set secreto_id=null where proveedor_id=p_proveedor;
   delete from vault.secrets where id=secreto;secreto:=null;
 elsif coalesce(p_password,'')<>'' then
   if secreto is null then secreto:=vault.create_secret(p_password);
   else perform vault.update_secret(secreto,p_password);end if;
 end if;
 insert into public.proveedor_portales(proveedor_id,url,usuario,notas,secreto_id,actualizado_por)
 values(p_proveedor,trim(p_url),trim(p_usuario),nullif(trim(p_notas),''),secreto,auth.uid())
 on conflict(proveedor_id) do update set url=excluded.url,usuario=excluded.usuario,notas=excluded.notas,
 secreto_id=excluded.secreto_id,actualizado_por=excluded.actualizado_por,actualizado_en=now();
 insert into public.proveedor_portales_historial(proveedor_id,accion,usuario_id) values(p_proveedor,'guardar',auth.uid());
end $$;
create function public.revelar_portal_proveedor(p_proveedor uuid) returns text
language plpgsql security definer set search_path='' as $$
declare resultado text;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede consultar contraseñas.';end if;
 select s.decrypted_secret into resultado from public.proveedor_portales p join vault.decrypted_secrets s on s.id=p.secreto_id where p.proveedor_id=p_proveedor;
 if resultado is null then raise exception 'No hay contraseña guardada.';end if;
 insert into public.proveedor_portales_historial(proveedor_id,accion,usuario_id) values(p_proveedor,'revelar',auth.uid());
 return resultado;
end $$;
revoke all on function public.guardar_portal_proveedor(uuid,text,text,text,text,boolean),public.revelar_portal_proveedor(uuid) from public,anon;
grant execute on function public.guardar_portal_proveedor(uuid,text,text,text,text,boolean),public.revelar_portal_proveedor(uuid) to authenticated;
commit;
