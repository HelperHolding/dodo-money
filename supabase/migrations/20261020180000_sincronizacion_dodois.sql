-- Sincronización de ventas con la API de Dodo IS: conexión (tokens en el Vault), sucursal ↔ unidad de Dodo, registro de
-- sincronizaciones y la función que guarda un día con la misma forma que "Datos brutos", reutilizando el registro de
-- importación del día (así una conciliación sigue aplicando). Quita la prueba de canje del 2026-10-14.
-- Requiere todas las migraciones anteriores (0001–0072 y 20261020013338).

alter table sucursales add column if not exists dodois_unit_id text unique;

do $$ declare c text; begin
  for c in select conname from pg_constraint
            where conrelid = 'importaciones_ventas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%formato%' loop
    execute format('alter table importaciones_ventas drop constraint %I', c);
  end loop;
end $$;
alter table importaciones_ventas add constraint importaciones_ventas_formato_check check (formato in ('ventas_productos', 'datos_brutos', 'api'));

create table dodois_conexion (
  id                boolean primary key default true check (id),
  conectado_por     uuid not null references perfiles(id),
  conectado_en      timestamptz not null default now(),
  unidades          jsonb not null default '[]',
  scopes            text not null default '',
  refresh_secret_id uuid,
  access_secret_id  uuid,
  access_expira     timestamptz,
  renovando_hasta   timestamptz,
  estado            text not null default 'conectada' check (estado in ('conectada', 'requiere_reconectar')),
  ultimo_error      text
);
alter table dodois_conexion enable row level security;
create policy ver_dodois_conexion on dodois_conexion for select using (ve_finanzas());
revoke all on dodois_conexion from anon, authenticated;
grant select (id, conectado_por, conectado_en, unidades, scopes, access_expira, estado, ultimo_error) on dodois_conexion to authenticated;

create table dodois_sincronizaciones (
  id           bigint generated always as identity primary key,
  inicio       timestamptz not null default now(),
  fin          timestamptz,
  origen       text not null check (origen in ('cron', 'noche', 'manual')),
  sucursal_id  uuid references sucursales(id),
  fecha        date,
  pedidos      integer,
  total        numeric(12,2),
  estado       text not null check (estado in ('ok', 'omitido', 'error')),
  mensaje      text,
  desconocidos jsonb not null default '[]'
);
create index dodois_sincronizaciones_inicio on dodois_sincronizaciones (inicio desc);
alter table dodois_sincronizaciones enable row level security;
create policy ver_dodois_sincronizaciones on dodois_sincronizaciones for select using (ve_finanzas());
revoke all on dodois_sincronizaciones from anon, authenticated;
grant select on dodois_sincronizaciones to authenticated;

-- Guarda o reemplaza un secreto del Vault por nombre; devuelve su id.
create or replace function dodois_secreto(p_nombre text, p_valor text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_nombre;
  if v_id is null then return vault.create_secret(p_valor, p_nombre, 'Dodo IS (sincronización de ventas)'); end if;
  perform vault.update_secret(v_id, p_valor);
  return v_id;
end $$;
revoke execute on function dodois_secreto(text, text) from public, anon, authenticated;

create or replace function exigir_servidor() returns void
language plpgsql stable as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Solo el servidor.'; end if;
end $$;

-- Admin conecta (desde /api/dodois/callback): guarda los tokens y liga sucursales por nombre si aún no lo están.
create or replace function dodois_conectar(p_refresh text, p_access text, p_expira timestamptz, p_unidades jsonb, p_scopes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_r uuid; v_a uuid;
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador conecta Dodo IS.'; end if;
  v_r := dodois_secreto('dodois_refresh_token', p_refresh);
  v_a := dodois_secreto('dodois_access_token', p_access);
  insert into dodois_conexion (id, conectado_por, conectado_en, unidades, scopes, refresh_secret_id, access_secret_id, access_expira, renovando_hasta, estado, ultimo_error)
  values (true, auth.uid(), now(), coalesce(p_unidades, '[]'), coalesce(p_scopes, ''), v_r, v_a, p_expira, null, 'conectada', null)
  on conflict (id) do update set conectado_por = excluded.conectado_por, conectado_en = excluded.conectado_en, unidades = excluded.unidades,
    scopes = excluded.scopes, refresh_secret_id = excluded.refresh_secret_id, access_secret_id = excluded.access_secret_id,
    access_expira = excluded.access_expira, renovando_hasta = null, estado = 'conectada', ultimo_error = null;
  update sucursales s set dodois_unit_id = u->>'id'
    from jsonb_array_elements(coalesce(p_unidades, '[]')) u
   where lower(s.nombre) = lower(u->>'name') and s.dodois_unit_id is null
     and not exists (select 1 from sucursales o where o.dodois_unit_id = u->>'id');
end $$;

create or replace function ligar_unidad_dodois(p_sucursal uuid, p_unit text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador liga sucursales con Dodo IS.'; end if;
  update sucursales set dodois_unit_id = nullif(trim(p_unit), '') where id = p_sucursal;
  if not found then raise exception 'Sucursal no encontrada.'; end if;
exception when unique_violation then
  raise exception 'Esa unidad de Dodo IS ya está ligada a otra sucursal.';
end $$;

create or replace function dodois_tokens() returns table (refresh text, access text, access_expira timestamptz, estado text)
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  return query select (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.refresh_secret_id),
                      (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.access_secret_id),
                      c.access_expira, c.estado
                 from dodois_conexion c;
end $$;

-- Solo una renovación a la vez: el token de renovación es de un solo uso.
create or replace function dodois_tomar_renovacion() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  update dodois_conexion set renovando_hasta = now() + interval '30 seconds' where renovando_hasta is null or renovando_hasta < now();
  return found;
end $$;

create or replace function dodois_guardar_tokens(p_refresh text, p_access text, p_expira timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  perform dodois_secreto('dodois_refresh_token', p_refresh);
  perform dodois_secreto('dodois_access_token', p_access);
  update dodois_conexion set access_expira = p_expira, renovando_hasta = null, estado = 'conectada', ultimo_error = null;
end $$;

create or replace function dodois_marcar_error(p_mensaje text, p_reconectar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  update dodois_conexion set ultimo_error = left(p_mensaje, 500), renovando_hasta = null,
    estado = case when p_reconectar then 'requiere_reconectar' else estado end;
end $$;

-- Un día de una sucursal con la forma de "Datos brutos". 'excel': el día vino del Excel y no se toca; 'vacio': sin pedidos.
create or replace function sincronizar_ventas_dodo(p_sucursal uuid, p_fecha date, p_resumen jsonb, p_desglose jsonb, p_pedidos jsonb, p_productos jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_previa ventas_dia; v_formato text; v_imp uuid; v_dia uuid; v_por uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Solo el servidor sincroniza ventas.'; end if;
  select conectado_por into v_por from dodois_conexion;
  if v_por is null then raise exception 'Dodo IS no está conectado.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_sucursal::text || p_fecha::text));

  select * into v_previa from ventas_dia where sucursal_id = p_sucursal and fecha = p_fecha;
  if v_previa.id is not null then
    select formato into v_formato from importaciones_ventas where id = v_previa.importacion_id;
    if v_formato is distinct from 'api' then return 'excel'; end if;
    v_imp := v_previa.importacion_id;
  elsif jsonb_array_length(coalesce(p_pedidos, '[]')) = 0 then
    return 'vacio';
  end if;

  if v_imp is null then
    insert into importaciones_ventas (sucursal_id, fecha, archivo_ventas, archivo_productos, total, suma_productos, productos, pedidos, formato, importado_por)
    values (p_sucursal, p_fecha, 'API Dodo IS', null, (p_resumen->>'total')::numeric, coalesce((p_resumen->>'suma_productos')::numeric, 0),
            coalesce((p_resumen->>'productos')::integer, 0), (p_resumen->>'pedidos')::integer, 'api', v_por)
    returning id into v_imp;
  else
    update importaciones_ventas set total = (p_resumen->>'total')::numeric, suma_productos = coalesce((p_resumen->>'suma_productos')::numeric, 0),
      productos = coalesce((p_resumen->>'productos')::integer, 0), pedidos = (p_resumen->>'pedidos')::integer, importado_en = now()
     where id = v_imp;
  end if;

  drop table if exists tmp_pedidos, tmp_productos;
  create temp table tmp_pedidos on commit drop as
    select * from jsonb_to_recordset(coalesce(p_pedidos, '[]')) as x(
      dodo_id text, hora time, pago text, tipo text, origen text, origen_dodo text, para_llevar boolean, estado text, total numeric,
      total_sin_descuento numeric, iva numeric, productos integer, promocion text, turno_dodo text, agregador text);
  create temp table tmp_productos on commit drop as
    select * from jsonb_to_recordset(coalesce(p_productos, '[]')) as x(
      pedido_id text, renglon integer, dodo_uuid text, nombre text, tamano text, precio numeric, precio_sin_descuento numeric, combo text);

  -- Catálogo, igual que importar_datos_brutos.
  insert into productos_codigos (dodo_uuid, dodo_id)
  select x.dodo_uuid, (select min(pv.dodo_id) from productos_venta pv where lower(pv.nombre) = lower(x.nombre))
    from (select distinct on (dodo_uuid) dodo_uuid, nombre from tmp_productos order by dodo_uuid, nombre) x
   where not exists (select 1 from productos_codigos c where c.dodo_uuid = x.dodo_uuid)
     and exists (select 1 from productos_venta pv where lower(pv.nombre) = lower(x.nombre));
  insert into productos_venta (dodo_id, nombre, tamano)
  select nextval('productos_venta_interno'), x.nombre, nullif(x.tamano, '')
    from (select distinct on (lower(t.nombre)) t.nombre, t.tamano from tmp_productos t
           where not exists (select 1 from productos_codigos c where c.dodo_uuid = t.dodo_uuid) order by lower(t.nombre), t.nombre) x;
  insert into productos_codigos (dodo_uuid, dodo_id)
  select x.dodo_uuid, (select min(pv.dodo_id) from productos_venta pv where lower(pv.nombre) = lower(x.nombre))
    from (select distinct on (dodo_uuid) dodo_uuid, nombre from tmp_productos order by dodo_uuid, nombre) x
   where not exists (select 1 from productos_codigos c where c.dodo_uuid = x.dodo_uuid);

  -- Pedidos sincronizados de este día que ya no vienen (cancelados o devueltos después) se quitan; los demás se guardan.
  delete from pedidos where importacion_id = v_imp and dodo_id not in (select dodo_id from tmp_pedidos);
  insert into pedidos (dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, origen_dodo, para_llevar, estado, total, total_sin_descuento,
                       iva, productos, promocion, turno_dodo, agregador, importacion_id)
  select dodo_id, p_sucursal, p_fecha, hora, pago, tipo, origen, origen_dodo, coalesce(para_llevar, false), estado, total, total_sin_descuento,
         coalesce(iva, 0), coalesce(productos, 0), promocion, turno_dodo, agregador, v_imp
    from tmp_pedidos
  on conflict (dodo_id) do update set hora = excluded.hora, pago = excluded.pago, tipo = excluded.tipo, origen = excluded.origen,
    origen_dodo = excluded.origen_dodo, para_llevar = excluded.para_llevar, estado = excluded.estado, total = excluded.total,
    total_sin_descuento = excluded.total_sin_descuento, iva = excluded.iva, productos = excluded.productos, promocion = excluded.promocion,
    turno_dodo = excluded.turno_dodo, agregador = excluded.agregador, importacion_id = excluded.importacion_id;
  delete from pedido_productos where pedido_id in (select dodo_id from tmp_pedidos);
  insert into pedido_productos (pedido_id, renglon, dodo_uuid, dodo_id, nombre, precio, precio_sin_descuento, costo_dodo, combo)
  select t.pedido_id, t.renglon, t.dodo_uuid, c.dodo_id, t.nombre, t.precio, t.precio_sin_descuento, null, t.combo
    from tmp_productos t join tmp_pedidos p on p.dodo_id = t.pedido_id join productos_codigos c on c.dodo_uuid = t.dodo_uuid;

  insert into ventas_dia (sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, importacion_id)
  values (p_sucursal, p_fecha, (p_resumen->>'pedidos')::integer, (p_resumen->>'total')::numeric, (p_resumen->>'efectivo')::numeric,
          (p_resumen->>'tarjeta')::numeric, (p_resumen->>'en_linea')::numeric, (p_resumen->>'iva')::numeric, (p_resumen->>'venta_m2')::numeric, v_imp)
  on conflict (sucursal_id, fecha) do update set pedidos = excluded.pedidos, total = excluded.total, efectivo = excluded.efectivo,
    tarjeta = excluded.tarjeta, en_linea = excluded.en_linea, iva = excluded.iva, venta_m2 = excluded.venta_m2, importacion_id = excluded.importacion_id
  returning id into v_dia;
  delete from ventas_dia_desglose where ventas_dia_id = v_dia;
  insert into ventas_dia_desglose (ventas_dia_id, tipo, pedidos, total, efectivo, tarjeta, en_linea, iva)
  select v_dia, x->>'tipo', (x->>'pedidos')::integer, (x->>'total')::numeric, (x->>'efectivo')::numeric, (x->>'tarjeta')::numeric,
         (x->>'en_linea')::numeric, (x->>'iva')::numeric
    from jsonb_array_elements(coalesce(p_desglose, '[]')) x;
  delete from ventas_producto where sucursal_id = p_sucursal and fecha = p_fecha;
  insert into ventas_producto (sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento)
  select p_sucursal, p_fecha, pp.dodo_id, min(pp.nombre), count(*), sum(pp.precio), sum(pp.precio_sin_descuento)
    from pedido_productos pp join pedidos p on p.dodo_id = pp.pedido_id
   where p.sucursal_id = p_sucursal and p.fecha = p_fecha and p.estado = 'entregado' and p.tipo <> 'personal'
   group by pp.dodo_id;

  -- Una conciliación conserva la suma original de las formas de pago: si cambiaron, deja de aplicar.
  if v_previa.id is not null and (v_previa.efectivo, v_previa.tarjeta, v_previa.en_linea) is distinct from
     ((p_resumen->>'efectivo')::numeric, (p_resumen->>'tarjeta')::numeric, (p_resumen->>'en_linea')::numeric) then
    update ventas_conciliaciones set anulado_en = now(), anulado_por = v_por, motivo_anulacion = 'La venta de Dodo IS cambió después de conciliar.'
     where importacion_id = v_imp and anulado_en is null;
  end if;
  return 'ok';
end $$;

-- pg_cron llama esto: avisa a la app (Vercel) con la clave compartida. La URL y la clave viven en el Vault.
create extension if not exists pg_net;
create or replace function dodois_disparar(p_origen text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_clave text; v_url text;
begin
  select decrypted_secret into v_clave from vault.decrypted_secrets where name = 'dodois_cron_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'dodois_sync_url';
  if v_clave is null or v_url is null then raise exception 'Faltan dodois_cron_secret o dodois_sync_url en el Vault.'; end if;
  return net.http_post(url := v_url, body := jsonb_build_object('origen', p_origen),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_clave), timeout_milliseconds := 60000);
end $$;

revoke execute on function dodois_conectar(text, text, timestamptz, jsonb, text), ligar_unidad_dodois(uuid, text) from public, anon;
grant execute on function dodois_conectar(text, text, timestamptz, jsonb, text), ligar_unidad_dodois(uuid, text) to authenticated;
revoke execute on function dodois_tokens(), dodois_tomar_renovacion(), dodois_guardar_tokens(text, text, timestamptz),
  dodois_marcar_error(text, boolean), sincronizar_ventas_dodo(uuid, date, jsonb, jsonb, jsonb, jsonb), dodois_disparar(text) from public, anon, authenticated;
grant execute on function dodois_tokens(), dodois_tomar_renovacion(), dodois_guardar_tokens(text, text, timestamptz),
  dodois_marcar_error(text, boolean), sincronizar_ventas_dodo(uuid, date, jsonb, jsonb, jsonb, jsonb) to service_role;

-- Fin de la prueba del 2026-10-14.
drop function if exists dodois_canjear_codigo(text, text, text, text);
delete from vault.secrets where name = 'dodois_client_secret';
