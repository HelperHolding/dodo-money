-- El saldo de bóveda parte del último cierre del día contado, igual que "Debe haber en bóveda".
-- Antes, saldos_cajas sumaba toda la historia desde el saldo inicial y nunca tomaba el conteo de los cierres:
-- cada diferencia de bóveda quedaba arrastrada en "Puede salir a corporativo", en el máximo de las
-- recolecciones y en las reservas para pagos (disponibilidad_boveda), aunque el cierre ya la hubiera reconocido.
-- Con cierre: conteo del último cierre + movimientos confirmados después − gastos, pagos y ajustes posteriores
-- (mismos filtros que datos_boveda_cierre). Sin cierres, o en caja chica y cambios, no cambia nada.
begin;
create or replace view public.saldos_cajas with(security_invoker=true) as
select c.id as caja_id,c.sucursal_id,c.tipo,c.nombre,
 case when c.tipo='boveda' and u.cerrado_en is not null then
  u.boveda_contado
  +coalesce((select sum(m.monto) from public.movimientos m where m.caja_destino_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'
    and coalesce(m.confirmado_en,m.creado_en)>u.cerrado_en),0)
  -coalesce((select sum(m.monto) from public.movimientos m where m.caja_origen_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'
    and coalesce(m.confirmado_en,m.creado_en)>u.cerrado_en),0)
  -coalesce((select sum(g.monto) from public.gastos_caja_chica g where g.sucursal_id=c.sucursal_id and g.origen::text='boveda'
    and not g.informativo and g.anulado_en is null and g.creado_en>u.cerrado_en),0)
  -coalesce((select sum(e.importe) from public.pagos_boveda_eventos e where e.sucursal_id=c.sucursal_id and e.creado_en>u.cerrado_en),0)
  -coalesce((select sum(a.importe) from public.ajustes_boveda a where a.sucursal_id=c.sucursal_id and a.creado_en>u.cerrado_en),0)
 else c.saldo_inicial
  +coalesce((select sum(m.monto) from public.movimientos m where m.caja_destino_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
  -coalesce((select sum(m.monto) from public.movimientos m where m.caja_origen_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
  -case when c.tipo in ('caja_chica','boveda') then coalesce((select sum(g.monto) from public.gastos_caja_chica g where g.sucursal_id=c.sucursal_id and g.origen::text=c.tipo::text and not g.informativo and g.anulado_en is null),0) else 0 end
  -case when c.tipo='boveda' then coalesce((select sum(e.importe) from public.pagos_boveda_eventos e where e.sucursal_id=c.sucursal_id),0) else 0 end
  -case when c.tipo='boveda' then coalesce((select sum(a.importe) from public.ajustes_boveda a where a.sucursal_id=c.sucursal_id),0) else 0 end
 end as saldo
from public.cajas c
left join lateral (select cd.cerrado_en,cd.boveda_contado from public.cierres_dia cd
 where cd.sucursal_id=c.sucursal_id and cd.cerrado_en is not null and cd.boveda_contado is not null
 order by cd.fecha desc,cd.cerrado_en desc limit 1) u on c.tipo='boveda'
where c.tipo in ('boveda','caja_chica','cambios');
commit;
