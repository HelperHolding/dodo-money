-- Recepciones de insumos desde la API de Dodo IS: una fila por entrega e insumo, con proveedor, número de factura e
-- importes; liga a la orden del mismo proveedor y a la factura por folio. Reemplaza lo importado del Excel por día.
-- Requiere 20261020180000_sincronizacion_dodois.sql.

alter table proveedores add column if not exists dodois_supplier_id text unique;

alter table recepciones_dodo
  add column fuente text not null default 'excel' check (fuente in ('excel', 'api')),
  add column dodo_documento_id text,
  add column dodo_proveedor_id text,
  add column proveedor_id uuid references proveedores(id),
  add column recibido_en timestamp,
  add column factura_texto text,
  add column factura_fecha date,
  add column importe_sin_iva numeric(14,2),
  add column importe_con_iva numeric(14,2),
  add column tasa_iva numeric(5,2),
  add column factura_id uuid references facturas(id),
  add column modificado_dodo timestamp,
  alter column importacion_id drop not null;
alter table recepciones_dodo add constraint recepciones_dodo_origen_completo
  check ((fuente = 'excel' and importacion_id is not null) or (fuente = 'api' and dodo_documento_id is not null and importacion_id is null));
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'recepciones_dodo'::regclass and contype = 'u' loop
    execute format('alter table recepciones_dodo drop constraint %I', c);
  end loop;
end $$;
create unique index recepciones_dodo_excel_dia on recepciones_dodo (sucursal_id, dodo_insumo_id, fecha) where fuente = 'excel';
create unique index recepciones_dodo_api_entrega on recepciones_dodo (dodo_documento_id, dodo_insumo_id) where fuente = 'api';
create index recepciones_dodo_factura on recepciones_dodo (factura_id);
create index recepciones_dodo_proveedor_dodo on recepciones_dodo (dodo_proveedor_id) where proveedor_id is null;

alter table dodois_sincronizaciones add column if not exists tipo text not null default 'ventas' check (tipo in ('ventas', 'recepciones'));

create or replace function folio_normalizado(p text) returns text
language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g'), '^0+(?=.)', ''), '')
$$;

-- Lo recibido de un renglón sin revisar permisos (la usa la base; la sincronización corre sin usuario). Las entregas de
-- Dodo del mismo día se suman antes de restar lo conciliado, para no restarlo dos veces.
create or replace function recibido_renglon_total(p_renglon uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cantidad) from recepciones_dodo where orden_renglon_id = p_renglon), 0)
       + coalesce((select sum(cantidad) from recepciones_app where orden_renglon_id = p_renglon and anulada_en is null), 0)
       - coalesce((select sum(least(c.cantidad, d.cantidad)) from
           (select dodo_sucursal, dodo_insumo, dodo_fecha, sum(cantidad) cantidad from recepciones_app
             where orden_renglon_id = p_renglon and anulada_en is null and conciliada_en is not null group by 1, 2, 3) c
           join (select sucursal_id, dodo_insumo_id, fecha, sum(cantidad) cantidad from recepciones_dodo
                  where orden_renglon_id = p_renglon group by 1, 2, 3) d
             on d.sucursal_id = c.dodo_sucursal and d.dodo_insumo_id = c.dodo_insumo and d.fecha = c.dodo_fecha), 0)
$$;
revoke all on function recibido_renglon_total(uuid) from public, anon, authenticated;

create or replace function recibido_renglon(p_renglon uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.orden_renglones r where r.id = p_renglon and public.puede_consultar_recepcion(r.orden_id))
              then public.recibido_renglon_total(p_renglon) else null end
$$;

-- Liga a la orden: igual que antes, y las filas de la API exigen el mismo proveedor de la orden.
create or replace function ligar_recepciones_dodo() returns void
language plpgsql security definer set search_path = public as $$
declare rec record; v_renglon uuid;
begin
  update public.recepciones_dodo d set orden_renglon_id = c.renglon, clasificacion = 'orden' from
   (select dodo_sucursal, dodo_insumo, dodo_fecha, (array_agg(distinct orden_renglon_id))[1] renglon from public.recepciones_app
     where conciliada_en is not null and anulada_en is null group by dodo_sucursal, dodo_insumo, dodo_fecha having count(distinct orden_renglon_id) = 1) c
   where d.clasificacion = 'pendiente' and d.sucursal_id = c.dodo_sucursal and d.dodo_insumo_id = c.dodo_insumo and d.fecha = c.dodo_fecha
     and (d.fuente = 'excel' or (
       (select count(*) from public.recepciones_dodo x where x.fuente = 'api' and x.sucursal_id = d.sucursal_id and x.dodo_insumo_id = d.dodo_insumo_id and x.fecha = d.fecha) = 1
       and d.proveedor_id = (select o.proveedor_id from public.orden_renglones r join public.ordenes_compra o on o.id = r.orden_id where r.id = c.renglon)));
  for rec in select * from recepciones_dodo where clasificacion = 'pendiente'
      and (fuente = 'excel' or proveedor_id is not null)
      and not exists (select 1 from public.recepciones_app m join public.orden_renglones r on r.id = m.orden_renglon_id
                       join public.ordenes_compra o on o.id = r.orden_id join public.articulos a on a.id = r.articulo_id
                      where m.anulada_en is null and m.fecha = recepciones_dodo.fecha and o.sucursal_id = recepciones_dodo.sucursal_id
                        and a.dodo_insumo_id = recepciones_dodo.dodo_insumo_id)
      order by fecha, id loop
    select r.id into v_renglon
      from orden_renglones r join ordenes_compra o on o.id = r.orden_id join articulos a on a.id = r.articulo_id
     where o.estado = 'confirmada' and o.sucursal_id = rec.sucursal_id and a.dodo_insumo_id = rec.dodo_insumo_id
       and (rec.fuente = 'excel' or o.proveedor_id = rec.proveedor_id)
       and rec.fecha between (o.confirmada_en at time zone 'America/Mexico_City')::date and (o.confirmada_en at time zone 'America/Mexico_City')::date + 7
       and r.cantidad > recibido_renglon_total(r.id)
     order by o.confirmada_en, r.creado_en, r.id
     limit 1;
    if v_renglon is not null then
      update recepciones_dodo set orden_renglon_id = v_renglon, clasificacion = 'orden' where id = rec.id;
    end if;
  end loop;
end $$;

-- Liga a la factura por folio: mismo proveedor, ±15 días, y solo si hay exactamente una.
create or replace function ligar_facturas_recepciones() returns void
language plpgsql security definer set search_path = public as $$
begin
  update recepciones_dodo d set factura_id = m.factura_id
    from (select d2.id, min(f.id::text)::uuid factura_id
            from recepciones_dodo d2
            join facturas f on f.proveedor_id = d2.proveedor_id and f.tipo = 'ingreso' and f.estado <> 'cancelada'
             and folio_normalizado(d2.factura_texto) in (folio_normalizado(coalesce(f.serie, '') || coalesce(f.folio, '')), folio_normalizado(f.folio))
             and f.fecha_emision between coalesce(d2.factura_fecha, d2.fecha) - 15 and coalesce(d2.factura_fecha, d2.fecha) + 15
           where d2.fuente = 'api' and d2.factura_id is null and d2.proveedor_id is not null
           group by d2.id having count(distinct f.id) = 1) m
   where d.id = m.id;
end $$;

create or replace function sincronizar_recepciones_dodo(p_sucursal uuid, p_desde date, p_hasta date, p_renglones jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_varias integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Solo el servidor sincroniza recepciones.'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas inválido.'; end if;
  perform pg_advisory_xact_lock(hashtext('recepciones|' || p_sucursal::text));

  drop table if exists tmp_rec, tmp_excel;
  create temp table tmp_rec on commit drop as
    select * from jsonb_to_recordset(coalesce(p_renglones, '[]')) as x(
      dodo_documento_id text, dodo_insumo_id text, material text, unidad text, fecha date, recibido_en timestamp, cantidad numeric,
      precio numeric, importe_sin_iva numeric, importe_con_iva numeric, tasa_iva numeric, dodo_proveedor_id text, factura_texto text,
      factura_fecha date, modificado_dodo timestamp)
    where x.fecha between p_desde and p_hasta and x.cantidad > 0;
  if not exists (select 1 from tmp_rec)
     and exists (select 1 from recepciones_dodo where fuente = 'api' and sucursal_id = p_sucursal and fecha between p_desde and p_hasta) then
    raise exception 'Dodo IS no trajo recepciones de días que ya tenían; no se borran.';
  end if;

  -- Días que traen recepciones de la API: lo del Excel se reemplaza, guardando su clasificación para pasarla.
  create temp table tmp_excel on commit drop as
    select dodo_insumo_id, fecha, clasificacion, orden_renglon_id from recepciones_dodo
     where fuente = 'excel' and sucursal_id = p_sucursal and fecha in (select distinct fecha from tmp_rec);
  delete from recepciones_dodo where fuente = 'excel' and sucursal_id = p_sucursal and fecha in (select distinct fecha from tmp_rec);

  -- Entregas de la ventana que ya no vienen (borradas en Dodo IS).
  delete from recepciones_dodo d where d.fuente = 'api' and d.sucursal_id = p_sucursal and d.fecha between p_desde and p_hasta
     and not exists (select 1 from tmp_rec t where t.dodo_documento_id = d.dodo_documento_id and t.dodo_insumo_id = d.dodo_insumo_id);

  insert into recepciones_dodo (sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id, fuente, dodo_documento_id,
                                dodo_proveedor_id, proveedor_id, recibido_en, factura_texto, factura_fecha, importe_sin_iva, importe_con_iva, tasa_iva, modificado_dodo)
  select p_sucursal, t.dodo_insumo_id, t.material, t.unidad, t.fecha, t.cantidad, coalesce(t.precio, 0), null, 'api', t.dodo_documento_id,
         t.dodo_proveedor_id, (select p.id from proveedores p where p.dodois_supplier_id = t.dodo_proveedor_id), t.recibido_en, t.factura_texto,
         t.factura_fecha, t.importe_sin_iva, t.importe_con_iva, t.tasa_iva, t.modificado_dodo
    from tmp_rec t
  on conflict (dodo_documento_id, dodo_insumo_id) where fuente = 'api' do update set
    material = excluded.material, unidad = excluded.unidad, fecha = excluded.fecha, cantidad = excluded.cantidad, precio = excluded.precio,
    dodo_proveedor_id = excluded.dodo_proveedor_id, proveedor_id = excluded.proveedor_id, recibido_en = excluded.recibido_en,
    factura_texto = excluded.factura_texto, factura_fecha = excluded.factura_fecha, importe_sin_iva = excluded.importe_sin_iva,
    importe_con_iva = excluded.importe_con_iva, tasa_iva = excluded.tasa_iva, modificado_dodo = excluded.modificado_dodo,
    factura_id = case when recepciones_dodo.factura_texto is distinct from excluded.factura_texto then null else recepciones_dodo.factura_id end;

  -- Clasificación manual del Excel: pasa si ese día hubo una sola entrega de ese insumo; si hubo varias, se avisa.
  update recepciones_dodo d set clasificacion = e.clasificacion, orden_renglon_id = e.orden_renglon_id
    from tmp_excel e
   where d.fuente = 'api' and d.sucursal_id = p_sucursal and d.dodo_insumo_id = e.dodo_insumo_id and d.fecha = e.fecha
     and d.clasificacion = 'pendiente' and e.clasificacion <> 'pendiente'
     and (select count(*) from recepciones_dodo x where x.fuente = 'api' and x.sucursal_id = p_sucursal and x.dodo_insumo_id = e.dodo_insumo_id and x.fecha = e.fecha) = 1;
  select count(*) into v_varias from tmp_excel e
   where e.clasificacion <> 'pendiente'
     and (select count(*) from recepciones_dodo x where x.fuente = 'api' and x.sucursal_id = p_sucursal and x.dodo_insumo_id = e.dodo_insumo_id and x.fecha = e.fecha) > 1;

  perform ligar_facturas_recepciones();
  perform ligar_recepciones_dodo();

  return (select jsonb_build_object(
    'renglones', (select count(*) from tmp_rec),
    'ligadas', count(*) filter (where clasificacion = 'orden'),
    'pendientes', count(*) filter (where clasificacion = 'pendiente'),
    'sin_proveedor', count(*) filter (where proveedor_id is null),
    'con_factura', count(*) filter (where factura_id is not null),
    'varias', v_varias)
    from recepciones_dodo where fuente = 'api' and sucursal_id = p_sucursal and fecha between p_desde and p_hasta);
end $$;

create or replace function ligar_proveedor_dodois(p_proveedor uuid, p_supplier text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_supplier text := upper(nullif(trim(p_supplier), '')); v_n integer;
begin
  perform exigir_admin_compras();
  if v_supplier is null then raise exception 'Falta el proveedor de Dodo IS.'; end if;
  if exists (select 1 from proveedores where id = p_proveedor and dodois_supplier_id is not null and dodois_supplier_id <> v_supplier) then
    raise exception 'Ese proveedor ya tiene ligado otro proveedor de Dodo IS; desligalo primero.';
  end if;
  update proveedores set dodois_supplier_id = v_supplier where id = p_proveedor;
  if not found then raise exception 'Proveedor no encontrado.'; end if;
  update recepciones_dodo set proveedor_id = p_proveedor where dodo_proveedor_id = v_supplier and fuente = 'api';
  get diagnostics v_n = row_count;
  perform ligar_facturas_recepciones();
  perform ligar_recepciones_dodo();
  return v_n;
exception when unique_violation then
  raise exception 'Ese proveedor de Dodo IS ya está ligado a otro proveedor.';
end $$;

-- La importación del Excel ya no toca los días que tienen recepciones de la API.
create or replace function importar_recepciones_dodo(p_archivo text, p_dias jsonb, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_imp uuid; v_ligadas int; v_pendientes int;
begin
  perform exigir_admin_compras();
  insert into importaciones_recepciones (archivo, renglones) values (p_archivo, jsonb_array_length(p_filas)) returning id into v_imp;
  delete from recepciones_dodo r
   using jsonb_to_recordset(p_dias) d(sucursal_id uuid, fecha date)
   where r.fuente = 'excel' and r.sucursal_id = d.sucursal_id and r.fecha = d.fecha
     and not exists (select 1 from recepciones_dodo a where a.fuente = 'api' and a.sucursal_id = d.sucursal_id and a.fecha = d.fecha);
  insert into recepciones_dodo (sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id)
  select f.sucursal_id, upper(f.dodo_insumo_id), f.material, f.unidad, f.fecha, f.cantidad, coalesce(f.precio, 0), v_imp
    from jsonb_to_recordset(p_filas) f(sucursal_id uuid, dodo_insumo_id text, material text, unidad text, fecha date, cantidad numeric, precio numeric)
   where not exists (select 1 from recepciones_dodo a where a.fuente = 'api' and a.sucursal_id = f.sucursal_id and a.fecha = f.fecha);
  perform ligar_recepciones_dodo();
  select count(*) filter (where clasificacion = 'orden'), count(*) filter (where clasificacion = 'pendiente')
    into v_ligadas, v_pendientes
    from recepciones_dodo where importacion_id = v_imp;
  return jsonb_build_object('recepciones', (select count(*) from recepciones_dodo where importacion_id = v_imp), 'ligadas', v_ligadas, 'pendientes', v_pendientes);
end $$;

-- Desligar un proveedor de Dodo IS (ligado por error): sus recepciones vuelven a "sin proveedor" y pierden la factura
-- ligada por folio; las ligas a órdenes se quedan para revisión manual.
create or replace function desligar_proveedor_dodois(p_proveedor uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform exigir_admin_compras();
  if not exists (select 1 from proveedores where id = p_proveedor and dodois_supplier_id is not null) then
    raise exception 'Ese proveedor no está ligado a Dodo IS.';
  end if;
  update proveedores set dodois_supplier_id = null where id = p_proveedor;
  update recepciones_dodo set proveedor_id = null, factura_id = null where fuente = 'api' and proveedor_id = p_proveedor;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- I2: conciliar contra la suma de las entregas de Dodo del día (las libres o ya del mismo renglón), no contra una sola.
create or replace function public.conciliar_recepcion_dodo(p_dodo uuid,p_manual uuid) returns void
language plpgsql security definer set search_path='' as $$
declare d public.recepciones_dodo;m public.recepciones_app; o public.ordenes_compra; insumo text; suma numeric; total_dodo numeric;
begin
 perform public.exigir_admin_compras();
 select * into d from public.recepciones_dodo where id=p_dodo;
 if not found then raise exception 'Recepción de Dodo IS no encontrada.';end if;
 select oc.* into o from public.ordenes_compra oc join public.orden_renglones r on r.orden_id=oc.id join public.recepciones_app a on a.orden_renglon_id=r.id where a.id=p_manual for update of oc;
 select * into d from public.recepciones_dodo where id=p_dodo for update;
 select * into m from public.recepciones_app where id=p_manual for update;
 if o.id is null or m.anulada_en is not null then raise exception 'Recepción manual no disponible.';end if;
 select a.dodo_insumo_id into insumo from public.orden_renglones r join public.articulos a on a.id=r.articulo_id where r.id=m.orden_renglon_id;
 if o.sucursal_id is distinct from d.sucursal_id or m.fecha<>d.fecha or (insumo is not null and insumo is distinct from d.dodo_insumo_id) then raise exception 'Deben coincidir sucursal, insumo y fecha real.';end if;
 if d.orden_renglon_id is not null and d.orden_renglon_id<>m.orden_renglon_id then raise exception 'Dodo IS ya está ligado a otro renglón.';end if;
 if exists(select 1 from public.recepciones_app where dodo_sucursal=d.sucursal_id and dodo_insumo=d.dodo_insumo_id and dodo_fecha=d.fecha and anulada_en is null and orden_renglon_id<>m.orden_renglon_id) then raise exception 'El reporte diario ya se concilió con otra orden.';end if;
 select coalesce(sum(cantidad),0) into suma from public.recepciones_app where dodo_sucursal=d.sucursal_id and dodo_insumo=d.dodo_insumo_id and dodo_fecha=d.fecha and anulada_en is null and id<>m.id;
 select coalesce(sum(cantidad),0) into total_dodo from public.recepciones_dodo where sucursal_id=d.sucursal_id and dodo_insumo_id=d.dodo_insumo_id and fecha=d.fecha and (orden_renglon_id is null or orden_renglon_id=m.orden_renglon_id);
 if suma+m.cantidad>total_dodo then raise exception 'La cantidad importada no cubre las recepciones manuales elegidas.';end if;
 update public.recepciones_app set dodo_sucursal=d.sucursal_id,dodo_insumo=d.dodo_insumo_id,dodo_fecha=d.fecha,conciliada_por=auth.uid(),conciliada_en=now() where id=m.id;
 perform public.clasificar_recepcion(d.id,'orden',m.orden_renglon_id);
 insert into public.orden_historial(orden_id,evento,nota) values(o.id,'recepción conciliada','Dodo IS · '||d.fecha||' · '||m.cantidad);
end $$;

-- I2: con varias entregas el mismo día, la conciliación solo protege la entrega ligada al renglón conciliado.
create or replace function clasificar_recepcion(p_id uuid, p_clasificacion text, p_renglon uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rec recepciones_dodo; v_suc uuid; v_estado estado_orden; v_insumo text;
begin
  perform exigir_admin_compras();
  select * into rec from recepciones_dodo where id = p_id for update;
  if not found then raise exception 'Recepción no encontrada'; end if;
  if exists(select 1 from public.recepciones_app m where m.anulada_en is null and m.dodo_sucursal=rec.sucursal_id and m.dodo_insumo=rec.dodo_insumo_id and m.dodo_fecha=rec.fecha
              and (p_clasificacion<>'orden' or m.orden_renglon_id is distinct from p_renglon)
              and (rec.fuente = 'excel' or rec.orden_renglon_id = m.orden_renglon_id)) then raise exception 'La recepción tiene una conciliación manual; conserva su renglón.';end if;
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

revoke execute on function ligar_facturas_recepciones(), sincronizar_recepciones_dodo(uuid, date, date, jsonb) from public, anon, authenticated;
grant execute on function sincronizar_recepciones_dodo(uuid, date, date, jsonb) to service_role;
revoke execute on function ligar_proveedor_dodois(uuid, text), desligar_proveedor_dodois(uuid) from public, anon;
grant execute on function ligar_proveedor_dodois(uuid, text), desligar_proveedor_dodois(uuid) to authenticated;
