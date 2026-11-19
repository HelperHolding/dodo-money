-- Ensayo reversible: el registro del conector de Grok acepta la herramienta productos. El RAISE PRUEBAS OK revierte todo.
do $$
declare c uuid;r uuid;ok boolean;
begin
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 if c is null then raise exception 'FALTAN DATOS: un corporativo activo.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 set local role authenticated;
 r:=public.mcp_reservar_llamada('productos','{"desde":"2026-11-09","hasta":"2026-11-15","busqueda":"pepperoni"}');
 perform public.mcp_cerrar_llamada(r,'completada',null);
 -- Las seis herramientas anteriores siguen aceptándose; un nombre desconocido no.
 perform public.mcp_cerrar_llamada(public.mcp_reservar_llamada(h,'{}'),'completada',null) from unnest(array['sucursales','ventas','cortes','costos','manuales','pl']) h;
 ok:=false;begin perform public.mcp_reservar_llamada('borrar','{}');exception when check_violation then ok:=true;end;
 if not ok then raise exception 'FALLA: herramienta desconocida aceptada';end if;
 reset role;
 raise exception 'PRUEBAS OK';
end $$;
