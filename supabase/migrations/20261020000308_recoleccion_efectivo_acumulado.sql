-- Incluye efectivo acumulado sin alterar cierres, custodia, permisos ni entregas registradas.
begin;
set local lock_timeout='5s';
create or replace function public.vista_recoleccion(p_sucursal uuid,p_desde date,p_hasta date) returns jsonb language plpgsql security definer set search_path=public as $$
declare cierres jsonb;primero public.cierres_dia;ultimo public.cierres_dia;d jsonb;pagos jsonb;historicos jsonb;maximo numeric;op date;
begin
 if not coalesce(public.mi_rol()::text in ('admin','corporativo','gerente') and (public.ve_todas_las_sucursales() or p_sucursal=public.mi_sucursal()),false) then raise exception 'Sucursal sin acceso a recolecciones.';end if;
 if p_desde is null or p_hasta is null or p_hasta<p_desde or p_hasta>public.hoy_mx() or p_hasta-p_desde>366 then raise exception 'Revisa el rango de cierres, hasta un año y sin fechas futuras.';end if;
 select * into primero from public.cierres_dia where sucursal_id=p_sucursal and fecha between p_desde and p_hasta order by fecha limit 1;
 if not found then raise exception 'No hay cierres en este rango.';end if;
 select * into ultimo from public.cierres_dia where sucursal_id=p_sucursal and fecha between p_desde and p_hasta order by fecha desc limit 1;
 if exists(select 1 from public.recoleccion_cierres rc join public.cierres_dia cd on cd.id=rc.cierre_id where cd.sucursal_id=p_sucursal and cd.fecha between p_desde and p_hasta and rc.liberado_en is null) then raise exception 'Alguno de esos cierres ya está asociado a una recolección. Revisa sus fechas.';end if;
 select jsonb_agg(to_jsonb(cd) order by cd.fecha) into cierres from public.cierres_dia cd where sucursal_id=p_sucursal and fecha between p_desde and p_hasta;
 d:=public.disponibilidad_boveda(p_sucursal);
 -- El rango respalda la entrega, pero no limita el efectivo acumulado antes del primer cierre.
 -- La disponibilidad vigente ya conserva fondo, reservas y salidas pendientes.
 maximo:=greatest(0,least((d->>'disponible')::numeric,(d->>'saldo')::numeric-(d->>'fondo')::numeric-(d->>'reservado')::numeric-(d->>'salidas')::numeric));
 op:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.fecha_operativa,e.creado_en),'[]') into pagos from (
  select ev.id,ev.pago_id,ev.fecha_operativa,ev.creado_en,ev.tipo,ev.importe,'boveda'::text origen,p.referencia,p.nota_boveda,p.comprobante_ruta,p.anulado_en,
   (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'folio',f.folio,'uuid',f.uuid,'origen',f.origen,'aplicado',pa.monto,'ordenes',(select coalesce(jsonb_agg(jsonb_build_object('id',oc.id,'folio',oc.folio)),'[]') from public.factura_ordenes fo join public.ordenes_compra oc on oc.id=fo.orden_id where fo.factura_id=f.id))),'[]') from public.pago_aplicaciones pa join public.facturas f on f.id=pa.factura_id where pa.pago_id=p.id) documentos
  from public.pagos_boveda_eventos ev join public.pagos p on p.id=ev.pago_id where ev.sucursal_id=p_sucursal and ev.fecha_operativa between p_desde and greatest(p_hasta,op)
  union all
  select ev.id,ev.pago_id,ev.fecha_operativa,ev.creado_en,ev.tipo,ev.importe,'ventas'::text,p.referencia,p.nota_boveda,p.comprobante_ruta,p.anulado_en,
   (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'folio',f.folio,'uuid',f.uuid,'origen',f.origen,'aplicado',pa.monto,'ordenes',(select coalesce(jsonb_agg(jsonb_build_object('id',oc.id,'folio',oc.folio)),'[]') from public.factura_ordenes fo join public.ordenes_compra oc on oc.id=fo.orden_id where fo.factura_id=f.id))),'[]') from public.pago_aplicaciones pa join public.facturas f on f.id=pa.factura_id where pa.pago_id=p.id)
  from public.pagos_ventas_eventos ev join public.pagos p on p.id=ev.pago_id where ev.sucursal_id=p_sucursal and ev.fecha_operativa between p_desde and greatest(p_hasta,op)
 ) e;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'fecha',p.fecha,'monto',p.monto,'referencia',p.referencia)),'[]') into historicos from public.pagos p
 where p.origen_fondos is null and p.forma='efectivo' and p.fecha between p_desde and greatest(p_hasta,op) and p.anulado_en is null and exists(select 1 from public.pago_aplicaciones pa join public.facturas f on f.id=pa.factura_id where pa.pago_id=p.id and f.sucursal_id=p_sucursal);
 return jsonb_build_object('cierres',cierres,'disponibilidad',d,'maximo',maximo,'base_maximo','disponibilidad_actual','incremento_periodo',ultimo.boveda_contado-primero.boveda_inicial,'pagos',pagos,'historicos_por_revisar',historicos,'capturado_en',now(),'desde',p_desde,'hasta',p_hasta);
end $$;

commit;
