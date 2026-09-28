-- Ventas y costos importados de Dodo IS, mientras la API no está disponible.
-- Requiere 0001–0005. Solo el admin importa y maneja el catálogo de costos.
-- Ven ventas: admin y corporativo todas las sucursales; gerente la suya. Encargado y cajero no.
-- El rol se compara como texto (mi_rol()::text), igual que desde 0004.

create type categoria_producto as enum ('pizza', 'snack', 'postre', 'bebida', 'otro');

-- ─── Catálogo de productos de Dodo IS (igual para todas las sucursales) ─────
create table productos_venta (
  dodo_id    integer primary key,
  nombre     text not null,
  categoria  categoria_producto,          -- null = sin categoría todavía
  tamano     text check (tamano in ('pequeno', 'mediano', 'grande')),
  creado_en  timestamptz not null default now()
);

create table costos_producto (
  id              uuid primary key default gen_random_uuid(),
  dodo_id         integer not null references productos_venta(dodo_id),
  costo           numeric(10,2) not null check (costo >= 0),
  vigente_desde   date not null,
  fuente          text,
  nota            text,                    -- p. ej. "Dudoso en el modelo: …"; la pantalla de costos la señala
  registrado_por  uuid references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  unique (dodo_id, vigente_desde)
);

-- ─── Lo importado por día y sucursal ─────────────────────────────────────────
create table importaciones_ventas (
  id                 uuid primary key default gen_random_uuid(),
  sucursal_id        uuid not null references sucursales(id),
  fecha              date not null,
  archivo_ventas     text not null,
  archivo_productos  text not null,
  total              numeric(12,2) not null,
  suma_productos     numeric(12,2) not null,
  productos          integer not null,
  reemplaza_id       uuid references importaciones_ventas(id),
  total_anterior     numeric(12,2),
  importado_por      uuid not null references perfiles(id),
  importado_en       timestamptz not null default now()
);

create table ventas_dia (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  fecha           date not null,
  pedidos         integer not null default 0 check (pedidos >= 0),
  total           numeric(12,2) not null default 0,
  efectivo        numeric(12,2) not null default 0,
  tarjeta         numeric(12,2) not null default 0,
  en_linea        numeric(12,2) not null default 0,
  iva             numeric(12,2) not null default 0,
  venta_m2        numeric(10,2),
  importacion_id  uuid not null references importaciones_ventas(id),
  unique (sucursal_id, fecha)
);
create index ventas_dia_fecha on ventas_dia (fecha);

create table ventas_dia_desglose (
  ventas_dia_id  uuid not null references ventas_dia(id) on delete cascade,
  tipo           text not null check (tipo in ('entrega', 'llevadera', 'restaurante', 'centro_llamadas', 'sitio', 'app', 'agregador')),
  pedidos        integer not null default 0,
  total          numeric(12,2) not null default 0,
  efectivo       numeric(12,2) not null default 0,
  tarjeta        numeric(12,2) not null default 0,
  en_linea       numeric(12,2) not null default 0,
  iva            numeric(12,2) not null default 0,
  primary key (ventas_dia_id, tipo)
);

create table ventas_producto (
  sucursal_id            uuid not null references sucursales(id),
  fecha                  date not null,
  dodo_id                integer not null references productos_venta(dodo_id),
  nombre                 text not null,        -- como vino en el reporte
  cantidad               numeric(10,2) not null,
  importe                numeric(12,2) not null,
  importe_sin_descuento  numeric(12,2) not null,
  primary key (sucursal_id, fecha, dodo_id)
);
create index ventas_producto_fecha on ventas_producto (fecha);


-- ─── Lectura ────────────────────────────────────────────────────────────────
create or replace function ve_ventas(p_sucursal uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((p_sucursal = mi_sucursal() and mi_rol()::text in ('gerente', 'admin')) or ve_todas_las_sucursales(), false)
$$;

create or replace function ve_catalogo_ventas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text in ('gerente', 'admin', 'corporativo'), false)
$$;

alter table productos_venta      enable row level security;
alter table costos_producto      enable row level security;
alter table importaciones_ventas enable row level security;
alter table ventas_dia           enable row level security;
alter table ventas_dia_desglose  enable row level security;
alter table ventas_producto      enable row level security;

create policy ver_productos_venta on productos_venta for select using (ve_catalogo_ventas());
create policy ver_costos_producto on costos_producto for select using (ve_catalogo_ventas());
create policy ver_importaciones on importaciones_ventas for select using (ve_ventas(sucursal_id));
create policy ver_ventas_dia on ventas_dia for select using (ve_ventas(sucursal_id));
create policy ver_ventas_desglose on ventas_dia_desglose for select
  using (exists (select 1 from ventas_dia v where v.id = ventas_dia_id and ve_ventas(v.sucursal_id)));
create policy ver_ventas_producto on ventas_producto for select using (ve_ventas(sucursal_id));

-- ─── Escritura: costos por insert (solo admin); lo demás, por funciones ─────
create policy registrar_costo on costos_producto for insert
  with check (mi_rol()::text = 'admin' and registrado_por = auth.uid());

-- Costo con el vigente_desde más reciente que no pasa de la fecha. Respeta RLS (no es security definer).
create or replace function costo_vigente(p_dodo_id integer, p_fecha date) returns numeric
language sql stable set search_path = public as $$
  select costo from costos_producto
   where dodo_id = p_dodo_id and vigente_desde <= p_fecha
   order by vigente_desde desc limit 1
$$;

create or replace function asignar_categoria(p_dodo_id integer, p_categoria categoria_producto) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador asigna categorías.'; end if;
  update productos_venta set categoria = p_categoria where dodo_id = p_dodo_id;
  if not found then raise exception 'Producto no encontrado.'; end if;
end $$;

-- Guarda un día de una sucursal. Con p_reemplazar borra el día y lo vuelve a insertar
-- (única excepción a "nada se borra"; la bitácora conserva el total anterior).
create or replace function importar_ventas_dia(
  p_sucursal uuid, p_fecha date, p_resumen jsonb, p_desglose jsonb, p_productos jsonb, p_archivos jsonb, p_reemplazar boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_previa ventas_dia;
  v_imp uuid;
  v_dia uuid;
  v_suma numeric(12,2);
  v_n integer;
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador importa ventas.'; end if;
  if not exists (select 1 from sucursales where id = p_sucursal) then raise exception 'La sucursal no existe.'; end if;
  if jsonb_typeof(p_productos) is distinct from 'array' then raise exception 'Faltan los productos del día.'; end if;

  -- Dos importaciones del mismo día y sucursal no corren a la vez.
  perform pg_advisory_xact_lock(hashtext(p_sucursal::text || p_fecha::text));
  select * into v_previa from ventas_dia where sucursal_id = p_sucursal and fecha = p_fecha;
  if v_previa.id is not null and not p_reemplazar then raise exception 'Ese día ya se importó.'; end if;

  select coalesce(sum((x->>'importe')::numeric), 0), count(*) into v_suma, v_n from jsonb_array_elements(p_productos) x;

  insert into importaciones_ventas (sucursal_id, fecha, archivo_ventas, archivo_productos, total, suma_productos,
                                    productos, reemplaza_id, total_anterior, importado_por)
  values (p_sucursal, p_fecha, coalesce(p_archivos->>'ventas', ''), coalesce(p_archivos->>'productos', ''),
          (p_resumen->>'total')::numeric, v_suma, v_n, v_previa.importacion_id, v_previa.total, auth.uid())
  returning id into v_imp;

  if v_previa.id is not null then
    delete from ventas_producto where sucursal_id = p_sucursal and fecha = p_fecha;
    delete from ventas_dia where id = v_previa.id;   -- el desglose se va en cascada
  end if;

  -- Productos nuevos entran al catálogo sin categoría; los que ya existen conservan su nombre.
  insert into productos_venta (dodo_id, nombre, tamano)
  select (x->>'dodo_id')::integer, x->>'nombre', nullif(x->>'tamano', '')
    from jsonb_array_elements(p_productos) x
  on conflict (dodo_id) do nothing;

  insert into ventas_dia (sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, importacion_id)
  values (p_sucursal, p_fecha, (p_resumen->>'pedidos')::integer, (p_resumen->>'total')::numeric,
          (p_resumen->>'efectivo')::numeric, (p_resumen->>'tarjeta')::numeric, (p_resumen->>'en_linea')::numeric,
          (p_resumen->>'iva')::numeric, (p_resumen->>'venta_m2')::numeric, v_imp)
  returning id into v_dia;

  insert into ventas_dia_desglose (ventas_dia_id, tipo, pedidos, total, efectivo, tarjeta, en_linea, iva)
  select v_dia, x->>'tipo', (x->>'pedidos')::integer, (x->>'total')::numeric, (x->>'efectivo')::numeric,
         (x->>'tarjeta')::numeric, (x->>'en_linea')::numeric, (x->>'iva')::numeric
    from jsonb_array_elements(coalesce(p_desglose, '[]'::jsonb)) x;

  insert into ventas_producto (sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento)
  select p_sucursal, p_fecha, (x->>'dodo_id')::integer, x->>'nombre', (x->>'cantidad')::numeric,
         (x->>'importe')::numeric, (x->>'importe_sin_descuento')::numeric
    from jsonb_array_elements(p_productos) x;

  return v_imp;
end $$;

-- Cada producto vendido con su categoría, costo vigente, costo teórico e importe neto (sin IVA, prorrateado).
create view ventas_producto_costeo with (security_invoker = true) as
select vp.sucursal_id, vp.fecha, vp.dodo_id, vp.nombre, p.categoria, p.tamano,
       vp.cantidad, vp.importe, vp.importe_sin_descuento,
       coalesce(vp.importe * (vd.total - vd.iva) / nullif(vd.total, 0), vp.importe) as importe_neto,
       c.costo as costo_unitario,
       round(vp.cantidad * c.costo, 2) as costo_teorico
  from ventas_producto vp
  join productos_venta p on p.dodo_id = vp.dodo_id
  left join ventas_dia vd on vd.sucursal_id = vp.sucursal_id and vd.fecha = vp.fecha
  left join lateral (select costo_vigente(vp.dodo_id, vp.fecha) as costo) c on true;
