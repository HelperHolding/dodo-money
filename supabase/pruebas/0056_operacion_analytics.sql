-- Ensayo reversible: PRUEBAS OK revierte todas las inserciones.
do $$
declare a uuid;c uuid;g uuid;s uuid;s2 uuid;n uuid;n2 uuid;j jsonb;d jsonb;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id,sucursal_id into g,s from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' and sucursal_id is not null limit 1;
 if a is null or c is null or g is null then raise exception 'FALTAN DATOS: admin, corporativo y gerente activos.';end if;
 insert into public.sucursales(nombre) values('Operación ensayo '||gen_random_uuid()) returning id into s2;
 d:='{"pedidos":10,"preparacion_ms":600000,"pedidos_preparados":10,"demorados":2,"cola_ms":120000,"horas":0,"productos":20,"productividad":null,"paradas_producto":1,"paradas_insumo":0,"parada_tienda_ms":0,"cola_larga":0.2}'::jsonb;
 j:=jsonb_build_array(jsonb_build_object('fecha','2026-10-11','datos',d));
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 n:=public.importar_operacion_analytics(s2,'Ensayo.csv',repeat('a',64),date '2026-10-11',j,false);
 n2:=public.importar_operacion_analytics(s2,'Ensayo.csv',repeat('a',64),date '2026-10-11',j,false);
 if n<>n2 or (select count(*) from public.operacion_dias where importacion_id=n)<>1 then raise exception 'FALLÓ: doble envío';end if;
 begin perform public.importar_operacion_analytics(s2,'Otro.csv',repeat('b',64),date '2026-10-11',j,false);raise exception 'FALLÓ: reemplazo implícito';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 n2:=public.importar_operacion_analytics(s2,'Corregido.csv',repeat('b',64),date '2026-10-11',jsonb_build_array(jsonb_build_object('fecha','2026-10-11','datos',d||'{"demorados":3}'::jsonb)),true);
 if not exists(select 1 from public.operacion_dias where importacion_id=n and sustituido_por=n2 and original=j->0) or (select count(*) from public.operacion_dias where sucursal_id=s2 and sustituido_por is null)<>1 then raise exception 'FALLÓ: historial';end if;
 begin perform public.importar_operacion_analytics(s2,'Inválido.csv',repeat('c',64),date '2026-10-10',j,true);raise exception 'FALLÓ: cobertura';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.importar_operacion_analytics(s2,'Inválido.csv',repeat('c',64),date '2026-10-11',j||j,true);raise exception 'FALLÓ: fecha duplicada';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.importar_operacion_analytics(s2,'Inválido.csv',repeat('c',64),date '2026-10-11',jsonb_build_array(jsonb_build_object('fecha','2026-10-11','datos',d||'{"cola_larga":2}'::jsonb)),true);raise exception 'FALLÓ: porcentaje';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin update public.operacion_dias set datos='{}' where importacion_id=n;raise exception 'FALLÓ: escritura';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from public.operacion_dias where importacion_id=n2) then raise exception 'FALLÓ: consulta corporativo';end if;
 begin perform public.importar_operacion_analytics(s2,'Ensayo.csv',repeat('d',64),date '2026-10-11',j,true);raise exception 'FALLÓ: corporativo escribe';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 if exists(select 1 from public.operacion_dias where sucursal_id=s2) then raise exception 'FALLÓ: gerente ve ajena';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 n:=public.importar_operacion_analytics(s,'Gerente.csv',repeat('e',64),date '2026-10-11',j,true);
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 if not exists(select 1 from public.operacion_dias where importacion_id=n) then raise exception 'FALLÓ: gerente no ve propia';end if;
 reset role;set local role anon;
 begin perform public.importar_operacion_analytics(s2,'Ensayo.csv',repeat('f',64),date '2026-10-11',j,true);raise exception 'FALLÓ: anónimo';exception when insufficient_privilege then null;end;
 reset role;
 raise exception 'PRUEBAS OK — operación por día · fuente y cobertura · doble envío · reemplazo explícito · conserva original e historial · fechas y porcentajes · gerente solo su sucursal · corporativo consulta · sin escritura directa · anónimo sin acceso';
end $$;
