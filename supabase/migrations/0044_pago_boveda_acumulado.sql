begin;
alter table public.pagos add column nota_boveda text check(nota_boveda is null or length(trim(nota_boveda)) between 5 and 1000);
-- Reserva y pago atómicos: no obliga a salir del formulario ni deja reserva si falla el pago.
create function public.registrar_pago_boveda_acumulado(p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare solicitud uuid; previo public.pagos; reserva uuid; pago uuid; factura uuid; monto numeric; s uuid;
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
 if p_datos->>'origen' is distinct from 'boveda_acumulado' then raise exception 'Elige efectivo acumulado en bóveda.';end if;
 if length(trim(coalesce(p_datos->>'nota',''))) not between 5 and 1000 then raise exception 'Especifica el motivo del uso del efectivo (5 a 1000 caracteres).';end if;
 if nullif(trim(p_datos->>'comprobante'),'') is null then raise exception 'Adjunta el ticket o comprobante del pago.';end if;
 if jsonb_typeof(p_datos->'aplicaciones') is distinct from 'array' then raise exception 'Elige una factura para el pago en efectivo.';end if;
 if jsonb_array_length(p_datos->'aplicaciones')<>1 then raise exception 'El pago en efectivo acumulado aplica a una factura.';end if;
 factura:=(p_datos->'aplicaciones'->0->>'factura_id')::uuid;
 s:=nullif(p_datos->>'sucursal','')::uuid;
 if s is null then raise exception 'Elige la sucursal de la bóveda.';end if;
 monto:=(p_datos->>'monto')::numeric;
 -- Reutiliza autorización, bloqueo de caja, fondo protegido, compromisos y sucursal de factura.
 reserva:=public.reservar_boveda(s,factura,monto,public.hoy_mx(),trim(p_datos->>'nota'));
 pago:=public.registrar_pago_con_origen(p_datos||jsonb_build_object('origen','boveda','reserva',reserva));
 update public.pagos set nota_boveda=trim(p_datos->>'nota'),solicitud_datos=p_datos where id=pago;
 return pago;
end $$;
revoke all on function public.registrar_pago_boveda_acumulado(jsonb) from public,anon;
grant execute on function public.registrar_pago_boveda_acumulado(jsonb) to authenticated;
commit;
