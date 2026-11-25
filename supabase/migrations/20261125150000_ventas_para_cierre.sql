-- HD-10: ventas de Dodo IS del día para quien cierra el día (encargado, gerente, admin) de su propia sucursal.
begin;
set local lock_timeout='5s';
create or replace function public.ventas_para_cierre(p_fecha date)
returns table(efectivo numeric, tarjeta numeric, en_linea numeric, iva numeric, total numeric, pedidos integer, actualizado_en timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(public.mi_rol()::text, '') not in ('encargado', 'gerente', 'admin') then
    raise exception 'Solo quien cierra el día puede ver estas ventas.';
  end if;
  return query
    select v.efectivo, v.tarjeta, v.en_linea, v.iva, v.total, v.pedidos, i.importado_en
      from public.ventas_dia v
      join public.importaciones_ventas i on i.id = v.importacion_id
     where v.sucursal_id = public.mi_sucursal() and v.fecha = p_fecha;
end $$;

revoke all on function public.ventas_para_cierre(date) from public, anon;
grant execute on function public.ventas_para_cierre(date) to authenticated;
commit;
