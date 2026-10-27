begin;
-- Efecto de efectivo separado de los gastos y de las ventas del P&L.
create table public.ajustes_boveda (
 id uuid primary key default gen_random_uuid(),
 sucursal_id uuid not null references public.sucursales(id),
 solicitud text not null unique check(length(solicitud) between 5 and 100),
 importe numeric(12,2) not null check(importe<>0),
 saldo_antes numeric(12,2) not null,
 saldo_despues numeric(12,2) not null,
 check(saldo_antes-saldo_despues=importe),
 motivo text not null check(length(trim(motivo)) between 10 and 2000),
 autor_id uuid not null references public.perfiles(id),
 creado_en timestamptz not null default now()
);
comment on column public.ajustes_boveda.importe is 'Positivo disminuye bóveda; negativo revierte o incrementa. No crea gasto ni altera ventas.';
alter table public.ajustes_boveda enable row level security;
revoke all on public.ajustes_boveda from public,anon,authenticated;
grant select on public.ajustes_boveda to authenticated;
create policy consultar_ajustes_boveda on public.ajustes_boveda for select to authenticated
 using(public.ve_todas_las_sucursales() or sucursal_id=public.mi_sucursal());
create index ajustes_boveda_sucursal_fecha on public.ajustes_boveda(sucursal_id,creado_en);
create or replace view public.saldos_cajas with(security_invoker=true) as
select c.id as caja_id,c.sucursal_id,c.tipo,c.nombre,c.saldo_inicial
 +coalesce((select sum(m.monto) from public.movimientos m where m.caja_destino_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -coalesce((select sum(m.monto) from public.movimientos m where m.caja_origen_id=c.id and m.estado='confirmado' and m.tipo<>'cambio_morralla'),0)
 -case when c.tipo in ('caja_chica','boveda') then coalesce((select sum(g.monto) from public.gastos_caja_chica g where g.sucursal_id=c.sucursal_id and g.origen::text=c.tipo::text and not g.informativo and g.anulado_en is null),0) else 0 end
 -case when c.tipo='boveda' then coalesce((select sum(e.importe) from public.pagos_boveda_eventos e where e.sucursal_id=c.sucursal_id),0) else 0 end
 -case when c.tipo='boveda' then coalesce((select sum(a.importe) from public.ajustes_boveda a where a.sucursal_id=c.sucursal_id),0) else 0 end as saldo
from public.cajas c where c.tipo in ('boveda','caja_chica','cambios');

create or replace function public.datos_boveda_cierre(p_sucursal uuid,p_fecha date) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare anterior public.cierres_dia; b public.cajas; desde timestamptz; hasta timestamptz;
 ingresos numeric; fondos numeric; salidas numeric; gastos numeric; pendientes integer; ajustes numeric;
begin
 if auth.uid() is null or not coalesce(public.ve_todas_las_sucursales() or p_sucursal=public.mi_sucursal(),false) then
  raise exception 'Sucursal sin acceso.';
 end if;
 if p_fecha is null then raise exception 'Falta la fecha del cierre.';end if;
 select * into anterior from public.cierres_dia where sucursal_id=p_sucursal and fecha<p_fecha order by fecha desc limit 1;
 select * into b from public.cajas where sucursal_id=p_sucursal and tipo='boveda';
 if b.id is null then raise exception 'Falta la caja de bóveda.';end if;
 -- El instante del conteo evita volver a sumar entradas incluidas en él; incluye
 -- confirmaciones tardías y correcciones registradas después, aunque su fecha sea anterior.
 desde:=anterior.cerrado_en;
 hasta:=least(now(),(p_fecha::timestamp+interval '1 day 4 hours') at time zone 'America/Mexico_City');
 select coalesce(sum(monto) filter(where estado='confirmado' and caja_destino_id=b.id),0),
 coalesce(sum(monto) filter(where estado='confirmado' and caja_origen_id=b.id and tipo<>'salida_corporativo'),0),
 coalesce(sum(monto) filter(where estado='confirmado' and caja_origen_id=b.id and tipo='salida_corporativo'),0),
 0
 into ingresos,fondos,salidas,pendientes from public.movimientos
 where sucursal_id=p_sucursal and tipo<>'cambio_morralla'
 and (caja_origen_id=b.id or caja_destino_id=b.id)
 and (desde is null or coalesce(confirmado_en,creado_en)>desde)
 and coalesce(confirmado_en,creado_en)<=hasta;
 select count(*) into pendientes from public.movimientos
 where sucursal_id=p_sucursal and estado='pendiente'
 and (desde is null or creado_en>desde) and creado_en<=hasta;
 select coalesce(sum(monto),0) into gastos from public.gastos_caja_chica
 where sucursal_id=p_sucursal and origen='boveda' and not informativo and anulado_en is null
 and (desde is null or creado_en>desde) and creado_en<=hasta;
 gastos:=gastos+coalesce((select sum(importe) from public.pagos_boveda_eventos
 where sucursal_id=p_sucursal and (desde is null or creado_en>desde) and creado_en<=hasta),0);
 select coalesce(sum(importe),0) into ajustes from public.ajustes_boveda
 where sucursal_id=p_sucursal and (desde is null or creado_en>desde) and creado_en<=hasta;
 gastos:=gastos+ajustes;
 return jsonb_build_object('bovedaInicial',coalesce(anterior.boveda_contado,b.saldo_inicial),
 'retiros',ingresos,'aperturas',fondos,'depositos',salidas,'gastosBoveda',gastos,
 'ajustesBoveda',ajustes,'pendientes',pendientes,'ultimoCierre',anterior.fecha,'desde',desde,'hasta',hasta);
end $$;

commit;
