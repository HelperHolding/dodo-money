-- La excepción PRUEBAS OK revierte el ensayo completo. Requiere 0046 y empresa configurada.
do $$
declare a uuid;c uuid;s uuid;p uuid;art uuid;o uuid;o2 uuid;f uuid;pago uuid;destino uuid;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id into s from public.sucursales limit 1;
 if a is null or c is null or s is null or not exists(select 1 from public.empresa) then raise exception 'FALTAN DATOS: admin, corporativo, sucursal y datos de empresa.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.proveedores(razon_social,rfc,regimen_fiscal,sucursal_id,cuenta_pl) values('Proveedor de prueba orden-factura','POF010101AB1','601',s,'servicios') returning id into p;
 insert into public.articulos(nombre,unidad,tipo) values('Artículo de prueba orden-factura','pza','servicio') returning id into art;
 -- Oficina debe conservarse aunque el proveedor tenga sucursal por omisión.
 insert into public.ordenes_compra(proveedor_id,sucursal_id) values(p,null) returning id into o;
 insert into public.orden_renglones(orden_id,articulo_id,descripcion,cantidad,precio,tasa_iva) values(o,art,'Servicio gravado',2,100,'16'),(o,art,'Servicio exento',3,10,'exento');
 update public.ordenes_compra set estado='confirmada',confirmada_por=a,confirmada_en=now() where id=o;
 insert into public.ordenes_compra(proveedor_id,sucursal_id) values(p,s) returning id into o2;
 set local role authenticated;
 begin perform public.facturar_orden(o2);raise exception 'FALLÓ: factura borrador';exception when others then if sqlerrm<>'Confirma la orden antes de facturar.' then raise;end if;end;
 f:=public.facturar_orden(o);

 perform public.programar_recepcion_factura(f,public.hoy_mx()+1);
 if (select recepcion_programada_el from public.facturas_saldo where id=f) is distinct from public.hoy_mx()+1 or (select entrega_esperada from public.ordenes_compra where id=o) is distinct from public.hoy_mx()+1 then raise exception 'FALLÓ: recepción y orden';end if;
 if exists(select 1 from public.renglones_recibido where orden_id=o and recibido<>0) then raise exception 'FALLÓ: inventó recepción';end if;
 begin perform public.programar_recepcion_factura(f,public.hoy_mx()-1);raise exception 'FALLÓ: recepción pasada';exception when others then if sqlerrm<>'No se programa una recepción en una fecha que ya pasó.' then raise;end if;end;
 perform public.programar_pago_detalle(f,public.hoy_mx()+2,'efectivo');
 if not exists(select 1 from public.facturas_saldo where id=f and pago_programado_forma='efectivo' and pago_programado_el=public.hoy_mx()+2) then raise exception 'FALLÓ: forma prevista';end if;
 if public.programar_pagos_detalle(array[f],public.hoy_mx()+3,'transferencia')<>1 then raise exception 'FALLÓ: bloque';end if;
 if (select pago_programado_forma from public.facturas where id=f) is distinct from 'transferencia'::public.forma_pago then raise exception 'FALLÓ: forma bloque';end if;
 begin perform public.programar_pago_detalle(f,public.hoy_mx(),null);raise exception 'FALLÓ: sin forma';exception when others then if sqlerrm<>'Elige la forma de pago prevista.' then raise;end if;end;
 begin perform public.programar_pago_detalle(f,public.hoy_mx(),'otra');raise exception 'FALLÓ: forma inválida';exception when others then if sqlerrm<>'Elige la forma de pago prevista.' then raise;end if;end;
 begin perform public.programar_pago_detalle(f,public.hoy_mx()-1,'efectivo');raise exception 'FALLÓ: pago pasado';exception when others then if sqlerrm<>'No se programa un pago en una fecha que ya pasó.' then raise;end if;end;
 if public.pagado_factura(f)<>0 then raise exception 'FALLÓ: programación pagó';end if;
 perform public.programar_pago_detalle(f,null,null);
 perform public.programar_recepcion_factura(f,null);
 if exists(select 1 from public.facturas where id=f and (pago_programado_el is not null or pago_programado_forma is not null or recepcion_programada_el is not null)) or (select entrega_esperada from public.ordenes_compra where id=o) is not null then raise exception 'FALLÓ: quitar programación';end if;
 if (select count(*) from public.factura_programacion_historial where factura_id=f)<>5 then raise exception 'FALLÓ: historial';end if;
 begin insert into public.factura_programacion_historial(factura_id,tipo) values(f,'pago');raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 -- CFDI que sustituye a la prefactura: conservar las fechas, sin pisar su programación propia.
 perform public.programar_pago_detalle(f,public.hoy_mx()+2,'tarjeta');
 perform public.programar_recepcion_factura(f,public.hoy_mx()+1);
 reset role;
 insert into public.facturas(uuid,xml_ruta,origen,tipo,fecha_emision,rfc_emisor,nombre_emisor,regimen_emisor,rfc_receptor,subtotal,total,proveedor_id,vence_el)
 select gen_random_uuid()::text,'ensayo.xml','cfdi','ingreso',public.hoy_mx(),rfc_emisor,nombre_emisor,regimen_emisor,rfc_receptor,subtotal,total,proveedor_id,vence_el from public.facturas where id=f returning id into destino;
 set local role authenticated;
 perform public.sustituir_factura_manual(destino,f);
 if not exists(select 1 from public.facturas where id=destino and recepcion_programada_el=public.hoy_mx()+1 and pago_programado_el=public.hoy_mx()+2 and pago_programado_forma='tarjeta') then raise exception 'FALLÓ: sustitución conserva programación';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if (select count(*) from public.factura_programacion_historial where factura_id=f)<>7 then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.programar_recepcion_factura(f,public.hoy_mx());raise exception 'FALLÓ: corporativo recepción';exception when others then if sqlerrm<>'Corporativo solo puede consultar.' then raise;end if;end;
 begin perform public.programar_pago_detalle(f,public.hoy_mx(),'efectivo');raise exception 'FALLÓ: corporativo pago';exception when others then if sqlerrm<>'Corporativo solo puede consultar.' then raise;end if;end;
 if has_function_privilege('anon','public.programar_recepcion_factura(uuid,date)','execute') or has_function_privilege('anon','public.programar_pago_detalle(uuid,date,text)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — sustitución conserva programación · recepción desde factura · actualiza orden pendiente · no inventa cantidades · cualquier fecha futura · forma de pago individual y en bloque · quitar programación · historial · no registra pagos · corporativo consulta · sin escritura directa';
end $$;
