-- Periodo que cubre cada factura: el P&L la reparte por los días de ese periodo (meses completos), no por su fecha de emisión.
-- Cada proveedor tiene su regla (cada recibo cubre N meses: los anteriores a la emisión, desde el de emisión o desde el siguiente).
-- Las facturas que ya existen quedan con su mes de emisión. Requiere 0001–0028.

alter table proveedores
  add column cubre_meses smallint not null default 1 check (cubre_meses between 1 and 12),
  add column cubre_inicio text not null default 'emision' check (cubre_inicio in ('anteriores', 'emision', 'siguiente'));

alter table facturas add column cubre_desde date, add column cubre_hasta date;
update facturas set cubre_desde = date_trunc('month', fecha_emision)::date,
                    cubre_hasta = (date_trunc('month', fecha_emision) + interval '1 month - 1 day')::date;
alter table facturas alter column cubre_desde set not null, alter column cubre_hasta set not null;
alter table facturas add constraint facturas_cubre_meses_completos check (
  cubre_desde <= cubre_hasta and extract(day from cubre_desde) = 1
  and cubre_hasta = (date_trunc('month', cubre_hasta) + interval '1 month - 1 day')::date);
create index facturas_cubre on facturas (cubre_desde, cubre_hasta);

-- La vista se rehace para traer las columnas nuevas.
drop view facturas_saldo;
create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo, neto_factura(f.id) as neto, pagado_factura(f.id) as pagado, falta_complemento(f.id) as falta_complemento
  from facturas f;

-- N meses por la regla: 'anteriores' = los N que terminan el mes anterior a la fecha; 'emision' = desde su mes; 'siguiente' = desde el que sigue.
create or replace function periodo_cubre(p_fecha date, p_meses integer, p_inicio text, out desde date, out hasta date)
language sql immutable set search_path = public as $$
  select d, (d + make_interval(months => p_meses) - interval '1 day')::date
    from (select (date_trunc('month', p_fecha)
                  + case p_inicio when 'anteriores' then make_interval(months => -p_meses)
                                  when 'siguiente' then interval '1 month'
                                  else interval '0' end)::date as d) x
$$;

-- Al dar de alta (XML, gasto sin CFDI): si no trae periodo, la nota de crédito toma el de su factura y lo demás, la regla del proveedor.
create or replace function periodo_cubre_factura() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_desde date; v_hasta date; v_meses integer; v_inicio text;
begin
  if new.cubre_desde is not null and new.cubre_hasta is not null then return new; end if;
  if new.tipo = 'egreso' and new.uuid_relacionado is not null then
    select cubre_desde, cubre_hasta into v_desde, v_hasta from facturas where uuid = new.uuid_relacionado and tipo = 'ingreso';
  end if;
  if v_desde is null then
    select cubre_meses, cubre_inicio into v_meses, v_inicio from proveedores where id = new.proveedor_id;
    select p.desde, p.hasta into v_desde, v_hasta from periodo_cubre(new.fecha_emision, coalesce(v_meses, 1), coalesce(v_inicio, 'emision')) p;
  end if;
  new.cubre_desde := v_desde;
  new.cubre_hasta := v_hasta;
  return new;
end $$;
create trigger facturas_periodo_cubre before insert on facturas for each row execute function periodo_cubre_factura();

-- La factura que llega después de su nota de crédito: la nota toma su periodo (igual que cuenta y sucursal en 0025).
create or replace function notas_siguen_periodo() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.tipo = 'ingreso' and new.uuid is not null then
    update facturas set cubre_desde = new.cubre_desde, cubre_hasta = new.cubre_hasta
     where tipo = 'egreso' and uuid_relacionado = new.uuid and estado <> 'cancelada'
       and (cubre_desde, cubre_hasta) is distinct from (new.cubre_desde, new.cubre_hasta);
  end if;
  return null;
end $$;
create trigger facturas_notas_siguen_periodo after insert on facturas for each row execute function notas_siguen_periodo();

-- Corregir el periodo (meses completos, de 1 a 24); sus notas de crédito vigentes lo siguen.
create or replace function cambiar_periodo_factura(p_factura uuid, p_desde date, p_hasta date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_desde date := date_trunc('month', p_desde)::date;
  v_hasta date := (date_trunc('month', p_hasta) + interval '1 month - 1 day')::date;
  v_uuid text;
begin
  perform exigir_admin_compras();
  if p_desde is null or p_hasta is null then raise exception 'Elige de qué mes a qué mes cubre.'; end if;
  if v_hasta < v_desde then raise exception 'El periodo no puede terminar antes de empezar.'; end if;
  if v_hasta > (v_desde + interval '24 months - 1 day')::date then raise exception 'El periodo es de hasta 24 meses.'; end if;
  update facturas set cubre_desde = v_desde, cubre_hasta = v_hasta where id = p_factura and estado <> 'cancelada' returning uuid into v_uuid;
  if not found then raise exception 'Factura no encontrada o cancelada'; end if;
  if v_uuid is not null then
    update facturas set cubre_desde = v_desde, cubre_hasta = v_hasta
     where tipo = 'egreso' and uuid_relacionado = v_uuid and estado <> 'cancelada';
  end if;
end $$;

-- sustituir_factura_manual (0026) + el CFDI toma el periodo del gasto sin CFDI.
-- El CFDI que llega sustituye al gasto sin CFDI: los pagos pasan al CFDI y el gasto queda cancelado.
-- Devuelve {faltan_cuentas: el gasto tenía varias cuentas o renglones sin cuenta (asignar a mano en el CFDI),
--           sucursal_cambio: el CFDI venía con otra sucursal y se dejó la elegida en el gasto}.
create or replace function sustituir_factura_manual(p_cfdi uuid, p_manual uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c facturas; m facturas; v_cuentas integer; v_cuenta text; v_sin boolean;
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

  -- Las órdenes ligadas al gasto pasan al CFDI (siguen facturadas).
  insert into factura_ordenes (factura_id, orden_id) select p_cfdi, orden_id from factura_ordenes where factura_id = p_manual on conflict do nothing;
  delete from factura_ordenes where factura_id = p_manual;

  -- Manda la sucursal elegida en el gasto: la del CFDI pudo venir de la sucursal por omisión del proveedor.
  update facturas set sucursal_id = m.sucursal_id where id = p_cfdi;
  -- Y el periodo que cubre: el gasto se capturó con el que realmente cubre (la prefactura de la renta de octubre).
  update facturas set cubre_desde = m.cubre_desde, cubre_hasta = m.cubre_hasta where id = p_cfdi;

  -- Cuenta efectiva de cada renglón del gasto (la suya o la de la factura). Si todos tienen la misma, la toma el CFDI;
  -- si hay varias o alguno sin cuenta, se asignan a mano.
  select count(distinct coalesce(fc.cuenta_pl, m.cuenta_pl)), min(coalesce(fc.cuenta_pl, m.cuenta_pl)), bool_or(coalesce(fc.cuenta_pl, m.cuenta_pl) is null)
    into v_cuentas, v_cuenta, v_sin from factura_conceptos fc where fc.factura_id = p_manual;
  if v_cuentas = 0 then v_cuentas := case when m.cuenta_pl is null then 0 else 1 end; v_cuenta := m.cuenta_pl; v_sin := m.cuenta_pl is null; end if;
  if v_cuentas = 1 and not coalesce(v_sin, false) then
    update factura_conceptos set cuenta_pl = v_cuenta where factura_id = p_cfdi and cuenta_pl is null;
    update facturas set cuenta_pl = v_cuenta where id = p_cfdi;
  end if;

  update facturas set estado = 'cancelada', sustituido_por = p_cfdi, cancelada_por = auth.uid(), cancelada_en = now(),
         motivo_cancelacion = 'Sustituido por CFDI ' || coalesce(c.serie || '-', '') || coalesce(c.folio, c.uuid)
   where id = p_manual;
  perform actualizar_estado_factura(p_cfdi);
  return jsonb_build_object('faltan_cuentas', v_cuentas > 1 or coalesce(v_sin, false),
                            'sucursal_cambio', c.sucursal_id is distinct from m.sucursal_id);
end $$;

revoke execute on function periodo_cubre(date, integer, text), cambiar_periodo_factura(uuid, date, date) from public, anon;
grant execute on function periodo_cubre(date, integer, text), cambiar_periodo_factura(uuid, date, date) to authenticated;
