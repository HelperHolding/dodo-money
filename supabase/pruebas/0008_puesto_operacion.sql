-- Pruebas de la migración 0008 (puesto "operacion"). Córrelas en Supabase → SQL Editor después de la migración.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_ok text[] := '{}';
  v_n int;
  v_usuario uuid;
begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'rol_usuario' and e.enumlabel = 'cajero') then
    raise exception 'FALLÓ: el puesto cajero todavía existe';
  end if;
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'rol_usuario' and e.enumlabel = 'operacion') then
    raise exception 'FALLÓ: falta el puesto operacion';
  end if;
  v_ok := array_append(v_ok, 'cajero ahora es operacion');

  -- Las listas de la sucursal que registraba el cajero ahora las registra operación.
  select count(*) into v_n from checklists where 'operacion' = any(roles);
  if exists (select 1 from checklists where clave = 'limpieza') and v_n = 0 then
    raise exception 'FALLÓ: las listas del puesto base deben quedar para operacion';
  end if;
  v_ok := array_append(v_ok, 'listas del turno para operacion');

  -- Un usuario puede quedar en operacion y es el valor por omisión de un perfil nuevo.
  select id into v_usuario from perfiles where activo and sucursal_id is not null limit 1;
  if v_usuario is not null then
    update perfiles set rol = 'operacion' where id = v_usuario;
    if (select rol::text from perfiles where id = v_usuario) <> 'operacion' then raise exception 'FALLÓ: no se pudo asignar operacion'; end if;
  end if;
  if (select column_default from information_schema.columns where table_name = 'perfiles' and column_name = 'rol') not like '%operacion%' then
    raise exception 'FALLÓ: el puesto por omisión de un perfil nuevo debe ser operacion';
  end if;
  v_ok := array_append(v_ok, 'se asigna y es el puesto por omisión');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
