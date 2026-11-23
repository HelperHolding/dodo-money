-- Ensayo reversible: el registro del conector de Grok acepta por_pagar, pagos, compras y ordenes. El RAISE PRUEBAS OK revierte todo.
-- Elige un corporativo que no sea la cuenta Grok Bot, para no chocar con el límite por minuto si el bot está en uso.
do $$
declare c uuid;ok boolean;
begin
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo'
  order by (nombre='Grok Bot'), id limit 1;
 if c is null then raise exception 'FALTAN DATOS: un corporativo activo.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 set local role authenticated;
 perform public.mcp_cerrar_llamada(public.mcp_reservar_llamada(h,'{"proveedor":"lacteos"}'),'completada',null) from unnest(array['por_pagar','pagos','compras','ordenes']) h;
 -- Las anteriores siguen aceptándose (se prueban cinco para quedar en nueve llamadas, debajo del límite de diez por
 -- minuto); un nombre desconocido no.
 perform public.mcp_cerrar_llamada(public.mcp_reservar_llamada(h,'{}'),'completada',null) from unnest(array['ventas','productos','bi','tiempos','cortes']) h;
 ok:=false;begin perform public.mcp_reservar_llamada('borrar','{}');exception when check_violation then ok:=true;end;
 if not ok then raise exception 'FALLA: herramienta desconocida aceptada';end if;
 reset role;
 raise exception 'PRUEBAS OK';
end $$;
