-- Ejecutar después de la migración 0043. La excepción PRUEBAS OK revierte la prueba.
do $$
declare a uuid;c uuid;p uuid;otro uuid;uno uuid;dos uuid;previo jsonb;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and rol::text='corporativo' limit 1;
 select id into p from public.proveedores limit 1;
 if a is null or c is null or p is null then raise exception 'FALTAN DATOS: admin, corporativo y proveedor.';end if;
 select jsonb_build_array(contacto_nombre,telefono,correo) into previo from public.proveedores where id=p;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 uno:=public.guardar_contacto_proveedor(p,null,' Ana ','Ventas','+52 33 1234 ext. 2',null);
 dos:=public.guardar_contacto_proveedor(p,null,'Luis','Cobranza',null,'luis@example.com');
 if uno=dos or (select count(*) from public.proveedor_contactos where id in(uno,dos))<>2 then raise exception 'FALLÓ: varios contactos';end if;
 perform public.guardar_contacto_proveedor(p,uno,'Ana','Compras','555',null,false);
 if (select activo or puesto<>'Compras' from public.proveedor_contactos where id=uno) then raise exception 'FALLÓ: editar/desactivar';end if;
 perform public.guardar_contacto_proveedor(p,uno,'Ana','Compras','555',null,true);
 if not (select activo from public.proveedor_contactos where id=uno) then raise exception 'FALLÓ: reactivar';end if;
 if previo is distinct from (select jsonb_build_array(contacto_nombre,telefono,correo) from public.proveedores where id=p) then raise exception 'FALLÓ: cambió contacto original';end if;
 begin
  perform public.guardar_contacto_proveedor(p,null,'Ana',null,null,null);
  raise exception 'FALLÓ: sin medio de contacto';
 exception when check_violation then null;end;
 begin
  perform public.guardar_contacto_proveedor(p,null,'Ana',null,null,'incorrecto');
  raise exception 'FALLÓ: correo';
 exception when check_violation then null;end;
 begin
  perform public.guardar_contacto_proveedor(p,gen_random_uuid(),'Ana',null,'555',null);
  raise exception 'FALLÓ: ID ajeno';
 exception when raise_exception then if SQLERRM<>'El contacto no pertenece a este proveedor.' then raise;end if;end;
 select id into otro from public.proveedores where id<>p limit 1;
 if otro is not null then
  begin
   perform public.guardar_contacto_proveedor(otro,uno,'Ana',null,'555',null);
   raise exception 'FALLÓ: otro proveedor';
  exception when raise_exception then if SQLERRM<>'El contacto no pertenece a este proveedor.' then raise;end if;end;
 end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if (select count(*) from public.proveedor_contactos where id in(uno,dos))<>2 then raise exception 'FALLÓ: corporativo consulta';end if;
 begin
  perform public.guardar_contacto_proveedor(p,null,'Ana',null,'555',null);
  raise exception 'FALLÓ: corporativo escribe';
 exception when raise_exception then if SQLERRM<>'Solo administración puede gestionar contactos.' then raise;end if;end;
 begin
  update public.proveedor_contactos set nombre='Cambio directo' where id=uno;
  raise exception 'FALLÓ: escritura directa';
 exception when insufficient_privilege then null;end;
 execute 'reset role';
 raise exception 'PRUEBAS OK — múltiples contactos · conserva original · editar y desactivar · reactivar · validaciones · vínculo de proveedor · corporativo consulta · sin escritura directa';
end $$;
