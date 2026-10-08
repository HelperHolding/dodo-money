-- Parche para una instalación que ya ejecutó 0042. Solo reemplaza la función.
begin;
create or replace function public.registrar_pago_con_origen(p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.reservas_boveda; d jsonb; v uuid; monto numeric; v_fecha date; op date; solicitud uuid; previo public.pagos;
begin
 perform public.exigir_admin_compras();
 solicitud:=nullif(p_datos->>'solicitud','')::uuid;
 if solicitud is null then raise exception 'Falta el identificador de la solicitud de pago.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pago-origen:'||solicitud::text,0));
 select * into previo from public.pagos where solicitud_id=solicitud;
 if found then
  if previo.solicitud_datos is distinct from p_datos then raise exception 'Esta solicitud ya registró otro pago. Recarga el formulario.';end if;
  return previo.id;
 end if;
 if p_datos->>'origen' is null or p_datos->>'origen' not in ('transferencia','boveda') then raise exception 'Elige transferencia o bóveda.';end if;
 monto:=(p_datos->>'monto')::numeric;v_fecha:=(p_datos->>'fecha')::date;
 if monto is null or monto<=0 or monto>=1e10 or monto<>round(monto,2) then raise exception 'Monto de pago inválido.';end if;
 if p_datos->>'origen'='transferencia' then
  if length(trim(coalesce(p_datos->>'cuenta','')))<2 then raise exception 'Especifica la cuenta de transferencia.';end if;
  if nullif(p_datos->>'reserva','') is not null then raise exception 'Una transferencia no usa reserva de bóveda.';end if;
 else
  select * into r from public.reservas_boveda where id=nullif(p_datos->>'reserva','')::uuid;
  if not found then raise exception 'Elige una reserva de bóveda.';end if;
  perform 1 from public.cajas where sucursal_id=r.sucursal_id and tipo='boveda' for update;
  select * into r from public.reservas_boveda where id=r.id for update;
  if r.anulado_en is not null then raise exception 'La reserva está cancelada.';end if;
  if v_fecha is distinct from public.hoy_mx() then raise exception 'El pago de bóveda se registra hoy, cuando sale el efectivo.';end if;
  op:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;
  if exists(select 1 from public.cierres_dia c where c.sucursal_id=r.sucursal_id and c.fecha=op) then raise exception 'El día operativo está cerrado; registra el pago al iniciar el siguiente.';end if;
  if jsonb_array_length(p_datos->'aplicaciones')<>1 or (p_datos->'aplicaciones'->0->>'factura_id')::uuid is distinct from r.factura_id then raise exception 'La reserva paga solo su factura.';end if;
  if monto>(select pendiente from public.reservas_boveda_saldo where id=r.id) then raise exception 'El pago excede lo pendiente de la reserva.';end if;
  d:=public.disponibilidad_boveda(r.sucursal_id);
  if (d->>'saldo')::numeric-monto<(d->>'fondo')::numeric+(d->>'salidas')::numeric+(d->>'reservado')::numeric-monto then raise exception 'La bóveda ya no cubre su fondo y los compromisos.';end if;
 end if;
 v:=public.registrar_pago((p_datos->>'proveedor')::uuid,v_fecha,monto,
 case when p_datos->>'origen'='boveda' then 'efectivo' else 'transferencia' end,
 case when p_datos->>'origen'='boveda' then 'Bóveda' else p_datos->>'cuenta' end,
 p_datos->>'referencia',p_datos->>'comprobante',p_datos->'aplicaciones',p_datos->>'motivo');
 update public.pagos set origen_fondos=p_datos->>'origen',solicitud_id=solicitud,solicitud_datos=p_datos,reserva_boveda_id=case when r.id is not null then r.id end where id=v;
 if r.id is not null then
  insert into public.pagos_boveda_eventos(pago_id,sucursal_id,tipo,importe,fecha_operativa) values(v,r.sucursal_id,'pago',monto,op);
 end if;
 return v;
end $$;
revoke all on function public.registrar_pago_con_origen(jsonb) from public,anon;
grant execute on function public.registrar_pago_con_origen(jsonb) to authenticated;
commit;
