-- Ejecutar completo después de 20261102200000_pl_ajustes.sql. PRUEBAS OK revierte los datos mediante un ERROR intencional.
-- Usa un admin activo y una sucursal; captura en enero 2099 para no tocar meses reales.
do $$
declare a uuid; s uuid; k uuid:=gen_random_uuid(); k2 uuid:=gen_random_uuid(); ok boolean; x public.pl_ajustes; m date:=date '2099-01-01';
begin
 select p.id into a from public.perfiles p where p.activo and p.rol::text='admin' and not p.debe_cambiar_contrasena limit 1;
 select id into s from public.sucursales order by nombre limit 1;
 if a is null or s is null then raise exception 'FALTAN DATOS: un admin activo y una sucursal.';end if;

 -- 1. Sin sesión de admin: rechazado.
 perform set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','tope_pct',0.05,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'Solo administración%'; end;
 if not ok then raise exception 'FALLÓ: capturó sin ser admin';end if;
 ok:=false; begin perform public.anular_ajuste_pl(gen_random_uuid(),'motivo de prueba'); exception when others then ok:=sqlerrm like 'Solo administración%'; end;
 if not ok then raise exception 'FALLÓ: anuló sin ser admin';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

 -- 2. Validaciones.
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','tope_pct',0.05,'corta'); exception when others then ok:=sqlerrm like 'Escribe la nota%'; end;
 if not ok then raise exception 'FALLÓ: nota corta';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','tope_pct',1.5,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'El tope%'; end;
 if not ok then raise exception 'FALLÓ: tope mayor a 100 %%';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','monto',0,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'El monto%'; end;
 if not ok then raise exception 'FALLÓ: monto cero';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','monto',10.555,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'El monto%'; end;
 if not ok then raise exception 'FALLÓ: monto con tres decimales';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,date '2099-01-15','marketing','tope_pct',0.05,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'El mes%'; end;
 if not ok then raise exception 'FALLÓ: mes que no es día 1';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'venta_neta','monto',-10,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'Renglón%'; end;
 if not ok then raise exception 'FALLÓ: renglón que no es gasto';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','otro',1,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'Tipo%'; end;
 if not ok then raise exception 'FALLÓ: tipo inválido';end if;

 -- 3. Captura e idempotencia.
 if public.guardar_ajuste_pl(k,s,m,'marketing','tope_pct',0.05,'  Inauguración: solo el 5  ')<>k then raise exception 'FALLÓ: no devolvió la solicitud';end if;
 select * into x from public.pl_ajustes where id=k;
 if x.creado_por<>a or x.nota<>'Inauguración: solo el 5' or x.valor<>0.05 or x.anulado_en is not null then raise exception 'FALLÓ: datos guardados';end if;
 if public.guardar_ajuste_pl(k,s,m,'marketing','tope_pct',0.05,'Inauguración: solo el 5')<>k then raise exception 'FALLÓ: idempotencia';end if;
 ok:=false; begin perform public.guardar_ajuste_pl(k,s,m,'marketing','tope_pct',0.06,'Inauguración: solo el 5'); exception when others then ok:=sqlerrm like 'La solicitud ya se utilizó%'; end;
 if not ok then raise exception 'FALLÓ: solicitud reutilizada con otros datos';end if;

 -- 4. Uno vigente por sucursal, mes y renglón.
 ok:=false; begin perform public.guardar_ajuste_pl(gen_random_uuid(),s,m,'marketing','monto',-1000,'Otro ajuste del mismo renglón'); exception when others then ok:=sqlerrm like 'Ya hay un ajuste vigente%'; end;
 if not ok then raise exception 'FALLÓ: dos ajustes vigentes en el mismo renglón';end if;

 -- 5. Anular con motivo; el anulado se conserva y se puede capturar otro.
 ok:=false; begin perform public.anular_ajuste_pl(k,'no'); exception when others then ok:=sqlerrm like 'Escribe el motivo%'; end;
 if not ok then raise exception 'FALLÓ: motivo corto';end if;
 perform public.anular_ajuste_pl(k,'Se cambia a monto fijo');
 ok:=false; begin perform public.anular_ajuste_pl(k,'Otra vez'); exception when others then ok:=sqlerrm like 'El ajuste no existe o ya está anulado%'; end;
 if not ok then raise exception 'FALLÓ: anuló dos veces';end if;
 if public.guardar_ajuste_pl(k2,s,m,'marketing','monto',-16000,'Inauguración: monto fijo')<>k2 then raise exception 'FALLÓ: captura después de anular';end if;
 if (select count(*) from public.pl_ajustes where sucursal_id=s and mes=m and renglon='marketing')<>2 then raise exception 'FALLÓ: el anulado no se conservó';end if;
 if (select motivo_anulacion from public.pl_ajustes where id=k)<>'Se cambia a monto fijo' then raise exception 'FALLÓ: motivo de anulación';end if;

 -- 6. Sin escritura directa para la app.
 if has_table_privilege('authenticated','public.pl_ajustes','insert') or has_table_privilege('authenticated','public.pl_ajustes','update')
  or has_table_privilege('authenticated','public.pl_ajustes','delete') then raise exception 'FALLÓ: escritura directa permitida';end if;

 raise exception 'PRUEBAS OK';
end $$;
