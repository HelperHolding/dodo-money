-- Ejecutar después de 0035. PRUEBAS OK es un ERROR intencional: revierte los datos de prueba.
do $$
declare a uuid;c uuid;s uuid;dias jsonb;filas jsonb;r jsonb;x uuid;y uuid;
begin
 select id into a from perfiles where activo and rol::text='admin' limit 1;
 select id into c from perfiles where activo and rol::text='corporativo' limit 1;
 select id into s from sucursales limit 1;
 if a is null or c is null or s is null then raise exception 'FALTAN DATOS: admin, corporativo y sucursal.';end if;
 if exists(select 1 from mermas_dodo_dias where sucursal_id=s and fecha in ('2020-01-02','2020-01-03')) then raise exception 'Usa otras fechas reservadas para la prueba.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 dias:=jsonb_build_array(jsonb_build_object('sucursal_id',s,'fecha','2020-01-02','productos_completos',true),jsonb_build_object('sucursal_id',s,'fecha','2020-01-03','productos_completos',false));
 filas:=jsonb_build_array(jsonb_build_object('sucursal_id',s,'fecha','2020-01-02','tipo','producto','clave','prueba-merma','nombre','Producto prueba','unidad','piezas','categoria','Producto terminado','cantidad',2,'costo',0,'sin_costo',true),jsonb_build_object('sucursal_id',s,'fecha','2020-01-02','tipo','insumo','clave','prueba-insumo','nombre','Insumo prueba','unidad','Kg','categoria','Ingrediente','cantidad',1,'costo',100,'sin_costo',false));
 r:=importar_mermas_dodo('prueba.xlsx',repeat('a',64),dias,filas);
 if not exists(select 1 from mermas_dodo_dias where sucursal_id=s and fecha='2020-01-02' and productos_completos)
 or not exists(select 1 from mermas_dodo_dias where sucursal_id=s and fecha='2020-01-03' and not productos_completos) then raise exception 'FALLÓ: cobertura de productos';end if;
 x:=registrar_costo_merma(s,'prueba-merma','2020-01-02',30,'Costo sin IVA confirmado');
 y:=registrar_costo_merma(s,'prueba-merma','2020-01-02',40,'Corrección de costo sin IVA');
 if not exists(select 1 from mermas_costos_producto nuevo join mermas_costos_producto anterior on anterior.id=x where nuevo.id=y and nuevo.orden>anterior.orden and nuevo.costo_unitario=40) then raise exception 'FALLÓ: orden de corrección';end if;
 if not exists(select 1 from mermas_dodo where sucursal_id=s and fecha='2020-01-02' and clave='prueba-merma' and costo=0 and sin_costo) then raise exception 'FALLÓ: modificó original';end if;
 begin perform registrar_costo_merma(s,'prueba-insumo','2020-01-02',30,'Costo sin IVA confirmado');raise exception 'FALLÓ: costeo de insumo';exception when others then if sqlerrm<>'Producto o vigencia inválidos.' then raise;end if;end;
 begin perform registrar_costo_merma(s,'prueba-merma','2020-01-02',0,'Costo sin IVA confirmado');raise exception 'FALLÓ: costo cero';exception when others then if sqlerrm<>'Costo unitario inválido.' then raise;end if;end;
 begin perform registrar_costo_merma(s,'prueba-merma','2020-01-02',-1,'Costo sin IVA confirmado');raise exception 'FALLÓ: costo negativo';exception when others then if sqlerrm<>'Costo unitario inválido.' then raise;end if;end;
 begin perform registrar_costo_merma(s,'prueba-merma','2020-01-02',30,'');raise exception 'FALLÓ: fuente vacía';exception when others then if sqlerrm<>'Escribe la fuente del costo sin IVA (10 a 1000 caracteres).' then raise;end if;end;
 begin perform registrar_costo_merma(s,'prueba-merma',hoy_mx()+1,30,'Costo sin IVA confirmado');raise exception 'FALLÓ: fecha futura';exception when others then if sqlerrm<>'Producto o vigencia inválidos.' then raise;end if;end;
 perform anular_costo_merma(y,'Costo original correcto');
 if not exists(select 1 from mermas_costos_producto where id=y and anulado_en is not null and anulado_por=a) then raise exception 'FALLÓ: anulación';end if;
 begin perform anular_costo_merma(y,'Costo original correcto');raise exception 'FALLÓ: anuló dos veces';exception when others then if sqlerrm<>'El costo no existe o ya está anulado.' then raise;end if;end;
 r:=importar_mermas_dodo('reimportacion.xlsx',repeat('b',64),dias,'[]'::jsonb);
 if not exists(select 1 from mermas_dodo_dias where sucursal_id=s and fecha='2020-01-02' and productos_completos) or exists(select 1 from mermas_dodo where sucursal_id=s and fecha='2020-01-02') then raise exception 'FALLÓ: día vacío completo';end if;
 if not exists(select 1 from mermas_costos_producto where id=x and anulado_en is null) then raise exception 'FALLÓ: perdió historial de costos';end if;
 -- Clientes anteriores no confirman cobertura si no mandan la propiedad.
 r:=importar_mermas_dodo('anterior.xlsx',repeat('c',64),jsonb_build_array(jsonb_build_object('sucursal_id',s,'fecha','2020-01-03')),'[]'::jsonb);
 if exists(select 1 from mermas_dodo_dias where sucursal_id=s and fecha='2020-01-03' and productos_completos) then raise exception 'FALLÓ: inventó cobertura';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 begin perform registrar_costo_merma(s,'prueba-merma','2020-01-02',30,'Costo sin IVA confirmado');raise exception 'FALLÓ: corporativo guardó';exception when others then if sqlerrm<>'Solo el admin registra costos de merma.' then raise;end if;end;
 begin perform anular_costo_merma(x,'Costo original correcto');raise exception 'FALLÓ: corporativo anuló';exception when others then if sqlerrm<>'Solo el admin registra costos de merma.' then raise;end if;end;
 if has_table_privilege('authenticated','mermas_costos_producto','INSERT') or has_table_privilege('authenticated','mermas_costos_producto','UPDATE') or has_table_privilege('authenticated','mermas_costos_producto','DELETE') then raise exception 'FALLÓ: escritura directa';end if;
 raise exception 'PRUEBAS OK — cobertura de productos · días vacíos · costo sin IVA vigente · correcciones con historial · conserva original · insumos excluidos del costeo · fechas y montos · anulación única · reimportación conserva costos · corporativo consulta · sin escritura directa';
end $$;
