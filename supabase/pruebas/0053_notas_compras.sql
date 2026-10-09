-- Ensayo reversible después de 0053.
do $$
declare a uuid;c uuid;s uuid;p uuid;f uuid;o uuid;n uuid:=gen_random_uuid();n2 uuid:=gen_random_uuid();estado_original public.estado_factura;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 if a is null or c is null then raise exception 'FALTAN DATOS: admin y corporativo activos.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.sucursales(nombre) values('Notas prueba '||gen_random_uuid()) returning id into s;
 insert into public.proveedores(razon_social,rfc,regimen_fiscal,sucursal_id,cuenta_pl) values('Proveedor notas','PRB010101AB1','601',s,'servicios') returning id into p;
 insert into public.ordenes_compra(proveedor_id,sucursal_id) values(p,s) returning id into o;
 set local role authenticated;
 f:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',p,'sucursal_id',s,'fecha',public.hoy_mx(),'folio','Ensayo notas','subtotal',100,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',100,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Servicio','importe',100,'cuenta_pl','servicios'))));
 estado_original:=(select facturas.estado from public.facturas where id=f);
 perform public.agregar_compra_nota(n,'factura',f,'Proveedor confirma condiciones por teléfono.');
 perform public.agregar_compra_nota(n,'factura',f,'Proveedor confirma condiciones por teléfono.');
 perform public.agregar_compra_nota(n2,'orden',o,'Entrega pendiente por confirmar.');
 if (select count(*) from public.compra_notas where id=n)<>1 or not exists(select 1 from public.compra_notas where id=n and usuario_id=a and creado_en is not null and factura_id=f and orden_id is null) then raise exception 'FALLÓ: trazabilidad o duplicados';end if;
 if (select facturas.estado from public.facturas where id=f)<>estado_original or not exists(select 1 from public.ordenes_compra where id=o and estado='borrador') then raise exception 'FALLÓ: cambia estado';end if;
 begin perform public.agregar_compra_nota(n,'factura',f,'Texto distinto con la misma solicitud');raise exception 'FALLÓ: sobrescritura';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.agregar_compra_nota(gen_random_uuid(),'factura',f,'');raise exception 'FALLÓ: vacía';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.agregar_compra_nota(gen_random_uuid(),'orden',gen_random_uuid(),'Documento inexistente');raise exception 'FALLÓ: documento';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin update public.compra_notas set texto='Cambiar nota' where id=n;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from public.compra_notas where id=n) then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.agregar_compra_nota(gen_random_uuid(),'factura',f,'Corporativo no escribe');raise exception 'FALLÓ: corporativo escribe';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;set local role anon;
 begin perform public.agregar_compra_nota(gen_random_uuid(),'factura',f,'Anónimo no escribe');raise exception 'FALLÓ: anónimo';exception when insufficient_privilege then null;end;
 reset role;
 raise exception 'PRUEBAS OK — notas de factura y orden · autor y fecha · sin cambiar estado · doble envío sin duplicados · sin sobrescritura · validaciones · corporativo consulta · sin escritura directa · anónimo sin acceso';
end $$;
