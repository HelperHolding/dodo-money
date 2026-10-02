-- Pruebas de la migración 0019 (fondos de cajón y bóveda). Córrelas completas en Supabase → SQL Editor después de la migración.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_suc uuid;
  v_ok text[] := '{}';
begin
  select id into v_suc from sucursales limit 1;
  if v_suc is null then raise exception 'FALTAN DATOS: no hay sucursales.'; end if;

  if exists (select 1 from sucursales where fondo_caja_venta <> 500) then raise exception 'FALLÓ: hay sucursales con fondo de cajón distinto de 500'; end if;
  if exists (select 1 from sucursales where fondo_boveda <> 4500 or fondo_emergencia <> 3000) then
    raise exception 'FALLÓ: el fondo de bóveda debe ser 4,500 con 3,000 de emergencia';
  end if;
  v_ok := array_append(v_ok, 'cajón 500, bóveda 4,500 con 3,000 de emergencia');

  begin
    update sucursales set fondo_emergencia = 5000 where id = v_suc;
    raise exception 'FALLÓ: el fondo de emergencia no puede ser mayor que el de la bóveda';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%emergencia_dentro_de_boveda%' then raise exception 'FALLÓ: mensaje inesperado (emergencia): %', sqlerrm; end if;
  end;
  begin
    update sucursales set fondo_boveda = -1 where id = v_suc;
    raise exception 'FALLÓ: el fondo de bóveda no puede ser negativo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%check constraint%' then raise exception 'FALLÓ: mensaje inesperado (negativo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'la emergencia cabe en la bóveda y nada es negativo');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
