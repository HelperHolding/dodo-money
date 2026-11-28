begin;
set local lock_timeout='5s';
create temporary table saldos_antes_conciliacion on commit drop as select * from public.saldos_cajas;
create table public.ajustes_conciliacion_caja (
 id uuid primary key default gen_random_uuid(),
 caja_id uuid not null references public.cajas(id),
 clave text not null unique check(length(clave) between 5 and 150),
 importe numeric(12,2) not null check(importe<>0),
 saldo_antes numeric(12,2) not null,
 saldo_despues numeric(12,2) not null,
 motivo text not null check(length(trim(motivo)) between 10 and 2000),
 respaldo jsonb not null,
 registrado_por uuid not null references public.perfiles(id),
 registrado_en timestamptz not null default now(),
 check(saldo_despues=saldo_antes+importe)
);
create index ajustes_conciliacion_por_caja on public.ajustes_conciliacion_caja(caja_id);
alter table public.ajustes_conciliacion_caja enable row level security;
create policy ajustes_conciliacion_consulta on public.ajustes_conciliacion_caja for select to authenticated using (
 exists(select 1 from public.cajas c where c.id=caja_id and (public.ve_todas_las_sucursales() or c.sucursal_id=public.mi_sucursal()))
);
revoke all on public.ajustes_conciliacion_caja from public,anon,authenticated;
grant select on public.ajustes_conciliacion_caja to authenticated;
create function public.conservar_ajuste_conciliacion() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Los ajustes de conciliación conservan su historia; registra un contrajuste documentado.'; end $$;
revoke all on function public.conservar_ajuste_conciliacion() from public,anon,authenticated;
create trigger conservar_ajuste before update or delete on public.ajustes_conciliacion_caja for each row execute function public.conservar_ajuste_conciliacion();
create or replace view public.saldos_cajas with (security_invoker=true) as
select c.id caja_id,c.sucursal_id,c.tipo,c.nombre,
 c.saldo_inicial
 +coalesce((select sum(a.importe) from public.ajustes_conciliacion_caja a where a.caja_id=c.id),0)
 +coalesce((select sum(m.monto) from public.movimientos m where m.caja_destino_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -coalesce((select sum(m.monto) from public.movimientos m where m.caja_origen_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -case when c.tipo in ('caja_chica','boveda') then coalesce((select sum(g.monto) from public.gastos_caja_chica g where g.sucursal_id=c.sucursal_id and g.origen::text=c.tipo::text and not g.informativo),0) else 0 end
 -case when c.tipo='boveda' then coalesce((select sum(e.importe) from public.pagos_boveda_eventos e where e.sucursal_id=c.sucursal_id),0) else 0 end saldo
from public.cajas c where c.tipo in ('boveda','caja_chica','cambios');
do $$ begin
 if exists((select * from public.saldos_cajas except select * from saldos_antes_conciliacion) union all (select * from saldos_antes_conciliacion except select * from public.saldos_cajas)) then
 raise exception 'La migración vacía no debe cambiar ningún saldo';
 end if;
 if has_table_privilege('anon','public.ajustes_conciliacion_caja','SELECT') or has_table_privilege('authenticated','public.ajustes_conciliacion_caja','INSERT') then raise exception 'Permisos inesperados'; end if;
end $$;
commit;
