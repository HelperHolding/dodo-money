-- Ensayo reversible. El RAISE PRUEBAS OK revierte todos los datos de ensayo.
do $$
declare a uuid;c uuid;z uuid;otra uuid;p uuid;primaria text;manual uuid;factura_principal uuid;xml_id uuid;orden uuid;comp uuid;sol uuid:=gen_random_uuid();cfdi jsonb;j jsonb;u text:=upper(gen_random_uuid()::text);n bigint;antes jsonb;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id into z from public.sucursales where nombre='Zapopan-1';
 select rfc into primaria from public.razones_sociales where principal;
 if a is null or c is null or z is null or primaria is null then raise exception 'FALTAN DATOS: admin, corporativo, Zapopan-1 y empresa principal.';end if;
 select to_jsonb(e) into antes from public.empresa e;
 select count(*) into n from public.facturas;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.sucursales(nombre) values('Ensayo razones '||sol) returning id into otra;
 insert into public.proveedores(razon_social,rfc,regimen_fiscal,sucursal_id,cuenta_pl) values('Proveedor razones ensayo','PRB010101AB1','601',z,'insumos') returning id into p;
 set local role authenticated;
 if exists(select 1 from public.razones_sociales where rfc='HCM260306G93' and activa) then raise exception 'FALLÓ: RFC histórico habilitado';end if;
 -- La captura antigua continúa en la empresa principal.
 factura_principal:=public.registrar_gasto_manual(jsonb_build_object('proveedor_id',p,'sucursal_id',z,'fecha',public.hoy_mx(),'folio','Ensayo principal','subtotal',100,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',100,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Insumo','importe',100,'cuenta_pl','insumos'))));
 manual:=public.registrar_gasto_manual(jsonb_build_object('rfc_receptor','CMS230321FI8','proveedor_id',p,'sucursal_id',z,'fecha',public.hoy_mx(),'folio','Ensayo SITRU','subtotal',100,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',100,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Insumo','importe',100,'cuenta_pl','insumos'))));
 if (select rfc_receptor from public.facturas where id=manual)<>'CMS230321FI8' or (select rfc_receptor from public.facturas where id=factura_principal)<>primaria then raise exception 'FALLÓ: razones de prefacturas';end if;
 begin
  perform public.registrar_gasto_manual(jsonb_build_object('rfc_receptor','CMS230321FI8','proveedor_id',p,'sucursal_id',otra,'fecha',public.hoy_mx(),'folio','Sucursal incorrecta','subtotal',100,'iva',0,'retencion_iva',0,'retencion_isr',0,'total',100,'renglones',jsonb_build_array(jsonb_build_object('descripcion','Insumo','importe',100))));
  raise exception 'FALLÓ: sucursal de otra razón';
 exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 cfdi:=jsonb_build_object('uuid',u,'version','4.0','tipo','ingreso','moneda','MXN','fecha',public.hoy_mx(),'rfc_emisor','PRB010101AB1','rfc_receptor','CMS230321FI8','nombre_emisor','Proveedor razones ensayo','regimen_emisor','601','metodo_pago','PUE','forma_pago','01','folio','Ensayo XML','subtotal',100,'descuento',0,'iva',0,'retenciones',0,'retencion_iva',0,'retencion_isr',0,'total',100,'conceptos',jsonb_build_array(jsonb_build_object('descripcion','Insumo','cantidad',1,'unidad','pieza','valor_unitario',100,'importe',100)));
 xml_id:=public.registrar_factura(cfdi,false,'ensayo/'||sol||'.xml',null);
 if not exists(select 1 from public.facturas f where f.id=xml_id and f.rfc_receptor='CMS230321FI8' and f.sucursal_id=z) then raise exception 'FALLÓ: XML identifica razón y sucursal';end if;
 begin perform public.registrar_factura(cfdi,false,'ensayo/duplicado.xml',null);raise exception 'FALLÓ: UUID duplicado';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.registrar_factura(cfdi||jsonb_build_object('uuid',upper(gen_random_uuid()::text),'rfc_receptor','OTR010101AB1'),false,'ensayo/ajeno.xml',null);raise exception 'FALLÓ: RFC desconocido';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.registrar_factura(cfdi||jsonb_build_object('uuid',upper(gen_random_uuid()::text),'tipo','egreso','uuid_relacionado',u,'rfc_receptor',primaria),false,'ensayo/nota-cruzada.xml',null);raise exception 'FALLÓ: nota de crédito de otra razón';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.registrar_factura(cfdi||jsonb_build_object('uuid',upper(gen_random_uuid()::text),'rfc_receptor','HCM260306G93'),false,'ensayo/historico-inactivo.xml',null);raise exception 'FALLÓ: nuevas capturas en RFC histórico';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 -- Conversión nunca cambia la razón social de la prefactura.
 begin perform public.preparar_cfdi_prefactura(sol,factura_principal,cfdi||jsonb_build_object('uuid',upper(gen_random_uuid()::text)),'Entrega CFDI de ensayo',10,repeat('a',64));raise exception 'FALLÓ: conversión de otra razón';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.sustituir_factura_manual(xml_id,factura_principal);raise exception 'FALLÓ: sustitución entre razones';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 -- Una orden de la principal no se liga a la factura de SITRU.
 insert into public.ordenes_compra(proveedor_id,sucursal_id) values(p,z) returning id into orden;
 reset role;
 update public.ordenes_compra set estado='confirmada',confirmada_en=now(),confirmada_por=a where id=orden;
 set local role authenticated;
 begin perform public.ligar_factura_ordenes(xml_id,array[orden]);raise exception 'FALLÓ: orden de otra razón';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 comp:=public.registrar_complemento(jsonb_build_object('uuid',upper(gen_random_uuid()::text),'fecha',public.hoy_mx(),'rfc_receptor','CMS230321FI8','rfc_emisor','PRB010101AB1','nombre_emisor','Proveedor ensayo','monto',100,'documentos',jsonb_build_array(jsonb_build_object('uuid',u,'monto_pagado',100,'parcialidad',1))),'ensayo/complemento.xml');
 if (select rfc_receptor from public.complementos_pago where id=comp)<>'CMS230321FI8' then raise exception 'FALLÓ: complemento';end if;
 begin perform public.registrar_complemento(jsonb_build_object('uuid',upper(gen_random_uuid()::text),'fecha',public.hoy_mx(),'rfc_receptor',primaria,'rfc_emisor','PRB010101AB1','monto',100,'documentos',jsonb_build_array(jsonb_build_object('uuid',u,'monto_pagado',100,'parcialidad',1))),'ensayo/cruzado.xml');raise exception 'FALLÓ: complemento de otra razón';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if (select count(*) from public.facturas)<>n+3 or antes is distinct from (select to_jsonb(e) from public.empresa e) then raise exception 'FALLÓ: conservación del histórico o duplicado';end if;
 begin update public.razones_sociales set razon_social='Cambio directo' where rfc='CMS230321FI8';raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 -- Alta con historial e idempotencia, sin sobrescritura.
 perform public.registrar_razon_social('PRB010101AB1','Razón de ensayo',array[z],'Alta de ensayo');
 perform public.registrar_razon_social('PRB010101AB1','Razón de ensayo',array[z],'Alta de ensayo');
 if (select count(*) from public.razones_sociales_historial where rfc='PRB010101AB1')<>1 then raise exception 'FALLÓ: historial único';end if;
 begin perform public.registrar_razon_social('PRB010101AB1','Otro nombre',array[z],'No sobrescribir');raise exception 'FALLÓ: sobrescritura';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from public.razones_sociales where rfc='CMS230321FI8') then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.registrar_razon_social('PRB010101AB1','Razón de ensayo',array[z],'Alta de ensayo');raise exception 'FALLÓ: corporativo gestiona';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if has_function_privilege('anon','public.registrar_razon_social(text,text,uuid[],text)','execute') or has_function_privilege('authenticated','public.razon_admite_sucursal(text,uuid)','execute') then raise exception 'FALLÓ: ejecución pública o helper expuesto';end if;
 raise exception 'PRUEBAS OK — RFC histórico conservado e inactivo · razones del grupo · SITRU Zapopan-1 · XML por RFC · prefactura por empresa · histórico conservado · UUID único · sucursal protegida · sin cruces de órdenes, sustituciones o complementos · alta con historial · doble envío · sin sobrescritura · corporativo consulta · sin escritura directa · helper privado · anónimo sin ejecución';
end $$;
