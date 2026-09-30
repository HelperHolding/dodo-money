-- Compras, fase 1: cartera de proveedores y catálogo de artículos.
-- Oficina central: el admin edita; corporativo consulta. La sucursal no ve este catálogo.
-- Nada se borra: se desactiva (activo = false). Requiere 0001–0010.

create type categoria_compra as enum ('consumible', 'activo_fijo', 'servicio', 'otro');
create type forma_pago as enum ('transferencia', 'efectivo', 'tarjeta', 'cheque');

-- Dígito verificador de Banxico: pesos 3, 7, 1 sobre los primeros 17 dígitos, módulo 10.
create or replace function clabe_valida(p text) returns boolean
language plpgsql immutable as $$
declare t int := 0;
begin
  if p is null or p !~ '^[0-9]{18}$' then return false; end if;
  for i in 1..17 loop
    t := t + (substr(p, i, 1)::int * (array[3, 7, 1])[((i - 1) % 3) + 1]) % 10;
  end loop;
  return (10 - t % 10) % 10 = substr(p, 18, 1)::int;
end $$;

create or replace function ve_compras() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text in ('admin', 'corporativo'), false)
$$;

create or replace function edita_compras() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text = 'admin', false)
$$;

create table proveedores (
  id                   uuid primary key default gen_random_uuid(),
  razon_social         text not null check (trim(razon_social) <> ''),
  nombre_comercial     text,
  rfc                  text not null unique check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  regimen_fiscal       text not null check (regimen_fiscal ~ '^6[0-9]{2}$'),
  contacto_nombre      text,
  telefono             text,
  correo               text check (correo is null or correo ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  banco                text,
  clabe                text check (clabe is null or clabe_valida(clabe)),
  cuenta               text,
  dias_credito         integer not null default 0 check (dias_credito between 0 and 365),
  forma_pago_habitual  forma_pago not null default 'transferencia',
  categorias           categoria_compra[] not null default '{}',
  notas                text,
  activo               boolean not null default true,
  motivo_desactivacion text,
  desactivado_por      uuid references perfiles(id),
  desactivado_en       timestamptz,
  creado_por           uuid references perfiles(id) default auth.uid(),
  creado_en            timestamptz not null default now(),
  check (activo or coalesce(trim(motivo_desactivacion), '') <> '')
);

create table articulos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null check (trim(nombre) <> ''),
  unidad          text not null check (trim(unidad) <> ''),
  tipo            categoria_compra not null,
  tasa_iva        text not null default '16' check (tasa_iva in ('16', '0', 'exento')),
  dodo_insumo_id  text unique,
  activo          boolean not null default true,
  motivo_desactivacion text,
  desactivado_por uuid references perfiles(id),
  desactivado_en  timestamptz,
  creado_por      uuid references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  check (dodo_insumo_id is null or (tipo = 'consumible' and dodo_insumo_id ~ '^[0-9A-F]{32}$')),
  check (activo or coalesce(trim(motivo_desactivacion), '') <> '')
);
create unique index articulos_nombre_unico on articulos (lower(nombre));

-- Quién y cuándo desactivó lo pone la base, no la pantalla; reactivar borra el motivo.
create or replace function registrar_desactivacion() returns trigger
language plpgsql as $$
begin
  if new.activo is distinct from old.activo then
    if new.activo then
      new.motivo_desactivacion := null; new.desactivado_por := null; new.desactivado_en := null;
    else
      new.desactivado_por := auth.uid(); new.desactivado_en := now();
    end if;
  else
    new.motivo_desactivacion := old.motivo_desactivacion;
    new.desactivado_por := old.desactivado_por;
    new.desactivado_en := old.desactivado_en;
  end if;
  return new;
end $$;

create trigger proveedores_desactivacion before update on proveedores
  for each row execute function registrar_desactivacion();
create trigger articulos_desactivacion before update on articulos
  for each row execute function registrar_desactivacion();

-- Último precio (sin IVA) por proveedor y artículo. Se llena al confirmar órdenes (fase 2).
create table precios_proveedor (
  proveedor_id  uuid not null references proveedores(id),
  articulo_id   uuid not null references articulos(id),
  precio        numeric(12,2) not null check (precio >= 0),
  fecha         date not null,
  orden_id      uuid,
  primary key (proveedor_id, articulo_id)
);

alter table proveedores       enable row level security;
alter table articulos         enable row level security;
alter table precios_proveedor enable row level security;

create policy ver_proveedores on proveedores for select using (ve_compras());
create policy alta_proveedor on proveedores for insert with check (edita_compras());
create policy editar_proveedor on proveedores for update using (edita_compras()) with check (edita_compras());

create policy ver_articulos on articulos for select using (ve_compras());
create policy alta_articulo on articulos for insert with check (edita_compras());
create policy editar_articulo on articulos for update using (edita_compras()) with check (edita_compras());

create policy ver_precios_proveedor on precios_proveedor for select using (ve_compras());
-- Sin políticas de borrado: nada se borra. Sin escritura directa en precios_proveedor.
