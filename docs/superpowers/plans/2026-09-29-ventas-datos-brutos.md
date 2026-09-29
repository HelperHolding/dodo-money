# Ventas con Datos brutos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin importa un archivo "Datos brutos" de Dodo IS (cualquier periodo y sucursales), la app guarda cada pedido y producto, sigue llenando la venta diaria de siempre y muestra cinco reportes nuevos: venta por hora, canales, personal y cancelados, tiempos de cocina y combos.

**Architecture:** El lector de `.xlsx` propio ahora lee todas las hojas; `lib/ventas/datosBrutos.ts` convierte `RawData` y `OrderPositions` en pedidos normalizados, y `lib/ventas/pedidos.ts` calcula el resumen por día (con IVA por producto) y los reportes. La server action arma la carga y la función `importar_datos_brutos` (security definer, solo admin) guarda todo el archivo en una transacción: pedidos, productos, venta del día, desglose y venta por producto, con empate al catálogo por código o nombre. La API de Dodo IS, en un diseño aparte, llenará las mismas tablas.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, TypeScript estricto, Supabase (Postgres + RLS), pruebas con `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-09-29-ventas-datos-brutos-design.md`

## Global Constraints

- Sin dependencias nuevas.
- Los módulos de `lib/` que se prueban con node solo importan de otros módulos locales con `import type`.
- **Venta** = `State = OnDelivery` y `Type ≠ PersonalFood`. Cancelados (`Failure`) y comidas del personal se guardan pero no son venta.
- **IVA** = Σ por producto de `round(precio × 16 / 116, 2)` (25/09 → $1,066.97).
- **Nombre del producto** = `Product` + " " + `ProductSize`, sin espacios repetidos.
- **Servicio:** `Delivery` → entrega; en tienda desde app o sitio → llevadera; en tienda desde mostrador, kiosco u otro → restaurante.
- **Origen:** `Restaurant` → mostrador, `Kiosk` → kiosco, `Mobile` → app, `Site` → sitio, otro → otro.
- **Combos:** un par (pedido, combo) distinto = un combo vendido.
- **Tiempos** solo de pedidos que son venta; lento = más de 15 min de cocina. **Cancelados en rojo** si pasan del 3 % de los pedidos.
- Horas del archivo son de Ciudad de México (UTC−6, sin horario de verano).
- **No se guardan nombres de clientes.** El archivo de prueba del repo va sin la columna `ClientName` ni sus textos.
- Un archivo: hasta 92 días y 4 MB.
- Permisos: importar solo admin; ver pedidos igual que el resto de Ventas (`ve_ventas`).
- Celular primero: plegables y tarjetas, sin scroll horizontal.
- Nada se publica en `main` hasta que Sebastián corra el SQL y vea `PRUEBAS OK`.

## Review Focus

1. **Archivo con una sucursal que no existe en la app** (o escrita distinto) → error con el nombre leído; si solo cambian mayúsculas o espacios, se encuentra. Revisión manual en la Tarea 3 (usa `buscarSucursal`, ya probado).
2. **Archivo grande** (92 días, varias sucursales): la carga a `importar_datos_brutos` puede pesar varios MB y tardar. El límite de 4 MB del archivo lo contiene; si Supabase rechaza el tamaño, el error llega al admin y se importa por semanas. Revisión manual en la Tarea 3.
3. **Días importados con el formato anterior** → Datos brutos los reemplaza completos (prueba SQL "reemplaza días del formato anterior", Tarea 1) y el tablero avisa cuántos días del periodo no tienen detalle (Tarea 4).
4. **Pedidos en $0** (promoción de entrenamiento, pedidos de prueba) → cuentan como venta igual que en Dodo IS y aparecen en los tiempos; no rompen tickets ni porcentajes (divisiones protegidas en `pedidos.ts`, Tarea 2).
5. **Producto con el mismo nombre que uno del catálogo pero otro código** → se empata una sola vez (el primero recibe el código); el otro entra como producto nuevo. Prueba SQL de empate (Tarea 1).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0007_datos_brutos.sql` | `pedidos`, `pedido_productos`, columnas nuevas, RLS, `importar_datos_brutos` |
| `supabase/pruebas/0007_datos_brutos.sql` | Pruebas de permisos, importación, catálogo, reemplazo |
| `lib/ventas/xlsx.ts` | + `leerHojas` (todas las hojas) |
| `lib/ventas/datosBrutos.ts` | Hojas → pedidos y productos normalizados, validaciones |
| `lib/ventas/pedidos.ts` | Resumen por día (venta, IVA, desglose, personal, cancelados) y los cinco reportes |
| `lib/ventas/__fixtures__/datos-brutos-2026-09-21.xlsx` | Datos brutos real del 21–28/09/2026 sin nombres de clientes |
| `app/ventas/importar/*` | Revisar y guardar Datos brutos |
| `app/ventas/datos.ts` | + `datosPedidos` |
| `components/MapaCalor.tsx` | Mapa de calor día × hora |
| `app/ventas/SeccionesPedidos.tsx` | Las cinco secciones nuevas del tablero |

---

### Task 1: Base de datos

**Files:**
- Create: `supabase/migrations/0007_datos_brutos.sql`, `supabase/pruebas/0007_datos_brutos.sql`

**Interfaces:**
- Produces: tablas `pedidos` y `pedido_productos` (columnas en la migración); `productos_venta.dodo_uuid`; `sucursales.m2_comedor`; `importaciones_ventas.formato` y `.pedidos`; `importar_datos_brutos(p_archivo text, p_dias jsonb, p_pedidos jsonb, p_productos jsonb, p_reemplazar boolean) returns integer` con los formatos JSON documentados en el comentario de la función. Errores: `Solo un administrador importa ventas.`, `Estos días ya se importaron: …`.

Nadie en esta sesión puede correr SQL en Supabase: Sebastián lo corre; la puerta `PRUEBAS OK` se cierra antes de fusionar (Tarea 5).

- [ ] **Step 1: Escribir la migración** — `supabase/migrations/0007_datos_brutos.sql`:

```sql
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
```

- [ ] **Step 2: Escribir las pruebas SQL** — `supabase/pruebas/0007_datos_brutos.sql`:

```sql
-- Pruebas de la migración 0007 (pedidos de Datos brutos). Córrelas completas en Supabase → SQL Editor,
-- después de 0007_datos_brutos.sql (y con 0006 y su seed ya cargados).
-- Necesitan dos usuarios activos con sucursal; sus roles cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc_a uuid; v_suc_b uuid;
  v_n int; v_num numeric; v_txt text; v_imp uuid;
  v_ok text[] := '{}';
  v_dias jsonb; v_pedidos jsonb; v_productos jsonb; v_dias_a jsonb; v_pedidos_a jsonb; v_productos_a jsonb;
begin
  select p.id, p.sucursal_id, o.id into v_a, v_suc_a, v_b
    from perfiles p join perfiles o on o.id <> p.id and o.activo and o.sucursal_id is not null
   where p.activo and p.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos con sucursal.'; end if;
  select id into v_suc_b from sucursales where id <> v_suc_a limit 1;
  if v_suc_b is null then insert into sucursales (nombre) values ('Prueba datos brutos') returning id into v_suc_b; end if;
  if not exists (select 1 from productos_venta where dodo_id = 27 and dodo_uuid is null) then
    raise exception 'FALTAN DATOS: se necesita la Margarita Mediano (27) del seed, sin código de Datos brutos.';
  end if;

  -- Un día (2000-01-02) de la sucursal B: una venta en efectivo con Margarita Mediano (existe) y un producto nuevo,
  -- una comida del personal y un cancelado.
  v_dias := jsonb_build_array(jsonb_build_object('sucursal_id', v_suc_b, 'fecha', '2000-01-02',
    'resumen', jsonb_build_object('pedidos', 1, 'total', 243.4, 'efectivo', 243.4, 'tarjeta', 0, 'en_linea', 0, 'iva', 33.57,
                                  'venta_m2', 4, 'suma_productos', 243.4, 'productos', 2),
    'desglose', jsonb_build_array(jsonb_build_object('tipo', 'restaurante', 'pedidos', 1, 'total', 243.4, 'efectivo', 243.4,
                                                     'tarjeta', 0, 'en_linea', 0, 'iva', 33.57))));
  v_pedidos := jsonb_build_array(
    jsonb_build_object('dodo_id', 'PRUEBA-VENTA', 'sucursal_id', v_suc_b, 'fecha', '2000-01-02', 'hora', '13:05', 'pago', 'efectivo',
      'tipo', 'en_tienda', 'origen', 'mostrador', 'origen_dodo', 'Restaurant', 'para_llevar', true, 'estado', 'entregado',
      'total', 243.4, 'total_sin_descuento', 269, 'iva', 33.57, 'productos', 2,
      'inicio_coccion', '2000-01-02T13:06:00-06:00', 'listo', '2000-01-02T13:17:00-06:00', 'entregado', '2000-01-02T13:18:00-06:00'),
    jsonb_build_object('dodo_id', 'PRUEBA-PERSONAL', 'sucursal_id', v_suc_b, 'fecha', '2000-01-02', 'hora', '15:00', 'pago', 'efectivo',
      'tipo', 'personal', 'origen', 'otro', 'origen_dodo', 'Pizzeria', 'para_llevar', false, 'estado', 'entregado',
      'total', 100, 'total_sin_descuento', 100, 'iva', 13.79, 'productos', 1),
    jsonb_build_object('dodo_id', 'PRUEBA-CANCELADO', 'sucursal_id', v_suc_b, 'fecha', '2000-01-02', 'hora', '16:00', 'pago', 'tarjeta',
      'tipo', 'en_tienda', 'origen', 'kiosco', 'origen_dodo', 'Kiosk', 'para_llevar', false, 'estado', 'cancelado',
      'total', 95, 'total_sin_descuento', 95, 'iva', 13.10, 'productos', 1));
  v_productos := jsonb_build_array(
    jsonb_build_object('pedido_id', 'PRUEBA-VENTA', 'renglon', 1, 'dodo_uuid', 'UUID-MARGARITA-M', 'nombre', 'margarita mediano',
      'tamano', 'mediano', 'precio', 143.4, 'precio_sin_descuento', 169, 'costo_dodo', 2280, 'combo', 'El de Siempre'),
    jsonb_build_object('pedido_id', 'PRUEBA-VENTA', 'renglon', 2, 'dodo_uuid', 'UUID-NUEVO', 'nombre', 'Prueba Nueva Grande',
      'tamano', 'grande', 'precio', 100, 'precio_sin_descuento', 100, 'combo', 'El de Siempre'),
    jsonb_build_object('pedido_id', 'PRUEBA-PERSONAL', 'renglon', 1, 'dodo_uuid', 'UUID-NUEVO', 'nombre', 'Prueba Nueva Grande',
      'tamano', 'grande', 'precio', 100, 'precio_sin_descuento', 100),
    jsonb_build_object('pedido_id', 'PRUEBA-CANCELADO', 'renglon', 1, 'dodo_uuid', 'UUID-MARGARITA-M', 'nombre', 'Margarita Mediano',
      'tamano', 'mediano', 'precio', 95, 'precio_sin_descuento', 95));
  -- El mismo día en la sucursal A, con un solo pedido.
  v_dias_a := jsonb_set(v_dias, '{0,sucursal_id}', to_jsonb(v_suc_a));
  v_pedidos_a := jsonb_build_array(jsonb_set(jsonb_set(v_pedidos->0, '{sucursal_id}', to_jsonb(v_suc_a)), '{dodo_id}', '"PRUEBA-A"'));
  v_productos_a := jsonb_build_array(
    jsonb_set(v_productos->0, '{pedido_id}', '"PRUEBA-A"'),
    jsonb_set(v_productos->1, '{pedido_id}', '"PRUEBA-A"'));

  -- ── Gerente: no importa ───────────────────────────────────────────────────
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform importar_datos_brutos('Datos brutos.xlsx', v_dias, v_pedidos, v_productos, false);
    raise exception 'FALLÓ: un gerente no debe importar Datos brutos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador importa%' then raise exception 'FALLÓ: mensaje inesperado (gerente importa): %', sqlerrm; end if;
  end;
  begin
    insert into pedidos (dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, estado, total, total_sin_descuento, importacion_id)
    values ('X', v_suc_a, '2000-01-02', '10:00', 'efectivo', 'en_tienda', 'mostrador', 'entregado', 1, 1, gen_random_uuid());
    raise exception 'FALLÓ: nadie inserta pedidos directamente';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (insert directo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'gerente no importa');

  -- ── Admin: importa ────────────────────────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_n := importar_datos_brutos('Datos brutos.xlsx', v_dias, v_pedidos, v_productos, false);
  if v_n <> 1 then raise exception 'FALLÓ: debe guardar 1 día (guardó %)', v_n; end if;
  select count(*) into v_n from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02' and total = 243.4 and pedidos = 1 and venta_m2 = 4;
  if v_n <> 1 then raise exception 'FALLÓ: la venta del día debe guardarse'; end if;
  select count(*) into v_n from ventas_dia_desglose d join ventas_dia v on v.id = d.ventas_dia_id where v.sucursal_id = v_suc_b and v.fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: el desglose debe guardarse (hay %)', v_n; end if;
  select count(*) into v_n from pedidos where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 3 then raise exception 'FALLÓ: deben guardarse los 3 pedidos (hay %)', v_n; end if;
  select count(*) into v_n from pedido_productos pp join pedidos p on p.dodo_id = pp.pedido_id where p.sucursal_id = v_suc_b;
  if v_n <> 4 then raise exception 'FALLÓ: deben guardarse los 4 productos de los pedidos (hay %)', v_n; end if;
  select formato || '|' || pedidos || '|' || coalesce(archivo_productos, 'null') into v_txt from importaciones_ventas
   where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_txt is distinct from 'datos_brutos|1|null' then raise exception 'FALLÓ: la bitácora debe decir datos_brutos, 1 pedido y sin archivo de productos (dice %)', v_txt; end if;
  v_ok := array_append(v_ok, 'admin importa pedidos, venta y bitácora');

  -- Catálogo: la Margarita (27) se empata por nombre sin distinguir mayúsculas y recibe su código; el nuevo entra con número interno.
  select dodo_uuid into v_txt from productos_venta where dodo_id = 27;
  if v_txt is distinct from 'UUID-MARGARITA-M' then raise exception 'FALLÓ: la Margarita Mediano debe recibir su código (tiene %)', v_txt; end if;
  select count(*) into v_n from productos_venta where dodo_uuid = 'UUID-NUEVO' and dodo_id >= 1000000 and categoria is null and tamano = 'grande';
  if v_n <> 1 then raise exception 'FALLÓ: el producto nuevo debe entrar con número interno, sin categoría y grande'; end if;
  select dodo_id into v_n from pedido_productos where pedido_id = 'PRUEBA-VENTA' and renglon = 1;
  if v_n <> 27 then raise exception 'FALLÓ: el producto del pedido debe apuntar a la Margarita (27), apunta a %', v_n; end if;
  v_ok := array_append(v_ok, 'empate con el catálogo');

  -- ventas_producto sale solo de los pedidos que son venta (ni personal ni cancelado).
  select count(*), sum(importe) into v_n, v_num from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 2 or v_num <> 243.4 then raise exception 'FALLÓ: ventas_producto debe traer 2 productos por $243.40 (trae % por %)', v_n, v_num; end if;
  select cantidad into v_num from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-02' and dodo_id = 27;
  if v_num <> 1 then raise exception 'FALLÓ: la Margarita debe contar 1 pieza (el cancelado no cuenta), cuenta %', v_num; end if;
  v_ok := array_append(v_ok, 'ventas_producto solo de pedidos con venta');

  -- Otra vez sin reemplazar: error con los días repetidos.
  begin
    perform importar_datos_brutos('Datos brutos.xlsx', v_dias, v_pedidos, v_productos, false);
    raise exception 'FALLÓ: no debe importar días ya importados sin reemplazar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Estos días ya se importaron: 2000-01-02%' then raise exception 'FALLÓ: mensaje inesperado (repetido): %', sqlerrm; end if;
  end;

  -- Reemplazar: solo queda el pedido de venta con otro total; el día se reemplaza completo y la bitácora guarda el total anterior.
  perform importar_datos_brutos('Datos brutos 2.xlsx',
    jsonb_set(v_dias, '{0,resumen,total}', '300'),
    jsonb_build_array(jsonb_set(v_pedidos->0, '{total}', '300')),
    jsonb_build_array(v_productos->0, v_productos->1), true);
  select count(*) into v_n from pedidos where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: reemplazar debe dejar solo los pedidos del archivo nuevo (hay %)', v_n; end if;
  select total into v_num from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_num <> 300 then raise exception 'FALLÓ: reemplazar debe cambiar el total del día (quedó %)', v_num; end if;
  select count(*) into v_n from importaciones_ventas where sucursal_id = v_suc_b and fecha = '2000-01-02' and total_anterior = 243.4 and reemplaza_id is not null;
  if v_n <> 1 then raise exception 'FALLÓ: la bitácora debe guardar el total anterior y a quién reemplazó'; end if;
  v_ok := array_append(v_ok, 'reimportar reemplaza el día completo');

  -- Un día importado con el formato anterior (0006) también se reemplaza con Datos brutos.
  perform importar_ventas_dia(v_suc_b, '2000-01-03', '{"pedidos": 1, "total": 50, "efectivo": 50, "tarjeta": 0, "en_linea": 0, "iva": 6.9}',
                              '[]', '[{"dodo_id": 27, "nombre": "Margarita Mediano", "tamano": "mediano", "cantidad": 1, "importe": 50, "importe_sin_descuento": 50}]',
                              '{"ventas": "Ventas.xlsx", "productos": "ProductsSales.xlsx"}', false);
  perform importar_datos_brutos('Datos brutos.xlsx',
    jsonb_set(v_dias, '{0,fecha}', '"2000-01-03"'),
    jsonb_build_array(jsonb_set(jsonb_set(v_pedidos->0, '{fecha}', '"2000-01-03"'), '{dodo_id}', '"PRUEBA-DIA3"')),
    jsonb_build_array(jsonb_set(v_productos->0, '{pedido_id}', '"PRUEBA-DIA3"')), true);
  select count(*) into v_n from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-03' and importe = 143.4;
  if v_n <> 1 then raise exception 'FALLÓ: el día del formato anterior debe quedar reemplazado por Datos brutos'; end if;
  v_ok := array_append(v_ok, 'reemplaza días del formato anterior');

  -- Día de la sucursal A, para probar qué ve el gerente.
  perform importar_datos_brutos('Datos brutos.xlsx', v_dias_a, v_pedidos_a, v_productos_a, false);

  -- ── Gerente: ve solo su sucursal ──────────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from pedidos where fecha between '2000-01-02' and '2000-01-03';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver solo los pedidos de su sucursal (ve %)', v_n; end if;
  select count(*) into v_n from pedido_productos where pedido_id like 'PRUEBA-%';
  if v_n <> 2 then raise exception 'FALLÓ: el gerente debe ver solo los productos de sus pedidos (ve %)', v_n; end if;
  v_ok := array_append(v_ok, 'gerente ve solo su sucursal');

  -- ── Encargado y cajero: no ven pedidos ───────────────────────────────────
  foreach v_txt in array array['encargado', 'cajero'] loop
    execute 'reset role';
    update perfiles set rol = v_txt::rol_usuario where id = v_a;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select (select count(*) from pedidos) + (select count(*) from pedido_productos) into v_n;
    if v_n <> 0 then raise exception 'FALLÓ: % no debe ver pedidos (ve %)', v_txt, v_n; end if;
  end loop;
  v_ok := array_append(v_ok, 'encargado y cajero no ven pedidos');

  -- ── Corporativo: ve todo, no importa ─────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(distinct sucursal_id) into v_n from pedidos where fecha = '2000-01-02';
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe ver pedidos de las dos sucursales (ve %)', v_n; end if;
  begin
    perform importar_datos_brutos('Datos brutos.xlsx', v_dias, v_pedidos, v_productos, true);
    raise exception 'FALLÓ: corporativo no debe importar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador importa%' then raise exception 'FALLÓ: mensaje inesperado (corporativo importa): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo ve todo y no importa');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_datos_brutos.sql supabase/pruebas/0007_datos_brutos.sql
git commit -m "Datos brutos: tablas de pedidos, importación y pruebas SQL"
```

---

### Task 2: Lectura del archivo y cálculos sobre pedidos

**Files:**
- Modify: `lib/ventas/xlsx.ts` (agrega `leerHojas`; `leerPrimeraHoja` la usa)
- Create: `lib/ventas/datosBrutos.ts`, `lib/ventas/pedidos.ts`, `lib/ventas/__fixtures__/datos-brutos-2026-09-21.xlsx`
- Test: `lib/ventas/datosBrutos.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `leerHojas(datos: Uint8Array): Hoja[]` (lanza `NO_ES_XLSX`)
  - `datosBrutos.ts`: tipos `Pago`, `TipoPedido`, `Origen`, `EstadoPedido`, `PedidoBruto`, `ProductoBruto`, `ArchivoBruto`; `extraerDatosBrutos(hojas): ArchivoBruto`; constantes `NO_ES_DATOS_BRUTOS`, `SIN_PEDIDOS`, `HOJAS_NO_COINCIDEN`, `MAX_DIAS_ARCHIVO`
  - `pedidos.ts`: tipos `Pedido`, `LineaPedido`, `DiaImportado`, `CeldaHora`, `Canal`, `ResumenCanal`; `cuentaComoVenta`, `ivaDe`, `tiposDesglose`, `resumirDias(pedidos, lineas): DiaImportado[]`, `DIAS_SEMANA`, `diaSemana`, `ventaPorHora`, `canales`, `personalYCancelados`, `tiempos`, `combos`; constantes `UMBRAL_CANCELADOS = 0.03`, `MINUTOS_LENTO = 15`

- [ ] **Step 1: Crear el archivo de prueba sin nombres de clientes**

Guarda este script fuera del repo (por ejemplo en el scratchpad) como `sanear.cjs`; copia el xlsx quitando las celdas de `ClientName` y los textos que solo ellas usaban:

```js
// Copia el xlsx de Datos brutos quitando los nombres de clientes (columna ClientName de RawData),
// también de la tabla de textos compartidos. Uso: node sanear.cjs origen.xlsx destino.xlsx
const fs = require("fs"), z = require("zlib");
const [, , origen, destino] = process.argv;
const b = fs.readFileSync(origen);
let e = b.length - 22; while (b.readUInt32LE(e) !== 0x06054b50) e--;
const n = b.readUInt16LE(e + 10); let p = b.readUInt32LE(e + 16);
const entradas = [];
for (let i = 0; i < n; i++) {
  const m = b.readUInt16LE(p + 10), cs = b.readUInt32LE(p + 20), nl = b.readUInt16LE(p + 28), xl = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), off = b.readUInt32LE(p + 42);
  const nombre = b.toString("utf8", p + 46, p + 46 + nl);
  const ln = b.readUInt16LE(off + 26), lx = b.readUInt16LE(off + 28);
  const crudo = b.subarray(off + 30 + ln + lx, off + 30 + ln + lx + cs);
  entradas.push({ nombre, datos: m === 8 ? z.inflateRawSync(crudo) : Buffer.from(crudo) });
  p += 46 + nl + xl + cl;
}
const texto = (nombre) => entradas.find((x) => x.nombre === nombre).datos.toString("utf8");
const textosSi = (xml) => [...xml.matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)]
  .map((m) => [...m[1].matchAll(/<(?:\w+:)?t[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((x) => x[1]).join(""));
const ss = textosSi(texto("xl/sharedStrings.xml"));

const libro = texto("xl/workbook.xml"), rels = texto("xl/_rels/workbook.xml.rels");
const hoja = [...libro.matchAll(/<(?:\w+:)?sheet\s[^>]*>/g)].map((m) => m[0]).find((h) => /name="RawData/.test(h));
const id = /r:id="([^"]*)"/.exec(hoja)[1];
const rel = [...rels.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${id}"`));
let ruta = /Target="([^"]*)"/.exec(rel)[1];
ruta = ruta.startsWith("/") ? ruta.slice(1) : "xl/" + ruta;
const entrada = entradas.find((x) => x.nombre === ruta);
let xml = entrada.datos.toString("utf8");

let col = null;
for (const m of xml.matchAll(/<(?:\w+:)?c r="([A-Z]+)1"[^>]*?t="s"[^>]*>\s*<(?:\w+:)?v>(\d+)<\/(?:\w+:)?v>/g)) if (ss[+m[2]] === "ClientName") col = m[1];
if (!col) throw new Error("No encontré ClientName");

let quitadas = 0; const quitarTextos = new Set();
const celda = new RegExp(String.raw`<(\w+:)?c r="${col}(\d+)"([^>]*?)(\/>|>[\s\S]*?<\/(\w+:)?c>)`, "g");
xml = xml.replace(celda, (todo, pre, fila) => {
  if (fila === "1") return todo;
  quitadas++;
  const v = /<(?:\w+:)?v>(\d+)</.exec(todo);
  if (v && /t="s"/.test(todo)) quitarTextos.add(+v[1]);
  return "";
});
entrada.datos = Buffer.from(xml, "utf8");

// Los textos que solo usaban las celdas quitadas se vacían.
const usados = new Set();
for (const x of entradas) {
  if (!/^xl\/worksheets\/.+\.xml$/.test(x.nombre)) continue;
  for (const m of x.datos.toString("utf8").matchAll(/<(?:\w+:)?c [^>]*t="s"[^>]*>\s*<(?:\w+:)?v>(\d+)</g)) usados.add(+m[1]);
}
const ssEntrada = entradas.find((x) => x.nombre === "xl/sharedStrings.xml");
let i = -1, vaciados = 0;
ssEntrada.datos = Buffer.from(ssEntrada.datos.toString("utf8").replace(/<((?:\w+:)?)si>[\s\S]*?<\/(?:\w+:)?si>/g, (todo, pre) => {
  i++;
  if (!quitarTextos.has(i) || usados.has(i)) return todo;
  vaciados++;
  return `<${pre}si><${pre}t></${pre}t></${pre}si>`;
}), "utf8");

// ZIP comprimido.
const partes = [], central = []; let desplazamiento = 0;
for (const x of entradas) {
  const nombre = Buffer.from(x.nombre, "utf8"), crc = z.crc32(x.datos) >>> 0, comp = z.deflateRawSync(x.datos, { level: 9 });
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(x.datos.length, 22); local.writeUInt16LE(nombre.length, 26);
  partes.push(local, nombre, comp);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
  c.writeUInt32LE(crc, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(x.datos.length, 24); c.writeUInt16LE(nombre.length, 28); c.writeUInt32LE(desplazamiento, 42);
  central.push(c, nombre);
  desplazamiento += 30 + nombre.length + comp.length;
}
const tamCentral = central.reduce((s, x) => s + x.length, 0);
const fin = Buffer.alloc(22);
fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10); fin.writeUInt32LE(tamCentral, 12); fin.writeUInt32LE(desplazamiento, 16);
fs.writeFileSync(destino, Buffer.concat([...partes, ...central, fin]));
console.log("columna", col, "celdas quitadas", quitadas, "textos vaciados", vaciados, "bytes", fs.statSync(destino).size);
```

```bash
node sanear.cjs "/c/Users/sebcm/Downloads/Datos brutos (2026-09-21 - 2026-09-29).xlsx" lib/ventas/__fixtures__/datos-brutos-2026-09-21.xlsx
```

Expected: `columna AL celdas quitadas 334 textos vaciados 192`.

- [ ] **Step 2: Escribir las pruebas** — `lib/ventas/datosBrutos.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerHojas, type Hoja } from "./xlsx.ts";
import { extraerDatosBrutos, HOJAS_NO_COINCIDEN, NO_ES_DATOS_BRUTOS, SIN_PEDIDOS } from "./datosBrutos.ts";
import { canales, combos, cuentaComoVenta, diaSemana, ivaDe, personalYCancelados, resumirDias, tiempos, tiposDesglose, ventaPorHora } from "./pedidos.ts";

const leer = (n: string) => leerHojas(readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url)));
const hojas = leer("datos-brutos-2026-09-21.xlsx");
const archivo = extraerDatosBrutos(hojas);
const { pedidos, productos } = archivo;

/** Copia de las hojas con celdas cambiadas o quitadas (valor null) en una hoja. */
function con(nombre: string, cambios: Record<string, string | null>): Hoja[] {
  return hojas.map((h) => {
    if (h.nombre.trim() !== nombre) return h;
    const celdas = new Map(h.celdas);
    for (const [ref, v] of Object.entries(cambios)) v === null ? celdas.delete(ref) : celdas.set(ref, v);
    return { nombre: h.nombre, celdas };
  });
}

test("leerHojas trae las dos hojas del archivo", () => {
  assert.deepEqual(hojas.map((h) => h.nombre.trim()), ["RawData", "OrderPositions"]);
});

test("el archivo de prueba no trae nombres de clientes", () => {
  const raw = hojas[0];
  const columna = [...raw.celdas].find(([, v]) => v === "ClientName")![0].replace("1", "");
  assert.equal([...raw.celdas.keys()].filter((r) => r.startsWith(columna) && r !== `${columna}1`).length, 0);
});

test("extraerDatosBrutos: 334 pedidos y 572 productos de Zapopan-1, del 21 al 28 de septiembre", () => {
  assert.equal(pedidos.length, 334);
  assert.equal(productos.length, 572);
  assert.deepEqual([...new Set(pedidos.map((p) => p.sucursal))], ["Zapopan-1"]);
  const fechas = [...new Set(pedidos.map((p) => p.fecha))].sort();
  assert.deepEqual([fechas[0], fechas.at(-1), fechas.length], ["2026-09-21", "2026-09-28", 8]);
});

test("un pedido normalizado", () => {
  const p = pedidos.find((x) => x.dodo_id === "11F1BBB253AC96FFAC9140E88E6966BF")!;
  assert.deepEqual(
    { ...p, cliente_id: undefined, turno_dodo: undefined },
    {
      dodo_id: "11F1BBB253AC96FFAC9140E88E6966BF", sucursal: "Zapopan-1", fecha: "2026-09-28", hora: "21:03",
      pago: "efectivo", tipo: "en_tienda", origen: "mostrador", origen_dodo: "Restaurant", para_llevar: true,
      estado: "entregado", total: 129, total_sin_descuento: 129, productos: 1, promocion: null,
      cliente_id: undefined, cliente_pedidos: null, turno_dodo: undefined, agregador: null,
      inicio_coccion: "2026-09-28T21:04:00-06:00", listo: "2026-09-28T21:10:00-06:00", entregado: "2026-09-28T21:10:00-06:00",
    },
  );
  const linea = productos.find((x) => x.pedido_id === p.dodo_id)!;
  assert.deepEqual(linea, {
    pedido_id: p.dodo_id, renglon: 1, dodo_uuid: "11F19997A22F8B4D9C579AF6B112B260", nombre: "Pepperoni Mediano",
    precio: 129, precio_sin_descuento: 129, costo_dodo: 2280, combo: null,
  });
});

test("nombres de producto como en ProductsSales", () => {
  const nombres = new Set(productos.map((x) => x.nombre));
  for (const n of ["Papas Gajo Medium", "Alitas Buffalo 10 uds", "Coca-Cola 0,6 L", "Dip Mango Habanero Dip", "Pepperoni Grande"]) assert.ok(nombres.has(n), n);
});

test("25/09 cuadra con los reportes Ventas y ProductsSales de Dodo IS", () => {
  const d = resumirDias(pedidos, productos).find((x) => x.fecha === "2026-09-25")!;
  assert.deepEqual(d.resumen, { pedidos: 39, total: 7736, efectivo: 4299, tarjeta: 3437, en_linea: 0, iva: 1066.97 });
  assert.deepEqual(d.desglose, [{ tipo: "restaurante", pedidos: 39, total: 7736, efectivo: 4299, tarjeta: 3437, en_linea: 0, iva: 1066.97 }]);
  assert.deepEqual(d.personal, { pedidos: 3, monto: 373 });
  assert.deepEqual(d.productos, { piezas: 64, suma: 7736 });
  const venta = new Set(pedidos.filter((p) => p.fecha === "2026-09-25" && cuentaComoVenta(p)).map((p) => p.dodo_id));
  const lineas = productos.filter((x) => venta.has(x.pedido_id));
  assert.equal(lineas.length, 64);
  assert.equal(lineas.reduce((s, x) => s + x.precio_sin_descuento, 0), 8832);
});

test("semana: comidas del personal y cancelados", () => {
  const dias = resumirDias(pedidos, productos);
  assert.equal(dias.length, 8);
  assert.equal(dias.reduce((s, d) => s + d.personal.pedidos, 0), 29);
  assert.equal(dias.reduce((s, d) => s + d.personal.monto, 0), 3681);
  assert.equal(dias.reduce((s, d) => s + d.cancelados.pedidos, 0), 9);
});

test("IVA por producto redondeado", () => {
  assert.equal(ivaDe([129, 95.5]), 30.96); // 17.79 + 13.17
  assert.equal(ivaDe([]), 0);
});

test("tiposDesglose: servicio y origen", () => {
  assert.deepEqual(tiposDesglose({ tipo: "entrega", origen: "app" }), ["entrega", "app"]);
  assert.deepEqual(tiposDesglose({ tipo: "en_tienda", origen: "sitio" }), ["llevadera", "sitio"]);
  assert.deepEqual(tiposDesglose({ tipo: "en_tienda", origen: "kiosco" }), ["restaurante"]);
  assert.deepEqual(tiposDesglose({ tipo: "en_tienda", origen: "mostrador", agregador: "Rappi" }), ["restaurante", "agregador"]);
});

test("venta por hora: la celda pico y el rango de horas", () => {
  const r = ventaPorHora(pedidos);
  assert.equal(r.horaMin, 11);
  assert.equal(r.horaMax, 22);
  assert.equal(r.celdas.reduce((s, c) => s + c.pedidos, 0), 296);
  assert.ok(r.pico && r.celdas.every((c) => c.total <= r.pico!.total));
  assert.equal(diaSemana("2026-09-28"), 1);
  assert.equal(diaSemana("2026-09-27"), 7);
});

test("canales de la semana", () => {
  const r = canales(pedidos);
  assert.deepEqual(r.canales.map((c) => c.canal).sort(), ["app", "entrega", "kiosco", "mostrador"]);
  assert.equal(r.canales.reduce((s, c) => s + c.pedidos, 0), 296);
  assert.ok(r.paraLlevar! > 0 && r.paraLlevar! < 1);
});

test("personal y cancelados de la semana", () => {
  const r = personalYCancelados(pedidos, productos);
  assert.equal(r.personal.pedidos, 29);
  assert.equal(r.personal.monto, 3681);
  assert.equal(r.cancelados.pedidos, 9);
  assert.equal(r.cancelados.lista.length, 9);
  assert.ok(r.cancelados.lista.every((c) => c.productos.length > 0));
  assert.equal(r.alerta, 9 / 334 > 0.03);
});

test("tiempos de cocina y entrega de la semana", () => {
  const r = tiempos(pedidos);
  assert.equal(r.medianaCocina, 11);
  assert.equal(r.medianaEntrega, 13);
  assert.equal(r.lentos, 56);
  assert.equal(r.sinTiempo, 0);
  assert.equal(r.masLentos.length, 5);
  assert.ok(r.masLentos[0].minutos >= r.masLentos[4].minutos);
});

test("combos vendidos en pedidos con venta", () => {
  const r = combos(pedidos, productos);
  assert.deepEqual(r.map((c) => [c.combo, c.vendidos, c.productos]), [
    ["El de Siempre", 8, 16], ["Solo Dodo", 7, 14], ["Trío Ganador", 4, 12], ["Supremo", 3, 6], ["Especial del Antojo", 1, 3],
  ]);
});

test("archivo equivocado o incompleto", () => {
  assert.throws(() => extraerDatosBrutos(leer("ventas-2026-09-25.xlsx")), { message: NO_ES_DATOS_BRUTOS });
  assert.throws(() => extraerDatosBrutos([hojas[0]]), { message: NO_ES_DATOS_BRUTOS });
  const sinEncabezado = con("RawData", { A1: null });
  assert.throws(() => extraerDatosBrutos(sinEncabezado), { message: NO_ES_DATOS_BRUTOS });
});

test("archivo sin pedidos", () => {
  const raw = hojas[0];
  const soloEncabezado: Hoja = { nombre: raw.nombre, celdas: new Map([...raw.celdas].filter(([r]) => /^[A-Z]+1$/.test(r))) };
  assert.throws(() => extraerDatosBrutos([soloEncabezado, hojas[1]]), { message: SIN_PEDIDOS });
});

test("hojas que no coinciden", () => {
  // Un producto de un pedido que no existe.
  assert.throws(() => extraerDatosBrutos(con("OrderPositions", { A2: "NO-EXISTE" })), { message: HOJAS_NO_COINCIDEN });
});

test("archivo de más de 92 días", () => {
  assert.throws(() => extraerDatosBrutos(con("RawData", { E2: "01.01.2026" })), /más de 92 días/);
});
```

- [ ] **Step 3: Correrlas para ver que fallan**

Run: `node --experimental-strip-types --test lib/ventas/datosBrutos.test.ts`
Expected: FAIL (`leerHojas` no existe: `does not provide an export named 'leerHojas'`).

- [ ] **Step 4: Leer todas las hojas** — `lib/ventas/xlsx.ts` completo:

```ts
import { inflateRawSync } from "node:zlib";

/** Primera hoja de un libro: su nombre y sus celdas por referencia ("A1" → texto o número). */
export type Hoja = { nombre: string; celdas: ReadonlyMap<string, string | number> };

export const NO_ES_XLSX = "El archivo no es un Excel (.xlsx) válido.";
/** Tope por archivo interno ya descomprimido: los reportes de Dodo IS pesan unos cuantos KB. */
const MAX_XML = 20 * 1024 * 1024;

/** Archivos de un ZIP por nombre, leídos del directorio central (los tamaños del encabezado local pueden venir en cero). */
function archivosZip(datos: Uint8Array): Map<string, () => string> {
  const b = Buffer.from(datos.buffer, datos.byteOffset, datos.byteLength);
  let fin = b.length - 22;
  while (fin >= 0 && b.readUInt32LE(fin) !== 0x06054b50) fin--;
  if (fin < 0) throw new Error(NO_ES_XLSX);
  const total = b.readUInt16LE(fin + 10);
  let p = b.readUInt32LE(fin + 16);
  const archivos = new Map<string, () => string>();
  for (let i = 0; i < total; i++) {
    if (p + 46 > b.length || b.readUInt32LE(p) !== 0x02014b50) throw new Error(NO_ES_XLSX);
    const metodo = b.readUInt16LE(p + 10);
    const comprimido = b.readUInt32LE(p + 20);
    const largoNombre = b.readUInt16LE(p + 28);
    const largoExtra = b.readUInt16LE(p + 30);
    const largoComentario = b.readUInt16LE(p + 32);
    const local = b.readUInt32LE(p + 42);
    const nombre = b.toString("utf8", p + 46, p + 46 + largoNombre);
    archivos.set(nombre, () => {
      if (local + 30 > b.length || b.readUInt32LE(local) !== 0x04034b50) throw new Error(NO_ES_XLSX);
      const inicio = local + 30 + b.readUInt16LE(local + 26) + b.readUInt16LE(local + 28);
      const crudo = b.subarray(inicio, inicio + comprimido);
      if (metodo === 0) return crudo.toString("utf8");
      if (metodo === 8) return inflateRawSync(crudo, { maxOutputLength: MAX_XML }).toString("utf8");
      throw new Error(NO_ES_XLSX);
    });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return archivos;
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function desescapar(texto: string): string {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e.toLowerCase()]);
}

/** Atributo de una etiqueta ya recortada: `atributo('<c r="A1" t="s">', "r")` → "A1". */
function atributo(etiqueta: string, nombre: string): string | undefined {
  return new RegExp(`\\s${nombre}="([^"]*)"`).exec(etiqueta)?.[1];
}

/** Texto de todos los <t> de un fragmento (con o sin prefijo "x:"), unido. */
function textos(xml: string): string {
  return [...xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)].map((m) => desescapar(m[1])).join("");
}

/** Lee la primera hoja de un .xlsx: celdas con valor, con cadenas compartidas y en línea resueltas. */
export function leerPrimeraHoja(datos: Uint8Array): Hoja {
  return leerHojas(datos)[0];
}

/** Lee todas las hojas de un .xlsx, en el orden del libro. */
export function leerHojas(datos: Uint8Array): Hoja[] {
  try {
    const hojas = leerLibro(datos);
    if (!hojas.length) throw new Error(NO_ES_XLSX);
    return hojas;
  } catch {
    // ZIP truncado, XML roto o archivo de otro tipo: un solo mensaje entendible.
    throw new Error(NO_ES_XLSX);
  }
}

function leerLibro(datos: Uint8Array): Hoja[] {
  const archivos = archivosZip(datos);
  const leer = (ruta: string) => {
    const f = archivos.get(ruta.replace(/^\//, ""));
    if (!f) throw new Error(NO_ES_XLSX);
    return f();
  };

  const libro = leer("xl/workbook.xml");
  const relaciones = [...leer("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]);
  const compartidas = archivos.has("xl/sharedStrings.xml")
    ? [...leer("xl/sharedStrings.xml").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textos(m[1]))
    : [];

  return [...libro.matchAll(/<(?:\w+:)?sheet\s[^>]*>/g)].map(([hoja]) => {
    const nombre = desescapar(atributo(hoja, "name") ?? "");
    const idRel = atributo(hoja, "r:id");
    const rel = relaciones.find((r) => atributo(r, "Id") === idRel);
    const destino = rel && atributo(rel, "Target");
    if (!destino) throw new Error(NO_ES_XLSX);
    const rutaHoja = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;

    const celdas = new Map<string, string | number>();
    for (const m of leer(rutaHoja).matchAll(/<(?:\w+:)?c(\s[^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
      const [, attrs, cuerpo] = m;
      const ref = atributo(attrs, "r");
      if (!ref || cuerpo === undefined) continue;
      const tipo = atributo(attrs, "t");
      if (tipo === "inlineStr") { celdas.set(ref, textos(cuerpo)); continue; }
      const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(cuerpo)?.[1];
      if (v === undefined) continue;
      if (tipo === "s") celdas.set(ref, compartidas[Number(v)] ?? "");
      else if (tipo === "str" || tipo === "e") celdas.set(ref, desescapar(v));
      else celdas.set(ref, Number(v));
    }
    return { nombre, celdas };
  });
}

/** Número serial de Excel (sistema 1900) → "YYYY-MM-DD". */
export function fechaDeSerial(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}
```

- [ ] **Step 5: El lector de Datos brutos** — `lib/ventas/datosBrutos.ts`:

```ts
import type { Hoja } from "./xlsx";

/** Lectura del archivo "Datos brutos" de Dodo IS: hojas RawData (pedidos) y OrderPositions (productos). */

export type Pago = "efectivo" | "tarjeta" | "en_linea" | "otro";
export type TipoPedido = "en_tienda" | "entrega" | "personal";
export type Origen = "mostrador" | "kiosco" | "app" | "sitio" | "otro";
export type EstadoPedido = "entregado" | "cancelado";

export type PedidoBruto = {
  dodo_id: string;
  sucursal: string;
  fecha: string;
  hora: string;
  pago: Pago;
  tipo: TipoPedido;
  origen: Origen;
  origen_dodo: string;
  para_llevar: boolean;
  estado: EstadoPedido;
  total: number;
  total_sin_descuento: number;
  productos: number;
  promocion: string | null;
  cliente_id: string | null;
  cliente_pedidos: number | null;
  turno_dodo: string | null;
  agregador: string | null;
  /** Hora de Ciudad de México con desfase: "2026-09-28T21:04:00-06:00". */
  inicio_coccion: string | null;
  listo: string | null;
  entregado: string | null;
};

export type ProductoBruto = {
  pedido_id: string;
  renglon: number;
  dodo_uuid: string;
  /** Producto + tamaño, como en ProductsSales: "Pepperoni Mediano". */
  nombre: string;
  precio: number;
  precio_sin_descuento: number;
  costo_dodo: number | null;
  combo: string | null;
};

export type ArchivoBruto = { pedidos: PedidoBruto[]; productos: ProductoBruto[] };

export const NO_ES_DATOS_BRUTOS = "Este archivo no parece un Datos brutos de Dodo IS.";
export const SIN_PEDIDOS = "El archivo no trae pedidos.";
export const HOJAS_NO_COINCIDEN = "Hay productos de pedidos que no están en OrderPositions, o productos sin su pedido.";
export const MAX_DIAS_ARCHIVO = 92;

const COLUMNAS_PEDIDOS = [
  "OrderId", "Store", "Date", "Time", "Price", "PriceWithoutDiscount", "ProductsCount", "PaymentType", "Type",
  "State", "Source", "BonusAction", "ClientId", "OrderCount", "ShiftId", "Aggregator", "TakeAway",
  "StartCookingAt", "ReadyAt", "GivenOutAt",
] as const;
const COLUMNAS_PRODUCTOS = ["OrderId", "ProductUUId", "Product", "ProductSize", "productPrice", "ProductPriceWithoutDiscount", "unitCost", "Combo"] as const;

const limpiar = (t: string) => t.replace(/\s+/g, " ").trim();

/** Renglones de una hoja como objetos por nombre de columna (fila 1 = encabezados). */
function renglones(h: Hoja, requeridas: readonly string[]): Record<string, string>[] {
  const filas = new Map<number, Map<string, string>>();
  for (const [ref, valor] of h.celdas) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    if (!m) continue;
    const fila = Number(m[2]);
    if (!filas.has(fila)) filas.set(fila, new Map());
    filas.get(fila)!.set(m[1], String(valor));
  }
  const encabezado = filas.get(1);
  if (!encabezado) throw new Error(NO_ES_DATOS_BRUTOS);
  const columna = new Map([...encabezado].map(([col, nombre]) => [limpiar(nombre), col]));
  if (requeridas.some((r) => !columna.has(r))) throw new Error(NO_ES_DATOS_BRUTOS);
  return [...filas.keys()].filter((f) => f > 1).sort((a, b) => a - b).map((f) => {
    const fila = filas.get(f)!;
    return Object.fromEntries([...columna].map(([nombre, col]) => [nombre, (fila.get(col) ?? "").trim()]));
  });
}

const numero = (t: string) => {
  const n = Number(t.replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const texto = (t: string) => (t === "" ? null : t);

/** "28.09.2026" → "2026-09-28". */
function fechaDe(t: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(t);
  if (!m) throw new Error(NO_ES_DATOS_BRUTOS);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "28.09.2026 21:04" → "2026-09-28T21:04:00-06:00" (México no tiene horario de verano desde 2022). */
function momentoDe(t: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4}) (\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4].padStart(2, "0")}:${m[5]}:00-06:00` : null;
}

const PAGOS: Record<string, Pago> = { Cash: "efectivo", BankCard: "tarjeta", InternetAcquiring: "en_linea" };
const TIPOS: Record<string, TipoPedido> = { Stationary: "en_tienda", Delivery: "entrega", PersonalFood: "personal" };
const ORIGENES: Record<string, Origen> = { Restaurant: "mostrador", Kiosk: "kiosco", Mobile: "app", Site: "sitio" };

const DIA = 86_400_000;
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);

/** Lee y valida un Datos brutos ya convertido en hojas. Lanza Error con el mensaje para el admin. */
export function extraerDatosBrutos(hojas: readonly Hoja[]): ArchivoBruto {
  const hoja = (nombre: string) => hojas.find((h) => limpiar(h.nombre) === nombre);
  const raw = hoja("RawData"), posiciones = hoja("OrderPositions");
  if (!raw || !posiciones) throw new Error(NO_ES_DATOS_BRUTOS);

  const pedidos: PedidoBruto[] = renglones(raw, COLUMNAS_PEDIDOS).filter((r) => r.OrderId).map((r) => {
    const tipo = TIPOS[r.Type];
    if (!tipo) throw new Error(`${NO_ES_DATOS_BRUTOS} Tipo de pedido desconocido: ${r.Type}.`);
    return {
      dodo_id: r.OrderId,
      sucursal: limpiar(r.Store),
      fecha: fechaDe(r.Date),
      hora: r.Time.padStart(5, "0"),
      pago: PAGOS[r.PaymentType] ?? "otro",
      tipo,
      origen: ORIGENES[r.Source] ?? "otro",
      origen_dodo: r.Source,
      para_llevar: r.TakeAway === "1",
      estado: r.State === "Failure" ? "cancelado" : "entregado",
      total: numero(r.Price),
      total_sin_descuento: numero(r.PriceWithoutDiscount),
      productos: Math.round(numero(r.ProductsCount)),
      promocion: texto(r.BonusAction),
      cliente_id: texto(r.ClientId),
      cliente_pedidos: r.OrderCount ? Math.round(numero(r.OrderCount)) : null,
      turno_dodo: texto(r.ShiftId),
      agregador: texto(r.Aggregator),
      inicio_coccion: momentoDe(r.StartCookingAt),
      listo: momentoDe(r.ReadyAt),
      entregado: momentoDe(r.GivenOutAt),
    };
  });
  if (!pedidos.length) throw new Error(SIN_PEDIDOS);

  const renglonDe = new Map<string, number>();
  const productos: ProductoBruto[] = renglones(posiciones, COLUMNAS_PRODUCTOS).filter((r) => r.OrderId).map((r) => {
    const renglon = (renglonDe.get(r.OrderId) ?? 0) + 1;
    renglonDe.set(r.OrderId, renglon);
    return {
      pedido_id: r.OrderId,
      renglon,
      dodo_uuid: r.ProductUUId,
      nombre: limpiar(`${r.Product} ${r.ProductSize}`),
      precio: numero(r.productPrice),
      precio_sin_descuento: numero(r.ProductPriceWithoutDiscount),
      costo_dodo: r.unitCost === "" ? null : numero(r.unitCost),
      combo: texto(limpiar(r.Combo)),
    };
  });

  // Cada producto con su pedido, y cada pedido con tantos productos como dice ProductsCount.
  const ids = new Set(pedidos.map((p) => p.dodo_id));
  if (productos.some((x) => !ids.has(x.pedido_id))) throw new Error(HOJAS_NO_COINCIDEN);
  if (pedidos.some((p) => (renglonDe.get(p.dodo_id) ?? 0) !== p.productos)) throw new Error(HOJAS_NO_COINCIDEN);

  const fechas = pedidos.map((p) => p.fecha).sort();
  if (diasEntre(fechas[0], fechas[fechas.length - 1]) >= MAX_DIAS_ARCHIVO) {
    throw new Error(`El archivo abarca más de ${MAX_DIAS_ARCHIVO} días.`);
  }
  return { pedidos, productos };
}
```

- [ ] **Step 6: Los cálculos sobre pedidos** — `lib/ventas/pedidos.ts`:

```ts
import type { EstadoPedido, Origen, Pago, TipoPedido } from "./datosBrutos";
import type { Desglose, Montos, TipoDesglose } from "./extraer";

/** Cálculos sobre pedidos (de Datos brutos o, más adelante, de la API de Dodo IS). Solo números, sin datos. */

/** Lo que los reportes necesitan de un pedido: coincide con las columnas de la tabla `pedidos`. */
export type Pedido = {
  dodo_id: string;
  fecha: string;
  hora: string;
  pago: Pago;
  tipo: TipoPedido;
  origen: Origen;
  para_llevar: boolean;
  estado: EstadoPedido;
  total: number;
  total_sin_descuento: number;
  agregador?: string | null;
  inicio_coccion: string | null;
  listo: string | null;
  entregado: string | null;
};

export type LineaPedido = { pedido_id: string; nombre: string; precio: number; combo: string | null };

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Cuenta como venta: entregado y no es comida del personal (igual que el reporte de Ventas de Dodo IS). */
export const cuentaComoVenta = (p: Pick<Pedido, "estado" | "tipo">) => p.estado === "entregado" && p.tipo !== "personal";

/** IVA como lo calcula Dodo IS: por producto, redondeando cada uno. */
export const ivaDe = (precios: readonly number[]) => redondear(precios.reduce((s, p) => s + redondear((p * 16) / 116), 0));

/** Tipos de servicio y de origen del desglose del reporte de Ventas a los que pertenece un pedido. */
export function tiposDesglose(p: Pick<Pedido, "tipo" | "origen" | "agregador">): TipoDesglose[] {
  const servicio: TipoDesglose = p.tipo === "entrega" ? "entrega" : p.origen === "app" || p.origen === "sitio" ? "llevadera" : "restaurante";
  const origen: TipoDesglose[] = [];
  if (p.origen === "sitio") origen.push("sitio");
  if (p.origen === "app") origen.push("app");
  if (p.agregador) origen.push("agregador");
  return [servicio, ...origen];
}

export type DiaImportado = {
  sucursal: string;
  fecha: string;
  resumen: Montos;
  desglose: Desglose[];
  /** Productos vendidos (piezas) y su suma, de los pedidos que cuentan como venta: para la bitácora. */
  productos: { piezas: number; suma: number };
  personal: { pedidos: number; monto: number };
  cancelados: { pedidos: number; monto: number };
};

const vacio = (): Montos => ({ pedidos: 0, total: 0, efectivo: 0, tarjeta: 0, en_linea: 0, iva: 0 });
function sumar(m: Montos, p: Pedido, iva: number) {
  m.pedidos += 1;
  m.total = redondear(m.total + p.total);
  if (p.pago === "efectivo") m.efectivo = redondear(m.efectivo + p.total);
  if (p.pago === "tarjeta") m.tarjeta = redondear(m.tarjeta + p.total);
  if (p.pago === "en_linea") m.en_linea = redondear(m.en_linea + p.total);
  m.iva = redondear(m.iva + iva);
}

/** Resumen por sucursal y día: venta (con IVA por producto), desglose, comidas del personal y cancelados. */
export function resumirDias(pedidos: readonly (Pedido & { sucursal: string })[], lineas: readonly LineaPedido[]): DiaImportado[] {
  const preciosDe = new Map<string, number[]>();
  for (const l of lineas) preciosDe.set(l.pedido_id, [...(preciosDe.get(l.pedido_id) ?? []), l.precio]);
  const dias = new Map<string, DiaImportado & { tipos: Map<TipoDesglose, Montos> }>();
  for (const p of pedidos) {
    const clave = `${p.sucursal}|${p.fecha}`;
    const d = dias.get(clave) ?? {
      sucursal: p.sucursal, fecha: p.fecha, resumen: vacio(), desglose: [], tipos: new Map(), productos: { piezas: 0, suma: 0 },
      personal: { pedidos: 0, monto: 0 }, cancelados: { pedidos: 0, monto: 0 },
    };
    dias.set(clave, d);
    if (p.tipo === "personal" && p.estado === "entregado") {
      d.personal.pedidos++;
      d.personal.monto = redondear(d.personal.monto + p.total_sin_descuento);
      continue;
    }
    if (p.estado === "cancelado") {
      d.cancelados.pedidos++;
      d.cancelados.monto = redondear(d.cancelados.monto + p.total);
      continue;
    }
    const precios = preciosDe.get(p.dodo_id) ?? [];
    const iva = ivaDe(precios);
    sumar(d.resumen, p, iva);
    d.productos.piezas += precios.length;
    d.productos.suma = redondear(d.productos.suma + precios.reduce((s, x) => s + x, 0));
    for (const t of tiposDesglose(p)) {
      if (!d.tipos.has(t)) d.tipos.set(t, vacio());
      sumar(d.tipos.get(t)!, p, iva);
    }
  }
  return [...dias.values()]
    .map(({ tipos, ...d }) => ({ ...d, desglose: [...tipos].map(([tipo, m]) => ({ tipo, ...m })) }))
    .sort((a, b) => a.sucursal.localeCompare(b.sucursal) || a.fecha.localeCompare(b.fecha));
}

// ─── Reportes ────────────────────────────────────────────────────────────────

const minutos = (desde: string, hasta: string) => (Date.parse(hasta) - Date.parse(desde)) / 60_000;
const momentoPedido = (p: Pick<Pedido, "fecha" | "hora">) => `${p.fecha}T${p.hora}:00-06:00`;
/** Nombre corto del día de la semana: DIAS_SEMANA[diaSemana(fecha) - 1]. */
export const DIAS_SEMANA = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"] as const;

/** Lunes = 1 … domingo = 7. */
export const diaSemana = (fecha: string) => ((new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

function mediana(valores: readonly number[]): number | null {
  if (!valores.length) return null;
  const a = [...valores].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export type CeldaHora = { dia: number; hora: number; total: number; pedidos: number };

/** Venta por día de la semana y hora (solo pedidos que cuentan como venta), y la celda con más venta. */
export function ventaPorHora(pedidos: readonly Pedido[]) {
  const celdas = new Map<string, CeldaHora>();
  for (const p of pedidos.filter(cuentaComoVenta)) {
    const dia = diaSemana(p.fecha), hora = Number(p.hora.slice(0, 2));
    const c = celdas.get(`${dia}|${hora}`) ?? { dia, hora, total: 0, pedidos: 0 };
    c.total = redondear(c.total + p.total);
    c.pedidos++;
    celdas.set(`${dia}|${hora}`, c);
  }
  const lista = [...celdas.values()];
  const pico = lista.reduce<CeldaHora | null>((a, c) => (!a || c.total > a.total ? c : a), null);
  const horas = lista.map((c) => c.hora);
  return { celdas: lista, pico, horaMin: horas.length ? Math.min(...horas) : null, horaMax: horas.length ? Math.max(...horas) : null };
}

export type Canal = Origen | "entrega";
export type ResumenCanal = { canal: Canal; pedidos: number; total: number; ticket: number | null; efectivo: number; tarjeta: number };

/** Venta por canal (entrega o el origen del pedido en tienda) y cuánto de lo vendido en tienda fue para llevar. */
export function canales(pedidos: readonly Pedido[]) {
  const mapa = new Map<Canal, ResumenCanal>();
  let enTienda = 0, paraLlevar = 0;
  for (const p of pedidos.filter(cuentaComoVenta)) {
    const canal: Canal = p.tipo === "entrega" ? "entrega" : p.origen;
    const c = mapa.get(canal) ?? { canal, pedidos: 0, total: 0, ticket: null, efectivo: 0, tarjeta: 0 };
    c.pedidos++;
    c.total = redondear(c.total + p.total);
    if (p.pago === "efectivo") c.efectivo = redondear(c.efectivo + p.total);
    if (p.pago === "tarjeta") c.tarjeta = redondear(c.tarjeta + p.total);
    mapa.set(canal, c);
    if (p.tipo === "en_tienda") { enTienda++; if (p.para_llevar) paraLlevar++; }
  }
  const lista = [...mapa.values()].map((c) => ({ ...c, ticket: c.pedidos ? c.total / c.pedidos : null })).sort((a, b) => b.total - a.total);
  return { canales: lista, paraLlevar: enTienda ? paraLlevar / enTienda : null };
}

/** Umbral de cancelados (fracción de los pedidos) a partir del cual la sección se marca en rojo. */
export const UMBRAL_CANCELADOS = 0.03;

/** Comidas del personal (a precio de lista) y pedidos cancelados, con la lista de cancelados para revisar. */
export function personalYCancelados(pedidos: readonly Pedido[], lineas: readonly LineaPedido[]) {
  const venta = redondear(pedidos.filter(cuentaComoVenta).reduce((s, p) => s + p.total, 0));
  const personal = pedidos.filter((p) => p.tipo === "personal" && p.estado === "entregado");
  const cancelados = pedidos.filter((p) => p.estado === "cancelado");
  const productosDe = (id: string) => lineas.filter((l) => l.pedido_id === id).map((l) => l.nombre);
  const montoPersonal = redondear(personal.reduce((s, p) => s + p.total_sin_descuento, 0));
  return {
    personal: { pedidos: personal.length, monto: montoPersonal, pctVenta: venta ? montoPersonal / venta : null },
    cancelados: {
      pedidos: cancelados.length,
      monto: redondear(cancelados.reduce((s, p) => s + p.total, 0)),
      pct: pedidos.length ? cancelados.length / pedidos.length : null,
      lista: cancelados
        .map((p) => ({ dodo_id: p.dodo_id, fecha: p.fecha, hora: p.hora, total: p.total, productos: productosDe(p.dodo_id) }))
        .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora)),
    },
    alerta: pedidos.length > 0 && cancelados.length / pedidos.length > UMBRAL_CANCELADOS,
  };
}

/** Minutos a partir de los cuales un pedido se cuenta como lento en cocina. */
export const MINUTOS_LENTO = 15;

/** Tiempos de cocina (inicio → listo) y de entrega (pedido → entregado) de los pedidos que cuentan como venta. */
export function tiempos(pedidos: readonly Pedido[]) {
  const venta = pedidos.filter(cuentaComoVenta);
  const conCocina = venta.filter((p) => p.inicio_coccion && p.listo).map((p) => ({ p, min: minutos(p.inicio_coccion!, p.listo!) }));
  const entrega = venta.filter((p) => p.entregado).map((p) => minutos(momentoPedido(p), p.entregado!));
  const porHora = new Map<number, number[]>();
  for (const { p, min } of conCocina) {
    const h = Number(p.hora.slice(0, 2));
    porHora.set(h, [...(porHora.get(h) ?? []), min]);
  }
  return {
    medianaCocina: mediana(conCocina.map((x) => x.min)),
    medianaEntrega: mediana(entrega),
    lentos: conCocina.filter((x) => x.min > MINUTOS_LENTO).length,
    pctLentos: conCocina.length ? conCocina.filter((x) => x.min > MINUTOS_LENTO).length / conCocina.length : null,
    sinTiempo: venta.length - conCocina.length,
    porHora: [...porHora].map(([hora, m]) => ({ hora, mediana: mediana(m)!, pedidos: m.length })).sort((a, b) => a.hora - b.hora),
    masLentos: [...conCocina].sort((a, b) => b.min - a.min).slice(0, 5)
      .map(({ p, min }) => ({ dodo_id: p.dodo_id, fecha: p.fecha, hora: p.hora, minutos: Math.round(min), total: p.total })),
  };
}

/** Combos vendidos: un par (pedido, combo) distinto es un combo vendido; la venta es la de sus productos. */
export function combos(pedidos: readonly Pedido[], lineas: readonly LineaPedido[]) {
  const venta = new Set(pedidos.filter(cuentaComoVenta).map((p) => p.dodo_id));
  const mapa = new Map<string, { combo: string; pedidos: Set<string>; productos: number; total: number }>();
  for (const l of lineas) {
    if (!l.combo || !venta.has(l.pedido_id)) continue;
    const c = mapa.get(l.combo) ?? { combo: l.combo, pedidos: new Set<string>(), productos: 0, total: 0 };
    c.pedidos.add(l.pedido_id);
    c.productos++;
    c.total = redondear(c.total + l.precio);
    mapa.set(l.combo, c);
  }
  return [...mapa.values()]
    .map((c) => ({ combo: c.combo, vendidos: c.pedidos.size, productos: c.productos, total: c.total }))
    .sort((a, b) => b.vendidos - a.vendidos || b.total - a.total);
}
```

- [ ] **Step 7: Correr las pruebas**

Run: `node --experimental-strip-types --test lib/ventas/datosBrutos.test.ts`
Expected: PASS, 18 pruebas.

- [ ] **Step 8: Agregar al script y correr todo**

En `package.json`, agrega ` lib/ventas/datosBrutos.test.ts` al final de la lista de `"test"`. Run: `npm test` → Expected: todas pasan (131 al escribir este plan).

- [ ] **Step 9: Commit**

```bash
git add lib/ventas/xlsx.ts lib/ventas/datosBrutos.ts lib/ventas/pedidos.ts lib/ventas/datosBrutos.test.ts lib/ventas/__fixtures__/datos-brutos-2026-09-21.xlsx package.json
git commit -m "Datos brutos: lector del archivo y cálculos por pedido"
```

---

### Task 3: Importar Datos brutos

**Files:**
- Modify (reemplazo completo): `app/ventas/importar/preparar.ts`, `app/ventas/importar/acciones.ts`, `app/ventas/importar/FormImportar.tsx`
- Modify: `app/ventas/importar/page.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `leerHojas`, `extraerDatosBrutos`, `resumirDias`, `ivaDe` (Tarea 2); `buscarSucursal` (`lib/ventas/extraer.ts`); `tamanoPorNombre` (`lib/ventas/calculos.ts`); `leerTodo`; `importar_datos_brutos` (Tarea 1).
- Produces: `type Revision`, `type Carga`, `prepararImportacion(supabase, fd): Promise<{ revision; carga }>`; server actions `revisarImportacion(fd)`, `guardarImportacion(fd)` → `ResultadoImportacion`.

La lógica que se puede equivocar (leer, validar, resumir) ya está probada en la Tarea 2; aquí se conecta. La revisión que ve el navegador no lleva los pedidos: esos se quedan en el servidor y se vuelven a leer al guardar.

- [ ] **Step 1: Preparar** — `app/ventas/importar/preparar.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { tamanoPorNombre } from "@/lib/ventas/calculos";
import { extraerDatosBrutos } from "@/lib/ventas/datosBrutos";
import { buscarSucursal, type Desglose, type Montos } from "@/lib/ventas/extraer";
import { leerTodo } from "@/lib/ventas/paginar";
import { ivaDe, resumirDias } from "@/lib/ventas/pedidos";
import { leerHojas } from "@/lib/ventas/xlsx";

/** Lo que ve el admin antes de guardar. Sin los pedidos: esos se quedan en el servidor. */
export type Revision = {
  archivo: string;
  periodo: { desde: string; hasta: string };
  dias: {
    sucursal: { id: string; nombre: string };
    fecha: string;
    resumen: Montos;
    ticket: number | null;
    personal: { pedidos: number; monto: number };
    cancelados: { pedidos: number; monto: number };
    yaImportado: { total: number } | null;
  }[];
  totales: { pedidos: number; total: number; personal: number; cancelados: number };
  /** Productos que no están en el catálogo (entran sin categoría ni costo). */
  nuevos: string[];
  sinCategoria: string[];
  sinCosto: string[];
  diasYaImportados: number;
};

/** Lo que se manda a importar_datos_brutos. */
export type Carga = { dias: unknown[]; pedidos: unknown[]; productos: unknown[] };

/** Un Datos brutos de una semana pesa ~120 KB; 4 MB alcanza para varios meses de varias sucursales. */
const MAX_BYTES = 4 * 1024 * 1024;

const redondear = (n: number) => Math.round(n * 100) / 100;

/** Lee y valida el archivo sin guardar nada. Lanza Error con un mensaje para el admin. */
export async function prepararImportacion(supabase: SupabaseClient, fd: FormData): Promise<{ revision: Revision; carga: Carga }> {
  const f = fd.get("archivo");
  if (!(f instanceof File) || f.size === 0) throw new Error("Falta el archivo de Datos brutos.");
  if (f.size > MAX_BYTES) throw new Error("El archivo pesa más de 4 MB; exporta un periodo más corto.");
  const archivo = extraerDatosBrutos(leerHojas(new Uint8Array(await f.arrayBuffer())));

  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre, m2_comedor")
    .returns<{ id: string; nombre: string; m2_comedor: number | null }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const sucursalDe = new Map<string, { id: string; nombre: string; m2_comedor: number | null }>();
  for (const nombre of new Set(archivo.pedidos.map((p) => p.sucursal))) {
    const s = buscarSucursal(nombre, sucursales ?? []);
    if (!s) throw new Error(`La sucursal ${nombre} del archivo no existe en la app.`);
    sucursalDe.set(nombre, s);
  }

  const resumen = resumirDias(archivo.pedidos, archivo.productos);
  const fechas = resumen.map((d) => d.fecha).sort();
  const periodo = { desde: fechas[0], hasta: fechas[fechas.length - 1] };
  const ids = [...new Set([...sucursalDe.values()].map((s) => s.id))];

  const [previos, catalogo, costos] = await Promise.all([
    supabase.from("ventas_dia").select("sucursal_id, fecha, total").in("sucursal_id", ids)
      .gte("fecha", periodo.desde).lte("fecha", periodo.hasta)
      .returns<{ sucursal_id: string; fecha: string; total: number }[]>(),
    leerTodo<{ dodo_id: number; nombre: string; categoria: string | null; dodo_uuid: string | null }>((desde, hasta) =>
      supabase.from("productos_venta").select("dodo_id, nombre, categoria, dodo_uuid").order("dodo_id").range(desde, hasta)
        .returns<{ dodo_id: number; nombre: string; categoria: string | null; dodo_uuid: string | null }[]>()),
    leerTodo<{ dodo_id: number }>((desde, hasta) =>
      supabase.from("costos_producto").select("dodo_id").lte("vigente_desde", periodo.hasta)
        .order("dodo_id").order("vigente_desde").range(desde, hasta).returns<{ dodo_id: number }[]>()),
  ]);
  if (previos.error) throw new Error(`No se pudo revisar qué días ya estaban importados: ${previos.error.message}`);
  const previo = new Map((previos.data ?? []).map((v) => [`${v.sucursal_id}|${v.fecha}`, Number(v.total)]));

  // Empate con el catálogo igual que en la base de datos: por código, si no por nombre.
  const porCodigo = new Map(catalogo.filter((c) => c.dodo_uuid).map((c) => [c.dodo_uuid!, c]));
  const porNombre = new Map(catalogo.filter((c) => !c.dodo_uuid).map((c) => [c.nombre.toLowerCase(), c]));
  const conCosto = new Set(costos.map((c) => c.dodo_id));
  const nuevos = new Set<string>(), sinCategoria = new Set<string>(), sinCosto = new Set<string>();
  for (const x of archivo.productos) {
    const c = porCodigo.get(x.dodo_uuid) ?? porNombre.get(x.nombre.toLowerCase());
    if (!c) { nuevos.add(x.nombre); continue; }
    if (!c.categoria) sinCategoria.add(c.nombre);
    if (!conCosto.has(c.dodo_id)) sinCosto.add(c.nombre);
  }

  const dias = resumen.map((d) => {
    const s = sucursalDe.get(d.sucursal)!;
    return { d, s, anterior: previo.get(`${s.id}|${d.fecha}`) };
  });
  const lineasDe = new Map<string, number[]>();
  for (const x of archivo.productos) lineasDe.set(x.pedido_id, [...(lineasDe.get(x.pedido_id) ?? []), x.precio]);

  const revision: Revision = {
    archivo: f.name,
    periodo,
    dias: dias.map(({ d, s, anterior }) => ({
      sucursal: { id: s.id, nombre: s.nombre },
      fecha: d.fecha,
      resumen: d.resumen,
      ticket: d.resumen.pedidos ? d.resumen.total / d.resumen.pedidos : null,
      personal: d.personal,
      cancelados: d.cancelados,
      yaImportado: anterior === undefined ? null : { total: anterior },
    })),
    totales: {
      pedidos: resumen.reduce((s, d) => s + d.resumen.pedidos, 0),
      total: redondear(resumen.reduce((s, d) => s + d.resumen.total, 0)),
      personal: resumen.reduce((s, d) => s + d.personal.pedidos, 0),
      cancelados: resumen.reduce((s, d) => s + d.cancelados.pedidos, 0),
    },
    nuevos: [...nuevos].sort(),
    sinCategoria: [...sinCategoria].sort(),
    sinCosto: [...sinCosto].filter((n) => !nuevos.has(n)).sort(),
    diasYaImportados: dias.filter((x) => x.anterior !== undefined).length,
  };

  const carga: Carga = {
    dias: dias.map(({ d, s }) => ({
      sucursal_id: s.id,
      fecha: d.fecha,
      resumen: {
        ...d.resumen,
        venta_m2: s.m2_comedor ? redondear(d.resumen.total / Number(s.m2_comedor)) : null,
        suma_productos: d.productos.suma,
        productos: d.productos.piezas,
      },
      desglose: d.desglose satisfies Desglose[],
    })),
    pedidos: archivo.pedidos.map(({ sucursal, ...p }) => ({
      ...p,
      sucursal_id: sucursalDe.get(sucursal)!.id,
      iva: ivaDe(lineasDe.get(p.dodo_id) ?? []),
    })),
    productos: archivo.productos.map((x) => ({ ...x, tamano: tamanoPorNombre(x.nombre) })),
  };
  return { revision, carga };
}
```

- [ ] **Step 2: Server actions** — `app/ventas/importar/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { prepararImportacion, type Revision } from "./preparar";

export type ResultadoImportacion =
  | { tipo: "revision"; revision: Revision }
  | { tipo: "error"; mensaje: string; revision?: Revision }
  | { tipo: "guardado"; mensaje: string };

async function clienteAdmin() {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) throw new Error("Solo un administrador importa ventas.");
  return supabase;
}

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudo leer el archivo.");

/** Lee y valida sin guardar. */
export async function revisarImportacion(fd: FormData): Promise<ResultadoImportacion> {
  try {
    return { tipo: "revision", revision: (await prepararImportacion(await clienteAdmin(), fd)).revision };
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
}

/** Vuelve a leer el archivo enviado (no confía en la revisión anterior) y lo guarda completo. */
export async function guardarImportacion(fd: FormData): Promise<ResultadoImportacion> {
  let supabase: Awaited<ReturnType<typeof clienteAdmin>>;
  let preparado: Awaited<ReturnType<typeof prepararImportacion>>;
  try {
    supabase = await clienteAdmin();
    preparado = await prepararImportacion(supabase, fd);
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
  const { revision, carga } = preparado;
  if (revision.diasYaImportados > 0 && fd.get("confirmar") !== "si") {
    return { tipo: "error", mensaje: "Marca la casilla para reemplazar los días ya importados.", revision };
  }

  const { error } = await supabase.rpc("importar_datos_brutos", {
    p_archivo: revision.archivo,
    p_dias: carga.dias,
    p_pedidos: carga.pedidos,
    p_productos: carga.productos,
    p_reemplazar: revision.diasYaImportados > 0,
  });
  if (error) return { tipo: "error", mensaje: error.message, revision };

  revalidatePath("/ventas", "layout");
  const { desde, hasta } = revision.periodo;
  const periodo = desde === hasta ? fechaTexto(desde) : `${fechaTexto(desde)} al ${fechaTexto(hasta)}`;
  return {
    tipo: "guardado",
    mensaje: `Guardado: ${revision.dias.length} ${revision.dias.length === 1 ? "día" : "días"} (${periodo}), ${revision.totales.pedidos} pedidos, ${pesos(revision.totales.total)}.`,
  };
}
```

- [ ] **Step 3: Formulario y vista previa** — `app/ventas/importar/FormImportar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { fechaTexto, pesos } from "@/lib/formato";
import { guardarImportacion, revisarImportacion, type ResultadoImportacion } from "./acciones";
import type { Revision } from "./preparar";

/**
 * Un archivo de Datos brutos → Revisar (lee sin guardar) → vista previa por sucursal y día → Guardar o Reimportar.
 * El envío es manual (no <form action>) para que React no vacíe el campo de archivo entre Revisar y Guardar.
 */
export function FormImportar() {
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [pendiente, iniciar] = useTransition();
  const revision = resultado?.tipo === "revision" || resultado?.tipo === "error" ? resultado.revision : undefined;

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const guardar = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.value === "guardar";
    const datos = new FormData(form);
    iniciar(async () => {
      const r = await (guardar ? guardarImportacion(datos) : revisarImportacion(datos));
      setResultado(r);
      if (r.tipo === "guardado") form.reset();
    });
  }

  return (
    <form className="seccion formulario" onSubmit={enviar}>
      <div className="campo">
        <label htmlFor="archivo">Datos brutos de Dodo IS</label>
        <input id="archivo" name="archivo" type="file" accept=".xlsx" required onChange={() => setResultado(null)} />
        <small>Dodo IS → Informes → Datos brutos, del periodo que quieras (hasta 92 días), de una o varias sucursales.</small>
      </div>

      {resultado?.tipo === "error" && <p className="aviso aviso-error" role="alert">{resultado.mensaje}</p>}
      {resultado?.tipo === "guardado" && (
        <p className="aviso aviso-ok" role="status">{resultado.mensaje} <Link href="/ventas">Ver reportes</Link></p>
      )}
      {revision && <VistaPrevia r={revision} />}

      <div className="acciones">
        <button className="boton boton-secundario" type="submit" value="revisar" disabled={pendiente}>
          {pendiente ? "Leyendo…" : "Revisar"}
        </button>
        {revision && (
          <button className="boton" type="submit" value="guardar" disabled={pendiente}>
            {revision.diasYaImportados ? "Reimportar" : "Guardar"}
          </button>
        )}
      </div>
    </form>
  );
}

function VistaPrevia({ r }: { r: Revision }) {
  const periodo = r.periodo.desde === r.periodo.hasta ? fechaTexto(r.periodo.desde) : `${fechaTexto(r.periodo.desde)} al ${fechaTexto(r.periodo.hasta)}`;
  const faltan = r.nuevos.length + r.sinCategoria.length + r.sinCosto.length > 0;
  return (
    <div className="vista-previa" aria-live="polite">
      <h2>{periodo}</h2>
      <p>
        {r.dias.length} {r.dias.length === 1 ? "día" : "días"} · {r.totales.pedidos} pedidos · {pesos(r.totales.total)} ·
        {" "}{r.totales.personal} comidas del personal · {r.totales.cancelados} cancelados
      </p>
      <ul className="dias-importar">
        {r.dias.map((d) => (
          <li key={`${d.sucursal.id}|${d.fecha}`} data-repetido={d.yaImportado ? "si" : undefined}>
            <span className="dias-importar-fecha">{fechaTexto(d.fecha)}{new Set(r.dias.map((x) => x.sucursal.id)).size > 1 ? ` · ${d.sucursal.nombre}` : ""}</span>
            <span>{d.resumen.pedidos} ped. · <strong>{pesos(d.resumen.total)}</strong></span>
            <span className="saldo-nota">
              Ticket {d.ticket === null ? "—" : pesos(d.ticket)} · personal {d.personal.pedidos} · cancelados {d.cancelados.pedidos}
              {d.yaImportado ? ` · ya importado (${pesos(d.yaImportado.total)})` : ""}
            </span>
          </li>
        ))}
      </ul>
      {r.diasYaImportados > 0 && (
        <>
          <p className="aviso aviso-info">
            {r.diasYaImportados} {r.diasYaImportados === 1 ? "día ya estaba importado" : "días ya estaban importados"}. Reimportar
            los reemplaza completos con lo que trae este archivo.
          </p>
          <label className="casilla">
            <input type="checkbox" name="confirmar" value="si" />
            Sí, reemplazar los días ya importados
          </label>
        </>
      )}
      {faltan && (
        <div className="aviso aviso-info">
          {r.nuevos.length > 0 && <p>Productos nuevos (entran sin categoría ni costo): {r.nuevos.join(", ")}.</p>}
          {r.sinCategoria.length > 0 && <p>Sin categoría: {r.sinCategoria.join(", ")}.</p>}
          {r.sinCosto.length > 0 && <p>Sin costo: {r.sinCosto.join(", ")}.</p>}
          <p>Después de guardar, asígnalos en <Link href="/ventas/costos">Costos</Link>.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Texto de la página**

```diff
diff --git a/app/ventas/importar/page.tsx b/app/ventas/importar/page.tsx
index da33501..2a8a05f 100644
--- a/app/ventas/importar/page.tsx
+++ b/app/ventas/importar/page.tsx
@@ -11,8 +11,8 @@ export default async function PaginaImportar() {
       <div className="encabezado">
         <h1>Importar ventas</h1>
         <p>
-          Sube los dos reportes de Dodo IS de un día de una sucursal: Ventas y Productos (ProductsSales).
-          Primero se revisan; nada se guarda hasta que presiones Guardar.
+          Sube el archivo Datos brutos de Dodo IS: trae cada pedido del periodo, de una o varias sucursales.
+          Primero se revisa; nada se guarda hasta que presiones Guardar.
         </p>
       </div>
       <FormImportar />
```

- [ ] **Step 5: Estilo de la lista de días** — al final de `app/globals.css`:

```css
/* ─── Importar Datos brutos ─── */
.dias-importar { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.dias-importar li { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 8px 0; border-bottom: 1px solid var(--papel-2); }
.dias-importar li .saldo-nota { grid-column: 1 / -1; }
.dias-importar li[data-repetido] .dias-importar-fecha::after { content: " ⚠"; color: var(--accion-oscuro); }
.dias-importar-fecha { font-weight: 700; }
```

- [ ] **Step 6: Typecheck, pruebas y build**

Run: `npm run typecheck && npm test && npm run build` → Expected: sin errores.

Revisión manual (Review Focus 1 y 2): en el código de `prepararImportacion`, una sucursal que no existe lanza "La sucursal X del archivo no existe en la app." antes de consultar nada más; un archivo de más de 4 MB se rechaza antes de leerse.

- [ ] **Step 7: Commit**

```bash
git add app/ventas/importar app/globals.css
git commit -m "Importar: Datos brutos en lugar de Ventas + ProductsSales"
```

---

### Task 4: Reportes por pedido

**Files:**
- Modify: `app/ventas/datos.ts` (agrega `datosPedidos`), `app/ventas/page.tsx`, `app/globals.css`
- Create: `components/MapaCalor.tsx`, `app/ventas/SeccionesPedidos.tsx`

**Interfaces:**
- Consumes: `ventaPorHora`, `canales`, `personalYCancelados`, `tiempos`, `combos`, `DIAS_SEMANA`, `MINUTOS_LENTO`, tipos `Pedido`, `LineaPedido`, `Canal` (Tarea 2); `leerTodo`; `Grafica`, `Plegable`.
- Produces: `datosPedidos(supabase, sucursal, periodo): Promise<{ pedidos: (Pedido & { sucursal_id: string })[]; lineas: LineaPedido[] }>`, `<MapaCalor celdas horaMin horaMax />`, `<SeccionesPedidos pedidos lineas diasSinDetalle />`.

- [ ] **Step 1: Cargar pedidos** — agrega al final de `app/ventas/datos.ts`, y el import `import type { LineaPedido, Pedido } from "@/lib/ventas/pedidos";` junto a los demás:

```ts
/** Pedidos del periodo y sus productos (solo existen para días importados con Datos brutos), en páginas. */
export async function datosPedidos(supabase: SupabaseClient, sucursal: string | null, p: Periodo): Promise<{ pedidos: (Pedido & { sucursal_id: string })[]; lineas: LineaPedido[] }> {
  const [pedidos, lineas] = await Promise.all([
    leerTodo<Pedido & { sucursal_id: string }>((desde, hasta) => {
      let q = supabase.from("pedidos")
        .select("dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, para_llevar, estado, total, total_sin_descuento, agregador, inicio_coccion, listo, entregado")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("dodo_id").range(desde, hasta).returns<(Pedido & { sucursal_id: string })[]>();
    }),
    leerTodo<LineaPedido>((desde, hasta) => {
      let q = supabase.from("pedido_productos")
        .select("pedido_id, nombre, precio, combo, pedidos!inner(fecha, sucursal_id)")
        .gte("pedidos.fecha", p.desde).lte("pedidos.fecha", p.hasta);
      if (sucursal) q = q.eq("pedidos.sucursal_id", sucursal);
      return q.order("pedido_id").order("renglon").range(desde, hasta).returns<LineaPedido[]>();
    }),
  ]);
  return {
    // Postgres devuelve la hora como "13:05:00" y los montos pueden llegar como texto.
    pedidos: pedidos.map((x) => ({ ...x, hora: x.hora.slice(0, 5), total: Number(x.total), total_sin_descuento: Number(x.total_sin_descuento) })),
    lineas: lineas.map((l) => ({ pedido_id: l.pedido_id, nombre: l.nombre, precio: Number(l.precio), combo: l.combo })),
  };
}
```

- [ ] **Step 2: Mapa de calor** — `components/MapaCalor.tsx`:

```tsx
"use client";

import { useState } from "react";
import { pesos } from "@/lib/formato";
import { DIAS_SEMANA as DIAS } from "@/lib/ventas/pedidos";

type Celda = { dia: number; hora: number; total: number; pedidos: number };

/**
 * Venta por día de la semana (filas) y hora (columnas). Entre más venta, más naranja. Arriba se lee el detalle
 * de la celda elegida (al inicio, la hora pico); tocar o pasar el mouse por una celda lo cambia.
 */
export function MapaCalor({ celdas, horaMin, horaMax }: { celdas: readonly Celda[]; horaMin: number; horaMax: number }) {
  const max = Math.max(0, ...celdas.map((c) => c.total));
  const pico = celdas.find((c) => c.total === max) ?? null;
  const [elegida, setElegida] = useState<Celda | null>(pico);
  const horas = Array.from({ length: horaMax - horaMin + 1 }, (_, i) => horaMin + i);
  const celda = (dia: number, hora: number) => celdas.find((c) => c.dia === dia && c.hora === hora);
  const detalle = (c: Celda) => `${DIAS[c.dia - 1]} ${c.hora} h · ${pesos(c.total)} · ${c.pedidos} ${c.pedidos === 1 ? "pedido" : "pedidos"}`;

  return (
    <div className="mapa-calor">
      <p className="barras-v-detalle" aria-live="polite">
        {elegida ? detalle(elegida) : "Sin ventas"}
        {elegida && elegida === pico && <span className="saldo-nota"> · hora pico</span>}
      </p>
      <div className="mapa-calor-rejilla" role="grid" aria-label="Venta por día y hora" style={{ gridTemplateColumns: `2.4em repeat(${horas.length}, minmax(0, 1fr))` }}>
        <span aria-hidden="true" />
        {horas.map((h) => <span key={h} className="mapa-calor-hora" aria-hidden="true">{h}</span>)}
        {DIAS.map((nombre, i) => (
          <div key={nombre} role="row" style={{ display: "contents" }}>
            <span className="mapa-calor-dia" role="rowheader">{nombre}</span>
            {horas.map((h) => {
              const c = celda(i + 1, h);
              const intensidad = c && max > 0 ? Math.round(12 + (88 * c.total) / max) : 0;
              return (
                <button key={h} type="button" role="gridcell" className="mapa-calor-celda" disabled={!c}
                  aria-pressed={c !== undefined && c === elegida}
                  aria-label={c ? detalle(c) : `${nombre} ${h} h · sin ventas`}
                  style={c ? { background: `color-mix(in srgb, var(--accion) ${intensidad}%, var(--blanco))` } : undefined}
                  onClick={() => c && setElegida(c)} onMouseEnter={() => c && setElegida(c)} />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Las cinco secciones** — `app/ventas/SeccionesPedidos.tsx`:

```tsx
import { Grafica } from "@/components/Grafica";
import { MapaCalor } from "@/components/MapaCalor";
import { Plegable } from "@/components/Plegable";
import { fechaTexto, pesos, porcentaje } from "@/lib/formato";
import {
  canales, combos, DIAS_SEMANA, MINUTOS_LENTO, personalYCancelados, tiempos, ventaPorHora,
  type Canal, type LineaPedido, type Pedido,
} from "@/lib/ventas/pedidos";

const NOMBRE_CANAL: Record<Canal, string> = {
  mostrador: "Mostrador", kiosco: "Kiosco", app: "App", sitio: "Sitio", otro: "Otro", entrega: "Entrega a domicilio",
};
const minutos = (m: number | null) => (m === null ? "—" : `${Math.round(m)} min`);

/**
 * Reportes que salen de cada pedido (Datos brutos o, después, la API): venta por hora, canales, personal y
 * cancelados, tiempos de cocina y combos. `diasSinDetalle` son los días del periodo importados con el formato anterior.
 */
export function SeccionesPedidos({ pedidos, lineas, diasSinDetalle }: { pedidos: readonly Pedido[]; lineas: readonly LineaPedido[]; diasSinDetalle: number }) {
  const aviso = diasSinDetalle > 0 && (
    <p className="aviso aviso-info">
      {diasSinDetalle} {diasSinDetalle === 1 ? "día del periodo no tiene" : "días del periodo no tienen"} detalle por pedido;
      reimpórtalos con Datos brutos para verlos aquí.
    </p>
  );
  if (!pedidos.length) return aviso || null;

  const hora = ventaPorHora(pedidos);
  const canal = canales(pedidos);
  const pc = personalYCancelados(pedidos, lineas);
  const t = tiempos(pedidos);
  const cb = combos(pedidos, lineas);

  return (
    <>
      {aviso}
      <Plegable id="por-hora" titulo="Venta por hora" resumen={hora.pico ? `Pico ${DIAS_SEMANA[hora.pico.dia - 1]} ${hora.pico.hora} h` : "—"}>
        {hora.horaMin !== null && hora.horaMax !== null && <MapaCalor celdas={hora.celdas} horaMin={hora.horaMin} horaMax={hora.horaMax} />}
      </Plegable>

      <div className="tablero-fila">
        <Plegable id="canales" titulo="Canales" resumen={`${canal.canales.length} canales`}>
          <Grafica titulo="Venta por canal" barras={canal.canales.map((c) => ({
            clave: c.canal, etiqueta: NOMBRE_CANAL[c.canal], valor: c.total,
            texto: `${pesos(c.total)} · ${c.pedidos} ped. · ticket ${c.ticket === null ? "—" : pesos(c.ticket)}`,
          }))} />
          {canal.paraLlevar !== null && (
            <p>En tienda: {porcentaje(canal.paraLlevar)} para llevar y {porcentaje(1 - canal.paraLlevar)} para comer ahí.</p>
          )}
          <ul className="fallas">
            {canal.canales.map((c) => (
              <li key={c.canal}>{NOMBRE_CANAL[c.canal]}: efectivo {pesos(c.efectivo)} · tarjeta {pesos(c.tarjeta)}</li>
            ))}
          </ul>
        </Plegable>

        <Plegable id="personal" titulo="Personal y cancelados" resumen={`${pc.cancelados.pedidos} cancelados`} alerta={pc.alerta}>
          <dl className="tarjeta-datos">
            <dt>Personal</dt>
            <dd>
              <span>{pc.personal.pedidos} pedidos</span>
              <span>{pesos(pc.personal.monto)} a precio de lista</span>
              <span>{porcentaje(pc.personal.pctVenta)} de la venta</span>
            </dd>
            <dt>Cancelados</dt>
            <dd>
              <span className={pc.alerta ? "celda-alerta" : undefined}>{pc.cancelados.pedidos} pedidos ({porcentaje(pc.cancelados.pct)})</span>
              <span>{pesos(pc.cancelados.monto)}</span>
            </dd>
          </dl>
          {pc.cancelados.lista.length > 0 && (
            <ul className="fallas">
              {pc.cancelados.lista.map((c) => (
                <li key={c.dodo_id}>{fechaTexto(c.fecha)} {c.hora} · {pesos(c.total)} · {c.productos.join(", ")}</li>
              ))}
            </ul>
          )}
        </Plegable>
      </div>

      <div className="tablero-fila">
        <Plegable id="tiempos" titulo="Tiempos de cocina" resumen={minutos(t.medianaCocina)}>
          <dl className="tarjeta-datos">
            <dt>Cocina</dt><dd>{minutos(t.medianaCocina)} de mediana (de que se empieza a que queda listo)</dd>
            <dt>Entrega</dt><dd>{minutos(t.medianaEntrega)} de mediana (de que se pide a que se entrega)</dd>
            <dt>Lentos</dt><dd>{t.lentos} pedidos de más de {MINUTOS_LENTO} min en cocina ({porcentaje(t.pctLentos)})</dd>
          </dl>
          {t.porHora.length > 0 && (
            <Grafica titulo="Minutos de cocina por hora" barras={t.porHora.map((h) => ({
              clave: String(h.hora), etiqueta: `${h.hora} h`, valor: h.mediana, texto: `${minutos(h.mediana)} · ${h.pedidos} ped.`,
              alerta: h.mediana > MINUTOS_LENTO,
            }))} />
          )}
          {t.masLentos.length > 0 && (
            <>
              <h3>Los más lentos</h3>
              <ul className="fallas">
                {t.masLentos.map((p) => <li key={p.dodo_id}>{fechaTexto(p.fecha)} {p.hora} · {p.minutos} min · {pesos(p.total)}</li>)}
              </ul>
            </>
          )}
          {t.sinTiempo > 0 && <p className="saldo-nota">{t.sinTiempo} pedidos sin hora de listo no cuentan.</p>}
        </Plegable>

        <Plegable id="combos" titulo="Combos" resumen={cb.length ? `${cb.reduce((s, c) => s + c.vendidos, 0)} vendidos` : "Ninguno"}>
          {cb.length ? (
            <Grafica titulo="Combos más vendidos" barras={cb.map((c) => ({
              clave: c.combo, etiqueta: c.combo, valor: c.vendidos, texto: `${c.vendidos} · ${pesos(c.total)}`,
            }))} />
          ) : <p className="vacio">No se vendieron combos en el periodo.</p>}
          <p className="saldo-nota">Si un pedido lleva dos veces el mismo combo, cuenta como uno.</p>
        </Plegable>
      </div>
    </>
  );
}
```

- [ ] **Step 4: Conectar en la página**

```diff
diff --git a/app/ventas/page.tsx b/app/ventas/page.tsx
index e35f413..dfac0f2 100644
--- a/app/ventas/page.tsx
+++ b/app/ventas/page.tsx
@@ -15,7 +15,8 @@ import {
 } from "@/lib/ventas/calculos";
 import { indicadores } from "@/lib/ventas/tablero";
 import { moverMes } from "@/lib/ventas/calendario";
-import { datosVentas, ultimoDiaConDatos, ventaDiariaDesde } from "./datos";
+import { datosPedidos, datosVentas, ultimoDiaConDatos, ventaDiariaDesde } from "./datos";
+import { SeccionesPedidos } from "./SeccionesPedidos";
 
 const categoria = (c: Categoria | null) => (c ? NOMBRE_CATEGORIA[c] : "Sin categoría");
 const cambio = (f: number | null) => (f === null ? "nuevo" : `${f >= 0 ? "▲" : "▼"} ${porcentaje(Math.abs(f))}`);
@@ -48,9 +49,10 @@ export default async function PaginaVentas({ searchParams }: { searchParams: Pro
   const hoy = hoyMX();
   // El calendario trae 13 meses de venta diaria de una vez: cambiar de mes no vuelve a consultar.
   const inicioCalendario = moverMes({ anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) }, -12);
-  const [d, ventaDiaria] = await Promise.all([
+  const [d, ventaDiaria, detalle] = await Promise.all([
     datosVentas(supabase, sucursal, periodo, periodoAnterior(periodo)),
     ventaDiariaDesde(supabase, sucursal, `${inicioCalendario.anio}-${String(inicioCalendario.mes).padStart(2, "0")}-01`),
+    datosPedidos(supabase, sucursal, periodo),
   ]);
   const resumen = resumenVentas(d.dias);
   const productos = porProducto(d.renglones);
@@ -70,6 +72,9 @@ export default async function PaginaVentas({ searchParams }: { searchParams: Pro
   const m2 = sucursal ? d.dias.filter((x) => x.venta_m2 !== null) : [];
   const mayorCosto = productos.filter((p) => p.costoPct !== null).sort((a, b) => (b.costoPct ?? 0) - (a.costoPct ?? 0)).slice(0, 5);
   const titulo = sucursal ? nombreDe.get(sucursal) : "Todas las sucursales";
+  // Días importados con el formato anterior: tienen venta pero no pedidos.
+  const conDetalle = new Set(detalle.pedidos.map((p) => `${p.sucursal_id}|${p.fecha}`));
+  const diasSinDetalle = d.dias.filter((x) => !conDetalle.has(`${x.sucursal_id}|${x.fecha}`)).length;
 
   return (
     <>
@@ -206,6 +211,8 @@ export default async function PaginaVentas({ searchParams }: { searchParams: Pro
           pueden explicar una diferencia.
         </p>
       </Plegable>
+
+      <SeccionesPedidos pedidos={detalle.pedidos} lineas={detalle.lineas} diasSinDetalle={diasSinDetalle} />
     </>
   );
 }
```

- [ ] **Step 5: Estilo del mapa de calor** — al final de `app/globals.css`:

```css
/* ─── Mapa de calor: venta por día y hora ─── */
.mapa-calor { display: flex; flex-direction: column; gap: 8px; }
.mapa-calor-rejilla { display: grid; gap: 3px; align-items: center; }
.mapa-calor-hora { font-size: 0.7rem; color: var(--tinta-2); text-align: center; }
.mapa-calor-dia { font-size: 0.75rem; font-weight: 700; color: var(--tinta-2); }
.mapa-calor-celda {
  min-width: 0; aspect-ratio: 1; max-height: 40px; padding: 0; border: 1px solid var(--papel-2); border-radius: 4px;
  background: var(--papel-2); cursor: pointer;
}
.mapa-calor-celda:disabled { background: transparent; cursor: default; }
.mapa-calor-celda[aria-pressed="true"] { outline: 2px solid var(--tinta); outline-offset: 1px; }
```

- [ ] **Step 6: Typecheck, pruebas, build y revisión en local**

Run: `npm run typecheck && npm test && npm run build` → Expected: sin errores.

En local, con una página temporal bajo `/login/` (el middleware la deja pasar sin sesión) que lea el fixture con `extraerDatosBrutos` y pinte `<SeccionesPedidos diasSinDetalle={2} />`, en ancho de celular: sin scroll horizontal; resumen "Pico dom 14 h"; el detalle del mapa dice "dom 14 h · $3,739.00 · 11 pedidos · hora pico"; Canales con Mostrador, Kiosco, App y Entrega; 9 cancelados sin rojo (9/334 < 3 %); cocina 11 min; combos El de Siempre 8 · $1,480.00. Borra la página temporal antes del commit.

- [ ] **Step 7: Commit**

```bash
git add app/ventas/datos.ts app/ventas/page.tsx app/ventas/SeccionesPedidos.tsx components/MapaCalor.tsx app/globals.css
git commit -m "Ventas: venta por hora, canales, personal y cancelados, tiempos de cocina y combos"
```

---

### Task 5: Manual, verificación y publicación

**Files:**
- Modify: `README.md` (sección "Ventas y costos")

- [ ] **Step 1: Manual** — en la sección `## Ventas y costos (importados de Dodo IS)` de `README.md`, reemplaza el párrafo de **Importar** por:

```markdown
- **Importar** (solo admin): se sube el archivo **Datos brutos** de Dodo IS (Informes → Datos brutos), de cualquier
  periodo de hasta 92 días y de una o varias sucursales → **Revisar** muestra cada día con pedidos, venta, comidas del
  personal y cancelados, y qué productos no tienen categoría o costo → **Guardar**. Si trae días ya importados,
  **Reimportar** los reemplaza completos (hay que marcar la casilla). El archivo no se guarda. Mientras se activa la API
  de Dodo IS, esta es la forma de cargar ventas; la API llenará los mismos datos.
- **Reportes por pedido:** venta por hora (mapa de calor), canales, comidas del personal y cancelados, tiempos de cocina
  y combos. Los días importados con el formato anterior (Ventas + ProductsSales) no tienen este detalle hasta reimportarlos.
```

y agrega a **Puesta en marcha**:

```markdown
4. `supabase/migrations/0007_datos_brutos.sql`
5. `supabase/pruebas/0007_datos_brutos.sql`: debe terminar con el error `PRUEBAS OK — …`.
6. `update sucursales set m2_comedor = 61 where nombre = 'Zapopan-1';` (para la venta por m²).
```

- [ ] **Step 2: Verificación completa**

Run: `npm run typecheck && npm test && npm run build` → Expected: sin errores; todas las pruebas pasan.

- [ ] **Step 3: Commit, push y revisión independiente**

```bash
git add README.md
git commit -m "Manual: importar Datos brutos y reportes por pedido"
git push origin ventas-datos-brutos
```

Un revisor nuevo revisa `git diff main...ventas-datos-brutos` contra el spec y este plan (Review Focus incluido). Corregir lo que encuentre.

- [ ] **Step 4: Puerta PRUEBAS OK y fusión**

Sebastián corre `0007_datos_brutos.sql` y `pruebas/0007_datos_brutos.sql` y confirma `PRUEBAS OK — …`, y el `update` de m² de Zapopan-1. Solo entonces fusionar a `main`, publicar y copiar los archivos a `C:\Users\sebcm\Downloads\dodo-control-efectivo_1\dodo-efectivo`. Después: importar Datos brutos del 21–28/09/2026 y, con un día que tenga pedidos de app, comparar contra el reporte de Ventas de Dodo IS para confirmar la regla de llevadera.
