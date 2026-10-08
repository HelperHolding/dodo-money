-- Ejecutar después de 0042. PRUEBAS OK es una excepción intencional: revierte todo el ensayo.
do $$
declare a uuid;c uuid;s uuid;b uuid;corp uuid;p uuid;f uuid;r uuid;v uuid;t uuid;d jsonb;x jsonb;dia date;i integer;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 if a is null or c is null or not exists(select 1 from public.empresa) then raise exception 'FALTAN DATOS: admin, corporativo y datos de empresa.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.sucursales(nombre,fondo_boveda) values('Ensayo bóveda '||gen_random_uuid(),4500) returning id into s;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial) values(s,'boveda','Bóveda',20000) returning id into b;
 insert into public.cajas(sucursal_id,tipo,nombre) values(s,'corporativo','Corporativo') returning id into corp;
 insert into public.proveedores(razon_social,rfc,regimen_fiscal,sucursal_id,cuenta_pl) values('Ensayo reservas','PRB010101AB1','601',s,'servicios') returning id into p;
 set local role authenticated;
 f:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',p,'sucursal_id',s,'fecha',public.hoy_mx(),'folio','Prueba reserva','subtotal',10000,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',10000,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Servicio de prueba','importe',10000,'cuenta_pl','servicios'))));
 r:=public.reservar_boveda(s,f,6000,public.hoy_mx(),'Pago extraordinario autorizado para proveedor');
 d:=public.disponibilidad_boveda(s);
 if (d->>'disponible')::numeric<>9500 or (d->>'reservado')::numeric<>6000 or (d->>'saldo')::numeric<>20000 then raise exception 'FALLÓ: reserva adicional y fondo';end if;
 begin perform public.reservar_boveda(s,f,5000,public.hoy_mx(),'Otra reserva');raise exception 'FALLÓ: excede factura';exception when others then if sqlerrm<>'Las reservas exceden el saldo de la factura.' then raise;end if;end;
 -- Ensayo del trigger de movimientos como propietario, con JWT admin. No depende de la sucursal del perfil.
 reset role;
 begin insert into public.movimientos(sucursal_id,tipo,caja_origen_id,caja_destino_id,monto,folio) values(s,'salida_corporativo',b,corp,9500.01,'EXCESO');raise exception 'FALLÓ: consume reserva';exception when others then if sqlerrm<>'El movimiento usaría efectivo reservado o el fondo protegido de bóveda.' then raise;end if;end;
 insert into public.movimientos(sucursal_id,tipo,caja_origen_id,caja_destino_id,monto,folio) values(s,'salida_corporativo',b,corp,1000,'PENDIENTE') returning id into t;
 set local role authenticated;
 if (public.disponibilidad_boveda(s)->>'disponible')::numeric<>8500 then raise exception 'FALLÓ: salida pendiente';end if;
 x:=jsonb_build_object('solicitud',gen_random_uuid(),'proveedor',p,'fecha',public.hoy_mx(),'monto',3000,'origen','boveda','reserva',r,'aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',f,'monto',3000)),'motivo','Pago extraordinario de prueba');
 v:=public.registrar_pago_con_origen(x);
 if public.registrar_pago_con_origen(x)<>v then raise exception 'FALLÓ: doble envío';end if;
 if (select saldo from public.saldos_cajas where caja_id=b)<>17000 or (select pendiente from public.reservas_boveda_saldo where id=r)<>3000 or public.pagado_factura(f)<>3000 then raise exception 'FALLÓ: consumo parcial y efectivo';end if;
 if (select count(*) from public.gastos_caja_chica where sucursal_id=s)<>0 then raise exception 'FALLÓ: duplicó gasto';end if;
 if (select count(*) from public.pagos_boveda_eventos where pago_id=v and tipo='pago' and importe=3000 and fecha_operativa=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date)<>1 then raise exception 'FALLÓ: evento para corte operativo';end if;
 if (public.disponibilidad_boveda(s)->>'disponible')::numeric<>8500 then raise exception 'FALLÓ: consumir reserva altera salida libre';end if;
 begin perform public.registrar_pago_con_origen(x||jsonb_build_object('solicitud',gen_random_uuid(),'monto',3000.001));raise exception 'FALLÓ: centavos';exception when others then if sqlerrm<>'Monto de pago inválido.' then raise;end if;end;
 begin perform public.registrar_pago_con_origen(x||jsonb_build_object('solicitud',gen_random_uuid(),'fecha',public.hoy_mx()-1));raise exception 'FALLÓ: bóveda retroactiva';exception when others then if sqlerrm<>'El pago de bóveda se registra hoy, cuando sale el efectivo.' then raise;end if;end;
 perform public.anular_pago(v,'Registro de ensayo: efectivo sigue en la bóveda');
 if (select saldo from public.saldos_cajas where caja_id=b)<>20000 or (select pendiente from public.reservas_boveda_saldo where id=r)<>6000 then raise exception 'FALLÓ: devolución de efectivo';end if;
 if (select sum(importe) from public.pagos_boveda_eventos where pago_id=v)<>0 then raise exception 'FALLÓ: historial de devolución';end if;
 begin perform public.anular_pago(v,'Repetición del ensayo');raise exception 'FALLÓ: doble anulación';exception when others then if sqlerrm<>'El pago no existe o ya estaba anulado' then raise;end if;end;
 -- Fuerza un día no autorizado independientemente de la fecha actual del servidor.
 dia:=public.hoy_mx();for i in 0..6 loop dia:=public.hoy_mx()-i;exit when not public.es_dia_de_pago(dia);end loop;
 if public.es_dia_de_pago(dia) then raise exception 'FALTAN DATOS: configura al menos un día fuera del calendario de pagos para el ensayo.';end if;
 x:=jsonb_build_object('solicitud',gen_random_uuid(),'proveedor',p,'fecha',dia,'monto',100,'origen','transferencia','cuenta','Banregio ensayo','aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',f,'monto',100)));
 begin perform public.registrar_pago_con_origen(x);raise exception 'FALLÓ: sin motivo extraordinario';exception when others then if sqlerrm not like '%no es día de pago autorizado%' then raise;end if;end;
 v:=public.registrar_pago_con_origen(x||jsonb_build_object('motivo','Servicio urgente fuera del viernes'));
 if (select origen_fondos from public.pagos where id=v)<>'transferencia' or (select saldo from public.saldos_cajas where caja_id=b)<>20000 then raise exception 'FALLÓ: transferencia afecta bóveda';end if;
 perform public.cancelar_reserva_boveda(r,'El pago se realizará por transferencia');
 if (public.disponibilidad_boveda(s)->>'reservado')::numeric<>0 or (public.disponibilidad_boveda(s)->>'disponible')::numeric<>14500 then raise exception 'FALLÓ: liberar reserva';end if;
 begin perform public.registrar_pago_con_origen(jsonb_build_object('solicitud',gen_random_uuid(),'proveedor',p,'fecha',public.hoy_mx(),'monto',100,'origen','boveda','reserva',r));raise exception 'FALLÓ: usa cancelada';exception when others then if sqlerrm<>'La reserva está cancelada.' then raise;end if;end;
 begin insert into public.reservas_boveda(sucursal_id,factura_id,monto,fecha_pago,motivo) values(s,f,1,public.hoy_mx(),'Escritura directa');raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if (public.disponibilidad_boveda(s)->>'saldo')::numeric<>20000 then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.reservar_boveda(s,f,1,public.hoy_mx(),'Corporativo intenta');raise exception 'FALLÓ: corporativo reserva';exception when others then if sqlerrm<>'Corporativo solo puede consultar.' then raise;end if;end;
 if has_function_privilege('anon','public.registrar_pago_con_origen(jsonb)','execute') then raise exception 'FALLÓ: anónimo';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 r:=public.reservar_boveda(s,f,1000,public.hoy_mx(),'Reserva para verificar el corte');
 x:=jsonb_build_object('solicitud',gen_random_uuid(),'proveedor',p,'fecha',public.hoy_mx(),'monto',100,'origen','boveda','reserva',r,'aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',f,'monto',100)),'motivo','Ensayo de cierre');
 v:=public.registrar_pago_con_origen(x);
 reset role;
 insert into public.cierres_dia(sucursal_id,fecha,boveda_inicial,boveda_contado,gastos_boveda_dia)
 values(s,((now() at time zone 'America/Mexico_City')-interval '4 hours')::date,20000,19900,999);
 set local role authenticated;
 if not exists(select 1 from public.cierres_dia where sucursal_id=s and gastos_boveda_dia=100 and boveda_esperado=19900 and boveda_diferencia=0) then raise exception 'FALLÓ: corte recalcula pago';end if;
 begin perform public.registrar_pago_con_origen(x||jsonb_build_object('solicitud',gen_random_uuid()));raise exception 'FALLÓ: pagó después del corte';exception when others then if sqlerrm<>'El día operativo está cerrado; registra el pago al iniciar el siguiente.' then raise;end if;end;
 begin perform public.anular_pago(v,'Ensayo de anulación en día cerrado');raise exception 'FALLÓ: alteró día cerrado';exception when others then if sqlerrm<>'El día operativo está cerrado; anula al iniciar el siguiente.' then raise;end if;end;
 raise exception 'PRUEBAS OK — reserva adicional al fondo · conserva efectivo · protege salida a corporativo · salida pendiente · pago parcial desde bóveda · doble envío sin duplicados · corte operativo y día cerrado · sin doble gasto · anulación con devolución e historial · transferencia extraordinaria con motivo · cancelación de reserva · corporativo consulta · sin escritura directa';
end $$;
