-- Corrección administrativa de la orden completa. Requiere 0068.
begin;
set local lock_timeout='5s';
create table public.orden_sucursal_correcciones (
 id uuid primary key, orden_id uuid not null references public.ordenes_compra(id),
 sucursal_anterior uuid references public.sucursales(id), sucursal_nueva uuid references public.sucursales(id),
 motivo text not null check(length(trim(motivo)) between 5 and 1000),
 facturas uuid[] not null, recepciones jsonb not null,
 usuario_id uuid not null references public.perfiles(id), creado_en timestamptz not null default now()
);
alter table public.orden_sucursal_correcciones enable row level security;
create policy consultar_correcciones_orden on public.orden_sucursal_correcciones for select using(public.ve_compras());
revoke all on public.orden_sucursal_correcciones from public,anon,authenticated;
grant select on public.orden_sucursal_correcciones to authenticated;

create function public.corregir_sucursal_orden(p_solicitud uuid,p_orden uuid,p_anterior uuid,p_nueva uuid,p_motivo text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.ordenes_compra; previa public.orden_sucursal_correcciones; f public.facturas;
 ids uuid[]; respaldo jsonb; detalle text; anterior text; nueva text;
begin
 perform public.exigir_admin_compras();
 if p_solicitud is null or p_orden is null or coalesce(length(trim(p_motivo)),0) not between 5 and 1000 then raise exception 'Indica sucursal y un motivo de 5 a 1000 caracteres.';end if;
 perform pg_advisory_xact_lock(hashtextextended('corregir-sucursal-orden:'||p_solicitud::text,0));
 select * into previa from public.orden_sucursal_correcciones where id=p_solicitud;
 if found then
  if previa.orden_id<>p_orden or previa.sucursal_anterior is distinct from p_anterior or previa.sucursal_nueva is distinct from p_nueva or previa.motivo<>trim(p_motivo) or previa.usuario_id<>auth.uid() then raise exception 'La solicitud ya se utilizó con otros datos.';end if;
  return previa.id;
 end if;
 select * into o from public.ordenes_compra where id=p_orden for update;
 if not found or o.estado not in ('confirmada','cerrada') then raise exception 'Solo se corrigen órdenes confirmadas o cerradas.';end if;
 if o.sucursal_id is distinct from p_anterior then raise exception 'La sucursal cambió desde que abriste la orden. Recarga antes de corregir.';end if;
 if p_nueva is not distinct from o.sucursal_id then raise exception 'Elige una sucursal diferente.';end if;
 if p_nueva is not null and not exists(select 1 from public.sucursales where id=p_nueva) then raise exception 'La sucursal no existe.';end if;
 if not public.razon_admite_sucursal(o.rfc_receptor,p_nueva) then raise exception 'La razón social de la orden no corresponde a la sucursal elegida.';end if;
 -- Impide que una importación o una liga se modifique durante la validación y el traslado.
 lock table public.factura_ordenes,public.orden_renglones,public.recepciones_dodo,public.recepciones_app in share row exclusive mode;
 if exists(select 1 from public.recepciones_dodo d join public.orden_renglones r on r.id=d.orden_renglon_id where r.orden_id=o.id)
 or exists(select 1 from public.recepciones_app a join public.orden_renglones r on r.id=a.orden_renglon_id where r.orden_id=o.id and a.conciliada_en is not null) then
  raise exception 'La orden tiene recepciones importadas o conciliadas con Dodo IS. Revisa su vínculo de origen antes de cambiar la sucursal.';
 end if;
 select coalesce(array_agg(x.factura_id order by x.factura_id),'{}'::uuid[]) into ids from public.factura_ordenes x join public.facturas t on t.id=x.factura_id where x.orden_id=o.id and t.estado<>'cancelada';
 for f in select * from public.facturas where id=any(ids) order by id for update loop
  if exists(select 1 from public.factura_ordenes x where x.factura_id=f.id and x.orden_id<>o.id) then raise exception 'Una factura está compartida con otra orden. Revisa sus vínculos antes de corregir.';end if;
  if exists(select 1 from public.pago_aplicaciones a join public.pagos p on p.id=a.pago_id where a.factura_id=f.id and p.anulado_en is null)
  or exists(select 1 from public.reservas_boveda b where b.factura_id=f.id and b.anulado_en is null) then raise exception 'Una factura tiene pagos o reservas vigentes. Revisa su origen antes de cambiar la sucursal.';end if;
  if exists(select 1 from public.factura_recepciones r where r.factura_id=f.id and r.anulada_en is null)
  or f.sustituido_por is not null or exists(select 1 from public.facturas x where x.sustituido_por=f.id or (f.uuid is not null and x.uuid_relacionado=f.uuid) or (f.uuid_relacionado is not null and x.uuid=f.uuid_relacionado))
  or exists(select 1 from public.complemento_facturas c where c.factura_uuid=f.uuid) then raise exception 'Una factura tiene recepción directa, sustitución o CFDI relacionado. Revisa esos vínculos antes de corregir.';end if;
  if not public.razon_admite_sucursal(f.rfc_receptor,p_nueva) then raise exception 'La razón social de una factura no corresponde a la sucursal elegida.';end if;
 end loop;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) into respaldo from public.recepciones_app a join public.orden_renglones r on r.id=a.orden_renglon_id where r.orden_id=o.id;
 select nombre into anterior from public.sucursales where id=o.sucursal_id;
 select nombre into nueva from public.sucursales where id=p_nueva;
 detalle:=coalesce(anterior,'Oficina')||' → '||coalesce(nueva,'Oficina')||'. Motivo: '||trim(p_motivo)||'. Se conservan cantidades y fechas de recepción.';
 update public.ordenes_compra set sucursal_id=p_nueva where id=o.id;
 update public.facturas set sucursal_id=p_nueva where id=any(ids);
 insert into public.orden_sucursal_correcciones(id,orden_id,sucursal_anterior,sucursal_nueva,motivo,facturas,recepciones,usuario_id)
 values(p_solicitud,o.id,o.sucursal_id,p_nueva,trim(p_motivo),ids,respaldo,auth.uid());
 insert into public.orden_historial(orden_id,evento,nota,usuario) values(o.id,'Sucursal corregida',detalle,auth.uid());
 insert into public.compra_notas(factura_id,texto,usuario_id) select unnest(ids),'Sucursal corregida junto con la orden '||o.folio||': '||detalle,auth.uid();
 return p_solicitud;
end $$;
revoke all on function public.corregir_sucursal_orden(uuid,uuid,uuid,uuid,text) from public,anon;
grant execute on function public.corregir_sucursal_orden(uuid,uuid,uuid,uuid,text) to authenticated;
commit;
