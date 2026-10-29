-- Ejecutar completo después de 20261029120000_compromisos_retenciones.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;f record;c uuid;r public.compromisos;ok boolean;
begin
  select id into a from public.perfiles where activo and rol::text='admin' limit 1;
  select id,proveedor_id,sucursal_id into f from public.facturas where tipo='ingreso' and estado<>'cancelada' and sucursal_id is not null limit 1;
  if a is null or f.id is null then raise exception 'FALTAN DATOS: admin y una factura vigente con sucursal.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 1. Renta de persona física: IVA 16 %, 2/3 de IVA y 10 % de ISR se guardan.
  c:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','40000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false','iva','0.16','ret_iva','dos_tercios','ret_isr','diez'));
  select * into r from public.compromisos where id=c;
  if r.iva<>0.16 or r.ret_iva<>'dos_tercios' or r.ret_isr<>'diez' then raise exception 'FALLÓ: impuestos no guardados';end if;

  -- 2. Editar las retenciones: se permite y sube la revisión.
  perform public.guardar_compromiso(c,1,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','40000','forma_pago','transferencia','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false','iva','0.16','ret_iva','ninguna','ret_isr','resico'));
  select * into r from public.compromisos where id=c;
  if r.ret_iva<>'ninguna' or r.ret_isr<>'resico' or r.revision<>2 then raise exception 'FALLÓ: edición de retenciones';end if;

  -- 3. Sin IVA no hay retención de IVA; valores fuera del catálogo, rechazados.
  begin perform public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','100','forma_pago','efectivo','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false','iva','0','ret_iva','dos_tercios','ret_isr','ninguna'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: retención de IVA sin IVA';end if;
  begin perform public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','renta','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','100','forma_pago','efectivo','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','false','iva','0.08','ret_iva','ninguna','ret_isr','ninguna'));ok:=true;
  exception when others then ok:=false;end;
  if ok then raise exception 'FALLÓ: IVA fuera del catálogo';end if;

  -- 4. Sin las llaves de impuestos (como antes): sin IVA ni retenciones.
  c:=public.guardar_compromiso(null,0,jsonb_build_object('sucursal_id',f.sucursal_id,'concepto','fumigacion','descripcion','','proveedor_id',f.proveedor_id,'monto_estimado','1200','forma_pago','efectivo','unidad','mes','cada','1','dia_mes','1','inicio','2027-01-01','fin','','requiere_servicio','true'));
  select * into r from public.compromisos where id=c;
  if r.iva<>0 or r.ret_iva<>'ninguna' or r.ret_isr<>'ninguna' then raise exception 'FALLÓ: impuestos por omisión';end if;

  raise exception 'PRUEBAS OK';
end $$;
