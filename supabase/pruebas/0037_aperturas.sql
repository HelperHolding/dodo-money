-- Después de migración y carga inicial. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;c uuid;p uuid;i uuid;t uuid;r integer;d jsonb;pr integer;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and rol::text='corporativo' limit 1;
 select x.id,x.revision into p,pr from public.apertura_proyectos x join public.sucursales s on s.id=x.sucursal_id where lower(trim(s.nombre))='dodo-2';
 if a is null or c is null or p is null then raise exception 'FALTAN DATOS: admin, corporativo y carga de dodo-2.';end if;
 if (select count(*) from public.apertura_items where proyecto_id=p and clave like 'T-%')<>70
 or (select count(*) from public.apertura_items where proyecto_id=p and clave like 'PL-%')<>100
 or (select count(*) from public.apertura_items where proyecto_id=p and clave like 'REF-%')<>287
 or (select count(*) from public.apertura_items where proyecto_id=p and clave like 'TEC-%')<>64 then raise exception 'FALLÓ: carga inicial incompleta';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 i:=public.agregar_apertura_item(p,'equipo','P4','Equipo de prueba');
 t:=public.agregar_apertura_item(p,'actividad','P1','Actividad de prueba');
 d:=jsonb_build_object('estado','pedido','cantidad','2','recibido','0','precio','100','responsable','Julio Veredeja','evidencia','Pedido de prueba');
 perform public.actualizar_apertura_item(i,1,d);
 if not exists(select 1 from public.apertura_items where id=i and estado='pedido' and cantidad=2 and precio=100 and revision=2) then raise exception 'FALLÓ: actualización';end if;
 if not exists(select 1 from public.apertura_historial where item_id=i and usuario_id=a and anterior->>'estado'='por_cotizar' and nuevo->>'estado'='pedido') then raise exception 'FALLÓ: historial';end if;
 begin perform public.actualizar_apertura_item(i,1,d);raise exception 'FALLÓ: actualización obsoleta';exception when others then if sqlerrm<>'El registro cambió. Recarga antes de guardar.' then raise;end if;end;
 begin perform public.actualizar_apertura_item(i,2,d||'{"estado":"verificado","recibido":"1"}'::jsonb);raise exception 'FALLÓ: verificado sin recepción';exception when others then if sqlerrm<>'Confirma la cantidad necesaria y la recepción completa.' then raise;end if;end;
 begin perform public.actualizar_apertura_item(i,2,d||'{"estado":"recibido_parcial","recibido":"0"}'::jsonb);raise exception 'FALLÓ: parcial cero';exception when others then if sqlerrm<>'La recepción parcial debe ser mayor que cero y menor a la cantidad necesaria.' then raise;end if;end;
 perform public.actualizar_apertura_item(i,2,d||'{"estado":"recibido_parcial","recibido":"1"}'::jsonb);
 perform public.actualizar_apertura_item(i,3,d||'{"estado":"verificado","recibido":"2"}'::jsonb);
 begin perform public.actualizar_apertura_item(i,4,d||'{"estado":"verificado","recibido":"2","evidencia":""}'::jsonb);raise exception 'FALLÓ: sin evidencia';exception when others then if sqlerrm<>'Registra evidencia o el motivo de no aplicar.' then raise;end if;end;
 begin perform public.actualizar_apertura_item(i,4,d||jsonb_build_object('orden_id',gen_random_uuid()));raise exception 'FALLÓ: orden ajena';exception when others then if sqlerrm<>'La orden debe pertenecer a la sucursal del proyecto.' then raise;end if;end;
 begin perform public.actualizar_apertura_item(i,4,d||jsonb_build_object('factura_id',gen_random_uuid()));raise exception 'FALLÓ: factura ajena';exception when others then if sqlerrm<>'La factura debe pertenecer a la sucursal del proyecto.' then raise;end if;end;
 begin perform public.actualizar_apertura_item(t,1,d);raise exception 'FALLÓ: pedido para actividad';exception when others then if sqlerrm<>'Estado inválido para este registro.' then raise;end if;end;
 begin perform public.actualizar_apertura_item(i,4,d||'{"nombre":"pisar fuente"}'::jsonb);raise exception 'FALLÓ: modificación de fuente';exception when others then if sqlerrm<>'Datos de apertura inválidos.' then raise;end if;end;
 begin perform public.actualizar_apertura_item(i,4,d||'{"cantidad":"-1"}'::jsonb);raise exception 'FALLÓ: cantidad negativa';exception when check_violation then null;end;
 begin perform public.actualizar_apertura_item(i,4,d||'{"inicio":"2026-11-20","fin":"2026-11-19"}'::jsonb);raise exception 'FALLÓ: fechas invertidas';exception when check_violation then null;end;
 perform public.actualizar_apertura_proyecto(p,pr,'Julio Veredeja','2026-12-01','2026-12-07',100000);
 if not exists(select 1 from public.apertura_proyecto_historial where proyecto_id=p and usuario_id=a and (nuevo->>'presupuesto')::numeric=100000) then raise exception 'FALLÓ: presupuesto con historial';end if;
 set local role authenticated;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from public.apertura_items where id=i) then raise exception 'FALLÓ: corporativo no consulta';end if;
 begin perform public.actualizar_apertura_item(i,4,d);raise exception 'FALLÓ: corporativo edita';exception when others then if sqlerrm<>'Solo administración puede editar aperturas.' then raise;end if;end;
 begin perform public.agregar_apertura_item(p,'equipo','P4','No autorizado');raise exception 'FALLÓ: corporativo agrega';exception when others then if sqlerrm<>'Solo administración puede editar aperturas.' then raise;end if;end;
 begin perform public.actualizar_apertura_proyecto(p,pr+1,'Otro','2026-12-01','2026-12-07',200000);raise exception 'FALLÓ: corporativo cambia proyecto';exception when others then if sqlerrm<>'Solo administración puede editar aperturas.' then raise;end if;end;
 begin update public.apertura_items set estado='verificado' where id=i;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','public.apertura_proyectos','UPDATE') or has_table_privilege('authenticated','public.apertura_historial','INSERT') or has_table_privilege('authenticated','public.apertura_proyecto_historial','INSERT') then raise exception 'FALLÓ: permisos';end if;
 raise exception 'PRUEBAS OK — carga de dodo-2 · admin gestiona · cantidades y fechas · recepción parcial y verificación · evidencia · conserva fuente · documentos de sucursal · historial · evita sobrescritura · presupuesto · corporativo consulta · sin escritura directa';
end $$;
