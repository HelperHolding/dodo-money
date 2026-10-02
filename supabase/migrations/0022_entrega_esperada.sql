-- Recepciones esperadas: al confirmar una orden se guarda cuándo se espera
-- (día de confirmación en México + días de entrega del proveedor, naturales).
-- Si el proveedor no tiene días de entrega, queda vacía ("sin fecha"). El admin la puede cambiar en cada orden;
-- cambiar después los días del proveedor no mueve las órdenes ya confirmadas.
-- Requiere 0001–0021.

alter table ordenes_compra add column entrega_esperada date;

create or replace function poner_entrega_esperada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.estado = 'confirmada' and old.estado in ('borrador', 'enviada') and new.entrega_esperada is null then
    select hoy_mx() + p.dias_entrega into new.entrega_esperada from proveedores p where p.id = new.proveedor_id;
  end if;
  return new;
end $$;

create trigger ordenes_entrega_esperada
  before update on ordenes_compra
  for each row execute function poner_entrega_esperada();

-- El admin ajusta la fecha (el proveedor dio otro día); queda en el historial.
create or replace function cambiar_entrega_esperada(p_orden uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  if p_fecha is null then raise exception 'Escribe la fecha en que se espera la entrega'; end if;
  select * into o from ordenes_compra where id = p_orden for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado <> 'confirmada' then raise exception 'Solo las órdenes confirmadas y abiertas tienen entrega esperada'; end if;
  update ordenes_compra set entrega_esperada = p_fecha where id = p_orden;
  insert into orden_historial (orden_id, evento, nota) values (p_orden, 'entrega', to_char(p_fecha, 'DD/MM/YYYY'));
end $$;
revoke execute on function cambiar_entrega_esperada(uuid, date) from public, anon;
grant execute on function cambiar_entrega_esperada(uuid, date) to authenticated;

-- Igual que en 0012, más la entrega esperada (cambia lo que devuelve: se vuelve a crear).
drop function ordenes_por_recibir();
create function ordenes_por_recibir()
returns table (orden_id uuid, folio text, proveedor text, confirmada_en timestamptz, renglon_id uuid,
               descripcion text, unidad text, tipo categoria_compra, cantidad numeric, recibido numeric, entrega_esperada date)
language sql stable security definer set search_path = public as $$
  select o.id, o.folio, coalesce(p.nombre_comercial, p.razon_social), o.confirmada_en, r.id,
         r.descripcion, a.unidad, a.tipo, r.cantidad, recibido_renglon(r.id), o.entrega_esperada
    from ordenes_compra o
    join proveedores p on p.id = o.proveedor_id
    join orden_renglones r on r.orden_id = o.id
    join articulos a on a.id = r.articulo_id
   where o.estado = 'confirmada' and a.tipo <> 'consumible'
     and mi_rol()::text in ('encargado', 'gerente', 'admin')
     and (o.sucursal_id = mi_sucursal() or (mi_rol()::text = 'admin' and o.sucursal_id is null))
   order by o.confirmada_en, o.folio, r.creado_en, r.id
$$;
revoke execute on function ordenes_por_recibir() from public, anon;
grant execute on function ordenes_por_recibir() to authenticated;
