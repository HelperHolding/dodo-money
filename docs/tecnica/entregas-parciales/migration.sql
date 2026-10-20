begin;
set local lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.vista_recoleccion(p_sucursal uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
 return jsonb_build_object('cierres',cierres,'disponibilidad',d,'maximo',maximo,'base_maximo','disponibilidad_actual','permite_entrega_parcial',true,'incremento_periodo',ultimo.boveda_contado-primero.boveda_inicial,'pagos',pagos,'historicos_por_revisar',historicos,'capturado_en',now(),'desde',p_desde,'hasta',p_hasta);
end $function$;

CREATE OR REPLACE FUNCTION public.registrar_recoleccion(p_id uuid, p_sucursal uuid, p_desde date, p_hasta date, p_monto numeric, p_folio text, p_nota text, p_historicos_revisados boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.recolecciones_corporativo;m public.movimientos;exp jsonb;origen uuid;destino uuid;
begin
 if not coalesce(public.mi_rol()::text in ('gerente','admin') and (public.mi_rol()::text='admin' or p_sucursal=public.mi_sucursal()),false) then raise exception 'Solo gerente de la sucursal o administración registra recolecciones.';end if;
 if p_id is null or p_sucursal is null or p_desde is null or p_hasta is null or p_monto is null or length(trim(coalesce(p_folio,''))) not between 3 and 100 or length(trim(coalesce(p_nota,''))) not between 5 and 1000 then raise exception 'Revisa rango, importe, folio y nota de la entrega.';end if;
 perform pg_advisory_xact_lock(hashtextextended('recoleccion:'||p_id,0));
 select * into r from public.recolecciones_corporativo where id=p_id;
 if found then
  select * into m from public.movimientos where id=r.id;
  if r.creado_por<>auth.uid() or r.sucursal_id<>p_sucursal or r.desde<>p_desde or r.hasta<>p_hasta or m.monto<>p_monto or m.folio<>trim(p_folio) or m.nota<>trim(p_nota) then raise exception 'Esta solicitud ya corresponde a otra entrega.';end if;
  return r.id;
 end if;
 select id into origen from public.cajas where sucursal_id=p_sucursal and tipo='boveda' for update;
 select id into destino from public.cajas where sucursal_id=p_sucursal and tipo='corporativo';
 if origen is null or destino is null then raise exception 'Faltan cajas de bóveda o corporativo.';end if;
 perform 1 from public.cierres_dia where sucursal_id=p_sucursal and fecha between p_desde and p_hasta order by fecha for update;
 exp:=public.vista_recoleccion(p_sucursal,p_desde,p_hasta);
 if jsonb_array_length(exp->'historicos_por_revisar')>0 and not coalesce(p_historicos_revisados,false) then raise exception 'Revisa los pagos históricos sin origen antes de preparar la entrega.';end if;
 if p_monto is null or p_monto<=0 or p_monto<>round(p_monto,2) or p_monto > (exp->>'maximo')::numeric then raise exception 'El importe debe ser positivo y no superar el disponible protegido. Recarga la vista previa y cuenta el efectivo.';end if;
 exp:=exp||jsonb_build_object('permite_entrega_parcial',true,'importe_preparado',p_monto,'remanente_disponible',(exp->>'maximo')::numeric-p_monto);
 insert into public.movimientos(id,recoleccion_id,sucursal_id,tipo,caja_origen_id,caja_destino_id,monto,folio,nota,registrado_por) values(p_id,p_id,p_sucursal,'salida_corporativo',origen,destino,p_monto,trim(p_folio),trim(p_nota),auth.uid());
 insert into public.recolecciones_corporativo(id,sucursal_id,desde,hasta,expediente,creado_por) values(p_id,p_sucursal,p_desde,p_hasta,exp,auth.uid());
 insert into public.recoleccion_cierres(recoleccion_id,cierre_id) select p_id,(c.valor->>'id')::uuid from jsonb_array_elements(exp->'cierres') as c(valor);
 return p_id;
end $function$;

commit;
