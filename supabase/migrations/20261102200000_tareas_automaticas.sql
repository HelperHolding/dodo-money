-- Tareas automáticas (fase 2): reglas que crean solas las tareas de pendientes detectables en los datos y las cierran
-- cuando el documento ya se resolvió. Las reglas arrancan apagadas; un admin las prende en /tareas/reglas.
-- generar_tareas_automaticas() es idempotente: n8n la llama a diario por /api/tareas/generar. Requiere 20261102120000_tareas.sql.
begin;
set local lock_timeout = '5s';
create table public.tarea_reglas (
 clave text primary key,
 nombre text not null,
 descripcion text not null,
 activa boolean not null default false,
 asignado_default uuid references public.perfiles(id),
 dias integer not null check(dias between 0 and 365),
 prioridad public.prioridad_tarea not null default 'media',
 actualizada_por uuid references public.perfiles(id),
 actualizada_en timestamptz not null default now(),
 check(not activa or asignado_default is not null)
);
insert into public.tarea_reglas(clave,nombre,descripcion,dias,prioridad) values
 ('factura_sin_revisar','Factura sin revisar','Facturas no canceladas que siguen sin revisar más de N días después de cargarlas. Se cierra al revisarla o cancelarla.',3,'media'),
 ('factura_por_vencer','Factura por vencer sin pago programado','Facturas por pagar (o con abonos) a N días o menos de vencer, o ya vencidas, sin fecha de pago programada. Se cierra al programar el pago o al pagarla.',5,'alta'),
 ('dia_sin_ventas','Día sin ventas','Sucursales con Dodo IS que ya venden y no tienen ventas de alguno de los últimos N días (de ayer hacia atrás; mínimo ayer). Se cierra cuando llega el día.',3,'alta'),
 ('orden_sin_recibir','Orden sin recibir','Órdenes confirmadas sin ninguna recepción N días después de su entrega esperada (o de confirmarse si no tiene fecha). Va al gerente de la sucursal; si es de oficina o no hay gerente, al responsable de la regla. Se cierra al registrar una recepción o al cerrar o cancelar la orden.',3,'media'),
 ('apertura_item_atrasado','Ítem de apertura atrasado','Ítems de apertura que pasaron su fecha fin hace más de N días sin completarse, verificarse ni marcarse «no aplica». Se cierra al terminarlo o al mover la fecha fin.',0,'media');
alter table public.tareas add constraint tareas_regla_existe foreign key(regla) references public.tarea_reglas(clave);
-- Una sola tarea abierta por regla y documento (el día de venta es la pareja sucursal + fecha).
create unique index tareas_regla_documento_abierta on public.tareas(regla,
 coalesce(orden_id,factura_id,apertura_proyecto_id,apertura_item_id,ventas_sucursal_id),coalesce(ventas_fecha,'-infinity'::date))
 where regla is not null and estado not in ('hecho','cancelada');

alter table public.tarea_reglas enable row level security;
create policy ver_tarea_reglas on public.tarea_reglas for select using(coalesce(public.mi_rol()::text='admin',false));
revoke all on public.tarea_reglas from public,anon,authenticated;
grant select on public.tarea_reglas to authenticated;

-- Pendientes que cada regla detecta hoy, ya con documento, sucursal, texto y a quién van. p_todas ignora si la regla está
-- prendida (para la vista previa); el asignado puede venir null si la regla aún no tiene responsable.
create function public.pendientes_tareas_automaticas(p_hoy date,p_todas boolean)
returns table(regla text,orden_id uuid,factura_id uuid,ventas_sucursal_id uuid,ventas_fecha date,apertura_item_id uuid,
 sucursal_id uuid,titulo text,documento_texto text,vence date,prioridad public.prioridad_tarea,asignado uuid)
language sql stable security definer set search_path='' as $$
 with r as (select * from public.tarea_reglas x where x.activa or p_todas)
 select r.clave,null::uuid,f.id,null::uuid,null::date,null::uuid,f.sucursal_id,left(r.nombre||' · '||d.texto,200),left(d.texto,300),null::date,r.prioridad,r.asignado_default
 from r join public.facturas f on r.clave='factura_sin_revisar' cross join lateral public.documento_tarea('factura',f.id) d
 where not f.revisada and f.estado::text<>'cancelada' and (f.creado_en at time zone 'America/Mexico_City')::date<p_hoy-r.dias
 union all
 select r.clave,null,f.id,null,null,null,f.sucursal_id,left(r.nombre||' · '||d.texto,200),left(d.texto,300),f.vence_el,r.prioridad,r.asignado_default
 from r join public.facturas f on r.clave='factura_por_vencer' cross join lateral public.documento_tarea('factura',f.id) d
 where f.tipo::text='ingreso' and f.estado::text in ('por_pagar','parcial') and f.pago_programado_el is null and f.vence_el-p_hoy<=r.dias
 union all
 select r.clave,null,null,s.id,g.dia,null,s.id,left(r.nombre||' · '||s.nombre||' · '||to_char(g.dia,'DD/MM/YYYY'),200),
  left('Venta '||s.nombre||' · '||to_char(g.dia,'DD/MM/YYYY'),300),null,r.prioridad,r.asignado_default
 from r join public.sucursales s on r.clave='dia_sin_ventas' and s.dodois_unit_id is not null
 cross join lateral (select x::date dia from generate_series(p_hoy-greatest(r.dias,1),p_hoy-1,interval '1 day') x) g
 where exists(select 1 from public.ventas_dia v where v.sucursal_id=s.id and v.fecha<g.dia)
  and not exists(select 1 from public.ventas_dia v where v.sucursal_id=s.id and v.fecha=g.dia)
 union all
 select r.clave,o.id,null,null,null,null,o.sucursal_id,left(r.nombre||' · '||d.texto,200),left(d.texto,300),null,r.prioridad,
  coalesce((select p.id from public.perfiles p where p.activo and p.rol::text='gerente' and p.sucursal_id=o.sucursal_id order by p.nombre,p.id limit 1),r.asignado_default)
 from r join public.ordenes_compra o on r.clave='orden_sin_recibir' cross join lateral public.documento_tarea('orden',o.id) d
 where o.estado::text='confirmada' and coalesce(o.entrega_esperada,(o.confirmada_en at time zone 'America/Mexico_City')::date)+r.dias<p_hoy
  and not exists(select 1 from public.orden_renglones x where x.orden_id=o.id and public.recibido_renglon_total(x.id)>0)
 union all
 select r.clave,null,null,null,null,i.id,d.sucursal_id,left(r.nombre||' · '||d.texto,200),left(d.texto,300),i.fin,r.prioridad,r.asignado_default
 from r join public.apertura_items i on r.clave='apertura_item_atrasado' cross join lateral public.documento_tarea('apertura_item',i.id) d
 where i.estado not in ('completado','verificado','no_aplica') and i.fin+r.dias<p_hoy
$$;

-- true si el pendiente de una tarea automática ya se resolvió en su documento (aunque la regla esté apagada).
create function public.tarea_automatica_resuelta(t public.tareas,p_hoy date) returns boolean
language sql stable security definer set search_path='' as $$
 select case t.regla
  when 'factura_sin_revisar' then exists(select 1 from public.facturas f where f.id=t.factura_id and (f.revisada or f.estado::text='cancelada'))
  when 'factura_por_vencer' then exists(select 1 from public.facturas f where f.id=t.factura_id and (f.pago_programado_el is not null or f.estado::text in ('pagada','cancelada')))
  when 'dia_sin_ventas' then exists(select 1 from public.ventas_dia v where v.sucursal_id=t.ventas_sucursal_id and v.fecha=t.ventas_fecha)
  when 'orden_sin_recibir' then exists(select 1 from public.ordenes_compra o where o.id=t.orden_id and (o.estado::text in ('cerrada','cancelada')
   or exists(select 1 from public.orden_renglones x where x.orden_id=o.id and public.recibido_renglon_total(x.id)>0)))
  when 'apertura_item_atrasado' then exists(select 1 from public.apertura_items i where i.id=t.apertura_item_id
   and (i.estado in ('completado','verificado','no_aplica') or i.fin is null or i.fin>=p_hoy))
  else false end
$$;

-- Ya hay tarea de esta regla para este documento: abierta, o cancelada (cancelar una automática la silencia).
create function public.tarea_automatica_existe(p_regla text,p_orden uuid,p_factura uuid,p_ventas_sucursal uuid,p_ventas_fecha date,p_item uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.tareas t where t.regla=p_regla and t.estado::text<>'hecho'
  and t.orden_id is not distinct from p_orden and t.factura_id is not distinct from p_factura
  and t.ventas_sucursal_id is not distinct from p_ventas_sucursal and t.ventas_fecha is not distinct from p_ventas_fecha
  and t.apertura_item_id is not distinct from p_item)
$$;

-- Corre sin usuario (llave de servicio): el historial queda a nombre de «Sistema». Primero cierra lo resuelto, luego
-- crea lo que falta con las reglas prendidas. Devuelve cuántas creó y cerró cada regla.
create function public.generar_tareas_automaticas() returns table(regla text,creadas integer,cerradas integer)
language plpgsql security definer set search_path='' as $$
declare hoy date:=public.hoy_mx();ids uuid[];cerradas_de text[];nuevas_de text[];
begin
 perform pg_advisory_xact_lock(hashtext('public.generar_tareas_automaticas'));
 with x as (
  update public.tareas t set estado='hecho',cerrada_en=now(),actualizada_en=now(),revision=t.revision+1,motivo_cierre='Resuelto automáticamente.'
  where t.origen='automatica' and t.estado not in ('hecho','cancelada') and public.tarea_automatica_resuelta(t,hoy)
  returning t.id,t.regla)
 select coalesce(array_agg(x.id),'{}'),coalesce(array_agg(x.regla),'{}') into ids,cerradas_de from x;
 -- Va después del cambio de estado que anotó el trigger.
 insert into public.tarea_historial(tarea_id,usuario_id,campo,antes,despues) select u,null,'resuelta',null,'Resuelto automáticamente' from unnest(ids) u;
 with y as (
  insert into public.tareas(titulo,prioridad,vence,asignado_a,sucursal_id,origen,regla,orden_id,factura_id,ventas_sucursal_id,ventas_fecha,apertura_item_id,documento_texto)
  select c.titulo,c.prioridad,c.vence,c.asignado,c.sucursal_id,'automatica',c.regla,c.orden_id,c.factura_id,c.ventas_sucursal_id,c.ventas_fecha,c.apertura_item_id,c.documento_texto
  from public.pendientes_tareas_automaticas(hoy,false) c
  where exists(select 1 from public.perfiles p where p.id=c.asignado and p.activo)
   and not public.tarea_automatica_existe(c.regla,c.orden_id,c.factura_id,c.ventas_sucursal_id,c.ventas_fecha,c.apertura_item_id)
  returning tareas.regla)
 select coalesce(array_agg(y.regla),'{}') into nuevas_de from y;
 return query select r.clave,cardinality(array_positions(nuevas_de,r.clave)),cardinality(array_positions(cerradas_de,r.clave))
  from public.tarea_reglas r order by r.clave;
end $$;

-- Para la pantalla de reglas: abiertas de cada regla y cuántas crearía hoy si estuviera prendida.
create function public.resumen_reglas_tareas()
returns table(clave text,abiertas integer,por_crear integer)
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.mi_rol()::text,'')<>'admin' then raise exception 'Solo un admin configura las tareas automáticas.';end if;
 return query select r.clave,
  (select count(*) from public.tareas t where t.regla=r.clave and t.estado not in ('hecho','cancelada'))::integer,
  (select count(*) from public.pendientes_tareas_automaticas(public.hoy_mx(),true) c where c.regla=r.clave
    and not public.tarea_automatica_existe(c.regla,c.orden_id,c.factura_id,c.ventas_sucursal_id,c.ventas_fecha,c.apertura_item_id))::integer
 from public.tarea_reglas r order by r.clave;
end $$;

create function public.actualizar_regla_tarea(p_clave text,p_activa boolean,p_asignado uuid,p_dias integer,p_prioridad text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.mi_rol()::text,'')<>'admin' then raise exception 'Solo un admin configura las tareas automáticas.';end if;
 if not exists(select 1 from public.tarea_reglas where clave=p_clave) then raise exception 'Regla no encontrada.';end if;
 if p_dias is null or p_dias not between 0 and 365 then raise exception 'Los días deben ser un número de 0 a 365.';end if;
 if p_prioridad is null or p_prioridad not in ('alta','media','baja') then raise exception 'Prioridad inválida.';end if;
 if p_asignado is not null and not exists(select 1 from public.perfiles p where p.id=p_asignado and p.activo and p.rol::text='admin') then
  raise exception 'El responsable debe ser un admin activo.';
 end if;
 if coalesce(p_activa,false) and p_asignado is null then raise exception 'Elige al responsable antes de prender la regla.';end if;
 update public.tarea_reglas set activa=coalesce(p_activa,false),asignado_default=p_asignado,dias=p_dias,prioridad=p_prioridad::public.prioridad_tarea,
  actualizada_por=auth.uid(),actualizada_en=now()
 where clave=p_clave;
end $$;

revoke all on function public.pendientes_tareas_automaticas(date,boolean),public.tarea_automatica_resuelta(public.tareas,date),
 public.tarea_automatica_existe(text,uuid,uuid,uuid,date,uuid),public.generar_tareas_automaticas(),
 public.resumen_reglas_tareas(),public.actualizar_regla_tarea(text,boolean,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.resumen_reglas_tareas(),public.actualizar_regla_tarea(text,boolean,uuid,integer,text) to authenticated;
grant execute on function public.generar_tareas_automaticas() to service_role;
commit;
