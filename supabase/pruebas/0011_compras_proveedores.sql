-- Pruebas de la migración 0011 (Compras: proveedores y artículos). Córrelas completas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos con sucursal; sus puestos cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_prov uuid; v_n int;
  v_ok text[] := '{}';
begin
  select p.id, o.id into v_a, v_b
    from perfiles p join perfiles o on o.id <> p.id and o.activo and o.sucursal_id is not null
   where p.activo and p.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos con sucursal.'; end if;

  if not clabe_valida('032180000118359719') or clabe_valida('012180001234567897') or clabe_valida('123') then
    raise exception 'FALLÓ: clabe_valida';
  end if;
  v_ok := array_append(v_ok, 'CLABE con dígito verificador');

  -- ── Admin: da de alta y edita ─────────────────────────────────────────────
  update perfiles set rol = 'admin' where id = v_a;
  update perfiles set rol = 'gerente' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into proveedores (razon_social, rfc, regimen_fiscal, clabe, dias_credito, categorias)
  values ('Prueba Lácteos SA de CV', 'PLA010203AB1', '601', '032180000118359719', 15, '{consumible}')
  returning id into v_prov;
  update proveedores set dias_credito = 30 where id = v_prov;
  if (select dias_credito from proveedores where id = v_prov) <> 30 then raise exception 'FALLÓ: admin no pudo editar'; end if;

  -- Desactivar exige motivo; la base registra quién y cuándo; reactivar lo borra.
  begin
    update proveedores set activo = false where id = v_prov;
    raise exception 'FALLÓ: desactivar sin motivo';
  exception when check_violation then null; end;
  update proveedores set activo = false, motivo_desactivacion = 'Prueba', desactivado_por = v_b where id = v_prov;
  if (select desactivado_por from proveedores where id = v_prov) is distinct from v_a
     or (select desactivado_en from proveedores where id = v_prov) is null then
    raise exception 'FALLÓ: la desactivación debe registrar quién (la sesión, no lo que mande la pantalla) y cuándo';
  end if;
  update proveedores set activo = true where id = v_prov;
  if (select motivo_desactivacion from proveedores where id = v_prov) is not null then raise exception 'FALLÓ: reactivar debe borrar el motivo'; end if;
  v_ok := array_append(v_ok, 'desactivar con motivo, quién y cuándo');

  begin
    insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Otro', 'PLA010203AB1', '601');
    raise exception 'FALLÓ: RFC repetido';
  exception when unique_violation then null; end;
  begin
    insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Otro', 'pla-010203', '601');
    raise exception 'FALLÓ: RFC inválido';
  exception when check_violation then null; end;
  begin
    insert into proveedores (razon_social, rfc, regimen_fiscal, clabe) values ('Otro', 'OTR010203AB1', '601', '012180001234567897');
    raise exception 'FALLÓ: CLABE inválida';
  exception when check_violation then null; end;
  v_ok := array_append(v_ok, 'admin da de alta y edita; RFC único y válido; CLABE válida');

  insert into articulos (nombre, unidad, tipo, dodo_insumo_id) values ('Prueba queso', 'kg', 'consumible', '11F19A2E8EBB9F693A4A16E21FDBFD00');
  begin
    insert into articulos (nombre, unidad, tipo, dodo_insumo_id) values ('Prueba horno', 'pza', 'activo_fijo', '11F19A2E8EBB9F693A4A16E21FDBFD01');
    raise exception 'FALLÓ: ID de Dodo IS en un no consumible';
  exception when check_violation then null; end;
  begin
    insert into articulos (nombre, unidad, tipo) values ('PRUEBA QUESO', 'kg', 'consumible');
    raise exception 'FALLÓ: nombre de artículo repetido';
  exception when unique_violation then null; end;
  v_ok := array_append(v_ok, 'artículos: ID de Dodo IS solo consumibles, nombre único');

  begin
    insert into precios_proveedor (proveedor_id, articulo_id, precio, fecha)
    select v_prov, id, 1, current_date from articulos where nombre = 'Prueba queso';
    raise exception 'FALLÓ: nadie escribe precios_proveedor directo';
  exception when insufficient_privilege then null; end;

  delete from proveedores where id = v_prov;
  if not exists (select 1 from proveedores where id = v_prov) then raise exception 'FALLÓ: un proveedor no se debe poder borrar'; end if;
  v_ok := array_append(v_ok, 'nada se borra; precios solo por el sistema');

  -- ── Corporativo: lee, no escribe ──────────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_a;
  execute 'set local role authenticated';
  select count(*) into v_n from proveedores where id = v_prov;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo debe ver proveedores'; end if;
  begin
    insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Corpo', 'COR010203AB1', '601');
    raise exception 'FALLÓ: corporativo no debe dar de alta';
  exception when insufficient_privilege then null; end;
  update proveedores set dias_credito = 1 where id = v_prov;
  execute 'reset role';
  if (select dias_credito from proveedores where id = v_prov) <> 30 then raise exception 'FALLÓ: corporativo no debe editar'; end if;
  v_ok := array_append(v_ok, 'corporativo consulta y no edita');

  -- ── Gerente de sucursal: no ve el catálogo ────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from proveedores;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no debe ver proveedores'; end if;
  select count(*) into v_n from articulos;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no debe ver artículos'; end if;
  execute 'reset role';
  v_ok := array_append(v_ok, 'la sucursal no ve el catálogo');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
