-- Ejecutar después de 0036. PRUEBAS OK es una excepción intencional: revierte todos los cambios.
do $$
declare a uuid;c uuid;p uuid;s uuid;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and rol::text='corporativo' limit 1;
 select id into p from public.proveedores limit 1;
 if a is null or c is null or p is null then raise exception 'FALTAN DATOS: admin, corporativo y proveedor.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform public.guardar_portal_proveedor(p,'https://portal.example.com','usuario',' prueba ','Notas de prueba');
 select secreto_id into s from public.proveedor_portales where proveedor_id=p;
 if s is null or (select secret from vault.secrets where id=s)=' prueba ' then raise exception 'FALLÓ: cifrado';end if;
 if public.revelar_portal_proveedor(p)<>' prueba ' then raise exception 'FALLÓ: revelado o espacios';end if;
 perform public.guardar_portal_proveedor(p,'https://portal.example.com/login','otro',null,null);
 if public.revelar_portal_proveedor(p)<>' prueba ' then raise exception 'FALLÓ: contraseña vacía no conserva';end if;
 perform public.guardar_portal_proveedor(p,'https://portal.example.com','otro','nueva',null);
 if public.revelar_portal_proveedor(p)<>'nueva' or (select secreto_id from public.proveedor_portales where proveedor_id=p)<>s then raise exception 'FALLÓ: actualización';end if;
 if not exists(select 1 from public.proveedor_portales_historial where proveedor_id=p and accion='revelar' and usuario_id=a) then raise exception 'FALLÓ: auditoría';end if;
 begin perform public.guardar_portal_proveedor(p,'javascript:alert(1)','u','p',null);raise exception 'FALLÓ: URL';exception when others then if sqlerrm<>'Datos del portal inválidos.' then raise;end if;end;
 begin perform public.guardar_portal_proveedor(p,'https://u:p@example.com','u','p',null);raise exception 'FALLÓ: URL con credenciales';exception when others then if sqlerrm<>'Datos del portal inválidos.' then raise;end if;end;
 begin perform public.guardar_portal_proveedor(p,'https://example.com','','p',null);raise exception 'FALLÓ: usuario vacío';exception when others then if sqlerrm<>'Datos del portal inválidos.' then raise;end if;end;
 begin perform public.guardar_portal_proveedor(p,'https://example.com','u','p',null,true);raise exception 'FALLÓ: quitar y cambiar';exception when others then if sqlerrm<>'Datos del portal inválidos.' then raise;end if;end;
 -- Prueba bajo el rol API real: columnas públicas sí, secreto y Vault no.
 set local role authenticated;
 if not exists(select 1 from public.proveedor_portales where proveedor_id=p and tiene_password) then raise exception 'FALLÓ: lectura admin';end if;
 begin perform secreto_id from public.proveedor_portales;raise exception 'FALLÓ: secreto directo';exception when insufficient_privilege then null;end;
 begin perform decrypted_secret from vault.decrypted_secrets;raise exception 'FALLÓ: Vault directo';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if exists(select 1 from public.proveedor_portales) or exists(select 1 from public.proveedor_portales_historial) then raise exception 'FALLÓ: corporativo consulta accesos';end if;
 begin perform public.revelar_portal_proveedor(p);raise exception 'FALLÓ: corporativo revela';exception when others then if sqlerrm<>'Solo administración puede consultar contraseñas.' then raise;end if;end;
 begin perform public.guardar_portal_proveedor(p,'https://example.com','u','p',null);raise exception 'FALLÓ: corporativo guarda';exception when others then if sqlerrm<>'Solo administración puede gestionar accesos de portal.' then raise;end if;end;
 if has_table_privilege('authenticated','public.proveedor_portales','INSERT') or has_table_privilege('authenticated','public.proveedor_portales','UPDATE') or has_table_privilege('authenticated','public.proveedor_portales','DELETE') then raise exception 'FALLÓ: escritura directa';end if;
 reset role;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform public.guardar_portal_proveedor(p,'https://example.com','u',null,null,true);
 if exists(select 1 from vault.secrets where id=s) or exists(select 1 from public.proveedor_portales where proveedor_id=p and tiene_password) then raise exception 'FALLÓ: quitar contraseña';end if;
 begin perform public.revelar_portal_proveedor(p);raise exception 'FALLÓ: revela contraseña eliminada';exception when others then if sqlerrm<>'No hay contraseña guardada.' then raise;end if;end;
 raise exception 'PRUEBAS OK — admin gestiona · cifrado · revelado con auditoría · contraseña vacía conserva · cambiar y quitar · validaciones · corporativo sin acceso · Vault privado · sin escritura directa';
end $$;
