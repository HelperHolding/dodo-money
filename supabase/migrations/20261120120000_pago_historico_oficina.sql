-- Pago histórico («Cuadrado en corte correspondiente, informativo») de un documento de Oficina central.
-- El efectivo salió de la bóveda o la caja de una sucursal en un corte anterior, pero el gasto es de Oficina.
-- Antes se exigía que el documento fuera de la misma sucursal y uno sin sucursal nunca coincidía.
-- Ahora un documento sin sucursal acepta cualquier sucursal de origen; uno con sucursal sigue exigiendo la suya.
-- No mueve saldos: el histórico solo aplica el pago al documento.
begin;
set local lock_timeout='5s';
create or replace function public.registrar_pago_simple(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare v_solicitud uuid;v_previo public.pagos;v_pago uuid;v_origen text;v_fecha date;v_monto numeric;v_factura public.facturas;v_forma text;v_sucursal uuid;v_item record;
begin
 perform public.exigir_admin_compras();
 if coalesce(p_datos->>'historico','false') not in ('true','false') then raise exception 'Tipo de registro inválido.';end if;
 if coalesce(p_datos->>'historico','false')='false' and p_datos->>'origen'<>'tarjeta' then
  if p_datos->>'origen'='ventas' then return public.registrar_pago_ventas(p_datos);
  elsif p_datos->>'origen'='boveda_acumulado' then return public.registrar_pago_boveda_acumulado(p_datos);
  else return public.registrar_pago_con_origen(p_datos);end if;
 end if;
 v_solicitud:=nullif(p_datos->>'solicitud','')::uuid;
 if v_solicitud is null then raise exception 'Falta solicitud de pago.';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pago-origen:'||v_solicitud::text,0));
 select * into v_previo from public.pagos where solicitud_id=v_solicitud;
 if found then if v_previo.solicitud_datos is distinct from p_datos then raise exception 'Esta solicitud ya corresponde a otro pago.';end if;return v_previo.id;end if;
 v_monto:=(p_datos->>'monto')::numeric;v_fecha:=(p_datos->>'fecha')::date;
 if v_monto is null or v_monto<=0 or v_monto>=1e10 or v_monto<>round(v_monto,2) then raise exception 'Monto inválido.';end if;
 if v_fecha is null or v_fecha>public.hoy_mx() then raise exception 'Fecha inválida.';end if;
 if jsonb_typeof(p_datos->'aplicaciones') is distinct from 'array' or jsonb_array_length(p_datos->'aplicaciones')=0 then raise exception 'Elige el documento a pagar.';end if;
 if coalesce(p_datos->>'reserva','')<>'' then raise exception 'Este registro no utiliza reservas de bóveda.';end if;
 v_origen:=p_datos->>'origen';
 if p_datos->>'historico'='true' then
  if v_fecha>=public.hoy_mx() then raise exception 'El registro histórico necesita una fecha anterior a hoy.';end if;
  if v_origen not in ('boveda_acumulado','ventas','transferencia','tarjeta') or v_origen is null then raise exception 'Especifica el origen original.';end if;
  if p_datos->>'confirmado' is distinct from 'si' then raise exception 'Confirma que el dinero ya fue descontado y no se debe mover otra vez.';end if;
  if length(trim(coalesce(p_datos->>'nota',''))) not between 10 and 1000 or nullif(trim(p_datos->>'comprobante'),'') is null or length(trim(coalesce(p_datos->>'referencia',''))) not between 3 and 200 then raise exception 'El histórico necesita motivo, comprobante y referencia original.';end if;
  if jsonb_array_length(p_datos->'aplicaciones')<>1 then raise exception 'Regulariza un documento por registro.';end if;
  v_sucursal:=nullif(p_datos->>'sucursal_historica','')::uuid;
  select * into v_factura from public.facturas where id=(p_datos->'aplicaciones'->0->>'factura_id')::uuid for update;
  -- Un documento de Oficina central (sin sucursal) acepta el efectivo de cualquier sucursal; uno con sucursal exige la suya.
  if not found or v_sucursal is null or (v_factura.sucursal_id is not null and v_factura.sucursal_id<>v_sucursal) then raise exception 'El documento debe corresponder a la sucursal original.';end if;
  if exists(select 1 from public.reservas_boveda_saldo where factura_id=v_factura.id and anulado_en is null and pendiente>0) then raise exception 'Libera la reserva pendiente antes de regularizar el pago histórico.';end if;
  if exists(select 1 from public.pagos where proveedor_id=(p_datos->>'proveedor')::uuid and origen_fondos='historico' and anulado_en is null and lower(trim(referencia))=lower(trim(p_datos->>'referencia'))) then raise exception 'Ya existe un histórico con esa referencia para este proveedor.';end if;
 else
  if v_origen is distinct from 'tarjeta' or length(trim(coalesce(p_datos->>'cuenta','')))<2 then raise exception 'Especifica la tarjeta utilizada.';end if;
  for v_item in select x.factura_id from jsonb_to_recordset(p_datos->'aplicaciones') x(factura_id uuid,monto numeric) order by x.factura_id loop
   perform 1 from public.facturas where id=v_item.factura_id for update;
   if exists(select 1 from public.reservas_boveda_saldo where factura_id=v_item.factura_id and anulado_en is null and pendiente>0) then raise exception 'Libera la reserva de efectivo antes de pagar con tarjeta.';end if;
  end loop;
 end if;
 v_forma:=case when v_origen in ('boveda_acumulado','ventas') then 'efectivo' else v_origen end;
 v_pago:=public.registrar_pago((p_datos->>'proveedor')::uuid,v_fecha,v_monto,v_forma,case when v_origen='boveda_acumulado' then 'Bóveda · ya descontado' when v_origen='ventas' then 'Caja de ventas · ya descontado' else p_datos->>'cuenta' end,p_datos->>'referencia',p_datos->>'comprobante',p_datos->'aplicaciones',case when p_datos->>'historico'='true' then trim(p_datos->>'nota') else p_datos->>'motivo' end);
 update public.pagos set origen_fondos=case when p_datos->>'historico'='true' then 'historico' else 'tarjeta' end,
  origen_historico=case when p_datos->>'historico'='true' then case when v_origen='boveda_acumulado' then 'boveda' else v_origen end end,
  sucursal_historica_id=v_sucursal,nota_regularizacion=case when p_datos->>'historico'='true' then trim(p_datos->>'nota') end,solicitud_id=v_solicitud,solicitud_datos=p_datos where id=v_pago;
 return v_pago;
end $$;
revoke all on function public.registrar_pago_simple(jsonb) from public,anon;
grant execute on function public.registrar_pago_simple(jsonb) to authenticated;
commit;
