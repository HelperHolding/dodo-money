-- Ejecutar completo después de 20261028180000_compromisos_recurrentes.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;f record;otra uuid;c uuid;c2 uuid;c3 uuid;fechas date[];ok boolean;n integer;
begin
  select id into a from public.perfiles where activo and rol::text='admin' limit 1;
  select id,proveedor_id,sucursal_id into f from public.facturas x where tipo='ingreso' and estado<>'cancelada' and sucursal_id is not null limit 1;
  select id into otra from public.facturas where tipo='ingreso' and estado<>'cancelada' and proveedor_id<>f.proveedor_id limit 1;
  if a is null or f.id is null or otra is null then raise exception 'FALTAN DATOS: admin y dos facturas vigentes de proveedores distintos.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 1. Mensual el día 31: cae en el último día de los meses cortos (febrero bisiesto incluido).
  c:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','45000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','31','inicio','2027-01-31','fin','','requiere_servicio','false'));
  select array_agg(d order by d) into fechas from public.fechas_compromiso(c,'2027-01-01','2027-04-30') d;
  if fechas is distinct from array['2027-01-31','2027-02-28','2027-03-31','2027-04-30']::date[] then raise exception 'FALLÓ: día 31 mensual %',fechas;end if;
  select array_agg(d order by d) into fechas from public.fechas_compromiso(c,'2028-02-01','2028-02-29') d;
  if fechas is distinct from array['2028-02-29']::date[] then raise exception 'FALLÓ: febrero bisiesto %',fechas;end if;
  if exists(select 1 from public.fechas_compromiso(c,'2026-01-01','2027-01-30')) then raise exception 'FALLÓ: fechas antes del inicio';end if;

  -- 2. Cada 2 meses el día 15 desde el 20 de enero: el 15 de enero ya pasó, empieza en marzo.
  c2:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','fumigacion','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','1200.50','forma_pago','efectivo','unidad','mes','cada','2','dia_mes','15','inicio','2027-01-20','fin','','requiere_servicio','true'));
  select array_agg(d order by d) into fechas from public.fechas_compromiso(c2,'2027-01-01','2027-06-30') d;
  if fechas is distinct from array['2027-03-15','2027-05-15']::date[] then raise exception 'FALLÓ: cada 2 meses %',fechas;end if;

  -- 3. Cada 2 semanas con fecha de fin.
  c3:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','trampas_grasa','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','800','forma_pago','transferencia','unidad','semana','cada','2','dia_mes','','inicio','2027-01-05','fin','2027-02-10','requiere_servicio','true'));
  select array_agg(d order by d) into fechas from public.fechas_compromiso(c3,'2027-01-01','2027-12-31') d;
  if fechas is distinct from array['2027-01-05','2027-01-19','2027-02-02']::date[] then raise exception 'FALLÓ: cada 2 semanas %',fechas;end if;

  -- 4. "Otro" sin descripción: rechazado.
  begin perform public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','otro','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','10','forma_pago','efectivo','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: otro sin descripción';end if;

  -- 5. Editar monto: sube la revisión. Revisión vieja: rechazada.
  perform public.guardar_compromiso(c,1,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','47000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','31','inicio','2027-01-31','fin','','requiere_servicio','false'));
  if (select revision from public.compromisos where id=c)<>2 or (select monto_estimado from public.compromisos where id=c)<>47000 then raise exception 'FALLÓ: edición de monto';end if;
  begin perform public.guardar_compromiso(c,1,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','48000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','31','inicio','2027-01-31','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: revisión vieja aceptada';end if;

  -- 6. Cambiar la frecuencia de un compromiso existente: rechazado.
  begin perform public.guardar_compromiso(c,2,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','47000','forma_pago','transferencia','unidad','mes','cada','2','dia_mes','31','inicio','2027-01-31','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cambio de frecuencia aceptado';end if;

  -- 7. compromisos_en_rango: fechas calculadas sin filas guardadas, revisión 0.
  select count(*) into n from public.compromisos_en_rango('2027-01-01','2027-02-28') r where r.compromiso_id=c and r.fecha_id is null and r.revision=0 and r.servicio='pendiente';
  if n<>2 then raise exception 'FALLÓ: compromisos_en_rango devolvió % fechas',n;end if;
  begin perform public.compromisos_en_rango('2027-01-01','2030-01-01');ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: rango demasiado largo aceptado';end if;

  raise exception 'PRUEBAS OK';
end $$;
