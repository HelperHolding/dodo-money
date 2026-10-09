begin;
set local lock_timeout='5s';
create table public.factura_cancelaciones (
 factura_id uuid primary key references public.facturas(id),
 motivo text not null check(length(trim(motivo)) between 5 and 1000),
 anterior jsonb not null, ordenes uuid[] not null,
 usuario_id uuid not null default auth.uid() references public.perfiles(id),
 creado_en timestamptz not null default now()
);
alter table public.factura_cancelaciones enable row level security;
create policy consulta_cancelacion on public.factura_cancelaciones for select using(public.ve_compras());
revoke all on public.factura_cancelaciones from public,anon,authenticated;
grant select on public.factura_cancelaciones to authenticated;
create or replace function public.cancelar_factura(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
declare f public.facturas;v_ordenes uuid[];
begin
 perform public.exigir_admin_compras();
 if length(trim(coalesce(p_motivo,''))) not between 5 and 1000 then raise exception 'Explica el motivo de la cancelación (5 a 1000 caracteres).';end if;
 select * into f from public.facturas where id=p_id for update;
 if not found or f.estado='cancelada' then raise exception 'La factura no existe o ya estaba cancelada.';end if;
 if public.pagado_factura(p_id)>0 then raise exception 'La factura tiene pagos: anúlalos antes de cancelarla.';end if;
 -- No se adquiere el bloqueo de caja después del de factura: las reservas bloquean caja primero.
 if exists(select 1 from public.reservas_boveda where factura_id=p_id and anulado_en is null) then raise exception 'Cancela primero las reservas de bóveda de esta factura para liberar el efectivo.';end if;
 select coalesce(array_agg(orden_id order by orden_id),'{}'::uuid[]) into v_ordenes from public.factura_ordenes where factura_id=p_id;
 insert into public.factura_cancelaciones(factura_id,motivo,anterior,ordenes) values(p_id,trim(p_motivo),to_jsonb(f),v_ordenes);
 if f.pago_programado_el is not null or f.pago_programado_forma is not null then
  insert into public.factura_programacion_historial(factura_id,tipo,fecha_anterior,forma_anterior) values(p_id,'pago',f.pago_programado_el,f.pago_programado_forma);
 end if;
 if f.recepcion_programada_el is not null then
  insert into public.factura_programacion_historial(factura_id,tipo,fecha_anterior) values(p_id,'recepcion',f.recepcion_programada_el);
 end if;
 update public.facturas set estado='cancelada',motivo_cancelacion=trim(p_motivo),cancelada_por=auth.uid(),cancelada_en=now(),pago_programado_el=null,pago_programado_forma=null,recepcion_programada_el=null where id=p_id;
 delete from public.factura_ordenes where factura_id=p_id;
 perform public.reabrir_ordenes_incompletas(v_ordenes);
end $$;
revoke all on function public.cancelar_factura(uuid,text) from public,anon;
grant execute on function public.cancelar_factura(uuid,text) to authenticated;
commit;
