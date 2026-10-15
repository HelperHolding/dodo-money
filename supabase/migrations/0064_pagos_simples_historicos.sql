begin;
set local lock_timeout='5s';
-- No depender de un UPDATE silencioso de cero filas por RLS: escritura solo por RPC.
revoke all on public.pagos,public.pago_aplicaciones from public,anon,authenticated;
grant select on public.pagos,public.pago_aplicaciones to authenticated;
alter table public.pagos drop constraint pagos_origen_fondos_check;
alter table public.pagos add constraint pagos_origen_fondos_check check(origen_fondos in ('transferencia','boveda','ventas','tarjeta','historico'));
alter table public.pagos add column origen_historico text,
 add column sucursal_historica_id uuid references public.sucursales(id),add column nota_regularizacion text;
alter table public.pagos add constraint pago_historico_respaldo check(
 (origen_fondos='historico' and origen_historico is not null and nota_regularizacion is not null and referencia is not null and origen_historico in ('boveda','ventas','transferencia','tarjeta') and length(trim(nota_regularizacion)) between 10 and 1000 and length(trim(referencia)) between 3 and 200 and comprobante_ruta is not null and sucursal_historica_id is not null)
 or (origen_fondos is distinct from 'historico' and origen_historico is null and sucursal_historica_id is null and nota_regularizacion is null));
create unique index pagos_historicos_referencia on public.pagos(proveedor_id,lower(trim(referencia))) where origen_fondos='historico' and anulado_en is null;

create function public.proteger_respaldo_pago_historico() returns trigger language plpgsql set search_path='' as $$
begin
 if old.origen_fondos='historico' and (new.origen_fondos,new.origen_historico,new.sucursal_historica_id,new.nota_regularizacion,new.referencia,new.fecha,new.monto,new.comprobante_ruta,new.solicitud_id,new.solicitud_datos) is distinct from (old.origen_fondos,old.origen_historico,old.sucursal_historica_id,old.nota_regularizacion,old.referencia,old.fecha,old.monto,old.comprobante_ruta,old.solicitud_id,old.solicitud_datos) then raise exception 'El respaldo histórico no se sobrescribe; anula con motivo.';end if;
 return new;
end $$;
create trigger proteger_respaldo_pago_historico before update on public.pagos for each row execute function public.proteger_respaldo_pago_historico();
revoke all on function public.proteger_respaldo_pago_historico() from public,anon,authenticated;

create function public.registrar_pago_simple(p_datos jsonb) returns uuid language plpgsql security definer set search_path='' as $$
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
  if not found or v_sucursal is null or v_factura.sucursal_id is distinct from v_sucursal then raise exception 'El documento debe corresponder a la sucursal original.';end if;
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
-- El fondo protegido es el autorizado, no todo el efectivo de apertura: el excedente
-- físicamente contado puede provenir de días anteriores y está disponible para gastos.
create or replace function public.disponibilidad_ventas(p_turno uuid) returns jsonb language plpgsql security definer set search_path=public as $$
declare t public.turnos;a public.arqueos;fondo numeric;retirado numeric;pagado numeric;pendiente numeric;saldo numeric;
begin
 select * into t from public.turnos where id=p_turno;
 if not found or not coalesce(public.ve_todas_las_sucursales() or t.sucursal_id=public.mi_sucursal(),false) then raise exception 'Turno sin acceso.';end if;
 select fondo_caja_venta into fondo from public.sucursales where id=t.sucursal_id;
 select * into a from public.arqueos where turno_id=t.id and anulado_en is null and recibido_en is not null and momento<>'cierre' order by creado_en desc,id desc limit 1;
 if not found or t.cerrado_en is not null then return jsonb_build_object('turno',t.id,'disponible',0,'arqueo',null);end if;
 fondo:=coalesce(fondo,0);
 select coalesce(sum(monto) filter(where estado='confirmado'),0),coalesce(sum(monto) filter(where estado='pendiente'),0) into retirado,pendiente from public.movimientos where turno_id=t.id and tipo='retiro_boveda';
 select coalesce(sum(importe),0) into pagado from public.pagos_ventas_eventos where turno_id=t.id;
 saldo:=a.total_contado-greatest(0,retirado-a.retiros_boveda)-(pagado-a.pagos_ventas)-pendiente;
 return jsonb_build_object('turno',t.id,'arqueo',a.id,'contado',a.total_contado,'fondo',fondo,'saldo',saldo,'disponible',greatest(0,saldo-fondo));
end $$;

commit;
