-- Pedidos y productos por pedido, importados de "Datos brutos" de Dodo IS (y después de su API).
-- Requiere 0006. Solo el admin importa; se leen igual que el resto de Ventas (ve_ventas).

alter table sucursales add column if not exists m2_comedor numeric(8,2) check (m2_comedor > 0);

alter table importaciones_ventas
  add column if not exists formato text not null default 'ventas_productos'
    check (formato in ('ventas_productos', 'datos_brutos')),
  add column if not exists pedidos integer,
  alter column archivo_productos drop not null;

-- Datos brutos identifica cada producto (con su tamaño) con un código de Dodo IS, no con el número de ProductsSales.
alter table productos_venta add column if not exists dodo_uuid text unique;
-- Productos que solo llegan por Datos brutos: su dodo_id sale de aquí, lejos de los números de Dodo IS.
create sequence if not exists productos_venta_interno start 1000000;

create table pedidos (
  dodo_id              text primary key,
  sucursal_id          uuid not null references sucursales(id),
  fecha                date not null,
  hora                 time not null,
  pago                 text not null check (pago in ('efectivo', 'tarjeta', 'en_linea', 'otro')),
  tipo                 text not null check (tipo in ('en_tienda', 'entrega', 'personal')),
  origen               text not null check (origen in ('mostrador', 'kiosco', 'app', 'sitio', 'otro')),
  origen_dodo          text,
  para_llevar          boolean not null default false,
  estado               text not null check (estado in ('entregado', 'cancelado')),
  total                numeric(12,2) not null,
  total_sin_descuento  numeric(12,2) not null,
  iva                  numeric(12,2) not null default 0,
  productos            integer not null default 0,
  promocion            text,
  cliente_id           text,
  cliente_pedidos      integer,
  turno_dodo           text,
  agregador            text,
  inicio_coccion       timestamptz,
  listo                timestamptz,
  entregado            timestamptz,
  importacion_id       uuid not null references importaciones_ventas(id)
);
create index pedidos_sucursal_fecha on pedidos (sucursal_id, fecha);

create table pedido_productos (
  pedido_id             text not null references pedidos(dodo_id) on delete cascade,
  renglon               integer not null,
  dodo_uuid             text not null,
  dodo_id               integer not null references productos_venta(dodo_id),
  nombre                text not null,
  precio                numeric(12,2) not null,
  precio_sin_descuento  numeric(12,2) not null,
  costo_dodo            numeric(12,4),
  combo                 text,
  primary key (pedido_id, renglon)
);

alter table pedidos enable row level security;
alter table pedido_productos enable row level security;
create policy ver_pedidos on pedidos for select using (ve_ventas(sucursal_id));
create policy ver_pedido_productos on pedido_productos for select
  using (exists (select 1 from pedidos p where p.dodo_id = pedido_id and ve_ventas(p.sucursal_id)));

-- Guarda todo un archivo de Datos brutos en una transacción. p_dias, p_pedidos y p_productos vienen de la app:
--   p_dias:      [{sucursal_id, fecha, resumen: {pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, suma_productos, productos}, desglose: [...]}]
--   p_pedidos:   [{dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, origen_dodo, para_llevar, estado, total,
--                  total_sin_descuento, iva, productos, promocion, cliente_id, cliente_pedidos, turno_dodo, agregador,
--                  inicio_coccion, listo, entregado}]
--   p_productos: [{pedido_id, renglon, dodo_uuid, nombre, tamano, precio, precio_sin_descuento, costo_dodo, combo}]
-- Con p_reemplazar, cada día que ya existía se borra completo (ventas, desglose, productos, pedidos) y se vuelve a
-- insertar; la bitácora conserva el total anterior. Devuelve cuántos días se guardaron.
create or replace function importar_datos_brutos(
  p_archivo text, p_dias jsonb, p_pedidos jsonb, p_productos jsonb, p_reemplazar boolean
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  d jsonb;
  v_suc uuid;
  v_fecha date;
  v_previa ventas_dia;
  v_imp uuid;
  v_dia uuid;
  v_repetidos text;
  v_n integer := 0;
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador importa ventas.'; end if;
  if jsonb_typeof(p_dias) is distinct from 'array' or jsonb_array_length(p_dias) = 0 then raise exception 'El archivo no trae pedidos.'; end if;
  if jsonb_typeof(p_pedidos) is distinct from 'array' or jsonb_typeof(p_productos) is distinct from 'array' then
    raise exception 'Faltan los pedidos o sus productos.';
  end if;

  -- Dos importaciones del mismo día y sucursal no corren a la vez.
  for d in select * from jsonb_array_elements(p_dias) loop
    perform pg_advisory_xact_lock(hashtext((d->>'sucursal_id') || (d->>'fecha')));
  end loop;

  select string_agg(v.fecha::text, ', ' order by v.fecha) into v_repetidos
    from ventas_dia v join jsonb_array_elements(p_dias) x
      on v.sucursal_id = (x->>'sucursal_id')::uuid and v.fecha = (x->>'fecha')::date;
  if v_repetidos is not null and not p_reemplazar then raise exception 'Estos días ya se importaron: %.', v_repetidos; end if;

  -- Catálogo: primero por código; si no, por nombre entre los que aún no tienen código; si no, producto nuevo.
  update productos_venta pv set dodo_uuid = x.dodo_uuid
    from (select distinct on (x->>'dodo_uuid') x->>'dodo_uuid' as dodo_uuid, x->>'nombre' as nombre
            from jsonb_array_elements(p_productos) x) x
   where pv.dodo_uuid is null
     and pv.dodo_id = (select min(p2.dodo_id) from productos_venta p2
                        where p2.dodo_uuid is null and lower(p2.nombre) = lower(x.nombre))
     and not exists (select 1 from productos_venta p3 where p3.dodo_uuid = x.dodo_uuid);
  insert into productos_venta (dodo_id, nombre, tamano, dodo_uuid)
  select nextval('productos_venta_interno'), x.nombre, x.tamano, x.dodo_uuid
    from (select distinct on (x->>'dodo_uuid') x->>'dodo_uuid' as dodo_uuid, x->>'nombre' as nombre, nullif(x->>'tamano', '') as tamano
            from jsonb_array_elements(p_productos) x) x
   where not exists (select 1 from productos_venta pv where pv.dodo_uuid = x.dodo_uuid);

  for d in select * from jsonb_array_elements(p_dias) loop
    v_suc := (d->>'sucursal_id')::uuid;
    v_fecha := (d->>'fecha')::date;
    if not exists (select 1 from sucursales where id = v_suc) then raise exception 'La sucursal no existe.'; end if;

    select * into v_previa from ventas_dia where sucursal_id = v_suc and fecha = v_fecha;
    insert into importaciones_ventas (sucursal_id, fecha, archivo_ventas, archivo_productos, total, suma_productos, productos,
                                      pedidos, formato, reemplaza_id, total_anterior, importado_por)
    values (v_suc, v_fecha, coalesce(p_archivo, ''), null, (d->'resumen'->>'total')::numeric,
            coalesce((d->'resumen'->>'suma_productos')::numeric, 0), coalesce((d->'resumen'->>'productos')::integer, 0),
            (d->'resumen'->>'pedidos')::integer, 'datos_brutos', v_previa.importacion_id, v_previa.total, auth.uid())
    returning id into v_imp;

    delete from ventas_producto where sucursal_id = v_suc and fecha = v_fecha;
    delete from ventas_dia where sucursal_id = v_suc and fecha = v_fecha;   -- el desglose se va en cascada
    delete from pedidos where sucursal_id = v_suc and fecha = v_fecha;      -- sus productos se van en cascada

    insert into ventas_dia (sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, importacion_id)
    values (v_suc, v_fecha, (d->'resumen'->>'pedidos')::integer, (d->'resumen'->>'total')::numeric,
            (d->'resumen'->>'efectivo')::numeric, (d->'resumen'->>'tarjeta')::numeric, (d->'resumen'->>'en_linea')::numeric,
            (d->'resumen'->>'iva')::numeric, (d->'resumen'->>'venta_m2')::numeric, v_imp)
    returning id into v_dia;

    insert into ventas_dia_desglose (ventas_dia_id, tipo, pedidos, total, efectivo, tarjeta, en_linea, iva)
    select v_dia, x->>'tipo', (x->>'pedidos')::integer, (x->>'total')::numeric, (x->>'efectivo')::numeric,
           (x->>'tarjeta')::numeric, (x->>'en_linea')::numeric, (x->>'iva')::numeric
      from jsonb_array_elements(coalesce(d->'desglose', '[]'::jsonb)) x;

    insert into pedidos (dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, origen_dodo, para_llevar, estado, total,
                         total_sin_descuento, iva, productos, promocion, cliente_id, cliente_pedidos, turno_dodo, agregador,
                         inicio_coccion, listo, entregado, importacion_id)
    select x->>'dodo_id', v_suc, v_fecha, (x->>'hora')::time, x->>'pago', x->>'tipo', x->>'origen', x->>'origen_dodo',
           coalesce((x->>'para_llevar')::boolean, false), x->>'estado', (x->>'total')::numeric,
           (x->>'total_sin_descuento')::numeric, coalesce((x->>'iva')::numeric, 0), coalesce((x->>'productos')::integer, 0),
           x->>'promocion', x->>'cliente_id', (x->>'cliente_pedidos')::integer, x->>'turno_dodo', x->>'agregador',
           (x->>'inicio_coccion')::timestamptz, (x->>'listo')::timestamptz, (x->>'entregado')::timestamptz, v_imp
      from jsonb_array_elements(p_pedidos) x
     where (x->>'sucursal_id')::uuid = v_suc and (x->>'fecha')::date = v_fecha;

    insert into pedido_productos (pedido_id, renglon, dodo_uuid, dodo_id, nombre, precio, precio_sin_descuento, costo_dodo, combo)
    select x->>'pedido_id', (x->>'renglon')::integer, x->>'dodo_uuid', pv.dodo_id, x->>'nombre', (x->>'precio')::numeric,
           (x->>'precio_sin_descuento')::numeric, (x->>'costo_dodo')::numeric, x->>'combo'
      from jsonb_array_elements(p_productos) x
      join pedidos p on p.dodo_id = x->>'pedido_id' and p.sucursal_id = v_suc and p.fecha = v_fecha
      join productos_venta pv on pv.dodo_uuid = x->>'dodo_uuid';

    -- Cada renglón de OrderPositions es una pieza. Solo cuentan los pedidos que son venta.
    insert into ventas_producto (sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento)
    select v_suc, v_fecha, pp.dodo_id, min(pp.nombre), count(*), sum(pp.precio), sum(pp.precio_sin_descuento)
      from pedido_productos pp join pedidos p on p.dodo_id = pp.pedido_id
     where p.sucursal_id = v_suc and p.fecha = v_fecha and p.estado = 'entregado' and p.tipo <> 'personal'
     group by pp.dodo_id;

    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
