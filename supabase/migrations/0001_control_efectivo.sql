-- Control de efectivo · Dodo Pizza
-- Cuatro cajas por sucursal (venta, cambios, bóveda, caja chica) más el banco como destino.
-- Todo movimiento entre cajas queda registrado, lo confirma una segunda persona
-- y no se puede editar ni borrar: las correcciones se hacen con un movimiento nuevo.


-- ─── Catálogos ──────────────────────────────────────────────────────────────
create type rol_usuario       as enum ('cajero', 'encargado', 'gerente', 'admin');
create type tipo_caja         as enum ('venta', 'cambios', 'boveda', 'caja_chica', 'banco');
create type tipo_turno        as enum ('matutino', 'vespertino');
create type momento_arqueo    as enum ('inicio', 'traspaso', 'cierre');
create type tipo_movimiento   as enum ('apertura', 'retiro_boveda', 'cambio_morralla', 'deposito_banco', 'reposicion_caja_chica');
create type estado_movimiento as enum ('pendiente', 'confirmado', 'rechazado');
create type tipo_comprobante  as enum ('cfdi', 'nota', 'sin_comprobante');

-- ─── Tablas ─────────────────────────────────────────────────────────────────
create table sucursales (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null unique,
  fondo_caja_venta  numeric(12,2) not null default 0 check (fondo_caja_venta >= 0),
  fondo_cambios     numeric(12,2) not null default 0 check (fondo_cambios >= 0),
  fondo_caja_chica  numeric(12,2) not null default 0 check (fondo_caja_chica >= 0),
  limite_retiro     numeric(12,2) not null default 0 check (limite_retiro >= 0),
  creado_en         timestamptz not null default now()
);

create table perfiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  nombre       text not null,
  rol          rol_usuario not null default 'cajero',
  sucursal_id  uuid references sucursales(id),
  activo       boolean not null default true
);

create table cajas (
  id             uuid primary key default gen_random_uuid(),
  sucursal_id    uuid not null references sucursales(id) on delete cascade,
  tipo           tipo_caja not null,
  nombre         text not null,
  saldo_inicial  numeric(12,2) not null default 0,
  unique (sucursal_id, tipo)
);

create table turnos (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid not null references sucursales(id),
  fecha         date not null,
  tipo          tipo_turno not null,
  encargado_id  uuid not null references perfiles(id) default auth.uid(),
  abierto_en    timestamptz not null default now(),
  cerrado_en    timestamptz,
  unique (sucursal_id, fecha, tipo)
);

create table arqueos (
  id                uuid primary key default gen_random_uuid(),
  turno_id          uuid not null references turnos(id) on delete cascade,
  momento           momento_arqueo not null,
  conteo            jsonb not null default '{}'::jsonb,   -- {"1000": 3, "500": 2, "0.5": 10}
  total_contado     numeric(12,2) not null check (total_contado >= 0),
  fondo_inicial     numeric(12,2) not null default 0,
  ventas_efectivo   numeric(12,2) not null default 0,     -- según Dodo IS
  retiros_boveda    numeric(12,2) not null default 0,     -- calculado de movimientos del turno
  esperado          numeric(12,2) generated always as (fondo_inicial + ventas_efectivo - retiros_boveda) stored,
  diferencia        numeric(12,2) generated always as (total_contado - (fondo_inicial + ventas_efectivo - retiros_boveda)) stored,
  tarjeta_real      numeric(12,2),
  tarjeta_sistema   numeric(12,2),
  app_real          numeric(12,2),
  app_sistema       numeric(12,2),
  rappi_real        numeric(12,2),
  rappi_sistema     numeric(12,2),
  transacciones     integer,
  ticket_promedio   numeric(12,2),
  explicacion       text,
  entrega_id        uuid not null references perfiles(id) default auth.uid(),
  recibe_id         uuid references perfiles(id),
  recibido_en       timestamptz,
  creado_en         timestamptz not null default now(),
  check (recibe_id is null or recibe_id <> entrega_id)
);

create table movimientos (
  id               uuid primary key default gen_random_uuid(),
  sucursal_id      uuid not null references sucursales(id),
  turno_id         uuid references turnos(id),
  tipo             tipo_movimiento not null,
  caja_origen_id   uuid not null references cajas(id),
  caja_destino_id  uuid not null references cajas(id),
  monto            numeric(12,2) not null check (monto > 0),
  folio            text,
  nota             text,
  estado           estado_movimiento not null default 'pendiente',
  registrado_por   uuid not null references perfiles(id) default auth.uid(),
  confirmado_por   uuid references perfiles(id),
  confirmado_en    timestamptz,
  creado_en        timestamptz not null default now(),
  check (caja_origen_id <> caja_destino_id),
  check (confirmado_por is null or confirmado_por <> registrado_por)
);

create table gastos_caja_chica (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  fecha           date not null,
  concepto        text not null,
  proveedor       text,
  monto           numeric(12,2) not null check (monto > 0),
  comprobante     tipo_comprobante not null,
  uuid_cfdi       text,
  registrado_por  uuid not null references perfiles(id) default auth.uid(),
  autorizado_por  uuid references perfiles(id),
  reposicion_id   uuid references movimientos(id),
  creado_en       timestamptz not null default now(),
  check (comprobante <> 'cfdi' or uuid_cfdi is not null)
);

create table cierres_dia (
  id                  uuid primary key default gen_random_uuid(),
  sucursal_id         uuid not null references sucursales(id),
  fecha               date not null,
  efectivo            numeric(12,2) not null default 0,
  tarjeta             numeric(12,2) not null default 0,
  app                 numeric(12,2) not null default 0,
  rappi               numeric(12,2) not null default 0,
  venta_total         numeric(12,2) generated always as (efectivo + tarjeta + app + rappi) stored,
  descuentos          numeric(12,2) not null default 0,
  iva                 numeric(12,2) not null default 0,
  venta_neta          numeric(12,2) generated always as (efectivo + tarjeta + app + rappi - iva) stored,
  transacciones       integer not null default 0,
  ticket_promedio     numeric(12,2) generated always as (
                        case when transacciones > 0
                             then round((efectivo + tarjeta + app + rappi - iva) / transacciones, 2)
                             else 0 end) stored,
  boveda_inicial      numeric(12,2) not null default 0,
  retiros_dia         numeric(12,2) not null default 0,
  aperturas_dia       numeric(12,2) not null default 0,
  deposito_dia        numeric(12,2) not null default 0,
  boveda_esperado     numeric(12,2) generated always as (boveda_inicial + retiros_dia - aperturas_dia - deposito_dia) stored,
  boveda_contado      numeric(12,2) not null default 0,
  boveda_diferencia   numeric(12,2) generated always as (boveda_contado - (boveda_inicial + retiros_dia - aperturas_dia - deposito_dia)) stored,
  cambios_autorizado  numeric(12,2) not null default 0,
  cambios_contado     numeric(12,2) not null default 0,
  cambios_diferencia  numeric(12,2) generated always as (cambios_contado - cambios_autorizado) stored,
  diferencia_turnos   numeric(12,2) not null default 0,
  deposito_banco      text,
  deposito_ficha      text,
  deposito_fecha      timestamptz,
  cerrado_por         uuid not null references perfiles(id) default auth.uid(),
  cerrado_en          timestamptz not null default now(),
  unique (sucursal_id, fecha)
);

create index on movimientos (sucursal_id, creado_en desc);
create index on movimientos (turno_id);
create index on arqueos (turno_id);
create index on gastos_caja_chica (sucursal_id, fecha);

-- ─── Funciones de apoyo ─────────────────────────────────────────────────────
create or replace function mi_sucursal() returns uuid
language sql stable security definer set search_path = public as $$
  select sucursal_id from perfiles where id = auth.uid() and activo
$$;

create or replace function mi_rol() returns rol_usuario
language sql stable security definer set search_path = public as $$
  select rol from perfiles where id = auth.uid() and activo
$$;

-- Cada tipo de movimiento solo puede ir por una ruta autorizada.
create or replace function validar_ruta_movimiento() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t_origen  tipo_caja;
  t_destino tipo_caja;
  s_origen  uuid;
  s_destino uuid;
begin
  select tipo, sucursal_id into t_origen, s_origen from cajas where id = new.caja_origen_id;
  select tipo, sucursal_id into t_destino, s_destino from cajas where id = new.caja_destino_id;

  if s_origen <> new.sucursal_id or s_destino <> new.sucursal_id then
    raise exception 'Las dos cajas deben ser de la misma sucursal del movimiento';
  end if;

  if not (
       (new.tipo = 'apertura'              and t_origen = 'boveda'  and t_destino = 'venta')
    or (new.tipo = 'retiro_boveda'         and t_origen = 'venta'   and t_destino = 'boveda')
    or (new.tipo = 'cambio_morralla'       and t_origen in ('venta','cambios') and t_destino in ('venta','cambios'))
    or (new.tipo = 'deposito_banco'        and t_origen = 'boveda'  and t_destino = 'banco')
    or (new.tipo = 'reposicion_caja_chica' and t_origen = 'banco'   and t_destino = 'caja_chica')
  ) then
    raise exception 'Ruta no permitida para %: de % a %', new.tipo, t_origen, t_destino;
  end if;

  if new.tipo = 'deposito_banco' and coalesce(trim(new.folio), '') = '' then
    raise exception 'El depósito al banco necesita número de ficha en el folio';
  end if;

  return new;
end $$;

create trigger movimientos_validar_ruta
  before insert on movimientos
  for each row execute function validar_ruta_movimiento();

-- Confirmar o rechazar un movimiento: solo otra persona de la misma sucursal.
create or replace function confirmar_movimiento(p_id uuid, p_aceptar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m movimientos;
begin
  select * into m from movimientos where id = p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if m.sucursal_id <> mi_sucursal() and mi_rol() <> 'admin' then
    raise exception 'El movimiento es de otra sucursal';
  end if;
  if m.estado <> 'pendiente' then raise exception 'El movimiento ya fue %', m.estado; end if;
  if m.registrado_por = auth.uid() then
    raise exception 'Quien registra el movimiento no puede confirmarlo';
  end if;
  if m.tipo in ('deposito_banco', 'reposicion_caja_chica') and mi_rol() not in ('gerente', 'admin') then
    raise exception 'Solo un gerente confirma depósitos y reposiciones';
  end if;

  update movimientos
     set estado = case when p_aceptar then 'confirmado'::estado_movimiento else 'rechazado'::estado_movimiento end,
         confirmado_por = auth.uid(),
         confirmado_en = now()
   where id = p_id;
end $$;

-- Quien recibe el turno confirma el arqueo con su propia sesión.
create or replace function recibir_arqueo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a arqueos; s uuid;
begin
  select * into a from arqueos where id = p_id for update;
  if not found then raise exception 'Arqueo no encontrado'; end if;
  select sucursal_id into s from turnos where id = a.turno_id;
  if s <> mi_sucursal() and mi_rol() <> 'admin' then raise exception 'El arqueo es de otra sucursal'; end if;
  if a.recibe_id is not null then raise exception 'El arqueo ya fue recibido'; end if;
  if a.entrega_id = auth.uid() then raise exception 'Quien entrega no puede recibir su propio arqueo'; end if;
  update arqueos set recibe_id = auth.uid(), recibido_en = now() where id = p_id;
end $$;

-- Al guardar el arqueo de cierre, el turno queda cerrado.
create or replace function cerrar_turno_con_arqueo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.momento = 'cierre' then
    update turnos set cerrado_en = now() where id = new.turno_id and cerrado_en is null;
  end if;
  return new;
end $$;

create trigger arqueos_cerrar_turno
  after insert on arqueos
  for each row execute function cerrar_turno_con_arqueo();

-- ─── Vistas ─────────────────────────────────────────────────────────────────
-- Saldo de cada caja: saldo inicial + entradas − salidas confirmadas (sin cambios de morralla) − gastos.
-- La caja de venta no se muestra aquí: su saldo depende de las ventas en efectivo de Dodo IS (ver arqueos).
create view saldos_cajas with (security_invoker = true) as
select
  c.id as caja_id, c.sucursal_id, c.tipo, c.nombre,
  c.saldo_inicial
  + coalesce((select sum(m.monto) from movimientos m
              where m.caja_destino_id = c.id and m.estado = 'confirmado' and m.tipo <> 'cambio_morralla'), 0)
  - coalesce((select sum(m.monto) from movimientos m
              where m.caja_origen_id = c.id and m.estado = 'confirmado' and m.tipo <> 'cambio_morralla'), 0)
  - case when c.tipo = 'caja_chica'
         then coalesce((select sum(g.monto) from gastos_caja_chica g where g.sucursal_id = c.sucursal_id), 0)
         else 0 end
  as saldo
from cajas c
where c.tipo in ('boveda', 'caja_chica', 'cambios');

-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table sucursales        enable row level security;
alter table perfiles          enable row level security;
alter table cajas             enable row level security;
alter table turnos            enable row level security;
alter table arqueos           enable row level security;
alter table movimientos       enable row level security;
alter table gastos_caja_chica enable row level security;
alter table cierres_dia       enable row level security;

create policy ver_sucursal on sucursales for select
  using (id = mi_sucursal() or mi_rol() = 'admin');

create policy ver_perfiles on perfiles for select
  using (id = auth.uid() or sucursal_id = mi_sucursal() or mi_rol() = 'admin');

create policy ver_cajas on cajas for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');

create policy ver_turnos on turnos for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');
create policy abrir_turno on turnos for insert
  with check (sucursal_id = mi_sucursal() and encargado_id = auth.uid()
              and mi_rol() in ('encargado', 'gerente', 'admin'));

create policy ver_arqueos on arqueos for select
  using (exists (select 1 from turnos t where t.id = turno_id
                 and (t.sucursal_id = mi_sucursal() or mi_rol() = 'admin')));
create policy registrar_arqueo on arqueos for insert
  with check (entrega_id = auth.uid()
              and exists (select 1 from turnos t where t.id = turno_id and t.sucursal_id = mi_sucursal()));

create policy ver_movimientos on movimientos for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');
create policy registrar_movimiento on movimientos for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid()
              and estado = 'pendiente' and confirmado_por is null);

create policy ver_gastos on gastos_caja_chica for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');
create policy registrar_gasto on gastos_caja_chica for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid());

create policy ver_cierres on cierres_dia for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');
create policy cerrar_dia on cierres_dia for insert
  with check (sucursal_id = mi_sucursal() and cerrado_por = auth.uid()
              and mi_rol() in ('gerente', 'admin'));

-- Sin políticas de update ni delete: los registros no se editan ni se borran.
-- Los únicos cambios permitidos pasan por confirmar_movimiento() y recibir_arqueo().

grant execute on function confirmar_movimiento(uuid, boolean) to authenticated;
grant execute on function recibir_arqueo(uuid) to authenticated;
