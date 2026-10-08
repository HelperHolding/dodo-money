-- Ejecutar después de 0045. PRUEBAS OK es una excepción intencional: revierte todo el ensayo.
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


 -- Fija viernes como recomendación dentro del ensayo (todo se revierte).
 reset role;
 update public.empresa set dias_pago='{5}';
 set local role authenticated;
 for i in 0..6 loop
  dia:=public.hoy_mx()+i;
  perform public.programar_pago(f,dia);
  if (select pago_programado_el from public.facturas where id=f)<>dia then raise exception 'FALLÓ: programación individual';end if;
  if public.programar_pagos(array[f],dia)<>1 then raise exception 'FALLÓ: programación en bloque';end if;
 end loop;
 begin perform public.programar_pago(f,public.hoy_mx()-1);raise exception 'FALLÓ: fecha pasada individual';exception when others then if sqlerrm<>'No se programa un pago en una fecha que ya pasó.' then raise;end if;end;
 begin perform public.programar_pagos(array[f],public.hoy_mx()-1);raise exception 'FALLÓ: fecha pasada bloque';exception when others then if sqlerrm<>'No se programa un pago en una fecha que ya pasó.' then raise;end if;end;
 begin perform public.programar_pagos(array[f],null);raise exception 'FALLÓ: fecha vacía bloque';exception when others then if sqlerrm<>'Elige el día de pago.' then raise;end if;end;
 perform public.programar_pago(f,null);
 if (select pago_programado_el from public.facturas where id=f) is not null then raise exception 'FALLÓ: quitar fecha';end if;
 if public.pagado_factura(f)<>0 then raise exception 'FALLÓ: programar creó un pago';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 begin perform public.programar_pago(f,public.hoy_mx());raise exception 'FALLÓ: corporativo individual';exception when others then if sqlerrm<>'Corporativo solo puede consultar.' then raise;end if;end;
 begin perform public.programar_pagos(array[f],public.hoy_mx());raise exception 'FALLÓ: corporativo bloque';exception when others then if sqlerrm<>'Corporativo solo puede consultar.' then raise;end if;end;
 raise exception 'PRUEBAS OK — cualquier día individual y en bloque · viernes recomendado · sin fechas pasadas · quitar programación · no registra pagos · corporativo consulta';
end $$;
