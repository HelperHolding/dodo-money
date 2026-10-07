-- Después de migración y carga. PRUEBAS OK revierte datos; las secuencias pueden dejar huecos.
do $$
declare a uuid;c uuid;g uuid;s uuid;m uuid;b uuid;q uuid;r uuid;otro uuid;n integer;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id,sucursal_id into g,s from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' and sucursal_id is not null limit 1;
 if a is null or c is null or g is null then raise exception 'FALTAN DATOS: admin, corporativo y gerente con sucursal, activos y sin cambio de contraseña pendiente.';end if;
 if (select count(*) from public.kb_articulos where slug in ('bienvenida','turnos-cortes','gastos-sin-cfdi','mermas-pl','costeo','rappi','aperturas','activos'))<>8 then raise exception 'FALTAN DATOS: carga de manuales 0039.';end if;
 -- Aislar las cuotas durante la prueba; el RAISE final restaura los registros originales.
 update public.ia_consultas set iniciado_en=now()-interval '30 days' where usuario_id in(a,c,g) and iniciado_en>=now()-interval '1 day';
 update public.kb_preguntas set creado_en=now()-interval '30 days' where autor_id=c and creado_en>=now()-interval '1 hour';
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 m:=public.kb_guardar_articulo(null,0,'Manual privado de prueba','Pruebas','Contenido técnico de prueba con información autorizada.',array['admin'],true);
 b:=public.kb_guardar_articulo(null,0,'Borrador de prueba','Pruebas','Contenido de borrador con suficientes caracteres.',array['admin','corporativo'],false);
 begin perform public.kb_guardar_articulo(m,0,'Cambio obsoleto','Pruebas','Contenido de prueba que no debe reemplazar el manual.',array['admin'],true);raise exception 'FALLÓ: revisión del manual';exception when others then if sqlerrm<>'El manual cambió. Recarga antes de guardar.' then raise;end if;end;
 begin perform public.kb_guardar_articulo(null,0,'Título válido','Pruebas','Contenido de prueba con audiencia inválida.',array['externo'],true);raise exception 'FALLÓ: audiencia';exception when check_violation then null;end;
 perform public.kb_guardar_articulo(m,1,'Manual privado de prueba','Pruebas','Segunda versión del contenido técnico de prueba.',array['admin'],true);
 if (select count(*) from public.kb_historial where articulo_id=m)<>2 then raise exception 'FALLÓ: historial manual';end if;
 set local role authenticated;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if exists(select 1 from public.kb_articulos where id in(m,b)) then raise exception 'FALLÓ: borrador o audiencia filtrada';end if;
 if not exists(select 1 from public.kb_articulos where slug='bienvenida') then raise exception 'FALLÓ: manual publicado';end if;
 q:=public.kb_preguntar('Pregunta de prueba','Cómo se consulta el inventario de activos?');
 begin perform public.kb_responder(q,1,'Respuesta no autorizada');raise exception 'FALLÓ: corporativo responde';exception when others then if sqlerrm<>'Solo administración publica respuestas oficiales.' then raise;end if;end;
 begin perform public.kb_guardar_articulo(null,0,'Nuevo manual','Pruebas','Contenido no autorizado de manual.',array['corporativo'],true);raise exception 'FALLÓ: corporativo publica manual';exception when others then if sqlerrm<>'Solo administración publica manuales.' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform public.kb_responder(q,1,'Abre Activos y selecciona la sucursal para consultar el inventario.');
 begin perform public.kb_responder(q,1,'Respuesta obsoleta de prueba');raise exception 'FALLÓ: revisión respuesta';exception when others then if sqlerrm<>'La pregunta cambió. Recarga antes de guardar.' then raise;end if;end;
 if not exists(select 1 from public.kb_historial where pregunta_id=q) then raise exception 'FALLÓ: historial respuesta';end if;
 r:=public.ia_reservar_consulta();perform public.ia_cerrar_consulta(r,'completada','modelo-de-prueba',10,5,'[]');
 begin perform public.ia_cerrar_consulta(r,'error','modelo-de-prueba',0,0,'[]');raise exception 'FALLÓ: doble cierre';exception when others then if sqlerrm<>'La consulta no existe o ya se cerró.' then raise;end if;end;
 otro:=public.ia_reservar_consulta();perform public.ia_reservar_consulta();
 begin perform public.ia_reservar_consulta();raise exception 'FALLÓ: cuota por minuto';exception when others then if sqlerrm<>'Espera un minuto antes de consultar otra vez.' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 r:=public.ia_reservar_consulta();
 if not exists(select 1 from public.ia_consultas where id=r and sucursal_id=s) then raise exception 'FALLÓ: alcance gerente';end if;
 if exists(select 1 from public.ia_consultas where id=otro) then raise exception 'FALLÓ: consulta ajena visible';end if;
 begin perform public.ia_cerrar_consulta(otro,'error','modelo-de-prueba',0,0,'[]');raise exception 'FALLÓ: cierra consulta ajena';exception when others then if sqlerrm<>'La consulta no existe o ya se cerró.' then raise;end if;end;
 begin update public.kb_articulos set publicado=true where id=b;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 if has_table_privilege('authenticated','public.kb_preguntas','INSERT') or has_table_privilege('authenticated','public.kb_historial','DELETE') or has_table_privilege('authenticated','public.ia_consultas','UPDATE') then raise exception 'FALLÓ: permisos directos';end if;
 perform set_config('request.jwt.claims','{"role":"authenticated"}',true);
 if exists(select 1 from public.kb_articulos) or exists(select 1 from public.kb_preguntas) then raise exception 'FALLÓ: consulta sin perfil';end if;
 begin perform public.kb_preguntar('Sin perfil','Pregunta no autorizada');raise exception 'FALLÓ: pregunta sin perfil';exception when others then if sqlerrm<>'Necesitas un usuario activo.' then raise;end if;end;
 begin perform public.ia_reservar_consulta();raise exception 'FALLÓ: IA sin perfil';exception when others then if sqlerrm<>'Sin acceso al asistente.' then raise;end if;end;
 raise exception 'PRUEBAS OK — manuales y audiencias · borradores privados · historial y revisión · usuarios preguntan · administración responde · gerente con sucursal · cuotas de IA · cierre único · consultas ajenas privadas · sin escritura directa';
end $$;
