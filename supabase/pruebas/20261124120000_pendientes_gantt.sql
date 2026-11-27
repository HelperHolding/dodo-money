-- Ejecutar después de supabase/migrations/20261124120000_pendientes_gantt.sql. PRUEBAS OK es un ERROR intencional: revierte todo.
do $$
declare a uuid;i public.apertura_items;n bigint;m bigint;r integer;e text;
begin
 select id into a from public.perfiles where activo and rol::text='admin' order by nombre limit 1;
 select * into i from public.apertura_items where tipo='actividad' and estado not in ('completado','no_aplica') order by clave limit 1;
 if a is null or i.id is null then raise exception 'FALTAN DATOS: un admin activo y una actividad de apertura abierta.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 if not exists(select 1 from pg_trigger where tgname='tareas_completan_apertura' and not tgisinternal) then raise exception 'FALLÓ: falta el disparador.';end if;
 if (select texto from public.documento_tarea('apertura_item',i.id)) not like '% · '||i.etapa||' %' then raise exception 'FALLÓ: el texto del pendiente no trae la etapa.';end if;

 n:=public.crear_tarea(jsonb_build_object('titulo','Ensayo pendiente Gantt','asignado_a',a,'documento_tipo','apertura_item','documento_id',i.id));
 m:=public.crear_tarea(jsonb_build_object('titulo','Ensayo pendiente Gantt 2','asignado_a',a,'documento_tipo','apertura_item','documento_id',i.id));
 -- Uno hecho con otro abierto: no se completa.
 select revision into r from public.tareas where numero=n; perform public.mover_tarea(n,r,'en_revision','');
 select revision into r from public.tareas where numero=n; perform public.mover_tarea(n,r,'hecho','');
 if (select estado from public.apertura_items where id=i.id)='completado' then raise exception 'FALLÓ: se completó con un pendiente abierto.';end if;
 -- El abierto se cancela y se cierra un tercero: ya no queda nada abierto, se completa.
 select revision into r from public.tareas where numero=m; perform public.mover_tarea(m,r,'cancelada','Ensayo de cancelación');
 m:=public.crear_tarea(jsonb_build_object('titulo','Ensayo pendiente Gantt 3','asignado_a',a,'documento_tipo','apertura_item','documento_id',i.id));
 select revision into r from public.tareas where numero=m; perform public.mover_tarea(m,r,'en_revision','');
 select revision into r from public.tareas where numero=m; perform public.mover_tarea(m,r,'hecho','');
 select estado into e from public.apertura_items where id=i.id;
 if e is distinct from 'completado' then raise exception 'FALLÓ: no se completó al quedar hechos los pendientes (estado %).',e;end if;
 if not exists(select 1 from public.apertura_historial where item_id=i.id and nuevo->>'estado'='completado' and usuario_id=a) then raise exception 'FALLÓ: falta el historial.';end if;
 raise exception 'PRUEBAS OK';
end $$;
