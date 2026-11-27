-- Corrección OPCIONAL del IVA de cierres pasados (HD-10). Correr en el SQL Editor de Supabase, un bloque a la vez.
-- Antes de que el cierre calculara el IVA solo, algunos encargados capturaron la venta total como IVA
-- (ej. La Calma 2026-11-22: iva 26,295.50 con venta_total 26,296.00). El IVA correcto es venta_total*16/116.
-- Efecto: solo cambia la columna iva (venta_neta y ticket_promedio se recalculan solas, son columnas generadas).
-- No hay triggers de update en cierres_dia; no se toca ningún otro campo.

-- ============ BLOQUE 1: REVISIÓN (solo lectura). Corre esto primero. ============
select c.fecha, s.nombre, c.venta_total, c.iva as iva_actual, round(c.venta_total*16/116,2) as iva_correcto
from public.cierres_dia c join public.sucursales s on s.id=c.sucursal_id
where c.iva > c.venta_total*0.2
order by c.fecha;

select count(*) as filas_a_corregir from public.cierres_dia c where c.iva > c.venta_total*0.2;

-- ============ BLOQUE 2: CORRECCIÓN. Pon el conteo del bloque 1 en v_esperado y corre todo junto. ============
begin;
do $$
declare
 v_esperado integer := 0; -- ← pon aquí el conteo del bloque 1
 v_filas integer;
 v_actuales integer;
begin
 if v_esperado = 0 then
  raise exception 'Falta poner el conteo del bloque 1 en v_esperado. Nada se guardó.';
 end if;
 select count(*) into v_actuales from public.cierres_dia where iva > venta_total*0.2;
 if v_actuales <> v_esperado then
  raise exception 'Hay % cierres con IVA mal y esperabas %. Nada se guardó.', v_actuales, v_esperado;
 end if;
 update public.cierres_dia set iva = round(venta_total*16/116,2) where iva > venta_total*0.2;
 get diagnostics v_filas = row_count;
 if v_filas <> v_esperado then
  raise exception 'Se actualizaron % filas y esperabas %. Nada se guardó.', v_filas, v_esperado;
 end if;
 raise notice 'IVA corregido en % cierres.', v_filas;
end
$$;
commit;
