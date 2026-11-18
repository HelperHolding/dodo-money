-- Reversible: termina con el error «PRUEBAS OK» a propósito para revertir todo. Objetos Storage simulados; no sube archivos reales.
do $$
declare a uuid;c uuid;s uuid;p uuid;f uuid;f2 uuid;sol uuid:=gen_random_uuid();otro uuid:=gen_random_uuid();tercero uuid:=gen_random_uuid();
 receptor text;viejo text:=upper(gen_random_uuid()::text);nuevo text:=upper(gen_random_uuid()::text);base jsonb;cfdi jsonb;j jsonb;pago uuid;comp uuid;n integer;orig jsonb;nota uuid;
begin
 select id into a from perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select rfc into receptor from razones_sociales where principal and activa;
 if a is null or c is null or receptor is null then raise exception 'FALTAN DATOS: admin, corporativo y razón social principal.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into sucursales(nombre) values('Sustitución ensayo '||sol) returning id into s;
 insert into proveedores(razon_social,rfc,regimen_fiscal,sucursal_id,cuenta_pl) values('Proveedor sustitución','SUS010101AB1','601',s,'insumos') returning id into p;
 base:=jsonb_build_object('version','4.0','tipo','ingreso','moneda','MXN','fecha','2026-10-10','rfc_emisor','SUS010101AB1','rfc_receptor',receptor,'nombre_emisor','Proveedor sustitución',
  'regimen_emisor','601','metodo_pago','PPD','forma_pago','99','serie','','subtotal',751,'descuento',0,'iva',0,'retenciones',0,'retencion_iva',0,'retencion_isr',0,'total',751,
  'uuid_relacionado',null,'uuids_relacionados','[]'::jsonb,'conceptos',jsonb_build_array(jsonb_build_object('descripcion','Fruta','cantidad',1,'unidad','kg','valor_unitario',751,'importe',751)));
 set local role authenticated;
 f:=registrar_factura(base||jsonb_build_object('uuid',viejo,'folio','3079'),false,'pruebas/'||sol||'-viejo.xml',null);
 reset role;
 -- Factura pagada, con complemento ligado al UUID viejo y una nota previa.
 insert into pagos(proveedor_id,fecha,monto,forma,creado_por) values(p,'2026-10-23',751,'transferencia',a) returning id into pago;
 insert into pago_aplicaciones(pago_id,factura_id,monto) values(pago,f,751);
 perform actualizar_estado_factura(f);
 insert into complementos_pago(uuid,fecha,rfc_emisor,nombre_emisor,proveedor_id,monto,xml_ruta,rfc_receptor) values(upper(gen_random_uuid()::text),'2026-10-24','SUS010101AB1','Proveedor sustitución',p,751,'pruebas/rep.xml',receptor) returning id into comp;
 insert into complemento_facturas(complemento_id,factura_uuid,monto_pagado,parcialidad) values(comp,viejo,751,1);
 insert into compra_notas(factura_id,texto,usuario_id) values(f,'Nota previa a la sustitución',a) returning id into nota;
 select count(*) into n from facturas;
 cfdi:=base||jsonb_build_object('uuid',nuevo,'folio','3088','fecha','2026-11-05');
 set local role authenticated;

 begin perform preparar_sustitucion_cfdi(otro,f,cfdi||'{"rfc_receptor":"XAXX010101000"}','Proveedor volvió a timbrar',10,repeat('b',64));raise exception 'FALLÓ: receptor distinto';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform preparar_sustitucion_cfdi(otro,f,cfdi||'{"rfc_emisor":"OTR010101AB1"}','Proveedor volvió a timbrar',10,repeat('b',64));raise exception 'FALLÓ: proveedor distinto';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform preparar_sustitucion_cfdi(otro,f,cfdi||jsonb_build_object('uuid',viejo),'Proveedor volvió a timbrar',10,repeat('b',64));raise exception 'FALLÓ: mismo UUID';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform preparar_sustitucion_cfdi(otro,f,cfdi||jsonb_build_object('uuids_relacionados',jsonb_build_array(upper(gen_random_uuid()::text))),'Proveedor volvió a timbrar',10,repeat('b',64));raise exception 'FALLÓ: relacionado ajeno';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform preparar_sustitucion_cfdi(otro,f,cfdi||'{"tipo":"egreso"}','Proveedor volvió a timbrar',10,repeat('b',64));raise exception 'FALLÓ: egreso';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform preparar_sustitucion_cfdi(otro,f,cfdi,'mal',10,repeat('b',64));raise exception 'FALLÓ: motivo corto';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;

 j:=preparar_sustitucion_cfdi(sol,f,cfdi||jsonb_build_object('uuids_relacionados',jsonb_build_array(lower(viejo))),'Proveedor volvió a timbrar',10,repeat('a',64),20);
 perform preparar_sustitucion_cfdi(sol,f,cfdi||jsonb_build_object('uuids_relacionados',jsonb_build_array(lower(viejo))),'Proveedor volvió a timbrar',10,repeat('a',64),20);
 if (j->'complementos'->>'cantidad')::int<>1 or (j->'complementos'->>'monto')::numeric<>751 or (j->>'pagado')::numeric<>751 then raise exception 'FALLÓ: resumen de vista previa';end if;
 if (select uuid from facturas where id=f)<>viejo then raise exception 'FALLÓ: vista previa cambia factura';end if;
 begin perform confirmar_sustitucion_cfdi(sol);raise exception 'FALLÓ: sin archivo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;
 insert into storage.objects(bucket_id,name,metadata) values('facturas',j->>'ruta','{"size":10,"mimetype":"application/xml"}');
 set local role authenticated;
 begin perform confirmar_sustitucion_cfdi(sol);raise exception 'FALLÓ: sin PDF reservado';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;
 insert into storage.objects(bucket_id,name,metadata) values('facturas',j->>'ruta_pdf','{"size":20,"mimetype":"application/pdf"}');
 update facturas set revision_nota='Cambio posterior',revisada=true where id=f;
 set local role authenticated;
 begin perform confirmar_sustitucion_cfdi(sol);raise exception 'FALLÓ: vista previa obsoleta';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;
 update facturas set revision_nota=null,revisada=false where id=f;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 set local role authenticated;
 begin perform confirmar_sustitucion_cfdi(sol);raise exception 'FALLÓ: corporativo confirma';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 select to_jsonb(q) into orig from facturas q where id=f;
 if confirmar_sustitucion_cfdi(sol)<>f or confirmar_sustitucion_cfdi(sol)<>f then raise exception 'FALLÓ: conserva identidad e idempotencia';end if;
 reset role;
 if (select count(*) from facturas)<>n then raise exception 'FALLÓ: creó otra factura';end if;
 if not exists(select 1 from facturas where id=f and uuid=nuevo and folio='3088' and fecha_emision='2026-11-05' and origen='cfdi' and estado='pagada' and total=751
   and xml_ruta=j->>'ruta' and pdf_ruta=j->>'ruta_pdf' and proveedor_id=p and sucursal_id=s and vence_el=(orig->>'vence_el')::date) then raise exception 'FALLÓ: datos del CFDI nuevo';end if;
 if pagado_factura(f)<>751 or not exists(select 1 from pago_aplicaciones where pago_id=pago and factura_id=f and monto=751) then raise exception 'FALLÓ: pagos';end if;
 if not exists(select 1 from compra_notas where id=nota and factura_id=f) or (select count(*) from compra_notas where factura_id=f and texto like 'CFDI sustituido%'||viejo||'%'||nuevo||'%complemento%')<>1 then raise exception 'FALLÓ: notas e historial';end if;
 if not exists(select 1 from cfdi_sustituciones where id=sol and factura_id=f and uuid_anterior=viejo and uuid_nuevo=nuevo and original->>'folio'='3079' and original->>'xml_ruta'='pruebas/'||sol||'-viejo.xml' and confirmado_en is not null) then raise exception 'FALLÓ: CFDI anterior conservado';end if;
 if not exists(select 1 from complemento_facturas where complemento_id=comp and factura_uuid=viejo) then raise exception 'FALLÓ: complemento anterior conservado';end if;

 -- El XML viejo no vuelve a entrar, ni como factura nueva ni como sustitución de otra.
 set local role authenticated;
 begin perform registrar_factura(base||jsonb_build_object('uuid',viejo,'folio','3079'),false,'pruebas/'||sol||'-otra.xml',null);raise exception 'FALLÓ: XML viejo registrado de nuevo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 f2:=registrar_factura(base||jsonb_build_object('uuid',upper(gen_random_uuid()::text),'folio','3077','total',604,'subtotal',604),false,'pruebas/'||sol||'-otra.xml',null);
 begin perform preparar_sustitucion_cfdi(otro,f2,cfdi||jsonb_build_object('uuid',viejo,'total',604,'subtotal',604),'Proveedor volvió a timbrar',10,repeat('b',64));raise exception 'FALLÓ: reutiliza UUID sustituido';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform preparar_sustitucion_cfdi(otro,f2,cfdi||jsonb_build_object('total',604,'subtotal',604),'Proveedor volvió a timbrar',10,repeat('b',64));raise exception 'FALLÓ: UUID de otra factura';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;

 -- Total distinto: exige aceptar; recalcula saldo sin tocar pagos.
 j:=preparar_sustitucion_cfdi(tercero,f2,cfdi||jsonb_build_object('uuid',upper(gen_random_uuid()::text),'folio','3089','total',600,'subtotal',600),'Proveedor corrigió el importe',10,repeat('c',64));
 reset role;
 insert into storage.objects(bucket_id,name,metadata) values('facturas',j->>'ruta','{"size":10,"mimetype":"application/xml"}');
 set local role authenticated;
 begin perform confirmar_sustitucion_cfdi(tercero);raise exception 'FALLÓ: ajuste sin aceptar';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform confirmar_sustitucion_cfdi(tercero,true);
 reset role;
 if (select total from facturas where id=f2)<>600 or saldo_factura(f2)<>600 or (select pdf_ruta from facturas where id=f2) is not null then raise exception 'FALLÓ: ajuste de total';end if;
 if not exists(select 1 from compra_notas where factura_id=f2 and texto like '%Total anterior: 604%') then raise exception 'FALLÓ: nota de ajuste';end if;

 -- Notas de crédito ligadas al UUID actual bloquean la sustitución.
 set local role authenticated;
 perform registrar_factura(base||jsonb_build_object('uuid',upper(gen_random_uuid()::text),'tipo','egreso','uuid_relacionado',nuevo,'total',10,'subtotal',10),false,'pruebas/'||sol||'-nc.xml',null);
 begin perform preparar_sustitucion_cfdi(gen_random_uuid(),f,cfdi||jsonb_build_object('uuid',upper(gen_random_uuid()::text)),'Proveedor volvió a timbrar',10,repeat('d',64));raise exception 'FALLÓ: nota de crédito ligada';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;

 -- Permisos.
 begin update cfdi_sustituciones set motivo='cambio directo' where id=sol;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if not exists(select 1 from cfdi_sustituciones where id=sol) then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform preparar_sustitucion_cfdi(gen_random_uuid(),f,cfdi,'Proveedor volvió a timbrar',10,repeat('e',64));raise exception 'FALLÓ: corporativo prepara';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;
 if has_function_privilege('anon','public.confirmar_sustitucion_cfdi(uuid,boolean)','execute') or has_function_privilege('anon','public.preparar_sustitucion_cfdi(uuid,uuid,jsonb,text,integer,text,integer)','execute')
  or has_function_privilege('authenticated','public.validar_sustitucion_cfdi(public.facturas,jsonb)','execute') then raise exception 'FALLÓ: permisos de funciones';end if;
 raise exception 'PRUEBAS OK';
end $$;
