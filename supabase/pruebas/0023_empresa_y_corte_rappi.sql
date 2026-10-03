-- Pruebas de la migración 0023 (datos de la empresa y corte de Rappi). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan dos usuarios activos de la misma sucursal y un usuario corporativo activo. Usan un cierre de prueba del 1999-01-01.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_c uuid; v_suc uuid; v_cierre uuid;
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_c is null then raise exception 'FALTAN DATOS: se necesita un usuario corporativo activo.'; end if;

  -- Empresa: los campos nuevos validan su formato.
  insert into empresa (id, rfc, razon_social) values (true, 'DPM210101AB1', 'Prueba') on conflict (id) do nothing;
  update empresa set regimen_fiscal = '601', codigo_postal = '44190', domicilio = 'Av. Prueba 1', correo_compras = 'compras@prueba.mx';
  begin
    update empresa set codigo_postal = '4419';
    raise exception 'FALLÓ: el código postal son 5 dígitos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (CP): %', sqlerrm; end if;
  end;
  begin
    update empresa set regimen_fiscal = '999';
    raise exception 'FALLÓ: el régimen es del catálogo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (régimen): %', sqlerrm; end if;
  end;
  begin
    update empresa set correo_compras = 'compras@';
    raise exception 'FALLÓ: el correo debe ser válido';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (correo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'empresa con régimen, CP, domicilio y correo');

  if not ('application/pdf' = any((select allowed_mime_types from storage.buckets where id = 'comprobantes'))) then
    raise exception 'FALLÓ: el bucket de comprobantes debe aceptar PDF';
  end if;
  v_ok := array_append(v_ok, 'comprobantes acepta PDF');

  -- Cierre con corte de Rappi: no negativo y el archivo en la carpeta de su sucursal.
  insert into cierres_dia (sucursal_id, fecha, rappi, cerrado_por) values (v_suc, date '1999-01-01', 1200, v_a) returning id into v_cierre;
  begin
    update cierres_dia set rappi_corte = -1 where id = v_cierre;
    raise exception 'FALLÓ: el corte no puede ser negativo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (negativo): %', sqlerrm; end if;
  end;
  begin
    update cierres_dia set rappi_corte_ruta = 'otra-sucursal/rappi/x.pdf' where id = v_cierre;
    raise exception 'FALLÓ: el archivo va en la carpeta de su sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%corte_rappi_de_su_sucursal%' then raise exception 'FALLÓ: mensaje inesperado (ruta): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'el corte no es negativo y va en su sucursal');

  -- Registrar después: ni encargado ni corporativo; el gerente una sola vez.
  update perfiles set rol = 'encargado' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  begin
    perform registrar_corte_rappi(v_cierre, 1250.5, null);
    raise exception 'FALLÓ: el encargado no registra el corte';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo el gerente o el admin%' then raise exception 'FALLÓ: mensaje inesperado (encargado): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform registrar_corte_rappi(v_cierre, 1250.5, null);
    raise exception 'FALLÓ: corporativo no registra el corte';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  update perfiles set rol = 'gerente' where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform registrar_corte_rappi(v_cierre, 1250.5, v_suc::text || '/rappi/corte.pdf');
  if (select rappi_corte from cierres_dia where id = v_cierre) <> 1250.5 then raise exception 'FALLÓ: el gerente debe registrar el corte'; end if;
  begin
    perform registrar_corte_rappi(v_cierre, 1, null);
    raise exception 'FALLÓ: el corte se registra una sola vez';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%ya está registrado%' then raise exception 'FALLÓ: mensaje inesperado (dos veces): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'el gerente registra el corte después, una vez');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
