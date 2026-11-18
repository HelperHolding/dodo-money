-- Ventas BI (docs/superpowers/specs/2026-11-18-ventas-bi-design.md): metas de venta mensuales por sucursal y
-- funciones que devuelven el tablero ya agregado. Solo admin y corporativo. Se corre antes de publicar la pantalla.

create table public.ventas_metas (
  sucursal_id uuid not null references public.sucursales(id),
  mes date not null check (mes = date_trunc('month', mes)::date),
  monto numeric(14,2) not null check (monto >= 0 and monto < 1e12),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid default auth.uid(),
  primary key (sucursal_id, mes)
);
alter table public.ventas_metas enable row level security;
create policy ver_metas_venta on public.ventas_metas for select using (public.ve_todas_las_sucursales());
create policy admin_metas_venta on public.ventas_metas for all using (public.mi_rol() = 'admin') with check (public.mi_rol() = 'admin');
grant select, insert, update, delete on public.ventas_metas to authenticated;

-- Sucursales que pasan los filtros de sucursal, razón social y antigüedad (meses desde su primer día con ventas).
create or replace function public.ventas_bi_sucursales(p jsonb, p_hasta date) returns setof uuid
language sql stable security invoker set search_path = public as $$
  select s.id from sucursales s
  where ((case when jsonb_typeof(p->'sucursales') = 'array' then jsonb_array_length(p->'sucursales') else 0 end) = 0 or s.id::text in (select jsonb_array_elements_text(p->'sucursales')))
    and (nullif(p->>'rfc', '') is null or exists (select 1 from razon_social_sucursales r where r.sucursal_id = s.id and r.rfc = p->>'rfc'))
    and (p->>'edad_min' is null or exists (
      select 1 from ventas_dia v where v.sucursal_id = s.id
      having min(v.fecha) <= p_hasta - make_interval(months => (p->>'edad_min')::int)
         and (p->>'edad_max' is null or min(v.fecha) > p_hasta - make_interval(months => (p->>'edad_max')::int))));
$$;

create or replace function public.ventas_bi(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_desde date := (p->>'desde')::date;
  v_hasta date := (p->>'hasta')::date;
  v_canal text := nullif(p->>'canal', '');
  v_origenes text[] := case when (case when jsonb_typeof(p->'origenes') = 'array' then jsonb_array_length(p->'origenes') else 0 end) > 0 then array(select jsonb_array_elements_text(p->'origenes')) end;
  v_tipos text[] := case when (case when jsonb_typeof(p->'tipos') = 'array' then jsonb_array_length(p->'tipos') else 0 end) > 0 then array(select jsonb_array_elements_text(p->'tipos')) end;
  v_pagos text[] := case when (case when jsonb_typeof(p->'pagos') = 'array' then jsonb_array_length(p->'pagos') else 0 end) > 0 then array(select jsonb_array_elements_text(p->'pagos')) end;
  v_cats text[] := case when (case when jsonb_typeof(p->'categorias') = 'array' then jsonb_array_length(p->'categorias') else 0 end) > 0 then array(select jsonb_array_elements_text(p->'categorias')) end;
  v_dias int[] := case when (case when jsonb_typeof(p->'dias') = 'array' then jsonb_array_length(p->'dias') else 0 end) > 0 then array(select jsonb_array_elements_text(p->'dias')::int) end;
  v_h1 int := coalesce((p->>'hora_desde')::int, 0);
  v_h2 int := coalesce((p->>'hora_hasta')::int, 23);
  v_prod text := nullif(trim(p->>'producto'), '');
  v_linea boolean;
  r jsonb;
begin
  if not coalesce(public.ve_todas_las_sucursales(), false) then
    raise exception 'Solo admin y corporativo ven Ventas BI' using errcode = '42501';
  end if;
  if v_desde is null or v_hasta is null or v_hasta < v_desde or v_hasta - v_desde > 1100 then
    raise exception 'Rango de fechas inválido' using errcode = '22023';
  end if;
  v_linea := v_cats is not null or v_prod is not null;

  with suc as (select public.ventas_bi_sucursales(p, v_hasta) as id),
  -- Pedidos de Dodo IS que cuentan. Los de agregador son Rappi capturado en Dodo IS (como en Ventas): van al canal Rappi.
  dodo as (
    select pe.*, pe.agregador is not null as es_rappi
    from pedidos pe join suc on suc.id = pe.sucursal_id
    where pe.fecha between v_desde and v_hasta and pe.estado = 'entregado' and pe.tipo <> 'personal'
  ),
  -- fuente: de qué tablas salen las líneas (dodo → pedido_productos, portal → rappi_lineas); canal: POS o Rappi.
  ped as (
    select 'dodo'::text as fuente, case when d.es_rappi then 'rappi' else 'pos' end as canal, d.dodo_id::text as id, d.sucursal_id, d.fecha,
      extract(hour from d.hora)::int as hora,
      case when d.es_rappi then 'rappi' else d.origen end as origen,
      case when d.es_rappi or d.tipo = 'entrega' then 'entrega' when d.para_llevar then 'para_llevar' else 'en_tienda' end as tipo,
      case when d.es_rappi then 'rappi' else d.pago end as pago, round(d.total - d.iva, 2) as neto, d.productos as piezas
    from dodo d
    union all
    -- Órdenes del portal: no las armadas desde Dodo IS (esDeDodo) ni las de un día de sucursal que Dodo IS ya trae con agregador.
    select 'portal', 'rappi', ro.rappi_id, ro.sucursal_id, ro.fecha, extract(hour from ro.hora)::int, 'rappi', 'entrega', 'rappi',
      round(ro.subtotal_restaurante * 100 / 116, 2), coalesce((select sum(l.cantidad) from rappi_lineas l where l.rappi_id = ro.rappi_id), 0)::int
    from rappi_ordenes ro join suc on suc.id = ro.sucursal_id
    where ro.fecha between v_desde and v_hasta and ro.estado = 'Finalizado' and ro.sumar and ro.archivo <> 'dodo-is' and v_cats is null
      and not exists (select 1 from dodo d where d.es_rappi and d.sucursal_id = ro.sucursal_id and d.fecha = ro.fecha)
  ),
  -- Rappi no tiene origen ni tipo propios: con un tipo elegido queda fuera; con origen, solo si se eligió «rappi».
  ped_f as (
    select * from ped
    where (v_canal is null or canal = v_canal)
      and (v_origenes is null or origen = any(v_origenes)) and (v_tipos is null or (canal <> 'rappi' and tipo = any(v_tipos))) and (v_pagos is null or pago = any(v_pagos))
      and (v_dias is null or extract(isodow from fecha)::int = any(v_dias)) and hora between v_h1 and v_h2
  ),
  lin as (
    select pf.id, pf.fuente, pf.canal, pp.nombre,
      coalesce(pv.categoria::text, case when pp.combo is not null then 'combo' else 'sin_categoria' end) as categoria,
      round(pp.precio * 100 / 116, 2) as neto, 1 as piezas
    from ped_f pf join pedido_productos pp on pf.fuente = 'dodo' and pp.pedido_id = pf.id
    left join productos_venta pv on pv.dodo_id = pp.dodo_id
    union all
    select pf.id, pf.fuente, pf.canal, rl.nombre, 'rappi', round(rl.importe * 100 / 116, 2), rl.cantidad
    from ped_f pf join rappi_lineas rl on pf.fuente = 'portal' and rl.rappi_id = pf.id
  ),
  lin_f as (
    select * from lin where (v_cats is null or categoria = any(v_cats)) and (v_prod is null or nombre ilike '%' || v_prod || '%')
  ),
  pv as (
    select pf.fuente, pf.canal, pf.id, pf.sucursal_id, pf.fecha, pf.hora, pf.origen, pf.tipo, pf.pago,
      case when v_linea then x.neto else pf.neto end as venta, case when v_linea then x.piezas else pf.piezas end as unidades
    from ped_f pf left join (select id, fuente, sum(neto) as neto, sum(piezas) as piezas from lin_f group by id, fuente) x on x.id = pf.id and x.fuente = pf.fuente
    where not v_linea or x.id is not null
  )
  select jsonb_build_object(
    'kpis', (select jsonb_build_object('ventas', coalesce(sum(venta), 0), 'tickets', count(*), 'productos', coalesce(sum(unidades), 0)) from pv),
    'canales', coalesce((select jsonb_agg(jsonb_build_object('canal', canal, 'ventas', v, 'tickets', t) order by v desc) from (select canal, sum(venta) v, count(*) t from pv group by canal) a), '[]'),
    'origenes', coalesce((select jsonb_agg(jsonb_build_object('origen', origen, 'ventas', v, 'tickets', t) order by v desc) from (select origen, sum(venta) v, count(*) t from pv group by origen) a), '[]'),
    'tipos', coalesce((select jsonb_agg(jsonb_build_object('tipo', tipo, 'ventas', v, 'tickets', t) order by v desc) from (select tipo, sum(venta) v, count(*) t from pv group by tipo) a), '[]'),
    'pagos', coalesce((select jsonb_agg(jsonb_build_object('pago', pago, 'ventas', v, 'tickets', t) order by v desc) from (select pago, sum(venta) v, count(*) t from pv group by pago) a), '[]'),
    'pagos_sucursal', coalesce((select jsonb_agg(jsonb_build_object('sucursal_id', sucursal_id, 'pago', pago, 'ventas', v)) from (select sucursal_id, pago, sum(venta) v from pv group by sucursal_id, pago) a), '[]'),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'ventas', v, 'tickets', t) order by dia) from (select extract(isodow from fecha)::int dia, sum(venta) v, count(*) t from pv group by 1) a), '[]'),
    'horas', coalesce((select jsonb_agg(jsonb_build_object('hora', hora, 'ventas', v, 'tickets', t) order by hora) from (select hora, sum(venta) v, count(*) t from pv group by hora) a), '[]'),
    'semanas', coalesce((select jsonb_agg(jsonb_build_object('semana', semana, 'ventas', v, 'tickets', t) order by semana) from (select date_trunc('week', fecha)::date semana, sum(venta) v, count(*) t from pv group by 1) a), '[]'),
    'categorias', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria, 'ventas', v, 'piezas', u) order by v desc) from (select categoria, sum(neto) v, sum(piezas) u from lin_f where fuente = 'dodo' and id in (select id from pv where fuente = 'dodo') group by categoria) a), '[]'),
    'productos', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'canal', canal, 'ventas', v, 'piezas', u, 'pedidos', t) order by v desc) from (
      select nombre, canal, sum(neto) v, sum(piezas) u, count(distinct id) t from lin_f where (fuente, id) in (select fuente, id from pv) group by nombre, canal order by v desc limit 200) a), '[]'),
    'rappi_nombres', coalesce((select jsonb_agg(jsonb_build_object('nombre', nombre, 'ventas', v)) from (select nombre, sum(neto) v from lin_f where fuente = 'portal' and id in (select id from pv where fuente = 'portal') group by nombre) a), '[]')
  ) into r;
  return r;
end $$;

create or replace function public.ventas_bi_historico(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_canal text := nullif(p->>'canal', ''); r jsonb;
begin
  if not coalesce(public.ve_todas_las_sucursales(), false) then
    raise exception 'Solo admin y corporativo ven Ventas BI' using errcode = '42501';
  end if;
  with suc as (select public.ventas_bi_sucursales(p, (now() at time zone 'America/Mexico_City')::date) as id),
  -- Venta diaria sin IVA y su parte de agregador (Rappi capturado en Dodo IS, sin IVA). Un día con agregador > 0 ya trae Rappi.
  vd as (
    select v.sucursal_id, v.fecha, v.total - v.iva as neto, coalesce(a.total, 0) > 0 as cubierto, round(coalesce(a.total, 0) * 100 / 116, 2) as agregador
    from ventas_dia v join suc on suc.id = v.sucursal_id
    left join ventas_dia_desglose a on a.ventas_dia_id = v.id and a.tipo = 'agregador'
  ),
  dia as (
    select fecha, case v_canal when 'pos' then neto - agregador when 'rappi' then agregador else neto end as neto from vd
    union all
    -- Órdenes del portal que Dodo IS no trae: ni las armadas desde Dodo IS ni las de un día que ya tiene agregador.
    select ro.fecha, round(ro.subtotal_restaurante * 100 / 116, 2) from rappi_ordenes ro join suc on suc.id = ro.sucursal_id
    where ro.estado = 'Finalizado' and ro.sumar and ro.archivo <> 'dodo-is' and (v_canal is null or v_canal = 'rappi')
      and not exists (select 1 from vd where vd.cubierto and vd.sucursal_id = ro.sucursal_id and vd.fecha = ro.fecha)
  )
  select jsonb_build_object(
    'semanas', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'semana', s, 'ventas', v) order by a, s) from (
      select extract(isoyear from fecha)::int a, extract(week from fecha)::int s, sum(neto) v from dia group by 1, 2) x), '[]'),
    'meses', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'mes', m, 'ventas', v) order by a, m) from (
      select extract(year from fecha)::int a, extract(month from fecha)::int m, sum(neto) v from dia group by 1, 2) x), '[]')
  ) into r;
  return r;
end $$;

revoke all on function public.ventas_bi(jsonb), public.ventas_bi_historico(jsonb), public.ventas_bi_sucursales(jsonb, date) from public, anon;
grant execute on function public.ventas_bi(jsonb), public.ventas_bi_historico(jsonb), public.ventas_bi_sucursales(jsonb, date) to authenticated;
