-- Ejecutar completo después de 20261124120000_soporte_agente.sql. PRUEBAS OK revierte todo mediante un ERROR intencional.
do $$
declare a uuid;o uuid;n bigint;tid uuid;r text;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by nombre limit 1;
 select id into o from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='operacion' order by nombre limit 1;
 if a is null or o is null then raise exception 'FALTAN DATOS: un admin y una persona de operación activos.';end if;
 update public.soporte_ajustes set agente_activo=true where id;

 -- 1. Con el agente activo, el alta queda pendiente y no avisa.
 perform set_config('request.jwt.claims',json_build_object('sub',o,'role','authenticated')::text,true);
 n:=public.crear_ticket(jsonb_build_object('tipo','problema','titulo','Prueba del agente','descripcion','Ticket de prueba, se revierte.','seccion','Otra / general'));
 select id into tid from public.soporte_tickets where numero=n;
 if (select agente_estado from public.soporte_tickets where id=tid) is distinct from 'pendiente' then raise exception 'FALLÓ: no quedó pendiente';end if;
 if exists(select 1 from public.soporte_avisos where ticket_id=tid) then raise exception 'FALLÓ: avisó con el agente activo';end if;

 -- 2. El agente escala: en revisión, aviso «escalado», quien reporta no ve la nota interna.
 r:=public.agente_cerrar_ticket(tid,'escalado','Le pasé esto a soporte.','Nota interna de prueba','media','prueba',1,1);
 if r<>'escalado' or (select estado::text from public.soporte_tickets where id=tid)<>'en_revision' then raise exception 'FALLÓ: escalado';end if;
 if (select cardinality(correos)>0 from public.soporte_ajustes)
   and not exists(select 1 from public.soporte_avisos where ticket_id=tid and evento='escalado') then raise exception 'FALLÓ: aviso escalado';end if;
 if exists(select 1 from public.hilo_ticket(n) where interna) then raise exception 'FALLÓ: quien reporta ve la nota interna';end if;
 if public.agente_cerrar_ticket(tid,'resuelto','otra','',null,'prueba',1,1)<>'ignorado' then raise exception 'FALLÓ: segundo cierre';end if;

 -- 3. Soporte sí ve la nota; permisos.
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 if not exists(select 1 from public.hilo_ticket(n) where interna) then raise exception 'FALLÓ: soporte no ve la nota';end if;
 if has_function_privilege('authenticated','public.agente_cerrar_ticket(uuid,text,text,text,text,text,integer,integer)','execute') then
  raise exception 'FALLÓ: authenticated puede cerrar como agente';
 end if;

 raise exception 'PRUEBAS OK';
end $$;
