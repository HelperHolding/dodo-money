-- Reversible. Arqueos de prueba y comprobante simulado; no sube archivos.
do $$
declare v_admin uuid;v_corp uuid;v_g uuid;v_s uuid;v_p uuid;v_f uuid;v_t uuid;v_a uuid;v_pago uuid;v_payload jsonb;v_op date:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;v_caja uuid;v_boveda uuid;v_saldo numeric;v_ref text;v_otro uuid;v_fecha date;v_docs bigint;v_reserva uuid;
begin
 select id into v_admin from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into v_corp from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id into v_g from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' limit 1;
 if v_admin is null or v_corp is null or v_g is null then raise exception 'FALTAN DATOS: admin, corporativo y gerente.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',v_admin,'role','authenticated')::text,true);
 insert into public.sucursales(nombre,fondo_caja_venta) values('Caja ventas prueba '||gen_random_uuid(),500) returning id into v_s;
 insert into public.cajas(sucursal_id,tipo,nombre) values(v_s,'venta','Cajero prueba') returning id into v_caja;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial) values(v_s,'boveda','Bóveda prueba',10000) returning id into v_boveda;
 insert into public.proveedores(razon_social,rfc,regimen_fiscal,sucursal_id,cuenta_pl) values('Proveedor prueba ventas','PRB010101AB1','601',v_s,'insumos') returning id into v_p;
 insert into public.turnos(sucursal_id,fecha,tipo,encargado_id) values(v_s,v_op,'matutino',v_g) returning id into v_t;
 insert into public.arqueos(turno_id,momento,total_contado,fondo_inicial,ventas_efectivo,entrega_id,recibe_id,recibido_en) values(v_t,'traspaso',2000,1000,1000,v_g,v_admin,now()) returning id into v_a;
 set local role authenticated;
 v_f:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',v_p,'sucursal_id',v_s,'fecha',public.hoy_mx(),'folio','Prueba caja ventas','subtotal',3000,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',3000,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Insumo','importe',3000,'cuenta_pl','insumos'))));
 v_payload:=jsonb_build_object('solicitud',gen_random_uuid(),'turno',v_t,'origen','ventas','proveedor',v_p,'fecha',public.hoy_mx(),'monto',600,'nota','Compra desde efectivo de ventas','comprobante','pagos/ensayo.pdf','aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',v_f,'monto',600)),'motivo','Pago urgente de ensayo');
 begin perform public.registrar_pago_simple(v_payload-'comprobante');raise exception 'FALLÓ: sin ticket';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 v_pago:=public.registrar_pago_simple(v_payload);
 if public.registrar_pago_simple(v_payload)<>v_pago or (public.disponibilidad_ventas(v_t)->>'disponible')::numeric<>900 then raise exception 'FALLÓ: idempotencia o disponible';end if;
 if (select origen_fondos from public.pagos where id=v_pago)<>'ventas' or (select saldo from public.saldos_cajas where caja_id=v_boveda)<>10000 then raise exception 'FALLÓ: origen o descuenta bóveda';end if;
 begin perform public.registrar_pago_simple(v_payload||jsonb_build_object('solicitud',gen_random_uuid(),'monto',1000,'aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',v_f,'monto',1000))));raise exception 'FALLÓ: consume fondo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform public.anular_pago(v_pago,'El efectivo se devolvió al cajero');
 if (public.disponibilidad_ventas(v_t)->>'disponible')::numeric<>1500 then raise exception 'FALLÓ: devuelve al cajero';end if;
 v_payload:=v_payload||jsonb_build_object('solicitud',gen_random_uuid());v_pago:=public.registrar_pago_simple(v_payload);
 perform public.anular_pago(v_pago,'Devolución de prueba a la caja');
 -- Se comprueba el corte con una instantánea, sin cerrar el día operativo.
 reset role;
 insert into public.arqueos(turno_id,momento,total_contado,fondo_inicial,ventas_efectivo,entrega_id) values(v_t,'cierre',2000,1000,1000,v_g);
 if not exists(select 1 from public.arqueos where turno_id=v_t and momento='cierre' and pagos_ventas=0 and esperado=2000 and diferencia=0) then raise exception 'FALLÓ: arqueo al anular';end if;
 set local role authenticated;
 -- Histórico: el importe ya salió antes y NO debe generar eventos ni volver a afectar el corte.
 v_ref:='Ticket anterior '||gen_random_uuid();v_fecha:=public.hoy_mx()-12;
 v_otro:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',v_p,'sucursal_id',v_s,'fecha',v_fecha,'folio',v_ref,'subtotal',300,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',300,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Mantenimiento anterior','importe',300,'cuenta_pl','mantenimiento'))));
 select saldo into v_saldo from public.saldos_cajas where caja_id=v_boveda;
 select count(*) into v_docs from public.facturas where proveedor_id=v_p;
 v_payload:=jsonb_build_object('solicitud',gen_random_uuid(),'historico',true,'origen','boveda_acumulado','sucursal_historica',v_s,'proveedor',v_p,'fecha',v_fecha,'monto',300,'nota','Ya descontado en conteo anterior; captura tardía del ticket','referencia',v_ref,'comprobante','pagos/ensayo-historico.pdf','confirmado','si','aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',v_otro,'monto',300)));
 begin perform public.registrar_pago_simple(v_payload-'confirmado');raise exception 'FALLÓ: confirmación histórica';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.registrar_pago_simple(v_payload-'comprobante');raise exception 'FALLÓ: ticket histórico';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.registrar_pago_simple(v_payload||jsonb_build_object('nota',''));raise exception 'FALLÓ: motivo histórico';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.registrar_pago_simple(v_payload||jsonb_build_object('sucursal_historica',gen_random_uuid()));raise exception 'FALLÓ: sucursal histórica';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.registrar_pago_simple(v_payload||jsonb_build_object('fecha',public.hoy_mx()));raise exception 'FALLÓ: histórico de hoy';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 v_reserva:=public.reservar_boveda(v_s,v_otro,300,public.hoy_mx(),'Reserva para comprobar protección');
 begin perform public.registrar_pago_simple(v_payload);raise exception 'FALLÓ: histórico con reserva activa';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform public.cancelar_reserva_boveda(v_reserva,'Se libera para regularizar pago anterior');
 v_pago:=public.registrar_pago_simple(v_payload);
 if public.registrar_pago_simple(v_payload)<>v_pago or public.saldo_factura(v_otro)<>0 then raise exception 'FALLÓ: histórico aplica una vez';end if;
 if not exists(select 1 from public.pagos where id=v_pago and origen_fondos='historico' and origen_historico='boveda' and fecha=v_fecha and creado_por=v_admin and nota_regularizacion is not null) then raise exception 'FALLÓ: trazabilidad histórica';end if;
 if exists(select 1 from public.pagos_boveda_eventos where pago_id=v_pago) or exists(select 1 from public.pagos_ventas_eventos where pago_id=v_pago) or (select saldo from public.saldos_cajas where caja_id=v_boveda)<>v_saldo then raise exception 'FALLÓ: histórico mueve efectivo';end if;
 if (select count(*) from public.facturas where proveedor_id=v_p)<>v_docs or not exists(select 1 from public.facturas where id=v_otro and fecha_emision=v_fecha and total=300 and estado='pagada') then raise exception 'FALLÓ: conserva documento del P&L';end if;
 begin perform public.registrar_pago_simple(v_payload||jsonb_build_object('solicitud',gen_random_uuid()));raise exception 'FALLÓ: referencia duplicada';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin update public.pagos set nota_regularizacion='Cambio directo' where id=v_pago;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 perform public.anular_pago(v_pago,'Se capturó el documento equivocado');
 if public.saldo_factura(v_otro)<>300 or (select saldo from public.saldos_cajas where caja_id=v_boveda)<>v_saldo or exists(select 1 from public.pagos_boveda_eventos where pago_id=v_pago) then raise exception 'FALLÓ: anular histórico devuelve efectivo';end if;
 -- Histórico desde caja: tampoco depende del turno abierto ni devuelve efectivo al anular.
 v_payload:=v_payload||jsonb_build_object('solicitud',gen_random_uuid(),'origen','ventas','referencia',v_ref||' caja');v_pago:=public.registrar_pago_simple(v_payload);
 if exists(select 1 from public.pagos_ventas_eventos where pago_id=v_pago) then raise exception 'FALLÓ: histórico de caja genera salida';end if;
 perform public.anular_pago(v_pago,'Corrección del pago histórico de caja');
 -- Tarjeta: liquida el documento sin salidas de efectivo.
 v_payload:=v_payload||jsonb_build_object('solicitud',gen_random_uuid(),'historico',false,'origen','tarjeta','cuenta','Banco prueba 1234','fecha',public.hoy_mx(),'motivo','Pago de prueba por tarjeta');
 v_pago:=public.registrar_pago_simple(v_payload);
 if public.registrar_pago_simple(v_payload)<>v_pago or not exists(select 1 from public.pagos where id=v_pago and forma::text='tarjeta' and origen_fondos='tarjeta') or (select saldo from public.saldos_cajas where caja_id=v_boveda)<>v_saldo then raise exception 'FALLÓ: tarjeta o doble envío';end if;
 perform public.anular_pago(v_pago,'Anulación de prueba con tarjeta');
 -- Bóveda actual: se usa el acumulado sin liberar manualmente por fecha.
 v_payload:=v_payload||jsonb_build_object('solicitud',gen_random_uuid(),'origen','boveda_acumulado','sucursal',v_s,'nota','Compra del día desde acumulado','historico',false);
 v_pago:=public.registrar_pago_simple(v_payload);
 if (select saldo from public.saldos_cajas where caja_id=v_boveda)<>v_saldo-300 then raise exception 'FALLÓ: acumulado descuenta una vez';end if;
 perform public.anular_pago(v_pago,'Devolución real a bóveda en la prueba');
 if (select saldo from public.saldos_cajas where caja_id=v_boveda)<>v_saldo then raise exception 'FALLÓ: devuelve pago actual';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',v_corp,'role','authenticated')::text,true);
 if not exists(select 1 from public.pagos where id=v_pago) then raise exception 'FALLÓ: corporativo no consulta';end if;
 begin perform public.registrar_pago_simple(v_payload);raise exception 'FALLÓ: corporativo paga';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if has_function_privilege('anon','public.registrar_pago_simple(jsonb)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — caja con acumulado contado · fondo autorizado protegido · corte sin doble gasto · bóveda sin liberación manual · tarjeta · histórico con motivo y ticket · fecha y sucursal · idempotencia · conserva documento P&L · sin mover efectivo histórico · anulación sin devolución ficticia · corporativo consulta · sin escritura directa · anónimo sin ejecución';
end $$;
