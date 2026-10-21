-- Reversible: PRUEBAS OK revierte todos los datos del ensayo.
do $$
declare a uuid;c uuid;g uuid;p uuid;art uuid;o uuid;r uuid;f uuid;s uuid;receptor text;marca uuid:=gen_random_uuid();
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id into g from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' limit 1;
 select rfc into receptor from public.razones_sociales where principal and activa;
 if a is null or c is null or g is null or receptor is null then raise exception 'FALTAN DATOS: admin, corporativo, gerente y razón principal.';end if;
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name in ('orden_renglones','precios_proveedor','recepciones_dodo') and column_name='precio' and numeric_scale<>4) then raise exception 'FALLÓ: escala de precio';end if;
 if not exists(select 1 from pg_class where oid='public.renglones_recibido'::regclass and reloptions @> array['security_invoker=true']) then raise exception 'FALLÓ: vista invocadora';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 insert into public.sucursales(nombre) values('Precio ensayo '||marca) returning id into s;
 insert into public.proveedores(razon_social,rfc,regimen_fiscal,cuenta_pl) values('Precio cuatro decimales','PCD010101AB1','601','insumos') returning id into p;
 insert into public.articulos(nombre,unidad,tipo) values('Precio ensayo '||marca,'pza','consumible') returning id into art;
 insert into public.ordenes_compra(proveedor_id,sucursal_id,rfc_receptor) values(p,s,receptor) returning id into o;
 insert into public.orden_renglones(orden_id,articulo_id,descripcion,cantidad,precio,tasa_iva) values(o,art,'Precio preciso',24,10.7143,'16') returning id into r;
 set local role authenticated;
 if (select precio from public.renglones_recibido where id=r)<>10.7143 or public.total_orden(o)<>298.28 then raise exception 'FALLÓ: precio o total';end if;
 perform public.confirmar_orden(o);
 if (select precio from public.precios_proveedor where proveedor_id=p and articulo_id=art)<>10.7143 then raise exception 'FALLÓ: último precio';end if;
 f:=public.facturar_orden(o);
 if not exists(select 1 from public.factura_conceptos where factura_id=f and valor_unitario=10.7143 and importe=257.14) or not exists(select 1 from public.facturas where id=f and subtotal=257.14 and iva=41.14 and total=298.28) then raise exception 'FALLÓ: prefactura precisa';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if (select precio from public.renglones_recibido where id=r)<>10.7143 then raise exception 'FALLÓ: corporativo consulta';end if;
 begin update public.precios_proveedor set precio=1 where proveedor_id=p;exception when insufficient_privilege then null;end;
 if (select precio from public.precios_proveedor where proveedor_id=p and articulo_id=art) is distinct from 10.7143 then raise exception 'FALLÓ: corporativo escribe';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 if exists(select 1 from public.renglones_recibido where id=r) then raise exception 'FALLÓ: gerente consulta precio';end if;
 reset role;
 raise exception 'PRUEBAS OK — precio unitario a cuatro decimales · total por renglón a centavos · último precio · prefactura conserva precisión · vista y permisos conservados · corporativo consulta · gerente sin precios · ensayo reversible';
end $$;
