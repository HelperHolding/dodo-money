begin;
alter table public.facturas add column recepcion_programada_el date,
 add column pago_programado_forma public.forma_pago;
-- Añadir al final evita cambiar la posición de columnas usadas por otras vistas.
do $$ declare definicion text; begin
 definicion:=pg_get_viewdef('public.facturas_saldo'::regclass,true);
 definicion:=regexp_replace(definicion,';\s*$','');
 execute 'create or replace view public.facturas_saldo with(security_invoker=true) as select v.*, f.recepcion_programada_el, f.pago_programado_forma from ('||definicion||') v join public.facturas f on f.id=v.id';
end $$;

create table public.factura_programacion_historial (
 id bigint generated always as identity primary key,
 factura_id uuid not null references public.facturas(id),
 tipo text not null check(tipo in ('recepcion','pago')),
 fecha_anterior date,fecha_nueva date,forma_anterior public.forma_pago,forma_nueva public.forma_pago,
 usuario_id uuid not null default auth.uid() references public.perfiles(id),creado_en timestamptz not null default now()
);
alter table public.factura_programacion_historial enable row level security;
create policy ver_programacion_factura on public.factura_programacion_historial for select using(public.ve_compras());
revoke all on public.factura_programacion_historial from public,anon,authenticated;
grant select on public.factura_programacion_historial to authenticated;

create function public.programar_pago_detalle(p_factura uuid,p_fecha date,p_forma text) returns void
language plpgsql security definer set search_path='' as $$
declare f public.facturas; forma public.forma_pago;
begin
 perform public.exigir_admin_compras();
 if p_fecha is not null then
  if coalesce(p_forma,'') not in ('transferencia','efectivo','tarjeta','cheque') then raise exception 'Elige la forma de pago prevista.';end if;
  forma:=p_forma::public.forma_pago;
 end if;
 select * into f from public.facturas where id=p_factura for update;
 perform public.programar_pago(p_factura,p_fecha);
 update public.facturas set pago_programado_forma=forma where id=p_factura;
 insert into public.factura_programacion_historial(factura_id,tipo,fecha_anterior,fecha_nueva,forma_anterior,forma_nueva)
 values(p_factura,'pago',f.pago_programado_el,p_fecha,f.pago_programado_forma,forma);
end $$;
create function public.programar_pagos_detalle(p_facturas uuid[],p_fecha date,p_forma text) returns integer
language plpgsql security definer set search_path='' as $$
declare f record;n integer:=0;
begin
 perform public.exigir_admin_compras();
 if p_fecha is null then raise exception 'Elige el día de pago.';end if;
 for f in select id,pago_programado_forma from public.facturas where id=any(coalesce(p_facturas,'{}'::uuid[])) and tipo='ingreso' and estado in ('por_pagar','parcial') order by id for update loop
  perform public.programar_pago_detalle(f.id,p_fecha,coalesce(nullif(p_forma,''),f.pago_programado_forma::text));n:=n+1;
 end loop;
 if n=0 then raise exception 'Elige al menos una factura por pagar.';end if;
 return n;
end $$;
create function public.programar_recepcion_factura(p_factura uuid,p_fecha date) returns void
language plpgsql security definer set search_path='' as $$
declare f public.facturas;o record;
begin
 perform public.exigir_admin_compras();
 if p_fecha is not null and p_fecha<public.hoy_mx() then raise exception 'No se programa una recepción en una fecha que ya pasó.';end if;
 select * into f from public.facturas where id=p_factura for update;
 if not found or f.tipo<>'ingreso' or f.estado='cancelada' then raise exception 'Elige una factura de compra vigente.';end if;
 update public.facturas set recepcion_programada_el=p_fecha where id=f.id;
 -- La misma entrega esperada se refleja en las órdenes vinculadas aún pendientes.
 for o in select oc.id from public.ordenes_compra oc join public.factura_ordenes fo on fo.orden_id=oc.id
 where fo.factura_id=f.id and oc.estado='confirmada' and not public.recepcion_completa(oc.id) order by oc.id for update of oc loop
  update public.ordenes_compra set entrega_esperada=p_fecha where id=o.id;
  insert into public.orden_historial(orden_id,evento,nota) values(o.id,'entrega','Desde factura: '||coalesce(to_char(p_fecha,'DD/MM/YYYY'),'sin programación'));
 end loop;
 insert into public.factura_programacion_historial(factura_id,tipo,fecha_anterior,fecha_nueva)
 values(f.id,'recepcion',f.recepcion_programada_el,p_fecha);
end $$;
revoke all on function public.programar_pago_detalle(uuid,date,text),public.programar_pagos_detalle(uuid[],date,text),public.programar_recepcion_factura(uuid,date) from public,anon;
grant execute on function public.programar_pago_detalle(uuid,date,text),public.programar_pagos_detalle(uuid[],date,text),public.programar_recepcion_factura(uuid,date) to authenticated;
-- La sustitución conserva la programación de la prefactura si el CFDI aún no tiene una propia.
create function public.conservar_programacion_sustitucion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.sustituido_por is null and new.sustituido_por is not null then
  update public.facturas set
    recepcion_programada_el=coalesce(recepcion_programada_el,old.recepcion_programada_el),
    pago_programado_forma=case when pago_programado_el is null then old.pago_programado_forma else pago_programado_forma end,
    pago_programado_el=coalesce(pago_programado_el,old.pago_programado_el)
  where id=new.sustituido_por;
 end if;
 return new;
end $$;
revoke all on function public.conservar_programacion_sustitucion() from public,anon,authenticated;
create trigger conservar_programacion_sustitucion after update of sustituido_por on public.facturas
 for each row execute function public.conservar_programacion_sustitucion();
commit;
