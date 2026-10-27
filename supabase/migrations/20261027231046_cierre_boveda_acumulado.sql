begin;
-- Una sola definición para la vista previa y los cierres NUEVOS. No actualiza filas.
create function public.datos_boveda_cierre(p_sucursal uuid,p_fecha date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare anterior public.cierres_dia; b public.cajas; desde timestamptz; hasta timestamptz;
 ingresos numeric; fondos numeric; salidas numeric; gastos numeric; pendientes integer;
begin
 if auth.uid() is null or not coalesce(public.ve_todas_las_sucursales() or p_sucursal=public.mi_sucursal(),false) then
  raise exception 'Sucursal sin acceso.';
 end if;
 if p_fecha is null then raise exception 'Falta la fecha del cierre.';end if;
 select * into anterior from public.cierres_dia where sucursal_id=p_sucursal and fecha<p_fecha order by fecha desc limit 1;
 select * into b from public.cajas where sucursal_id=p_sucursal and tipo='boveda';
 if b.id is null then raise exception 'Falta la caja de bóveda.';end if;
 -- El instante del conteo evita volver a sumar entradas incluidas en él; incluye
 -- confirmaciones tardías y correcciones registradas después, aunque su fecha sea anterior.
 desde:=anterior.cerrado_en;
 hasta:=least(now(),(p_fecha::timestamp+interval '1 day 4 hours') at time zone 'America/Mexico_City');
 select coalesce(sum(monto) filter(where estado='confirmado' and caja_destino_id=b.id),0),
 coalesce(sum(monto) filter(where estado='confirmado' and caja_origen_id=b.id and tipo<>'salida_corporativo'),0),
 coalesce(sum(monto) filter(where estado='confirmado' and caja_origen_id=b.id and tipo='salida_corporativo'),0),
 0
 into ingresos,fondos,salidas,pendientes from public.movimientos
 where sucursal_id=p_sucursal and tipo<>'cambio_morralla'
 and (caja_origen_id=b.id or caja_destino_id=b.id)
 and (desde is null or coalesce(confirmado_en,creado_en)>desde)
 and coalesce(confirmado_en,creado_en)<=hasta;
 select count(*) into pendientes from public.movimientos
 where sucursal_id=p_sucursal and estado='pendiente'
 and (desde is null or creado_en>desde) and creado_en<=hasta;
 select coalesce(sum(monto),0) into gastos from public.gastos_caja_chica
 where sucursal_id=p_sucursal and origen='boveda' and not informativo and anulado_en is null
 and (desde is null or creado_en>desde) and creado_en<=hasta;
 gastos:=gastos+coalesce((select sum(importe) from public.pagos_boveda_eventos
 where sucursal_id=p_sucursal and (desde is null or creado_en>desde) and creado_en<=hasta),0);
 return jsonb_build_object('bovedaInicial',coalesce(anterior.boveda_contado,b.saldo_inicial),
 'retiros',ingresos,'aperturas',fondos,'depositos',salidas,'gastosBoveda',gastos,
 'pendientes',pendientes,'ultimoCierre',anterior.fecha,'desde',desde,'hasta',hasta);
end $$;
revoke all on function public.datos_boveda_cierre(uuid,date) from public,anon;
grant execute on function public.datos_boveda_cierre(uuid,date) to authenticated;
-- Se conserva el trigger existente BEFORE INSERT; ningún UPDATE histórico cambia.
create or replace function public.incluir_pagos_boveda_corte() returns trigger
language plpgsql security definer set search_path='' as $$
declare d jsonb;
begin
 perform 1 from public.cajas where sucursal_id=new.sucursal_id and tipo='boveda' for update;
 d:=public.datos_boveda_cierre(new.sucursal_id,new.fecha);
 new.boveda_inicial:=(d->>'bovedaInicial')::numeric;
 new.retiros_dia:=(d->>'retiros')::numeric;
 new.aperturas_dia:=(d->>'aperturas')::numeric;
 new.deposito_dia:=(d->>'depositos')::numeric;
 new.gastos_boveda_dia:=(d->>'gastosBoveda')::numeric;
 return new;
end $$;
commit;
