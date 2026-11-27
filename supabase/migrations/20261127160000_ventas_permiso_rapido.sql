-- Ventas: el permiso de lectura se calcula una vez por consulta, no una vez por renglón.
-- Antes, cada renglón llamaba ve_ventas(sucursal_id) (security definer: no se integra a la consulta y lee perfiles de
-- nuevo). En lecturas de miles de renglones eso hacía pasar el límite de 8 s («canceling statement due to statement
-- timeout», visto en /ventas y /reporte/pl/excel). Ahora la lista de sucursales visibles se calcula una vez
-- ((select …) = InitPlan) y cada renglón solo compara su sucursal. Mismo resultado que ve_ventas:
--   admin y corporativo ven todas; gerente y admin ven la suya; nadie más.
-- Sin cambios de datos. Requiere 0006, 0007, 0032 y 0034.
begin;
set local lock_timeout='5s';

create or replace function public.sucursales_ventas() returns uuid[]
language sql stable security definer set search_path='' as $$
  select case
    when public.ve_todas_las_sucursales() then coalesce((select array_agg(s.id) from public.sucursales s), '{}'::uuid[])
    when public.mi_rol()::text in ('gerente', 'admin') and public.mi_sucursal() is not null then array[public.mi_sucursal()]
    else '{}'::uuid[]
  end
$$;
revoke all on function public.sucursales_ventas() from public, anon;
grant execute on function public.sucursales_ventas() to authenticated;

drop policy ver_ventas_dia on public.ventas_dia;
create policy ver_ventas_dia on public.ventas_dia for select
  using (sucursal_id = any ((select public.sucursales_ventas())::uuid[]));

drop policy ver_ventas_desglose on public.ventas_dia_desglose;
create policy ver_ventas_desglose on public.ventas_dia_desglose for select
  using (exists (select 1 from public.ventas_dia v where v.id = ventas_dia_id and v.sucursal_id = any ((select public.sucursales_ventas())::uuid[])));

drop policy ver_ventas_producto on public.ventas_producto;
create policy ver_ventas_producto on public.ventas_producto for select
  using (sucursal_id = any ((select public.sucursales_ventas())::uuid[]));

drop policy ver_importaciones on public.importaciones_ventas;
create policy ver_importaciones on public.importaciones_ventas for select
  using (sucursal_id = any ((select public.sucursales_ventas())::uuid[]));

drop policy ver_pedidos on public.pedidos;
create policy ver_pedidos on public.pedidos for select
  using (sucursal_id = any ((select public.sucursales_ventas())::uuid[]));

drop policy ver_pedido_productos on public.pedido_productos;
create policy ver_pedido_productos on public.pedido_productos for select
  using (exists (select 1 from public.pedidos p where p.dodo_id = pedido_id and p.sucursal_id = any ((select public.sucursales_ventas())::uuid[])));

drop policy leer_rappi_ordenes on public.rappi_ordenes;
create policy leer_rappi_ordenes on public.rappi_ordenes for select
  using (sucursal_id = any ((select public.sucursales_ventas())::uuid[]));

drop policy leer_rappi_lineas on public.rappi_lineas;
create policy leer_rappi_lineas on public.rappi_lineas for select
  using (exists (select 1 from public.rappi_ordenes o where o.rappi_id = rappi_lineas.rappi_id and o.sucursal_id = any ((select public.sucursales_ventas())::uuid[])));

drop policy leer_conciliaciones on public.ventas_conciliaciones;
create policy leer_conciliaciones on public.ventas_conciliaciones for select
  using (sucursal_id = any ((select public.sucursales_ventas())::uuid[]));

commit;
