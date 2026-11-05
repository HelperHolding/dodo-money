-- Ejecutar completo después de 20261104120000_compromisos_internet_monto_variable.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;f record;c uuid;t uuid;re uuid;r public.compromisos;fila record;ok boolean;n integer;
begin
  select id into a from public.perfiles where activo and rol::text='admin' limit 1;
  select id,proveedor_id,sucursal_id into f from public.facturas x where tipo='ingreso' and estado<>'cancelada' and sucursal_id is not null
    and not exists(select 1 from public.compromiso_fechas cf where cf.factura_id=x.id) and not exists(select 1 from public.cumplimiento_fechas cf where cf.factura_id=x.id) limit 1;
  if a is null or f.id is null then raise exception 'FALTAN DATOS: admin y una factura vigente con sucursal, sin ligar.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 1. Internet y teléfono son conceptos válidos; uno desconocido, rechazado.
  c:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','internet','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','899','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','10','inicio','2027-01-10','fin','','requiere_servicio','false','iva','0.16','ret_iva','ninguna','ret_isr','ninguna'));
  if (select concepto from public.compromisos where id=c)<>'internet' then raise exception 'FALLÓ: concepto internet';end if;
  t:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','telefono','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','5','inicio','2027-01-05','fin','','requiere_servicio','false','iva','0.16','ret_iva','dos_tercios','ret_isr','diez','monto_variable','true'));
  begin perform public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','agua','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','100','forma_pago','efectivo','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: concepto desconocido aceptado';end if;

  -- 2. Monto variable: sin monto y sin impuestos aunque el formulario los mande.
  select * into r from public.compromisos where id=t;
  if not r.monto_variable or r.monto_estimado is not null or r.iva<>0 or r.ret_iva<>'ninguna' or r.ret_isr<>'ninguna' then raise exception 'FALLÓ: monto variable guardado %',to_jsonb(r);end if;
  -- 3. Sin monto y sin marcar variable: rechazado (en la función y en la tabla).
  begin perform public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','internet','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','','forma_pago','efectivo','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: sin monto y sin monto variable';end if;
  begin update public.compromisos set monto_variable=false where id=t;ok:=true;exception when check_violation then ok:=false;end;
  if ok then raise exception 'FALLÓ: la tabla aceptó monto nulo sin monto variable';end if;

  -- 4. El monto variable se puede cambiar al editar: a fijo con su monto y de vuelta a variable.
  perform public.guardar_compromiso(t,1,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','telefono','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','650','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','5','inicio','2027-01-05','fin','','requiere_servicio','false','iva','0.16','ret_iva','ninguna','ret_isr','ninguna','monto_variable','false'));
  select * into r from public.compromisos where id=t;
  if r.monto_variable or r.monto_estimado<>650 or r.iva<>0.16 or r.revision<>2 then raise exception 'FALLÓ: variable a fijo %',to_jsonb(r);end if;
  perform public.guardar_compromiso(t,2,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','telefono','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','650','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','5','inicio','2027-01-05','fin','','requiere_servicio','false','iva','0.16','ret_iva','ninguna','ret_isr','ninguna','monto_variable','true'));
  select * into r from public.compromisos where id=t;
  if not r.monto_variable or r.monto_estimado is not null or r.iva<>0 then raise exception 'FALLÓ: fijo a variable %',to_jsonb(r);end if;

  -- 5. Calendario de cumplimiento: internet sale sin comprobar servicio y se cumple al ligar su factura; la renta no sale.
  re:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','40000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','10','inicio','2027-01-10','fin','','requiere_servicio','false'));
  if exists(select 1 from public.cumplimiento_en_rango('2027-01-01','2027-04-30','2027-03-08') x where x.referencia_id=re) then raise exception 'FALLÓ: la renta salió en cumplimiento';end if;
  select count(*) into n from public.cumplimiento_en_rango('2027-01-01','2027-04-30','2027-03-08') x where x.referencia_id=c;
  if n<>4 then raise exception 'FALLÓ: internet en cumplimiento, % fechas',n;end if;
  select * into fila from public.cumplimiento_en_rango('2027-01-01','2027-04-30','2027-03-08') x where x.referencia_id=c and x.vence='2027-04-10';
  if fila.estado<>'pendiente' or fila.titulo<>'Internet' or fila.falta_evidencia or not fila.falta_factura then raise exception 'FALLÓ: internet pendiente %',to_jsonb(fila);end if;
  select * into fila from public.cumplimiento_en_rango('2027-01-01','2027-04-30','2027-03-08') x where x.referencia_id=c and x.vence='2027-03-10';
  if fila.estado<>'por_vencer' then raise exception 'FALLÓ: internet por vencer %',fila.estado;end if;
  select * into fila from public.cumplimiento_en_rango('2027-01-01','2027-04-30','2027-03-08') x where x.referencia_id=c and x.vence='2027-01-10';
  if fila.estado<>'vencida' then raise exception 'FALLÓ: internet vencida %',fila.estado;end if;
  perform public.ligar_factura_compromiso(c,'2027-01-10',0,f.id);
  select * into fila from public.cumplimiento_en_rango('2027-01-01','2027-04-30','2027-03-08') x where x.referencia_id=c and x.vence='2027-01-10';
  if fila.estado<>'cumplida' or fila.falta_factura or fila.falta_evidencia then raise exception 'FALLÓ: internet con factura %',to_jsonb(fila);end if;
  -- Omitida: omitida.
  perform public.omitir_fecha_compromiso(c,'2027-02-10',0,'Mes sin servicio por cambio de proveedor');
  if (select x.estado from public.cumplimiento_en_rango('2027-01-01','2027-04-30','2027-03-08') x where x.referencia_id=c and x.vence='2027-02-10')<>'omitida' then raise exception 'FALLÓ: internet omitida';end if;
  -- Teléfono también sale, con su título.
  if not exists(select 1 from public.cumplimiento_en_rango('2027-01-01','2027-04-30','2027-03-08') x where x.referencia_id=t and x.titulo='Teléfono') then raise exception 'FALLÓ: teléfono en cumplimiento';end if;

  raise exception 'PRUEBAS OK';
end $$;
