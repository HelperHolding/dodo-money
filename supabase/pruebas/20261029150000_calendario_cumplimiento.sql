-- Ejecutar completo después de 20261029150000_calendario_cumplimiento.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;corp uuid;f record;o uuid;o2 uuid;fechas date[];ok boolean;n integer;p uuid;ef uuid;ed uuid;r record;msg text;s uuid;an uuid;m uuid;act uuid;claves text[];v1 uuid;v2 uuid;c4 uuid;c2 uuid;
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

  -- 10. Obligación con pago, mensual desde el 10 de enero de 2027.
  p:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','seguro','nombre','Póliza de responsabilidad','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-10','con_pago','true','proveedor_id',f.proveedor_id));
  -- Cerrar sin evidencia: rechazado. Fecha que no sale de la regla: rechazada.
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,'2026-01-10','Póliza renovada');ok:=true;exception when others then ok:=false;msg:=sqlerrm;end;
  if ok or msg not like '%foto y un documento%' then raise exception 'FALLÓ: cierre sin evidencia: %',msg;end if;
  begin perform public.omitir_fecha_cumplimiento(p,'2027-01-11',0,'No corresponde');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: fecha fuera de la regla';end if;

  -- 11. Evidencias: foto y PDF reservados; solo cuentan confirmadas. Solo la foto no basta.
  ef:=gen_random_uuid();ed:=gen_random_uuid();
  perform public.preparar_evidencia_cumplimiento(ef,p,'2027-01-10','poliza.jpg','jpg','image/jpeg',1000,repeat('a',64));
  perform public.preparar_evidencia_cumplimiento(ed,p,'2027-01-10','poliza.pdf','pdf','application/pdf',2000,repeat('b',64));
  if (select clase from public.cumplimiento_evidencias where id=ef)<>'foto' or (select clase from public.cumplimiento_evidencias where id=ed)<>'documento' then raise exception 'FALLÓ: clase de evidencia';end if;
  begin perform public.preparar_evidencia_cumplimiento(gen_random_uuid(),p,'2027-01-10','x.exe','exe','application/octet-stream',10,repeat('c',64));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: evidencia no permitida';end if;
  update public.cumplimiento_evidencias set confirmado_en=now() where id=ef;
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,'2026-01-10','Póliza renovada');ok:=true;exception when others then ok:=false;msg:=sqlerrm;end;
  if ok or msg not like '%foto y un documento%' then raise exception 'FALLÓ: cierre solo con foto: %',msg;end if;
  update public.cumplimiento_evidencias set confirmado_en=now() where id=ed;

  -- 12. Fecha futura y nota corta: rechazadas. Cierre correcto: cumplida, revisión 1.
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,public.hoy_mx()+1,'Póliza renovada');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cierre con fecha futura';end if;
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,'2026-01-10','ok');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: nota corta';end if;
  perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',0,'2026-01-10','Póliza renovada con folio 123');
  select * into r from public.cumplimiento_fechas where obligacion_id=p and vence='2027-01-10';
  if r.estado<>'cumplida' or r.revision<>1 or r.cumplida_fecha<>'2026-01-10' then raise exception 'FALLÓ: cierre %',to_jsonb(r);end if;
  begin perform public.cerrar_fecha_cumplimiento(p,'2027-01-10',1,'2026-01-10','Otra vez cerrada');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: cierre doble';end if;

  -- 13. Factura: del proveedor y sucursal, revisión al día. Revisión vieja y factura repetida, rechazadas.
  begin perform public.ligar_factura_cumplimiento(p,'2027-01-10',0,f.id);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: revisión vieja al ligar';end if;
  perform public.ligar_factura_cumplimiento(p,'2027-01-10',1,f.id);
  if (select factura_id from public.cumplimiento_fechas where obligacion_id=p and vence='2027-01-10') is distinct from f.id then raise exception 'FALLÓ: ligar factura';end if;
  begin perform public.ligar_factura_cumplimiento(p,'2027-02-10',0,f.id);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: factura repetida';end if;
  -- Obligación sin pago (extintores) no acepta factura.
  select id into o from public.cumplimiento_obligaciones where nombre='Revisión de extintores' limit 1;
  begin perform public.ligar_factura_cumplimiento(o,'2027-01-05',0,f.id);ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: factura en obligación sin pago';end if;

  -- 14. Omitir: no con factura ni cumplida; sí una fecha pendiente; motivo vacío la regresa a pendiente.
  begin perform public.omitir_fecha_cumplimiento(p,'2027-01-10',2,'Ya no aplica');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: omitir cumplida con factura';end if;
  perform public.omitir_fecha_cumplimiento(p,'2027-02-10',0,'Sucursal cerrada por remodelación');
  if (select estado from public.cumplimiento_fechas where obligacion_id=p and vence='2027-02-10')<>'omitida' then raise exception 'FALLÓ: omitir';end if;
  perform public.omitir_fecha_cumplimiento(p,'2027-02-10',1,'');
  if (select estado from public.cumplimiento_fechas where obligacion_id=p and vence='2027-02-10')<>'pendiente' then raise exception 'FALLÓ: quitar omisión';end if;
  -- Marzo queda omitida: es la fecha trabajada que impide poner fin antes.
  perform public.omitir_fecha_cumplimiento(p,'2027-03-10',0,'Cierre temporal de la sucursal');

  -- 15. Fin antes de una fecha trabajada (marzo omitida): rechazado. Sin pago con factura ligada: rechazado.
  begin perform public.guardar_obligacion(p,1,jsonb_build_object('tipo','seguro','nombre','Póliza de responsabilidad','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-10','fin','2027-02-15','con_pago','true','proveedor_id',f.proveedor_id));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: fin antes de fecha trabajada';end if;
  begin perform public.guardar_obligacion(p,1,jsonb_build_object('tipo','seguro','nombre','Póliza de responsabilidad','sucursal_id',f.sucursal_id,'frecuencia','mensual','inicio','2027-01-10','con_pago','false'));ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: sin pago con factura ligada';end if;
  -- 16. Vista unificada con hoy = 8 de marzo de 2027. Semanal desde el lunes 1: vencida, por vencer (hoy) y pendiente.
  s:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','extintores','nombre','Bitácora de extintores','sucursal_id',f.sucursal_id,'frecuencia','semanal','inicio','2027-03-01','con_pago','false'));
  an:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','seguro','nombre','Seguro de local','razon_social_rfc',f.rfc_receptor,'frecuencia','anual','inicio','2027-05-07','con_pago','true','proveedor_id',f.proveedor_id));
  select array_agg(cr.estado order by cr.vence) into claves from public.cumplimiento_en_rango('2027-03-01','2027-03-15','2027-03-08') cr where cr.referencia_id=s;
  if claves is distinct from array['vencida','por_vencer','pendiente'] then raise exception 'FALLÓ: estados semanal %',claves;end if;
  if (select cr.estado from public.cumplimiento_en_rango('2027-05-01','2027-05-31','2027-03-08') cr where cr.referencia_id=an)<>'por_vencer' then raise exception 'FALLÓ: anual a 60 días';end if;
  if (select cr.ambito from public.cumplimiento_en_rango('2027-05-01','2027-05-31','2027-03-08') cr where cr.referencia_id=an) is distinct from (select razon_social from public.razones_sociales where rfc=f.rfc_receptor) then raise exception 'FALLÓ: ámbito de razón social';end if;
  -- La póliza cumplida en enero sin factura vigente queda como cumplida_sin_factura al quitar la factura.
  perform public.ligar_factura_cumplimiento(p,'2027-01-10',2,null);
  if (select cr.estado from public.cumplimiento_en_rango('2027-01-01','2027-01-31','2027-03-08') cr where cr.referencia_id=p)<>'cumplida_sin_factura' then raise exception 'FALLÓ: cumplida sin factura';end if;
  if (select cr.fecha from public.cumplimiento_en_rango('2027-01-01','2027-01-31','2027-03-08') cr where cr.referencia_id=p)<>'2026-01-10' then raise exception 'FALLÓ: fecha real de cumplida';end if;
  begin perform public.cumplimiento_en_rango('2027-01-01','2030-01-01','2027-03-08');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: rango demasiado largo';end if;

  -- 17. Mantenimiento pendiente del 1 de marzo: sale como vencido con su liga a la ficha.
  select id into act from public.activos limit 1;
  if act is not null then
   insert into public.activo_mantenimientos(activo_id,tipo,tarea,programado) values(act,'preventivo','Limpieza de campana','2027-03-01') returning id into m;
   if not exists(select 1 from public.cumplimiento_en_rango('2027-03-01','2027-03-31','2027-03-08') cr where cr.origen='mantenimiento' and cr.referencia_id=m and cr.estado='vencida' and cr.ruta='/activos/'||act||'#servicio-'||m) then raise exception 'FALLÓ: mantenimiento en la vista';end if;
  end if;

  -- 18. Avisos del día: vencida (1 mar), hoy (8 mar, 0 días), anual a 60 días; no el 15 de marzo.
  select array_agg(x.tipo_aviso||':'||x.dias order by x.vence) into claves from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id in (s,an);
  if claves is distinct from array['vencida:-7','por_vencer:0','por_vencer:60'] then raise exception 'FALLÓ: avisos %',claves;end if;
  -- El día 9 la anual (59 días) no se avisa; el día 6 de abril (30 días) sí.
  if exists(select 1 from public.avisos_cumplimiento('2027-03-09','correo') x where x.referencia_id=an) then raise exception 'FALLÓ: aviso fuera de anticipación';end if;
  if not exists(select 1 from public.avisos_cumplimiento('2027-04-07','correo') x where x.referencia_id=an and x.dias=30) then raise exception 'FALLÓ: aviso a 30 días';end if;
  -- Cumplida sin factura: aviso diario.
  if not exists(select 1 from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id=p and x.tipo_aviso='sin_factura') then raise exception 'FALLÓ: aviso sin factura';end if;

  -- 19. Registrar entregados: idempotente y por canal.
  select array_agg(x.clave) into claves from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id in (s,an);
  if public.registrar_avisos_cumplimiento(claves,'correo')<>3 then raise exception 'FALLÓ: registrar';end if;
  if public.registrar_avisos_cumplimiento(claves,'correo')<>0 then raise exception 'FALLÓ: registrar dos veces';end if;
  if exists(select 1 from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id in (s,an)) then raise exception 'FALLÓ: aviso repetido por correo';end if;
  if (select count(*) from public.avisos_cumplimiento('2027-03-08','chat') x where x.referencia_id in (s,an))<>3 then raise exception 'FALLÓ: chat debe seguir pendiente';end if;
  -- Claves mal formadas o canal inválido: rechazo completo.
  begin perform public.registrar_avisos_cumplimiento(array['obligacion:x:2027-03-08:vencida:2027-03-08'],'correo');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: clave mal formada';end if;
  begin perform public.registrar_avisos_cumplimiento(claves,'whatsapp');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: canal inválido';end if;
  begin perform public.registrar_avisos_cumplimiento(array_fill('x'::text,array[501]),'chat');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: demasiadas claves';end if;

  -- 20. Correos: solo admins activos. Corporativo no consulta avisos ni correos.
  if not exists(select 1 from public.correos_avisos_cumplimiento()) then raise exception 'FALLÓ: sin correos de admins';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',corp,'role','authenticated')::text,true);
  begin perform public.avisos_cumplimiento('2027-03-08','correo');ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: corporativo consultó avisos';end if;
  begin perform public.correos_avisos_cumplimiento();ok:=true;exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: corporativo consultó correos';end if;
  -- Corporativo sí ve la vista unificada.
  if not exists(select 1 from public.cumplimiento_en_rango('2027-03-01','2027-03-15','2027-03-08') cr where cr.referencia_id=s) then raise exception 'FALLÓ: corporativo no ve el calendario';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 21. Ventana de avisos = lo que muestran las pantallas: 12 meses atrás; compromisos, 3 meses.
  v1:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','licencia','nombre','Licencia de hace 13 meses','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2026-02-01','fin','2026-02-28','con_pago','false'));
  v2:=public.guardar_obligacion(null,0,jsonb_build_object('tipo','licencia','nombre','Licencia de hace 11 meses','sucursal_id',f.sucursal_id,'frecuencia','anual','inicio','2026-04-01','fin','2026-04-30','con_pago','false'));
  c4:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','fumigacion','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','1200','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','10','inicio','2026-11-10','fin','2026-11-30','requiere_servicio','true'));
  c2:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','fumigacion','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','1200','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','10','inicio','2027-01-10','fin','2027-01-31','requiere_servicio','true'));
  if exists(select 1 from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id=v1) then raise exception 'FALLÓ: aviso de hace más de 12 meses';end if;
  if not exists(select 1 from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id=v2 and x.tipo_aviso='vencida') then raise exception 'FALLÓ: aviso de hace 11 meses';end if;
  if exists(select 1 from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id=c4) then raise exception 'FALLÓ: aviso de compromiso de hace 4 meses';end if;
  if not exists(select 1 from public.avisos_cumplimiento('2027-03-08','correo') x where x.referencia_id=c2 and x.tipo_aviso='vencida') then raise exception 'FALLÓ: aviso de compromiso de hace 2 meses';end if;

  -- 22. Una factura en una fecha de cumplimiento no se liga a un compromiso.
  perform public.ligar_factura_cumplimiento(p,'2027-01-10',3,f.id);
  begin perform public.ligar_factura_compromiso(c2,'2027-01-10',0,f.id);ok:=true;exception when others then ok:=false;msg:=sqlerrm;end;
  if ok or msg not like '%ya está ligada%' then raise exception 'FALLÓ: factura de cumplimiento ligada a compromiso: %',msg;end if;
  raise exception 'PRUEBAS OK';
end $$;
