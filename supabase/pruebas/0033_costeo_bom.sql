-- Ejecutar después de 0033. El ERROR PRUEBAS OK es intencional: revierte los datos de prueba.
do $$
declare a uuid; corp uuid; p integer; modelo jsonb; receta jsonb; asignaciones jsonb; n integer; v uuid;
begin
  select id into a from perfiles where activo and rol::text='admin' limit 1;
  select id into corp from perfiles where activo and rol::text='corporativo' limit 1;
  select dodo_id into p from productos_venta order by dodo_id limit 1;
  if a is null or corp is null or p is null then raise exception 'FALTAN DATOS: admin, corporativo y un producto de venta.'; end if;
  perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
  receta:=jsonb_build_object('clave','prueba|4','nombre','BOM prueba','categoria','pizza','tamano','mediano','costo',7.7,'precioVenta',100,
    'avisos','[]'::jsonb,'materiales',jsonb_build_array(jsonb_build_object('nombre','Masa','cantidad',235,'precio',20,'unidad','g','importe',4.7),jsonb_build_object('nombre','Caja','cantidad',1,'precio',3,'unidad','pieza','importe',3)));
  modelo:=jsonb_build_object('insumos',jsonb_build_array(jsonb_build_object('nombre','Masa','precio',20)),'recetas',jsonb_build_array(receta),'preparaciones','[]'::jsonb,'avisos','[]'::jsonb);
  asignaciones:=jsonb_build_array(jsonb_build_object('clave','prueba|4','dodo_id',p));
  n:=importar_bom(hoy_mx(),'prueba.xlsx',repeat('a',64),modelo,asignaciones,true);
  if n<>1 or not exists(select 1 from costos_producto where dodo_id=p and vigente_desde=hoy_mx() and costo=8.7) then raise exception 'FALLÓ: alta y gramos/kg + periférico'; end if;
  select id into v from bom_versiones where huella=repeat('a',64) and vigente_desde=hoy_mx() and periferico;
  perform importar_bom(hoy_mx(),'prueba.xlsx',repeat('a',64),modelo,asignaciones,true);
  if (select count(*) from bom_recetas where version_id=v)<>1 then raise exception 'FALLÓ: reimportación'; end if;
  perform importar_bom(hoy_mx()-1,'anterior.xlsx',repeat('b',64),modelo,asignaciones,false);
  if not exists(select 1 from costos_producto where dodo_id=p and vigente_desde=hoy_mx()-1 and costo=7.7) then raise exception 'FALLÓ: historial'; end if;
  perform importar_bom(hoy_mx(),'corrección.xlsx',repeat('c',64),jsonb_set(modelo,'{recetas,0,precioVenta}','200'),asignaciones,true);
  if not exists(select 1 from correcciones_costo k join costos_producto c on c.id=k.costo_id where c.dodo_id=p and c.vigente_desde=hoy_mx() and k.costo_anterior=8.7 and k.costo_nuevo=9.7) then raise exception 'FALLÓ: auditoría'; end if;
  begin perform importar_bom(hoy_mx(),'malo.xlsx',repeat('d',64),jsonb_set(modelo,'{recetas,0,materiales,0,cantidad}','-1'),asignaciones,true); raise exception 'FALLÓ: cantidad negativa';
  exception when others then if sqlerrm<>'Cantidad, unidad o precio de material inválido.' then raise; end if; end;
  begin perform importar_bom(hoy_mx(),'malo.xlsx',repeat('d',64),jsonb_set(modelo,'{recetas,0,costo}','20'),asignaciones,true); raise exception 'FALLÓ: total';
  exception when others then if sqlerrm<>'El BOM no cuadra.' then raise; end if; end;
  begin perform importar_bom(hoy_mx(),'malo.xlsx',repeat('d',64),modelo,asignaciones||asignaciones,true); raise exception 'FALLÓ: vínculos repetidos';
  exception when others then if sqlerrm<>'Asignaciones desconocidas o repetidas.' then raise; end if; end;
  modelo:=jsonb_set(jsonb_set(modelo,'{recetas,0,costo}','null'),'{recetas,0,avisos}','["Sin precio"]');
  perform importar_bom(hoy_mx(),'pendiente.xlsx',repeat('e',64),modelo,'[]',true);
  if (select costo from costos_producto where dodo_id=p and vigente_desde=hoy_mx())<>9.7 then raise exception 'FALLÓ: pendiente pisó el costo'; end if;
  begin perform importar_bom(hoy_mx(),'pendiente.xlsx',repeat('e',64),modelo,asignaciones,true); raise exception 'FALLÓ: asignó receta pendiente';
  exception when others then if sqlerrm<>'Vínculo de producto inválido o repetido.' then raise; end if; end;
  perform set_config('request.jwt.claims',json_build_object('sub',corp,'role','authenticated')::text,true);
  if not ve_catalogo_ventas() then raise exception 'FALLÓ: corporativo consulta'; end if;
  begin perform importar_bom(hoy_mx(),'prueba.xlsx',repeat('a',64),modelo,'[]',true); raise exception 'FALLÓ: corporativo importó';
  exception when others then if sqlerrm<>'Solo un administrador importa el BOM.' then raise; end if; end;
  if has_table_privilege('authenticated','bom_versiones','INSERT') or has_table_privilege('authenticated','bom_recetas','UPDATE') or has_table_privilege('authenticated','bom_equivalencias','DELETE') then raise exception 'FALLÓ: escritura directa'; end if;
  raise exception 'PRUEBAS OK — admin importa · gramos y piezas · periférico · reimportación · historial y auditoría · pendientes conservan costo · valida montos y vínculos · corporativo consulta · sin escritura directa';
end $$;
