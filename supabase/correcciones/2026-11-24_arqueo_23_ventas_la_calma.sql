-- Corrección 2 del turno del lunes 23/11 en Zapopan-1 La Calma. Correr completo en el SQL Editor de Supabase.
-- El arqueo de cierre se guardó al día siguiente y tomó $0 de venta en efectivo; Dodo IS marca $4,118.00 ese día.
-- Pasa la venta en efectivo del arqueo de $0 a la de ventas_dia (Dodo IS). No mueve la bóveda.
-- Efecto: la diferencia del turno pasa de +$2,133.20 a −$1,984.80 (faltante por explicar).
-- Repetible: si ya tiene la venta, no hace nada. Si algo no coincide, no guarda nada.
do $aplicar$
declare
 v_s constant uuid:='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e';
 t public.turnos; a public.arqueos; v_venta numeric;
begin
 select * into strict t from public.turnos where sucursal_id=v_s and fecha='2026-11-23';
 select * into strict a from public.arqueos where turno_id=t.id and momento='cierre' and anulado_en is null;
 select efectivo into strict v_venta from public.ventas_dia where sucursal_id=v_s and fecha='2026-11-23';
 if v_venta<>4118.00 then raise exception 'Dodo IS marca $% de efectivo el 23 y no $4,118. Nada se guardó.',v_venta;end if;
 if a.ventas_efectivo=v_venta then raise notice 'El arqueo del 23 ya tenía la venta. Nada cambió.'; return;end if;
 if a.ventas_efectivo<>0 or a.total_contado<>2633.20 then
  raise exception 'El arqueo del 23 no está como se esperaba (venta $%, contado $%). Nada se guardó.',a.ventas_efectivo,a.total_contado;
 end if;
 update public.arqueos set ventas_efectivo=v_venta where id=a.id;
 raise notice 'Arqueo del 23 con venta en efectivo $%',v_venta;
end
$aplicar$;
select 'VENTA ARQUEO 23 OK' as resultado, a.ventas_efectivo, a.total_contado, a.esperado, a.diferencia
  from public.arqueos a join public.turnos t on t.id=a.turno_id
 where t.sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e' and t.fecha='2026-11-23' and a.momento='cierre' and a.anulado_en is null;
