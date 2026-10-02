-- Pruebas de la migración 0022 (entrega esperada de las órdenes). Córrelas completas en Supabase → SQL Editor después de la 0021 y la 0022.
-- Necesitan un usuario activo con sucursal y un usuario corporativo activo. Crean proveedores, un artículo y órdenes de prueba.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_suc uuid;
  v_p3 uuid; v_psin uuid; v_art uuid; v_oc uuid; v_oc_sin uuid; v_oc_cancel uuid;
  v_ok text[] := '{}';
begin
  select id, sucursal_id into v_a, v_suc from perfiles where activo and sucursal_id is not null limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesita un usuario activo con sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;

  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  insert into proveedores (razon_social, rfc, regimen_fiscal, dias_entrega) values ('Prueba Entrega Tres', 'PET010203AB1', '601', 3) returning id into v_p3;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba Entrega Sin', 'PES010203AB1', '601') returning id into v_psin;
  insert into articulos (nombre, unidad, tipo) values ('Prueba Entrega silla', 'pza', 'activo_fijo') returning id into v_art;

  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_p3, v_suc) returning id into v_oc;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_art, 'Silla', 2, 500, '16');
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_psin, v_suc) returning id into v_oc_sin;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc_sin, v_art, 'Silla', 1, 500, '16');
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_p3, v_suc) returning id into v_oc_cancel;

  -- Al confirmar: hoy (México) + días de entrega; sin días, queda vacía.
  if (select entrega_esperada from ordenes_compra where id = v_oc) is not null then raise exception 'FALLÓ: un borrador no tiene entrega esperada'; end if;
  perform confirmar_orden(v_oc);
  if (select entrega_esperada from ordenes_compra where id = v_oc) <> hoy_mx() + 3 then
    raise exception 'FALLÓ: la entrega esperada debe ser hoy + 3 (quedó %)', (select entrega_esperada from ordenes_compra where id = v_oc);
  end if;
  perform confirmar_orden(v_oc_sin);
  if (select entrega_esperada from ordenes_compra where id = v_oc_sin) is not null then raise exception 'FALLÓ: sin días de entrega, la fecha queda vacía'; end if;
  v_ok := array_append(v_ok, 'al confirmar se pone hoy + días de entrega');

  -- Cambiar los días del proveedor no mueve la orden ya confirmada.
  update proveedores set dias_entrega = 10 where id = v_p3;
  if (select entrega_esperada from ordenes_compra where id = v_oc) <> hoy_mx() + 3 then raise exception 'FALLÓ: la orden confirmada no debe moverse'; end if;
  v_ok := array_append(v_ok, 'cambiar los días del proveedor no mueve las confirmadas');

  -- El admin la cambia y queda en el historial.
  perform cambiar_entrega_esperada(v_oc_sin, hoy_mx() + 7);
  if (select entrega_esperada from ordenes_compra where id = v_oc_sin) <> hoy_mx() + 7 then raise exception 'FALLÓ: el admin debe poder poner la fecha'; end if;
  if not exists (select 1 from orden_historial where orden_id = v_oc_sin and evento = 'entrega') then raise exception 'FALLÓ: el cambio debe quedar en el historial'; end if;
  begin
    perform cambiar_entrega_esperada(v_oc_sin, null);
    raise exception 'FALLÓ: la fecha es obligatoria';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe la fecha%' then raise exception 'FALLÓ: mensaje inesperado (sin fecha): %', sqlerrm; end if;
  end;
  begin
    perform cambiar_entrega_esperada(v_oc_cancel, hoy_mx());
    raise exception 'FALLÓ: un borrador no tiene entrega esperada';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo las órdenes confirmadas%' then raise exception 'FALLÓ: mensaje inesperado (borrador): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'el admin la cambia y queda en el historial');

  -- Corporativo no la cambia.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform cambiar_entrega_esperada(v_oc, hoy_mx());
    raise exception 'FALLÓ: corporativo no debe cambiar la entrega';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo no la cambia');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
