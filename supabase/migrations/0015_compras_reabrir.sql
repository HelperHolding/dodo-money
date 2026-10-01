-- Compras: reabrir órdenes que se cerraron solas cuando su factura se cancela o se desliga.
-- Solo las cerradas automáticamente ("Recibida y facturada"); las que el admin cerró a mano con su motivo no se tocan.
-- Requiere 0001–0014.

create or replace function reabrir_ordenes_incompletas(p_ordenes uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  with reabiertas as (
    update ordenes_compra o
       set estado = 'confirmada', cerrada_por = null, cerrada_en = null, motivo = null
     where o.id = any(coalesce(p_ordenes, '{}')) and o.estado = 'cerrada' and o.motivo = 'Recibida y facturada'
       and facturado_orden(o.id) + 1 < total_orden(o.id)
    returning o.id
  )
  insert into orden_historial (orden_id, evento, nota)
  select id, 'reabierta', 'Ya no está facturada completa' from reabiertas;
end $$;
revoke execute on function reabrir_ordenes_incompletas(uuid[]) from public, anon, authenticated;

create or replace function ligar_factura_ordenes(p_factura uuid, p_ordenes uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare f facturas; v_grupo uuid[]; v_total numeric; v_facturado numeric; v_previas uuid[];
begin
  perform exigir_admin_compras();
  select * into f from facturas where id = p_factura for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  if f.estado = 'cancelada' then raise exception 'La factura está cancelada'; end if;
  if f.tipo <> 'ingreso' then raise exception 'Las notas de crédito se ligan a su factura, no a órdenes'; end if;
  if exists (select 1 from ordenes_compra o where o.id = any(coalesce(p_ordenes, '{}'))
              and (o.proveedor_id <> f.proveedor_id or o.estado not in ('confirmada', 'cerrada'))) then
    raise exception 'Solo se ligan órdenes confirmadas o cerradas del mismo proveedor';
  end if;

  select array_agg(orden_id) into v_previas from factura_ordenes where factura_id = p_factura;
  delete from factura_ordenes where factura_id = p_factura;
  insert into factura_ordenes (factura_id, orden_id) select p_factura, unnest(coalesce(p_ordenes, '{}'));

  -- Las que se quitaron de esta factura: si se habían cerrado solas y ya no están facturadas completas, se reabren.
  perform reabrir_ordenes_incompletas(array(select unnest(coalesce(v_previas, '{}')) except select unnest(coalesce(p_ordenes, '{}'))));

  -- Cierre automático por grupo: estas órdenes y todas las que comparten alguna factura vigente con ellas.
  -- Se cierran juntas solo si todas están recibidas completas y lo facturado (neto, sin repetir facturas) cubre su total.
  with recursive grupo(orden_id) as (
    select unnest(coalesce(p_ordenes, '{}'))
    union
    select fo2.orden_id
      from grupo g
      join factura_ordenes fo on fo.orden_id = g.orden_id
      join facturas fx on fx.id = fo.factura_id and fx.tipo = 'ingreso' and fx.estado <> 'cancelada'
      join factura_ordenes fo2 on fo2.factura_id = fo.factura_id
  )
  select array_agg(orden_id) into v_grupo from grupo;

  if coalesce(array_length(v_grupo, 1), 0) > 0 and not exists (select 1 from unnest(v_grupo) o(id) where not recepcion_completa(o.id)) then
    select coalesce(sum(total_orden(o.id)), 0) into v_total from unnest(v_grupo) o(id);
    select coalesce(sum(neto_factura(fx.id)), 0) into v_facturado
      from facturas fx
     where fx.tipo = 'ingreso' and fx.estado <> 'cancelada'
       and exists (select 1 from factura_ordenes fo where fo.factura_id = fx.id and fo.orden_id = any(v_grupo));
    if v_facturado + 1 >= v_total then
      with cerradas as (
        update ordenes_compra set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_en = now(), motivo = 'Recibida y facturada'
         where id = any(v_grupo) and estado = 'confirmada'
        returning id
      )
      insert into orden_historial (orden_id, evento, nota) select id, 'cerrada', 'Recibida y facturada' from cerradas;
    end if;
  end if;
  insert into orden_historial (orden_id, evento, nota)
  select unnest(coalesce(p_ordenes, '{}')), 'facturada', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid);
end $$;

-- Igual que en 0014, y al final reabre las órdenes que esta factura había dejado cerradas.
create or replace function cancelar_factura(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_ordenes uuid[];
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la cancelación'; end if;
  if pagado_factura(p_id) > 0 then raise exception 'La factura tiene pagos: anúlalos antes de cancelarla'; end if;
  update facturas set estado = 'cancelada', motivo_cancelacion = trim(p_motivo), cancelada_por = auth.uid(), cancelada_en = now()
   where id = p_id and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o ya estaba cancelada'; end if;
  select array_agg(orden_id) into v_ordenes from factura_ordenes where factura_id = p_id;
  delete from factura_ordenes where factura_id = p_id;
  perform reabrir_ordenes_incompletas(v_ordenes);
end $$;
