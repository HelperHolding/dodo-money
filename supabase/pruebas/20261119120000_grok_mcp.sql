-- Ensayo reversible del conector de Grok. El RAISE PRUEBAS OK revierte todos los datos de ensayo.
-- No correr entre 00:00 y 00:02 (hora de México): el límite diario se ensaya con llamadas de hace 90 s.
do $$
declare a uuid;c uuid;g uuid;r uuid;r2 uuid;i int;n int;ok boolean;
 inicio timestamptz:=date_trunc('day',now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id into g from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' limit 1;
 if a is null or c is null or g is null then raise exception 'FALTAN DATOS: admin, corporativo y gerente activos.';end if;
 -- 290 llamadas de hace 90 s: cuentan para el día, no para el minuto.
 insert into public.mcp_llamadas(usuario_id,herramienta,estado,iniciado_en)
  select c,'ventas','completada',greatest(inicio,now()-interval '90 seconds') from generate_series(1,290);

 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 set local role authenticated;
 r:=public.mcp_reservar_llamada('ventas','{"desde":"2026-11-01","hasta":"2026-11-07"}');
 -- Herramienta o argumentos inválidos se rechazan.
 ok:=false;begin perform public.mcp_reservar_llamada('borrar','{}');exception when others then ok:=true;end;
 if not ok then raise exception 'FALLA: herramienta inválida aceptada';end if;
 ok:=false;begin perform public.mcp_reservar_llamada('ventas','[1]');exception when others then ok:=true;end;
 if not ok then raise exception 'FALLA: argumentos no objeto aceptados';end if;
 -- Diez por minuto: nueve más pasan y la undécima no.
 for i in 2..10 loop r2:=public.mcp_reservar_llamada('cortes','{}');end loop;
 ok:=false;begin perform public.mcp_reservar_llamada('ventas','{}');exception when others then ok:=sqlerrm like 'Espera un minuto%';end;
 if not ok then raise exception 'FALLA: límite por minuto';end if;
 -- Corporativo no lee el registro.
 select count(*) into n from public.mcp_llamadas;
 if n<>0 then raise exception 'FALLA: corporativo leyó % llamadas',n;end if;
 -- Cierre: estado inválido, cierre propio y segundo cierre.
 ok:=false;begin perform public.mcp_cerrar_llamada(r,'rara',null);exception when others then ok:=true;end;
 if not ok then raise exception 'FALLA: estado inválido aceptado';end if;
 perform public.mcp_cerrar_llamada(r,'completada',null);
 ok:=false;begin perform public.mcp_cerrar_llamada(r,'error','otra vez');exception when others then ok:=sqlerrm like 'La llamada no existe%';end;
 if not ok then raise exception 'FALLA: segundo cierre aceptado';end if;

 -- Admin no cierra la llamada de otro, pero sí lee el registro.
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 ok:=false;begin perform public.mcp_cerrar_llamada(r2,'completada',null);exception when others then ok:=sqlerrm like 'La llamada no existe%';end;
 if not ok then raise exception 'FALLA: admin cerró llamada ajena';end if;
 select count(*) into n from public.mcp_llamadas where usuario_id=c;
 if n<300 then raise exception 'FALLA: admin ve % llamadas, esperaba 300 o más',n;end if;

 -- Límite diario: las diez recientes pasan a hace 90 s y la llamada 301 del día se rechaza.
 reset role;
 update public.mcp_llamadas set iniciado_en=greatest(inicio,now()-interval '90 seconds') where usuario_id=c and iniciado_en>now()-interval '1 minute';
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 set local role authenticated;
 ok:=false;begin perform public.mcp_reservar_llamada('ventas','{}');exception when others then ok:=sqlerrm like 'Llegaste al límite%';end;
 if not ok then raise exception 'FALLA: límite diario';end if;

 -- Gerente sin acceso; anon sin permiso de ejecutar.
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 ok:=false;begin perform public.mcp_reservar_llamada('ventas','{}');exception when others then ok:=sqlerrm like 'Sin acceso%';end;
 if not ok then raise exception 'FALLA: gerente reservó';end if;
 reset role;set local role anon;
 ok:=false;begin perform public.mcp_reservar_llamada('ventas','{}');exception when insufficient_privilege then ok:=true;end;
 if not ok then raise exception 'FALLA: anon ejecutó';end if;
 reset role;
 raise exception 'PRUEBAS OK';
end $$;
