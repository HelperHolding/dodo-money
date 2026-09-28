# Ventas y costos importados de Dodo IS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El admin importa cada día los dos reportes de Dodo IS (Ventas y ProductsSales) y admin, corporativo y gerentes ven venta diaria, productos, descuentos, costo teórico con costo promedio ponderado y diferencias contra el cierre del gerente.

**Architecture:** Un lector de `.xlsx` propio (ZIP + XML con `node:zlib`, sin dependencias) y extractores puros convierten los reportes en datos; una server action los valida y muestra una vista previa, y otra los vuelve a leer y los guarda con la función `importar_ventas_dia` (security definer, solo admin). Los reportes leen tablas con RLS y la vista `ventas_producto_costeo`, y todos los cálculos viven en `lib/ventas/calculos.ts`, probados con los archivos reales del 25/09/2026. Ventas vive en `app/ventas/` con layout propio (fuera de `(app)`), porque admin y corporativo ven todas las sucursales.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, TypeScript estricto, Supabase (Postgres + RLS), pruebas con `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-09-28-ventas-costos-design.md`

## Global Constraints

- Sin dependencias nuevas: el `.xlsx` se lee con `node:zlib` (`inflateRawSync`) y expresiones regulares.
- Los módulos de `lib/` que se prueban con node solo importan de otros módulos locales con `import type` (node no resuelve `./x` sin extensión); `node:*` sí se puede importar.
- Día de Dodo IS = fecha del periodo del reporte (`25/09/2026 12:00:00 a.m. - 25/09/2026 11:59:00 p.m.` → `2026-09-25`); un solo día por par de archivos.
- Cuadre: |total de Ventas − Σ importes de Productos| > $1 → aviso; se guarda solo con confirmación.
- Comparación con cierre: |diferencia| > $1 (o > 0 pedidos) → rojo.
- Venta neta = total − IVA; importe neto por producto = importe × (total − IVA) / total del día.
- Costo % = costo teórico ÷ venta neta **de los productos con costo**; costo promedio ponderado = costo teórico ÷ piezas con costo.
- Permisos: importar, reimportar, categorías y costos → solo admin. Ver reportes → admin y corporativo todas las sucursales, gerente la suya. Encargado y cajero no ven ventas.
- Seed: `vigente_desde = 2026-08-09`, `fuente = 'UC Mexico 09/08/2026'`; costo teórico del 25/09/2026 = **2187.19**.
- Celular primero: tarjetas y secciones plegables, sin tablas anchas ni scroll horizontal.
- Textos de la app en español; los errores son los del spec (sección "Errores").
- Nada se publica en `main` hasta que Sebastián corra el SQL y vea `PRUEBAS OK`.

## Review Focus

1. **Día sin ventas (sucursal cerrada):** el reporte de productos no trae renglones y el total es 0 → se importa en ceros, sin error ni división entre cero. Pruebas: "un día sin ventas…" (Tarea 2) y "día sin ventas se importa en ceros" (Tarea 1, SQL).
2. **Periodos largos con todas las sucursales pasan de 1000 renglones** (Supabase corta ahí sin avisar) → los reportes no deben quedar truncados. `leerTodo` pagina; pruebas en `lib/ventas/paginar.test.ts` (Tarea 3).
3. **Archivo cambiado entre Revisar y Guardar:** Guardar vuelve a leer lo que se envía; si ahora hace falta confirmar (no cuadra o ya estaba importado) y la casilla no está, no guarda. Prueba de `necesitaConfirmacion` (Tarea 2); la action la usa (Tarea 5).
4. **Nombre de sucursal escrito distinto** ("zapopan-1", espacios dobles) → se encuentra; uno realmente distinto ("Zapopan 1") da el error con el nombre leído. Prueba de `buscarSucursal` (Tarea 2).
5. **Día de Dodo IS (0:00–23:59) contra día de la app (corte 4:00):** ventas después de medianoche pueden dar diferencias en la comparación con el cierre; la pantalla lo explica. Revisión manual en la Tarea 8.

Decisiones del plan que precisan el spec: `costos_producto.nota` guarda el aviso de costo dudoso que la pantalla de Costos señala; la sucursal se busca sin distinguir mayúsculas ni espacios repetidos; un día sin ventas se puede importar; el menú de Ventas y el de la vista general de corporativo se arman en `lib/roles.ts`.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/0006_ventas_costos.sql` | Tablas, RLS, `importar_ventas_dia`, `costo_vigente`, `asignar_categoria`, vista `ventas_producto_costeo` |
| `supabase/seed_ventas_costos.sql` | Catálogo y costos iniciales (UC Mexico 09/08/2026) |
| `supabase/pruebas/0006_ventas_costos.sql` | Pruebas de permisos, importación, reimportación y costeo |
| `lib/ventas/xlsx.ts` | Leer la primera hoja de un `.xlsx` → `Hoja` |
| `lib/ventas/extraer.ts` | `Hoja` → reporte de Ventas / de Productos; cuadre; buscar sucursal |
| `lib/ventas/calculos.ts` | Tamaño, costo vigente, resumen, costeo, top, descuentos, cierre, periodos |
| `lib/ventas/paginar.ts` | Leer todas las páginas de una consulta de Supabase |
| `lib/ventas/__fixtures__/*.xlsx` | Los dos reportes reales del 25/09/2026 (repo privado) |
| `lib/roles.ts` | Permisos de ventas y menús |
| `lib/formato.ts` | `fechaTexto`, `porcentaje` |
| `components/Nav.tsx` | Menú: recibe los enlaces; marca el de ruta más larga |
| `components/Plegable.tsx` | Movido desde `app/(app)/checklists/` para usarlo también en Ventas |
| `components/Grafica.tsx` | Barras horizontales en SVG |
| `app/ventas/layout.tsx`, `error.tsx` | Encabezado, menú y guardia de rol de Ventas |
| `app/ventas/importar/*` | Revisar y guardar la importación |
| `app/ventas/costos/*` | Categorías y costos por producto |
| `app/ventas/page.tsx`, `datos.ts` | Reportes |

Todas las rutas son relativas a la raíz del repo `dodo-money`, rama `ventas-costos`.

---

### Task 1: Base de datos

**Files:**
- Create: `supabase/migrations/0006_ventas_costos.sql`
- Create: `supabase/seed_ventas_costos.sql`
- Create: `supabase/pruebas/0006_ventas_costos.sql`

**Interfaces:**
- Produces (lo usan las Tareas 5–7):
  - `importar_ventas_dia(p_sucursal uuid, p_fecha date, p_resumen jsonb, p_desglose jsonb, p_productos jsonb, p_archivos jsonb, p_reemplazar boolean) returns uuid`. `p_resumen`: `{pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2}`; `p_desglose`: `[{tipo, pedidos, total, efectivo, tarjeta, en_linea, iva}]`; `p_productos`: `[{dodo_id, nombre, tamano, cantidad, importe, importe_sin_descuento}]`; `p_archivos`: `{ventas, productos}`. Errores: `Solo un administrador importa ventas.`, `Ese día ya se importó.`
  - `asignar_categoria(p_dodo_id integer, p_categoria categoria_producto) returns void` (null = sin categoría).
  - Insert directo en `costos_producto (dodo_id, costo, vigente_desde, fuente)` (política: solo admin; `registrado_por` se llena solo).
  - Vista `ventas_producto_costeo`: `sucursal_id, fecha, dodo_id, nombre, categoria, tamano, cantidad, importe, importe_sin_descuento, importe_neto, costo_unitario, costo_teorico`.
  - Tablas legibles: `ventas_dia` (+ `ventas_dia_desglose` embebible), `ventas_producto`, `productos_venta`, `costos_producto (…, nota)`, `importaciones_ventas`.

Nadie en esta sesión puede correr SQL en Supabase: Sebastián lo corre y reporta el resultado. Esta tarea escribe los tres archivos; la puerta `PRUEBAS OK` se cierra antes de fusionar (Tarea 8).

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0006_ventas_costos.sql`:

```sql
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
```

- [ ] **Step 2: Escribir el seed**

`supabase/seed_ventas_costos.sql` (nombres exactos como vienen en ProductsSales del 25/09/2026):

```sql
-- Catálogo inicial de productos y costos (modelo UC Mexico, snapshot del 09/08/2026).
-- Requiere 0006. Se puede correr más de una vez: no duplica ni pisa lo que ya exista.
-- Los productos que aparezcan después se agregan solos al importar; el admin les pone categoría y costo.

insert into productos_venta (dodo_id, nombre, categoria, tamano) values
  (27,  'Margarita Mediano',            'pizza',  'mediano'),
  (33,  'Hawaiana Mediano',             'pizza',  'mediano'),
  (40,  'Pepperoni Mediano',            'pizza',  'mediano'),
  (42,  'Pepperoni Grande',             'pizza',  'grande'),
  (43,  'Pepperoni Grande T',           'pizza',  'grande'),
  (64,  'Quatro quesos Pequeño',        'pizza',  'pequeno'),
  (65,  'Quatro quesos Mediano',        'pizza',  'mediano'),
  (67,  'Quatro quesos Grande',         'pizza',  'grande'),
  (70,  'Jamón y champiñones Pequeño',  'pizza',  'pequeno'),
  (71,  'Jamón y champiñones Mediano',  'pizza',  'mediano'),
  (73,  'Jamón y champiñones Grande',   'pizza',  'grande'),
  (80,  'Pollo hawai supreme Mediano',  'pizza',  'mediano'),
  (87,  'Dodo Supreme Pequeño',         'pizza',  'pequeno'),
  (96,  'Pepperoni Mango Grande',       'pizza',  'grande'),
  (108, 'Pollo BBQ Mediano',            'pizza',  'mediano'),
  (115, 'Tres Carnes Mediano',          'pizza',  'mediano'),
  (117, 'Tres Carnes Grande',           'pizza',  'grande'),
  (139, 'Ranch Picante Mediano',        'pizza',  'mediano'),
  (145, 'Bacorn BBQ Mediano',           'pizza',  'mediano'),
  (165, 'BBQ Carne Supreme Grande',     'pizza',  'grande'),
  (171, 'Carbonara Grande',             'pizza',  'grande'),
  (187, 'Crema champiñonas Pequeño',    'pizza',  'pequeno'),
  (161, 'Dodster Classico 1 pza',       'snack',  null),
  (202, 'Dodster cheesy spicy 1 pza',   'snack',  null),
  (204, 'Dodster chimichurri 1 pza',    'snack',  null),
  (199, 'Papas francesas Grande',       'snack',  'grande'),
  (200, 'Papas Gajo Medium',            'snack',  'mediano'),
  (201, 'Papas Gajo Grande',            'snack',  'grande'),
  (208, 'Alitas Buffalo 10 uds',        'snack',  null),
  (156, 'Coca-Cola 0,6 L',              'bebida', null),
  (157, 'Coca-Cola 2 L',                'bebida', null)
on conflict (dodo_id) do nothing;

-- Bebidas sin costo todavía (falta el costo de compra).
insert into costos_producto (dodo_id, costo, vigente_desde, fuente, nota) values
  (27,  26.74, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (33,  44.09, '2026-08-09', 'UC Mexico 09/08/2026', 'Dudoso en el modelo: la de 30 cm cuesta más que la de 35 cm.'),
  (40,  32.66, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (42,  42.00, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (43,  40.32, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (64,  39.39, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (65,  41.13, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (67,  44.01, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (70,  29.76, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (71,  35.21, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (73,  48.28, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (80,  51.70, '2026-08-09', 'UC Mexico 09/08/2026', 'Dudoso en el modelo: costo muy alto.'),
  (87,  42.87, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (96,  43.13, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (108, 45.51, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (115, 48.58, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (117, 72.99, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (139, 39.77, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (145, 41.57, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (165, 69.07, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (171, 70.02, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (187, 48.68, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (161, 25.49, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (202, 23.66, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (204, 21.38, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (199, 16.48, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (200, 12.56, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (201, 19.58, '2026-08-09', 'UC Mexico 09/08/2026', null),
  (208, 28.26, '2026-08-09', 'UC Mexico 09/08/2026', 'Costo "Wings" del modelo; puede ser de una orden más chica.')
on conflict (dodo_id, vigente_desde) do nothing;
```

- [ ] **Step 3: Escribir las pruebas SQL**

`supabase/pruebas/0006_ventas_costos.sql`:

```sql
-- Pruebas de la migración 0006 (ventas y costos importados de Dodo IS). Córrelas completas en Supabase → SQL Editor,
-- después de 0006_ventas_costos.sql y seed_ventas_costos.sql.
-- Necesitan dos usuarios activos con sucursal; sus roles cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc_a uuid; v_suc_b uuid;
  v_imp1 uuid; v_imp2 uuid; v_n int; v_num numeric; v_txt text;
  v_ok text[] := '{}';
  -- Un día de prueba: un producto del seed (27) y uno nuevo (999001).
  v_resumen jsonb := '{"pedidos": 3, "total": 243.4, "efectivo": 143.4, "tarjeta": 100, "en_linea": 0, "iva": 33.57, "venta_m2": 1.5}';
  v_desglose jsonb := '[{"tipo": "restaurante", "pedidos": 3, "total": 243.4, "efectivo": 143.4, "tarjeta": 100, "en_linea": 0, "iva": 33.57}]';
  v_productos jsonb := '[{"dodo_id": 27, "nombre": "Margarita Mediano", "tamano": "mediano", "cantidad": 1, "importe": 143.4, "importe_sin_descuento": 169},
                         {"dodo_id": 999001, "nombre": "Prueba Grande", "tamano": "grande", "cantidad": 2, "importe": 100, "importe_sin_descuento": 100}]';
  v_archivos jsonb := '{"ventas": "Ventas.xlsx", "productos": "ProductsSales.xlsx"}';
begin
  select p.id, p.sucursal_id, o.id into v_a, v_suc_a, v_b
    from perfiles p join perfiles o on o.id <> p.id and o.activo and o.sucursal_id is not null
   where p.activo and p.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos con sucursal.'; end if;
  select id into v_suc_b from sucursales where id <> v_suc_a limit 1;
  if v_suc_b is null then insert into sucursales (nombre) values ('Prueba ventas') returning id into v_suc_b; end if;
  if costo_vigente(27, '2026-09-25') is distinct from 26.74 then raise exception 'FALTAN DATOS: corre seed_ventas_costos.sql.'; end if;

  -- ── Gerente: no importa, no maneja costos ni categorías ───────────────────
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    perform importar_ventas_dia(v_suc_a, '2000-01-02', v_resumen, v_desglose, v_productos, v_archivos, false);
    raise exception 'FALLÓ: un gerente no debe importar ventas';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador importa%' then raise exception 'FALLÓ: mensaje inesperado (gerente importa): %', sqlerrm; end if;
  end;
  begin
    insert into costos_producto (dodo_id, costo, vigente_desde) values (27, 1, '2000-01-01');
    raise exception 'FALLÓ: un gerente no debe registrar costos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (gerente costo): %', sqlerrm; end if;
  end;
  begin
    perform asignar_categoria(27, 'snack');
    raise exception 'FALLÓ: un gerente no debe asignar categorías';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador asigna%' then raise exception 'FALLÓ: mensaje inesperado (gerente categoría): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'gerente no importa ni maneja costos');

  -- ── Admin: importa, reimporta, costos y categorías ────────────────────────
  execute 'reset role';
  update perfiles set rol = 'admin' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  v_imp1 := importar_ventas_dia(v_suc_b, '2000-01-02', v_resumen, v_desglose, v_productos, v_archivos, false);
  select count(*) into v_n from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02' and total = 243.4 and pedidos = 3 and importacion_id = v_imp1;
  if v_n <> 1 then raise exception 'FALLÓ: la importación debe guardar el día'; end if;
  select count(*) into v_n from ventas_dia_desglose d join ventas_dia v on v.id = d.ventas_dia_id where v.sucursal_id = v_suc_b and v.fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: la importación debe guardar el desglose (guardó %)', v_n; end if;
  select count(*) into v_n from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 2 then raise exception 'FALLÓ: la importación debe guardar 2 productos (guardó %)', v_n; end if;
  select tamano || '|' || coalesce(categoria::text, 'sin') into v_txt from productos_venta where dodo_id = 999001;
  if v_txt is distinct from 'grande|sin' then raise exception 'FALLÓ: el producto nuevo debe entrar grande y sin categoría (quedó %)', v_txt; end if;
  select suma_productos into v_num from importaciones_ventas where id = v_imp1;
  if v_num <> 243.4 then raise exception 'FALLÓ: la bitácora debe guardar la suma de productos (guardó %)', v_num; end if;
  v_ok := array_append(v_ok, 'admin importa y el producto nuevo entra al catálogo');

  begin
    perform importar_ventas_dia(v_suc_b, '2000-01-02', v_resumen, v_desglose, v_productos, v_archivos, false);
    raise exception 'FALLÓ: el mismo día no se debe importar dos veces sin reimportar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Ese día ya se importó%' then raise exception 'FALLÓ: mensaje inesperado (doble importación): %', sqlerrm; end if;
  end;

  v_imp2 := importar_ventas_dia(v_suc_b, '2000-01-02', v_resumen || '{"total": 300}', v_desglose,
                                jsonb_build_array(v_productos->1), v_archivos, true);
  select count(*) into v_n from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: reimportar debe dejar un solo día (hay %)', v_n; end if;
  select total into v_num from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_num <> 300 then raise exception 'FALLÓ: reimportar debe reemplazar el total (quedó %)', v_num; end if;
  select count(*) into v_n from ventas_producto where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: reimportar debe reemplazar los productos (quedaron %)', v_n; end if;
  select count(*) into v_n from importaciones_ventas where id = v_imp2 and reemplaza_id = v_imp1 and total_anterior = 243.4;
  if v_n <> 1 then raise exception 'FALLÓ: la bitácora debe guardar qué reemplazó y el total anterior'; end if;
  select count(*) into v_n from importaciones_ventas where sucursal_id = v_suc_b and fecha = '2000-01-02';
  if v_n <> 2 then raise exception 'FALLÓ: la bitácora debe conservar las dos importaciones (hay %)', v_n; end if;
  v_ok := array_append(v_ok, 'reimportar reemplaza el día y deja bitácora');

  -- Día sin ventas: sin productos y total 0 (sucursal cerrada).
  perform importar_ventas_dia(v_suc_b, '2000-01-03', '{"pedidos": 0, "total": 0, "efectivo": 0, "tarjeta": 0, "en_linea": 0, "iva": 0}',
                              '[]', '[]', v_archivos, false);
  select count(*) into v_n from ventas_dia where sucursal_id = v_suc_b and fecha = '2000-01-03' and total = 0 and venta_m2 is null;
  if v_n <> 1 then raise exception 'FALLÓ: un día sin ventas se debe poder importar en ceros'; end if;
  v_ok := array_append(v_ok, 'día sin ventas se importa en ceros');

  -- Costos por fecha de vigencia.
  insert into costos_producto (dodo_id, costo, vigente_desde, fuente) values (999001, 10, '2000-01-01', 'prueba'), (999001, 12, '2000-01-05', 'prueba');
  if costo_vigente(999001, '1999-12-31') is not null then raise exception 'FALLÓ: antes de la vigencia no hay costo'; end if;
  if costo_vigente(999001, '2000-01-02') <> 10 then raise exception 'FALLÓ: el 2 de enero aplica el costo de 10'; end if;
  if costo_vigente(999001, '2000-01-05') <> 12 then raise exception 'FALLÓ: desde el 5 de enero aplica el costo de 12'; end if;
  select count(*) into v_n from costos_producto where dodo_id = 999001 and registrado_por = v_a;
  if v_n <> 2 then raise exception 'FALLÓ: el costo debe quedar registrado por quien lo capturó'; end if;
  begin
    insert into costos_producto (dodo_id, costo, vigente_desde, registrado_por) values (999001, 13, '2000-01-06', v_b);
    raise exception 'FALLÓ: nadie registra un costo a nombre de otro';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (costo a nombre de otro): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'costo vigente por fecha');

  -- La vista: costo teórico e importe neto (sin IVA, prorrateado).
  select costo_teorico into v_num from ventas_producto_costeo where sucursal_id = v_suc_b and fecha = '2000-01-02' and dodo_id = 999001;
  if v_num <> 20 then raise exception 'FALLÓ: costo teórico debe ser 2 × 10 = 20 (dio %)', v_num; end if;
  select round(importe_neto, 2) into v_num from ventas_producto_costeo where sucursal_id = v_suc_b and fecha = '2000-01-02' and dodo_id = 999001;
  if v_num <> round(100 * (300 - 33.57) / 300, 2) then raise exception 'FALLÓ: importe neto mal prorrateado (dio %)', v_num; end if;
  v_ok := array_append(v_ok, 'vista de costeo');

  perform asignar_categoria(999001, 'snack');
  select categoria::text into v_txt from productos_venta where dodo_id = 999001;
  if v_txt is distinct from 'snack' then raise exception 'FALLÓ: admin debe poder asignar categoría'; end if;
  v_ok := array_append(v_ok, 'admin asigna categoría');

  -- Un día en la sucursal del admin, para probar qué ve el gerente.
  perform importar_ventas_dia(v_suc_a, '2000-01-02', v_resumen, v_desglose, v_productos, v_archivos, false);

  -- ── Gerente: ve solo su sucursal, y el catálogo con costos ─────────────────
  execute 'reset role';
  update perfiles set rol = 'gerente' where id = v_a;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from ventas_dia where fecha between '2000-01-02' and '2000-01-03';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver solo su sucursal (ve % días)', v_n; end if;
  select count(distinct sucursal_id) into v_n from ventas_producto where fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver productos solo de su sucursal'; end if;
  select count(*) into v_n from ventas_dia_desglose d join ventas_dia v on v.id = d.ventas_dia_id where v.fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver el desglose solo de su sucursal (ve %)', v_n; end if;
  select count(*) into v_n from importaciones_ventas where fecha = '2000-01-02';
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver la bitácora solo de su sucursal (ve %)', v_n; end if;
  select count(*) into v_n from costos_producto where dodo_id = 999001;
  if v_n <> 2 then raise exception 'FALLÓ: el gerente debe ver los costos'; end if;
  select count(*) into v_n from ventas_producto_costeo where fecha = '2000-01-02' and costo_teorico is not null;
  if v_n <> 1 then raise exception 'FALLÓ: el gerente debe ver el costo teórico de su sucursal (ve %)', v_n; end if;
  v_ok := array_append(v_ok, 'gerente ve solo su sucursal');

  -- ── Encargado y cajero: no ven ventas ni costos ───────────────────────────
  foreach v_txt in array array['encargado', 'cajero'] loop
    execute 'reset role';
    update perfiles set rol = v_txt::rol_usuario where id = v_a;
    perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select (select count(*) from ventas_dia) + (select count(*) from ventas_producto) + (select count(*) from productos_venta)
         + (select count(*) from costos_producto) + (select count(*) from importaciones_ventas) + (select count(*) from ventas_dia_desglose)
      into v_n;
    if v_n <> 0 then raise exception 'FALLÓ: % no debe ver ventas ni costos (ve % renglones)', v_txt, v_n; end if;
  end loop;
  v_ok := array_append(v_ok, 'encargado y cajero no ven ventas');

  -- ── Corporativo: ve todo, no escribe ──────────────────────────────────────
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(distinct sucursal_id) into v_n from ventas_dia where fecha = '2000-01-02';
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe ver ventas de las dos sucursales (ve %)', v_n; end if;
  select count(*) into v_n from productos_venta where dodo_id = 999001;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo debe ver el catálogo'; end if;
  begin
    perform importar_ventas_dia(v_suc_a, '2000-01-04', v_resumen, v_desglose, v_productos, v_archivos, false);
    raise exception 'FALLÓ: corporativo no debe importar';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador importa%' then raise exception 'FALLÓ: mensaje inesperado (corporativo importa): %', sqlerrm; end if;
  end;
  begin
    insert into costos_producto (dodo_id, costo, vigente_desde) values (27, 1, '2000-01-01');
    raise exception 'FALLÓ: corporativo no debe registrar costos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (corporativo costo): %', sqlerrm; end if;
  end;
  begin
    perform asignar_categoria(27, 'snack');
    raise exception 'FALLÓ: corporativo no debe asignar categorías';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un administrador asigna%' then raise exception 'FALLÓ: mensaje inesperado (corporativo categoría): %', sqlerrm; end if;
  end;
  update ventas_dia set total = 1 where fecha = '2000-01-02';
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'FALLÓ: nadie modifica ventas_dia directamente'; end if;
  v_ok := array_append(v_ok, 'corporativo ve todo y no escribe');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 4: Revisar a ojo contra el spec**

Revisa que cada regla de "Permisos" del spec tenga su prueba: gerente no importa/costea/categoriza; admin sí; gerente ve solo su sucursal (días, desglose, productos, bitácora, costeo); encargado y cajero ven 0 renglones de las seis tablas; corporativo ve dos sucursales y no escribe; reimportar deja bitácora con `total_anterior`; costo vigente por fecha; día sin ventas.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_ventas_costos.sql supabase/seed_ventas_costos.sql supabase/pruebas/0006_ventas_costos.sql
git commit -m "Ventas y costos: migración 0006, seed de costos UC Mexico y pruebas SQL"
```

---

### Task 2: Lector de xlsx y extractores de los reportes

**Files:**
- Create: `lib/ventas/__fixtures__/ventas-2026-09-25.xlsx` (copia de `C:\Users\sebcm\Downloads\Ventas (2026-09-25 - 2026-09-25).xlsx`)
- Create: `lib/ventas/__fixtures__/productos-2026-09-25.xlsx` (copia de `C:\Users\sebcm\Downloads\ProductsSales (1).xlsx`)
- Create: `lib/ventas/xlsx.ts`, `lib/ventas/extraer.ts`
- Test: `lib/ventas/extraer.test.ts`
- Modify: `package.json` (script `test`)

**Interfaces:**
- Produces:
  - `type Hoja = { nombre: string; celdas: ReadonlyMap<string, string | number> }`
  - `leerPrimeraHoja(datos: Uint8Array): Hoja` — lanza `NO_ES_XLSX` ("El archivo no es un Excel (.xlsx) válido.")
  - `fechaDeSerial(serial: number): string`
  - `type Montos = { pedidos; total; efectivo; tarjeta; en_linea; iva }` (números)
  - `type TipoDesglose = "entrega" | "llevadera" | "restaurante" | "centro_llamadas" | "sitio" | "app" | "agregador"`, `type Desglose = Montos & { tipo }`
  - `type ReporteVentas = { sucursal; fecha; resumen: Montos & { venta_m2: number | null }; desglose: Desglose[] }`
  - `type ProductoVendido = { dodo_id; nombre; cantidad; importe; importe_sin_descuento }`, `type ReporteProductos = { sucursal; fecha; productos: ProductoVendido[] }`
  - `extraerVentas(h: Hoja): ReporteVentas`, `extraerProductos(h: Hoja): ReporteProductos`
  - `revisarPar(v, p): { sumaProductos; diferencia; cuadra }` — lanza si sucursal o fecha no coinciden
  - `buscarSucursal<T extends { nombre: string }>(nombre, sucursales): T | null`
  - `necesitaConfirmacion({ cuadra, yaImportado }): boolean`
  - `limpiarTexto(t)`, constantes `NO_ES_VENTAS`, `NO_ES_PRODUCTOS`, `VARIOS_DIAS`, `SIN_DESCUENTOS`

- [ ] **Step 1: Copiar los fixtures**

```bash
mkdir -p lib/ventas/__fixtures__
cp "/c/Users/sebcm/Downloads/Ventas (2026-09-25 - 2026-09-25).xlsx" lib/ventas/__fixtures__/ventas-2026-09-25.xlsx
cp "/c/Users/sebcm/Downloads/ProductsSales (1).xlsx" lib/ventas/__fixtures__/productos-2026-09-25.xlsx
```

(El repo es privado: se verificó con la API de GitHub. No subas estos archivos a un repo público.)

- [ ] **Step 2: Escribir las pruebas**

`lib/ventas/extraer.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fechaDeSerial, leerPrimeraHoja, NO_ES_XLSX, type Hoja } from "./xlsx.ts";
import { buscarSucursal, extraerProductos, extraerVentas, limpiarTexto, necesitaConfirmacion, NO_ES_PRODUCTOS, NO_ES_VENTAS, revisarPar, SIN_DESCUENTOS, VARIOS_DIAS } from "./extraer.ts";

const fixture = (nombre: string) => leerPrimeraHoja(readFileSync(new URL(`./__fixtures__/${nombre}`, import.meta.url)));
const ventas = fixture("ventas-2026-09-25.xlsx");
const productos = fixture("productos-2026-09-25.xlsx");

/** Copia de una hoja con algunas celdas cambiadas. */
const con = (h: Hoja, cambios: Record<string, string | number>): Hoja => ({ nombre: h.nombre, celdas: new Map([...h.celdas, ...Object.entries(cambios)]) });

test("lee la primera hoja de los dos archivos reales", () => {
  assert.equal(ventas.nombre, "Ventas");
  assert.equal(productos.nombre, "Precios locales");
  assert.equal(ventas.celdas.get("D2"), "Zapopan-1");
  assert.equal(ventas.celdas.get("G10"), 1066.97);
});

test("fechaDeSerial convierte el serial de Excel", () => {
  assert.equal(fechaDeSerial(46290), "2026-09-25");
  assert.equal(fechaDeSerial(46290.9083), "2026-09-25");
});

test("un archivo que no es xlsx se rechaza con un mensaje claro", () => {
  assert.throws(() => leerPrimeraHoja(new TextEncoder().encode("hola")), /no es un Excel/);
});

test("extraerVentas: resumen, desglose y m² del 25/09/2026", () => {
  const v = extraerVentas(ventas);
  assert.equal(v.sucursal, "Zapopan-1");
  assert.equal(v.fecha, "2026-09-25");
  assert.deepEqual(v.resumen, { pedidos: 39, total: 7736, efectivo: 4299, tarjeta: 3437, en_linea: 0, iva: 1066.97, venta_m2: 126.8 });
  assert.equal(v.desglose.length, 7);
  assert.deepEqual(v.desglose.find((d) => d.tipo === "restaurante"), { tipo: "restaurante", pedidos: 39, total: 7736, efectivo: 4299, tarjeta: 3437, en_linea: 0, iva: 1066.97 });
  assert.deepEqual(v.desglose.map((d) => d.tipo), ["entrega", "llevadera", "restaurante", "centro_llamadas", "sitio", "app", "agregador"]);
});

test("extraerProductos: 31 productos y nombres limpios", () => {
  const p = extraerProductos(productos);
  assert.equal(p.sucursal, "Zapopan-1");
  assert.equal(p.fecha, "2026-09-25");
  assert.equal(p.productos.length, 31);
  assert.deepEqual(p.productos[0], { dodo_id: 27, nombre: "Margarita Mediano", cantidad: 1, importe: 143.4, importe_sin_descuento: 169 });
  assert.equal(p.productos.find((x) => x.dodo_id === 200)?.nombre, "Papas Gajo Medium");
  assert.equal(p.productos.reduce((s, x) => s + x.cantidad, 0), 64);
});

test("el par del 25/09/2026 cuadra", () => {
  assert.deepEqual(revisarPar(extraerVentas(ventas), extraerProductos(productos)), { sumaProductos: 7736, diferencia: 0, cuadra: true });
});

test("archivos cruzados o equivocados se rechazan", () => {
  assert.throws(() => extraerVentas(productos), { message: NO_ES_VENTAS });
  assert.throws(() => extraerProductos(ventas), { message: NO_ES_PRODUCTOS });
});

test("un periodo de varios días se rechaza", () => {
  assert.throws(() => extraerVentas(con(ventas, { D3: "25/09/2026 12:00:00 a.m. - 26/09/2026 11:59:00 p.m." })), { message: VARIOS_DIAS });
  assert.throws(() => extraerProductos(con(productos, { B4: "25/09/2026 12:00:00 a.m.-27/09/2026 11:59:00 p.m." })), { message: VARIOS_DIAS });
  // Dos renglones de fecha en la tabla por día, aunque el periodo diga un día.
  assert.throws(() => extraerVentas(con(ventas, { A20: "Zapopan-1", B20: 46291, A21: "Zapopan-1", B21: "Total" })), { message: VARIOS_DIAS });
});

test("reporte de productos sin descuentos se rechaza", () => {
  assert.throws(() => extraerProductos(con(productos, { B9: "Sin descuentos" })), { message: SIN_DESCUENTOS });
});

test("un producto repetido se suma en un renglón", () => {
  const p = extraerProductos(con(productos, { A60: 46290.5, B60: 27, C60: "Margarita  Mediano", D60: 2, E60: 300, F60: 338 }));
  assert.equal(p.productos.length, 31);
  assert.deepEqual(p.productos.find((x) => x.dodo_id === 27), { dodo_id: 27, nombre: "Margarita Mediano", cantidad: 3, importe: 443.4, importe_sin_descuento: 507 });
});

test("revisarPar: sucursal o fecha distinta y descuadre", () => {
  const v = extraerVentas(ventas);
  const p = extraerProductos(productos);
  assert.throws(() => revisarPar(v, { ...p, sucursal: "Zapopan-2" }), /Ventas es de Zapopan-1 y el de Productos de Zapopan-2/);
  assert.throws(() => revisarPar(v, { ...p, fecha: "2026-09-26" }), /del 25 de septiembre y el de Productos del 26 de septiembre/);
  const r = revisarPar({ ...v, resumen: { ...v.resumen, total: 7856 } }, p);
  assert.deepEqual(r, { sumaProductos: 7736, diferencia: 120, cuadra: false });
});

test("limpiarTexto quita espacios dobles y sobrantes", () => {
  assert.equal(limpiarTexto("  Papas Gajo  Medium "), "Papas Gajo Medium");
});

test("un xlsx truncado o dañado se rechaza con el mismo mensaje", () => {
  const datos = readFileSync(new URL("./__fixtures__/ventas-2026-09-25.xlsx", import.meta.url));
  assert.throws(() => leerPrimeraHoja(datos.subarray(0, 3000)), { message: NO_ES_XLSX });
  const roto = Buffer.from(datos);
  roto.fill(0, 200, 1200);
  assert.throws(() => leerPrimeraHoja(roto), { message: NO_ES_XLSX });
});

test("un día sin ventas trae productos vacíos y cuadra en cero", () => {
  const celdas = new Map([...productos.celdas].filter(([ref]) => Number(ref.replace(/^[A-Z]+/, "")) <= 12));
  const p = extraerProductos({ nombre: productos.nombre, celdas });
  assert.deepEqual(p.productos, []);
  const v = extraerVentas(ventas);
  assert.deepEqual(revisarPar({ ...v, resumen: { ...v.resumen, total: 0 } }, p), { sumaProductos: 0, diferencia: 0, cuadra: true });
});

test("buscarSucursal ignora mayúsculas y espacios repetidos, no guiones", () => {
  const sucursales = [{ id: "1", nombre: "Zapopan-1" }, { id: "2", nombre: "Guadalajara Centro" }];
  assert.equal(buscarSucursal("zapopan-1", sucursales)?.id, "1");
  assert.equal(buscarSucursal(" Guadalajara  centro ", sucursales)?.id, "2");
  assert.equal(buscarSucursal("Zapopan 1", sucursales), null);
});

test("necesitaConfirmacion", () => {
  assert.equal(necesitaConfirmacion({ cuadra: true, yaImportado: false }), false);
  assert.equal(necesitaConfirmacion({ cuadra: false, yaImportado: false }), true);
  assert.equal(necesitaConfirmacion({ cuadra: true, yaImportado: true }), true);
});
```

- [ ] **Step 3: Correrlas para ver que fallan**

Run: `node --experimental-strip-types --test lib/ventas/extraer.test.ts`
Expected: FAIL con `Cannot find module …/lib/ventas/xlsx.ts`

- [ ] **Step 4: Escribir el lector**

`lib/ventas/xlsx.ts`. Las exportaciones de Dodo IS usan etiquetas con prefijo (`<x:c>`, `<x:si>`), la relación de la hoja con ruta absoluta (`/xl/worksheets/sheet1.xml`) y guardan tamaños en el directorio central; el lector acepta etiquetas con y sin prefijo y rutas absolutas y relativas:

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
  try {
    return leerHoja(datos);
  } catch {
    // ZIP truncado, XML roto o archivo de otro tipo: un solo mensaje entendible.
    throw new Error(NO_ES_XLSX);
  }
}

function leerHoja(datos: Uint8Array): Hoja {
  const archivos = archivosZip(datos);
  const leer = (ruta: string) => {
    const f = archivos.get(ruta.replace(/^\//, ""));
    if (!f) throw new Error(NO_ES_XLSX);
    return f();
  };

  const libro = leer("xl/workbook.xml");
  const hoja = /<(?:\w+:)?sheet\s[^>]*>/.exec(libro)?.[0];
  if (!hoja) throw new Error(NO_ES_XLSX);
  const nombre = desescapar(atributo(hoja, "name") ?? "");
  const idRel = atributo(hoja, "r:id");

  const relaciones = leer("xl/_rels/workbook.xml.rels");
  const rel = [...relaciones.matchAll(/<Relationship\s[^>]*>/g)].map((m) => m[0]).find((r) => atributo(r, "Id") === idRel);
  const destino = rel && atributo(rel, "Target");
  if (!destino) throw new Error(NO_ES_XLSX);
  const rutaHoja = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;

  const compartidas = archivos.has("xl/sharedStrings.xml")
    ? [...leer("xl/sharedStrings.xml").matchAll(/<(?:\w+:)?si>([\s\S]*?)<\/(?:\w+:)?si>/g)].map((m) => textos(m[1]))
    : [];

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
}

/** Número serial de Excel (sistema 1900) → "YYYY-MM-DD". */
export function fechaDeSerial(serial: number): string {
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000).toISOString().slice(0, 10);
}
```

- [ ] **Step 5: Escribir los extractores**

`lib/ventas/extraer.ts`. Las filas se ubican por texto (columna A, o B en los encabezados), no por número fijo:

```ts
import type { Hoja } from "./xlsx";

/** Lectura de las dos exportaciones diarias de Dodo IS ("Ventas" y "ProductsSales") ya convertidas en Hoja. */

export type Montos = { pedidos: number; total: number; efectivo: number; tarjeta: number; en_linea: number; iva: number };
export type TipoDesglose = "entrega" | "llevadera" | "restaurante" | "centro_llamadas" | "sitio" | "app" | "agregador";
export type Desglose = Montos & { tipo: TipoDesglose };
export type ReporteVentas = { sucursal: string; fecha: string; resumen: Montos & { venta_m2: number | null }; desglose: Desglose[] };
export type ProductoVendido = { dodo_id: number; nombre: string; cantidad: number; importe: number; importe_sin_descuento: number };
export type ReporteProductos = { sucursal: string; fecha: string; productos: ProductoVendido[] };

export const NO_ES_VENTAS = "Este archivo no parece un reporte de Ventas de Dodo IS.";
export const NO_ES_PRODUCTOS = "Este archivo no parece un reporte de Productos de Dodo IS.";
export const VARIOS_DIAS = "El archivo abarca varios días; exporta un solo día.";
export const SIN_DESCUENTOS = "El método de cálculo del reporte de productos debe ser Con descuentos.";

const TIPOS: Record<string, TipoDesglose> = {
  "entrega": "entrega",
  "llevadera": "llevadera",
  "restaurante": "restaurante",
  "centro de llamadas": "centro_llamadas",
  "sitio": "sitio",
  "aplicación móvil": "app",
  "agregador (tarjeta)": "agregador",
};

/** Espacios repetidos o sobrantes fuera: "Papas Gajo  Medium " → "Papas Gajo Medium". */
export const limpiarTexto = (t: string) => t.replace(/\s+/g, " ").trim();

const COLUMNAS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function lector(h: Hoja) {
  const valor = (col: string, fila: number) => h.celdas.get(`${col}${fila}`);
  const texto = (col: string, fila: number) => limpiarTexto(String(valor(col, fila) ?? ""));
  const num = (col: string, fila: number) => {
    const v = valor(col, fila);
    return typeof v === "number" ? v : Number(String(v ?? "").replace(/[$,\s]/g, "")) || 0;
  };
  const ultimaFila = Math.max(0, ...[...h.celdas.keys()].map((r) => Number(r.replace(/^[A-Z]+/, ""))));
  /** Primera fila, desde `desde`, cuya columna `col` dice exactamente `buscado`. */
  const fila = (col: string, buscado: string, desde = 1) => {
    for (let f = desde; f <= ultimaFila; f++) if (texto(col, f).toLowerCase() === buscado.toLowerCase()) return f;
    return 0;
  };
  /** Columna de la fila `f` cuyo encabezado es `buscado`. */
  const columna = (f: number, buscado: string) => [...COLUMNAS].find((c) => texto(c, f).toLowerCase() === buscado.toLowerCase());
  return { valor, texto, num, fila, columna, ultimaFila };
}

/** "25/09/2026 12:00:00 a.m. - 25/09/2026 11:59:00 p.m." → "2026-09-25"; si abarca dos fechas, error. */
function fechaDelPeriodo(periodo: string, error: string): string {
  const fechas = [...periodo.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)].map(([, d, m, a]) => `${a}-${m}-${d}`);
  if (fechas.length !== 2) throw new Error(error);
  if (fechas[0] !== fechas[1]) throw new Error(VARIOS_DIAS);
  return fechas[0];
}

export function extraerVentas(h: Hoja): ReporteVentas {
  const l = lector(h);
  if (l.texto("A", 1) !== "Informe" || l.texto("D", 1) !== "Ventas") throw new Error(NO_ES_VENTAS);
  const sucursal = l.texto("D", 2);
  const fecha = fechaDelPeriodo(l.texto("D", 3), NO_ES_VENTAS);

  const encabezado = l.fila("B", "Número de pedido");
  const cols = ["Número de pedido", "Total", "Efectivo", "Tarjeta", "En línea", "IMPUESTO"].map((t) => l.columna(encabezado, t));
  if (!encabezado || !sucursal || cols.some((c) => !c)) throw new Error(NO_ES_VENTAS);
  const [cPedidos, cTotal, cEfectivo, cTarjeta, cLinea, cIva] = cols as string[];
  const montos = (f: number): Montos => ({
    pedidos: Math.round(l.num(cPedidos, f)), total: l.num(cTotal, f), efectivo: l.num(cEfectivo, f),
    tarjeta: l.num(cTarjeta, f), en_linea: l.num(cLinea, f), iva: l.num(cIva, f),
  });

  const porDia = l.fila("A", "Unidad", encabezado);
  const filaTotal = l.fila("A", "Total", encabezado);
  if (!porDia || !filaTotal || filaTotal > porDia) throw new Error(NO_ES_VENTAS);

  const desglose: Desglose[] = [];
  for (let f = encabezado + 1; f < porDia; f++) {
    const tipo = TIPOS[l.texto("A", f).toLowerCase()];
    if (tipo) desglose.push({ tipo, ...montos(f) });
  }

  const cFecha = l.columna(porDia, "Fecha");
  const cM2 = l.columna(porDia, "Por m² de comedor");
  if (!cFecha) throw new Error(NO_ES_VENTAS);
  const dias: number[] = [];
  for (let f = porDia + 1; f <= l.ultimaFila; f++) if (typeof l.valor(cFecha, f) === "number") dias.push(f);
  if (dias.length > 1) throw new Error(VARIOS_DIAS);

  return {
    sucursal,
    fecha,
    resumen: { ...montos(filaTotal), venta_m2: dias.length && cM2 ? l.num(cM2, dias[0]) : null },
    desglose,
  };
}

export function extraerProductos(h: Hoja): ReporteProductos {
  const l = lector(h);
  if (l.texto("B", 1) !== "Informe de ventas de productos") throw new Error(NO_ES_PRODUCTOS);
  const sucursal = l.texto("B", 2);
  const fecha = fechaDelPeriodo(l.texto("B", 4), NO_ES_PRODUCTOS);
  const metodo = l.fila("A", "Método de cálculo");
  if (!metodo) throw new Error(NO_ES_PRODUCTOS);
  if (l.texto("B", metodo) !== "Con descuentos") throw new Error(SIN_DESCUENTOS);

  const encabezado = l.fila("B", "Identificador del producto");
  const cols = ["Identificador del producto", "Producto", "Cantidad", "Importe", "Cantidad sin descuento"].map((t) => l.columna(encabezado, t));
  if (!encabezado || !sucursal || cols.some((c) => !c)) throw new Error(NO_ES_PRODUCTOS);
  const [cId, cNombre, cCantidad, cImporte, cSinDescuento] = cols as string[];

  // Un producto repetido en el reporte se suma en un solo renglón.
  const porId = new Map<number, ProductoVendido>();
  for (let f = encabezado + 1; f <= l.ultimaFila; f++) {
    const id = l.valor(cId, f);
    if (typeof id !== "number") continue;
    const previo = porId.get(id);
    const cantidad = l.num(cCantidad, f), importe = l.num(cImporte, f), sinDescuento = l.num(cSinDescuento, f);
    porId.set(id, previo
      ? { ...previo, cantidad: previo.cantidad + cantidad, importe: previo.importe + importe, importe_sin_descuento: previo.importe_sin_descuento + sinDescuento }
      : { dodo_id: id, nombre: l.texto(cNombre, f), cantidad, importe, importe_sin_descuento: sinDescuento });
  }
  return { sucursal, fecha, productos: [...porId.values()] };
}

const fechaLarga = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
const diaDe = (fecha: string) => fechaLarga.format(new Date(`${fecha}T00:00:00Z`));

/** Revisa que los dos reportes sean del mismo día y sucursal; devuelve cuánto no cuadran (total − Σ importes). */
export function revisarPar(v: ReporteVentas, p: ReporteProductos): { sumaProductos: number; diferencia: number; cuadra: boolean } {
  if (v.sucursal !== p.sucursal) throw new Error(`El reporte de Ventas es de ${v.sucursal} y el de Productos de ${p.sucursal}.`);
  if (v.fecha !== p.fecha) throw new Error(`El reporte de Ventas es del ${diaDe(v.fecha)} y el de Productos del ${diaDe(p.fecha)}.`);
  const sumaProductos = Math.round(p.productos.reduce((s, x) => s + x.importe, 0) * 100) / 100;
  const diferencia = Math.round((v.resumen.total - sumaProductos) * 100) / 100;
  return { sumaProductos, diferencia, cuadra: Math.abs(diferencia) <= 1 };
}

/** Sucursal de la app con el nombre del reporte, sin distinguir mayúsculas ni espacios repetidos. */
export function buscarSucursal<T extends { nombre: string }>(nombre: string, sucursales: readonly T[]): T | null {
  const clave = limpiarTexto(nombre).toLowerCase();
  return sucursales.find((s) => limpiarTexto(s.nombre).toLowerCase() === clave) ?? null;
}

/** Guardar pide la casilla de confirmación si los archivos no cuadran o si el día ya estaba importado. */
export const necesitaConfirmacion = (r: { cuadra: boolean; yaImportado: boolean }) => !r.cuadra || r.yaImportado;
```

- [ ] **Step 6: Correr las pruebas**

Run: `node --experimental-strip-types --test lib/ventas/extraer.test.ts`
Expected: PASS, 16 pruebas.

- [ ] **Step 7: Agregar al script de pruebas**

En `package.json`, al final de la lista de `"test"`, agrega ` lib/ventas/extraer.test.ts` (antes de la comilla de cierre):

```json
"test": "node --experimental-strip-types --test lib/franjas.test.ts lib/masa.test.ts lib/formato.test.ts lib/fotos.test.ts lib/roles.test.ts lib/corporativo.test.ts lib/limpiezaProfunda.test.ts lib/amasado.test.ts lib/zonas.test.ts lib/arqueo.test.ts lib/ventas/extraer.test.ts"
```

Run: `npm test` → Expected: todas pasan.

- [ ] **Step 8: Commit**

```bash
git add lib/ventas/xlsx.ts lib/ventas/extraer.ts lib/ventas/extraer.test.ts lib/ventas/__fixtures__ package.json
git commit -m "Ventas: lector de xlsx sin dependencias y extractores de los reportes de Dodo IS"
```

---

### Task 3: Cálculos de ventas y costo, y paginación

**Files:**
- Create: `lib/ventas/calculos.ts`, `lib/ventas/paginar.ts`
- Test: `lib/ventas/calculos.test.ts`, `lib/ventas/paginar.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `extraerVentas`, `extraerProductos`, `leerPrimeraHoja` (solo en pruebas); `type TipoDesglose` de `./extraer`.
- Produces (`lib/ventas/calculos.ts`):
  - `type Categoria`, `CATEGORIAS`, `NOMBRE_CATEGORIA`, `type Tamano`, `tamanoPorNombre(nombre): Tamano | null`
  - `type Costo = { vigente_desde; costo }`, `costoVigente<T extends Costo>(costos, fecha): T | null`
  - `type VentaDia = { sucursal_id; fecha; pedidos; total; efectivo; tarjeta; en_linea; iva; venta_m2 }`, `resumenVentas(dias) → { dias, total, iva, neta, pedidos, efectivo, tarjeta, en_linea, ticket: number | null }`
  - `type RenglonCosteo = { fecha; dodo_id; nombre; categoria; cantidad; importe; importe_sin_descuento; importe_neto; costo_unitario }` (un renglón de la vista)
  - `type ProductoPeriodo`, `porProducto(renglones): ProductoPeriodo[]`
  - `type CosteoGrupo`, `costeo(renglones) → { categorias: CosteoGrupo[]; total: CosteoGrupo; sinCosto: { dodo_id; nombre; piezas }[] }`
  - `topProductos(actual, anterior, n = 10)` (agrega `cambio: number | null`), `descuentos(productos, n = 5) → { total, sinDescuento, pct, top }`
  - `type CierreDia`, `type Diferencia`, `compararConCierre(v, c): Diferencia[]`, `diasConCierre(dias, cierres) → { comparados, sinCierre }`
  - `ventaPorDia(dias)`, `NOMBRE_TIPO`, `sumarDesglose(filas)`, `errorDeCosto(costo, vigenteDesde): string | null`
  - `type Periodo = { desde; hasta }`, `MAX_DIAS = 92`, `periodoPorDefecto(ultimo)`, `periodoElegido(desde, hasta, porDefecto)`, `periodoAnterior(p)`
- Produces (`lib/ventas/paginar.ts`): `TAMANO_PAGINA = 1000`, `leerTodo<T>(pagina: (desde, hasta) => PromiseLike<{ data: T[] | null; error }>): Promise<T[]>`

- [ ] **Step 1: Escribir las pruebas de cálculos**

`lib/ventas/calculos.test.ts` (reproduce lo que devolvería la vista con el seed cargado; los esperados salen de la corrida del 25/09/2026: pizzas 34.21 % y $43.66 por pieza, snacks 31.35 % y $19.02, total $2,187.19 = 33.84 %):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { leerPrimeraHoja } from "./xlsx.ts";
import { extraerProductos, extraerVentas } from "./extraer.ts";
import {
  compararConCierre, costeo, costoVigente, descuentos, diasConCierre, errorDeCosto, sumarDesglose, ventaPorDia, periodoAnterior, periodoElegido, periodoPorDefecto,
  porProducto, resumenVentas, tamanoPorNombre, topProductos, type Categoria, type RenglonCosteo, type VentaDia,
} from "./calculos.ts";

// Costos del seed (supabase/seed_ventas_costos.sql), vigentes desde 2026-08-09.
const SEED: Record<number, [Categoria, number | null]> = {
  27: ["pizza", 26.74], 33: ["pizza", 44.09], 40: ["pizza", 32.66], 42: ["pizza", 42.00], 43: ["pizza", 40.32],
  64: ["pizza", 39.39], 65: ["pizza", 41.13], 67: ["pizza", 44.01], 70: ["pizza", 29.76], 71: ["pizza", 35.21],
  73: ["pizza", 48.28], 80: ["pizza", 51.70], 87: ["pizza", 42.87], 96: ["pizza", 43.13], 108: ["pizza", 45.51],
  115: ["pizza", 48.58], 117: ["pizza", 72.99], 139: ["pizza", 39.77], 145: ["pizza", 41.57], 165: ["pizza", 69.07],
  171: ["pizza", 70.02], 187: ["pizza", 48.68],
  161: ["snack", 25.49], 202: ["snack", 23.66], 204: ["snack", 21.38], 199: ["snack", 16.48], 200: ["snack", 12.56],
  201: ["snack", 19.58], 208: ["snack", 28.26],
  156: ["bebida", null], 157: ["bebida", null],
};

const hoja = (n: string) => leerPrimeraHoja(readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url)));
const ventas = extraerVentas(hoja("ventas-2026-09-25.xlsx"));
const productos = extraerProductos(hoja("productos-2026-09-25.xlsx"));
const factor = (ventas.resumen.total - ventas.resumen.iva) / ventas.resumen.total;
/** Lo que devolvería la vista ventas_producto_costeo para el 25/09/2026 con el seed cargado. */
const renglones: RenglonCosteo[] = productos.productos.map((p) => ({
  fecha: productos.fecha, dodo_id: p.dodo_id, nombre: p.nombre, categoria: SEED[p.dodo_id]?.[0] ?? null,
  cantidad: p.cantidad, importe: p.importe, importe_sin_descuento: p.importe_sin_descuento,
  importe_neto: p.importe * factor, costo_unitario: SEED[p.dodo_id]?.[1] ?? null,
}));
const dia: VentaDia = { sucursal_id: "s", fecha: ventas.fecha, venta_m2: ventas.resumen.venta_m2, ...ventas.resumen };

test("tamanoPorNombre", () => {
  assert.equal(tamanoPorNombre("Quatro quesos Pequeño"), "pequeno");
  assert.equal(tamanoPorNombre("Margarita Mediano"), "mediano");
  assert.equal(tamanoPorNombre("Papas Gajo Medium"), "mediano");
  assert.equal(tamanoPorNombre("Pepperoni Grande"), "grande");
  assert.equal(tamanoPorNombre("Pepperoni Grande T"), "grande");
  assert.equal(tamanoPorNombre("Alitas Buffalo 10 uds"), null);
  assert.equal(tamanoPorNombre("Coca-Cola 2 L"), null);
});

test("costoVigente toma el más reciente que no pasa de la fecha", () => {
  const costos = [{ vigente_desde: "2026-08-09", costo: 42 }, { vigente_desde: "2026-10-01", costo: 45 }];
  assert.equal(costoVigente(costos, "2026-08-08")?.costo ?? null, null);
  assert.equal(costoVigente(costos, "2026-08-09")?.costo ?? null, 42);
  assert.equal(costoVigente(costos, "2026-09-30")?.costo ?? null, 42);
  assert.equal(costoVigente(costos, "2026-10-01")?.costo ?? null, 45);
  assert.equal(costoVigente([], "2026-10-01"), null);
});

test("resumenVentas del 25/09/2026", () => {
  const r = resumenVentas([dia]);
  assert.equal(r.total, 7736);
  assert.equal(r.neta, 6669.03);
  assert.equal(r.pedidos, 39);
  assert.equal(r.ticket?.toFixed(2), "198.36");
  assert.equal(r.dias, 1);
  assert.equal(resumenVentas([]).ticket, null);
});

test("costeo del 25/09/2026 con los costos del seed", () => {
  const c = costeo(renglones);
  assert.equal(c.total.costo, 2187.19);
  assert.equal(c.total.ventaNetaConCosto, 6463.77);
  assert.equal(((c.total.costoPct ?? 0) * 100).toFixed(2), "33.84");
  const pizza = c.categorias.find((g) => g.categoria === "pizza")!;
  assert.equal(pizza.costo, 1920.97);
  assert.equal(pizza.piezasConCosto, 44);
  assert.equal(((pizza.costoPct ?? 0) * 100).toFixed(2), "34.21");
  assert.equal(pizza.costoPromedio?.toFixed(2), "43.66");
  const snack = c.categorias.find((g) => g.categoria === "snack")!;
  assert.equal(snack.costo, 266.22);
  assert.equal(snack.piezasConCosto, 14);
  assert.equal(((snack.costoPct ?? 0) * 100).toFixed(2), "31.35");
  assert.equal(snack.costoPromedio?.toFixed(2), "19.02");
  const bebida = c.categorias.find((g) => g.categoria === "bebida")!;
  assert.equal(bebida.piezasConCosto, 0);
  assert.equal(bebida.costoPct, null);
  assert.deepEqual(c.sinCosto.map((s) => s.dodo_id).sort(), [156, 157]);
  assert.equal(c.total.piezas, 64);
});

test("porProducto suma días y deja sin costo si un día no tuvo", () => {
  const r: RenglonCosteo = { fecha: "2026-09-25", dodo_id: 42, nombre: "Pepperoni Grande", categoria: "pizza", cantidad: 2, importe: 200, importe_sin_descuento: 240, importe_neto: 172, costo_unitario: 42 };
  const [p] = porProducto([r, { ...r, fecha: "2026-09-26", nombre: "Pepperoni  Grande" }]);
  assert.deepEqual(p, { dodo_id: 42, nombre: "Pepperoni  Grande", categoria: "pizza", piezas: 4, importe: 400, sinDescuento: 480, descuento: 80, ventaNeta: 344, costo: 168, costoPct: 168 / 344 });
  const [q] = porProducto([r, { ...r, fecha: "2026-09-26", costo_unitario: null }]);
  assert.equal(q.costo, null);
  assert.equal(q.costoPct, null);
});

test("topProductos ordena por importe y calcula el cambio", () => {
  const top = topProductos(porProducto(renglones), [{ dodo_id: 42, importe: 2000 }], 3);
  assert.equal(top.length, 3);
  assert.equal(top[0].dodo_id, 42);
  assert.equal(top[0].importe, 2499);
  assert.equal(top[0].cambio?.toFixed(4), "0.2495");
  assert.equal(top[1].cambio, null);
});

test("descuentos del 25/09/2026", () => {
  const d = descuentos(porProducto(renglones));
  assert.equal(d.sinDescuento, 8832);
  assert.equal(d.total, 1096);
  assert.equal(d.top[0].dodo_id, 42);
});

test("compararConCierre marca lo que difiere más de $1 o de 0 pedidos", () => {
  const cierre = { sucursal_id: "s", fecha: "2026-09-25", efectivo: 4299, tarjeta: 3436.5, app: 0, rappi: 0, iva: 1060, transacciones: 38 };
  const d = compararConCierre(dia, cierre);
  const por = Object.fromEntries(d.map((x) => [x.concepto, x]));
  assert.equal(por["Total"].diferencia, -0.5);
  assert.equal(por["Total"].alerta, false);
  assert.equal(por["Tarjeta"].alerta, false);
  assert.equal(por["IVA"].diferencia, -6.97);
  assert.equal(por["IVA"].alerta, true);
  assert.equal(por["Pedidos"].diferencia, -1);
  assert.equal(por["Pedidos"].alerta, true);
  assert.equal(por["En línea (app + Rappi)"].alerta, false);
});

test("periodos", () => {
  assert.deepEqual(periodoPorDefecto("2026-09-25"), { desde: "2026-09-19", hasta: "2026-09-25" });
  const def = periodoPorDefecto("2026-09-25");
  assert.deepEqual(periodoElegido("2026-09-01", "2026-09-10", def), { desde: "2026-09-01", hasta: "2026-09-10" });
  assert.deepEqual(periodoElegido("2026-09-10", "2026-09-01", def), def);
  assert.deepEqual(periodoElegido("2026-02-31", "2026-03-01", def), def);
  assert.deepEqual(periodoElegido(undefined, "2026-03-01", def), def);
  assert.deepEqual(periodoElegido("2026-01-01", "2026-09-01", def), def);
  assert.deepEqual(periodoAnterior({ desde: "2026-09-19", hasta: "2026-09-25" }), { desde: "2026-09-12", hasta: "2026-09-18" });
  assert.deepEqual(periodoAnterior({ desde: "2026-03-01", hasta: "2026-03-01" }), { desde: "2026-02-28", hasta: "2026-02-28" });
});

test("ventaPorDia suma sucursales y ordena por fecha", () => {
  const otro: VentaDia = { ...dia, sucursal_id: "t", total: 1000.5, pedidos: 5 };
  assert.deepEqual(ventaPorDia([{ ...dia, fecha: "2026-09-26" }, dia, otro]), [
    { fecha: "2026-09-25", total: 8736.5, pedidos: 44 },
    { fecha: "2026-09-26", total: 7736, pedidos: 39 },
  ]);
});

test("sumarDesglose junta tipos y quita los vacíos", () => {
  const filas = ventas.desglose.flatMap((d) => [d, d]);
  assert.deepEqual(sumarDesglose(filas), [{ tipo: "restaurante", pedidos: 78, total: 15472 }]);
});

test("diasConCierre compara solo los días con cierre", () => {
  const cierre = { sucursal_id: "s", fecha: "2026-09-25", efectivo: 4299, tarjeta: 3437, app: 0, rappi: 0, iva: 1066.97, transacciones: 39 };
  const r = diasConCierre([dia, { ...dia, fecha: "2026-09-26" }], [cierre, { ...cierre, fecha: "2026-09-24" }]);
  assert.equal(r.sinCierre, 1);
  assert.equal(r.comparados.length, 1);
  assert.equal(r.comparados[0].alerta, false);
  assert.ok(r.comparados[0].filas.every((f) => f.diferencia === 0));
});

test("errorDeCosto", () => {
  assert.equal(errorDeCosto(42.5, "2026-10-01"), null);
  assert.equal(errorDeCosto(0, "2026-10-01"), null);
  assert.match(errorDeCosto(-1, "2026-10-01") ?? "", /costo válido/);
  assert.match(errorDeCosto(Number.NaN, "2026-10-01") ?? "", /costo válido/);
  assert.match(errorDeCosto(10, "2026-02-30") ?? "", /fecha/);
  assert.match(errorDeCosto(10, "") ?? "", /fecha/);
});
```

- [ ] **Step 2: Escribir las pruebas de paginación**

`lib/ventas/paginar.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerTodo, TAMANO_PAGINA } from "./paginar.ts";

/** Una "tabla" de n renglones que responde por rangos como Supabase (.range(desde, hasta)). */
const tabla = (n: number) => {
  const pedidos: [number, number][] = [];
  const pagina = async (desde: number, hasta: number) => {
    pedidos.push([desde, hasta]);
    return { data: Array.from({ length: Math.max(0, Math.min(n, hasta + 1) - desde) }, (_, i) => desde + i), error: null };
  };
  return { pagina, pedidos };
};

test("leerTodo junta todas las páginas", async () => {
  const t = tabla(2 * TAMANO_PAGINA + 5);
  const filas = await leerTodo(t.pagina);
  assert.equal(filas.length, 2 * TAMANO_PAGINA + 5);
  assert.equal(filas.at(-1), 2 * TAMANO_PAGINA + 4);
  assert.deepEqual(t.pedidos, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("leerTodo con exactamente una página pide una más y termina", async () => {
  const t = tabla(TAMANO_PAGINA);
  assert.equal((await leerTodo(t.pagina)).length, TAMANO_PAGINA);
  assert.equal(t.pedidos.length, 2);
});

test("leerTodo sin datos y con error", async () => {
  assert.deepEqual(await leerTodo(tabla(0).pagina), []);
  await assert.rejects(leerTodo(async () => ({ data: null, error: { message: "sin permiso" } })), /No se pudieron cargar las ventas: sin permiso/);
});
```

- [ ] **Step 3: Correrlas para ver que fallan**

Run: `node --experimental-strip-types --test lib/ventas/calculos.test.ts lib/ventas/paginar.test.ts`
Expected: FAIL con `Cannot find module …/calculos.ts` y `…/paginar.ts`

- [ ] **Step 4: Escribir los cálculos**

`lib/ventas/calculos.ts`:

```ts
/** Cálculos de ventas y costo teórico sobre lo importado de Dodo IS. Sin acceso a datos: solo números. */

import type { TipoDesglose } from "./extraer";

export type Categoria = "pizza" | "snack" | "postre" | "bebida" | "otro";
export const CATEGORIAS: readonly Categoria[] = ["pizza", "snack", "postre", "bebida", "otro"];
export const NOMBRE_CATEGORIA: Record<Categoria, string> = { pizza: "Pizzas", snack: "Snacks", postre: "Postres", bebida: "Bebidas", otro: "Otros" };
export type Tamano = "pequeno" | "mediano" | "grande";

const redondear = (n: number) => Math.round(n * 100) / 100;
const dividir = (a: number, b: number) => (b > 0 ? a / b : null);

/** Tamaño por el final del nombre: "… Pequeño", "… Mediano"/"… Medium", "… Grande"/"… Grande T". */
export function tamanoPorNombre(nombre: string): Tamano | null {
  const n = nombre.trim().toLowerCase();
  if (/\bpequeño$/.test(n)) return "pequeno";
  if (/\b(mediano|medium)$/.test(n)) return "mediano";
  if (/\bgrande( t)?$/.test(n)) return "grande";
  return null;
}

export type Costo = { vigente_desde: string; costo: number };

/** El costo con el vigente_desde más reciente que no pasa de la fecha (igual que costo_vigente en SQL); null si no hay. */
export function costoVigente<T extends Costo>(costos: readonly T[], fecha: string): T | null {
  let mejor: T | null = null;
  for (const c of costos) if (c.vigente_desde <= fecha && (!mejor || c.vigente_desde > mejor.vigente_desde)) mejor = c;
  return mejor;
}

export type VentaDia = {
  sucursal_id: string; fecha: string; pedidos: number; total: number; efectivo: number;
  tarjeta: number; en_linea: number; iva: number; venta_m2: number | null;
};

export function resumenVentas(dias: readonly VentaDia[]) {
  const suma = (k: "pedidos" | "total" | "efectivo" | "tarjeta" | "en_linea" | "iva") => redondear(dias.reduce((s, d) => s + Number(d[k]), 0));
  const total = suma("total"), iva = suma("iva"), pedidos = suma("pedidos");
  return {
    dias: new Set(dias.map((d) => d.fecha)).size,
    total, iva, neta: redondear(total - iva), pedidos,
    efectivo: suma("efectivo"), tarjeta: suma("tarjeta"), en_linea: suma("en_linea"),
    ticket: dividir(total, pedidos),
  };
}

/** Un renglón de la vista ventas_producto_costeo. */
export type RenglonCosteo = {
  fecha: string; dodo_id: number; nombre: string; categoria: Categoria | null;
  cantidad: number; importe: number; importe_sin_descuento: number; importe_neto: number; costo_unitario: number | null;
};

export type ProductoPeriodo = {
  dodo_id: number; nombre: string; categoria: Categoria | null;
  piezas: number; importe: number; sinDescuento: number; descuento: number; ventaNeta: number;
  /** null si algún día del periodo el producto no tuvo costo. */
  costo: number | null; costoPct: number | null;
};

/** Suma por producto; el nombre es el del renglón más reciente. */
export function porProducto(renglones: readonly RenglonCosteo[]): ProductoPeriodo[] {
  const mapa = new Map<number, ProductoPeriodo & { fecha: string }>();
  for (const r of renglones) {
    const p = mapa.get(r.dodo_id) ?? { dodo_id: r.dodo_id, nombre: r.nombre, categoria: r.categoria, fecha: r.fecha, piezas: 0, importe: 0, sinDescuento: 0, descuento: 0, ventaNeta: 0, costo: 0, costoPct: null };
    if (r.fecha >= p.fecha) { p.nombre = r.nombre; p.fecha = r.fecha; }
    p.piezas += Number(r.cantidad);
    p.importe += Number(r.importe);
    p.sinDescuento += Number(r.importe_sin_descuento);
    p.ventaNeta += Number(r.importe_neto);
    p.costo = p.costo === null || r.costo_unitario === null ? null : p.costo + Number(r.cantidad) * Number(r.costo_unitario);
    mapa.set(r.dodo_id, p);
  }
  return [...mapa.values()].map(({ fecha: _f, ...p }) => ({
    ...p,
    importe: redondear(p.importe), sinDescuento: redondear(p.sinDescuento), ventaNeta: redondear(p.ventaNeta),
    descuento: redondear(p.sinDescuento - p.importe),
    costo: p.costo === null ? null : redondear(p.costo),
    costoPct: p.costo === null ? null : dividir(p.costo, p.ventaNeta),
  }));
}

export type CosteoGrupo = {
  categoria: Categoria | null; piezas: number; importe: number; ventaNeta: number;
  piezasConCosto: number; ventaNetaConCosto: number; costo: number;
  costoPct: number | null; costoPromedio: number | null;
};

function grupo(categoria: Categoria | null, renglones: readonly RenglonCosteo[]): CosteoGrupo {
  let piezas = 0, importe = 0, ventaNeta = 0, piezasConCosto = 0, ventaNetaConCosto = 0, costo = 0;
  for (const r of renglones) {
    piezas += Number(r.cantidad);
    importe += Number(r.importe);
    ventaNeta += Number(r.importe_neto);
    if (r.costo_unitario === null) continue;
    piezasConCosto += Number(r.cantidad);
    ventaNetaConCosto += Number(r.importe_neto);
    costo += Number(r.cantidad) * Number(r.costo_unitario);
  }
  return {
    categoria, piezas, importe: redondear(importe), ventaNeta: redondear(ventaNeta),
    piezasConCosto, ventaNetaConCosto: redondear(ventaNetaConCosto), costo: redondear(costo),
    costoPct: dividir(costo, ventaNetaConCosto), costoPromedio: dividir(costo, piezasConCosto),
  };
}

/**
 * Costo teórico por categoría y total. El costo % es sobre la venta neta de los productos con costo;
 * el costo promedio ponderado, sobre las piezas con costo. Los productos sin costo se listan aparte.
 */
export function costeo(renglones: readonly RenglonCosteo[]) {
  const categorias = [...CATEGORIAS, null]
    .map((c) => grupo(c, renglones.filter((r) => r.categoria === c)))
    .filter((g) => g.piezas > 0);
  const sinCosto = porProducto(renglones.filter((r) => r.costo_unitario === null))
    .map(({ dodo_id, nombre, piezas }) => ({ dodo_id, nombre, piezas }))
    .sort((a, b) => b.piezas - a.piezas);
  return { categorias, total: grupo(null, renglones), sinCosto };
}

/** Los n productos que más vendieron (importe), con su cambio contra el periodo anterior (fracción; null si no vendió). */
export function topProductos(actual: readonly ProductoPeriodo[], anterior: readonly { dodo_id: number; importe: number }[], n = 10) {
  const previo = new Map<number, number>();
  for (const a of anterior) previo.set(a.dodo_id, (previo.get(a.dodo_id) ?? 0) + Number(a.importe));
  return [...actual]
    .sort((a, b) => b.importe - a.importe)
    .slice(0, n)
    .map((p) => {
      const antes = previo.get(p.dodo_id);
      return { ...p, cambio: antes ? (p.importe - antes) / antes : null };
    });
}

export function descuentos(productos: readonly ProductoPeriodo[], n = 5) {
  const total = redondear(productos.reduce((s, p) => s + p.descuento, 0));
  const sinDescuento = redondear(productos.reduce((s, p) => s + p.sinDescuento, 0));
  return {
    total, sinDescuento, pct: dividir(total, sinDescuento),
    top: productos.filter((p) => p.descuento > 0).sort((a, b) => b.descuento - a.descuento).slice(0, n),
  };
}

export type CierreDia = {
  sucursal_id: string; fecha: string; efectivo: number; tarjeta: number; app: number; rappi: number; iva: number; transacciones: number;
};

export type Diferencia = { concepto: string; dodo: number; cierre: number; diferencia: number; alerta: boolean; esPedido: boolean };

/** Cierre del gerente contra Dodo IS. Diferencia = cierre − Dodo IS; alerta si pasa de $1 (o de 0 pedidos). */
export function compararConCierre(v: VentaDia, c: CierreDia): Diferencia[] {
  const fila = (concepto: string, dodo: number, cierre: number, esPedido = false): Diferencia => {
    const diferencia = redondear(Number(cierre) - Number(dodo));
    return { concepto, dodo: Number(dodo), cierre: Number(cierre), diferencia, alerta: Math.abs(diferencia) > (esPedido ? 0 : 1), esPedido };
  };
  return [
    fila("Total", v.total, Number(c.efectivo) + Number(c.tarjeta) + Number(c.app) + Number(c.rappi)),
    fila("Efectivo", v.efectivo, c.efectivo),
    fila("Tarjeta", v.tarjeta, c.tarjeta),
    fila("En línea (app + Rappi)", v.en_linea, Number(c.app) + Number(c.rappi)),
    fila("IVA", v.iva, c.iva),
    fila("Pedidos", v.pedidos, c.transacciones, true),
  ];
}

export type Periodo = { desde: string; hasta: string };

const DIA = 86_400_000;
const sumarDias = (fecha: string, dias: number) => new Date(Date.parse(`${fecha}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);
const fechaReal = (t: string | undefined): t is string =>
  !!t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(Date.parse(`${t}T00:00:00Z`)) && new Date(`${t}T00:00:00Z`).toISOString().startsWith(t);

/** Máximo de días que se pueden pedir de una vez. */
export const MAX_DIAS = 92;

/** Los 7 días que terminan en el último día con datos. */
export const periodoPorDefecto = (ultimoConDatos: string): Periodo => ({ desde: sumarDias(ultimoConDatos, -6), hasta: ultimoConDatos });

/** El periodo pedido en la URL si es válido (fechas reales, en orden, hasta MAX_DIAS); si no, el de por defecto. */
export function periodoElegido(desde: string | undefined, hasta: string | undefined, porDefecto: Periodo): Periodo {
  if (!fechaReal(desde) || !fechaReal(hasta) || desde > hasta || diasEntre(desde, hasta) >= MAX_DIAS) return porDefecto;
  return { desde, hasta };
}

/** El periodo del mismo largo justo antes. */
export function periodoAnterior(p: Periodo): Periodo {
  const largo = diasEntre(p.desde, p.hasta) + 1;
  return { desde: sumarDias(p.desde, -largo), hasta: sumarDias(p.desde, -1) };
}

/** Venta total y pedidos por fecha, sumando sucursales. */
export function ventaPorDia(dias: readonly VentaDia[]): { fecha: string; total: number; pedidos: number }[] {
  const mapa = new Map<string, { fecha: string; total: number; pedidos: number }>();
  for (const d of dias) {
    const f = mapa.get(d.fecha) ?? { fecha: d.fecha, total: 0, pedidos: 0 };
    f.total = redondear(f.total + Number(d.total));
    f.pedidos += Number(d.pedidos);
    mapa.set(d.fecha, f);
  }
  return [...mapa.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}


export const NOMBRE_TIPO: Record<TipoDesglose, string> = {
  entrega: "Entrega", llevadera: "Llevadera", restaurante: "Restaurante", centro_llamadas: "Centro de llamadas",
  sitio: "Sitio", app: "Aplicación móvil", agregador: "Agregador",
};

/** Suma del desglose por tipo; solo los tipos con venta o pedidos, de mayor a menor venta. */
export function sumarDesglose(filas: readonly { tipo: TipoDesglose; pedidos: number; total: number }[]) {
  const mapa = new Map<TipoDesglose, { tipo: TipoDesglose; pedidos: number; total: number }>();
  for (const f of filas) {
    const t = mapa.get(f.tipo) ?? { tipo: f.tipo, pedidos: 0, total: 0 };
    t.pedidos += Number(f.pedidos);
    t.total = redondear(t.total + Number(f.total));
    mapa.set(f.tipo, t);
  }
  return [...mapa.values()].filter((t) => t.total || t.pedidos).sort((a, b) => b.total - a.total);
}

/** Cada día importado que tiene cierre del gerente, con su comparación; y cuántos días no tienen cierre. */
export function diasConCierre(dias: readonly VentaDia[], cierres: readonly CierreDia[]) {
  const porClave = new Map(cierres.map((c) => [`${c.sucursal_id}|${c.fecha}`, c]));
  const comparados = [];
  let sinCierre = 0;
  for (const d of dias) {
    const c = porClave.get(`${d.sucursal_id}|${d.fecha}`);
    if (!c) { sinCierre++; continue; }
    const filas = compararConCierre(d, c);
    comparados.push({ sucursal_id: d.sucursal_id, fecha: d.fecha, filas, alerta: filas.some((f) => f.alerta) });
  }
  return { comparados, sinCierre };
}

/** Mensaje de error de un costo capturado, o null si está bien. */
export function errorDeCosto(costo: number, vigenteDesde: string): string | null {
  if (!Number.isFinite(costo) || costo < 0) return "Escribe un costo válido (0 o más).";
  if (costo >= 100_000_000) return "El costo es demasiado grande.";
  if (!fechaReal(vigenteDesde)) return "Elige desde qué fecha aplica el costo.";
  return null;
}
```

- [ ] **Step 5: Escribir la paginación**

`lib/ventas/paginar.ts`:

```ts
/** Supabase devuelve como máximo 1000 renglones por consulta: se piden páginas hasta que una venga incompleta. */
export const TAMANO_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function leerTodo<T>(pagina: (desde: number, hasta: number) => Pagina<T>): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += TAMANO_PAGINA) {
    const { data, error } = await pagina(desde, desde + TAMANO_PAGINA - 1);
    if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
    todo.push(...(data ?? []));
    if ((data ?? []).length < TAMANO_PAGINA) return todo;
  }
}
```

- [ ] **Step 6: Correr las pruebas**

Run: `node --experimental-strip-types --test lib/ventas/calculos.test.ts lib/ventas/paginar.test.ts`
Expected: PASS, 13 + 3 pruebas.

- [ ] **Step 7: Agregar al script y correr todo**

En `package.json`, agrega ` lib/ventas/calculos.test.ts lib/ventas/paginar.test.ts` al final de la lista de `"test"`:

```json
"test": "node --experimental-strip-types --test lib/franjas.test.ts lib/masa.test.ts lib/formato.test.ts lib/fotos.test.ts lib/roles.test.ts lib/corporativo.test.ts lib/limpiezaProfunda.test.ts lib/amasado.test.ts lib/zonas.test.ts lib/arqueo.test.ts lib/ventas/extraer.test.ts lib/ventas/calculos.test.ts lib/ventas/paginar.test.ts"
```

Run: `npm test` → Expected: todas pasan.

- [ ] **Step 8: Commit**

```bash
git add lib/ventas/calculos.ts lib/ventas/calculos.test.ts lib/ventas/paginar.ts lib/ventas/paginar.test.ts package.json
git commit -m "Ventas: costo teórico, costo promedio ponderado, comparación con cierre y paginación"
```

---

### Task 4: Permisos, menú y el esqueleto de Ventas

**Files:**
- Modify: `lib/roles.ts`, `lib/roles.test.ts`, `lib/formato.ts`, `lib/formato.test.ts`
- Modify: `components/Nav.tsx`, `app/(app)/layout.tsx`, `app/corporativo/layout.tsx`, `app/(app)/checklists/page.tsx`
- Move: `app/(app)/checklists/Plegable.tsx` → `components/Plegable.tsx`
- Create: `app/ventas/layout.tsx`, `app/ventas/error.tsx`

**Interfaces:**
- Produces:
  - `puedeVerVentas(rol)`, `veVentasDeTodas(rol)`, `puedeImportarVentas(rol)`
  - `type Enlace = { href: string; texto: string }`, `enlacesSucursal(rol): Enlace[]`, `enlacesVentas(rol): Enlace[]`, `enlaceActivo(ruta, enlaces): string | undefined`
  - `fechaTexto("2026-09-25") → "vie 25 de sep"`, `porcentaje(0.3421) → "34.2 %"`, `porcentaje(null) → "—"`
  - `<Nav enlaces={…} />` (antes `<Nav corporativo />`), `<Plegable>` en `@/components/Plegable`

- [ ] **Step 1: Escribir las pruebas de roles y formato**

Reemplaza la línea de import de `lib/roles.test.ts` por:

```ts
import {
  enlaceActivo, enlacesSucursal, enlacesVentas, esCorporativo, puedeAbrirTurno, puedeGestionar, puedeImportarVentas,
  puedeSupervisar, puedeVerVentas, veVentasDeTodas,
} from "./roles.ts";
```

y agrega al final:

```ts
test("ventas: gerente, admin y corporativo ven; solo admin importa", () => {
  for (const rol of ["cajero", "encargado"] as const) assert.equal(puedeVerVentas(rol), false);
  for (const rol of ["gerente", "admin", "corporativo"] as const) assert.equal(puedeVerVentas(rol), true);
  assert.equal(veVentasDeTodas("gerente"), false);
  assert.equal(veVentasDeTodas("admin"), true);
  assert.equal(veVentasDeTodas("corporativo"), true);
  for (const rol of ["cajero", "encargado", "gerente", "corporativo"] as const) assert.equal(puedeImportarVentas(rol), false);
  assert.equal(puedeImportarVentas("admin"), true);
});

test("menú de sucursal: Ventas solo para quien la ve; Corporativo solo para corporativo", () => {
  const hrefs = (rol: Parameters<typeof enlacesSucursal>[0]) => enlacesSucursal(rol).map((e) => e.href);
  assert.ok(!hrefs("cajero").includes("/ventas"));
  assert.ok(!hrefs("encargado").includes("/ventas"));
  assert.ok(hrefs("gerente").includes("/ventas"));
  assert.equal(hrefs("corporativo")[0], "/corporativo");
  assert.ok(!hrefs("admin").includes("/corporativo"));
});

test("menú de ventas por rol", () => {
  assert.deepEqual(enlacesVentas("admin").map((e) => e.href), ["/", "/ventas", "/ventas/importar", "/ventas/costos"]);
  assert.deepEqual(enlacesVentas("gerente").map((e) => e.href), ["/", "/ventas"]);
  assert.deepEqual(enlacesVentas("corporativo").map((e) => e.href), ["/corporativo", "/ventas"]);
});

test("enlaceActivo elige la ruta más larga", () => {
  const enlaces = enlacesVentas("admin");
  assert.equal(enlaceActivo("/ventas", enlaces), "/ventas");
  assert.equal(enlaceActivo("/ventas/costos", enlaces), "/ventas/costos");
  assert.equal(enlaceActivo("/", enlaces), "/");
  assert.equal(enlaceActivo("/checklists/ronda", enlacesSucursal("gerente")), "/checklists");
  assert.equal(enlaceActivo("/otra", enlaces), undefined);
});
```

En `lib/formato.test.ts` cambia el import a `import { decimal, fechaTexto, hoyMX, numeroCorto, porcentaje, rangoDiaMX } from "./formato.ts";` y agrega al final:

```ts
test("fechaTexto muestra día de la semana, día y mes", () => {
  const t = fechaTexto("2026-09-25");
  assert.match(t, /^vie/);
  assert.match(t, /25/);
  assert.match(t, /sep/);
});

test("porcentaje", () => {
  assert.equal(porcentaje(0.3421), "34.2 %");
  assert.equal(porcentaje(0), "0.0 %");
  assert.equal(porcentaje(null), "—");
});
```

- [ ] **Step 2: Correrlas para ver que fallan**

Run: `node --experimental-strip-types --test lib/roles.test.ts lib/formato.test.ts`
Expected: FAIL (`puedeVerVentas` / `fechaTexto` no existen: `does not provide an export named`)

- [ ] **Step 3: Implementar roles y menús**

Agrega al final de `lib/roles.ts` (la lista de enlaces se mueve aquí desde `components/Nav.tsx`):

```ts
/** Reportes de ventas importadas de Dodo IS. Encargado y cajero no ven ventas. */
export const puedeVerVentas = (rol: Rol) => rol === "gerente" || rol === "admin" || rol === "corporativo";
/** Ventas de todas las sucursales (el gerente solo ve la suya). */
export const veVentasDeTodas = (rol: Rol) => rol === "admin" || rol === "corporativo";
/** Importar ventas y manejar categorías y costos. */
export const puedeImportarVentas = (rol: Rol) => rol === "admin";

export type Enlace = { href: string; texto: string };

const ENLACES_SUCURSAL: readonly Enlace[] = [
  { href: "/", texto: "Inicio" },
  { href: "/arqueo", texto: "Arqueo de turno" },
  { href: "/movimientos", texto: "Movimientos" },
  { href: "/caja-chica", texto: "Caja chica" },
  { href: "/cierre", texto: "Cierre del día" },
  { href: "/checklists", texto: "Checklists" },
];

/** Menú de las pantallas de sucursal. */
export function enlacesSucursal(rol: Rol): Enlace[] {
  return [
    ...(esCorporativo(rol) ? [{ href: "/corporativo", texto: "Corporativo" }] : []),
    ...ENLACES_SUCURSAL,
    ...(puedeVerVentas(rol) ? [{ href: "/ventas", texto: "Ventas" }] : []),
  ];
}

/** Menú de Ventas (y de la vista general de corporativo). */
export function enlacesVentas(rol: Rol): Enlace[] {
  return [
    esCorporativo(rol) ? { href: "/corporativo", texto: "Vista general" } : { href: "/", texto: "Inicio" },
    { href: "/ventas", texto: "Ventas" },
    ...(puedeImportarVentas(rol) ? [{ href: "/ventas/importar", texto: "Importar" }, { href: "/ventas/costos", texto: "Costos" }] : []),
  ];
}

/** El enlace activo es el de ruta más larga que contiene a la actual: en /ventas/costos se marca Costos, no Ventas. */
export function enlaceActivo(ruta: string, enlaces: readonly Enlace[]): string | undefined {
  const contiene = (href: string) => ruta === href || (href !== "/" && ruta.startsWith(`${href}/`));
  return enlaces.map((e) => e.href).filter(contiene).sort((a, b) => b.length - a.length)[0];
}
```

Agrega al final de `lib/formato.ts`:

```ts
const diaCorto = new Intl.DateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** "2026-09-25" → "vie 25 de sep". */
export const fechaTexto = (fecha: string) => diaCorto.format(new Date(`${fecha}T00:00:00Z`));

/** Fracción como porcentaje con un decimal: 0.3421 → "34.2 %"; null → "—". */
export const porcentaje = (fraccion: number | null) => (fraccion === null ? "—" : `${(fraccion * 100).toFixed(1)} %`);
```

- [ ] **Step 4: Correr las pruebas**

Run: `node --experimental-strip-types --test lib/roles.test.ts lib/formato.test.ts`
Expected: PASS

- [ ] **Step 5: Nav recibe los enlaces**

`components/Nav.tsx` completo:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { enlaceActivo, type Enlace } from "@/lib/roles";

export function Nav({ enlaces }: { enlaces: readonly Enlace[] }) {
  const actual = enlaceActivo(usePathname(), enlaces);
  return (
    <nav className="nav" aria-label="Secciones">
      {enlaces.map((e) => (
        <Link key={e.href} href={e.href} aria-current={e.href === actual ? "page" : undefined}>
          {e.texto}
        </Link>
      ))}
    </nav>
  );
}
```

En `app/(app)/layout.tsx` agrega `import { enlacesSucursal } from "@/lib/roles";` y cambia `<Nav corporativo={soloLectura} />` por `<Nav enlaces={enlacesSucursal(perfil.rol)} />` (la franja "Viendo … · Solo lectura" sigue usando `soloLectura`).

En `app/corporativo/layout.tsx` agrega `import { Nav } from "@/components/Nav";`, cambia el import de roles a `import { enlacesVentas, esCorporativo } from "@/lib/roles";` y pon `<Nav enlaces={enlacesVentas(perfil.rol)} />` entre `</header>` y `<main className="pagina">`.

- [ ] **Step 6: Mover Plegable**

```bash
git mv "app/(app)/checklists/Plegable.tsx" components/Plegable.tsx
```

En `app/(app)/checklists/page.tsx` cambia `import { Plegable } from "./Plegable";` por `import { Plegable } from "@/components/Plegable";`.

- [ ] **Step 7: Layout y error de Ventas**

`app/ventas/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerPerfil } from "@/lib/contexto";
import { enlacesVentas, puedeVerVentas } from "@/lib/roles";

export const dynamic = "force-dynamic";

/** Ventas vive fuera de (app): admin y corporativo ven todas las sucursales, no una elegida. */
export default async function LayoutVentas({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!puedeVerVentas(perfil.rol)) redirect("/");
  return (
    <>
      <header className="barra">
        <span className="barra-marca">Ventas</span>
        <span className="barra-turno">Importadas de Dodo IS</span>
        <div className="barra-usuario">
          <span>{perfil.nombre}</span>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <Nav enlaces={enlacesVentas(perfil.rol)} />
      <main className="pagina">{children}</main>
    </>
  );
}
```

`app/ventas/error.tsx`:

```tsx
"use client";

/** Si algo no cargó, se dice claramente en lugar de mostrar reportes incompletos. */
export default function ErrorVentas({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <>
      <div className="encabezado">
        <h1>No pudimos cargar las ventas</h1>
        <p>
          Algunos datos no llegaron, así que no mostramos reportes incompletos.
          Intenta de nuevo; si sigue pasando, busca el código {error.digest ?? "sin código"} en Vercel → Logs.
        </p>
      </div>
      <div className="acciones">
        <button className="boton" type="button" onClick={reset}>Intentar de nuevo</button>
      </div>
    </>
  );
}
```

- [ ] **Step 8: Typecheck y pruebas**

Run: `npm run typecheck && npm test`
Expected: sin errores; todas pasan. (`/ventas` todavía no tiene página: da 404 hasta la Tarea 7.)

- [ ] **Step 9: Commit**

```bash
git add lib/roles.ts lib/roles.test.ts lib/formato.ts lib/formato.test.ts components/Nav.tsx components/Plegable.tsx "app/(app)/layout.tsx" app/corporativo/layout.tsx "app/(app)/checklists/page.tsx" app/ventas/layout.tsx app/ventas/error.tsx
git commit -m "Ventas: permisos, menú por rol y layout propio"
```

---

### Task 5: Importar (revisar y guardar)

**Files:**
- Create: `app/ventas/importar/preparar.ts`, `app/ventas/importar/acciones.ts`, `app/ventas/importar/FormImportar.tsx`, `app/ventas/importar/page.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `leerPrimeraHoja`, `extraerVentas`, `extraerProductos`, `revisarPar`, `buscarSucursal`, `necesitaConfirmacion` (Tarea 2); `tamanoPorNombre`, `NOMBRE_TIPO` (Tarea 3); `puedeImportarVentas`, `fechaTexto` (Tarea 4); `importar_ventas_dia` (Tarea 1).
- Produces: `type Revision`, `prepararImportacion(supabase, fd): Promise<Revision>`, server actions `revisarImportacion(fd)` y `guardarImportacion(fd)` → `ResultadoImportacion`.

La lógica que se puede equivocar (leer, validar, cuadrar, confirmar) ya está probada en las Tareas 2 y 3; aquí solo se conecta. El formulario se envía a mano (no con `<form action>`) porque React 19 vacía los campos de archivo después de una action, y Guardar necesita volver a mandar los mismos archivos.

- [ ] **Step 1: Preparar (leer y validar sin guardar)**

`app/ventas/importar/preparar.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { tamanoPorNombre, type Tamano } from "@/lib/ventas/calculos";
import {
  buscarSucursal, extraerProductos, extraerVentas, revisarPar,
  type Desglose, type Montos, type ProductoVendido,
} from "@/lib/ventas/extraer";
import { leerPrimeraHoja } from "@/lib/ventas/xlsx";

export type Revision = {
  sucursal: { id: string; nombre: string };
  fecha: string;
  resumen: Montos & { venta_m2: number | null };
  desglose: Desglose[];
  productos: (ProductoVendido & { tamano: Tamano | null })[];
  archivos: { ventas: string; productos: string };
  sumaProductos: number;
  diferencia: number;
  cuadra: boolean;
  ticket: number | null;
  yaImportado: { total: number } | null;
  /** Nombres de productos que no están en el catálogo (entran sin categoría ni costo). */
  nuevos: string[];
  sinCategoria: string[];
  sinCosto: string[];
};

/** Un reporte diario pesa unos KB; más de 2 MB no es un reporte de un día. */
const MAX_BYTES = 2 * 1024 * 1024;

async function archivo(fd: FormData, campo: string, etiqueta: string) {
  const f = fd.get(campo);
  if (!(f instanceof File) || f.size === 0) throw new Error(`Falta el archivo de ${etiqueta}.`);
  if (f.size > MAX_BYTES) throw new Error(`El archivo de ${etiqueta} pesa más de 2 MB; no parece un reporte de un día.`);
  return { nombre: f.name, datos: new Uint8Array(await f.arrayBuffer()) };
}

/** Lee y valida los dos archivos sin guardar nada. Lanza Error con un mensaje para el admin. */
export async function prepararImportacion(supabase: SupabaseClient, fd: FormData): Promise<Revision> {
  const av = await archivo(fd, "ventas", "Ventas");
  const ap = await archivo(fd, "productos", "Productos");
  const ventas = extraerVentas(leerPrimeraHoja(av.datos));
  const productos = extraerProductos(leerPrimeraHoja(ap.datos));
  const par = revisarPar(ventas, productos);

  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre").returns<{ id: string; nombre: string }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const sucursal = buscarSucursal(ventas.sucursal, sucursales ?? []);
  if (!sucursal) throw new Error(`El reporte es de la sucursal ${ventas.sucursal} y no existe en la app.`);

  const ids = productos.productos.map((p) => p.dodo_id);
  const [previo, catalogo, costos] = await Promise.all([
    supabase.from("ventas_dia").select("total").eq("sucursal_id", sucursal.id).eq("fecha", ventas.fecha).maybeSingle<{ total: number }>(),
    supabase.from("productos_venta").select("dodo_id, categoria").in("dodo_id", ids).returns<{ dodo_id: number; categoria: string | null }[]>(),
    supabase.from("costos_producto").select("dodo_id").in("dodo_id", ids).lte("vigente_desde", ventas.fecha).returns<{ dodo_id: number }[]>(),
  ]);
  const fallo = previo.error ?? catalogo.error ?? costos.error;
  if (fallo) throw new Error(`No se pudo revisar el catálogo: ${fallo.message}`);

  const categoria = new Map((catalogo.data ?? []).map((c) => [c.dodo_id, c.categoria]));
  const conCosto = new Set((costos.data ?? []).map((c) => c.dodo_id));
  const nombres = (cumple: (p: ProductoVendido) => boolean) => productos.productos.filter(cumple).map((p) => p.nombre);

  return {
    sucursal,
    fecha: ventas.fecha,
    resumen: ventas.resumen,
    desglose: ventas.desglose,
    productos: productos.productos.map((p) => ({ ...p, tamano: tamanoPorNombre(p.nombre) })),
    archivos: { ventas: av.nombre, productos: ap.nombre },
    ...par,
    ticket: ventas.resumen.pedidos ? ventas.resumen.total / ventas.resumen.pedidos : null,
    yaImportado: previo.data ? { total: Number(previo.data.total) } : null,
    nuevos: nombres((p) => !categoria.has(p.dodo_id)),
    sinCategoria: nombres((p) => categoria.has(p.dodo_id) && !categoria.get(p.dodo_id)),
    sinCosto: nombres((p) => categoria.has(p.dodo_id) && !conCosto.has(p.dodo_id)),
  };
}
```

- [ ] **Step 2: Server actions**

`app/ventas/importar/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { necesitaConfirmacion } from "@/lib/ventas/extraer";
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

const mensaje = (e: unknown) => (e instanceof Error ? e.message : "No se pudieron leer los archivos.");

/** Lee y valida sin guardar. */
export async function revisarImportacion(fd: FormData): Promise<ResultadoImportacion> {
  try {
    return { tipo: "revision", revision: await prepararImportacion(await clienteAdmin(), fd) };
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
}

/** Vuelve a leer los archivos enviados (no confía en la revisión anterior) y guarda. */
export async function guardarImportacion(fd: FormData): Promise<ResultadoImportacion> {
  let supabase: Awaited<ReturnType<typeof clienteAdmin>>;
  let revision: Revision;
  try {
    supabase = await clienteAdmin();
    revision = await prepararImportacion(supabase, fd);
  } catch (e) {
    return { tipo: "error", mensaje: mensaje(e) };
  }
  if (necesitaConfirmacion({ cuadra: revision.cuadra, yaImportado: revision.yaImportado !== null }) && fd.get("confirmar") !== "si") {
    return { tipo: "error", mensaje: "Marca la casilla de confirmación para guardar.", revision };
  }

  const { error } = await supabase.rpc("importar_ventas_dia", {
    p_sucursal: revision.sucursal.id,
    p_fecha: revision.fecha,
    p_resumen: revision.resumen,
    p_desglose: revision.desglose,
    p_productos: revision.productos,
    p_archivos: revision.archivos,
    p_reemplazar: revision.yaImportado !== null,
  });
  if (error) return { tipo: "error", mensaje: error.message, revision };

  revalidatePath("/ventas", "layout");
  const accion = revision.yaImportado ? "Reimportado" : "Guardado";
  return { tipo: "guardado", mensaje: `${accion}: ${revision.sucursal.nombre}, ${fechaTexto(revision.fecha)}, ${pesos(revision.resumen.total)}.` };
}
```

- [ ] **Step 3: Formulario con vista previa**

`app/ventas/importar/FormImportar.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { fechaTexto, pesos } from "@/lib/formato";
import { NOMBRE_TIPO } from "@/lib/ventas/calculos";
import { necesitaConfirmacion } from "@/lib/ventas/extraer";
import { guardarImportacion, revisarImportacion, type ResultadoImportacion } from "./acciones";
import type { Revision } from "./preparar";

/**
 * Dos archivos → Revisar (lee sin guardar) → vista previa → Guardar o Reimportar.
 * El envío es manual (no <form action>) para que React no vacíe los campos de archivo entre Revisar y Guardar.
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
        <label htmlFor="ventas">Reporte de Ventas</label>
        <input id="ventas" name="ventas" type="file" accept=".xlsx" required onChange={() => setResultado(null)} />
        <small>Dodo IS → Informes → Ventas, de un solo día.</small>
      </div>
      <div className="campo">
        <label htmlFor="productos">Reporte de Productos</label>
        <input id="productos" name="productos" type="file" accept=".xlsx" required onChange={() => setResultado(null)} />
        <small>ProductsSales del mismo día, con método de cálculo &quot;Con descuentos&quot;.</small>
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
            {revision.yaImportado ? "Reimportar" : "Guardar"}
          </button>
        )}
      </div>
    </form>
  );
}

function VistaPrevia({ r }: { r: Revision }) {
  const piezas = r.productos.reduce((s, p) => s + p.cantidad, 0);
  const tipos = r.desglose.filter((d) => d.total || d.pedidos);
  const faltan = r.nuevos.length + r.sinCategoria.length + r.sinCosto.length > 0;
  return (
    <div className="vista-previa" aria-live="polite">
      <h2>{r.sucursal.nombre} · {fechaTexto(r.fecha)}</h2>
      <dl className="tarjeta-datos">
        <dt>Venta</dt>
        <dd>
          <span>Total {pesos(r.resumen.total)}</span>
          <span>Neta {pesos(r.resumen.total - r.resumen.iva)}</span>
          <span>IVA {pesos(r.resumen.iva)}</span>
        </dd>
        <dt>Pedidos</dt>
        <dd>
          <span>{r.resumen.pedidos}</span>
          <span>Ticket promedio {r.ticket === null ? "—" : pesos(r.ticket)}</span>
        </dd>
        <dt>Pago</dt>
        <dd>
          <span>Efectivo {pesos(r.resumen.efectivo)}</span>
          <span>Tarjeta {pesos(r.resumen.tarjeta)}</span>
          <span>En línea {pesos(r.resumen.en_linea)}</span>
        </dd>
        {tipos.length > 0 && (
          <>
            <dt>Tipo</dt>
            <dd>{tipos.map((d) => <span key={d.tipo}>{NOMBRE_TIPO[d.tipo]} {pesos(d.total)} · {d.pedidos}</span>)}</dd>
          </>
        )}
        <dt>Productos</dt>
        <dd><span>{r.productos.length} productos · {piezas} piezas</span></dd>
      </dl>

      {r.cuadra
        ? <p className="aviso aviso-ok">✅ Cuadra: Ventas {pesos(r.resumen.total)} y Productos {pesos(r.sumaProductos)}.</p>
        : <p className="aviso aviso-error">⚠ Los archivos no cuadran por {pesos(Math.abs(r.diferencia))}: Ventas {pesos(r.resumen.total)}, Productos {pesos(r.sumaProductos)}.</p>}
      {r.yaImportado && (
        <p className="aviso aviso-info">Ese día ya se importó con un total de {pesos(r.yaImportado.total)}. Reimportar lo reemplaza.</p>
      )}
      {faltan && (
        <div className="aviso aviso-info">
          {r.nuevos.length > 0 && <p>Productos nuevos (entran sin categoría ni costo): {r.nuevos.join(", ")}.</p>}
          {r.sinCategoria.length > 0 && <p>Sin categoría: {r.sinCategoria.join(", ")}.</p>}
          {r.sinCosto.length > 0 && <p>Sin costo: {r.sinCosto.join(", ")}.</p>}
          <p>Después de guardar, asígnalos en <Link href="/ventas/costos">Costos</Link>.</p>
        </div>
      )}
      {necesitaConfirmacion({ cuadra: r.cuadra, yaImportado: r.yaImportado !== null }) && (
        <label className="casilla">
          <input type="checkbox" name="confirmar" value="si" />
          {r.yaImportado ? "Sí, reemplazar el día ya importado" : "Sí, guardar aunque no cuadren"}
        </label>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Página**

`app/ventas/importar/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeImportarVentas } from "@/lib/roles";
import { FormImportar } from "./FormImportar";

export default async function PaginaImportar() {
  const { perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) redirect("/ventas");
  return (
    <>
      <div className="encabezado">
        <h1>Importar ventas</h1>
        <p>
          Sube los dos reportes de Dodo IS de un día de una sucursal: Ventas y Productos (ProductsSales).
          Primero se revisan; nada se guarda hasta que presiones Guardar.
        </p>
      </div>
      <FormImportar />
    </>
  );
}
```

- [ ] **Step 5: Estilo de la vista previa**

Agrega al final de `app/globals.css`:

```css
/* ─── Ventas importadas de Dodo IS ─── */
.vista-previa { display: flex; flex-direction: column; gap: 14px; padding-top: 8px; border-top: 1px solid var(--linea); }
```

- [ ] **Step 6: Typecheck, pruebas y build**

Run: `npm run typecheck && npm test && npm run build`
Expected: sin errores; `/ventas/importar` aparece en la lista de rutas.

- [ ] **Step 7: Commit**

```bash
git add app/ventas/importar app/globals.css
git commit -m "Ventas: importar los reportes diarios con vista previa, cuadre y reimportación"
```

---

### Task 6: Costos y categorías

**Files:**
- Create: `app/ventas/costos/acciones.ts`, `app/ventas/costos/page.tsx`

**Interfaces:**
- Consumes: `CATEGORIAS`, `NOMBRE_CATEGORIA`, `costoVigente`, `errorDeCosto` (Tarea 3); `puedeImportarVentas`, `fechaTexto` (Tarea 4); `decimal`, `hoyMX`, `pesos` (`lib/formato.ts`); `primerError` (`lib/corporativo.ts`); `asignar_categoria` e insert en `costos_producto` (Tarea 1).
- Produces: server actions `asignarCategoria(fd)` y `registrarCosto(fd)`; página `/ventas/costos?ver=sin-costo|sin-categoria`.

- [ ] **Step 1: Server actions**

`app/ventas/costos/acciones.ts` (regresan a la tarjeta del producto con `#p-<dodo_id>` y conservan el filtro):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { decimal } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { CATEGORIAS, errorDeCosto, type Categoria } from "@/lib/ventas/calculos";

/** Regresa a la tarjeta del producto, conservando el filtro. */
function volver(fd: FormData, clave: "ok" | "error", texto: string): never {
  const ver = String(fd.get("ver") ?? "");
  const filtro = ver === "sin-costo" || ver === "sin-categoria" ? `ver=${ver}&` : "";
  redirect(`/ventas/costos?${filtro}${clave}=${encodeURIComponent(texto)}#p-${Number(fd.get("dodo_id"))}`);
}

async function clienteAdmin(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) volver(fd, "error", "Solo un administrador maneja costos y categorías.");
  return supabase;
}

export async function asignarCategoria(fd: FormData) {
  const supabase = await clienteAdmin(fd);
  const valor = String(fd.get("categoria") ?? "");
  const categoria = (CATEGORIAS as readonly string[]).includes(valor) ? (valor as Categoria) : null;
  const { error } = await supabase.rpc("asignar_categoria", { p_dodo_id: Number(fd.get("dodo_id")), p_categoria: categoria });
  if (error) volver(fd, "error", error.message);
  revalidatePath("/ventas", "layout");
  volver(fd, "ok", "Categoría guardada.");
}

export async function registrarCosto(fd: FormData) {
  const supabase = await clienteAdmin(fd);
  const costo = decimal(fd.get("costo"));
  const vigenteDesde = String(fd.get("vigente_desde") ?? "");
  const problema = errorDeCosto(costo, vigenteDesde);
  if (problema) volver(fd, "error", problema);

  const { error } = await supabase.from("costos_producto").insert({
    dodo_id: Number(fd.get("dodo_id")),
    costo: Math.round(costo * 100) / 100,
    vigente_desde: vigenteDesde,
    fuente: String(fd.get("fuente") ?? "").trim() || null,
  });
  if (error) volver(fd, "error", error.code === "23505" ? "Ese producto ya tiene un costo con esa fecha; usa otra fecha." : error.message);
  revalidatePath("/ventas", "layout");
  volver(fd, "ok", "Costo guardado.");
}
```

- [ ] **Step 2: Página**

`app/ventas/costos/page.tsx` (tarjetas por categoría, "Sin categoría" primero; la tarjeta queda en rojo si no tiene costo o si su costo vigente trae nota de dudoso):

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { primerError } from "@/lib/corporativo";
import { puedeImportarVentas } from "@/lib/roles";
import { CATEGORIAS, costoVigente, NOMBRE_CATEGORIA, type Categoria, type Tamano } from "@/lib/ventas/calculos";
import { asignarCategoria, registrarCosto } from "./acciones";

type Producto = { dodo_id: number; nombre: string; categoria: Categoria | null; tamano: Tamano | null };
type Costo = { dodo_id: number; costo: number; vigente_desde: string; fuente: string | null; nota: string | null };

const TAMANO: Record<Tamano, string> = { pequeno: "Pequeña", mediano: "Mediana", grande: "Grande" };
const FILTROS = { "sin-costo": "Sin costo", "sin-categoria": "Sin categoría" } as const;
type Filtro = keyof typeof FILTROS;

export default async function PaginaCostos({ searchParams }: { searchParams: Promise<{ ver?: string; ok?: string; error?: string }> }) {
  const { ver, ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) redirect("/ventas");
  const filtro: Filtro | undefined = ver === "sin-costo" || ver === "sin-categoria" ? ver : undefined;
  const hoy = hoyMX();

  const resultados = await Promise.all([
    supabase.from("productos_venta").select("dodo_id, nombre, categoria, tamano").order("nombre").returns<Producto[]>(),
    supabase.from("costos_producto").select("dodo_id, costo, vigente_desde, fuente, nota").order("vigente_desde", { ascending: false }).returns<Costo[]>(),
  ]);
  const fallo = primerError(resultados);
  if (fallo) throw new Error(`No se pudo cargar el catálogo: ${fallo}`);
  const [{ data: productos }, { data: costos }] = resultados;

  const costosDe = new Map<number, Costo[]>();
  for (const c of costos ?? []) costosDe.set(c.dodo_id, [...(costosDe.get(c.dodo_id) ?? []), c]);
  const vigente = (p: Producto) => costoVigente(costosDe.get(p.dodo_id) ?? [], hoy);
  const visibles = (productos ?? []).filter((p) =>
    filtro === "sin-costo" ? !vigente(p) : filtro === "sin-categoria" ? !p.categoria : true);
  const grupos = ([null, ...CATEGORIAS] as (Categoria | null)[])
    .map((c) => ({ categoria: c, productos: visibles.filter((p) => p.categoria === c) }))
    .filter((g) => g.productos.length > 0);

  return (
    <>
      <div className="encabezado">
        <h1>Costos</h1>
        <p>
          Costo por producto con la fecha desde la que aplica. Un costo nuevo no borra el anterior: los días previos
          se siguen costeando con el que estaba vigente.
        </p>
      </div>
      <Aviso ok={ok} error={error} />
      <nav className="acciones" aria-label="Filtros">
        <Link className="boton boton-secundario" href="/ventas/costos" aria-current={!filtro ? "page" : undefined}>Todos</Link>
        {(Object.keys(FILTROS) as Filtro[]).map((f) => (
          <Link key={f} className="boton boton-secundario" href={`/ventas/costos?ver=${f}`} aria-current={filtro === f ? "page" : undefined}>
            {FILTROS[f]}
          </Link>
        ))}
      </nav>

      {!grupos.length && <p className="vacio">{filtro ? "No hay productos con ese filtro." : "Aún no hay productos. Se agregan solos al importar ventas."}</p>}
      {grupos.map((g) => (
        <section key={g.categoria ?? "sin"} className="seccion" aria-labelledby={`g-${g.categoria ?? "sin"}`}>
          <h2 id={`g-${g.categoria ?? "sin"}`}>{g.categoria ? NOMBRE_CATEGORIA[g.categoria] : "Sin categoría"} · {g.productos.length}</h2>
          <div className="tarjetas">
            {g.productos.map((p) => {
              const actual = vigente(p);
              const historial = costosDe.get(p.dodo_id) ?? [];
              return (
                <article key={p.dodo_id} id={`p-${p.dodo_id}`} className="tarjeta" data-alerta={!actual || actual.nota ? "si" : undefined}>
                  <div className="tarjeta-encabezado">
                    <div>
                      <h3>{p.nombre}</h3>
                      <p className="tarjeta-estado">
                        {actual ? `${pesos(actual.costo)} desde ${fechaTexto(actual.vigente_desde)}` : "Sin costo"}
                      </p>
                    </div>
                    <span className="saldo-nota">#{p.dodo_id}{p.tamano ? ` · ${TAMANO[p.tamano]}` : ""}</span>
                  </div>
                  {actual?.nota && <p className="alerta-texto">⚠ {actual.nota}</p>}

                  <form action={asignarCategoria} className="acciones">
                    <input type="hidden" name="dodo_id" value={p.dodo_id} />
                    <input type="hidden" name="ver" value={filtro ?? ""} />
                    <label className="etiqueta" htmlFor={`cat-${p.dodo_id}`}>Categoría</label>
                    <select id={`cat-${p.dodo_id}`} name="categoria" defaultValue={p.categoria ?? ""}>
                      <option value="">Sin categoría</option>
                      {CATEGORIAS.map((c) => <option key={c} value={c}>{NOMBRE_CATEGORIA[c]}</option>)}
                    </select>
                    <BotonEnviar className="boton boton-secundario">Guardar</BotonEnviar>
                  </form>

                  <details>
                    <summary>Nuevo costo{historial.length ? ` · historial (${historial.length})` : ""}</summary>
                    <form action={registrarCosto} className="formulario">
                      <input type="hidden" name="dodo_id" value={p.dodo_id} />
                      <input type="hidden" name="ver" value={filtro ?? ""} />
                      <div className="campo">
                        <label htmlFor={`costo-${p.dodo_id}`}>Costo por pieza</label>
                        <input id={`costo-${p.dodo_id}`} name="costo" inputMode="decimal" required />
                      </div>
                      <div className="campo">
                        <label htmlFor={`desde-${p.dodo_id}`}>Aplica desde</label>
                        <input id={`desde-${p.dodo_id}`} name="vigente_desde" type="date" defaultValue={hoy} required />
                      </div>
                      <div className="campo">
                        <label htmlFor={`fuente-${p.dodo_id}`}>Fuente (opcional)</label>
                        <input id={`fuente-${p.dodo_id}`} name="fuente" placeholder="Modelo UC Mexico 10/2026" />
                      </div>
                      <BotonEnviar>Guardar costo</BotonEnviar>
                    </form>
                    {historial.length > 0 && (
                      <ul className="fallas">
                        {historial.map((c) => (
                          <li key={c.vigente_desde}>
                            {pesos(c.costo)} desde {fechaTexto(c.vigente_desde)}
                            {c.vigente_desde > hoy ? " (programado)" : ""}{c.fuente ? ` · ${c.fuente}` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
```

- [ ] **Step 3: Typecheck y build**

Run: `npm run typecheck && npm run build`
Expected: sin errores; `/ventas/costos` en la lista de rutas.

- [ ] **Step 4: Commit**

```bash
git add app/ventas/costos
git commit -m "Ventas: pantalla de costos con categoría, costo vigente, historial y avisos de costos dudosos"
```

---

### Task 7: Reportes

**Files:**
- Create: `app/ventas/datos.ts`, `app/ventas/page.tsx`, `components/Grafica.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: todo `lib/ventas/calculos.ts` y `leerTodo` (Tarea 3); `veVentasDeTodas`, `puedeImportarVentas`, `fechaTexto`, `porcentaje`, `Plegable` (Tarea 4); tablas y vista de la Tarea 1; `cierres_dia (sucursal_id, fecha, efectivo, tarjeta, app, rappi, iva, transacciones)`.
- Produces: `ultimoDiaConDatos(supabase, sucursal)`, `datosVentas(supabase, sucursal, periodo, anterior): Promise<DatosVentas>`, `<Grafica titulo barras />`, página `/ventas?desde=&hasta=&sucursal=`.

- [ ] **Step 1: Carga de datos (paginada)**

`app/ventas/datos.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CierreDia, Periodo, RenglonCosteo, VentaDia } from "@/lib/ventas/calculos";
import type { TipoDesglose } from "@/lib/ventas/extraer";
import { leerTodo } from "@/lib/ventas/paginar";

export type FilaDesglose = { tipo: TipoDesglose; pedidos: number; total: number };
export type DiaConDesglose = VentaDia & { ventas_dia_desglose: FilaDesglose[] };

export type DatosVentas = {
  dias: DiaConDesglose[];
  renglones: RenglonCosteo[];
  /** Importe por producto del periodo anterior, para el cambio del top 10. */
  anterior: { dodo_id: number; importe: number }[];
  cierres: CierreDia[];
};

/** Último día importado (de una sucursal o de cualquiera); null si no hay nada. */
export async function ultimoDiaConDatos(supabase: SupabaseClient, sucursal: string | null): Promise<string | null> {
  let q = supabase.from("ventas_dia").select("fecha");
  if (sucursal) q = q.eq("sucursal_id", sucursal);
  const { data, error } = await q.order("fecha", { ascending: false }).limit(1).maybeSingle<{ fecha: string }>();
  if (error) throw new Error(`No se pudieron cargar las ventas: ${error.message}`);
  return data?.fecha ?? null;
}

/** Todo lo del periodo, en páginas de 1000 (Supabase corta ahí sin avisar). null = todas las sucursales visibles. */
export async function datosVentas(supabase: SupabaseClient, sucursal: string | null, p: Periodo, anterior: Periodo): Promise<DatosVentas> {
  const [dias, renglones, previos, cierres] = await Promise.all([
    leerTodo<DiaConDesglose>((desde, hasta) => {
      let q = supabase.from("ventas_dia")
        .select("sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, ventas_dia_desglose(tipo, pedidos, total)")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("fecha").order("sucursal_id").range(desde, hasta).returns<DiaConDesglose[]>();
    }),
    leerTodo<RenglonCosteo>((desde, hasta) => {
      let q = supabase.from("ventas_producto_costeo")
        .select("fecha, dodo_id, nombre, categoria, cantidad, importe, importe_sin_descuento, importe_neto, costo_unitario")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("fecha").order("sucursal_id").order("dodo_id").range(desde, hasta).returns<RenglonCosteo[]>();
    }),
    leerTodo<{ dodo_id: number; importe: number }>((desde, hasta) => {
      let q = supabase.from("ventas_producto").select("dodo_id, importe").gte("fecha", anterior.desde).lte("fecha", anterior.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("fecha").order("sucursal_id").order("dodo_id").range(desde, hasta).returns<{ dodo_id: number; importe: number }[]>();
    }),
    leerTodo<CierreDia>((desde, hasta) => {
      let q = supabase.from("cierres_dia").select("sucursal_id, fecha, efectivo, tarjeta, app, rappi, iva, transacciones")
        .gte("fecha", p.desde).lte("fecha", p.hasta);
      if (sucursal) q = q.eq("sucursal_id", sucursal);
      return q.order("fecha").order("sucursal_id").range(desde, hasta).returns<CierreDia[]>();
    }),
  ]);
  return { dias, renglones, anterior: previos, cierres };
}
```

- [ ] **Step 2: Gráfica de barras en SVG**

`components/Grafica.tsx`:

```tsx
export type Barra = { clave: string; etiqueta: string; valor: number; texto: string; alerta?: boolean };

/**
 * Barras horizontales en SVG: una fila por dato con su etiqueta y su valor escritos, para que se lea en celular
 * sin tablas anchas. La barra más larga es el valor más alto.
 */
export function Grafica({ titulo, barras }: { titulo: string; barras: readonly Barra[] }) {
  const max = Math.max(0, ...barras.map((b) => b.valor));
  return (
    <ul className="grafica" aria-label={titulo}>
      {barras.map((b) => (
        <li key={b.clave} className="grafica-fila">
          <span className="grafica-etiqueta">{b.etiqueta}</span>
          <svg className="grafica-svg" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
            <rect className="grafica-fondo" x="0" y="0" width="100" height="10" />
            <rect className={b.alerta ? "grafica-rect grafica-rect-alerta" : "grafica-rect"} x="0" y="0"
              width={max > 0 ? Math.max(0, (b.valor / max) * 100) : 0} height="10" />
          </svg>
          <span className="grafica-valor">{b.texto}</span>
        </li>
      ))}
    </ul>
  );
}
```

Agrega al final de `app/globals.css` (después del bloque de la Tarea 5). En celular la etiqueta y el valor van arriba y la barra abajo, a todo lo ancho:

```css
.grafica { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.grafica-fila { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "etiqueta valor" "barra barra"; gap: 4px 12px; font-size: 0.95rem; }
.grafica-etiqueta { grid-area: etiqueta; overflow-wrap: anywhere; }
.grafica-valor { grid-area: valor; font-weight: 700; text-align: right; }
.grafica-svg { grid-area: barra; display: block; width: 100%; height: 12px; }
.grafica-fondo { fill: var(--papel-2); }
.grafica-rect { fill: var(--accion); }
.grafica-rect-alerta { fill: var(--alerta); }
```

- [ ] **Step 3: Página de reportes**

`app/ventas/page.tsx`:

```tsx
import Link from "next/link";
import { Grafica } from "@/components/Grafica";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos, porcentaje } from "@/lib/formato";
import { puedeImportarVentas, veVentasDeTodas } from "@/lib/roles";
import {
  costeo, descuentos, diasConCierre, NOMBRE_CATEGORIA, NOMBRE_TIPO, periodoAnterior, periodoElegido,
  periodoPorDefecto, porProducto, resumenVentas, sumarDesglose, topProductos, ventaPorDia, type Categoria,
} from "@/lib/ventas/calculos";
import { datosVentas, ultimoDiaConDatos } from "./datos";

const categoria = (c: Categoria | null) => (c ? NOMBRE_CATEGORIA[c] : "Sin categoría");
const cambio = (f: number | null) => (f === null ? "nuevo" : `${f >= 0 ? "▲" : "▼"} ${porcentaje(Math.abs(f))}`);

export default async function PaginaVentas({ searchParams }: { searchParams: Promise<{ desde?: string; hasta?: string; sucursal?: string }> }) {
  const q = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const todas = veVentasDeTodas(perfil.rol);

  const { data: sucursales, error } = await supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>();
  if (error) throw new Error(`No se pudieron cargar las sucursales: ${error.message}`);
  const nombreDe = new Map((sucursales ?? []).map((s) => [s.id, s.nombre]));
  // Gerente: siempre la suya (la base de datos tampoco le deja ver otra). Admin y corporativo: todas o una.
  const sucursal = todas ? (q.sucursal && nombreDe.has(q.sucursal) ? q.sucursal : null) : perfil.sucursal_id;

  const ultimo = await ultimoDiaConDatos(supabase, sucursal);
  if (!ultimo) {
    return (
      <>
        <div className="encabezado"><h1>Ventas</h1><p>Aún no hay ventas importadas{sucursal ? ` de ${nombreDe.get(sucursal)}` : ""}.</p></div>
        {puedeImportarVentas(perfil.rol) && <div className="acciones"><Link className="boton" href="/ventas/importar">Importar ventas</Link></div>}
      </>
    );
  }

  const periodo = periodoElegido(q.desde, q.hasta, periodoPorDefecto(ultimo));
  const d = await datosVentas(supabase, sucursal, periodo, periodoAnterior(periodo));
  const resumen = resumenVentas(d.dias);
  const productos = porProducto(d.renglones);
  const costos = costeo(d.renglones);
  const desc = descuentos(productos);
  const top = topProductos(productos, d.anterior);
  const porDia = ventaPorDia(d.dias);
  const tipos = sumarDesglose(d.dias.flatMap((x) => x.ventas_dia_desglose));
  const cierre = diasConCierre(d.dias, d.cierres);
  const conDiferencia = cierre.comparados.filter((c) => c.alerta);
  const m2 = sucursal ? d.dias.filter((x) => x.venta_m2 !== null) : [];
  const mayorCosto = productos.filter((p) => p.costoPct !== null).sort((a, b) => (b.costoPct ?? 0) - (a.costoPct ?? 0)).slice(0, 5);
  const titulo = sucursal ? nombreDe.get(sucursal) : "Todas las sucursales";

  return (
    <>
      <div className="encabezado">
        <h1>Ventas</h1>
        <p>{titulo} · {fechaTexto(periodo.desde)} a {fechaTexto(periodo.hasta)} · {resumen.dias} {resumen.dias === 1 ? "día" : "días"} con datos</p>
      </div>

      <form className="acciones" method="get">
        {todas && (
          <>
            <label htmlFor="sucursal" className="etiqueta">Sucursal</label>
            <select id="sucursal" name="sucursal" defaultValue={sucursal ?? ""}>
              <option value="">Todas</option>
              {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </>
        )}
        <label htmlFor="desde" className="etiqueta">Desde</label>
        <input id="desde" name="desde" type="date" defaultValue={periodo.desde} />
        <label htmlFor="hasta" className="etiqueta">Hasta</label>
        <input id="hasta" name="hasta" type="date" defaultValue={periodo.hasta} />
        <button className="boton boton-secundario" type="submit">Ver</button>
      </form>

      <Plegable id="resumen" titulo="Resumen" resumen={pesos(resumen.total)}>
        <dl className="tarjeta-datos">
          <dt>Venta</dt>
          <dd><span>Total {pesos(resumen.total)}</span><span>Neta {pesos(resumen.neta)}</span><span>IVA {pesos(resumen.iva)}</span></dd>
          <dt>Pedidos</dt>
          <dd><span>{resumen.pedidos}</span><span>Ticket promedio {resumen.ticket === null ? "—" : pesos(resumen.ticket)}</span></dd>
          <dt>Descuentos</dt>
          <dd><span>{pesos(desc.total)}</span><span>{porcentaje(desc.pct)} del precio de lista</span></dd>
          <dt>Costo teórico</dt>
          <dd><span>{pesos(costos.total.costo)}</span><span>{porcentaje(costos.total.costoPct)} de la venta neta con costo</span></dd>
        </dl>
      </Plegable>

      <Plegable id="diaria" titulo="Venta diaria" resumen={`${porDia.length} ${porDia.length === 1 ? "día" : "días"}`}>
        <Grafica titulo="Venta por día" barras={porDia.map((x) => ({
          clave: x.fecha, etiqueta: fechaTexto(x.fecha), valor: x.total, texto: `${pesos(x.total)} · ${x.pedidos} ped.`,
        }))} />
        <h3>Por tipo</h3>
        <Grafica titulo="Venta por tipo" barras={tipos.map((t) => ({
          clave: t.tipo, etiqueta: NOMBRE_TIPO[t.tipo], valor: t.total, texto: `${pesos(t.total)} · ${t.pedidos} ped.`,
        }))} />
        <h3>Por forma de pago</h3>
        <Grafica titulo="Venta por forma de pago" barras={[
          { clave: "efectivo", etiqueta: "Efectivo", valor: resumen.efectivo, texto: pesos(resumen.efectivo) },
          { clave: "tarjeta", etiqueta: "Tarjeta", valor: resumen.tarjeta, texto: pesos(resumen.tarjeta) },
          { clave: "en_linea", etiqueta: "En línea", valor: resumen.en_linea, texto: pesos(resumen.en_linea) },
        ]} />
        {m2.length > 0 && (
          <p>Venta por m² de comedor: {pesos(m2.reduce((s, x) => s + Number(x.venta_m2), 0) / m2.length)} por día en promedio.</p>
        )}
      </Plegable>

      <Plegable id="productos" titulo="Productos" resumen={`${productos.length} productos`}>
        <h3>Los 10 que más vendieron</h3>
        <Grafica titulo="Productos que más vendieron" barras={top.map((p) => ({
          clave: String(p.dodo_id), etiqueta: p.nombre, valor: p.importe,
          texto: `${pesos(p.importe)} · ${p.piezas} pzs · ${cambio(p.cambio)}`,
        }))} />
        <p className="saldo-nota">El cambio es contra los mismos días justo antes del periodo.</p>
        <h3>Mezcla por categoría</h3>
        <Grafica titulo="Mezcla por categoría" barras={costos.categorias.map((g) => ({
          clave: g.categoria ?? "sin", etiqueta: categoria(g.categoria), valor: g.importe,
          texto: `${porcentaje(resumen.total ? g.importe / resumen.total : null)} · ${g.piezas} pzs`,
        }))} />
      </Plegable>

      <Plegable id="descuentos" titulo="Descuentos" resumen={pesos(desc.total)}>
        <p>{pesos(desc.total)} de descuento sobre {pesos(desc.sinDescuento)} de precio de lista ({porcentaje(desc.pct)}).</p>
        {desc.top.length > 0 && (
          <Grafica titulo="Productos con más descuento" barras={desc.top.map((p) => ({
            clave: String(p.dodo_id), etiqueta: p.nombre, valor: p.descuento,
            texto: `${pesos(p.descuento)} (${porcentaje(p.sinDescuento ? p.descuento / p.sinDescuento : null)})`,
          }))} />
        )}
      </Plegable>

      <Plegable id="costos" titulo="Costos" resumen={porcentaje(costos.total.costoPct)} alerta={costos.sinCosto.length > 0}>
        <div className="tarjetas">
          {costos.categorias.map((g) => (
            <article key={g.categoria ?? "sin"} className="tarjeta">
              <h3>{categoria(g.categoria)}</h3>
              <dl className="tarjeta-datos">
                <dt>Costo %</dt><dd>{porcentaje(g.costoPct)}</dd>
                <dt>Costo promedio</dt><dd>{g.costoPromedio === null ? "—" : `${pesos(g.costoPromedio)} por pieza`}</dd>
                <dt>Costo teórico</dt><dd>{pesos(g.costo)}</dd>
                <dt>Piezas</dt><dd>{g.piezasConCosto} de {g.piezas} con costo</dd>
              </dl>
            </article>
          ))}
        </div>
        {mayorCosto.length > 0 && (
          <>
            <h3>Mayor costo %</h3>
            <Grafica titulo="Productos con mayor costo %" barras={mayorCosto.map((p) => ({
              clave: String(p.dodo_id), etiqueta: p.nombre, valor: p.costoPct ?? 0, texto: porcentaje(p.costoPct),
            }))} />
          </>
        )}
        {costos.sinCosto.length > 0 && (
          <p className="aviso aviso-info">
            Sin costo (no cuentan en el costo %): {costos.sinCosto.map((s) => `${s.nombre} (${s.piezas} pzs)`).join(", ")}.
            {puedeImportarVentas(perfil.rol) && <> <Link href="/ventas/costos?ver=sin-costo">Asignar costos</Link></>}
          </p>
        )}
      </Plegable>

      <Plegable id="cierre" titulo="Cierre contra Dodo IS" resumen={conDiferencia.length ? `${conDiferencia.length} con diferencia` : "Coinciden"}
        alerta={conDiferencia.length > 0}>
        {!cierre.comparados.length && <p className="vacio">Ningún día importado del periodo tiene cierre del gerente.</p>}
        {cierre.comparados.length > 0 && !conDiferencia.length && (
          <p className="aviso aviso-ok">Los {cierre.comparados.length} días con cierre coinciden con Dodo IS (diferencias de $1 o menos).</p>
        )}
        {conDiferencia.length > 0 && (
          <div className="tarjetas">
            {conDiferencia.map((c) => (
              <article key={`${c.sucursal_id}|${c.fecha}`} className="tarjeta" data-alerta="si">
                <h3>{nombreDe.get(c.sucursal_id)} · {fechaTexto(c.fecha)}</h3>
                <dl className="tarjeta-datos">
                  {c.filas.filter((f) => f.alerta).map((f) => (
                    <div key={f.concepto} style={{ display: "contents" }}>
                      <dt>{f.concepto}</dt>
                      <dd>
                        <span>Dodo IS {f.esPedido ? f.dodo : pesos(f.dodo)}</span>
                        <span>Cierre {f.esPedido ? f.cierre : pesos(f.cierre)}</span>
                        <span className="celda-alerta">Diferencia {f.esPedido ? f.diferencia : pesos(f.diferencia)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </article>
            ))}
          </div>
        )}
        {cierre.sinCierre > 0 && <p className="saldo-nota">{cierre.sinCierre} {cierre.sinCierre === 1 ? "día importado no tiene" : "días importados no tienen"} cierre del gerente.</p>}
        <p className="saldo-nota">
          Dodo IS cuenta el día de 0:00 a 23:59 y el cierre de la app hasta las 4:00: las ventas después de medianoche
          pueden explicar una diferencia.
        </p>
      </Plegable>
    </>
  );
}
```

- [ ] **Step 4: Typecheck, pruebas y build**

Run: `npm run typecheck && npm test && npm run build`
Expected: sin errores; rutas `/ventas`, `/ventas/costos`, `/ventas/importar`.

- [ ] **Step 5: Commit**

```bash
git add app/ventas/datos.ts app/ventas/page.tsx components/Grafica.tsx app/globals.css
git commit -m "Ventas: reportes de venta diaria, productos, descuentos, costos y cierre contra Dodo IS"
```

---

### Task 8: Manual, verificación y publicación

**Files:**
- Modify: `README.md` (sección nueva antes de "Siguiente paso: conectar con Dodo IS", y ese párrafo)

- [ ] **Step 1: Manual**

Inserta antes de `## Siguiente paso: conectar con Dodo IS`:

```markdown
## Ventas y costos (importados de Dodo IS)

Mientras la API de Dodo IS no está disponible, un **admin** importa cada día los dos reportes de Dodo IS de cada
sucursal: **Ventas** y **Productos** (ProductsSales, método de cálculo "Con descuentos"), de un solo día.
Con eso, en **Ventas** se ven la venta diaria, los productos, los descuentos, el costo teórico con costo promedio
ponderado por categoría y las diferencias entre el cierre del gerente y Dodo IS.

- **Importar** (solo admin): se suben los dos archivos → **Revisar** muestra sucursal, fecha, totales, si cuadran
  y qué productos no tienen categoría o costo → **Guardar**. Si no cuadran por más de $1, o si el día ya estaba
  importado (**Reimportar**), hay que marcar la casilla de confirmación. Los archivos no se guardan.
- **Costos** (solo admin): categoría y costo por pieza de cada producto, con la fecha desde la que aplica.
  Un costo nuevo no borra el anterior; los días previos se siguen costeando con el que estaba vigente.
- **Reportes**: admin y corporativo ven todas las sucursales o una; el gerente, la suya. Encargado y cajero no ven ventas.
  El costo % se calcula solo sobre los productos con costo; los que no tienen se listan aparte.
- Dodo IS cuenta el día de 0:00 a 23:59 y el cierre de la app hasta las 4:00: ventas después de medianoche pueden
  explicar una diferencia en "Cierre contra Dodo IS".

### Puesta en marcha

En Supabase → **SQL Editor**:

1. `supabase/migrations/0006_ventas_costos.sql`
2. `supabase/seed_ventas_costos.sql`
3. `supabase/pruebas/0006_ventas_costos.sql`: debe terminar con el error `PRUEBAS OK — …`.

### Prueba manual

1. Como admin, en **Ventas → Importar**, sube los reportes de Zapopan-1 del 25/09/2026: debe decir total $7,736.00,
   39 pedidos, ✅ cuadra. Guardar.
2. Súbelos otra vez: el botón dice **Reimportar** y pide la casilla.
3. Sube Ventas de un día y Productos de otro: debe decir que las fechas no coinciden.
4. En **Reportes**, el 25/09/2026: costo teórico $2,187.19 (33.8 %); pizzas $43.66 por pieza; Coca-Cola sin costo.
5. En **Costos**, "Sin costo" muestra las Coca-Cola; Hawaiana Mediano tiene el aviso de costo dudoso.
6. Como gerente solo aparece su sucursal y no hay Importar ni Costos; como encargado no aparece Ventas en el menú.
```

Y cambia el párrafo de "Siguiente paso: conectar con Dodo IS" por:

```markdown
Hoy las ventas se importan a mano desde los reportes de Dodo IS (ver "Ventas y costos"). Cuando vuelva el acceso a
la API, `/accounting/sales` puede llenar `ventas_dia` y `ventas_producto` automáticamente, y con `paymentMethod = Cash`,
agrupado por `cashBoxSessionId`, el efectivo del arqueo y del cierre del día.
```

- [ ] **Step 2: Verificación completa**

Run: `npm run typecheck && npm test && npm run build`
Expected: sin errores de tipos; todas las pruebas pasan (93 al escribir este plan); build con `/ventas`, `/ventas/costos`, `/ventas/importar`.

- [ ] **Step 3: Revisión manual de lo que las pruebas no cubren**

Con `npm run dev` y un usuario admin de prueba (Sebastián inicia sesión; nadie más escribe contraseñas):
- En ancho de celular (375 px) `/ventas`, `/ventas/importar` y `/ventas/costos` no tienen scroll horizontal; las gráficas se leen.
- La sección "Cierre contra Dodo IS" muestra la nota del día de 0:00 a 23:59 (Review Focus 5).
- En `/ventas/costos`, al guardar una categoría la página regresa a la misma tarjeta.

- [ ] **Step 4: Commit y push de la rama**

```bash
git add README.md
git commit -m "Manual: ventas y costos importados de Dodo IS"
git push origin ventas-costos
```

- [ ] **Step 5: Revisión independiente de la rama completa**

Un revisor nuevo revisa `git diff main...ventas-costos` contra el spec y este plan (Review Focus incluido). Corregir lo que encuentre antes de seguir.

- [ ] **Step 6: Puerta PRUEBAS OK y fusión**

Sebastián corre en Supabase los tres archivos de la Tarea 1 y confirma `PRUEBAS OK — …`. Solo entonces:

```bash
git checkout main
git merge --no-ff ventas-costos -m "Ventas y costos importados de Dodo IS"
git push origin main
```

Vercel despliega solo. Copiar los archivos cambiados a `C:\Users\sebcm\Downloads\dodo-control-efectivo_1\dodo-efectivo`.

- [ ] **Step 7: Arranque**

El admin importa los 7 días de la semana; cuando el modelo de costos se actualice, se cargan los costos nuevos con su fecha de vigencia.
