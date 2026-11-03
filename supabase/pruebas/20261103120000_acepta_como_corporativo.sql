-- Ejecutar completo después de 20261103120000_acepta_como_corporativo.sql. PRUEBAS OK revierte todo mediante un ERROR intencional.
-- Usa dos admins y un corporativo activos; crea una sucursal de prueba con dos entregas en camino que no se guardan.
do $$
declare a uuid; b uuid; c uuid; reg uuid; g uuid; s uuid; bov uuid; corp uuid; e1 uuid:=gen_random_uuid(); e2 uuid:=gen_random_uuid(); ok boolean; m public.movimientos;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by nombre limit 1;
 select id into b from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' and id<>a order by nombre limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' order by nombre limit 1;
 select id into reg from public.perfiles where id not in (a,b,c) order by nombre limit 1;
 select id into g from public.perfiles where activo and not debe_cambiar_contrasena and rol::text in ('gerente','encargado','operacion') order by nombre limit 1;
 if a is null or b is null or c is null or reg is null then raise exception 'FALTAN DATOS: dos admins y un corporativo activos, y otro usuario.';end if;
 update public.perfiles set acepta_como_corporativo=false where id in (a,b);

 insert into public.sucursales(nombre) values('Prueba acepta como corporativo '||e1) returning id into s;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial) values(s,'boveda','Bóveda',100000) returning id into bov;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial) values(s,'corporativo','Corporativo',0) returning id into corp;
 -- Dos entregas que registró otro usuario y ya recogió el admin b: están en camino a corporativo.
 insert into public.movimientos(id,recoleccion_id,sucursal_id,tipo,caja_origen_id,caja_destino_id,monto,folio,nota,estado,registrado_por,confirmado_por,confirmado_en)
 values(e1,e1,s,'salida_corporativo',bov,corp,100,'PRUEBA-1','Entrega de prueba','confirmado',reg,b,now()),
       (e2,e2,s,'salida_corporativo',bov,corp,100,'PRUEBA-2','Entrega de prueba','confirmado',reg,b,now());
 insert into public.recolecciones_corporativo(id,sucursal_id,desde,hasta,expediente,creado_por)
 values(e1,s,current_date,current_date,'{}',reg),(e2,s,current_date,current_date,'{}',reg);

 -- 1. Un admin sin la bandera no recibe.
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 if public.puede_recibir_en_corporativo() then raise exception 'FALLÓ: admin sin bandera puede recibir';end if;
 ok:=false; begin perform public.recibir_recoleccion(e1,100,''); exception when others then ok:=sqlerrm like 'Solo corporativo%'; end;
 if not ok then raise exception 'FALLÓ: admin sin bandera recibió';end if;

 -- 2. Quien recogió la entrega no la recibe, aunque tenga la bandera.
 update public.perfiles set acepta_como_corporativo=true where id in (a,b);
 perform set_config('request.jwt.claims',json_build_object('sub',b,'role','authenticated')::text,true);
 ok:=false; begin perform public.recibir_recoleccion(e1,100,''); exception when others then ok:=sqlerrm like 'Quien registró o recogió%'; end;
 if not ok then raise exception 'FALLÓ: quien recogió la recibió también';end if;

 -- 3. El admin con la bandera recibe con el conteo, y repetir el mismo envío no falla.
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 if not public.puede_recibir_en_corporativo() then raise exception 'FALLÓ: admin con bandera no puede recibir';end if;
 perform public.recibir_recoleccion(e1,100,'');
 select * into m from public.movimientos where id=e1;
 if m.recepcion is distinct from 'aceptada' or m.recibido_por is distinct from a then raise exception 'FALLÓ: la recepción no quedó a nombre del admin';end if;
 if (select contado_corporativo from public.recolecciones_corporativo where id=e1) is distinct from 100 then raise exception 'FALLÓ: no guardó el conteo';end if;
 perform public.recibir_recoleccion(e1,100,'');
 ok:=false; begin perform public.recibir_recoleccion(e1,90,'Otro conteo distinto'); exception when others then ok:=sqlerrm like 'Esta recolección ya se recibió%'; end;
 if not ok then raise exception 'FALLÓ: recibió dos veces';end if;

 -- 4. Tampoco se salta el conteo del expediente.
 ok:=false; begin perform public.recibir_en_corporativo(e2,true,null); exception when others then ok:=sqlerrm like 'Recibe esta entrega desde su expediente%'; end;
 if not ok then raise exception 'FALLÓ: recibió sin conteo';end if;

 -- 5. Corporativo sigue recibiendo sin bandera, y un conteo distinto queda como «No cuadró».
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 perform public.recibir_recoleccion(e2,90,'Faltan 10 pesos');
 if (select recepcion from public.movimientos where id=e2) is distinct from 'rechazada' then raise exception 'FALLÓ: corporativo no marcó la diferencia';end if;

 -- 6. La bandera solo sirve a admins activos.
 if g is not null then
  update public.perfiles set acepta_como_corporativo=true where id=g;
  perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
  if public.puede_recibir_en_corporativo() then raise exception 'FALLÓ: un puesto de sucursal con bandera puede recibir';end if;
 end if;
 update public.perfiles set activo=false where id=a;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 if public.puede_recibir_en_corporativo() then raise exception 'FALLÓ: admin dado de baja puede recibir';end if;

 -- 7. Sin acceso anónimo.
 if has_function_privilege('anon','public.puede_recibir_en_corporativo()','execute') then raise exception 'FALLÓ: anon puede ejecutar';end if;

 raise exception 'PRUEBAS OK';
end $$;
