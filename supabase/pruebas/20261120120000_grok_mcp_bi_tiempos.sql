-- Ensayo reversible: el registro del conector de Grok acepta las herramientas bi y tiempos. El RAISE PRUEBAS OK revierte todo.
-- Elige un corporativo que no sea la cuenta Grok Bot, para no chocar con el límite por minuto si el bot está en uso.
do $$
declare c uuid;ok boolean;
begin
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo'
  order by (nombre='Grok Bot'), id limit 1;
 if c is null then raise exception 'FALTAN DATOS: un corporativo activo.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 set local role authenticated;
 perform public.mcp_cerrar_llamada(public.mcp_reservar_llamada(h,'{"desde":"2026-11-09","hasta":"2026-11-15"}'),'completada',null) from unnest(array['bi','tiempos']) h;
 -- Las siete anteriores siguen aceptándose; un nombre desconocido no.
 perform public.mcp_cerrar_llamada(public.mcp_reservar_llamada(h,'{}'),'completada',null) from unnest(array['sucursales','ventas','productos','cortes','costos','manuales','pl']) h;
 ok:=false;begin perform public.mcp_reservar_llamada('borrar','{}');exception when check_violation then ok:=true;end;
 if not ok then raise exception 'FALLA: herramienta desconocida aceptada';end if;
 reset role;
 raise exception 'PRUEBAS OK';
end $$;
