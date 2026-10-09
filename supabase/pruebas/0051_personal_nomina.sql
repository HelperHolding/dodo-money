-- Ensayo reversible. Requiere 0050 y 0051.
do $$
declare a uuid;c uuid;s uuid;otra uuid;p uuid;v uuid;v2 uuid;b uuid;n uuid;filas jsonb;
 d jsonb:='{"nombre":"Persona de prueba","puesto":"Cajero","renglon":"cocina","ingreso":null,"baja":null,"nota":"Condiciones de prueba","sueldo":12000,"bono":500,"imss":1000,"cesantia":100,"retiro":100,"impuesto":100,"infonavit":100,"ajuste":0}';
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 if a is null or c is null then raise exception 'FALTAN DATOS: admin y corporativo activos.';end if;
 insert into public.sucursales(nombre) values('Personal prueba '||gen_random_uuid()) returning id into s;
 insert into public.sucursales(nombre) values('Otra personal prueba '||gen_random_uuid()) returning id into otra;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 p:=public.guardar_personal(null,s,'P-001',date '2026-09-01',null,d,null);
 select id into v from public.personal_versiones where personal_id=p and sustituida_en is null;
 perform public.guardar_personal(p,s,'P-001',date '2026-09-01',null,jsonb_set(d,'{sueldo}','13000'),v);
 if not exists(select 1 from public.personal_versiones where id=v and sustituida_en is not null and datos->>'sueldo'='12000') then raise exception 'FALLÓ: historial';end if;
 select id into v2 from public.personal_versiones where personal_id=p and sustituida_en is null;
 begin perform public.guardar_personal(p,s,'P-001',date '2026-10-01',null,d,v);raise exception 'FALLÓ: sobrescritura';exception when raise_exception then if sqlerrm<>'El perfil cambió; recarga antes de guardar.' then raise;end if;end;
 begin perform public.guardar_personal(p,s,'P-001',date '2026-10-01',null,jsonb_set(d,'{imss}','-1'),v2);raise exception 'FALLÓ: importe';exception when raise_exception then if sqlerrm<>'Revisa los importes de Personal.' then raise;end if;end;
 filas:=jsonb_build_array(d||jsonb_build_object('personal_id',p,'version_id',v2));
 begin perform public.preparar_borrador_nomina(otra,date '2026-09-01','Borrador de prueba',filas,'[]');raise exception 'FALLÓ: sucursal';exception when raise_exception then if sqlerrm<>'El empleado no corresponde a este lugar.' then raise;end if;end;
 b:=public.preparar_borrador_nomina(s,date '2026-09-01','Borrador de prueba',filas,'[]');
 if exists(select 1 from public.nomina_reales where sucursal_id=s) then raise exception 'FALLÓ: borrador cambió P&L';end if;
 begin perform public.confirmar_borrador_nomina(b,jsonb_set(filas,'{0,sueldo}','null'),'Revisión de prueba');raise exception 'FALLÓ: pendiente';exception when raise_exception then if sqlerrm<>'Revisa los importes de nómina.' then raise;end if;end;
 n:=public.confirmar_borrador_nomina(b,filas,'Revisión de prueba');
 if not exists(select 1 from public.nomina_reales where id=n and (empleados->0->>'bono')::numeric=500) then raise exception 'FALLÓ: bono';end if;
 begin perform public.confirmar_borrador_nomina(b,filas,'Segundo intento');raise exception 'FALLÓ: doble confirmación';exception when raise_exception then if sqlerrm<>'El borrador ya fue confirmado.' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from public.personal where id=p) then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.guardar_personal(null,s,'P-002',date '2026-09-01',null,d,null);raise exception 'FALLÓ: corporativo escribe';exception when raise_exception then if sqlerrm<>'Solo administración gestiona Personal.' then raise;end if;end;
 begin insert into public.personal(sucursal_id,codigo,creado_por) values(s,'Directo',c);raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 begin perform public._guardar_nomina_real_0050(s,date '2026-09-01','Privado de prueba',filas,null);raise exception 'FALLÓ: helper privado';exception when insufficient_privilege then null;end;
 set local role anon;
 begin perform public.preparar_borrador_nomina(s,date '2026-09-01','Anónimo de prueba',filas,'[]');raise exception 'FALLÓ: anónimo';exception when insufficient_privilege then null;end;
 reset role;
 raise exception 'PRUEBAS OK — perfiles con vigencia · correcciones con historial · sin sobrescritura · importes · borrador sin P&L · empleados de sucursal · pendientes · bono · confirmación única · corporativo consulta · sin escritura directa · helper privado · anónimo sin acceso';
end $$;
