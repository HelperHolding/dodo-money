-- Ensayo reversible: PRUEBAS OK revierte todo el bloque.
do $$
declare a uuid;c uuid;s uuid;p uuid;f uuid;otro uuid;sol uuid:=gen_random_uuid();u text:=upper(gen_random_uuid()::text);v text:=upper(gen_random_uuid()::text);antes jsonb;despues jsonb;
begin
 select id,sucursal_id into a,s from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 if a is null or c is null then raise exception 'FALTAN DATOS: admin y corporativo activos.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.proveedores(razon_social,rfc,regimen_fiscal,cuenta_pl) values('UUID manual ensayo','UMN010101AB1','601','insumos') returning id into p;
 set local role authenticated;
 f:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',p,'sucursal_id',s,'fecha',public.hoy_mx(),'folio','UUID manual ensayo','subtotal',100,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',100,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Insumo','importe',100,'cuenta_pl','insumos'))));
 otro:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',p,'sucursal_id',s,'fecha',public.hoy_mx(),'folio','UUID otro ensayo','subtotal',100,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',100,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Insumo','importe',100,'cuenta_pl','insumos'))));
 select to_jsonb(x)-'uuid_manual' into antes from public.facturas x where id=f;
 begin perform public.guardar_uuid_manual_factura(gen_random_uuid(),f,null,'invalido','Captura de ensayo');raise exception 'FALLÓ: formato';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.guardar_uuid_manual_factura(gen_random_uuid(),f,null,u,'');raise exception 'FALLÓ: motivo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform public.guardar_uuid_manual_factura(sol,f,null,lower(u),'UUID tomado del PDF de ensayo');
 perform public.guardar_uuid_manual_factura(sol,f,null,lower(u),'UUID tomado del PDF de ensayo');
 if not exists(select 1 from public.facturas_saldo where id=f and uuid_manual=u and uuid is null and origen='manual' and xml_ruta is null) then raise exception 'FALLÓ: captura o vista';end if;
 select to_jsonb(x)-'uuid_manual' into despues from public.facturas x where id=f;
 if antes is distinct from despues then raise exception 'FALLÓ: cambió importes, pagos o estado';end if;
 if (select count(*) from public.factura_uuid_manual_historial where factura_id=f)<>1 or not exists(select 1 from public.compra_notas where factura_id=f and texto like 'UUID manual:%') then raise exception 'FALLÓ: historial o doble envío';end if;
 begin perform public.guardar_uuid_manual_factura(gen_random_uuid(),otro,null,u,'UUID duplicado de ensayo');raise exception 'FALLÓ: duplicado manual';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.guardar_uuid_manual_factura(gen_random_uuid(),f,null,v,'Pantalla desactualizada');raise exception 'FALLÓ: sobrescritura';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;
 begin update public.facturas set uuid=u where id=otro;raise exception 'FALLÓ: duplicado desde XML';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin update public.facturas set uuid=v where id=f;raise exception 'FALLÓ: XML distinto';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 set local role authenticated;
 perform public.guardar_uuid_manual_factura(gen_random_uuid(),f,u,v,'Corrección del UUID del PDF');
 perform public.guardar_uuid_manual_factura(gen_random_uuid(),f,v,'','Retirar dato manual incorrecto');
 if (select uuid_manual from public.facturas where id=f) is not null or (select count(*) from public.factura_uuid_manual_historial where factura_id=f)<>3 then raise exception 'FALLÓ: corrección y retiro con historial';end if;
 begin update public.factura_uuid_manual_historial set motivo='Escritura directa' where id=sol;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from public.factura_uuid_manual_historial where id=sol) then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.guardar_uuid_manual_factura(gen_random_uuid(),f,null,u,'Captura no autorizada');raise exception 'FALLÓ: corporativo gestiona';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if has_function_privilege('anon','public.guardar_uuid_manual_factura(uuid,uuid,text,text,text)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — UUID manual · formato y motivo · XML pendiente · sin cambiar importes ni estado · UUID único entre manual y XML · XML distinto protegido · corrección y retiro con historial · doble envío · sin sobrescritura · corporativo consulta · sin escritura directa · anónimo sin ejecución';
end $$;
