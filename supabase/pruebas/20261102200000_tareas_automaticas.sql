-- Ejecutar completo después de 20261102200000_tareas_automaticas.sql. PRUEBAS OK revierte todo mediante un ERROR intencional:
-- las reglas siguen apagadas, no queda ninguna tarea y los documentos que se movieron para probar vuelven como estaban.
-- Si una regla no tiene datos para probarse (p. ej. ninguna orden confirmada sin recibir), avisa con NOTICE y sigue.
do $$
declare a uuid;f uuid;i uuid;s uuid;o uuid;hoy date:=public.hoy_mx();n bigint;k integer;
begin
  select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by nombre limit 1;
  select id into f from public.facturas where estado::text<>'cancelada' order by creado_en desc limit 1;
  if a is null or f is null then raise exception 'FALTAN DATOS: un admin activo y una factura vigente.';end if;
  if exists(select 1 from public.tarea_reglas where activa) or exists(select 1 from public.tareas where origen='automatica') then
   raise exception 'FALLÓ: las reglas deben arrancar apagadas y sin tareas automáticas';
  end if;

  -- 1. Factura sin revisar. Apagada no crea nada.
  update public.facturas set revisada=false,revision_nota=null,revisada_por=null,revisada_en=null,creado_en=now()-interval '10 days' where id=f;
  perform set_config('request.jwt.claims','',true);
  perform public.generar_tareas_automaticas();
  if exists(select 1 from public.tareas where regla='factura_sin_revisar') then raise exception 'FALLÓ: creó tareas con la regla apagada';end if;

  -- 2. Prendida: crea una tarea ligada a la factura, sin creador; otra corrida no la duplica.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.actualizar_regla_tarea('factura_sin_revisar',true,a,3,'media');
  perform set_config('request.jwt.claims','',true);
  perform public.generar_tareas_automaticas();
  perform public.generar_tareas_automaticas();
  select count(*),max(numero) into k,n from public.tareas where regla='factura_sin_revisar' and factura_id=f;
  if k<>1 then raise exception 'FALLÓ: se esperaba 1 tarea para la factura y hay %',k;end if;
  if exists(select 1 from public.tareas where numero=n and (origen<>'automatica' or creado_por is not null or documento_texto not like 'Factura %' or estado::text<>'por_hacer')) then
   raise exception 'FALLÓ: datos de la tarea automática';
  end if;
  if exists(select 1 from public.tarea_historial h join public.tareas t on t.id=h.tarea_id where t.numero=n and h.usuario_id is not null) then raise exception 'FALLÓ: el historial no quedó a nombre del sistema';end if;

  -- 3. Al revisarla, la tarea se cierra sola con la nota.
  update public.facturas set revisada=true,revision_nota='Prueba de tareas automáticas',revisada_por=a,revisada_en=now() where id=f;
  perform public.generar_tareas_automaticas();
  if (select estado::text from public.tareas where numero=n)<>'hecho' then raise exception 'FALLÓ: no se cerró al revisar la factura';end if;
  if not exists(select 1 from public.tarea_historial h join public.tareas t on t.id=h.tarea_id where t.numero=n and h.campo='resuelta') then raise exception 'FALLÓ: falta la nota de resuelto';end if;

  -- 4. Si vuelve el pendiente sale otra; cancelada ya no se vuelve a crear.
  update public.facturas set revisada=false,revision_nota=null,revisada_por=null,revisada_en=null where id=f;
  perform public.generar_tareas_automaticas();
  select numero into n from public.tareas where regla='factura_sin_revisar' and factura_id=f and estado::text='por_hacer';
  if n is null then raise exception 'FALLÓ: no volvió a crear la tarea';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  perform public.mover_tarea(n,1,'cancelada','Prueba de silenciar');
  perform set_config('request.jwt.claims','',true);
  perform public.generar_tareas_automaticas();
  if exists(select 1 from public.tareas where regla='factura_sin_revisar' and factura_id=f and estado::text not in ('hecho','cancelada')) then raise exception 'FALLÓ: recreó una tarea cancelada';end if;

  -- 5. Día sin ventas: se esconde el día de ayer de una sucursal con Dodo IS y luego se regresa.
  select v.sucursal_id into s from public.ventas_dia v join public.sucursales x on x.id=v.sucursal_id
   where x.dodois_unit_id is not null and v.fecha=hoy-1 order by x.nombre limit 1;
  if s is null then raise notice 'Sin sucursal con ventas de ayer: no se probó dia_sin_ventas.';
  else
   update public.ventas_dia set fecha=fecha-3650 where sucursal_id=s and fecha=hoy-1;
   perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
   perform public.actualizar_regla_tarea('dia_sin_ventas',true,a,1,'alta');
   perform set_config('request.jwt.claims','',true);
   perform public.generar_tareas_automaticas();
   if (select count(*) from public.tareas where regla='dia_sin_ventas' and ventas_sucursal_id=s and ventas_fecha=hoy-1 and estado::text='por_hacer')<>1 then raise exception 'FALLÓ: día sin ventas no creó la tarea';end if;
   update public.ventas_dia set fecha=fecha+3650 where sucursal_id=s and fecha=hoy-1-3650;
   perform public.generar_tareas_automaticas();
   if exists(select 1 from public.tareas where regla='dia_sin_ventas' and ventas_sucursal_id=s and estado::text<>'hecho') then raise exception 'FALLÓ: día sin ventas no se cerró al llegar el día';end if;
  end if;

  -- 6. Orden confirmada sin recibir: se atrasa su entrega esperada y luego se cierra la orden.
  select o2.id into o from public.ordenes_compra o2 where o2.estado::text='confirmada'
   and not exists(select 1 from public.orden_renglones r where r.orden_id=o2.id and public.recibido_renglon_total(r.id)>0) limit 1;
  if o is null then raise notice 'Sin orden confirmada sin recibir: no se probó orden_sin_recibir.';
  else
   update public.ordenes_compra set entrega_esperada=hoy-10 where id=o;
   perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
   perform public.actualizar_regla_tarea('orden_sin_recibir',true,a,3,'media');
   perform set_config('request.jwt.claims','',true);
   perform public.generar_tareas_automaticas();
   if (select count(*) from public.tareas where regla='orden_sin_recibir' and orden_id=o)<>1 then raise exception 'FALLÓ: orden sin recibir no creó la tarea';end if;
   update public.ordenes_compra set estado='cerrada' where id=o;
   perform public.generar_tareas_automaticas();
   if (select estado::text from public.tareas where regla='orden_sin_recibir' and orden_id=o)<>'hecho' then raise exception 'FALLÓ: orden sin recibir no se cerró';end if;
  end if;

  -- 7. Ítem de apertura atrasado: se vence un ítem y luego se completa.
  select id into i from public.apertura_items where tipo in ('actividad','tecnico') limit 1;
  if i is null then raise notice 'Sin ítems de apertura: no se probó apertura_item_atrasado.';
  else
   update public.apertura_items set inicio=null,fin=hoy-5,estado='en_curso' where id=i;
   perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
   perform public.actualizar_regla_tarea('apertura_item_atrasado',true,a,0,'media');
   perform set_config('request.jwt.claims','',true);
   perform public.generar_tareas_automaticas();
   if (select count(*) from public.tareas where regla='apertura_item_atrasado' and apertura_item_id=i)<>1 then raise exception 'FALLÓ: ítem atrasado no creó la tarea';end if;
   update public.apertura_items set estado='completado' where id=i;
   perform public.generar_tareas_automaticas();
   if (select estado::text from public.tareas where regla='apertura_item_atrasado' and apertura_item_id=i)<>'hecho' then raise exception 'FALLÓ: ítem atrasado no se cerró';end if;
  end if;

  raise exception 'PRUEBAS OK';
end $$;
