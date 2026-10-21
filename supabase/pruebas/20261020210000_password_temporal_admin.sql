-- Ensayo reversible: PRUEBAS OK se emite como excepción y deshace TODO, incluidos hashes de prueba.
do $pruebas$
declare a uuid;u uuid;sol uuid:=gen_random_uuid();v text;n integer;original jsonb;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select p.id into u from public.perfiles p where p.id<>a and p.activo and not p.debe_cambiar_contrasena
  and p.rol::text in ('gerente','encargado','operacion')
  and not exists(select 1 from public.usuarios_invitaciones i where i.usuario_id=p.id and i.estado<>'aceptada')
  and not exists(select 1 from public.password_temporal_solicitudes s where s.usuario_id=p.id)
 limit 1;
 if a is null or u is null then raise exception 'FALTAN DATOS: administrador activo y otro usuario de sucursal sin invitación o restablecimiento pendiente.';end if;
 select jsonb_build_object('rol',rol,'sucursal_id',sucursal_id,'activo',activo) into original from public.perfiles where id=u;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 begin
  perform public.preparar_password_temporal(gen_random_uuid(),a,'Prueba propia');
  raise exception 'FALLÓ: restablecimiento propio.';
 exception when raise_exception then if sqlerrm not like '%propia cuenta%' then raise;end if;end;
 begin
  perform public.preparar_password_temporal(gen_random_uuid(),u,'');
  raise exception 'FALLÓ: motivo vacío.';
 exception when raise_exception then if sqlerrm not like '%motivo%' then raise;end if;end;
 v:=public.preparar_password_temporal(sol,u,'Prueba de contraseña temporal');
 if v<>'preparada' then raise exception 'FALLÓ: reserva.';end if;
 begin
  perform public.preparar_password_temporal(sol,u,'Prueba de contraseña temporal');
  raise exception 'FALLÓ: doble envío concurrente.';
 exception when raise_exception then if sqlerrm not like '%en curso%' then raise;end if;end;
 begin
  perform public.preparar_password_temporal(gen_random_uuid(),u,'Otra solicitud simultánea');
  raise exception 'FALLÓ: dos asignaciones simultáneas.';
 exception when raise_exception then if sqlerrm not like '%asignación en curso%' then raise;end if;end;
 execute 'reset role';
 -- Simula la actualización que hace Auth con app_metadata exclusivo de administración.
 update auth.users set encrypted_password='ensayo-temporal-'||sol::text where id=u;
 update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}')||jsonb_build_object('dodo_password_temporal_id',sol) where id=u;
 set constraints auth.password_cambiado_perfil immediate;
 set constraints auth.password_cambiado_perfil deferred;
 if not exists(select 1 from public.perfiles where id=u and debe_cambiar_contrasena) then raise exception 'FALLÓ: no exige cambio.';end if;
 if (select jsonb_build_object('rol',rol,'sucursal_id',sucursal_id,'activo',activo) from public.perfiles where id=u) is distinct from original then raise exception 'FALLÓ: cambió alcance o estado.';end if;
 select count(*) into n from public.usuarios_historial where usuario_id=u and autor_id=a and motivo='Contraseña temporal asignada: Prueba de contraseña temporal';
 if n<>1 then raise exception 'FALLÓ: historial único.';end if;
 execute 'set local role authenticated';
 v:=public.preparar_password_temporal(sol,u,'Prueba de contraseña temporal');
 if v<>'aplicada' then raise exception 'FALLÓ: idempotencia.';end if;
 execute 'reset role';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if public.mi_rol() is not null or public.mi_sucursal() is not null then raise exception 'FALLÓ: opera con temporal.';end if;
 begin
  perform public.contrasena_cambiada();
  raise exception 'FALLÓ: liberación sin cambiar password.';
 exception when raise_exception then if sqlerrm not like '%Cambia tu contraseña%' then raise;end if;end;
 begin
  perform public.preparar_password_temporal(gen_random_uuid(),a,'Prueba sin permiso');
  raise exception 'FALLÓ: usuario asigna contraseñas.';
 exception when raise_exception then if sqlerrm not like '%Solo administración%' then raise;end if;end;
 execute 'reset role';
 -- Cambio real posterior del usuario (no cambia el marcador privado).
 update auth.users set encrypted_password='ensayo-personal-'||sol::text where id=u;
 set constraints auth.password_cambiado_perfil immediate;
 if exists(select 1 from public.perfiles where id=u and debe_cambiar_contrasena) then raise exception 'FALLÓ: no libera tras cambio real.';end if;
 execute 'set local role authenticated';
 perform public.contrasena_cambiada();
 begin
  perform public.preparar_password_temporal(gen_random_uuid(),a,'Prueba con rol de sucursal');
  raise exception 'FALLÓ: sucursal asigna contraseñas.';
 exception when raise_exception then if sqlerrm not like '%Solo administración%' then raise;end if;end;
 execute 'reset role';
 if has_function_privilege('anon','public.preparar_password_temporal(uuid,uuid,text)','execute')
 or has_table_privilege('authenticated','public.password_temporal_solicitudes','insert') then raise exception 'FALLÓ: acceso directo.';end if;
 raise exception 'PRUEBAS OK — contraseña temporal por admin · propia cuenta protegida · motivo · reserva única · cambio obligatorio · sin operar con temporal · cambio personal libera · idempotencia · historial sin contraseña · alcance conservado · sucursal sin gestión · sin acceso directo · anónimo sin ejecución';
end
$pruebas$;
