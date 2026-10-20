begin;
set local lock_timeout='5s';
drop policy cerrar_dia on public.cierres_dia;
create policy cerrar_dia on public.cierres_dia for insert to authenticated
with check (
 sucursal_id=public.mi_sucursal() and cerrado_por=auth.uid()
 and public.mi_rol()::text in ('encargado','gerente','admin')
);
-- Conserva la captura única del reporte tardío y el aislamiento por sucursal.
create or replace function public.registrar_corte_rappi(p_cierre uuid,p_monto numeric,p_ruta text) returns void
language plpgsql security definer set search_path=public as $$
declare c public.cierres_dia;
begin
 if not coalesce(public.mi_rol()::text in ('encargado','gerente','admin'),false) then raise exception 'Solo encargado, gerente o administrador registra el corte de Rappi.';end if;
 if p_monto is null or p_monto<0 then raise exception 'Escribe el total del corte de Rappi';end if;
 select * into c from public.cierres_dia where id=p_cierre for update;
 if not found then raise exception 'Cierre no encontrado';end if;
 if c.sucursal_id is distinct from public.mi_sucursal() and public.mi_rol()::text is distinct from 'admin' then raise exception 'El cierre es de otra sucursal';end if;
 if c.rappi_corte is not null then raise exception 'El corte de Rappi de ese día ya está registrado';end if;
 update public.cierres_dia set rappi_corte=p_monto,rappi_corte_ruta=p_ruta where id=p_cierre;
end $$;
revoke all on function public.registrar_corte_rappi(uuid,numeric,text) from public,anon;
grant execute on function public.registrar_corte_rappi(uuid,numeric,text) to authenticated;
commit;
