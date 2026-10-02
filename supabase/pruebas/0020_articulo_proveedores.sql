-- Pruebas de la migración 0020 (proveedores de cada artículo). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un usuario activo con sucursal y un usuario corporativo activo. Crean proveedores y artículos de prueba.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid; v_art uuid; v_art2 uuid;
  v_ok text[] := '{}';
begin
  select id into v_a from perfiles where activo and sucursal_id is not null limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesita un usuario activo con sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;

  -- Lo que ya tenía precio quedó ligado, con un solo principal por artículo.
  if exists (select 1 from precios_proveedor pp where not exists (
    select 1 from articulo_proveedores ap where ap.articulo_id = pp.articulo_id and ap.proveedor_id = pp.proveedor_id)) then
    raise exception 'FALLÓ: hay precios sin su liga artículo–proveedor';
  end if;
  if exists (select articulo_id from articulo_proveedores group by articulo_id having count(*) filter (where principal) <> 1) then
    raise exception 'FALLÓ: cada artículo ligado debe tener exactamente un principal';
  end if;
  v_ok := array_append(v_ok, 'los precios existentes quedaron ligados con un principal');

  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba AP Uno', 'PAU010203AB1', '601') returning id into v_p1;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba AP Dos', 'PAD010203AB1', '601') returning id into v_p2;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba AP Tres', 'PAT010203AB1', '601') returning id into v_p3;
  insert into articulos (nombre, unidad, tipo) values ('Prueba AP harina', 'kg', 'consumible') returning id into v_art;
  insert into articulos (nombre, unidad, tipo) values ('Prueba AP sal', 'kg', 'consumible') returning id into v_art2;

  -- Solo el admin guarda; corporativo consulta.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform guardar_proveedores_articulo(v_art, array[v_p1], v_p1);
    raise exception 'FALLÓ: corporativo no debe guardar proveedores';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);

  -- El principal tiene que estar entre los elegidos.
  begin
    perform guardar_proveedores_articulo(v_art, array[v_p1, v_p2], v_p3);
    raise exception 'FALLÓ: el principal debe estar entre los elegidos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'El proveedor principal tiene que estar%' then raise exception 'FALLÓ: mensaje inesperado (principal): %', sqlerrm; end if;
  end;

  -- Guardar, cambiar el principal y quitar uno.
  perform guardar_proveedores_articulo(v_art, array[v_p1, v_p2, v_p1], v_p1);
  if (select count(*) from articulo_proveedores where articulo_id = v_art) <> 2
     or (select proveedor_id from articulo_proveedores where articulo_id = v_art and principal) <> v_p1 then
    raise exception 'FALLÓ: deben quedar dos proveedores con el primero como principal';
  end if;
  perform guardar_proveedores_articulo(v_art, array[v_p2, v_p3], v_p3);
  if (select array_agg(proveedor_id order by proveedor_id) from articulo_proveedores where articulo_id = v_art)
     <> (select array_agg(x order by x) from unnest(array[v_p2, v_p3]) x)
     or (select proveedor_id from articulo_proveedores where articulo_id = v_art and principal) <> v_p3 then
    raise exception 'FALLÓ: al reemplazar deben quedar Dos y Tres, con Tres de principal';
  end if;
  perform guardar_proveedores_articulo(v_art, '{}', null);
  if exists (select 1 from articulo_proveedores where articulo_id = v_art) then raise exception 'FALLÓ: con la lista vacía no queda ningún proveedor'; end if;
  v_ok := array_append(v_ok, 'el admin guarda, cambia el principal y quita');

  -- Dos principales en el mismo artículo no se pueden.
  insert into articulo_proveedores (articulo_id, proveedor_id, principal) values (v_art2, v_p1, true);
  begin
    insert into articulo_proveedores (articulo_id, proveedor_id, principal) values (v_art2, v_p2, true);
    raise exception 'FALLÓ: un artículo no puede tener dos principales';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%articulo_un_principal%' then raise exception 'FALLÓ: mensaje inesperado (dos principales): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'un solo principal por artículo');

  -- Un precio nuevo liga al proveedor: principal si el artículo no tenía; si ya tenía, se agrega sin quitárselo.
  insert into precios_proveedor (proveedor_id, articulo_id, precio, fecha) values (v_p3, v_art, 10, current_date);
  if not (select principal from articulo_proveedores where articulo_id = v_art and proveedor_id = v_p3) then
    raise exception 'FALLÓ: el primer proveedor por precio debe quedar como principal';
  end if;
  insert into precios_proveedor (proveedor_id, articulo_id, precio, fecha) values (v_p2, v_art2, 12, current_date);
  if (select principal from articulo_proveedores where articulo_id = v_art2 and proveedor_id = v_p2)
     or not (select principal from articulo_proveedores where articulo_id = v_art2 and proveedor_id = v_p1) then
    raise exception 'FALLÓ: un precio nuevo no debe quitar el principal que ya había';
  end if;
  v_ok := array_append(v_ok, 'confirmar un precio liga al proveedor');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
