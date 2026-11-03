-- Ejecutar completo después de 20261102120000_tareas.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Cada corrida consume números e ids de las secuencias (no son transaccionales): deja un hueco inofensivo.
do $$
declare a uuid;c uuid;g record;o uuid;f uuid;n bigint;ok boolean;k integer;t text;r text;q text;
begin
  select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by nombre limit 1;
  select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
  select p.id,p.sucursal_id into g from public.perfiles p where p.activo and not p.debe_cambiar_contrasena and p.rol::text='gerente' and p.sucursal_id is not null
   and exists(select 1 from public.perfiles x where x.activo and not x.debe_cambiar_contrasena and x.rol::text='operacion' and x.sucursal_id=p.sucursal_id) limit 1;
  select id into o from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='operacion' and sucursal_id=g.sucursal_id limit 1;
  select id into f from public.facturas where estado::text<>'cancelada' and nombre_emisor is not null and sucursal_id=g.sucursal_id limit 1;
  if a is null or c is null or g.id is null or o is null or f is null then
   raise exception 'FALTAN DATOS: admin, corporativo, gerente con operación en su sucursal y una factura vigente con emisor de esa sucursal.';
  end if;

  -- 1. Admin crea ligada a factura; la tarea toma la sucursal de la factura.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  n:=public.crear_tarea(jsonb_build_object('titulo','Prueba de tareas','prioridad','alta','vence','','asignado_a',o,'documento_tipo','factura','documento_id',f));
  if (select sucursal_id from public.tareas where numero=n) is distinct from g.sucursal_id then raise exception 'FALLÓ: sucursal de la factura';end if;
  if coalesce((select documento_texto from public.tareas where numero=n),'') not like 'Factura %' then raise exception 'FALLÓ: texto del documento';end if;

  -- 2. Gerente no puede ligar facturas.
  perform set_config('request.jwt.claims',json_build_object('sub',g.id,'role','authenticated')::text,true);
  ok:=false;begin perform public.crear_tarea(jsonb_build_object('titulo','No debe','asignado_a',o,'documento_tipo','factura','documento_id',f));
  exception when others then ok:=sqlerrm like 'No puedes ligar%';end;
  if not ok then raise exception 'FALLÓ: gerente ligó una factura';end if;

  -- 3. Operación ve su tarea, la manda a revisión y no la puede cerrar.
  perform set_config('request.jwt.claims',json_build_object('sub',o,'role','authenticated')::text,true);
  if not exists(select 1 from public.tareas_visibles(n)) then raise exception 'FALLÓ: el asignado no ve su tarea';end if;
  perform public.mover_tarea(n,1,'en_revision','Listo');
  ok:=false;begin perform public.mover_tarea(n,2,'hecho','');exception when others then ok:=sqlerrm like 'No puedes hacer ese cambio%';end;
  if not ok then raise exception 'FALLÓ: operación cerró su tarea';end if;

  -- 4. Corporativo solo consulta.
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  if not exists(select 1 from public.tareas_visibles(n)) then raise exception 'FALLÓ: corporativo no ve la tarea';end if;
  ok:=false;begin perform public.comentar_tarea(n,'hola');exception when others then ok:=sqlerrm like 'Corporativo solo puede consultar%';end;
  if not ok then raise exception 'FALLÓ: corporativo comentó';end if;

  -- 5. Regresar exige comentario; con revisión vieja se rechaza; aprobar cierra.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false;begin perform public.mover_tarea(n,2,'en_curso','');exception when others then ok:=sqlerrm like 'Para regresar%';end;
  if not ok then raise exception 'FALLÓ: regresó sin comentario';end if;
  ok:=false;begin perform public.mover_tarea(n,1,'hecho','');exception when others then ok:=sqlerrm like 'La tarea cambió%';end;
  if not ok then raise exception 'FALLÓ: aceptó revisión vieja';end if;
  perform public.mover_tarea(n,2,'hecho','');
  if (select estado::text from public.tareas where numero=n)<>'hecho' or (select cerrada_en from public.tareas where numero=n) is null then raise exception 'FALLÓ: no cerró';end if;

  -- 6. Historial: creada + 2 cambios de estado; un comentario ('Listo'; ninguno al aprobar).
  select count(*) into k from public.hilo_tarea(n) where tipo='cambio';
  if k<>3 then raise exception 'FALLÓ: historial con % cambios',k;end if;
  select count(*) into k from public.hilo_tarea(n) where tipo='comentario';
  if k<>1 then raise exception 'FALLÓ: % comentarios',k;end if;

  -- 7. Nadie escribe directo en las tablas.
  foreach t in array array['public.tareas','public.tarea_comentarios','public.tarea_historial'] loop
   foreach r in array array['authenticated','anon'] loop
    foreach q in array array['insert','update','delete'] loop
     if has_table_privilege(r,t,q) then raise exception 'FALLÓ: % puede % directo en %',r,q,t;end if;
    end loop;
   end loop;
  end loop;

  raise exception 'PRUEBAS OK';
end $$;
