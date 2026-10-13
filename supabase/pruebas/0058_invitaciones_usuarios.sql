-- Reversible: prueba la base y los triggers de Auth; no envía correos reales.
do $$
declare a uuid;c uuid;g uuid;s uuid;n uuid:=gen_random_uuid();e uuid:=gen_random_uuid();u uuid:=gen_random_uuid();j jsonb;correo text;aux uuid;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id,sucursal_id into g,s from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' limit 1;
 if a is null or c is null or g is null then raise exception 'FALTAN DATOS: admin, corporativo y gerente.';end if;
 correo:='ensayo-'||u||'@example.invalid';
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 j:=public.preparar_invitacion_usuario(n,e,correo,'Invitado ensayo','gerente',s);
 if j->>'correo'<>correo or j->>'usuario_id' is not null then raise exception 'FALLÓ: reserva';end if;
 begin perform public.preparar_invitacion_usuario(n,gen_random_uuid(),'','','',null);raise exception 'FALLÓ: doble envío';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.preparar_invitacion_usuario(gen_random_uuid(),gen_random_uuid(),'incorrecto','Persona','gerente',s);raise exception 'FALLÓ: correo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.preparar_invitacion_usuario(gen_random_uuid(),gen_random_uuid(),'valido@example.invalid','Persona','gerente',null);raise exception 'FALLÓ: sucursal';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.finalizar_envio_invitacion(n,e,null);raise exception 'FALLÓ: finalizar desde cliente';exception when insufficient_privilege then null;end;
 reset role;
 -- Simula Auth para comprobar que jamás se toma el rol enviado en user_metadata.
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data,aud,role) values(u,correo,jsonb_build_object('dodo_invitacion_id',n,'rol','admin'),'{}','authenticated','authenticated');
 if not exists(select 1 from public.perfiles where id=u and rol::text='gerente' and sucursal_id=s and debe_cambiar_contrasena) then raise exception 'FALLÓ: perfil seguro';end if;
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 set local role service_role;
 perform public.finalizar_envio_invitacion(n,e,null);
 begin perform public.finalizar_envio_invitacion(n,e,null);raise exception 'FALLÓ: cierre duplicado';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;
 update auth.users set email_confirmed_at=now() where id=u;
 perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
 set local role authenticated;
 if not public.mi_invitacion_pendiente() or public.mi_rol() is not null then raise exception 'FALLÓ: pendiente sin acceso';end if;
 if exists(select 1 from public.usuarios_invitaciones) then raise exception 'FALLÓ: invitado consulta invitaciones';end if;
 reset role;
 update auth.users set encrypted_password='hash-ensayo-no-utilizable' where id=u;
 if not exists(select 1 from public.usuarios_invitaciones where id=n and estado='aceptada') or (select debe_cambiar_contrasena from public.perfiles where id=u) then raise exception 'FALLÓ: aceptación con contraseña';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 begin perform public.preparar_invitacion_usuario(n,gen_random_uuid(),'','','',null);raise exception 'FALLÓ: reenvío aceptada';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 aux:=gen_random_uuid();
 j:=public.preparar_invitacion_usuario(aux,gen_random_uuid(),'corporativo-'||u||'@example.invalid','Corporativo ensayo','corporativo',s);
 if (select sucursal_id from public.usuarios_invitaciones where id=aux) is not null then raise exception 'FALLÓ: alcance general';end if;
 begin update public.usuarios_invitaciones set rol='admin' where id=n;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if exists(select 1 from public.usuarios_invitaciones_historial) then raise exception 'FALLÓ: historial privado';end if;
 begin perform public.preparar_invitacion_usuario(gen_random_uuid(),gen_random_uuid(),correo,'Persona','admin',s);raise exception 'FALLÓ: corporativo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 begin perform public.preparar_invitacion_usuario(gen_random_uuid(),gen_random_uuid(),correo,'Persona','admin',s);raise exception 'FALLÓ: gerente';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if has_function_privilege('anon','public.preparar_invitacion_usuario(uuid,uuid,text,text,text,uuid)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — alta por invitación · correo y sucursal · rol desde reserva privada · pendiente sin permisos · contraseña libera · alcance general · doble envío · cierre único · historial privado · corporativo y gerente sin altas · sin escritura directa · anónimo sin ejecución';
end $$;
