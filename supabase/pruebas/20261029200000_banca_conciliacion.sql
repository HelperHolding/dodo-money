-- Ejecutar completo después de 20261029200000_banca_conciliacion.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Usa un admin activo, una razón social con un día de venta con tarjeta y un pago por transferencia ya registrados; crea una cuenta y movimientos de prueba.
do $$
declare a uuid; empresa text; vd record; pg record; rp record; c uuid; imp uuid:=gen_random_uuid();
 m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid; m7 uuid; m8 uuid; m9 uuid; m10 uuid; k1 uuid:=gen_random_uuid(); k uuid; kp uuid; ok boolean; x public.banca_conciliaciones;
 dv jsonb; dp jsonb; f date;
begin
 select p.id into a from public.perfiles p where p.activo and p.rol::text='admin' and not p.debe_cambiar_contrasena limit 1;
 select e.rfc into empresa from public.razones_sociales e where e.activa and exists(
  select 1 from public.razon_social_sucursales s join public.ventas_dia v on v.sucursal_id=s.sucursal_id where s.rfc=e.rfc and v.tarjeta>0
  and not exists(select 1 from public.banca_conciliacion_documentos z where z.ventas_dia_id=v.id and z.activa)) limit 1;
 select v.id,v.fecha,v.tarjeta into vd from public.ventas_dia v join public.razon_social_sucursales s on s.sucursal_id=v.sucursal_id
  where s.rfc=empresa and v.tarjeta>0 and not exists(select 1 from public.banca_conciliacion_documentos z where z.ventas_dia_id=v.id and z.activa) order by v.fecha desc limit 1;
 select p.id,p.monto into pg from public.pagos p where p.anulado_en is null and p.forma='transferencia'
  and not exists(select 1 from public.banca_conciliacion_documentos z where z.pago_id=p.id and z.activa) order by p.fecha desc limit 1;
 if a is null or empresa is null or vd.id is null or pg.id is null then
  raise exception 'FALTAN DATOS: admin activo, razón social con venta con tarjeta sin conciliar y un pago por transferencia sin conciliar.';end if;
 f:=vd.fecha+1;

 -- Cuenta, importación y movimientos de prueba (se revierten al final).
 insert into public.banca_cuentas(banco,numero,clabe,rfc,moneda,titular_fuente,creado_por) values('banregio','999999999901','058999999999999901',empresa,'MXN','PRUEBA',a) returning id into c;
 insert into public.banca_importaciones(id,cuenta_id,archivo,sha256,solicitud,periodo_desde,periodo_hasta,primera_fecha,ultima_fecha,saldo_inicial,saldo_final,cargos,abonos,movimientos,nuevos,repetidos,creado_por)
  values(imp,c,'prueba.xlsx',repeat('a',64),'{}',f,f,f,f,0,vd.tarjeta+1000-(11.6+pg.monto+50+25),11.6+pg.monto+50+25,vd.tarjeta+1000,7,7,0,a);
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,1,'SPEI. BANORTE. 072000000000000001. NET PAY SAPI DE C','_','PRUEBA',0,vd.tarjeta,0,'h1',imp) returning id into m1;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,2,'DOMI: COM VTAS','_','PRUEBA',10,0,0,'h2',imp) returning id into m2;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,3,'DOMI: IVA COM VTAS','_','PRUEBA',1.6,0,0,'h3',imp) returning id into m3;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,4,'SPEI. BANCO. 002000000000000001. PROVEEDOR','_','PRUEBA',pg.monto,0,0,'h4',imp) returning id into m4;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,5,'*Com. Contratación','_','PRUEBA',50,0,0,'h5',imp) returning id into m5;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,6,'PRESTAMO','_','PRUEBA',0,1000,0,'h6',imp) returning id into m6;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,7,'SPEI. BANCO. 002000000000000001. PROVEEDOR','_','PRUEBA',25,0,0,'h7',imp) returning id into m7;
 insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f+1,9,'SPEI. BANCO. 002000000000000009. OTRO CARGO','_','PRUEBA',50000,0,0,'h9',imp) returning id into m9;
 dv:=jsonb_build_array(jsonb_build_object('tipo','venta_dia','id',vd.id));
 dp:=jsonb_build_array(jsonb_build_object('tipo','pago','id',pg.id));

 -- 1. Sin sesión de admin: rechazado.
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','comisiones_bancarias','[]','x'); exception when others then ok:=sqlerrm like 'Solo administración%'; end;
 if not ok then raise exception 'FALLÓ: concilió sin ser admin';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

 -- 1b. Un cargo de otro día no se absorbe en un cobro con tarjeta.
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m1,m9],'cobro_tarjeta','cobranza_tarjeta',dv,''); exception when others then ok:=sqlerrm like 'En un cobro con tarjeta, las comisiones%'; end;
 if not ok then raise exception 'FALLÓ: cobro con tarjeta absorbió un cargo de otro día';end if;

 -- 2. Cobro con tarjeta exacto: depósito contra venta con tarjeta; comisión e IVA incluidos.
 k:=public.conciliar_banca(k1,array[m1,m2,m3],'cobro_tarjeta','cobranza_tarjeta',dv,'');
 select * into x from public.banca_conciliaciones where id=k;
 if k<>k1 or x.monto_movimientos<>round(vd.tarjeta-11.6,2) or x.monto_documentos<>vd.tarjeta or x.diferencia<>0 then raise exception 'FALLÓ: cobro con tarjeta % % %',x.monto_movimientos,x.monto_documentos,x.diferencia;end if;

 -- 3. Idempotencia: misma solicitud y datos devuelve el mismo id; otros datos se rechazan.
 if public.conciliar_banca(k1,array[m3,m2,m1],'cobro_tarjeta','cobranza_tarjeta',dv,'') is distinct from k1 then raise exception 'FALLÓ: idempotencia';end if;
 ok:=false; begin perform public.conciliar_banca(k1,array[m1,m2,m3],'cobro_tarjeta','cobranza_tarjeta',dv,'otra nota'); exception when others then ok:=sqlerrm like 'La solicitud ya se utilizó%'; end;
 if not ok then raise exception 'FALLÓ: solicitud reutilizada con otros datos';end if;

 -- 4. Doble vínculo: el movimiento y el día de venta ya conciliados se rechazan.
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m1],'sin_documento','otros_operacion','[]','x'); exception when others then ok:=sqlerrm like '%ya está conciliado%'; end;
 if not ok then raise exception 'FALLÓ: movimiento conciliado dos veces';end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m6],'cobro_tarjeta','cobranza_tarjeta',dv,'x'); exception when others then ok:=sqlerrm like '%ya está conciliado%' or sqlerrm like 'Los días de venta%'; end;
 if not ok then raise exception 'FALLÓ: día de venta conciliado dos veces';end if;

 -- 5. Coherencia de tipo, concepto y documentos.
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m6],'pago_proveedor','proveedores',dp,''); exception when others then ok:=sqlerrm like 'Un pago a proveedor%'; end;
 if not ok then raise exception 'FALLÓ: pago a proveedor con un abono';end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m6],'cobro_tarjeta','cobranza_tarjeta','[]',''); exception when others then ok:=sqlerrm like 'Un cobro con tarjeta%'; end;
 if not ok then raise exception 'FALLÓ: cobro con tarjeta sin días de venta';end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','comisiones_bancarias',dp,'x'); exception when others then ok:=sqlerrm like 'Una conciliación sin documento%'; end;
 if not ok then raise exception 'FALLÓ: sin documento con documentos';end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','inventado','[]','x'); exception when check_violation then ok:=true; end;
 if not ok then raise exception 'FALLÓ: concepto fuera del catálogo';end if;

 -- 6. Sin documento exige nota.
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','comisiones_bancarias','[]','  '); exception when others then ok:=sqlerrm like 'Escribe una nota%'; end;
 if not ok then raise exception 'FALLÓ: sin documento sin nota';end if;
 perform public.conciliar_banca(gen_random_uuid(),array[m5],'sin_documento','comisiones_bancarias','[]','Comisión bancaria');
 perform public.conciliar_banca(gen_random_uuid(),array[m6],'sin_documento','prestamo_recibido','[]','Préstamo de prueba');

 -- 7. Pago a proveedor exacto; el pago no se puede vincular dos veces.
 kp:=public.conciliar_banca(gen_random_uuid(),array[m4],'pago_proveedor','proveedores',dp,'');
 select * into x from public.banca_conciliaciones where id=kp;
 if x.monto_documentos<>-pg.monto or x.diferencia<>0 then raise exception 'FALLÓ: pago a proveedor % %',x.monto_documentos,x.diferencia;end if;
 ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m7],'pago_proveedor','proveedores',dp,'x'); exception when others then ok:=sqlerrm like '%ya está conciliado%'; end;
 if not ok then raise exception 'FALLÓ: pago vinculado dos veces';end if;

 -- 8. Anular: solo admin, con motivo; libera movimiento y pago.
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 ok:=false; begin perform public.anular_conciliacion(kp,'motivo de prueba'); exception when others then ok:=sqlerrm like 'Solo administración%'; end;
 if not ok then raise exception 'FALLÓ: anuló sin ser admin';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 ok:=false; begin perform public.anular_conciliacion(kp,'no'); exception when others then ok:=sqlerrm like 'Escribe el motivo%'; end;
 if not ok then raise exception 'FALLÓ: anuló sin motivo';end if;
 perform public.anular_conciliacion(kp,'Prueba de anulación');
 if exists(select 1 from public.banca_conciliacion_movimientos where conciliacion_id=kp and activa) or exists(select 1 from public.banca_conciliacion_documentos where conciliacion_id=kp and activa) then raise exception 'FALLÓ: la anulación no liberó vínculos';end if;
 if not exists(select 1 from public.banca_por_conciliar where id=m4) or exists(select 1 from public.banca_por_conciliar where id=m1) then raise exception 'FALLÓ: vista de movimientos por conciliar';end if;
 ok:=false; begin perform public.anular_conciliacion(kp,'Otra vez'); exception when others then ok:=sqlerrm like '%ya está anulada%'; end;
 if not ok then raise exception 'FALLÓ: anuló dos veces';end if;

 -- 9. Diferencia: exige nota; con nota se guarda calculada en el servidor.
 if pg.monto<>25 then
  ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m7],'pago_proveedor','proveedores',dp,''); exception when others then ok:=sqlerrm like 'Hay una diferencia%'; end;
  if not ok then raise exception 'FALLÓ: diferencia sin nota';end if;
  k:=public.conciliar_banca(gen_random_uuid(),array[m7],'pago_proveedor','proveedores',dp,'Pago parcial de prueba');
  select * into x from public.banca_conciliaciones where id=k;
  if x.diferencia<>round(pg.monto-25,2) then raise exception 'FALLÓ: diferencia calculada %',x.diferencia;end if;
 end if;

 -- 10. Rappi por paidlot (si hay un reporte vigente de la razón social con paidlot sin conciliar).
 select i.id as importacion,mv->>'lote' as lote,sum((mv->>'neto')::numeric) as neto into rp from public.rappi_fin_importaciones i cross join lateral jsonb_array_elements(i.reporte->'movimientos') mv
  where i.rfc=empresa and i.sustituida_en is null and mv->>'lote' is not null
  and not exists(select 1 from public.banca_conciliacion_documentos z where z.lote=mv->>'lote' and z.activa)
  group by i.id,mv->>'lote' having round(sum((mv->>'neto')::numeric),2)>0 limit 1;
 if rp.lote is not null then
  insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,8,'SPEI. CITI MEXICO. 124000000000000002. TECNOLOGIAS R','_','PRUEBA',0,round(rp.neto,2),0,'h8',imp) returning id into m8;
  k:=public.conciliar_banca(gen_random_uuid(),array[m8],'cobro_rappi','cobranza_rappi',jsonb_build_array(jsonb_build_object('tipo','rappi_lote','importacion',rp.importacion,'lote',rp.lote)),'');
  select * into x from public.banca_conciliaciones where id=k;
  if x.diferencia<>0 then raise exception 'FALLÓ: Rappi por paidlot %',x.diferencia;end if;
  insert into public.banca_movimientos(cuenta_id,fecha,fila_origen,descripcion,referencia,clasificacion,cargo,abono,saldo,huella,importacion_id) values(c,f,10,'SPEI. CITI MEXICO. 124000000000000002. TECNOLOGIAS R','_','PRUEBA',0,round(rp.neto,2),0,'h10',imp) returning id into m10;
  ok:=false; begin perform public.conciliar_banca(gen_random_uuid(),array[m10],'cobro_rappi','cobranza_rappi',jsonb_build_array(jsonb_build_object('tipo','rappi_lote','importacion',rp.importacion,'lote',rp.lote)),'x'); exception when others then ok:=sqlerrm like '%ya está conciliado%'; end;
  if not ok then raise exception 'FALLÓ: paidlot conciliado dos veces';end if;
 else raise notice 'Sin reporte Rappi vigente con paidlot: se omite la prueba de paidlot.';
 end if;

 -- 11. Sin escritura directa desde la app.
 if exists(select 1 from unnest(array['banca_conciliaciones','banca_conciliacion_movimientos','banca_conciliacion_documentos']) t cross join unnest(array['insert','update','delete']) pr where has_table_privilege('authenticated','public.'||t,pr)) then
  raise exception 'FALLÓ: escritura directa permitida';end if;

 raise exception 'PRUEBAS OK';
end$$;
