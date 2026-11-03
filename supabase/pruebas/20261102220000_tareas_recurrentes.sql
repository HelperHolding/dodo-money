-- Ejecutar completo después de 20261102220000_tareas_recurrentes.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Cada corrida consume números de tarea (las secuencias no son transaccionales): deja un hueco inofensivo.
do $$
declare a uuid;hoy date:=public.hoy_mx();n bigint;s bigint;s2 bigint;m bigint;r integer;v date;
begin
  select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by nombre limit 1;
  if a is null then raise exception 'FALTAN DATOS: un admin activo.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

  -- 1. Fechas: semanal corre 7 días; mensual conserva el día (31 → último del mes y de regreso); cerrada tarde salta a hoy o después.
  if public.siguiente_vence(date '2026-11-02','semanal',null,date '2026-11-02')<>date '2026-11-09' then raise exception 'FALLÓ: semanal';end if;
  if public.siguiente_vence(date '2026-11-02','semanal',null,date '2026-11-18')<>date '2026-11-23' then raise exception 'FALLÓ: semanal tarde';end if;
  if public.siguiente_vence(date '2026-11-27','mensual',27::smallint,date '2026-11-02')<>date '2026-12-27' then raise exception 'FALLÓ: mensual';end if;
  if public.siguiente_vence(date '2027-01-31','mensual',31::smallint,date '2027-01-01')<>date '2027-02-28' then raise exception 'FALLÓ: mes corto';end if;
  if public.siguiente_vence(date '2027-02-28','mensual',31::smallint,date '2027-02-15')<>date '2027-03-31' then raise exception 'FALLÓ: regreso al 31';end if;

  -- 2. Crear sin fecha se rechaza.
  begin perform public.crear_tarea(jsonb_build_object('titulo','Prueba recurrente','asignado_a',a,'repite','semanal'));
   raise exception 'FALLÓ: aceptó repetir sin fecha';
  exception when others then if sqlerrm not like 'Para que se repita%' then raise;end if;end;

  -- 3. Semanal: al aprobarla sale la siguiente con lo mismo y la fecha corrida.
  n:=public.crear_tarea(jsonb_build_object('titulo','Prueba recurrente','descripcion','Cada lunes','prioridad','alta','vence',hoy,'asignado_a',a,'repite','semanal'));
  perform public.mover_tarea(n,1,'en_revision','',false);
  s:=public.mover_tarea(n,2,'hecho','',false);
  if s is null then raise exception 'FALLÓ: no salió la siguiente';end if;
  select vence into v from public.tareas_visibles(s) where titulo='Prueba recurrente' and descripcion='Cada lunes' and prioridad='alta'
   and asignado_a=a and estado='por_hacer' and repite='semanal' and anterior_numero=n;
  if v is distinct from hoy+7 then raise exception 'FALLÓ: siguiente con datos o fecha distintos (%)',v;end if;
  if (select siguiente_numero from public.tareas_visibles(n))<>s then raise exception 'FALLÓ: la anterior no apunta a la siguiente';end if;

  -- 4. Cancelar sin la casilla salta esa vez; con «dejar de repetir» corta la serie.
  s2:=public.mover_tarea(s,1,'cancelada','Prueba: saltar',false);
  if s2 is null then raise exception 'FALLÓ: cancelar sin casilla no creó la siguiente';end if;
  if public.mover_tarea(s2,1,'cancelada','Prueba: dejar de repetir',true) is not null then raise exception 'FALLÓ: dejar de repetir creó otra';end if;
  if (select repite from public.tareas where numero=s2) is not null then raise exception 'FALLÓ: la serie sigue marcada';end if;

  -- 5. Mensual: al editar toma el día del vencimiento; el historial anota la repetición.
  m:=public.crear_tarea(jsonb_build_object('titulo','Prueba mensual','vence','2026-11-27','asignado_a',a));
  perform public.actualizar_tarea(m,1,jsonb_build_object('titulo','Prueba mensual','vence','2026-11-27','asignado_a',a,'repite','mensual'));
  if (select repite_dia from public.tareas where numero=m) is distinct from 27 then raise exception 'FALLÓ: día del mes';end if;
  select count(*) into r from public.hilo_tarea(m) where campo='repite' and despues='mensual';
  if r<>1 then raise exception 'FALLÓ: historial de repetición';end if;

  -- 6. Las funciones internas no se pueden llamar desde la app.
  if has_function_privilege('authenticated','public.siguiente_vence(date,text,smallint,date)','execute')
   or has_function_privilege('authenticated','public.crear_siguiente_tarea()','execute') then raise exception 'FALLÓ: funciones internas expuestas';end if;
  if (select count(*) from pg_proc where proname='mover_tarea' and pronamespace='public'::regnamespace)<>1 then raise exception 'FALLÓ: quedó la versión vieja de mover_tarea';end if;

  raise exception 'PRUEBAS OK';
end $$;
