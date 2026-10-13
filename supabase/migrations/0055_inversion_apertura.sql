begin;
create table public.inversion_apertura_fuentes (
 id uuid primary key default gen_random_uuid(),sucursal_id uuid not null references public.sucursales(id),
 nombre text not null,sha256 text not null unique check(length(sha256)=64),fecha date not null,
 total numeric(16,2) not null check(total>=0),pagador_fuente text not null,datos jsonb not null,
 creado_en timestamptz not null default now()
);
create table public.inversion_apertura_vinculos (
 id uuid primary key default gen_random_uuid(),fuente_id uuid not null references public.inversion_apertura_fuentes(id),
 detalle_id text not null,proveedor_id uuid references public.proveedores(id),factura_id uuid references public.facturas(id),
 activo_id uuid references public.activos(id),motivo text not null check(length(trim(motivo)) between 5 and 2000),
 creado_por uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),
 check(num_nonnulls(proveedor_id,factura_id,activo_id)=1)
);
create unique index inversion_proveedor_unico on public.inversion_apertura_vinculos(fuente_id,detalle_id,proveedor_id) where proveedor_id is not null;
create unique index inversion_factura_unica on public.inversion_apertura_vinculos(fuente_id,detalle_id,factura_id) where factura_id is not null;
create unique index inversion_activo_unico on public.inversion_apertura_vinculos(fuente_id,detalle_id,activo_id) where activo_id is not null;
alter table public.inversion_apertura_fuentes enable row level security;
alter table public.inversion_apertura_vinculos enable row level security;
create policy inversion_consulta on public.inversion_apertura_fuentes for select using(public.ve_compras());
create policy inversion_vinculos_consulta on public.inversion_apertura_vinculos for select using(public.ve_compras());
revoke all on public.inversion_apertura_fuentes,public.inversion_apertura_vinculos from public,anon,authenticated;
grant select on public.inversion_apertura_fuentes,public.inversion_apertura_vinculos to authenticated;
create function public.vincular_inversion_apertura(p_fuente uuid,p_detalle text,p_tipo text,p_destino uuid,p_motivo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare f public.inversion_apertura_fuentes;r uuid;pr uuid;fa uuid;ac uuid;
begin
 if not public.edita_compras() then raise exception 'Solo administración puede vincular inversión.';end if;
 select * into f from public.inversion_apertura_fuentes where id=p_fuente;
 if not found or not exists(select 1 from jsonb_array_elements(f.datos->'detalles') e where e->>'id'=p_detalle) then raise exception 'Detalle inexistente.';end if;
 if length(trim(coalesce(p_motivo,''))) not between 5 and 2000 then raise exception 'Escribe el motivo del vínculo.';end if;
 if p_tipo='proveedor' then
  if not exists(select 1 from public.proveedores where id=p_destino) then raise exception 'Proveedor inexistente.';end if;pr:=p_destino;
 elsif p_tipo='factura' then
  if not exists(select 1 from public.facturas where id=p_destino and sucursal_id=f.sucursal_id) then raise exception 'Factura de otra sucursal.';end if;fa:=p_destino;
 elsif p_tipo='activo' then
  if not exists(select 1 from public.activos where id=p_destino and sucursal_id=f.sucursal_id) then raise exception 'Activo de otra sucursal.';end if;ac:=p_destino;
 else raise exception 'Tipo inválido.';end if;
 select id into r from public.inversion_apertura_vinculos where fuente_id=p_fuente and detalle_id=p_detalle and (proveedor_id=pr or factura_id=fa or activo_id=ac);
 if r is not null then return r;end if;
 insert into public.inversion_apertura_vinculos(fuente_id,detalle_id,proveedor_id,factura_id,activo_id,motivo,creado_por)
 values(p_fuente,p_detalle,pr,fa,ac,trim(p_motivo),auth.uid()) on conflict do nothing returning id into r;
 if r is null then select id into r from public.inversion_apertura_vinculos where fuente_id=p_fuente and detalle_id=p_detalle and (proveedor_id=pr or factura_id=fa or activo_id=ac);end if;
 return r;
end $$;
revoke all on function public.vincular_inversion_apertura(uuid,text,text,uuid,text) from public,anon;
grant execute on function public.vincular_inversion_apertura(uuid,text,text,uuid,text) to authenticated;
commit;
