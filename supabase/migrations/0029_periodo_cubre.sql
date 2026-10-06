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

revoke execute on function periodo_cubre(date, integer, text), cambiar_periodo_factura(uuid, date, date) from public, anon;
grant execute on function periodo_cubre(date, integer, text), cambiar_periodo_factura(uuid, date, date) to authenticated;
