-- Después de 20261109200000_aperturas_colores.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;c uuid;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and rol::text='corporativo' limit 1;
 if a is null then raise exception 'FALTAN DATOS: un admin activo.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform public.guardar_color_apertura('etapa','P3','#AA3300');
 if (select color from public.apertura_colores where agrupacion='etapa' and clave='P3')<>'#aa3300' then raise exception 'FALLÓ: guardar color de etapa';end if;
 perform public.guardar_color_apertura('etapa','P3','#112233');
 if (select count(*) from public.apertura_colores where agrupacion='etapa' and clave='P3')<>1 or (select color from public.apertura_colores where agrupacion='etapa' and clave='P3')<>'#112233' then raise exception 'FALLÓ: cambiar color sin duplicar';end if;
 perform public.guardar_color_apertura('categoria','iluminacion','#ffcc00');
 perform public.guardar_color_apertura('categoria','sin','#999999');
 if (select count(*) from public.apertura_colores where agrupacion='categoria')<2 then raise exception 'FALLÓ: color de categoría';end if;
 perform public.guardar_color_apertura('etapa','P3','');
 if exists(select 1 from public.apertura_colores where agrupacion='etapa' and clave='P3') then raise exception 'FALLÓ: quitar color';end if;
 begin perform public.guardar_color_apertura('etapa','P9','#000000');raise exception 'FALLÓ: etapa inventada';exception when check_violation then null;end;
 begin perform public.guardar_color_apertura('categoria','cocina','#000000');raise exception 'FALLÓ: categoría inventada';exception when check_violation then null;end;
 begin perform public.guardar_color_apertura('etapa','P1','rojo');raise exception 'FALLÓ: color inválido';exception when check_violation then null;end;
 if c is not null then
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  begin perform public.guardar_color_apertura('etapa','P1','#000000');raise exception 'FALLÓ: corporativo cambió un color';exception when raise_exception then if sqlerrm not like 'Solo administración%' then raise; end if;end;
 end if;
 raise exception 'PRUEBAS OK — guardar y cambiar color · etapas y categorías · quitar vuelve al predeterminado · claves y colores inválidos rechazados · solo administración';
end $$;
