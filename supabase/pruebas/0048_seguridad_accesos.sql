-- Ensayo transaccional. PRUEBAS OK revierte incluso el cambio simulado en Auth.
-- Requiere admin, corporativo y gerente activos, con contraseña inicial configurada.
do $$
declare a uuid; c uuid; g uuid; s uuid; otra uuid; p uuid; art uuid; o uuid; o2 uuid; r uuid; r2 uuid; hash_previo text;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id,sucursal_id into g,s from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' limit 1;
 if a is null or c is null or g is null or s is null then raise exception 'FALTAN DATOS: admin, corporativo y gerente activos con sucursal.';end if;
 select encrypted_password into hash_previo from auth.users where id=a;
 if coalesce(hash_previo,'')='' then raise exception 'FALTAN DATOS: admin con contraseña en Auth.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.sucursales(nombre) values('Sucursal ensayo seguridad 0048') returning id into otra;
 insert into public.proveedores(razon_social,rfc,regimen_fiscal) values('Proveedor ensayo seguridad','SEG010101AB1','601') returning id into p;
 insert into public.articulos(nombre,unidad,tipo) values('Artículo ensayo seguridad','pza','servicio') returning id into art;
 insert into public.ordenes_compra(proveedor_id,sucursal_id) values(p,s) returning id into o;
 insert into public.ordenes_compra(proveedor_id,sucursal_id) values(p,otra) returning id into o2;
 insert into public.orden_renglones(orden_id,articulo_id,descripcion,cantidad,precio,tasa_iva) values(o,art,'Ensayo',2,100,'16') returning id into r;
 insert into public.orden_renglones(orden_id,articulo_id,descripcion,cantidad,precio,tasa_iva) values(o2,art,'Ensayo ajeno',1,999,'16') returning id into r2;
 set local role authenticated;
 if public.total_orden(o) is distinct from 232 or public.recibido_renglon(r) is distinct from 0 then raise exception 'FALLÓ: admin consulta';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if public.total_orden(o) is distinct from 232 then raise exception 'FALLÓ: corporativo consulta';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 if public.total_orden(o) is not null or public.facturado_orden(o) is not null or public.recepcion_completa(o) is not null or public.cubierto_por_complementos(o) is not null then raise exception 'FALLÓ: gerente obtiene datos financieros';end if;
 if public.recibido_renglon(r) is distinct from 0 or public.recibido_renglon(r2) is not null or public.hay_recepciones(o2) is not null then raise exception 'FALLÓ: alcance de recepción';end if;
 reset role;
 update public.perfiles set rol='encargado' where id=g;
 set local role authenticated;
 if public.recibido_renglon(r) is distinct from 0 or public.recibido_renglon(r2) is not null then raise exception 'FALLÓ: encargado';end if;
 reset role;
 update public.perfiles set rol='operacion' where id=g;
 set local role authenticated;
 if public.recibido_renglon(r) is not null then raise exception 'FALLÓ: operación consulta recepción';end if;
 reset role;
 update public.perfiles set debe_cambiar_contrasena=true where id=a;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 if public.mi_rol() is not null or public.mi_sucursal() is not null or public.total_orden(o) is not null or exists(select 1 from public.sucursales) then raise exception 'FALLÓ: contraseña temporal conserva permisos';end if;
 if not exists(select 1 from public.perfiles where id=a) then raise exception 'FALLÓ: no puede ver su perfil para cambiar contraseña';end if;
 begin perform public.contrasena_cambiada();raise exception 'FALLÓ: quitó marca vía RPC';exception when raise_exception then if sqlerrm<>'Cambia tu contraseña en Mi contraseña antes de continuar.' then raise;end if;end;
 reset role;
 update auth.users set encrypted_password=encrypted_password where id=a;
 if not(select debe_cambiar_contrasena from public.perfiles where id=a) then raise exception 'FALLÓ: update sin cambio libera cuenta';end if;
 -- Solo prueba el disparador: altera la representación almacenada, no ejecuta un cambio real por Auth.
 -- La excepción final revierte esta alteración; nunca usar este bloque para cambiar contraseñas.
 update auth.users set encrypted_password=hash_previo||'-ensayo-0048' where id=a;
 if (select debe_cambiar_contrasena from public.perfiles where id=a) then raise exception 'FALLÓ: cambio en Auth no libera cuenta';end if;
 set local role authenticated;
 perform public.contrasena_cambiada();
 if public.total_orden(o) is distinct from 232 then raise exception 'FALLÓ: permisos después del cambio';end if;
 reset role;
 update public.perfiles set activo=false where id=a;
 set local role authenticated;
 if public.total_orden(o) is not null or public.recibido_renglon(r) is not null then raise exception 'FALLÓ: usuario inactivo';end if;
 reset role;
 set local role anon;
 begin perform public.total_orden(o);raise exception 'FALLÓ: anónimo';exception when insufficient_privilege then null;end;
 reset role;
 raise exception 'PRUEBAS OK — temporal sin permisos · RPC no libera · cambio en Auth · admin y corporativo · recepción por sucursal · operación e inactivo sin acceso · anónimo sin ejecución';
end $$;
