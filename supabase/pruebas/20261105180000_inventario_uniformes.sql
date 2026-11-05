-- Ejecutar después de 20261105180000_inventario_uniformes.sql. Termina en el error "PRUEBAS OK", que revierte los cambios de prueba.
do $$
declare admin_id uuid; corp_id uuid; n integer;
begin
 select id into admin_id from public.perfiles where activo and rol::text = 'admin' limit 1;
 select id into corp_id from public.perfiles where activo and rol::text = 'corporativo' limit 1;
 if admin_id is null or corp_id is null then raise exception 'FALTAN DATOS: un admin y un corporativo activos.'; end if;

 if (select count(*) from public.inventario_articulos where grupo = 'uniformes') <> 11 then raise exception 'FALLÓ: carga inicial de 11 uniformes'; end if;
 if (select sum(cantidad) from public.inventario_articulos) <> 89 then raise exception 'FALLÓ: total inicial de piezas (89)'; end if;
 if (select cantidad from public.inventario_articulos where sku = 'DOD-UNI-003') <> 17 then raise exception 'FALLÓ: cofias iniciales'; end if;

 -- Corporativo no ajusta.
 perform set_config('request.jwt.claims', json_build_object('sub', corp_id, 'role', 'authenticated')::text, true);
 begin perform public.ajustar_inventario('DOD-UNI-001', 5, null); raise exception 'FALLÓ: corporativo ajustó';
 exception when others then if sqlerrm <> 'Solo administración ajusta el inventario.' then raise; end if; end;

 -- Admin ajusta y queda en el historial; repetir la misma cantidad no registra nada.
 perform set_config('request.jwt.claims', json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
 perform public.ajustar_inventario('DOD-UNI-001', 5, '  Entrega a Zapopan-1  ');
 perform public.ajustar_inventario('DOD-UNI-001', 5, null);
 if (select cantidad from public.inventario_articulos where sku = 'DOD-UNI-001') <> 5 then raise exception 'FALLÓ: ajuste'; end if;
 select count(*) into n from public.inventario_movimientos where sku = 'DOD-UNI-001' and anterior = 8 and nueva = 5 and nota = 'Entrega a Zapopan-1' and registrado_por = admin_id;
 if n <> 1 then raise exception 'FALLÓ: historial del ajuste (%)', n; end if;
 if (select actualizado_por from public.inventario_articulos where sku = 'DOD-UNI-001') <> admin_id then raise exception 'FALLÓ: quién ajustó'; end if;

 begin perform public.ajustar_inventario('DOD-UNI-001', -1, null); raise exception 'FALLÓ: cantidad negativa';
 exception when others then if sqlerrm <> 'Cantidad inválida.' then raise; end if; end;
 begin perform public.ajustar_inventario('NO-EXISTE', 1, null); raise exception 'FALLÓ: artículo inexistente';
 exception when others then if sqlerrm <> 'Artículo no encontrado.' then raise; end if; end;

 raise exception 'PRUEBAS OK';
end $$;
