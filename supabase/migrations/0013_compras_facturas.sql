-- Compras, fase 3: facturas de proveedores (XML del CFDI), notas de crédito y cotejo con las órdenes.
-- El admin sube; corporativo consulta; la sucursal no ve facturas. Nada se borra: se cancela con motivo.
-- Al ligar una factura, las órdenes recibidas y facturadas completas se cierran solas. Requiere 0001–0012.

create table empresa (
  id            boolean primary key default true check (id),   -- una sola fila
  rfc           text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  razon_social  text not null check (trim(razon_social) <> '')
);

create type tipo_factura as enum ('ingreso', 'egreso');
create type estado_factura as enum ('por_pagar', 'parcial', 'pagada', 'cancelada');

create table facturas (
  id                  uuid primary key default gen_random_uuid(),
  uuid                text not null unique,
  serie               text,
  folio               text,
  tipo                tipo_factura not null,
  fecha_emision       date not null,
  rfc_emisor          text not null,
  nombre_emisor       text not null,
  regimen_emisor      text not null,
  rfc_receptor        text not null,
  metodo_pago         text check (metodo_pago in ('PUE', 'PPD')),
  forma_pago          text,
  moneda              text not null default 'MXN' check (moneda = 'MXN'),
  subtotal            numeric(14,2) not null,
  descuento           numeric(14,2) not null default 0,
  iva                 numeric(14,2) not null default 0,
  retenciones         numeric(14,2) not null default 0,
  total               numeric(14,2) not null check (total >= 0),
  proveedor_id        uuid not null references proveedores(id),
  sucursal_id         uuid references sucursales(id),          -- a dónde se carga; null = Oficina
  uuid_relacionado    text,                                    -- egreso: la factura que corrige
  vence_el            date not null,
  estado              estado_factura not null default 'por_pagar',
  revisada            boolean not null default false,
  revision_nota       text,
  revisada_por        uuid references perfiles(id),
  revisada_en         timestamptz,
  xml_ruta            text not null,
  pdf_ruta            text,
  motivo_cancelacion  text,
  cancelada_por       uuid references perfiles(id),
  cancelada_en        timestamptz,
  creado_por          uuid references perfiles(id) default auth.uid(),
  creado_en           timestamptz not null default now(),
  check (estado <> 'cancelada' or coalesce(trim(motivo_cancelacion), '') <> ''),
  check (not revisada or coalesce(trim(revision_nota), '') <> '')
);
create index facturas_proveedor on facturas (proveedor_id);
create index facturas_relacionado on facturas (uuid_relacionado);

create table factura_conceptos (
  id              bigserial primary key,
  factura_id      uuid not null references facturas(id),
  descripcion     text not null,
  cantidad        numeric(14,4) not null,
  unidad          text not null,
  valor_unitario  numeric(14,4) not null,
  importe         numeric(14,2) not null
);
create index factura_conceptos_factura on factura_conceptos (factura_id);

create table factura_ordenes (
  factura_id  uuid not null references facturas(id),
  orden_id    uuid not null references ordenes_compra(id),
  primary key (factura_id, orden_id)
);
create index factura_ordenes_orden on factura_ordenes (orden_id);

-- ─── Cálculos ───────────────────────────────────────────────────────────────
-- Saldo: total − notas de crédito vigentes que la corrigen (los pagos se restan en la fase 4). Un egreso no tiene saldo.
create or replace function saldo_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when f.tipo = 'egreso' or f.estado = 'cancelada' then 0
              else greatest(f.total - coalesce((select sum(n.total) from facturas n
                                                  where n.tipo = 'egreso' and n.estado <> 'cancelada' and n.uuid_relacionado = f.uuid), 0), 0)
         end
    from facturas f where f.id = p_id
$$;

create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo from facturas f;

-- Total de una orden con IVA por renglón (como totalesOrden en lib/compras/ordenes.ts).
create or replace function total_orden(p_orden uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(round(cantidad * precio, 2) + round(round(cantidad * precio, 2) * case when tasa_iva = '16' then 0.16 else 0 end, 2)), 0)
    from orden_renglones where orden_id = p_orden
$$;

-- Facturado de una orden: facturas de ingreso vigentes ligadas, netas de sus notas de crédito.
create or replace function facturado_orden(p_orden uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(saldo_factura(f.id)), 0)
    from factura_ordenes fo join facturas f on f.id = fo.factura_id
   where fo.orden_id = p_orden and f.tipo = 'ingreso' and f.estado <> 'cancelada'
$$;

create or replace function recepcion_completa(p_orden uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orden_renglones where orden_id = p_orden)
     and not exists (select 1 from orden_renglones r where r.orden_id = p_orden and recibido_renglon(r.id) < r.cantidad)
$$;

revoke execute on function saldo_factura(uuid), total_orden(uuid), facturado_orden(uuid), recepcion_completa(uuid) from public, anon;
grant execute on function saldo_factura(uuid), total_orden(uuid), facturado_orden(uuid), recepcion_completa(uuid) to authenticated;

-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table empresa            enable row level security;
alter table facturas           enable row level security;
alter table factura_conceptos  enable row level security;
alter table factura_ordenes    enable row level security;

create policy ver_empresa on empresa for select using (ve_compras());
create policy alta_empresa on empresa for insert with check (edita_compras());
create policy editar_empresa on empresa for update using (edita_compras()) with check (edita_compras());
create policy ver_facturas on facturas for select using (ve_compras());
create policy ver_conceptos on factura_conceptos for select using (ve_compras());
create policy ver_factura_ordenes on factura_ordenes for select using (ve_compras());
-- Facturas, conceptos y ligas solo se escriben con las funciones de abajo.

-- ─── Archivos ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas', 'facturas', false, 5242880, array['application/xml', 'text/xml', 'application/pdf'])
on conflict (id) do nothing;

create policy subir_factura on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas' and public.edita_compras());
create policy ver_factura on storage.objects for select to authenticated
  using (bucket_id = 'facturas' and public.ve_compras());
-- Sin update ni delete: un archivo subido no se reemplaza ni se borra.

-- ─── Registrar ──────────────────────────────────────────────────────────────
-- p_cfdi: el objeto que arma leerCfdi (lib/compras/cfdi.ts). p_alta_proveedor: si el RFC no está en la cartera, darlo de alta.
create or replace function registrar_factura(p_cfdi jsonb, p_alta_proveedor boolean, p_xml text, p_pdf text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e empresa; v_prov proveedores; v_id uuid; v_previa facturas; v_fecha date := (p_cfdi->>'fecha')::date;
  v_metodo text := nullif(p_cfdi->>'metodo_pago', '');
begin
  perform exigir_admin_compras();
  select * into e from empresa;
  if not found then raise exception 'Configura primero el RFC de la empresa (Compras → Facturas → Datos de la empresa).'; end if;
  if upper(p_cfdi->>'rfc_receptor') <> e.rfc then
    raise exception 'La factura es para el RFC %, no para % (%).', p_cfdi->>'rfc_receptor', e.razon_social, e.rfc;
  end if;
  select * into v_previa from facturas where uuid = upper(p_cfdi->>'uuid');
  if found then
    raise exception 'Esta factura ya se registró el % (folio %).', to_char(v_previa.creado_en at time zone 'America/Mexico_City', 'DD/MM/YYYY'), coalesce(v_previa.serie || '-', '') || coalesce(v_previa.folio, v_previa.uuid);
  end if;
  if coalesce(p_cfdi->>'moneda', 'MXN') <> 'MXN' then raise exception 'Solo se registran facturas en pesos (MXN).'; end if;

  select * into v_prov from proveedores where rfc = upper(p_cfdi->>'rfc_emisor');
  if not found then
    if not p_alta_proveedor then raise exception 'El proveedor con RFC % no está en la cartera.', p_cfdi->>'rfc_emisor'; end if;
    insert into proveedores (razon_social, rfc, regimen_fiscal)
    values (coalesce(nullif(trim(p_cfdi->>'nombre_emisor'), ''), upper(p_cfdi->>'rfc_emisor')), upper(p_cfdi->>'rfc_emisor'),
            case when p_cfdi->>'regimen_emisor' ~ '^6[0-9]{2}$' then p_cfdi->>'regimen_emisor' else '601' end)
    returning * into v_prov;
  end if;

  insert into facturas (uuid, serie, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, metodo_pago, forma_pago,
                        subtotal, descuento, iva, retenciones, total, proveedor_id, uuid_relacionado, vence_el, xml_ruta, pdf_ruta, estado)
  values (upper(p_cfdi->>'uuid'), nullif(p_cfdi->>'serie', ''), nullif(p_cfdi->>'folio', ''), (p_cfdi->>'tipo')::tipo_factura, v_fecha,
          upper(p_cfdi->>'rfc_emisor'), coalesce(p_cfdi->>'nombre_emisor', ''), coalesce(p_cfdi->>'regimen_emisor', ''), upper(p_cfdi->>'rfc_receptor'),
          v_metodo, nullif(p_cfdi->>'forma_pago', ''),
          (p_cfdi->>'subtotal')::numeric, coalesce((p_cfdi->>'descuento')::numeric, 0), coalesce((p_cfdi->>'iva')::numeric, 0),
          coalesce((p_cfdi->>'retenciones')::numeric, 0), (p_cfdi->>'total')::numeric, v_prov.id, nullif(upper(p_cfdi->>'uuid_relacionado'), ''),
          case when v_metodo = 'PUE' then v_fecha else v_fecha + v_prov.dias_credito end, p_xml, nullif(p_pdf, ''),
          case when p_cfdi->>'tipo' = 'egreso' then 'pagada'::estado_factura else 'por_pagar'::estado_factura end)
  returning id into v_id;

  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe)
  select v_id, c.descripcion, c.cantidad, coalesce(c.unidad, ''), c.valor_unitario, c.importe
    from jsonb_to_recordset(coalesce(p_cfdi->'conceptos', '[]'::jsonb))
         c(descripcion text, cantidad numeric, unidad text, valor_unitario numeric, importe numeric);
  return v_id;
end $$;

-- ─── Ligar a órdenes (y cierre automático) ──────────────────────────────────
create or replace function ligar_factura_ordenes(p_factura uuid, p_ordenes uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare f facturas; v_orden uuid; v_folio text;
begin
  perform exigir_admin_compras();
  select * into f from facturas where id = p_factura for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  if f.estado = 'cancelada' then raise exception 'La factura está cancelada'; end if;
  if f.tipo <> 'ingreso' then raise exception 'Las notas de crédito se ligan a su factura, no a órdenes'; end if;
  if exists (select 1 from ordenes_compra o where o.id = any(coalesce(p_ordenes, '{}'))
              and (o.proveedor_id <> f.proveedor_id or o.estado not in ('confirmada', 'cerrada'))) then
    raise exception 'Solo se ligan órdenes confirmadas o cerradas del mismo proveedor';
  end if;

  delete from factura_ordenes where factura_id = p_factura;
  insert into factura_ordenes (factura_id, orden_id) select p_factura, unnest(coalesce(p_ordenes, '{}'));

  foreach v_orden in array coalesce(p_ordenes, '{}') loop
    if (select estado from ordenes_compra where id = v_orden) = 'confirmada'
       and recepcion_completa(v_orden) and facturado_orden(v_orden) + 1 >= total_orden(v_orden) then
      update ordenes_compra set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_en = now(), motivo = 'Recibida y facturada'
       where id = v_orden returning folio into v_folio;
      insert into orden_historial (orden_id, evento, nota) values (v_orden, 'cerrada', 'Recibida y facturada');
    end if;
  end loop;
  insert into orden_historial (orden_id, evento, nota)
  select unnest(coalesce(p_ordenes, '{}')), 'facturada', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid);
end $$;

create or replace function asignar_destino_factura(p_factura uuid, p_sucursal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  update facturas set sucursal_id = p_sucursal where id = p_factura and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o está cancelada'; end if;
end $$;

create or replace function marcar_factura_revisada(p_id uuid, p_nota text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_nota), '') = '' then raise exception 'Escribe qué revisaste'; end if;
  update facturas set revisada = true, revision_nota = trim(p_nota), revisada_por = auth.uid(), revisada_en = now()
   where id = p_id and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o está cancelada'; end if;
end $$;

create or replace function cambiar_vencimiento(p_id uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if p_fecha is null then raise exception 'Elige la fecha de vencimiento'; end if;
  update facturas set vence_el = p_fecha where id = p_id and estado in ('por_pagar', 'parcial');
  if not found then raise exception 'Solo se cambia el vencimiento de una factura por pagar'; end if;
end $$;

-- No se cancela con pagos (fase 4 agrega esa revisión). Cancelar una factura quita sus ligas a órdenes.
create or replace function cancelar_factura(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la cancelación'; end if;
  update facturas set estado = 'cancelada', motivo_cancelacion = trim(p_motivo), cancelada_por = auth.uid(), cancelada_en = now()
   where id = p_id and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o ya estaba cancelada'; end if;
  delete from factura_ordenes where factura_id = p_id;
end $$;
