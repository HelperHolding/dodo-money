-- Ejecutar después de 0044. PRUEBAS OK es una excepción intencional: revierte todo el ensayo.
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

 r:=public.reservar_boveda(s,f,1000,public.hoy_mx(),'Compromiso existente');
 x:=jsonb_build_object('solicitud',gen_random_uuid(),'proveedor',p,'fecha',public.hoy_mx(),'monto',3000,'origen','boveda_acumulado','sucursal',s,'nota','Compra urgente de insumos con efectivo acumulado','comprobante','pagos/ticket-ensayo.pdf','aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',f,'monto',3000)),'motivo','Compra urgente fuera de calendario');
 begin perform public.registrar_pago_boveda_acumulado(x-'nota');raise exception 'FALLÓ: sin motivo';exception when others then if sqlerrm not like 'Especifica el motivo%' then raise;end if;end;
 begin perform public.registrar_pago_boveda_acumulado(x-'comprobante');raise exception 'FALLÓ: sin ticket';exception when others then if sqlerrm<>'Adjunta el ticket o comprobante del pago.' then raise;end if;end;
 begin perform public.registrar_pago_boveda_acumulado(x||jsonb_build_object('fecha',public.hoy_mx()-1));raise exception 'FALLÓ: retroactivo';exception when others then if sqlerrm<>'El pago de bóveda se registra hoy, cuando sale el efectivo.' then raise;end if;end;
 if (select count(*) from public.reservas_boveda where sucursal_id=s)<>1 then raise exception 'FALLÓ: reserva huérfana tras error';end if;

 begin perform public.registrar_pago_boveda_acumulado(x||jsonb_build_object('monto',16000,'aplicaciones',jsonb_build_array(jsonb_build_object('factura_id',f,'monto',16000))));raise exception 'FALLÓ: excede factura';exception when others then if sqlerrm<>'Las reservas exceden el saldo de la factura.' then raise;end if;end;
 reset role;
 update public.cajas set saldo_inicial=8500 where id=b;
 set local role authenticated;
 begin perform public.registrar_pago_boveda_acumulado(x||jsonb_build_object('monto',3000.01));raise exception 'FALLÓ: fondo y reserva';exception when others then if sqlerrm<>'No hay efectivo libre: conserva el fondo y las salidas y reservas existentes.' then raise;end if;end;
 reset role;
 update public.cajas set saldo_inicial=20000 where id=b;
 set local role authenticated;
 v:=public.registrar_pago_boveda_acumulado(x);
 if public.registrar_pago_boveda_acumulado(x)<>v then raise exception 'FALLÓ: reintento';end if;
 if (select saldo from public.saldos_cajas where caja_id=b)<>17000 or public.pagado_factura(f)<>3000 then raise exception 'FALLÓ: efectivo o aplicación';end if;
 if (public.disponibilidad_boveda(s)->>'reservado')::numeric<>1000 then raise exception 'FALLÓ: reserva previa';end if;
 if not exists(select 1 from public.pagos where id=v and nota_boveda=x->>'nota' and comprobante_ruta='pagos/ticket-ensayo.pdf' and origen_fondos='boveda') then raise exception 'FALLÓ: nota y ticket';end if;
 if (select count(*) from public.pagos_boveda_eventos where pago_id=v)<>1 or (select count(*) from public.gastos_caja_chica where sucursal_id=s)<>0 then raise exception 'FALLÓ: doble registro';end if;
 begin perform public.registrar_pago_boveda_acumulado(x||jsonb_build_object('nota','Otra compra diferente'));raise exception 'FALLÓ: solicitud reutilizada';exception when others then if sqlerrm<>'Esta solicitud ya registró otro pago. Recarga el formulario.' then raise;end if;end;
 perform public.anular_pago(v,'El efectivo fue devuelto físicamente a bóveda');
 if (select saldo from public.saldos_cajas where caja_id=b)<>20000 then raise exception 'FALLÓ: devolución';end if;
 -- La reserva automática vuelve a proteger el efectivo al anular, como cualquier reserva existente.
 if (public.disponibilidad_boveda(s)->>'reservado')::numeric<>4000 then raise exception 'FALLÓ: reserva tras anulación';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 begin perform public.registrar_pago_boveda_acumulado(x||jsonb_build_object('solicitud',gen_random_uuid()));raise exception 'FALLÓ: corporativo';exception when others then if sqlerrm<>'Corporativo solo puede consultar.' then raise;end if;end;
 if has_function_privilege('anon','public.registrar_pago_boveda_acumulado(jsonb)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — efectivo acumulado · motivo y ticket obligatorios · reserva y pago atómicos · conserva compromisos · salida actual · sin duplicados ni doble gasto · anulación con devolución · corporativo consulta';
end $$;
