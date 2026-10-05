-- P&L mensual, fase 1: cuenta del P&L en proveedores, facturas y caja chica; parámetros con vigencia;
-- plantilla y ajustes de nómina; gastos del mes sin factura; metas por sucursal (precargadas del PL Base de Dodo).
-- Admin escribe; admin y corporativo leen (incluye nómina). Requiere 0001–0024.

create or replace function ve_finanzas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text in ('admin', 'corporativo'), false)
$$;
create or replace function edita_finanzas() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text = 'admin', false)
$$;

-- Cuentas del P&L (renglones que se alimentan de gastos) y memo (insumos, inversiones: no son gasto del EBITDA).
alter table proveedores add column cuenta_pl text check (cuenta_pl in
  ('repartidores', 'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'otros', 'insumos', 'inversiones'));
alter table facturas add column cuenta_pl text check (cuenta_pl in
  ('repartidores', 'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'otros', 'insumos', 'inversiones'));
alter table gastos_caja_chica add column cuenta_pl text check (cuenta_pl in
  ('repartidores', 'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'otros'));

-- La vista se rehace para que traiga la columna nueva (select f.* se fija al crear la vista).
drop view facturas_saldo;
create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo, neto_factura(f.id) as neto, pagado_factura(f.id) as pagado, falta_complemento(f.id) as falta_complemento
  from facturas f;

-- Una factura nueva hereda la cuenta de su proveedor.
create or replace function heredar_cuenta_factura() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.cuenta_pl is null then select cuenta_pl into new.cuenta_pl from proveedores where id = new.proveedor_id; end if;
  return new;
end $$;
create trigger facturas_heredar_cuenta before insert on facturas for each row execute function heredar_cuenta_factura();

create or replace function asignar_cuenta_factura(p_factura uuid, p_cuenta text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  update facturas set cuenta_pl = nullif(p_cuenta, '') where id = p_factura;
  if not found then raise exception 'Factura no encontrada'; end if;
end $$;
revoke execute on function asignar_cuenta_factura(uuid, text) from public, anon;
grant execute on function asignar_cuenta_factura(uuid, text) to authenticated;

-- Parámetros con vigencia.
create table pl_parametros (
  id            uuid primary key default gen_random_uuid(),
  clave         text not null check (clave in ('regalias_pct', 'rappi_pct', 'dlocal_pct', 'oxxo_pct', 'oxxo_participacion', 'netpay_pct', 'amex_pct', 'amex_participacion')),
  valor         numeric(8,5) not null check (valor >= 0 and valor <= 1),
  vigente_desde date not null,
  unique (clave, vigente_desde)
);
insert into pl_parametros (clave, valor, vigente_desde) values
  ('regalias_pct', 0.05, '2026-01-01'),
  ('rappi_pct', 0, '2026-10-01'), ('rappi_pct', 0.18, '2027-01-01'),
  ('dlocal_pct', 0.035, '2026-01-01'), ('oxxo_pct', 0.05, '2026-01-01'), ('oxxo_participacion', 0, '2026-01-01'),
  ('netpay_pct', 0.018, '2026-01-01'), ('amex_pct', 0.036, '2026-01-01'), ('amex_participacion', 0, '2026-01-01');

-- Plantilla de nómina (sucursal null = oficina central), con vigencia.
create table nomina_plantilla (
  id            uuid primary key default gen_random_uuid(),
  sucursal_id   uuid references sucursales(id),
  puesto        text not null check (trim(puesto) <> ''),
  renglon       text not null check (renglon in ('cocina', 'gerencia')),
  personas      integer not null check (personas >= 0),
  sueldo        numeric(12,2) not null check (sueldo >= 0),
  pct_cargas    numeric(6,4) not null default 0 check (pct_cargas >= 0 and pct_cargas <= 1),
  bono          numeric(12,2) not null default 0 check (bono >= 0),
  vigente_desde date not null
);
create unique index nomina_plantilla_unica on nomina_plantilla (coalesce(sucursal_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(puesto), vigente_desde);
insert into nomina_plantilla (sucursal_id, puesto, renglon, personas, sueldo, pct_cargas, bono, vigente_desde)
select s.id, p.puesto, p.renglon, p.personas, p.sueldo, p.cargas, 0, date '2026-10-01'
  from sucursales s cross join (values
    ('Gerente', 'gerencia', 1, 22000.00, 0.20),
    ('Jefe de turno', 'cocina', 2, 12223.20, 0.129),
    ('Pizzero / cajero', 'cocina', 4, 10741.20, 0.1171)
  ) as p(puesto, renglon, personas, sueldo, cargas);

create table nomina_ajustes (
  id          uuid primary key default gen_random_uuid(),
  sucursal_id uuid references sucursales(id),
  mes         date not null check (extract(day from mes) = 1),
  renglon     text not null check (renglon in ('cocina', 'gerencia')),
  monto       numeric(12,2) not null,
  concepto    text not null check (trim(concepto) <> ''),
  creado_por  uuid references perfiles(id) default auth.uid(),
  creado_en   timestamptz not null default now()
);

create table gastos_mes (
  id          uuid primary key default gen_random_uuid(),
  sucursal_id uuid references sucursales(id),
  mes         date not null check (extract(day from mes) = 1),
  cuenta      text not null check (cuenta in ('repartidores', 'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'otros')),
  monto       numeric(12,2) not null,
  concepto    text not null check (trim(concepto) <> ''),
  creado_por  uuid references perfiles(id) default auth.uid(),
  creado_en   timestamptz not null default now()
);

-- Metas por sucursal: % de la venta neta, monto fijo, % de la venta Rappi con IVA, o el costo de la plantilla.
create table pl_metas (
  sucursal_id uuid not null references sucursales(id),
  renglon     text not null check (renglon in ('alimento', 'merma', 'nomina_cocina', 'nomina_gerencia', 'repartidores', 'agregadores',
                'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'regalias', 'otros', 'oficina')),
  tipo        text not null check (tipo in ('pct', 'monto', 'pct_rappi', 'plantilla')),
  valor       numeric(12,4) not null default 0 check (valor >= 0),
  primary key (sucursal_id, renglon)
);
insert into pl_metas (sucursal_id, renglon, tipo, valor)
select s.id, m.renglon, m.tipo, m.valor from sucursales s cross join (values
  ('alimento', 'pct', 0.30), ('merma', 'pct', 0.02), ('nomina_cocina', 'plantilla', 0), ('nomina_gerencia', 'plantilla', 0),
  ('repartidores', 'monto', 0), ('agregadores', 'pct_rappi', 0.18), ('marketing_agregadores', 'monto', 0), ('marketing', 'pct', 0.04),
  ('renta', 'monto', 30000), ('servicios', 'monto', 20000), ('mantenimiento', 'monto', 3000), ('consumibles_equipo', 'monto', 5000),
  ('regalias', 'pct', 0.05), ('otros', 'pct', 0.03), ('oficina', 'pct', 0.05)
) as m(renglon, tipo, valor);

alter table pl_parametros enable row level security;
alter table nomina_plantilla enable row level security;
alter table nomina_ajustes enable row level security;
alter table gastos_mes enable row level security;
alter table pl_metas enable row level security;
create policy ver_pl_parametros on pl_parametros for select using (ve_finanzas());
create policy editar_pl_parametros on pl_parametros for all using (edita_finanzas()) with check (edita_finanzas());
create policy ver_nomina_plantilla on nomina_plantilla for select using (ve_finanzas());
create policy editar_nomina_plantilla on nomina_plantilla for all using (edita_finanzas()) with check (edita_finanzas());
create policy ver_nomina_ajustes on nomina_ajustes for select using (ve_finanzas());
create policy editar_nomina_ajustes on nomina_ajustes for all using (edita_finanzas()) with check (edita_finanzas());
create policy ver_gastos_mes on gastos_mes for select using (ve_finanzas());
create policy editar_gastos_mes on gastos_mes for all using (edita_finanzas()) with check (edita_finanzas());
create policy ver_pl_metas on pl_metas for select using (ve_finanzas());
create policy editar_pl_metas on pl_metas for all using (edita_finanzas()) with check (edita_finanzas());
