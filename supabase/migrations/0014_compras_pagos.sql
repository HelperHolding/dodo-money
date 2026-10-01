-- Compras, fase 4: pagos a proveedores (completos o en abonos; uno puede cubrir varias facturas),
-- complementos de pago (CFDI tipo P) y fecha programada de pago. El saldo de una factura ahora resta lo pagado.
-- Admin registra; corporativo consulta. Nada se borra: un pago se anula con motivo. Requiere 0001–0013.

alter table facturas add column pago_programado_el date;

create table pagos (
  id                uuid primary key default gen_random_uuid(),
  proveedor_id      uuid not null references proveedores(id),
  fecha             date not null,
  monto             numeric(14,2) not null check (monto > 0),
  forma             forma_pago not null,
  cuenta_origen     text,
  referencia        text,
  comprobante_ruta  text,
  creado_por        uuid references perfiles(id) default auth.uid(),
  creado_en         timestamptz not null default now(),
  anulado_por       uuid references perfiles(id),
  anulado_en        timestamptz,
  motivo_anulacion  text,
  check (anulado_en is null or coalesce(trim(motivo_anulacion), '') <> '')
);
create index pagos_proveedor on pagos (proveedor_id);

create table pago_aplicaciones (
  id          bigserial primary key,
  pago_id     uuid not null references pagos(id),
  factura_id  uuid not null references facturas(id),
  monto       numeric(14,2) not null check (monto > 0),
  unique (pago_id, factura_id)
);
create index pago_aplicaciones_factura on pago_aplicaciones (factura_id);

create table complementos_pago (
  id             uuid primary key default gen_random_uuid(),
  uuid           text not null unique,
  fecha          date not null,
  rfc_emisor     text not null,
  nombre_emisor  text not null default '',
  proveedor_id   uuid references proveedores(id),
  monto          numeric(14,2) not null default 0,
  xml_ruta       text not null,
  creado_por     uuid references perfiles(id) default auth.uid(),
  creado_en      timestamptz not null default now()
);

-- Ligado por el UUID de la factura (puede llegar antes que la factura).
create table complemento_facturas (
  id              bigserial primary key,
  complemento_id  uuid not null references complementos_pago(id),
  factura_uuid    text not null,
  monto_pagado    numeric(14,2) not null default 0,
  parcialidad     integer
);
create index complemento_facturas_uuid on complemento_facturas (factura_uuid);

-- ─── Cálculos ───────────────────────────────────────────────────────────────
create or replace function pagado_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when not ve_compras() then null else
    coalesce((select sum(a.monto) from pago_aplicaciones a join pagos p on p.id = a.pago_id
               where a.factura_id = p_id and p.anulado_en is null), 0) end
$$;

-- Saldo por pagar = neto (total − notas de crédito) − pagos vigentes.
create or replace function saldo_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(neto_factura(p_id) - pagado_factura(p_id), 0)
$$;

create or replace function cubierto_por_complementos(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cf.monto_pagado) from complemento_facturas cf join facturas f on f.uuid = cf.factura_uuid where f.id = p_id), 0)
$$;

-- PPD con más pagado que lo amparado por complementos (±1 centavo).
create or replace function falta_complemento(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select f.metodo_pago = 'PPD' from facturas f where f.id = p_id), false)
     and pagado_factura(p_id) > cubierto_por_complementos(p_id) + 0.01
$$;

drop view facturas_saldo;
create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo, neto_factura(f.id) as neto, pagado_factura(f.id) as pagado, falta_complemento(f.id) as falta_complemento
  from facturas f;

-- Igual que cotejar() en lib/compras/facturas.ts: orden ↔ recibido ↔ facturado (±$1) de las órdenes de la factura.
create or replace function cotejo_factura(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_ordenes uuid[]; v_ordenado numeric; v_recibido numeric; v_completa boolean; v_facturado numeric;
begin
  select array_agg(orden_id) into v_ordenes from factura_ordenes where factura_id = p_id;
  if v_ordenes is null then return 'sin_orden'; end if;
  select coalesce(sum(total_orden(o.id)), 0), bool_and(recepcion_completa(o.id)) into v_ordenado, v_completa from unnest(v_ordenes) o(id);
  select coalesce(sum(round(recibido_renglon(r.id) * r.precio, 2)
                    + round(round(recibido_renglon(r.id) * r.precio, 2) * case when r.tasa_iva = '16' then 0.16 else 0 end, 2)), 0)
    into v_recibido from orden_renglones r where r.orden_id = any(v_ordenes);
  select coalesce(sum(neto_factura(fx.id)), 0) into v_facturado
    from facturas fx
   where fx.tipo = 'ingreso' and fx.estado <> 'cancelada'
     and exists (select 1 from factura_ordenes fo where fo.factura_id = fx.id and fo.orden_id = any(v_ordenes));
  if v_recibido <= 0 then return 'nada_recibido'; end if;
  if v_facturado > v_recibido + 1 then return 'facturado_de_mas'; end if;
  if v_completa and abs(v_facturado - v_ordenado) > 1 then return 'precio_distinto'; end if;
  return 'cuadra';
end $$;

create or replace function actualizar_estado_factura(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update facturas f
     set estado = case when saldo_factura(f.id) <= 0 then 'pagada'::estado_factura
                       when pagado_factura(f.id) > 0 then 'parcial'::estado_factura
                       else 'por_pagar'::estado_factura end
   where f.id = p_id and f.tipo = 'ingreso' and f.estado <> 'cancelada';
end $$;

-- Una nota de crédito (al registrarse o cancelarse) recalcula el estado de la factura que corrige; una factura que llega
-- después de su nota también se recalcula. Sin esto, una factura "pagada" con saldo nuevo desaparecería de Pagos.
create or replace function recalcular_por_nota() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'egreso' and new.uuid_relacionado is not null then
    perform actualizar_estado_factura(f.id) from facturas f where f.uuid = new.uuid_relacionado;
  elsif new.tipo = 'ingreso' and tg_op = 'INSERT' then
    perform actualizar_estado_factura(new.id);
  end if;
  return null;
end $$;
create trigger facturas_nota_credito after insert or update of estado on facturas
  for each row execute function recalcular_por_nota();

revoke execute on function pagado_factura(uuid), saldo_factura(uuid), cubierto_por_complementos(uuid), falta_complemento(uuid), cotejo_factura(uuid) from public, anon;
grant execute on function pagado_factura(uuid), saldo_factura(uuid), cubierto_por_complementos(uuid), falta_complemento(uuid), cotejo_factura(uuid) to authenticated;
revoke execute on function actualizar_estado_factura(uuid) from public, anon, authenticated;

-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table pagos                 enable row level security;
alter table pago_aplicaciones     enable row level security;
alter table complementos_pago     enable row level security;
alter table complemento_facturas  enable row level security;

create policy ver_pagos on pagos for select using (ve_compras());
create policy ver_aplicaciones on pago_aplicaciones for select using (ve_compras());
create policy ver_complementos on complementos_pago for select using (ve_compras());
create policy ver_complemento_facturas on complemento_facturas for select using (ve_compras());
-- Escritura solo con las funciones de abajo.

-- Comprobantes de pago como foto o PDF en el mismo bucket.
update storage.buckets
   set allowed_mime_types = array['application/xml', 'text/xml', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'facturas';

-- ─── Pagos ──────────────────────────────────────────────────────────────────
-- p_aplicaciones: [{factura_id, monto}]. Una transacción: se bloquean las facturas para que dos pagos a la vez no pasen el saldo.
create or replace function registrar_pago(p_proveedor uuid, p_fecha date, p_monto numeric, p_forma text, p_cuenta text, p_referencia text,
                                          p_comprobante text, p_aplicaciones jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; f facturas; v_suma numeric := 0; v_id uuid; v_cotejo text;
begin
  perform exigir_admin_compras();
  if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto del pago'; end if;
  if p_fecha is null or p_fecha > hoy_mx() then raise exception 'La fecha del pago no puede ser futura'; end if;
  if jsonb_array_length(coalesce(p_aplicaciones, '[]'::jsonb)) = 0 then raise exception 'Elige al menos una factura'; end if;
  if (select count(*) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric))
     <> (select count(distinct factura_id) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric)) then
    raise exception 'Una factura viene dos veces en el pago';
  end if;

  for a in select * from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric) order by factura_id loop
    select * into f from facturas where id = a.factura_id for update;
    if not found then raise exception 'Factura no encontrada'; end if;
    if f.proveedor_id <> p_proveedor then raise exception 'Todas las facturas del pago deben ser del mismo proveedor'; end if;
    if f.tipo <> 'ingreso' or f.estado = 'cancelada' then raise exception 'La factura % no se puede pagar', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid); end if;
    if a.monto is null or a.monto <= 0 then raise exception 'Cada factura del pago debe llevar un monto mayor a cero'; end if;
    if a.monto > saldo_factura(f.id) + 0.005 then
      raise exception 'A la factura % se le aplican % pero su saldo es %', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid), a.monto, saldo_factura(f.id);
    end if;
    v_cotejo := cotejo_factura(f.id);
    if v_cotejo not in ('cuadra', 'sin_orden') and not f.revisada then
      raise exception 'La factura % no cuadra con su orden: márcala como revisada antes de pagarla', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid);
    end if;
    v_suma := v_suma + a.monto;
  end loop;
  if abs(v_suma - p_monto) > 0.005 then raise exception 'Lo aplicado (%) no suma el monto del pago (%)', v_suma, p_monto; end if;

  insert into pagos (proveedor_id, fecha, monto, forma, cuenta_origen, referencia, comprobante_ruta)
  values (p_proveedor, p_fecha, round(p_monto, 2), p_forma::forma_pago, nullif(trim(p_cuenta), ''), nullif(trim(p_referencia), ''), nullif(p_comprobante, ''))
  returning id into v_id;
  insert into pago_aplicaciones (pago_id, factura_id, monto)
  select v_id, x.factura_id, round(x.monto, 2) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric);
  perform actualizar_estado_factura(x.factura_id) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric);
  return v_id;
end $$;

create or replace function anular_pago(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la anulación'; end if;
  update pagos set anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = trim(p_motivo) where id = p_id and anulado_en is null;
  if not found then raise exception 'El pago no existe o ya estaba anulado'; end if;
  perform actualizar_estado_factura(a.factura_id) from pago_aplicaciones a where a.pago_id = p_id;
end $$;

create or replace function programar_pago(p_factura uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  update facturas set pago_programado_el = p_fecha where id = p_factura and tipo = 'ingreso' and estado in ('por_pagar', 'parcial');
  if not found then raise exception 'Solo se programa una factura por pagar'; end if;
end $$;

-- Una factura con pagos vigentes no se cancela.
create or replace function cancelar_factura(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la cancelación'; end if;
  if pagado_factura(p_id) > 0 then raise exception 'La factura tiene pagos: anúlalos antes de cancelarla'; end if;
  update facturas set estado = 'cancelada', motivo_cancelacion = trim(p_motivo), cancelada_por = auth.uid(), cancelada_en = now()
   where id = p_id and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o ya estaba cancelada'; end if;
  delete from factura_ordenes where factura_id = p_id;
end $$;

-- ─── Complementos de pago ───────────────────────────────────────────────────
-- p_complemento: el objeto de leerComplementoPago (lib/compras/cfdi.ts).
create or replace function registrar_complemento(p_complemento jsonb, p_xml text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e empresa; v_id uuid; v_previo complementos_pago;
begin
  perform exigir_admin_compras();
  select * into e from empresa;
  if not found then raise exception 'Configura primero el RFC de la empresa.'; end if;
  if upper(p_complemento->>'rfc_receptor') <> e.rfc then
    raise exception 'El complemento es para el RFC %, no para % (%).', p_complemento->>'rfc_receptor', e.razon_social, e.rfc;
  end if;
  select * into v_previo from complementos_pago where uuid = upper(p_complemento->>'uuid');
  if found then raise exception 'Este complemento ya se registró el %.', to_char(v_previo.creado_en at time zone 'America/Mexico_City', 'DD/MM/YYYY'); end if;
  insert into complementos_pago (uuid, fecha, rfc_emisor, nombre_emisor, proveedor_id, monto, xml_ruta)
  values (upper(p_complemento->>'uuid'), (p_complemento->>'fecha')::date, upper(p_complemento->>'rfc_emisor'), coalesce(p_complemento->>'nombre_emisor', ''),
          (select id from proveedores where rfc = upper(p_complemento->>'rfc_emisor')), coalesce((p_complemento->>'monto')::numeric, 0), p_xml)
  returning id into v_id;
  insert into complemento_facturas (complemento_id, factura_uuid, monto_pagado, parcialidad)
  select v_id, upper(d.uuid), coalesce(d.monto_pagado, 0), d.parcialidad
    from jsonb_to_recordset(coalesce(p_complemento->'documentos', '[]'::jsonb)) d(uuid text, monto_pagado numeric, parcialidad integer);
  return v_id;
end $$;
