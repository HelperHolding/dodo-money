-- Ejecutar completo tras 0034. PRUEBAS OK es un ERROR intencional que revierte la prueba.
do $$
declare a uuid;c uuid;s uuid;i uuid;j uuid;v uuid;x uuid;n integer;producto integer:=999910034;
begin
 select id into a from perfiles where activo and rol::text='admin' limit 1;
 select id into c from perfiles where activo and rol::text='corporativo' limit 1;
 select id into s from sucursales limit 1;
 if a is null or c is null or s is null then raise exception 'FALTAN DATOS: admin, corporativo y sucursal.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 -- El día reservado solo vive dentro de esta transacción; no se modifica ningún día existente.
 if exists(select 1 from ventas_dia where sucursal_id=s and fecha='2020-01-02') then raise exception 'Usa otra fecha reservada para la prueba.';end if;
 insert into productos_venta(dodo_id,nombre) values(producto,'Prueba conciliación') on conflict do nothing;
 insert into importaciones_ventas(sucursal_id,fecha,archivo_ventas,total,suma_productos,productos,importado_por)
 values(s,'2020-01-02','prueba.xlsx',100,80,1,a) returning id into i;
 insert into ventas_dia(sucursal_id,fecha,total,efectivo,tarjeta,en_linea,iva,importacion_id)
 values(s,'2020-01-02',100,60,40,0,16,i) returning id into v;
 insert into ventas_producto(sucursal_id,fecha,dodo_id,nombre,cantidad,importe,importe_sin_descuento)
 values(s,'2020-01-02',producto,'Prueba',1,80,120);
 begin perform guardar_conciliacion_venta(i,10,89,0,true,'Comprobante terminal');raise exception 'FALLÓ: cambió la suma';exception when others then if sqlerrm<>'La corrección debe conservar la suma original de las formas de pago.' then raise;end if;end;
 begin perform guardar_conciliacion_venta(i,-10,110,0,true,'Comprobante terminal');raise exception 'FALLÓ: monto negativo';exception when others then if sqlerrm<>'Montos inválidos.' then raise;end if;end;
 begin perform guardar_conciliacion_venta(i,10,90,0,true,'');raise exception 'FALLÓ: motivo vacío';exception when others then if sqlerrm<>'Escribe el motivo (10 a 1000 caracteres).' then raise;end if;end;
 insert into ventas_dia_desglose(ventas_dia_id,tipo,tarjeta) values(v,'agregador',40);
 begin perform guardar_conciliacion_venta(i,90,10,0,true,'Comprobante terminal');raise exception 'FALLÓ: redujo agregador';exception when others then if sqlerrm<>'El ajuste no puede reducir los cobros por debajo del canal agregador.' then raise;end if;end;
 delete from ventas_dia_desglose where ventas_dia_id=v;
 x:=guardar_conciliacion_venta(i,10,90,0,true,'Cobro equivocado; ticket terminal');
 if not exists(select 1 from ventas_conciliaciones_vigentes where id=x and tarjeta=90 and original->>'suma_productos'='80.00') then
  -- Evita depender de la escala textual del numeric en JSON.
  if not exists(select 1 from ventas_conciliaciones_vigentes where id=x and tarjeta=90 and (original->>'suma_productos')::numeric=80) then raise exception 'FALLÓ: vista o evidencia';end if;
 end if;
 if not exists(select 1 from ventas_dia where id=v and total=100 and iva=16 and efectivo=60 and tarjeta=40) then raise exception 'FALLÓ: cambió la fuente';end if;
 begin perform guardar_conciliacion_venta(i,10,90,0,true,'Comprobante terminal');raise exception 'FALLÓ: conciliación doble';exception when others then if sqlerrm<>'Este día ya está conciliado. Anula la conciliación antes de corregirla.' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 begin perform anular_conciliacion_venta(x,'Anulación de prueba');raise exception 'FALLÓ: corporativo anuló';exception when others then if sqlerrm<>'Solo el admin concilia ventas.' then raise;end if;end;
 begin perform guardar_conciliacion_venta(i,10,90,0,true,'Comprobante terminal');raise exception 'FALLÓ: corporativo guardó';exception when others then if sqlerrm<>'Solo el admin concilia ventas.' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 perform anular_conciliacion_venta(x,'Corrección de prueba');
 if exists(select 1 from ventas_conciliaciones_vigentes where id=x) then raise exception 'FALLÓ: anulación vigente';end if;
 begin perform anular_conciliacion_venta(x,'Corrección de prueba');raise exception 'FALLÓ: anuló dos veces';exception when others then if sqlerrm<>'La conciliación no existe o ya está anulada.' then raise;end if;end;
 x:=guardar_conciliacion_venta(i,20,80,0,false,'Corrección de prueba');
 j:=importar_ventas_dia(s,'2020-01-02',jsonb_build_object('pedidos',1,'total',100,'efectivo',60,'tarjeta',40,'en_linea',0,'iva',16,'venta_m2',null),'[]'::jsonb,
  jsonb_build_array(jsonb_build_object('dodo_id',producto,'nombre','Prueba','cantidad',1,'importe',80,'importe_sin_descuento',120)),jsonb_build_object('ventas','reimportacion.xlsx','productos','productos.xlsx'),true);
 if exists(select 1 from ventas_conciliaciones_vigentes where id=x) then raise exception 'FALLÓ: reimportación no invalidó';end if;
 if not exists(select 1 from ventas_conciliaciones where id=x) then raise exception 'FALLÓ: perdió historial';end if;
 begin perform guardar_conciliacion_venta(i,20,80,0,false,'Corrección de prueba');raise exception 'FALLÓ: formulario obsoleto';exception when others then if sqlerrm<>'La importación cambió. Vuelve a consultar el día.' then raise;end if;end;
 delete from ventas_producto where sucursal_id=s and fecha='2020-01-02';
 begin perform guardar_conciliacion_venta(j,20,80,0,true,'Corrección de prueba');raise exception 'FALLÓ: sin productos';exception when others then if sqlerrm<>'Falta el detalle de productos; no se puede conciliar la venta bruta.' then raise;end if;end;
 if has_table_privilege('authenticated','ventas_conciliaciones','INSERT') or has_table_privilege('authenticated','ventas_conciliaciones','UPDATE') or has_table_privilege('authenticated','ventas_conciliaciones','DELETE') then raise exception 'FALLÓ: escritura directa';end if;
 raise exception 'PRUEBAS OK — admin concilia · conserva venta y fuente · motivo y montos · respeta agregador · anulación única · reimportación invalida · conserva historial · sin productos no concilia · corporativo consulta · sin escritura directa';
end $$;
