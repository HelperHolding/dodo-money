-- Prueba reversible: PRUEBAS OK revierte todos los datos de ensayo.
do $$
declare a uuid;c uuid;s uuid;s2 uuid;f uuid;ac uuid;n uuid;n2 uuid;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 if a is null or c is null then raise exception 'FALTAN DATOS: admin y corporativo activos.';end if;
 insert into public.sucursales(nombre) values('CAPEX ensayo '||gen_random_uuid()) returning id into s;
 insert into public.sucursales(nombre) values('CAPEX ajeno '||gen_random_uuid()) returning id into s2;
 insert into public.inversion_apertura_fuentes(sucursal_id,nombre,sha256,fecha,total,pagador_fuente,datos) values(s,'Ensayo',repeat('a',32)||replace(gen_random_uuid()::text,'-',''),date '2026-10-13',100,'Fuente de ensayo','{"detalles":[{"id":"D001","monto":100}]}') returning id into f;
 insert into public.activos(sucursal_id,nombre,categoria,estado) values(s,'Activo CAPEX','otros','recibido') returning id into ac;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 n:=public.vincular_inversion_apertura(f,'D001','activo',ac,'Comprobante corresponde a la unidad');
 n2:=public.vincular_inversion_apertura(f,'D001','activo',ac,'Segundo envío');
 if n<>n2 or (select count(*) from public.inversion_apertura_vinculos where fuente_id=f)<>1 then raise exception 'FALLÓ: duplicados';end if;
 if not exists(select 1 from public.inversion_apertura_vinculos where id=n and creado_por=a and motivo='Comprobante corresponde a la unidad') then raise exception 'FALLÓ: trazabilidad';end if;
 if (select total from public.inversion_apertura_fuentes where id=f)<>100 then raise exception 'FALLÓ: cambia importe';end if;
 begin perform public.vincular_inversion_apertura(f,'D001','activo',ac,'');raise exception 'FALLÓ: motivo vacío';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.vincular_inversion_apertura(f,'D999','activo',ac,'Detalle no existe');raise exception 'FALLÓ: detalle';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.vincular_inversion_apertura(f,'D001','otro',ac,'Tipo inexistente');raise exception 'FALLÓ: tipo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin update public.inversion_apertura_vinculos set motivo='Cambio' where id=n;raise exception 'FALLÓ: escritura';exception when insufficient_privilege then null;end;
 reset role;
 update public.activos set sucursal_id=s2 where id=ac;
 set local role authenticated;
 begin perform public.vincular_inversion_apertura(f,'D001','activo',ac,'Unidad trasladada a otra sucursal');raise exception 'FALLÓ: sucursal';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from public.inversion_apertura_fuentes where id=f) then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.vincular_inversion_apertura(f,'D001','activo',ac,'Corporativo intenta escribir');raise exception 'FALLÓ: corporativo escribe';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;set local role anon;
 begin perform public.vincular_inversion_apertura(f,'D001','activo',ac,'Anónimo intenta escribir');raise exception 'FALLÓ: anónimo';exception when insufficient_privilege then null;end;
 reset role;
 raise exception 'PRUEBAS OK — fuente conservada · vínculo con motivo y autor · sin doble suma · doble envío · detalle y tipo · sucursal · corporativo consulta · sin escritura directa · anónimo sin acceso';
end $$;
