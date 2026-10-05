-- Gastos unificados en Compras: una factura puede ser sin CFDI (prefactura, recibo); cuenta del P&L por concepto;
-- retenciones por tipo; sucursal por omisión del proveedor; el CFDI que llega sustituye al gasto sin CFDI.
-- "Gastos del mes" deja de usarse (la tabla se conserva). Requiere 0001–0025.

alter table facturas add column origen text not null default 'cfdi' check (origen in ('cfdi', 'manual'));
alter table facturas add column sustituido_por uuid references facturas(id);
alter table facturas add column retencion_iva numeric(14,2) not null default 0;
alter table facturas add column retencion_isr numeric(14,2) not null default 0;
alter table facturas alter column uuid drop not null, alter column xml_ruta drop not null;
alter table facturas add constraint facturas_cfdi_completo check (origen = 'manual' or (uuid is not null and xml_ruta is not null));
alter table facturas add constraint facturas_manual_con_referencia check (origen = 'cfdi' or coalesce(trim(folio), '') <> '');

alter table factura_conceptos add column cuenta_pl text check (cuenta_pl in
  ('repartidores', 'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'otros', 'insumos', 'inversiones'));
alter table proveedores add column sucursal_id uuid references sucursales(id);

-- La vista se rehace para traer las columnas nuevas.
drop view facturas_saldo;
create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo, neto_factura(f.id) as neto, pagado_factura(f.id) as pagado, falta_complemento(f.id) as falta_complemento
  from facturas f;

-- Herencias al dar de alta: la nota de crédito toma cuenta y sucursal de su factura; la cuenta, la del proveedor;
-- un CFDI de ingreso sin destino toma la sucursal por omisión del proveedor (el gasto sin CFDI trae la suya elegida).
create or replace function heredar_cuenta_factura() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_cuenta text; v_sucursal uuid;
begin
  if new.tipo = 'egreso' and new.uuid_relacionado is not null then
    select cuenta_pl, sucursal_id into v_cuenta, v_sucursal from facturas where uuid = new.uuid_relacionado and tipo = 'ingreso';
    if found then
      new.cuenta_pl := coalesce(new.cuenta_pl, v_cuenta);
      new.sucursal_id := coalesce(new.sucursal_id, v_sucursal);
    end if;
  end if;
  if new.cuenta_pl is null then select cuenta_pl into new.cuenta_pl from proveedores where id = new.proveedor_id; end if;
  if new.origen = 'cfdi' and new.tipo = 'ingreso' and new.sucursal_id is null then
    select sucursal_id into new.sucursal_id from proveedores where id = new.proveedor_id;
  end if;
  return new;
end $$;

-- registrar_factura: igual que en 0013, más las retenciones por tipo que ya trae el JSON del XML.
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
                        subtotal, descuento, iva, retenciones, retencion_iva, retencion_isr, total, proveedor_id, uuid_relacionado, vence_el, xml_ruta, pdf_ruta, estado)
  values (upper(p_cfdi->>'uuid'), nullif(p_cfdi->>'serie', ''), nullif(p_cfdi->>'folio', ''), (p_cfdi->>'tipo')::tipo_factura, v_fecha,
          upper(p_cfdi->>'rfc_emisor'), coalesce(p_cfdi->>'nombre_emisor', ''), coalesce(p_cfdi->>'regimen_emisor', ''), upper(p_cfdi->>'rfc_receptor'),
          v_metodo, nullif(p_cfdi->>'forma_pago', ''),
          (p_cfdi->>'subtotal')::numeric, coalesce((p_cfdi->>'descuento')::numeric, 0), coalesce((p_cfdi->>'iva')::numeric, 0),
          coalesce((p_cfdi->>'retenciones')::numeric, 0), coalesce((p_cfdi->>'retencion_iva')::numeric, 0), coalesce((p_cfdi->>'retencion_isr')::numeric, 0),
          (p_cfdi->>'total')::numeric, v_prov.id, nullif(upper(p_cfdi->>'uuid_relacionado'), ''),
          case when v_metodo = 'PUE' then v_fecha else v_fecha + v_prov.dias_credito end, p_xml, nullif(p_pdf, ''),
          case when p_cfdi->>'tipo' = 'egreso' then 'pagada'::estado_factura else 'por_pagar'::estado_factura end)
  returning id into v_id;

  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe)
  select v_id, c.descripcion, c.cantidad, coalesce(c.unidad, ''), c.valor_unitario, c.importe
    from jsonb_to_recordset(coalesce(p_cfdi->'conceptos', '[]'::jsonb))
         c(descripcion text, cantidad numeric, unidad text, valor_unitario numeric, importe numeric);
  return v_id;
end $$;

-- Gasto sin CFDI. p: {proveedor_id, sucursal_id|null, fecha, vence_el|null, folio, adjunto|null,
--   renglones: [{descripcion, importe, cuenta_pl|null}], subtotal, iva, retencion_iva, retencion_isr, total}.
create or replace function registrar_gasto_manual(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare e empresa; v_prov proveedores; v_id uuid; v_fecha date := (p->>'fecha')::date; v_sub numeric; v_total numeric;
begin
  perform exigir_admin_compras();
  select * into e from empresa;
  if not found then raise exception 'Configura primero el RFC de la empresa (Compras → Facturas → Datos de la empresa).'; end if;
  select * into v_prov from proveedores where id = (p->>'proveedor_id')::uuid;
  if not found then raise exception 'Proveedor no encontrado'; end if;
  if coalesce(trim(p->>'folio'), '') = '' then raise exception 'Escribe la referencia (folio de la prefactura o del recibo).'; end if;
  if v_fecha is null or v_fecha > hoy_mx() then raise exception 'La fecha no puede ser futura.'; end if;
  if jsonb_array_length(coalesce(p->'renglones', '[]'::jsonb)) = 0 then raise exception 'Agrega al menos un renglón.'; end if;
  select coalesce(sum(r.importe), 0) into v_sub from jsonb_to_recordset(p->'renglones') r(importe numeric);
  if v_sub <= 0 or abs(v_sub - (p->>'subtotal')::numeric) > 0.005 then raise exception 'El subtotal no cuadra con los renglones.'; end if;
  v_total := round((p->>'subtotal')::numeric + (p->>'iva')::numeric - (p->>'retencion_iva')::numeric - (p->>'retencion_isr')::numeric, 2);
  if abs(v_total - (p->>'total')::numeric) > 0.005 then raise exception 'El total no cuadra con el IVA y las retenciones.'; end if;

  insert into facturas (origen, uuid, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor,
                        subtotal, descuento, iva, retenciones, retencion_iva, retencion_isr, total, proveedor_id, sucursal_id, vence_el, xml_ruta, pdf_ruta, estado)
  values ('manual', null, trim(p->>'folio'), 'ingreso', v_fecha, v_prov.rfc, v_prov.razon_social, v_prov.regimen_fiscal, e.rfc,
          round(v_sub, 2), 0, round((p->>'iva')::numeric, 2),
          round((p->>'retencion_iva')::numeric + (p->>'retencion_isr')::numeric, 2), round((p->>'retencion_iva')::numeric, 2), round((p->>'retencion_isr')::numeric, 2),
          v_total, v_prov.id, nullif(p->>'sucursal_id', '')::uuid,
          coalesce(nullif(p->>'vence_el', '')::date, v_fecha + v_prov.dias_credito), null, nullif(p->>'adjunto', ''), 'por_pagar')
  returning id into v_id;

  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe, cuenta_pl)
  select v_id, trim(r.descripcion), 1, '', round(r.importe, 2), round(r.importe, 2), nullif(r.cuenta_pl, '')
    from jsonb_to_recordset(p->'renglones') r(descripcion text, importe numeric, cuenta_pl text);
  return v_id;
end $$;

-- Cuenta del P&L de cada concepto ("" = la de la factura). p_cuentas: [{id, cuenta}].
create or replace function asignar_cuentas_conceptos(p_factura uuid, p_cuentas jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if not exists (select 1 from facturas where id = p_factura and estado <> 'cancelada') then raise exception 'Factura no encontrada o cancelada'; end if;
  update factura_conceptos c set cuenta_pl = nullif(x.cuenta, '')
    from jsonb_to_recordset(coalesce(p_cuentas, '[]'::jsonb)) x(id bigint, cuenta text)
   where c.id = x.id and c.factura_id = p_factura;
end $$;

-- El CFDI que llega sustituye al gasto sin CFDI: los pagos pasan al CFDI y el gasto queda cancelado.
-- Devuelve true si el gasto tenía varias cuentas (los conceptos del CFDI sin cuenta hay que asignarlos a mano).
create or replace function sustituir_factura_manual(p_cfdi uuid, p_manual uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare c facturas; m facturas; v_cuentas integer; v_cuenta text;
begin
  perform exigir_admin_compras();
  select * into c from facturas where id = p_cfdi for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  select * into m from facturas where id = p_manual for update;
  if not found then raise exception 'Gasto sin CFDI no encontrado'; end if;
  if c.origen <> 'cfdi' or c.tipo <> 'ingreso' or c.estado = 'cancelada' then raise exception 'Solo una factura con CFDI vigente sustituye a un gasto sin CFDI.'; end if;
  if m.origen <> 'manual' then raise exception 'Solo se sustituye un gasto sin CFDI.'; end if;
  if m.estado = 'cancelada' then raise exception 'Ese gasto sin CFDI ya está cancelado o sustituido.'; end if;
  if m.proveedor_id <> c.proveedor_id then raise exception 'El CFDI es de otro proveedor.'; end if;
  if pagado_factura(p_manual) > saldo_factura(p_cfdi) + 0.005 then
    raise exception 'Lo pagado al gasto (%) pasa el saldo del CFDI (%).', pagado_factura(p_manual), saldo_factura(p_cfdi);
  end if;

  -- Si un mismo pago ya estaba aplicado a los dos, se suma en el CFDI.
  update pago_aplicaciones a set monto = a.monto + b.monto
    from pago_aplicaciones b where a.factura_id = p_cfdi and b.factura_id = p_manual and a.pago_id = b.pago_id;
  delete from pago_aplicaciones b
   where b.factura_id = p_manual and exists (select 1 from pago_aplicaciones a where a.factura_id = p_cfdi and a.pago_id = b.pago_id);
  update pago_aplicaciones set factura_id = p_cfdi where factura_id = p_manual;

  update facturas set sucursal_id = coalesce(c.sucursal_id, m.sucursal_id) where id = p_cfdi;
  select count(distinct cuenta_pl), min(cuenta_pl) into v_cuentas, v_cuenta from factura_conceptos where factura_id = p_manual and cuenta_pl is not null;
  if v_cuentas = 1 then update factura_conceptos set cuenta_pl = v_cuenta where factura_id = p_cfdi and cuenta_pl is null; end if;

  update facturas set estado = 'cancelada', sustituido_por = p_cfdi, cancelada_por = auth.uid(), cancelada_en = now(),
         motivo_cancelacion = 'Sustituido por CFDI ' || coalesce(c.serie || '-', '') || coalesce(c.folio, c.uuid)
   where id = p_manual;
  perform actualizar_estado_factura(p_cfdi);
  return v_cuentas > 1;
end $$;

revoke execute on function registrar_gasto_manual(jsonb), asignar_cuentas_conceptos(uuid, jsonb), sustituir_factura_manual(uuid, uuid) from public, anon;
grant execute on function registrar_gasto_manual(jsonb), asignar_cuentas_conceptos(uuid, jsonb), sustituir_factura_manual(uuid, uuid) to authenticated;
