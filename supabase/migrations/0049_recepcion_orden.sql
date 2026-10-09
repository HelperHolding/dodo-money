-- Recepción desde orden con fecha real y conciliación posterior de Dodo IS. Requiere 0048.
begin;
set local lock_timeout='5s';
create table public.recepcion_lotes(id uuid primary key,orden_id uuid not null references public.ordenes_compra(id),fecha date not null,motivo text not null,renglones jsonb not null,usuario_id uuid not null references public.perfiles(id),creado_en timestamptz not null default now());
alter table public.recepcion_lotes enable row level security;
create policy ver_lotes_recepcion on public.recepcion_lotes for select using(public.ve_compras());
revoke all on public.recepcion_lotes from public,anon,authenticated;
grant select on public.recepcion_lotes to authenticated;
alter table public.recepciones_app add column lote_id uuid references public.recepcion_lotes(id),add column nota text,
 add column dodo_sucursal uuid references public.sucursales(id),add column dodo_insumo text,add column dodo_fecha date,
 add column conciliada_por uuid references public.perfiles(id),add column conciliada_en timestamptz;
alter table public.recepciones_app add constraint recepcion_conciliacion_completa check((dodo_sucursal is null and dodo_insumo is null and dodo_fecha is null and conciliada_en is null and conciliada_por is null) or (dodo_sucursal is not null and dodo_insumo is not null and dodo_fecha is not null and conciliada_en is not null and conciliada_por is not null));
create unique index recepcion_lote_renglon on public.recepciones_app(lote_id,orden_renglon_id) where lote_id is not null;
create function public.registrar_recepcion_orden(p_orden uuid,p_fecha date,p_motivo text,p_renglones jsonb,p_lote uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.ordenes_compra;r public.orden_renglones; x jsonb; previo public.recepcion_lotes; q numeric;
begin
 perform public.exigir_admin_compras();
 select * into o from public.ordenes_compra where id=p_orden for update;
 if not found then raise exception 'Orden no encontrada.';end if;
 if p_lote is null or p_fecha is null or p_fecha>(now() at time zone 'America/Mexico_City')::date or p_fecha<'2020-01-01' then raise exception 'Fecha de recepción inválida; no puede ser futura.';end if;
 if coalesce(length(trim(p_motivo)),0) not between 5 and 1000 or jsonb_typeof(p_renglones) is distinct from 'array' or jsonb_array_length(p_renglones) not between 1 and 100 then raise exception 'Agrega cantidades y un motivo específico de recepción.';end if;
 select * into previo from public.recepcion_lotes where id=p_lote;
 if found then
  if previo.orden_id<>p_orden or previo.fecha<>p_fecha or previo.motivo<>trim(p_motivo) or previo.renglones<>p_renglones then raise exception 'La solicitud ya se utilizó con otros datos.';end if;
  return p_lote;
 end if;
 if o.estado<>'confirmada' then raise exception 'Solo se reciben órdenes confirmadas y abiertas.';end if;
 if exists(select 1 from jsonb_array_elements(p_renglones) a group by a->>'id' having count(*)>1) then raise exception 'Hay renglones repetidos.';end if;
 insert into public.recepcion_lotes values(p_lote,p_orden,p_fecha,trim(p_motivo),p_renglones,auth.uid(),now());
 for x in select * from jsonb_array_elements(p_renglones) loop
  select * into r from public.orden_renglones where id=(x->>'id')::uuid and orden_id=p_orden;
  if not found then raise exception 'Renglón ajeno a la orden.';end if;
  if exists(select 1 from public.recepciones_dodo d where d.orden_renglon_id=r.id and d.fecha=p_fecha) then raise exception 'Esta entrega ya tiene una recepción de Dodo IS ligada; revisa la recepción existente.';end if;
  q:=(x->>'cantidad')::numeric;
  if q is null or not(q>0 and q<1e9) or q<>round(q,3) then raise exception 'Cantidad inválida: hasta tres decimales.';end if;
  if q>r.cantidad-public.recibido_renglon(r.id) then raise exception 'La cantidad de % supera lo pendiente.',r.descripcion;end if;
  insert into public.recepciones_app(orden_renglon_id,cantidad,fecha,lote_id,nota) values(r.id,q,p_fecha,p_lote,trim(p_motivo));
 end loop;
 insert into public.orden_historial(orden_id,evento,nota) values(p_orden,'recibido', 'Fecha real '||p_fecha||' · '||trim(p_motivo));
 return p_lote;
end $$;
revoke all on function public.registrar_recepcion_orden(uuid,date,text,jsonb,uuid) from public,anon;
grant execute on function public.registrar_recepcion_orden(uuid,date,text,jsonb,uuid) to authenticated;
create function public.conciliar_recepcion_dodo(p_dodo uuid,p_manual uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.recepciones_dodo;m public.recepciones_app; o public.ordenes_compra; insumo text; suma numeric;
begin
 perform public.exigir_admin_compras();
 select * into d from public.recepciones_dodo where id=p_dodo;
 if not found then raise exception 'Recepción de Dodo IS no encontrada.';end if;
 -- Serializa contra altas de recepción y otras conciliaciones de la orden.
 select oc.* into o from public.ordenes_compra oc join public.orden_renglones r on r.orden_id=oc.id join public.recepciones_app a on a.orden_renglon_id=r.id where a.id=p_manual for update of oc;
 select * into d from public.recepciones_dodo where id=p_dodo for update;
 select * into m from public.recepciones_app where id=p_manual for update;
 if o.id is null or m.anulada_en is not null then raise exception 'Recepción manual no disponible.';end if;
 select a.dodo_insumo_id into insumo from public.orden_renglones r join public.articulos a on a.id=r.articulo_id where r.id=m.orden_renglon_id;
 if o.sucursal_id is distinct from d.sucursal_id or m.fecha<>d.fecha or (insumo is not null and insumo is distinct from d.dodo_insumo_id) then raise exception 'Deben coincidir sucursal, insumo y fecha real.';end if;
 if d.orden_renglon_id is not null and d.orden_renglon_id<>m.orden_renglon_id then raise exception 'Dodo IS ya está ligado a otro renglón.';end if;
 if exists(select 1 from public.recepciones_app where dodo_sucursal=d.sucursal_id and dodo_insumo=d.dodo_insumo_id and dodo_fecha=d.fecha and anulada_en is null and orden_renglon_id<>m.orden_renglon_id) then raise exception 'El reporte diario ya se concilió con otra orden.';end if;
 select coalesce(sum(cantidad),0) into suma from public.recepciones_app where dodo_sucursal=d.sucursal_id and dodo_insumo=d.dodo_insumo_id and dodo_fecha=d.fecha and anulada_en is null and id<>m.id;
 if suma+m.cantidad>d.cantidad then raise exception 'La cantidad importada no cubre las recepciones manuales elegidas.';end if;
 update public.recepciones_app set dodo_sucursal=d.sucursal_id,dodo_insumo=d.dodo_insumo_id,dodo_fecha=d.fecha,conciliada_por=auth.uid(),conciliada_en=now() where id=m.id;
 perform public.clasificar_recepcion(d.id,'orden',m.orden_renglon_id);
 insert into public.orden_historial(orden_id,evento,nota) values(o.id,'recepción conciliada','Dodo IS · '||d.fecha||' · '||m.cantidad);
end $$;
revoke all on function public.conciliar_recepcion_dodo(uuid,uuid) from public,anon;
grant execute on function public.conciliar_recepcion_dodo(uuid,uuid) to authenticated;
create or replace function public.recibido_renglon(p_renglon uuid) returns numeric
language sql stable security definer set search_path='' as $$
 select case when exists(select 1 from public.orden_renglones r where r.id=p_renglon and public.puede_consultar_recepcion(r.orden_id)) then
 coalesce((select sum(cantidad) from public.recepciones_dodo where orden_renglon_id=p_renglon),0)
 +coalesce((select sum(cantidad) from public.recepciones_app where orden_renglon_id=p_renglon and anulada_en is null),0)
 -coalesce((select sum(least(c.cantidad,d.cantidad)) from
 (select dodo_sucursal,dodo_insumo,dodo_fecha,sum(cantidad) cantidad from public.recepciones_app where orden_renglon_id=p_renglon and anulada_en is null and conciliada_en is not null group by dodo_sucursal,dodo_insumo,dodo_fecha) c
 join public.recepciones_dodo d on d.sucursal_id=c.dodo_sucursal and d.dodo_insumo_id=c.dodo_insumo and d.fecha=c.dodo_fecha and d.orden_renglon_id=p_renglon),0)
 else null end
$$;
create or replace function ligar_recepciones_dodo() returns void
language plpgsql security definer set search_path = public as $$
declare rec record; v_renglon uuid;
begin
  -- Natural key survives reimportation (Dodo receipt IDs are replaced).
  update public.recepciones_dodo d set orden_renglon_id=c.renglon,clasificacion='orden' from
   (select dodo_sucursal,dodo_insumo,dodo_fecha,(array_agg(distinct orden_renglon_id))[1] renglon from public.recepciones_app where conciliada_en is not null and anulada_en is null group by dodo_sucursal,dodo_insumo,dodo_fecha having count(distinct orden_renglon_id)=1) c
   where d.clasificacion='pendiente' and d.sucursal_id=c.dodo_sucursal and d.dodo_insumo_id=c.dodo_insumo and d.fecha=c.dodo_fecha;
  for rec in select * from recepciones_dodo where clasificacion = 'pendiente' and not exists(select 1 from public.recepciones_app m join public.orden_renglones r on r.id=m.orden_renglon_id join public.ordenes_compra o on o.id=r.orden_id join public.articulos a on a.id=r.articulo_id where m.anulada_en is null and m.fecha=recepciones_dodo.fecha and o.sucursal_id=recepciones_dodo.sucursal_id and a.dodo_insumo_id=recepciones_dodo.dodo_insumo_id) order by fecha, id loop
    select r.id into v_renglon
      from orden_renglones r
      join ordenes_compra o on o.id = r.orden_id
      join articulos a on a.id = r.articulo_id
     where o.estado = 'confirmada' and o.sucursal_id = rec.sucursal_id and a.dodo_insumo_id = rec.dodo_insumo_id
       and rec.fecha between (o.confirmada_en at time zone 'America/Mexico_City')::date
                         and (o.confirmada_en at time zone 'America/Mexico_City')::date + 7
       and r.cantidad > recibido_renglon(r.id)
     order by o.confirmada_en, r.creado_en, r.id
     limit 1;
    if v_renglon is not null then
      update recepciones_dodo set orden_renglon_id = v_renglon, clasificacion = 'orden' where id = rec.id;
    end if;
  end loop;
end $$;
create or replace function clasificar_recepcion(p_id uuid, p_clasificacion text, p_renglon uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rec recepciones_dodo; v_suc uuid; v_estado estado_orden; v_insumo text;
begin
  perform exigir_admin_compras();
  select * into rec from recepciones_dodo where id = p_id for update;
  if not found then raise exception 'Recepción no encontrada'; end if;
  if exists(select 1 from public.recepciones_app m where m.anulada_en is null and m.dodo_sucursal=rec.sucursal_id and m.dodo_insumo=rec.dodo_insumo_id and m.dodo_fecha=rec.fecha and (p_clasificacion<>'orden' or m.orden_renglon_id is distinct from p_renglon)) then raise exception 'La recepción tiene una conciliación manual; conserva su renglón.';end if;
  if p_clasificacion = 'orden' then
    if exists(select 1 from public.recepciones_app m join public.orden_renglones r on r.id=m.orden_renglon_id join public.ordenes_compra o on o.id=r.orden_id join public.articulos a on a.id=r.articulo_id where m.anulada_en is null and m.fecha=rec.fecha and o.sucursal_id=rec.sucursal_id and (a.dodo_insumo_id=rec.dodo_insumo_id or r.id=p_renglon)) and not exists(select 1 from public.recepciones_app m where m.anulada_en is null and m.dodo_sucursal=rec.sucursal_id and m.dodo_insumo=rec.dodo_insumo_id and m.dodo_fecha=rec.fecha and m.orden_renglon_id=p_renglon) then raise exception 'Usa Conciliar con recepción manual para evitar duplicados.';end if;
    select o.sucursal_id, o.estado, a.dodo_insumo_id into v_suc, v_estado, v_insumo
      from orden_renglones r join ordenes_compra o on o.id = r.orden_id join articulos a on a.id = r.articulo_id
     where r.id = p_renglon;
    if not found then raise exception 'Elige el renglón de una orden'; end if;
    if v_estado not in ('confirmada', 'cerrada') then raise exception 'La orden no está confirmada'; end if;
    if v_suc is distinct from rec.sucursal_id then raise exception 'La orden es de otra sucursal'; end if;
    if v_insumo is not null and v_insumo <> rec.dodo_insumo_id then raise exception 'El artículo de ese renglón es otro insumo de Dodo IS'; end if;
    update recepciones_dodo set orden_renglon_id = p_renglon, clasificacion = 'orden' where id = p_id;
  elsif p_clasificacion in ('sin_orden', 'traspaso', 'pendiente') then
    update recepciones_dodo set orden_renglon_id = null, clasificacion = p_clasificacion where id = p_id;
  else
    raise exception 'Clasificación no válida';
  end if;
end $$;
commit;
