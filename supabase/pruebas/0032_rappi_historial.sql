-- Ejecutar completo después de 0032. PRUEBAS OK revierte los datos mediante un ERROR intencional.
do $$
declare a uuid;c uuid;s uuid;o jsonb;p jsonb;r jsonb;producto bigint;otro jsonb;
begin
  select id into a from perfiles where activo and rol::text='admin' limit 1;
  select id into c from perfiles where activo and rol::text='corporativo' limit 1;
  select id into s from sucursales limit 1;
  if a is null or c is null or s is null then raise exception 'FALTAN DATOS: admin, corporativo y sucursal.';end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  o:=jsonb_build_array(jsonb_build_object('rappi_id','999999999000111','tienda_id','MX999999000111','fecha',hoy_mx(),'hora','17:11','estado','Finalizado','pago','PayPal','bruto',159,'descuento_restaurante',60,'subtotal_restaurante',99,'descuento_rappi',70,'facturar',29));
  p:=jsonb_build_array(jsonb_build_object('rappi_id','999999999000111','linea',1,'nombre','Pizza prueba','opciones','30 cm','cantidad',1,'importe',159,'clave',repeat('a',64)));
  r:=importar_rappi(s,'prueba.xlsx',repeat('a',64),o,p);
  if not exists(select 1 from rappi_ordenes where rappi_id='999999999000111' and subtotal_restaurante=99 and facturar=29 and registrado_por=a) then raise exception 'FALLÓ: alta';end if;
  select producto_id into producto from rappi_lineas where rappi_id='999999999000111';
  perform vincular_producto_rappi(producto,null);
  perform fuente_rappi(s,hoy_mx(),hoy_mx(),false);
  r:=importar_rappi(s,'prueba.xlsx',repeat('b',64),o,p);
  if (r->>'actualizadas')::int<1 or (select count(*) from rappi_lineas where rappi_id='999999999000111')<>1 or exists(select 1 from rappi_ordenes where rappi_id='999999999000111' and sumar) then raise exception 'FALLÓ: reimportación o fuente';end if;
  perform importar_rappi(s,'cancelada.xlsx',repeat('c',64),jsonb_set(o,'{0,estado}','"Cancelado"'),p);
  if not exists(select 1 from rappi_ordenes where rappi_id='999999999000111' and estado='Cancelado') then raise exception 'FALLÓ: actualización de estado';end if;
  for otro in select * from (values(jsonb_set(o,'{0,fecha}',to_jsonb((hoy_mx()+1)::text))),(jsonb_set(o,'{0,bruto}','-1')),(jsonb_set(o,'{0,descuento_restaurante}','61'))) casos(v) loop
    begin perform importar_rappi(s,'prueba.xlsx',repeat('a',64),otro,p);raise exception 'FALLÓ: aceptó orden inválida';exception when others then if sqlerrm<>'Orden inválida.' then raise;end if;end;
  end loop;
  begin perform importar_rappi(s,'prueba.xlsx',repeat('a',64),o,jsonb_set(p,'{0,importe}','158'));raise exception 'FALLÓ: productos no cuadran';exception when others then if sqlerrm<>'Los productos no cuadran con las órdenes.' then raise;end if;end;
  begin perform importar_rappi(s,'prueba.xlsx',repeat('a',64),o,jsonb_set(p,'{0,rappi_id}','"999999999000222"'));raise exception 'FALLÓ: producto ajeno';exception when others then if sqlerrm<>'Producto inválido.' then raise;end if;end;
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  if not ve_ventas(s) then raise exception 'FALLÓ: corporativo no consulta';end if;
  begin perform importar_rappi(s,'prueba.xlsx',repeat('a',64),o,p);raise exception 'FALLÓ: corporativo importó';exception when others then if sqlerrm<>'Solo el admin importa Rappi.' then raise;end if;end;
  begin perform fuente_rappi(s,hoy_mx(),hoy_mx(),true);raise exception 'FALLÓ: corporativo cambió fuente';exception when others then if sqlerrm<>'Solo el admin cambia la fuente.' then raise;end if;end;
  begin perform vincular_producto_rappi(producto,null);raise exception 'FALLÓ: corporativo vinculó';exception when others then if sqlerrm<>'Solo el admin vincula productos.' then raise;end if;end;
  if has_table_privilege('authenticated','rappi_ordenes','INSERT') or has_table_privilege('authenticated','rappi_ordenes','UPDATE') or has_table_privilege('authenticated','rappi_lineas','DELETE') or has_table_privilege('authenticated','rappi_productos','UPDATE') then raise exception 'FALLÓ: escritura directa';end if;
  raise exception 'PRUEBAS OK — importación admin · productos y descuentos · reimportación sin duplicados · actualización de estado · conserva fuente · fechas y montos · corporativo solo consulta · sin escritura directa';
end $$;
