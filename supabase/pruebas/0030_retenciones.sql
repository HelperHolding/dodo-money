-- Correr completo después de 0030. El ERROR intencional PRUEBAS OK revierte los datos de prueba.
-- Necesita un admin activo y un corporativo activo. Usa siempre fecha calendario de México.
do $$
declare a uuid; c uuid; e uuid; prueba record; mes date := date_trunc('month', hoy_mx())::date;
begin
  select id into a from perfiles where activo and rol::text = 'admin' limit 1;
  select id into c from perfiles where activo and rol::text = 'corporativo' limit 1;
  if a is null or c is null then raise exception 'FALTAN DATOS: se necesitan admin y corporativo activos.'; end if;
  if not exists (select 1 from empresa) then insert into empresa (rfc, razon_social) values ('DMX010101AB1', 'Empresa de prueba'); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  e := registrar_entero(mes, hoy_mx(), 3328, 3120, 'PRUEBA', null);
  if not exists (select 1 from enteros_retenciones where id = e and registrado_por = a and iva = 3328 and isr = 3120) then raise exception 'FALLÓ: registro como admin'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  begin
    perform registrar_entero(mes, hoy_mx(), 1, 0, null, null);
    raise exception 'FALLÓ: corporativo registró';
  exception when others then
    if sqlerrm <> 'Corporativo solo puede consultar.' then raise; end if;
  end;
  begin
    perform anular_entero(e, 'Prueba');
    raise exception 'FALLÓ: corporativo anuló';
  exception when others then
    if sqlerrm <> 'Corporativo solo puede consultar.' then raise; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  for prueba in select * from (values
    (hoy_mx()+1, 1::numeric, 0::numeric, 'La fecha no puede ser futura.'),
    (mes-1, 1::numeric, 0::numeric, 'La fecha no puede ser anterior al mes.'),
    (hoy_mx(), 0::numeric, 0::numeric, 'Revisa los montos: cero o más, alguno mayor que cero y hasta dos decimales.'),
    (hoy_mx(), -1::numeric, 1::numeric, 'Revisa los montos: cero o más, alguno mayor que cero y hasta dos decimales.'),
    (hoy_mx(), 0.001::numeric, 1::numeric, 'Revisa los montos: cero o más, alguno mayor que cero y hasta dos decimales.')
  ) as casos(fecha, iva, isr, mensaje) loop
    begin
      perform registrar_entero(mes, prueba.fecha, prueba.iva, prueba.isr, null, null);
      raise exception 'FALLÓ: aceptó datos inválidos (%)', prueba.mensaje;
    exception when others then
      if sqlerrm <> prueba.mensaje then raise; end if;
    end;
  end loop;
  begin
    perform registrar_entero(mes+1, hoy_mx(), 1, 0, null, null);
    raise exception 'FALLÓ: aceptó mes que no empieza el día 1';
  exception when others then
    if sqlerrm <> 'Elige el mes (día 1).' then raise; end if;
  end;
  begin
    perform registrar_entero(mes, hoy_mx(), 1, 0, repeat('X',61), null);
    raise exception 'FALLÓ: aceptó operación demasiado larga';
  exception when others then
    if sqlerrm <> 'La operación admite hasta 60 caracteres.' then raise; end if;
  end;
  begin
    perform registrar_entero(mes, hoy_mx(), 1, 0, null, 'otra-carpeta/acuse.pdf');
    raise exception 'FALLÓ: aceptó ruta de acuse inválida';
  exception when others then
    if sqlerrm <> 'Ruta del acuse inválida.' then raise; end if;
  end;
  begin
    perform anular_entero(e, ' ');
    raise exception 'FALLÓ: anuló sin motivo';
  exception when others then
    if sqlerrm <> 'Escribe el motivo de anulación.' then raise; end if;
  end;
  perform anular_entero(e, 'Prueba de anulación');
  if not exists (select 1 from enteros_retenciones where id = e and anulado_por = a and anulado_en is not null and motivo_anulacion = 'Prueba de anulación') then raise exception 'FALLÓ: anulación'; end if;
  begin
    perform anular_entero(e, 'Otra');
    raise exception 'FALLÓ: anuló dos veces';
  exception when others then
    if sqlerrm <> 'Ese entero ya está anulado.' then raise; end if;
  end;
  if has_table_privilege('authenticated', 'enteros_retenciones', 'INSERT')
     or has_table_privilege('authenticated', 'enteros_retenciones', 'UPDATE')
     or has_table_privilege('authenticated', 'enteros_retenciones', 'DELETE') then raise exception 'FALLÓ: escritura directa habilitada'; end if;
  if not exists (select 1 from storage.buckets where id = 'acuses-sat' and not public and file_size_limit = 5242880) then raise exception 'FALLÓ: bucket privado'; end if;
  raise exception 'PRUEBAS OK — registro admin · corporativo solo consulta · fechas y montos · motivo obligatorio · anulación única · operación y acuse · sin escritura directa · bucket privado';
end $$;
