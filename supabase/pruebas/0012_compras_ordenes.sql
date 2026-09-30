-- Pruebas de la migración 0012 (Compras: órdenes y recepción). Córrelas completas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos de la misma sucursal; sus puestos cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc uuid; v_prov uuid; v_prov2 uuid; v_cons uuid; v_fijo uuid;
  v_oc uuid; v_oc2 uuid; v_r_cons uuid; v_r_fijo uuid; v_recep uuid; v_n int; v_res jsonb;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_insumo text := 'ABCDEF0123456789ABCDEF0123456789';
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  update perfiles set rol = 'admin' where id = v_a;
  update perfiles set rol = 'gerente' where id = v_b;

  -- ── Admin: cotización → orden ─────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba OC Uno', 'POU010203AB1', '601') returning id into v_prov;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba OC Dos', 'POD010203AB1', '601') returning id into v_prov2;
  insert into articulos (nombre, unidad, tipo, tasa_iva, dodo_insumo_id) values ('Prueba OC queso', 'kg', 'consumible', '0', v_insumo) returning id into v_cons;
  insert into articulos (nombre, unidad, tipo) values ('Prueba OC horno', 'pza', 'activo_fijo') returning id into v_fijo;

  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_oc;
  if (select folio from ordenes_compra where id = v_oc) !~ '^OC-[0-9]{4,}$' then raise exception 'FALLÓ: folio OC-0000'; end if;
  begin
    insert into ordenes_compra (proveedor_id, sucursal_id, estado) values (v_prov, v_suc, 'confirmada');
    raise exception 'FALLÓ: una orden nace en borrador';
  exception when insufficient_privilege then null; end;

  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_cons, 'Queso', 10, 100, '0') returning id into v_r_cons;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_fijo, 'Horno', 1, 0, '16') returning id into v_r_fijo;
  begin
    perform confirmar_orden(v_oc);
    raise exception 'FALLÓ: confirmar con un renglón sin precio';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%sin precio%' then raise exception 'FALLÓ: mensaje inesperado (sin precio): %', sqlerrm; end if;
  end;
  update orden_renglones set precio = 5000 where id = v_r_fijo;
  perform enviar_orden(v_oc);
  v_oc2 := copiar_orden(v_oc, v_prov2);
  if (select grupo_id from ordenes_compra where id = v_oc2) <> (select grupo_id from ordenes_compra where id = v_oc) then raise exception 'FALLÓ: la alternativa va en el mismo grupo'; end if;
  if (select count(*) from orden_renglones where orden_id = v_oc2) <> 2 then raise exception 'FALLÓ: la alternativa copia los renglones'; end if;

  perform confirmar_orden(v_oc);
  if (select estado::text from ordenes_compra where id = v_oc) <> 'confirmada' then raise exception 'FALLÓ: confirmar'; end if;
  if (select estado::text from ordenes_compra where id = v_oc2) <> 'cancelada' then raise exception 'FALLÓ: al confirmar se cancelan las alternativas'; end if;
  if (select precio from precios_proveedor where proveedor_id = v_prov and articulo_id = v_cons) <> 100 then raise exception 'FALLÓ: último precio del proveedor'; end if;
  begin
    perform confirmar_orden(v_oc);
    raise exception 'FALLÓ: confirmar dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ya está%' then raise exception 'FALLÓ: mensaje inesperado (dos veces): %', sqlerrm; end if;
  end;
  begin
    update orden_renglones set cantidad = 1 where id = v_r_cons;
    raise exception 'FALLÓ: renglón editable tras confirmar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ya no es cotización%' then raise exception 'FALLÓ: mensaje inesperado (renglón): %', sqlerrm; end if;
  end;
  update ordenes_compra set estado = 'borrador' where id = v_oc;
  if (select estado::text from ordenes_compra where id = v_oc) <> 'confirmada' then raise exception 'FALLÓ: el estado solo cambia por las funciones'; end if;
  v_ok := array_append(v_ok, 'cotización → orden con alternativas, último precio y renglones fijos');

  -- ── Recepciones de Dodo IS ────────────────────────────────────────────────
  v_res := importar_recepciones_dodo('prueba.xlsx',
    jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'fecha', v_hoy), jsonb_build_object('sucursal_id', v_suc, 'fecha', v_hoy + 30)),
    jsonb_build_array(
      jsonb_build_object('sucursal_id', v_suc, 'dodo_insumo_id', v_insumo, 'material', 'Queso', 'unidad', 'kg', 'fecha', v_hoy, 'cantidad', 4, 'precio', 100),
      jsonb_build_object('sucursal_id', v_suc, 'dodo_insumo_id', v_insumo, 'material', 'Queso', 'unidad', 'kg', 'fecha', v_hoy + 30, 'cantidad', 1, 'precio', 100)));
  if (v_res->>'ligadas')::int <> 1 or (v_res->>'pendientes')::int <> 1 then raise exception 'FALLÓ: liga automática (ventana de 7 días): %', v_res; end if;
  if recibido_renglon(v_r_cons) <> 4 then raise exception 'FALLÓ: recibido desde Dodo IS'; end if;
  v_res := importar_recepciones_dodo('prueba2.xlsx',
    jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'fecha', v_hoy)),
    jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'dodo_insumo_id', v_insumo, 'material', 'Queso', 'unidad', 'kg', 'fecha', v_hoy, 'cantidad', 6, 'precio', 100)));
  if recibido_renglon(v_r_cons) <> 6 then raise exception 'FALLÓ: reimportar reemplaza el día'; end if;
  if (select count(*) from recepciones_dodo where sucursal_id = v_suc and dodo_insumo_id = v_insumo) <> 2 then raise exception 'FALLÓ: reimportar no duplica'; end if;
  select id into v_recep from recepciones_dodo where sucursal_id = v_suc and dodo_insumo_id = v_insumo and fecha = v_hoy + 30;
  perform clasificar_recepcion(v_recep, 'traspaso', null);
  if (select clasificacion from recepciones_dodo where id = v_recep) <> 'traspaso' then raise exception 'FALLÓ: marcar traspaso'; end if;
  begin
    perform cancelar_orden(v_oc, 'Prueba');
    raise exception 'FALLÓ: cancelar con algo recibido';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ciérrala%' then raise exception 'FALLÓ: mensaje inesperado (cancelar): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'recepciones de Dodo IS: liga, reemplazo y clasificación');

  -- ── Gerente: recibe no consumibles de su sucursal, sin ver la tabla ───────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from ordenes_compra;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no lee la tabla de órdenes (precios)'; end if;
  select count(*) into v_n from ordenes_por_recibir() where orden_id = v_oc;
  if v_n <> 1 then raise exception 'FALLÓ: por recibir debe traer solo el horno (leyó %)', v_n; end if;
  begin
    perform recibir_renglon(v_r_cons, 1, v_hoy, null);
    raise exception 'FALLÓ: un consumible no se recibe en la app';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%Dodo IS%' then raise exception 'FALLÓ: mensaje inesperado (consumible): %', sqlerrm; end if;
  end;
  begin
    perform recibir_renglon(v_r_fijo, 1, v_hoy + 1, null);
    raise exception 'FALLÓ: fecha futura';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%futura%' then raise exception 'FALLÓ: mensaje inesperado (futura): %', sqlerrm; end if;
  end;
  perform recibir_renglon(v_r_fijo, 1, v_hoy, null);
  if recibido_renglon(v_r_fijo) <> 1 then raise exception 'FALLÓ: recibir en la app'; end if;
  v_ok := array_append(v_ok, 'el gerente recibe sin ver precios');

  -- ── Operación no recibe; corporativo solo consulta ────────────────────────
  execute 'reset role';
  update perfiles set rol = 'operacion' where id = v_b;
  execute 'set local role authenticated';
  begin
    perform recibir_renglon(v_r_fijo, 1, v_hoy, null);
    raise exception 'FALLÓ: operación no recibe';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo encargado%' then raise exception 'FALLÓ: mensaje inesperado (operación): %', sqlerrm; end if;
  end;
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  execute 'set local role authenticated';
  select count(*) into v_n from ordenes_compra where id = v_oc;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo lee órdenes'; end if;
  begin
    perform cerrar_orden(v_oc, 'Prueba');
    raise exception 'FALLÓ: corporativo no cierra';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  begin
    insert into ordenes_compra (proveedor_id) values (v_prov);
    raise exception 'FALLÓ: corporativo no crea órdenes';
  exception when insufficient_privilege then null; end;
  v_ok := array_append(v_ok, 'operación no recibe; corporativo consulta');

  -- ── Admin: anula una recepción y cierra con motivo ────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  select id into v_recep from recepciones_app where orden_renglon_id = v_r_fijo;
  perform anular_recepcion(v_recep, 'Captura equivocada');
  if recibido_renglon(v_r_fijo) <> 0 then raise exception 'FALLÓ: anular devuelve lo pendiente'; end if;
  begin
    perform cerrar_orden(v_oc, ' ');
    raise exception 'FALLÓ: cerrar sin motivo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%motivo%' then raise exception 'FALLÓ: mensaje inesperado (sin motivo): %', sqlerrm; end if;
  end;
  perform cerrar_orden(v_oc, 'Prueba');
  if (select estado::text from ordenes_compra where id = v_oc) <> 'cerrada' then raise exception 'FALLÓ: cerrar'; end if;
  select count(*) into v_n from orden_historial where orden_id = v_oc;
  if v_n < 6 then raise exception 'FALLÓ: el historial registra cada paso (hay %)', v_n; end if;
  execute 'reset role';
  v_ok := array_append(v_ok, 'anular recepción y cerrar con motivo; historial completo');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
