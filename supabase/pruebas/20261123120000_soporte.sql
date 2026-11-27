-- Ejecutar completo después de 20261123120000_soporte.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Cada corrida consume números de la secuencia (no son transaccionales): deja un hueco inofensivo.
do $$
declare a uuid;o uuid;otro uuid;n bigint;ok boolean;k integer;t text;r text;q text;av uuid;
begin
  select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by nombre limit 1;
  select id into o from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='operacion' order by nombre limit 1;
  select id into otro from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='operacion' and id<>o order by nombre limit 1;
  if a is null or o is null or otro is null then raise exception 'FALTAN DATOS: un admin y dos personas de operación activos.';end if;
  if (select count(*) from public.soporte_ajustes)<>1 then raise exception 'FALLÓ: debe haber una fila de ajustes';end if;

  -- 1. Operación levanta un problema que bloquea: prioridad alta y aviso encolado.
  perform set_config('request.jwt.claims',json_build_object('sub',o,'role','authenticated')::text,true);
  n:=public.crear_ticket(jsonb_build_object('tipo','problema','titulo','Prueba del Help Desk','descripcion','Ticket de prueba, se revierte.','seccion','Otra / general','bloquea',true));
  if (select prioridad::text from public.soporte_tickets where numero=n)<>'alta' then raise exception 'FALLÓ: prioridad inicial';end if;
  if (select avisar_nuevos and cardinality(correos)>0 from public.soporte_ajustes) and not exists(select 1 from public.soporte_avisos v join public.soporte_tickets x on x.id=v.ticket_id where x.numero=n) then
   raise exception 'FALLÓ: no se encoló el aviso';
  end if;

  -- 2. Otra persona no lo ve; quien lo levantó no lo puede cambiar.
  perform set_config('request.jwt.claims',json_build_object('sub',otro,'role','authenticated')::text,true);
  if exists(select 1 from public.tickets_visibles(n)) then raise exception 'FALLÓ: otra persona ve el ticket';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',o,'role','authenticated')::text,true);
  ok:=false;begin perform public.cambiar_ticket(n,1,'{"estado":"en_revision"}'::jsonb);exception when others then ok:=sqlerrm like 'Solo soporte%';end;
  if not ok then raise exception 'FALLÓ: operación cambió el estado';end if;

  -- now() es fijo dentro de una transacción: se atrasa la lectura para que la respuesta cuente como posterior (en la app cada llamada es otra transacción).
  update public.soporte_lecturas set leido_en=leido_en-interval '1 minute' where ticket_id=(select id from public.soporte_tickets where numero=n);

  -- 3. Admin lo resuelve con respuesta; quien reporta tiene novedad.
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  ok:=false;begin perform public.cambiar_ticket(n,1,'{"estado":"resuelto"}'::jsonb);exception when others then ok:=sqlerrm like 'Para cerrar%';end;
  if not ok then raise exception 'FALLÓ: resolvió sin respuesta';end if;
  perform public.cambiar_ticket(n,1,'{"estado":"resuelto","comentario":"Listo, era una prueba."}'::jsonb);
  perform set_config('request.jwt.claims',json_build_object('sub',o,'role','authenticated')::text,true);
  if not (select sin_leer from public.tickets_visibles(n)) then raise exception 'FALLÓ: quien reporta no ve la respuesta como nueva';end if;
  if (select pendientes from public.contar_soporte())<1 then raise exception 'FALLÓ: contador de quien reporta';end if;

  -- 4. La cola de n8n toma y reporta (como service_role).
  perform set_config('request.jwt.claims',json_build_object('role','service_role')::text,true);
  select aviso_id into av from public.soporte_tomar_avisos(10) limit 1;
  if av is not null then perform public.soporte_resultado_aviso(av,true,null);
   if (select estado from public.soporte_avisos where id=av)<>'enviado' then raise exception 'FALLÓ: resultado del aviso';end if;
  end if;

  -- 5. Bucket privado y permisos: nadie escribe directo; authenticated no toma avisos.
  if not exists(select 1 from storage.buckets where id='soporte' and not public) then raise exception 'FALLÓ: bucket soporte';end if;
  if has_function_privilege('authenticated','public.soporte_tomar_avisos(integer)','execute') then raise exception 'FALLÓ: authenticated toma avisos';end if;
  foreach r in array array['anon','authenticated'] loop
   foreach t in array array['public.soporte_tickets','public.soporte_comentarios','public.soporte_historial','public.soporte_lecturas','public.soporte_ajustes','public.soporte_avisos'] loop
    foreach q in array array['insert','update','delete'] loop
     if has_table_privilege(r,t,q) then raise exception 'FALLÓ: % puede % directo en %',r,q,t;end if;
    end loop;
   end loop;
  end loop;

  raise exception 'PRUEBAS OK';
end $$;
