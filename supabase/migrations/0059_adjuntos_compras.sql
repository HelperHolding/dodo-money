begin;
set local lock_timeout='5s';
create table public.compra_adjuntos (
 id uuid primary key,orden_id uuid references public.ordenes_compra(id),factura_id uuid references public.facturas(id),
 nombre text not null check(length(nombre) between 1 and 200),descripcion text not null default '' check(length(descripcion)<=500),
 ruta text not null unique,mime text not null,bytes integer not null check(bytes between 1 and 4194304),sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now(),confirmado_en timestamptz,
 check(num_nonnulls(orden_id,factura_id)=1)
);
create index compra_adjuntos_orden on public.compra_adjuntos(orden_id,creado_en);
create index compra_adjuntos_factura on public.compra_adjuntos(factura_id,creado_en);
alter table public.compra_adjuntos enable row level security;
revoke all on public.compra_adjuntos from public,anon,authenticated;
grant select on public.compra_adjuntos to authenticated;
create policy compra_adjuntos_consulta on public.compra_adjuntos for select to authenticated using(public.ve_compras() and (confirmado_en is not null or usuario_id=auth.uid() and public.edita_compras()));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('adjuntos-compras','adjuntos-compras',false,4194304,array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy adjuntos_compras_lectura on storage.objects for select to authenticated using(bucket_id='adjuntos-compras' and exists(select 1 from public.compra_adjuntos a where a.ruta=name));
create policy adjuntos_compras_subir on storage.objects for insert to authenticated with check(bucket_id='adjuntos-compras' and public.edita_compras() and exists(select 1 from public.compra_adjuntos a where a.ruta=name and a.usuario_id=auth.uid() and a.confirmado_en is null and a.creado_en>now()-interval '1 day'));
-- No UPDATE ni DELETE en storage o tabla: cada documento es una nueva versión/adjunto.
create function public.preparar_adjunto_compra(p_id uuid,p_tipo text,p_documento uuid,p_nombre text,p_extension text,p_mime text,p_bytes integer,p_sha256 text,p_descripcion text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v public.compra_adjuntos; ruta_nueva text; mime_esperado text;
begin
 perform public.exigir_admin_compras();
 if p_id is null or p_documento is null or p_tipo is null or p_tipo not in ('orden','factura') then raise exception 'Documento inválido.';end if;
 if p_nombre is null or length(trim(p_nombre)) not between 1 and 200 or p_nombre~'[[:cntrl:]/\\]' or p_bytes is null or p_bytes not between 1 and 4194304 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' or p_descripcion is null or length(p_descripcion)>500 then raise exception 'Datos de archivo inválidos.';end if;
 mime_esperado := case p_extension
  when 'pdf' then 'application/pdf'
  when 'jpg' then 'image/jpeg'
  when 'png' then 'image/png'
  when 'webp' then 'image/webp'
  when 'xlsx' then 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  when 'docx' then 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  else null
 end;
 if mime_esperado is null or p_mime is distinct from mime_esperado then
  raise exception 'Formato inválido.';
 end if;
 if p_tipo='orden' and not exists(select 1 from public.ordenes_compra where id=p_documento) then raise exception 'Orden no encontrada.';end if;
 if p_tipo='factura' and not exists(select 1 from public.facturas where id=p_documento) then raise exception 'Factura no encontrada.';end if;
 perform pg_advisory_xact_lock(hashtextextended('adjunto-compra:'||p_id::text,0));
 select * into v from public.compra_adjuntos where id=p_id;
 ruta_nueva:=p_tipo||'/'||p_documento::text||'/'||p_id::text||'.'||p_extension;
 if found then
  if v.usuario_id<>auth.uid() or v.ruta<>ruta_nueva or v.nombre<>trim(p_nombre) or v.sha256<>p_sha256 or v.bytes<>p_bytes or v.mime<>p_mime or v.descripcion<>trim(p_descripcion) then raise exception 'Esta solicitud ya corresponde a otro archivo.';end if;
 else
  insert into public.compra_adjuntos(id,orden_id,factura_id,nombre,descripcion,ruta,mime,bytes,sha256,usuario_id) values(p_id,case when p_tipo='orden' then p_documento end,case when p_tipo='factura' then p_documento end,trim(p_nombre),trim(p_descripcion),ruta_nueva,p_mime,p_bytes,p_sha256,auth.uid()) returning * into v;
 end if;
 return jsonb_build_object('ruta',v.ruta,'disponible',v.confirmado_en is not null);
end $$;
create function public.confirmar_adjunto_compra(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.compra_adjuntos;
begin
 perform public.exigir_admin_compras();
 select * into v from public.compra_adjuntos where id=p_id for update;
 if not found or v.usuario_id<>auth.uid() then raise exception 'Adjunto no encontrado.';end if;
 if v.confirmado_en is not null then return;end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='adjuntos-compras' and o.name=v.ruta and (o.metadata->>'size')::bigint=v.bytes and o.metadata->>'mimetype'=v.mime) then raise exception 'El archivo no está subido o no coincide con la reserva.';end if;
 update public.compra_adjuntos set confirmado_en=now() where id=p_id;
 insert into public.compra_notas(orden_id,factura_id,texto,usuario_id) values(v.orden_id,v.factura_id,'Documento adjunto: '||v.nombre||case when v.descripcion<>'' then ' — '||v.descripcion else '' end,auth.uid());
end $$;
revoke all on function public.preparar_adjunto_compra(uuid,text,uuid,text,text,text,integer,text,text),public.confirmar_adjunto_compra(uuid) from public,anon;
grant execute on function public.preparar_adjunto_compra(uuid,text,uuid,text,text,text,integer,text,text),public.confirmar_adjunto_compra(uuid) to authenticated;
commit;
