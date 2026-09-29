-- Pruebas de la migración 0009 (cambio de contraseña obligatorio). Córrelas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos. El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_ok text[] := '{}'; v_n int;
begin
  select p.id, o.id into v_a, v_b from perfiles p join perfiles o on o.id <> p.id and o.activo where p.activo limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos.'; end if;

  if (select column_default from information_schema.columns where table_name = 'perfiles' and column_name = 'debe_cambiar_contrasena') <> 'false' then
    raise exception 'FALLÓ: un perfil nuevo debe nacer sin la marca';
  end if;
  v_ok := array_append(v_ok, 'perfil nuevo sin marca');

  update perfiles set debe_cambiar_contrasena = true where id in (v_a, v_b);

  -- Como el usuario A: quita solo su marca.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  perform contrasena_cambiada();
  begin
    update perfiles set debe_cambiar_contrasena = false where id = v_b;
  exception when others then null;  -- sin permiso de edición: está bien que falle
  end;
  execute 'reset role';
  select count(*) into v_n from perfiles where id = v_a and not debe_cambiar_contrasena;
  if v_n <> 1 then raise exception 'FALLÓ: el usuario debe poder quitar su propia marca'; end if;
  select count(*) into v_n from perfiles where id = v_b and debe_cambiar_contrasena;
  if v_n <> 1 then raise exception 'FALLÓ: un usuario no debe quitar la marca de otro'; end if;
  v_ok := array_append(v_ok, 'cada quien quita solo su marca');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
