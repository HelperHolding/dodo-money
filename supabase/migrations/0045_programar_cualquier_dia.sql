begin;
-- Los días habituales son recomendaciones; registrar un pago conserva su motivo extraordinario.
create or replace function programar_pago(p_factura uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if p_fecha is not null then
    if p_fecha < hoy_mx() then raise exception 'No se programa un pago en una fecha que ya pasó.'; end if;
  end if;
  update facturas set pago_programado_el = p_fecha where id = p_factura and tipo = 'ingreso' and estado in ('por_pagar', 'parcial');
  if not found then raise exception 'Solo se programa una factura por pagar'; end if;
end $$;

create or replace function programar_pagos(p_facturas uuid[], p_fecha date) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform exigir_admin_compras();
  if p_fecha is null then raise exception 'Elige el día de pago.'; end if;
  if p_fecha < hoy_mx() then raise exception 'No se programa un pago en una fecha que ya pasó.'; end if;
  update facturas set pago_programado_el = p_fecha
   where id = any (coalesce(p_facturas, '{}')) and tipo = 'ingreso' and estado in ('por_pagar', 'parcial');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Elige al menos una factura por pagar.'; end if;
  return v_n;
end $$;
revoke execute on function programar_pagos(uuid[], date) from public, anon;
grant execute on function programar_pagos(uuid[], date) to authenticated;

commit;
