-- La excepción PRUEBAS OK revierte el ensayo completo. Requiere 0041 y empresa configurada.
do $$
declare a uuid;c uuid;s uuid;p uuid;art uuid;o uuid;o2 uuid;f uuid;pago uuid;
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
 if not exists(select 1 from public.facturas where id=f and origen='manual' and uuid is null and proveedor_id=p and sucursal_id is null and subtotal=230 and iva=32 and total=262) then raise exception 'FALLÓ: copia de orden e IVA mixto';end if;
 if not exists(select 1 from public.factura_conceptos where factura_id=f and descripcion='Servicio gravado' and cantidad=2 and valor_unitario=100 and importe=200 and unidad='pza' and cuenta_pl='servicios') or (select count(*) from public.factura_conceptos where factura_id=f)<>2 then raise exception 'FALLÓ: cantidades y precios';end if;
 if not exists(select 1 from public.factura_ordenes where factura_id=f and orden_id=o) then raise exception 'FALLÓ: vínculo';end if;
 if (select estado from public.ordenes_compra where id=o)<>'confirmada' then raise exception 'FALLÓ: cerró sin recepción';end if;
 if public.facturar_orden(o)<>f or (select count(*) from public.factura_ordenes where orden_id=o)<>1 then raise exception 'FALLÓ: doble factura';end if;
 if (select count(*) from public.orden_historial where orden_id=o and evento='facturada')<>1 then raise exception 'FALLÓ: historial duplicado';end if;
 if public.cotejo_factura(f)<>'nada_recibido' then raise exception 'FALLÓ: cotejo sin recepción';end if;
 begin
  perform public.registrar_pago(p,public.hoy_mx(),100,'transferencia',null,'Prueba orden-factura',null,jsonb_build_array(jsonb_build_object('factura_id',f,'monto',100)),'Ensayo de pago desde orden');
  raise exception 'FALLÓ: pagó sin recepción ni revisión';
 exception when others then if sqlerrm not like 'La factura % no cuadra con su orden: márcala como revisada antes de pagarla' then raise;end if;end;
 if public.pagado_factura(f)<>0 then raise exception 'FALLÓ: pago bloqueado dejó aplicación';end if;
 perform public.marcar_factura_revisada(f,'Anticipo autorizado antes de recepción. Orden y montos verificados en el ensayo.');
 pago:=public.registrar_pago(p,public.hoy_mx(),100,'transferencia',null,'Prueba orden-factura',null,jsonb_build_array(jsonb_build_object('factura_id',f,'monto',100)),'Ensayo de pago desde orden');
 if public.pagado_factura(f)<>100 or (select estado from public.facturas where id=f)<>'parcial' then raise exception 'FALLÓ: pago';end if;
 if public.facturar_orden(o)<>f then raise exception 'FALLÓ: factura parcialmente pagada';end if;
 -- En borrador no se modifica la orden para fabricar una factura desde el cliente.
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 begin perform public.facturar_orden(o);raise exception 'FALLÓ: corporativo factura';exception when others then if sqlerrm<>'Corporativo solo puede consultar.' then raise;end if;end;
 if not exists(select 1 from public.factura_ordenes where factura_id=f and orden_id=o) then raise exception 'FALLÓ: corporativo consulta';end if;
 if has_function_privilege('anon','public.facturar_orden(uuid)','EXECUTE') then raise exception 'FALLÓ: RPC anónima';end if;
 raise exception 'PRUEBAS OK — orden confirmada · copia proveedor y sucursal · conserva Oficina · IVA mixto · cantidades y precios · cuenta por concepto · vínculo automático · sin duplicados · sin recepción exige revisión · anticipo revisado y pago parcial · corporativo consulta';
end $$;
