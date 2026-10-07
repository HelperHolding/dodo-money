-- Pruebas de la migración 0040 (el admin cambia de sucursal). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un admin, un gerente y un corporativo activos, y al menos dos sucursales.
--   · "PRUEBAS OK — …" → todo bien (no deja cambios).   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_g uuid; v_c uuid; v_otra uuid; v_ok text[] := '{}';
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select id into v_g from perfiles where rol::text = 'gerente' and activo limit 1;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_a is null or v_g is null or v_c is null then raise exception 'FALTAN DATOS: se necesitan un admin, un gerente y un corporativo activos.'; end if;
  select id into v_otra from sucursales where id is distinct from (select sucursal_id from perfiles where id = v_a) order by nombre limit 1;
  if v_otra is null then raise exception 'FALTAN DATOS: se necesitan al menos dos sucursales.'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform cambiar_mi_sucursal(v_otra);
  if mi_sucursal() is distinct from v_otra then raise exception 'FALLÓ: el admin queda operando en la sucursal elegida'; end if;
  begin
    perform cambiar_mi_sucursal(gen_random_uuid());
    raise exception 'FALLÓ: una sucursal que no existe no pasa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Sucursal no encontrada.' then raise exception 'FALLÓ: mensaje inesperado (inexistente): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'el admin cambia de sucursal y mi_sucursal() la sigue');

  perform set_config('request.jwt.claims', json_build_object('sub', v_g, 'role', 'authenticated')::text, true);
  begin
    perform cambiar_mi_sucursal(v_otra);
    raise exception 'FALLÓ: un gerente no cambia de sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo un administrador cambia de sucursal.' then raise exception 'FALLÓ: mensaje inesperado (gerente): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform cambiar_mi_sucursal(v_otra);
    raise exception 'FALLÓ: corporativo no cambia de sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo un administrador cambia de sucursal.' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  if (select sucursal_id from perfiles where id = v_c) is not null then raise exception 'FALLÓ: corporativo sigue sin sucursal'; end if;
  v_ok := array_append(v_ok, 'gerente y corporativo no cambian de sucursal');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
