-- Días de pago autorizados a proveedores (por omisión los viernes): programar solo en esos días y, si un pago se
-- registra otro día, pedir el motivo. Requiere 0001–0027.

alter table empresa add column dias_pago smallint[] not null default '{5}'
  check (cardinality(dias_pago) > 0 and dias_pago <@ '{1,2,3,4,5,6,7}'::smallint[]);
alter table pagos add column motivo_fuera_de_dia text;

create or replace function es_dia_de_pago(p_fecha date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from p_fecha)::smallint = any (coalesce((select dias_pago from empresa), '{5}'::smallint[]))
$$;

create or replace function programar_pago(p_factura uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if p_fecha is not null then
    if p_fecha < hoy_mx() then raise exception 'No se programa un pago en una fecha que ya pasó.'; end if;
    if not es_dia_de_pago(p_fecha) then raise exception 'El % no es día de pago autorizado.', to_char(p_fecha, 'DD/MM/YYYY'); end if;
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
  if not es_dia_de_pago(p_fecha) then raise exception 'El % no es día de pago autorizado.', to_char(p_fecha, 'DD/MM/YYYY'); end if;
  update facturas set pago_programado_el = p_fecha
   where id = any (coalesce(p_facturas, '{}')) and tipo = 'ingreso' and estado in ('por_pagar', 'parcial');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Elige al menos una factura por pagar.'; end if;
  return v_n;
end $$;
revoke execute on function programar_pagos(uuid[], date) from public, anon;
grant execute on function programar_pagos(uuid[], date) to authenticated;

-- registrar_pago: igual que en 0014, más el motivo cuando el pago no cae en día autorizado.
drop function registrar_pago(uuid, date, numeric, text, text, text, text, jsonb);
create or replace function registrar_pago(p_proveedor uuid, p_fecha date, p_monto numeric, p_forma text, p_cuenta text, p_referencia text,
                                          p_comprobante text, p_aplicaciones jsonb, p_motivo_fuera_de_dia text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; f facturas; v_suma numeric := 0; v_id uuid; v_cotejo text;
begin
  perform exigir_admin_compras();
  if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto del pago'; end if;
  if p_fecha is null or p_fecha > hoy_mx() then raise exception 'La fecha del pago no puede ser futura'; end if;
  if not es_dia_de_pago(p_fecha) and coalesce(trim(p_motivo_fuera_de_dia), '') = '' then
    raise exception 'El % no es día de pago autorizado: escribe el motivo del pago.', to_char(p_fecha, 'DD/MM/YYYY');
  end if;
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

  insert into pagos (proveedor_id, fecha, monto, forma, cuenta_origen, referencia, comprobante_ruta, motivo_fuera_de_dia)
  values (p_proveedor, p_fecha, round(p_monto, 2), p_forma::forma_pago, nullif(trim(p_cuenta), ''), nullif(trim(p_referencia), ''), nullif(p_comprobante, ''),
          nullif(trim(p_motivo_fuera_de_dia), ''))
  returning id into v_id;
  insert into pago_aplicaciones (pago_id, factura_id, monto)
  select v_id, x.factura_id, round(x.monto, 2) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric);
  perform actualizar_estado_factura(x.factura_id) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric);
  return v_id;
end $$;
