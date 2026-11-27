-- Diagnóstico (solo lectura): por qué la bóveda de Zapopan-1 La Calma tiene en físico $633.20 más que en la app.
-- Correr completo en el SQL Editor de Supabase. No modifica nada.

with s as (select id from sucursales where nombre ilike 'Zapopan-1%' limit 1),
     b as (select c.id from cajas c, s where c.sucursal_id = s.id and c.tipo = 'boveda')

-- 1) Movimientos que la app todavía no cuenta: la bóveda solo suma los confirmados
select '1 sin confirmar' as revisar, m.creado_en as cuando, m.tipo::text as tipo, m.estado::text as estado,
       case when m.caja_destino_id = b.id then m.monto else -m.monto end as efecto_boveda, m.nota
  from movimientos m, s, b
 where m.sucursal_id = s.id and m.estado = 'pendiente' and (m.caja_destino_id = b.id or m.caja_origen_id = b.id)

union all
-- 2) Turnos de los últimos 10 días sin cerrar o sin arqueo de cierre: su efectivo no ha pasado a la bóveda
select '2 turno sin cierre', t.abierto_en, t.tipo::text, case when t.cerrado_en is null then 'abierto' else 'sin arqueo de cierre' end,
       null, t.fecha::text
  from turnos t, s
 where t.sucursal_id = s.id and t.fecha >= current_date - 10
   and (t.cerrado_en is null or not exists (select 1 from arqueos a where a.turno_id = t.id and a.momento = 'cierre'))

union all
-- 3) Movimientos confirmados de la bóveda en los últimos 10 días, para comparar con lo que pasó en físico
select '3 confirmado', m.creado_en, m.tipo::text, m.estado::text,
       case when m.caja_destino_id = b.id then m.monto else -m.monto end, m.nota
  from movimientos m, s, b
 where m.sucursal_id = s.id and m.estado = 'confirmado' and m.tipo <> 'cambio_morralla'
   and (m.caja_destino_id = b.id or m.caja_origen_id = b.id) and m.creado_en >= now() - interval '10 days'

union all
-- 4) Gastos y pagos que salieron de la bóveda en los últimos 10 días (restan en la app)
select '4 gasto de bóveda', g.creado_en, 'gasto', coalesce(g.concepto, ''), -g.monto, g.proveedor
  from gastos_caja_chica g, s
 where g.sucursal_id = s.id and g.origen = 'boveda' and g.creado_en >= now() - interval '10 days'
union all
select '4 pago de bóveda', e.creado_en, e.tipo, '', -e.importe, e.fecha_operativa::text
  from pagos_boveda_eventos e, s
 where e.sucursal_id = s.id and e.creado_en >= now() - interval '10 days'

union all
-- 5) Últimos cierres del día: bóveda contada contra esperada
select '5 cierre del día', c.fecha::timestamptz, 'cierre', 'contado ' || c.boveda_contado || ' / esperado ' || c.boveda_esperado,
       c.boveda_contado - c.boveda_esperado, null
  from cierres_dia c, s
 where c.sucursal_id = s.id and c.fecha >= current_date - 10

order by 1, 2;
