-- Reversible. Arqueos de prueba y comprobante simulado; no sube archivos.
do $$
declare v_admin uuid;v_corp uuid;v_g uuid;v_s uuid;v_p uuid;v_f uuid;v_t uuid;v_a uuid;v_pago uuid;v_payload jsonb;v_op date:=((now() at time zone 'America/Mexico_City')-interval '4 hours')::date;v_caja uuid;v_boveda uuid;
begin
 select id into v_admin from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into v_corp from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id into v_g from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' limit 1;
 if v_admin is null or v_corp is null or v_g is null then raise exception 'FALTAN DATOS: admin, corporativo y gerente.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',v_admin,'role','authenticated')::text,true);
 insert into public.sucursales(nombre,fondo_caja_venta) values('Caja ventas prueba '||gen_random_uuid(),500) returning id into v_s;
 insert into public.cajas(sucursal_id,tipo,nombre) values(v_s,'venta','Cajero prueba') returning id into v_caja;
 insert into public.cajas(sucursal_id,tipo,nombre,saldo_inicial) values(v_s,'boveda','Bóveda prueba',4500) returning id into v_boveda;
 insert into public.proveedores(razon_social,rfc,regimen_fiscal,sucursal_id,cuenta_pl) values('Proveedor prueba ventas','PRB010101AB1','601',v_s,'insumos') returning id into v_p;
 insert into public.turnos(sucursal_id,fecha,tipo,encargado_id) values(v_s,v_op,'matutino',v_g) returning id into v_t;
 insert into public.arqueos(turno_id,momento,total_contado,fondo_inicial,ventas_efectivo,entrega_id,recibe_id,recibido_en) values(v_t,'traspaso',2000,500,1500,v_g,v_admin,now()) returning id into v_a;
 set local role authenticated;
 v_f:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',v_p,'sucursal_id',v_s,'fecha',public.hoy_mx(),'folio','Prueba caja ventas','subtotal',3000,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',3000,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Insumo','importe',3000,'cuenta_pl','insumos'))));
 v_payload:=jsonb_build_object('solicitud',gen_random_uuid(),'turno',v_t,'origen','ventas','proveedor',v_p,'fecha',public.hoy_mx(),'monto',600,'nota','Compra desde efectivo de ventas','comprobante','pagos/ensayo.pdf','aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',v_f,'monto',600)),'motivo','Pago urgente de ensayo');
 begin perform public.registrar_pago_ventas(v_payload-'comprobante');raise exception 'FALLÓ: sin ticket';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 v_pago:=public.registrar_pago_ventas(v_payload);
 if public.registrar_pago_ventas(v_payload)<>v_pago or (public.disponibilidad_ventas(v_t)->>'disponible')::numeric<>900 then raise exception 'FALLÓ: idempotencia o disponible';end if;
 if (select origen_fondos from public.pagos where id=v_pago)<>'ventas' or (select saldo from public.saldos_cajas where caja_id=v_boveda)<>4500 then raise exception 'FALLÓ: origen o descuenta bóveda';end if;
 begin perform public.registrar_pago_ventas(v_payload||jsonb_build_object('solicitud',gen_random_uuid(),'monto',1000,'aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',v_f,'monto',1000))));raise exception 'FALLÓ: consume fondo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform public.anular_pago(v_pago,'El efectivo se devolvió al cajero');
 if (public.disponibilidad_ventas(v_t)->>'disponible')::numeric<>1500 then raise exception 'FALLÓ: devuelve al cajero';end if;
 v_payload:=v_payload||jsonb_build_object('solicitud',gen_random_uuid());v_pago:=public.registrar_pago_ventas(v_payload);
 reset role;
 insert into public.arqueos(turno_id,momento,total_contado,fondo_inicial,ventas_efectivo,entrega_id) values(v_t,'cierre',1400,500,1500,v_g);
 if not exists(select 1 from public.arqueos where turno_id=v_t and momento='cierre' and pagos_ventas=600 and esperado=1400 and diferencia=0) then raise exception 'FALLÓ: arqueo descuenta una vez';end if;
 update public.turnos set cerrado_en=now() where id=v_t;
 set local role authenticated;
 begin perform public.registrar_pago_ventas(v_payload||jsonb_build_object('solicitud',gen_random_uuid()));raise exception 'FALLÓ: turno cerrado';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform public.anular_pago(v_pago,'Devolución física a bóveda tras cerrar turno');
 if not exists(select 1 from public.pagos_boveda_eventos where pago_id=v_pago and tipo='anulacion' and importe=-600) then raise exception 'FALLÓ: devolución después del cierre';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',v_corp,'role','authenticated')::text,true);
 begin perform public.registrar_pago_ventas(v_payload);raise exception 'FALLÓ: corporativo registra pago';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if has_function_privilege('anon','public.registrar_pago_ventas(jsonb)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — efectivo de ventas · conteo confirmado · fondo protegido · ticket y motivo · sin duplicados · arqueo sin doble gasto · turno cerrado · devolución a caja o bóveda actual · corporativo consulta · anónimo sin ejecución';
end $$;
