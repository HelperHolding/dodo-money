-- Pedidos y productos por pedido, importados de "Datos brutos" de Dodo IS (y después de su API).
-- Requiere 0006. Solo el admin importa; se leen igual que el resto de Ventas (ve_ventas).

alter table sucursales add column if not exists m2_comedor numeric(8,2) check (m2_comedor > 0);

alter table importaciones_ventas
  add column if not exists formato text not null default 'ventas_productos'
    check (formato in ('ventas_productos', 'datos_brutos')),
  add column if not exists pedidos integer,
  alter column archivo_productos drop not null;

-- Datos brutos identifica cada producto con un código de Dodo IS (ProductUUId), no con el número de ProductsSales.
-- Un mismo nombre puede traer varios códigos (Dodo IS separa la versión normal y la "T" pero Datos brutos no dice
-- cuál es cuál), así que todos los códigos de un nombre se ligan al mismo producto del catálogo.
create table productos_codigos (
  dodo_uuid  text primary key,
  dodo_id    integer not null references productos_venta(dodo_id),
  creado_en  timestamptz not null default now()
);
alter table productos_codigos enable row level security;
create policy ver_productos_codigos on productos_codigos for select using (ve_catalogo_ventas());

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
-- Los pedidos y productos se desempacan una sola vez en tablas temporales con índice: un archivo de muchos días no
-- recorre todo el JSON una vez por día.
create or replace function importar_datos_brutos(
  p_archivo text, p_dias jsonb, p_pedidos jsonb, p_productos jsonb, p_reemplazar boolean
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  d record;
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

  drop table if exists tmp_dias, tmp_pedidos, tmp_productos;
  create temp table tmp_dias on commit drop as
    select (x->>'sucursal_id')::uuid as sucursal_id, (x->>'fecha')::date as fecha, x->'resumen' as resumen,
           coalesce(x->'desglose', '[]'::jsonb) as desglose
      from jsonb_array_elements(p_dias) x;
  create temp table tmp_pedidos on commit drop as
    select * from jsonb_to_recordset(p_pedidos) as x(
      dodo_id text, sucursal_id uuid, fecha date, hora time, pago text, tipo text, origen text, origen_dodo text,
      para_llevar boolean, estado text, total numeric, total_sin_descuento numeric, iva numeric, productos integer,
      promocion text, cliente_id text, cliente_pedidos integer, turno_dodo text, agregador text,
      inicio_coccion timestamptz, listo timestamptz, entregado timestamptz);
  create index on tmp_pedidos (sucursal_id, fecha);
  create temp table tmp_productos on commit drop as
    select * from jsonb_to_recordset(p_productos) as x(
      pedido_id text, renglon integer, dodo_uuid text, nombre text, tamano text, precio numeric,
      precio_sin_descuento numeric, costo_dodo numeric, combo text);
  create index on tmp_productos (pedido_id);

  -- Dos importaciones del mismo día y sucursal no corren a la vez. Siempre en el mismo orden, para no trabarse entre sí.
  perform pg_advisory_xact_lock(hashtext(t.sucursal_id::text || t.fecha::text))
     from (select sucursal_id, fecha from tmp_dias order by sucursal_id, fecha) t;

  select string_agg(v.fecha::text, ', ' order by v.fecha) into v_repetidos
    from ventas_dia v join tmp_dias t on v.sucursal_id = t.sucursal_id and v.fecha = t.fecha;
  if v_repetidos is not null and not p_reemplazar then raise exception 'Estos días ya se importaron: %.', v_repetidos; end if;

  -- Catálogo. 1) Códigos nuevos de un nombre que ya existe: se ligan a ese producto (el de menor número si se repite).
  insert into productos_codigos (dodo_uuid, dodo_id)
  select x.dodo_uuid, (select min(pv.dodo_id) from productos_venta pv where lower(pv.nombre) = lower(x.nombre))
    from (select distinct on (dodo_uuid) dodo_uuid, nombre from tmp_productos order by dodo_uuid, nombre) x
   where not exists (select 1 from productos_codigos c where c.dodo_uuid = x.dodo_uuid)
     and exists (select 1 from productos_venta pv where lower(pv.nombre) = lower(x.nombre));
  -- 2) Nombres que no existen: un producto nuevo por nombre (aunque traiga varios códigos), sin categoría.
  insert into productos_venta (dodo_id, nombre, tamano)
  select nextval('productos_venta_interno'), x.nombre, nullif(x.tamano, '')
    from (select distinct on (lower(t.nombre)) t.nombre, t.tamano
            from tmp_productos t
           where not exists (select 1 from productos_codigos c where c.dodo_uuid = t.dodo_uuid)
           order by lower(t.nombre), t.nombre) x;
  -- 3) Y sus códigos.
  insert into productos_codigos (dodo_uuid, dodo_id)
  select x.dodo_uuid, (select min(pv.dodo_id) from productos_venta pv where lower(pv.nombre) = lower(x.nombre))
    from (select distinct on (dodo_uuid) dodo_uuid, nombre from tmp_productos order by dodo_uuid, nombre) x
   where not exists (select 1 from productos_codigos c where c.dodo_uuid = x.dodo_uuid);

  for d in select * from tmp_dias order by sucursal_id, fecha loop
    if not exists (select 1 from sucursales where id = d.sucursal_id) then raise exception 'La sucursal no existe.'; end if;

    select * into v_previa from ventas_dia where sucursal_id = d.sucursal_id and fecha = d.fecha;
    insert into importaciones_ventas (sucursal_id, fecha, archivo_ventas, archivo_productos, total, suma_productos, productos,
                                      pedidos, formato, reemplaza_id, total_anterior, importado_por)
    values (d.sucursal_id, d.fecha, coalesce(p_archivo, ''), null, (d.resumen->>'total')::numeric,
            coalesce((d.resumen->>'suma_productos')::numeric, 0), coalesce((d.resumen->>'productos')::integer, 0),
            (d.resumen->>'pedidos')::integer, 'datos_brutos', v_previa.importacion_id, v_previa.total, auth.uid())
    returning id into v_imp;

    delete from ventas_producto where sucursal_id = d.sucursal_id and fecha = d.fecha;
    delete from ventas_dia where sucursal_id = d.sucursal_id and fecha = d.fecha;   -- el desglose se va en cascada
    delete from pedidos where sucursal_id = d.sucursal_id and fecha = d.fecha;      -- sus productos se van en cascada

    insert into ventas_dia (sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, importacion_id)
    values (d.sucursal_id, d.fecha, (d.resumen->>'pedidos')::integer, (d.resumen->>'total')::numeric,
            (d.resumen->>'efectivo')::numeric, (d.resumen->>'tarjeta')::numeric, (d.resumen->>'en_linea')::numeric,
            (d.resumen->>'iva')::numeric, (d.resumen->>'venta_m2')::numeric, v_imp)
    returning id into v_dia;

    insert into ventas_dia_desglose (ventas_dia_id, tipo, pedidos, total, efectivo, tarjeta, en_linea, iva)
    select v_dia, x->>'tipo', (x->>'pedidos')::integer, (x->>'total')::numeric, (x->>'efectivo')::numeric,
           (x->>'tarjeta')::numeric, (x->>'en_linea')::numeric, (x->>'iva')::numeric
      from jsonb_array_elements(d.desglose) x;

    insert into pedidos (dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, origen_dodo, para_llevar, estado, total,
                         total_sin_descuento, iva, productos, promocion, cliente_id, cliente_pedidos, turno_dodo, agregador,
                         inicio_coccion, listo, entregado, importacion_id)
    select dodo_id, d.sucursal_id, d.fecha, hora, pago, tipo, origen, origen_dodo, coalesce(para_llevar, false), estado, total,
           total_sin_descuento, coalesce(iva, 0), coalesce(productos, 0), promocion, cliente_id, cliente_pedidos, turno_dodo,
           agregador, inicio_coccion, listo, entregado, v_imp
      from tmp_pedidos where sucursal_id = d.sucursal_id and fecha = d.fecha;

    insert into pedido_productos (pedido_id, renglon, dodo_uuid, dodo_id, nombre, precio, precio_sin_descuento, costo_dodo, combo)
    select t.pedido_id, t.renglon, t.dodo_uuid, c.dodo_id, t.nombre, t.precio, t.precio_sin_descuento, t.costo_dodo, t.combo
      from tmp_productos t
      join tmp_pedidos p on p.dodo_id = t.pedido_id and p.sucursal_id = d.sucursal_id and p.fecha = d.fecha
      join productos_codigos c on c.dodo_uuid = t.dodo_uuid;

    -- Cada renglón de OrderPositions es una pieza. Solo cuentan los pedidos que son venta.
    insert into ventas_producto (sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento)
    select d.sucursal_id, d.fecha, pp.dodo_id, min(pp.nombre), count(*), sum(pp.precio), sum(pp.precio_sin_descuento)
      from pedido_productos pp join pedidos p on p.dodo_id = pp.pedido_id
     where p.sucursal_id = d.sucursal_id and p.fecha = d.fecha and p.estado = 'entregado' and p.tipo <> 'personal'
     group by pp.dodo_id;

    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
