-- Todo el ensayo se revierte al llegar a PRUEBAS OK.
do $$
declare v_admin uuid;v_corp uuid;v_s uuid;v_c uuid;v_gasto uuid;v_datos jsonb;v_fecha date:=public.hoy_mx()-5;v_ref text;
begin
 select id into v_admin from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into v_corp from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 if v_admin is null or v_corp is null then raise exception 'FALTAN DATOS: admin y corporativo.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',v_admin,'role','authenticated')::text,true);
 insert into public.sucursales(nombre) values('Fecha gasto ensayo '||gen_random_uuid()) returning id into v_s;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial) values(v_s,'boveda','Bóveda ensayo',10000) returning id into v_c;
 set local role authenticated;
 v_datos:=jsonb_build_object('solicitud',gen_random_uuid(),'sucursal',v_s,'fecha',public.hoy_mx(),'concepto','Garrafones de ensayo','monto',59,'origen','boveda','cuenta_pl','servicios','comprobante','nota');
 v_gasto:=public.registrar_gasto_sucursal(v_datos);v_ref:='Corte de ensayo '||gen_random_uuid();
 begin perform public.corregir_fecha_gasto_informativo(v_gasto,v_fecha,'Fecha real confirmada por usuario',v_ref,null,true);raise exception 'FALLÓ: sin respaldo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if not exists(select 1 from public.gastos_caja_chica where id=v_gasto and fecha=public.hoy_mx() and not informativo and fecha_capturada_original is null) then raise exception 'FALLÓ: rechazo cambió fecha';end if;
 perform public.corregir_fecha_gasto_informativo(v_gasto,v_fecha,'Fecha real confirmada por usuario',v_ref,v_s::text||'/referencia.jpg',true);
 if not exists(select 1 from public.gastos_caja_chica where id=v_gasto and fecha=v_fecha and fecha_capturada_original=public.hoy_mx() and monto=59 and informativo and informado_por=v_admin and foto_path is null and respaldo_informativo=v_s::text||'/referencia.jpg') then raise exception 'FALLÓ: fecha real o conservación del original';end if;
 if (select saldo from public.saldos_cajas where caja_id=v_c)<>10000 or (select count(*) from public.gastos_caja_chica where sucursal_id=v_s)<>1 then raise exception 'FALLÓ: saldo o duplicación';end if;
 if public.corregir_fecha_gasto_informativo(v_gasto,v_fecha,'Fecha real confirmada por usuario',v_ref,null,true)<>v_gasto then raise exception 'FALLÓ: doble envío';end if;
 begin perform public.corregir_fecha_gasto_informativo(v_gasto,v_fecha-1,'Otra fecha confirmada por usuario',v_ref,null,true);raise exception 'FALLÓ: sobrescribe';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin update public.gastos_caja_chica set fecha=public.hoy_mx() where id=v_gasto;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',v_corp,'role','authenticated')::text,true);
 if not exists(select 1 from public.gastos_caja_chica where id=v_gasto) then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.corregir_fecha_gasto_informativo(v_gasto,v_fecha,'Fecha real confirmada por usuario',v_ref,null,true);raise exception 'FALLÓ: corporativo corrige';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if has_function_privilege('anon','public.corregir_fecha_gasto_informativo(uuid,date,text,text,text,boolean)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — fecha real del gasto · conserva fecha capturada · corrección atómica · respaldo diferenciado del ticket original · sin duplicar P&L · sin doble descuento · idempotencia · sin sobrescritura · corporativo consulta · sin escritura directa · anónimo sin ejecución';
end $$;
