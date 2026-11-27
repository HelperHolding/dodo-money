-- Después de 20261127160000_ventas_permiso_rapido.sql. Solo lee; PRUEBAS OK revierte todo.
-- Para un admin, un corporativo, un gerente y un encargado activos: lo que dejan ver las políticas nuevas es exactamente
-- lo que deja ver ve_ventas (la regla de siempre), y la lectura de pedidos con productos de 7 días termina rápido.
do $$
declare
  r record; v_esperado bigint; v_visto bigint; v_ok text[] := '{}'; v_inicio timestamptz; v_ms numeric;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
begin
  for r in
    select distinct on (rol) id, rol::text as rol from public.perfiles
    where activo and not debe_cambiar_contrasena and rol::text in ('admin', 'corporativo', 'gerente', 'encargado')
    order by rol, id
  loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.id, 'role', 'authenticated')::text, true);

    -- Lo esperado: como postgres (sin RLS) con la regla anterior.
    select count(*) into v_esperado from public.ventas_dia where fecha >= v_hoy - 60 and public.ve_ventas(sucursal_id);
    execute 'set local role authenticated';
    select count(*) into v_visto from public.ventas_dia where fecha >= v_hoy - 60;
    execute 'reset role';
    if v_visto <> v_esperado then raise exception 'FALLÓ: % ve % días de venta y debería ver %', r.rol, v_visto, v_esperado; end if;

    select count(*) into v_esperado from public.pedidos where fecha >= v_hoy - 7 and public.ve_ventas(sucursal_id);
    execute 'set local role authenticated';
    select count(*) into v_visto from public.pedidos where fecha >= v_hoy - 7;
    execute 'reset role';
    if v_visto <> v_esperado then raise exception 'FALLÓ: % ve % pedidos y debería ver %', r.rol, v_visto, v_esperado; end if;

    select count(*) into v_esperado from public.rappi_ordenes where fecha >= v_hoy - 30 and public.ve_ventas(sucursal_id);
    execute 'set local role authenticated';
    select count(*) into v_visto from public.rappi_ordenes where fecha >= v_hoy - 30;
    execute 'reset role';
    if v_visto <> v_esperado then raise exception 'FALLÓ: % ve % órdenes Rappi y debería ver %', r.rol, v_visto, v_esperado; end if;

    select count(*) into v_esperado from public.pedido_productos pp join public.pedidos p on p.dodo_id = pp.pedido_id
      where p.fecha >= v_hoy - 7 and public.ve_ventas(p.sucursal_id);
    v_inicio := clock_timestamp();
    execute 'set local role authenticated';
    select count(*) into v_visto from public.pedido_productos pp join public.pedidos p on p.dodo_id = pp.pedido_id where p.fecha >= v_hoy - 7;
    execute 'reset role';
    v_ms := round(extract(epoch from clock_timestamp() - v_inicio) * 1000);
    if v_visto <> v_esperado then raise exception 'FALLÓ: % ve % productos de pedidos y debería ver %', r.rol, v_visto, v_esperado; end if;

    v_ok := array_append(v_ok, format('%s: %s productos de pedidos en %s ms', r.rol, v_visto, v_ms));
  end loop;
  if cardinality(v_ok) < 3 then raise exception 'FALTAN DATOS: se necesitan perfiles activos de admin, corporativo y gerente (hay %)', cardinality(v_ok); end if;
  raise exception 'PRUEBAS OK — cada rol ve lo mismo que antes · %', array_to_string(v_ok, ' · ');
end $$;
