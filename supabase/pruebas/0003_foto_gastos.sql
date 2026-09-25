-- Pruebas de la migración 0003 (foto del ticket). Córrelas completas en Supabase → SQL Editor.
-- Necesitan al menos un usuario activo con sucursal.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_usuario uuid; v_suc uuid; v_otra text := gen_random_uuid()::text; v_n int;
  v_ok text[] := '{}';
begin
  select id, sucursal_id into v_usuario, v_suc from perfiles where activo and sucursal_id is not null limit 1;
  if v_usuario is null then raise exception 'FALTAN DATOS: se necesita un usuario activo con sucursal.'; end if;
  if not exists (select 1 from storage.buckets where id = 'comprobantes' and not public) then
    raise exception 'FALLÓ: falta el bucket privado comprobantes (corre 0003_foto_gastos.sql)';
  end if;
  v_ok := array_append(v_ok, 'bucket privado');

  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into storage.objects (bucket_id, name) values ('comprobantes', v_suc::text || '/prueba.jpg');
  v_ok := array_append(v_ok, 'sube a su sucursal');

  begin
    insert into storage.objects (bucket_id, name) values ('comprobantes', v_otra || '/prueba.jpg');
    raise exception 'FALLÓ: no debe poder subir fotos a otra sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado al subir a otra sucursal: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no sube a otra sucursal');

  update storage.objects set name = v_suc::text || '/cambiada.jpg' where bucket_id = 'comprobantes' and name = v_suc::text || '/prueba.jpg';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLÓ: una foto no debe poder reemplazarse'; end if;
  begin
    delete from storage.objects where bucket_id = 'comprobantes' and name = v_suc::text || '/prueba.jpg';
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'FALLÓ: una foto no debe poder borrarse'; end if;
  exception when others then
    -- Supabase también puede bloquear el borrado directo con su propio trigger: igual cuenta como no borrada.
    if sqlerrm like 'FALLÓ%' then raise; end if;
  end;
  v_ok := array_append(v_ok, 'no se reemplaza ni se borra');

  begin
    insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante, foto_path)
    values (v_suc, current_date, 'Prueba', 1, 'nota', v_otra || '/prueba.jpg');
    raise exception 'FALLÓ: un gasto no debe apuntar a la foto de otra sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%gastos_foto_de_su_sucursal%' then raise exception 'FALLÓ: mensaje inesperado para foto ajena: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'gasto solo con foto de su sucursal');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
