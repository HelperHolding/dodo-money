-- Pruebas de la migración 0021 (documentos y número de cliente de proveedores). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un usuario activo con sucursal y un usuario corporativo activo. Crean un proveedor de prueba.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_p uuid; v_doc uuid; v_n int;
  v_ok text[] := '{}';
begin
  select id into v_a from perfiles where activo and sucursal_id is not null limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesita un usuario activo con sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;
  if not exists (select 1 from storage.buckets where id = 'documentos-proveedores' and not public) then
    raise exception 'FALLÓ: falta el bucket privado documentos-proveedores';
  end if;

  insert into proveedores (razon_social, rfc, regimen_fiscal, numero_cliente) values ('Prueba Docs', 'PDO010203AB1', '601', 'CLI-001') returning id into v_p;
  begin
    update proveedores set numero_cliente = repeat('x', 61) where id = v_p;
    raise exception 'FALLÓ: el número de cliente es de hasta 60 caracteres';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (número de cliente): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'número de cliente de hasta 60');

  update perfiles set rol = 'admin' where id = v_a;

  -- El admin sube y se guarda cada versión.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into documentos_proveedor (proveedor_id, tipo, fecha, ruta, subido_por)
  values (v_p, 'opinion_cumplimiento', current_date - 3, v_p::text || '/opinion_cumplimiento/x1.pdf', v_a) returning id into v_doc;
  insert into documentos_proveedor (proveedor_id, tipo, fecha, ruta, subido_por)
  values (v_p, 'opinion_cumplimiento', current_date - 40, v_p::text || '/opinion_cumplimiento/x0.pdf', v_a);
  reset role;
  select count(*) into v_n from documentos_proveedor where proveedor_id = v_p;
  if v_n <> 2 then raise exception 'FALLÓ: deben quedar las dos versiones de la opinión'; end if;
  v_ok := array_append(v_ok, 'el admin sube y se guarda el historial');

  -- La ruta es del proveedor y de su tipo; el tipo es de los tres; la fecha no es futura.
  begin
    insert into documentos_proveedor (proveedor_id, tipo, fecha, ruta) values (v_p, 'constancia_fiscal', current_date, v_p::text || '/opinion_cumplimiento/y.pdf');
    raise exception 'FALLÓ: la ruta debe ser de su tipo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (ruta): %', sqlerrm; end if;
  end;
  begin
    insert into documentos_proveedor (proveedor_id, tipo, fecha, ruta) values (v_p, 'acta', current_date, v_p::text || '/acta/z.pdf');
    raise exception 'FALLÓ: el tipo de documento no es válido';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (tipo): %', sqlerrm; end if;
  end;
  begin
    insert into documentos_proveedor (proveedor_id, tipo, fecha, ruta) values (v_p, 'caratula_banco', current_date + 2, v_p::text || '/caratula_banco/f.pdf');
    raise exception 'FALLÓ: la fecha no puede ser futura';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (futura): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'ruta, tipo y fecha válidos');

  -- Corporativo ve pero no sube.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into v_n from documentos_proveedor where proveedor_id = v_p;
  begin
    insert into documentos_proveedor (proveedor_id, tipo, fecha, ruta, subido_por)
    values (v_p, 'caratula_banco', current_date, v_p::text || '/caratula_banco/c.pdf', v_c);
    reset role;
    raise exception 'FALLÓ: corporativo no debe subir documentos';
  exception when others then
    reset role;
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe ver los documentos (vio %)', v_n; end if;
  v_ok := array_append(v_ok, 'corporativo ve y no sube');

  -- El historial no se edita ni se borra.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update documentos_proveedor set fecha = current_date where id = v_doc;
  delete from documentos_proveedor where id = v_doc;
  reset role;
  if not exists (select 1 from documentos_proveedor where id = v_doc and fecha = current_date - 3) then
    raise exception 'FALLÓ: un documento no debe editarse ni borrarse';
  end if;
  v_ok := array_append(v_ok, 'el historial no se edita ni se borra');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
