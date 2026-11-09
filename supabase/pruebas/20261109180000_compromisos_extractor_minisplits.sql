-- Ejecutar completo después de 20261109180000_compromisos_extractor_minisplits.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;f record;c uuid;r public.compromisos;ok boolean;
begin
  select id into a from public.perfiles where activo and rol::text='admin' limit 1;
  select id,proveedor_id,sucursal_id into f from public.facturas where tipo='ingreso' and estado<>'cancelada' and sucursal_id is not null limit 1;
  if a is null or f.id is null then raise exception 'FALTAN DATOS: admin y una factura vigente con sucursal.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 1. Extractor cada 6 meses, con comprobación de servicio: las fechas caen cada semestre.
  c:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','extractor','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','3500','forma_pago','transferencia','unidad','mes','cada','6','dia_mes','15','inicio','2027-01-15','fin','','requiere_servicio','true','iva','0.16','ret_iva','ninguna','ret_isr','ninguna'));
  select * into r from public.compromisos where id=c;
  if r.concepto<>'extractor' or r.cada<>6 or not r.requiere_servicio then raise exception 'FALLÓ: extractor no guardado';end if;
  if (select array_agg(d order by d) from public.fechas_compromiso(c,'2027-01-01','2028-01-31') d) is distinct from array['2027-01-15','2027-07-15','2028-01-15']::date[] then raise exception 'FALLÓ: fechas del extractor';end if;

  -- 2. Minisplits cada 2 meses.
  c:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','minisplits','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','1800','forma_pago','efectivo','unidad','mes','cada','2','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','true','iva','0.16','ret_iva','ninguna','ret_isr','ninguna'));
  if (select array_agg(d order by d) from public.fechas_compromiso(c,'2027-01-01','2027-06-30') d) is distinct from array['2027-01-01','2027-03-01','2027-05-01']::date[] then raise exception 'FALLÓ: fechas de minisplits';end if;

  -- 3. Un concepto fuera de la lista sigue rechazado.
  begin perform public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','campana','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','100','forma_pago','efectivo','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: concepto desconocido aceptado';end if;

  raise exception 'PRUEBAS OK';
end $$;
