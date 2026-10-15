-- Reversible: PRUEBAS OK es una excepción intencional para deshacer los datos de ensayo.
do $$
declare v_admin uuid;v_corp uuid;v_gerente uuid;v_s uuid;v_b uuid;v_c uuid;v_agua uuid;v_limpieza uuid;v_info uuid;v_datos jsonb;v_ref text;v_corte uuid;v_original jsonb;v_gasto jsonb;v_dia date:=public.hoy_mx()-3;
begin
 select id into v_admin from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into v_corp from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id into v_gerente from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' limit 1;
 if v_admin is null or v_corp is null or v_gerente is null then raise exception 'FALTAN DATOS: admin, gerente y corporativo.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',v_admin,'role','authenticated')::text,true);
 insert into public.sucursales(nombre) values('Gastos prueba '||gen_random_uuid()) returning id into v_s;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial) values(v_s,'boveda','Bóveda ensayo',10000) returning id into v_b;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial) values(v_s,'caja_chica','Caja chica ensayo',1000) returning id into v_c;
 insert into public.cierres_dia(sucursal_id,fecha,boveda_inicial,boveda_contado) values(v_s,v_dia,10000,10000) returning id into v_corte;
 select to_jsonb(c) into v_original from public.cierres_dia c where id=v_corte;
 set local role authenticated;
 v_datos:=jsonb_build_object('solicitud',gen_random_uuid(),'sucursal',v_s,'fecha',v_dia,'concepto','Garrafones de agua','proveedor','Agua ensayo','monto',120,'comprobante','nota','foto_path',v_s::text||'/garrafones.jpg','origen','caja_chica','cuenta_pl','servicios','informativo',false);
 v_agua:=public.registrar_gasto_sucursal(v_datos);
 if public.registrar_gasto_sucursal(v_datos)<>v_agua or (select saldo from public.saldos_cajas where caja_id=v_c)<>880 then raise exception 'FALLÓ: gasto normal o idempotencia';end if;
 select to_jsonb(g) into v_gasto from public.gastos_caja_chica g where id=v_agua;
 v_ref:='Corte agua '||gen_random_uuid();
 begin perform public.marcar_gasto_informativo(v_agua,'','corte',null,true);raise exception 'FALLÓ: motivo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.marcar_gasto_informativo(v_agua,'Ya incluido en corte anterior',v_ref,null,false);raise exception 'FALLÓ: confirmación';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform public.marcar_gasto_informativo(v_agua,'Ya incluido en corte anterior',v_ref,null,true);
 if public.marcar_gasto_informativo(v_agua,'Ya incluido en corte anterior',v_ref,null,true)<>v_agua then raise exception 'FALLÓ: doble corrección';end if;
 if (select saldo from public.saldos_cajas where caja_id=v_c)<>1000 then raise exception 'FALLÓ: sigue descontando garrafones';end if;
 if not exists(select 1 from public.gastos_caja_chica where id=v_agua and informativo and monto=(v_gasto->>'monto')::numeric and fecha=(v_gasto->>'fecha')::date and concepto=v_gasto->>'concepto' and registrado_por=v_admin and informado_por=v_admin and informado_en is not null and foto_path=v_gasto->>'foto_path') then raise exception 'FALLÓ: conserva registro y autor';end if;
 -- Los productos de limpieza quedan como gasto normal, sin convertirlos por tener fecha anterior.
 v_datos:=v_datos||jsonb_build_object('solicitud',gen_random_uuid(),'concepto','Productos de limpieza','proveedor','Limpieza ensayo','monto',400,'origen','boveda','cuenta_pl','consumibles_equipo');
 v_limpieza:=public.registrar_gasto_sucursal(v_datos);
 if exists(select 1 from public.gastos_caja_chica where id=v_limpieza and informativo) or (select saldo from public.saldos_cajas where caja_id=v_b)<>9600 then raise exception 'FALLÓ: limpieza alterada o no descuenta';end if;
 -- Alta directamente informativa: ni saldo ni cortes reciben una salida nueva.
 v_datos:=v_datos||jsonb_build_object('solicitud',gen_random_uuid(),'concepto','Agua pendiente de capturar','monto',60,'cuenta_pl','servicios','informativo',true,'referencia','Ticket '||gen_random_uuid(),'motivo','Ya pagado y descontado en el corte anterior','confirmado','si');
 begin perform public.registrar_gasto_sucursal(v_datos-'foto_path');raise exception 'FALLÓ: respaldo obligatorio';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.registrar_gasto_sucursal(v_datos||jsonb_build_object('fecha',public.hoy_mx()));raise exception 'FALLÓ: fecha histórica';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 v_info:=public.registrar_gasto_sucursal(v_datos);
 if public.registrar_gasto_sucursal(v_datos)<>v_info or (select saldo from public.saldos_cajas where caja_id=v_b)<>9600 then raise exception 'FALLÓ: informativo descuenta o duplica';end if;
 begin perform public.registrar_gasto_sucursal(v_datos||jsonb_build_object('solicitud',gen_random_uuid()));raise exception 'FALLÓ: duplica gasto en P&L';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if (select sum(monto) from public.gastos_caja_chica where sucursal_id=v_s and fecha=v_dia)<>580 or (select count(*) from public.gastos_caja_chica where sucursal_id=v_s)<>3 then raise exception 'FALLÓ: P&L conserva gasto una sola vez en su fecha';end if;
 if (select sum(monto) from public.gastos_caja_chica where sucursal_id=v_s and origen='caja_chica' and not informativo) is not null then raise exception 'FALLÓ: reposición incluye informativos';end if;
 reset role;
 insert into public.cierres_dia(sucursal_id,fecha,boveda_inicial,boveda_contado) values(v_s,((now() at time zone 'America/Mexico_City')-interval '4 hours')::date,10000,9600);
 if not exists(select 1 from public.cierres_dia where sucursal_id=v_s and gastos_boveda_dia=400) then raise exception 'FALLÓ: corte incluye informativo o descuenta dos veces';end if;
 if (select to_jsonb(c) from public.cierres_dia c where id=v_corte) is distinct from v_original then raise exception 'FALLÓ: cambió corte anterior';end if;
 begin update public.gastos_caja_chica set motivo_informativo='Otro motivo para sobrescribir' where id=v_agua;raise exception 'FALLÓ: sobrescritura';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 set local role authenticated;
 begin update public.gastos_caja_chica set monto=999 where id=v_limpieza;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',v_gerente,'role','authenticated')::text,true);
 begin perform public.marcar_gasto_informativo(v_limpieza,'Cambio desde otra sucursal','corte prueba',null,true);raise exception 'FALLÓ: otra sucursal';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',v_corp,'role','authenticated')::text,true);
 if not exists(select 1 from public.gastos_caja_chica where id=v_info) then raise exception 'FALLÓ: corporativo no consulta';end if;
 begin perform public.registrar_gasto_sucursal(v_datos);raise exception 'FALLÓ: corporativo registra';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if has_function_privilege('anon','public.registrar_gasto_sucursal(jsonb)','execute') or has_function_privilege('anon','public.marcar_gasto_informativo(uuid,text,text,text,boolean)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — gastos informativos · garrafones sin duplicar · limpieza conserva salida · P&L por fecha · caja y bóveda sin doble descuento · sin reposición ficticia · corte anterior intacto · motivo y respaldo · idempotencia · autor e historial · sucursal · corporativo consulta · sin escritura directa · anónimo sin ejecución';
end $$;
