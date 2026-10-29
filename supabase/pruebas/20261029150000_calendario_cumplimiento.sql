-- Ejecutar completo después de 20261029150000_calendario_cumplimiento.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;corp uuid;f record;o uuid;o2 uuid;fechas date[];ok boolean;n integer;
begin
  select id into a from public.perfiles where activo and rol::text='admin' limit 1;
  select id into corp from public.perfiles where activo and rol::text='corporativo' limit 1;
  select x.id,x.proveedor_id,x.sucursal_id,x.rfc_receptor into f from public.facturas x where x.tipo='ingreso' and x.estado<>'cancelada'
    and x.sucursal_id is not null and x.rfc_receptor is not null and not exists(select 1 from public.compromiso_fechas cf where cf.factura_id=x.id) limit 1;
  if a is null or corp is null or f.id is null then raise exception 'FALTAN DATOS: admin, corporativo y una factura vigente con sucursal y RFC receptor.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 1. Semanal: el día de la semana del inicio.
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','extintores','nombre','Revisión de extintores','sucursal_id',f.sucursal_id,'frecuencia','semanal','inicio','2027-01-05','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2027-01-01','2027-01-31') d;
  if fechas is distinct from array['2027-01-05','2027-01-12','2027-01-19','2027-01-26']::date[] then raise exception 'FALLÓ: semanal %',fechas;end if;

  -- 2. Quincenal: 15 y último día; no antes del inicio; febrero normal y bisiesto; abril de 30.
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','tramite_fiscal','nombre','Pago provisional','razon_social_rfc',f.rfc_receptor,'frecuencia','quincenal','inicio','2027-01-20','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2027-01-01','2027-04-30') d;
  if fechas is distinct from array['2027-01-31','2027-02-15','2027-02-28','2027-03-15','2027-03-31','2027-04-15','2027-04-30']::date[] then raise exception 'FALLÓ: quincenal %',fechas;end if;
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2028-02-01','2028-02-29') d;
  if fechas is distinct from array['2028-02-15','2028-02-29']::date[] then raise exception 'FALLÓ: quincena bisiesta %',fechas;end if;

  -- 3. Mensual el 31 y bimestral.
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','permiso','nombre','Permiso de anuncio','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-31','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2027-01-01','2027-04-30') d;
  if fechas is distinct from array['2027-01-31','2027-02-28','2027-03-31','2027-04-30']::date[] then raise exception 'FALLÓ: mensual 31 %',fechas;end if;
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','proteccion_civil','nombre','Simulacro','sucursal_id',f.sucursal_id,'frecuencia','bimestral','inicio','2027-01-31','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2027-01-01','2027-06-30') d;
  if fechas is distinct from array['2027-01-31','2027-03-31','2027-05-31']::date[] then raise exception 'FALLÓ: bimestral %',fechas;end if;

  -- 4. Anual desde el 29 de febrero: 28 en años no bisiestos.
  o:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','seguro','nombre','Póliza de daños','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2028-02-29','con_pago','true','proveedor_id',f.proveedor_id,'monto_estimado','18000'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o,'2028-01-01','2030-12-31') d;
  if fechas is distinct from array['2028-02-29','2029-02-28','2030-02-28']::date[] then raise exception 'FALLÓ: anual bisiesto %',fechas;end if;

  -- 5. Fin: no hay fechas después.
  o2:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','licencia','nombre','Licencia de funcionamiento','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-31','fin','2027-03-15','con_pago','false'));
  select array_agg(d order by d) into fechas from public.fechas_cumplimiento(o2,'2027-01-01','2027-12-31') d;
  if fechas is distinct from array['2027-01-31','2027-02-28']::date[] then raise exception 'FALLÓ: fin %',fechas;end if;

  -- 6. Pertenencia: ambas o ninguna, rechazadas. Pago sin proveedor y "otro" sin descripción, rechazados.
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','permiso','nombre','Doble','sucursal_id',f.sucursal_id,'razon_social_rfc',f.rfc_receptor,'frecuencia','anual','inicio','2027-01-01','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: sucursal y razón social a la vez';end if;
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','permiso','nombre','Ninguna','frecuencia','anual','inicio','2027-01-01','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: sin pertenencia';end if;
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','seguro','nombre','Sin proveedor','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2027-01-01','con_pago','true'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: pago sin proveedor';end if;
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','otro','nombre','Algo','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2027-01-01','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: otro sin descripción';end if;

  -- 7. Editar: el nombre cambia y sube la revisión; revisión vieja y cambio de frecuencia, rechazados.
  perform public.guardar_obligacion(o2,1,jsonb_build_object('tipo','licencia','nombre','Licencia municipal','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-31','fin','2027-03-15','con_pago','false'));
  if (select nombre||revision from public.cumplimiento_obligaciones where id=o2)<>'Licencia municipal2' then raise exception 'FALLÓ: edición';end if;
  begin perform public.guardar_obligacion(o2,1,jsonb_build_object('tipo','licencia','nombre','Otra','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-31','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: revisión vieja aceptada';end if;
  begin perform public.guardar_obligacion(o2,2,jsonb_build_object('tipo','licencia','nombre','Licencia municipal','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2027-01-31','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cambio de frecuencia aceptado';end if;
  select count(*) into n from public.cumplimiento_historial where obligacion_id=o2;
  if n<>2 then raise exception 'FALLÓ: historial %',n;end if;

  -- 8. Corporativo no da de alta.
  perform set_config('request.jwt.claims',json_build_object('sub',corp,'role','authenticated')::text,true);
  begin perform public.guardar_obligacion(null,0,jsonb_build_object('tipo','permiso','nombre','Corporativo','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2027-01-01','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: corporativo editó';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 9. Anticipación por frecuencia.
  if public.dias_aviso_cumplimiento('anual') is distinct from array[60,30,7,0] or public.dias_aviso_cumplimiento('quincenal') is distinct from array[2,0]
   or public.dias_aviso_cumplimiento('bimestral') is distinct from array[7,2,0] then raise exception 'FALLÓ: anticipación';end if;

  raise exception 'PRUEBAS OK';
end $$;
