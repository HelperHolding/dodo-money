-- Todo el ensayo se revierte con PRUEBAS OK.
do $$
declare a uuid;c uuid;s uuid;n uuid;n2 uuid; afectados integer;
 filas jsonb:='[{"nombre":"Empleado de prueba","puesto":"Gerente","renglon":"gerencia","sueldo":22000,"imss":1000,"cesantia":100,"retiro":100,"impuesto":100,"infonavit":100,"ajuste":-23.50}]';
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 if a is null or c is null then raise exception 'FALTAN DATOS: admin y corporativo activos.';end if;
 insert into public.sucursales(nombre) values('Nómina real prueba '||gen_random_uuid()::text) returning id into s;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 n:=public.guardar_nomina_real(s,date '2026-09-01','Reporte septiembre de prueba',filas,null);
 if not exists(select 1 from public.nomina_reales where id=n and empleados=filas and creado_por=a) then raise exception 'FALLÓ: registro';end if;
 begin perform public.guardar_nomina_real(s,date '2026-09-01','Otra versión sin revisar',filas,null);raise exception 'FALLÓ: sobrescritura';exception when raise_exception then if sqlerrm<>'La nómina cambió; recarga antes de guardar.' then raise;end if;end;
 begin perform public.guardar_nomina_real(s,date '2026-09-02','Reporte fecha inválida',filas,null);raise exception 'FALLÓ: fecha';exception when raise_exception then if sqlerrm<>'Revisa mes y fuente de la nómina.' then raise;end if;end;
 begin perform public.guardar_nomina_real(s,date '2026-10-01','Reporte monto negativo',jsonb_set(filas,'{0,sueldo}','-1'),null);raise exception 'FALLÓ: monto';exception when raise_exception then if sqlerrm<>'Revisa los importes de nómina.' then raise;end if;end;
 begin perform public.guardar_nomina_real(s,date '2026-10-01','Reporte repetido',filas||filas,null);raise exception 'FALLÓ: repetido';exception when raise_exception then if sqlerrm<>'Hay empleados repetidos.' then raise;end if;end;
 n2:=public.guardar_nomina_real(s,date '2026-09-01','Corrección con fuente',jsonb_set(filas,'{0,sueldo}','23000'),n);
 if not exists(select 1 from public.nomina_reales where id=n and anulada_en is not null and empleados=filas) then raise exception 'FALLÓ: historial';end if;
 if (select count(*) from public.nomina_reales where sucursal_id=s and mes=date '2026-09-01' and anulada_en is null)<>1 then raise exception 'FALLÓ: versión activa';end if;
 begin update public.nomina_reales set fuente='Alteración directa' where id=n2;get diagnostics afectados=row_count;if afectados>0 then raise exception 'FALLÓ: escritura directa';end if;exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from public.nomina_reales where id=n2) then raise exception 'FALLÓ: consulta corporativo';end if;
 begin perform public.anular_nomina_real(n2,'Intento corporativo');raise exception 'FALLÓ: corporativo escribe';exception when raise_exception then if sqlerrm<>'Solo administración gestiona nómina real.' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform public.anular_nomina_real(n2,'Corrección anulada de prueba');
 begin perform public.anular_nomina_real(n2,'Segundo intento de anulación');raise exception 'FALLÓ: anulación repetida';exception when raise_exception then if sqlerrm<>'La nómina ya está anulada.' then raise;end if;end;
 set local role anon;
 begin perform public.guardar_nomina_real(s,date '2026-09-01','Intento anónimo',filas,null);raise exception 'FALLÓ: anónimo';exception when insufficient_privilege then null;end;
 reset role;
 raise exception 'PRUEBAS OK — nómina real mensual · admin gestiona · fechas e importes · ajuste reportado · sin sobrescritura · historial · anulación única · corporativo consulta · sin escritura directa · anónimo sin acceso';
end $$;
