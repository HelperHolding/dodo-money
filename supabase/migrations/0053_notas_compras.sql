begin;
create table public.compra_notas (
 id uuid primary key default gen_random_uuid(),
 factura_id uuid references public.facturas(id),orden_id uuid references public.ordenes_compra(id),
 texto text not null check(length(trim(texto)) between 5 and 2000),
 usuario_id uuid not null default auth.uid() references public.perfiles(id),
 creado_en timestamptz not null default now(),
 check(num_nonnulls(factura_id,orden_id)=1)
);
create index compra_notas_factura on public.compra_notas(factura_id,creado_en);
create index compra_notas_orden on public.compra_notas(orden_id,creado_en);
alter table public.compra_notas enable row level security;
create policy consultar_compra_notas on public.compra_notas for select using(public.ve_compras());
revoke all on public.compra_notas from public,anon,authenticated;
grant select on public.compra_notas to authenticated;
create function public.agregar_compra_nota(p_solicitud uuid,p_tipo text,p_id uuid,p_texto text) returns uuid
language plpgsql security definer set search_path=public as $$
declare previa public.compra_notas;
begin
 perform public.exigir_admin_compras();
 if p_solicitud is null or p_tipo is null or p_tipo not in ('factura','orden') or p_id is null then raise exception 'Revisa el documento de la nota.';end if;
 if length(trim(coalesce(p_texto,''))) not between 5 and 2000 then raise exception 'Escribe una nota de 5 a 2000 caracteres.';end if;
 perform pg_advisory_xact_lock(hashtextextended('compra-nota:'||p_solicitud::text,0));
 select * into previa from public.compra_notas where id=p_solicitud;
 if found then
  if previa.usuario_id<>auth.uid() or previa.texto<>trim(p_texto) or (p_tipo='factura' and previa.factura_id is distinct from p_id) or (p_tipo='orden' and previa.orden_id is distinct from p_id) then raise exception 'La solicitud de nota ya fue utilizada.';end if;
  return previa.id;
 end if;
 if p_tipo='factura' and not exists(select 1 from public.facturas where id=p_id) then raise exception 'No existe la factura.';end if;
 if p_tipo='orden' and not exists(select 1 from public.ordenes_compra where id=p_id) then raise exception 'No existe la orden.';end if;
 insert into public.compra_notas(id,factura_id,orden_id,texto) values(p_solicitud,case when p_tipo='factura' then p_id end,case when p_tipo='orden' then p_id end,trim(p_texto));
 return p_solicitud;
end $$;
revoke all on function public.agregar_compra_nota(uuid,text,uuid,text) from public,anon;
grant execute on function public.agregar_compra_nota(uuid,text,uuid,text) to authenticated;
commit;
