-- Compras, fase 2: cotización → orden de compra, y su recepción.
-- Un solo documento avanza: borrador → enviada → confirmada (orden de compra) → cerrada; o cancelada.
-- Los cambios de estado van por funciones; los renglones solo cambian mientras la orden es cotización.
-- Recepción: consumibles desde el Incoming supplies de Dodo IS (ligados por ID de insumo);
-- activos fijos, servicios y otros los confirma el gerente o encargado en la app.
-- Nada se borra salvo renglones en cotización y días reimportados del Incoming supplies. Requiere 0001–0011.

create type estado_orden as enum ('borrador', 'enviada', 'confirmada', 'cerrada', 'cancelada');

create sequence ordenes_compra_folio;
grant usage on sequence ordenes_compra_folio to authenticated;

create table ordenes_compra (
  id              uuid primary key default gen_random_uuid(),
  folio           text not null unique default 'OC-' || lpad(nextval('ordenes_compra_folio')::text, 4, '0'),
  proveedor_id    uuid not null references proveedores(id),
  sucursal_id     uuid references sucursales(id),          -- null = Oficina
  estado          estado_orden not null default 'borrador',
  grupo_id        uuid not null default gen_random_uuid(),  -- cotizaciones alternativas comparten grupo
  notas           text,
  motivo          text,                                     -- de cierre o cancelación
  creado_por      uuid references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  confirmada_por  uuid references perfiles(id),
  confirmada_en   timestamptz,
  cerrada_por     uuid references perfiles(id),
  cerrada_en      timestamptz,
  cancelada_por   uuid references perfiles(id),
  cancelada_en    timestamptz
);
create index ordenes_compra_grupo on ordenes_compra (grupo_id);

create table orden_renglones (
  id           uuid primary key default gen_random_uuid(),
  orden_id     uuid not null references ordenes_compra(id),
  articulo_id  uuid not null references articulos(id),
  descripcion  text not null check (trim(descripcion) <> ''),
  cantidad     numeric(12,3) not null check (cantidad > 0),
  precio       numeric(12,2) not null default 0 check (precio >= 0),  -- sin IVA; 0 = aún sin precio
  tasa_iva     text not null check (tasa_iva in ('16', '0', 'exento')),
  creado_en    timestamptz not null default now()
);
create index orden_renglones_orden on orden_renglones (orden_id);

create table orden_historial (
  id        bigserial primary key,
  orden_id  uuid not null references ordenes_compra(id),
  evento    text not null,
  nota      text,
  usuario   uuid references perfiles(id) default auth.uid(),
  en        timestamptz not null default now()
);
create index orden_historial_orden on orden_historial (orden_id);

alter table precios_proveedor add constraint precios_proveedor_orden foreign key (orden_id) references ordenes_compra(id);

create table importaciones_recepciones (
  id             uuid primary key default gen_random_uuid(),
  archivo        text not null,
  renglones      integer not null,
  importado_por  uuid references perfiles(id) default auth.uid(),
  importado_en   timestamptz not null default now()
);

create table recepciones_dodo (
  id                uuid primary key default gen_random_uuid(),
  sucursal_id       uuid not null references sucursales(id),
  dodo_insumo_id    text not null,
  material          text not null,
  unidad            text not null,
  fecha             date not null,
  cantidad          numeric(12,3) not null check (cantidad > 0),
  precio            numeric(12,2) not null default 0,
  importacion_id    uuid not null references importaciones_recepciones(id),
  orden_renglon_id  uuid references orden_renglones(id),
  clasificacion     text not null default 'pendiente' check (clasificacion in ('pendiente', 'orden', 'sin_orden', 'traspaso')),
  unique (sucursal_id, dodo_insumo_id, fecha),
  check ((clasificacion = 'orden') = (orden_renglon_id is not null))
);
create index recepciones_dodo_renglon on recepciones_dodo (orden_renglon_id);

create table recepciones_app (
  id                uuid primary key default gen_random_uuid(),
  orden_renglon_id  uuid not null references orden_renglones(id),
  cantidad          numeric(12,3) not null check (cantidad > 0),
  fecha             date not null,
  foto_path         text,
  recibido_por      uuid references perfiles(id) default auth.uid(),
  recibido_en       timestamptz not null default now(),
  anulada_por       uuid references perfiles(id),
  anulada_en        timestamptz,
  motivo_anulacion  text,
  check (anulada_en is null or coalesce(trim(motivo_anulacion), '') <> '')
);
create index recepciones_app_renglon on recepciones_app (orden_renglon_id);

-- ─── Ayudas ─────────────────────────────────────────────────────────────────
create or replace function hoy_mx() returns date
language sql stable as $$ select (now() at time zone 'America/Mexico_City')::date $$;

create or replace function exigir_admin_compras() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  if not edita_compras() then raise exception 'Solo un administrador maneja compras.'; end if;
end $$;

-- Recibido de un renglón: lo ligado de Dodo IS más lo confirmado en la app (sin anuladas).
create or replace function recibido_renglon(p_renglon uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cantidad) from recepciones_dodo where orden_renglon_id = p_renglon), 0)
       + coalesce((select sum(cantidad) from recepciones_app where orden_renglon_id = p_renglon and anulada_en is null), 0)
$$;

create view renglones_recibido with (security_invoker = true) as
select r.*, recibido_renglon(r.id) as recibido from orden_renglones r;

create or replace function hay_recepciones(p_orden uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orden_renglones r where r.orden_id = p_orden and recibido_renglon(r.id) > 0)
$$;

-- ─── Historial y candados ───────────────────────────────────────────────────
create or replace function orden_creada() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into orden_historial (orden_id, evento) values (new.id, 'creada');
  return new;
end $$;
create trigger ordenes_compra_creada after insert on ordenes_compra
  for each row execute function orden_creada();

create or replace function renglones_editables() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_estado estado_orden;
begin
  if tg_op = 'UPDATE' and new.orden_id <> old.orden_id then raise exception 'Un renglón no cambia de orden.'; end if;
  select estado into v_estado from ordenes_compra where id = coalesce(new.orden_id, old.orden_id);
  if v_estado not in ('borrador', 'enviada') then
    raise exception 'La orden ya no es cotización: sus renglones no cambian.';
  end if;
  return coalesce(new, old);
end $$;
create trigger orden_renglones_editables before insert or update or delete on orden_renglones
  for each row execute function renglones_editables();

-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table ordenes_compra            enable row level security;
alter table orden_renglones           enable row level security;
alter table orden_historial           enable row level security;
alter table importaciones_recepciones enable row level security;
alter table recepciones_dodo          enable row level security;
alter table recepciones_app           enable row level security;

create policy ver_ordenes on ordenes_compra for select using (ve_compras());
create policy alta_orden on ordenes_compra for insert with check (edita_compras() and estado = 'borrador');
create policy ver_renglones on orden_renglones for select using (ve_compras());
create policy alta_renglon on orden_renglones for insert with check (edita_compras());
create policy editar_renglon on orden_renglones for update using (edita_compras()) with check (edita_compras());
create policy quitar_renglon on orden_renglones for delete using (edita_compras());
create policy ver_historial on orden_historial for select using (ve_compras());
create policy ver_importaciones_recepciones on importaciones_recepciones for select using (ve_compras());
create policy ver_recepciones_dodo on recepciones_dodo for select using (ve_compras());
create policy ver_recepciones_app on recepciones_app for select using (ve_compras());
-- Sin update/delete directos en órdenes, historial ni recepciones: todo por las funciones de abajo.

-- ─── Órdenes ────────────────────────────────────────────────────────────────
create or replace function editar_orden(p_id uuid, p_proveedor uuid, p_sucursal uuid, p_notas text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada') then raise exception 'La orden % ya no es cotización', o.folio; end if;
  if not coalesce((select activo from proveedores where id = p_proveedor), false) then raise exception 'Elige un proveedor activo'; end if;
  update ordenes_compra set proveedor_id = p_proveedor, sucursal_id = p_sucursal, notas = nullif(trim(p_notas), '') where id = p_id;
  insert into orden_historial (orden_id, evento) values (p_id, 'editada');
end $$;

create or replace function enviar_orden(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado <> 'borrador' then raise exception 'La orden % ya está %', o.folio, o.estado; end if;
  if not exists (select 1 from orden_renglones where orden_id = p_id) then raise exception 'La cotización no tiene renglones'; end if;
  update ordenes_compra set estado = 'enviada' where id = p_id;
  insert into orden_historial (orden_id, evento) values (p_id, 'enviada');
end $$;

create or replace function confirmar_orden(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada') then raise exception 'La orden % ya está %', o.folio, o.estado; end if;
  if not exists (select 1 from orden_renglones where orden_id = p_id) then raise exception 'La orden no tiene renglones'; end if;
  if exists (select 1 from orden_renglones where orden_id = p_id and precio <= 0) then raise exception 'Hay renglones sin precio'; end if;
  if not (select activo from proveedores where id = o.proveedor_id) then raise exception 'El proveedor está desactivado'; end if;
  if exists (select 1 from orden_renglones r join articulos a on a.id = r.articulo_id where r.orden_id = p_id and not a.activo) then
    raise exception 'Hay artículos desactivados en la orden';
  end if;

  update ordenes_compra set estado = 'confirmada', confirmada_por = auth.uid(), confirmada_en = now() where id = p_id;
  insert into orden_historial (orden_id, evento) values (p_id, 'confirmada');

  insert into precios_proveedor (proveedor_id, articulo_id, precio, fecha, orden_id)
  select distinct on (articulo_id) o.proveedor_id, articulo_id, precio, hoy_mx(), p_id
    from orden_renglones where orden_id = p_id order by articulo_id, creado_en desc
  on conflict (proveedor_id, articulo_id) do update set precio = excluded.precio, fecha = excluded.fecha, orden_id = excluded.orden_id;

  with canceladas as (
    update ordenes_compra
       set estado = 'cancelada', cancelada_por = auth.uid(), cancelada_en = now(), motivo = 'Se eligió ' || o.folio
     where grupo_id = o.grupo_id and id <> p_id and estado in ('borrador', 'enviada')
    returning id
  )
  insert into orden_historial (orden_id, evento, nota) select id, 'cancelada', 'Se eligió ' || o.folio from canceladas;

  perform ligar_recepciones_dodo();
end $$;

create or replace function cancelar_orden(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la cancelación'; end if;
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada', 'confirmada') then raise exception 'La orden % ya está %', o.folio, o.estado; end if;
  if hay_recepciones(p_id) then raise exception 'Ya se recibió algo de la orden %: ciérrala en lugar de cancelarla', o.folio; end if;
  update ordenes_compra set estado = 'cancelada', cancelada_por = auth.uid(), cancelada_en = now(), motivo = trim(p_motivo) where id = p_id;
  insert into orden_historial (orden_id, evento, nota) values (p_id, 'cancelada', trim(p_motivo));
end $$;

create or replace function cerrar_orden(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra;
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo del cierre'; end if;
  select * into o from ordenes_compra where id = p_id for update;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado <> 'confirmada' then raise exception 'Solo se cierra una orden confirmada (la % está %)', o.folio, o.estado; end if;
  update ordenes_compra set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_en = now(), motivo = trim(p_motivo) where id = p_id;
  insert into orden_historial (orden_id, evento, nota) values (p_id, 'cerrada', trim(p_motivo));
end $$;

-- "Pedir a otro proveedor": misma sucursal y renglones, mismo grupo; precio = último de ese proveedor o 0.
create or replace function copiar_orden(p_id uuid, p_proveedor uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra; v_nueva uuid;
begin
  perform exigir_admin_compras();
  select * into o from ordenes_compra where id = p_id;
  if not found then raise exception 'Orden no encontrada'; end if;
  if o.estado not in ('borrador', 'enviada') then raise exception 'Solo se copia una cotización'; end if;
  if p_proveedor = o.proveedor_id then raise exception 'Esa cotización ya es de ese proveedor'; end if;
  if not coalesce((select activo from proveedores where id = p_proveedor), false) then raise exception 'Elige un proveedor activo'; end if;
  insert into ordenes_compra (proveedor_id, sucursal_id, grupo_id, notas) values (p_proveedor, o.sucursal_id, o.grupo_id, o.notas)
  returning id into v_nueva;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva)
  select v_nueva, r.articulo_id, r.descripcion, r.cantidad,
         coalesce((select pp.precio from precios_proveedor pp where pp.proveedor_id = p_proveedor and pp.articulo_id = r.articulo_id), 0),
         r.tasa_iva
    from orden_renglones r where r.orden_id = p_id order by r.creado_en, r.id;
  insert into orden_historial (orden_id, evento, nota) values (v_nueva, 'copiada', 'Alternativa de ' || o.folio);
  return v_nueva;
end $$;

-- ─── Recepciones desde Dodo IS ──────────────────────────────────────────────
-- Liga cada recepción pendiente al renglón de una orden confirmada de la misma sucursal y el mismo insumo,
-- recibida entre la confirmación y 7 días después, con cantidad pendiente; la orden más antigua primero.
create or replace function ligar_recepciones_dodo() returns void
language plpgsql security definer set search_path = public as $$
declare rec record; v_renglon uuid;
begin
  for rec in select * from recepciones_dodo where clasificacion = 'pendiente' order by fecha, id loop
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

-- p_dias: [{sucursal_id, fecha}] que se reemplazan completos; p_filas: [{sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio}].
create or replace function importar_recepciones_dodo(p_archivo text, p_dias jsonb, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_imp uuid; v_ligadas int; v_pendientes int;
begin
  perform exigir_admin_compras();
  insert into importaciones_recepciones (archivo, renglones) values (p_archivo, jsonb_array_length(p_filas)) returning id into v_imp;
  delete from recepciones_dodo r
   using jsonb_to_recordset(p_dias) d(sucursal_id uuid, fecha date)
   where r.sucursal_id = d.sucursal_id and r.fecha = d.fecha;
  insert into recepciones_dodo (sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id)
  select f.sucursal_id, upper(f.dodo_insumo_id), f.material, f.unidad, f.fecha, f.cantidad, coalesce(f.precio, 0), v_imp
    from jsonb_to_recordset(p_filas) f(sucursal_id uuid, dodo_insumo_id text, material text, unidad text, fecha date, cantidad numeric, precio numeric);
  perform ligar_recepciones_dodo();
  select count(*) filter (where clasificacion = 'orden'), count(*) filter (where clasificacion = 'pendiente')
    into v_ligadas, v_pendientes
    from recepciones_dodo where importacion_id = v_imp;
  return jsonb_build_object('recepciones', jsonb_array_length(p_filas), 'ligadas', v_ligadas, 'pendientes', v_pendientes);
end $$;

-- Revisión manual: ligar a un renglón (misma sucursal; si el artículo tiene ID de Dodo IS, debe coincidir),
-- o marcar sin orden / traspaso, o regresar a pendiente.
create or replace function clasificar_recepcion(p_id uuid, p_clasificacion text, p_renglon uuid) returns void
language plpgsql security definer set search_path = public as $$
declare rec recepciones_dodo; v_suc uuid; v_estado estado_orden; v_insumo text;
begin
  perform exigir_admin_compras();
  select * into rec from recepciones_dodo where id = p_id for update;
  if not found then raise exception 'Recepción no encontrada'; end if;
  if p_clasificacion = 'orden' then
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

-- ─── Recepciones en la app (activos fijos, servicios y otros) ───────────────
create or replace function recibir_renglon(p_renglon uuid, p_cantidad numeric, p_fecha date, p_foto text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o ordenes_compra; v_tipo categoria_compra; v_id uuid; v_carpeta uuid;
begin
  if mi_rol()::text not in ('encargado', 'gerente', 'admin') then
    raise exception 'Solo encargado, gerente o administrador reciben compras.';
  end if;
  select oc.* into o from ordenes_compra oc join orden_renglones r on r.orden_id = oc.id where r.id = p_renglon;
  if not found then raise exception 'Renglón no encontrado'; end if;
  if o.estado <> 'confirmada' then raise exception 'La orden % no está confirmada', o.folio; end if;
  if mi_rol()::text <> 'admin' and o.sucursal_id is distinct from mi_sucursal() then raise exception 'La orden % es de otra sucursal', o.folio; end if;
  select a.tipo into v_tipo from orden_renglones r join articulos a on a.id = r.articulo_id where r.id = p_renglon;
  if v_tipo = 'consumible' then raise exception 'Los consumibles se reciben en Dodo IS'; end if;
  if p_cantidad is null or p_cantidad <= 0 then raise exception 'La cantidad debe ser mayor a cero'; end if;
  if p_fecha is null or p_fecha > hoy_mx() then raise exception 'La fecha de recepción no puede ser futura'; end if;
  -- La foto vive en <sucursal>/recepciones/…; en órdenes de Oficina, en la carpeta de la sucursal del admin que recibe.
  if p_foto is not null then
    v_carpeta := coalesce(o.sucursal_id, mi_sucursal());
    if v_carpeta is null or p_foto not like v_carpeta::text || '/recepciones/%' then
      raise exception 'La foto no es de esta sucursal';
    end if;
  end if;
  insert into recepciones_app (orden_renglon_id, cantidad, fecha, foto_path) values (p_renglon, p_cantidad, p_fecha, p_foto)
  returning id into v_id;
  insert into orden_historial (orden_id, evento, nota)
  select o.id, 'recibido', r.descripcion || ': ' || p_cantidad from orden_renglones r where r.id = p_renglon;
  return v_id;
end $$;

create or replace function anular_recepcion(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_orden uuid;
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la anulación'; end if;
  update recepciones_app set anulada_por = auth.uid(), anulada_en = now(), motivo_anulacion = trim(p_motivo)
   where id = p_id and anulada_en is null;
  if not found then raise exception 'La recepción no existe o ya estaba anulada'; end if;
  select r.orden_id into v_orden from recepciones_app ra join orden_renglones r on r.id = ra.orden_renglon_id where ra.id = p_id;
  insert into orden_historial (orden_id, evento, nota) values (v_orden, 'recepción anulada', trim(p_motivo));
end $$;

-- Lo que la sucursal tiene por recibir, sin precios: gerente, encargado y admin; solo su sucursal
-- (el admin también las de Oficina). Solo no consumibles.
create or replace function ordenes_por_recibir()
returns table (orden_id uuid, folio text, proveedor text, confirmada_en timestamptz, renglon_id uuid,
               descripcion text, unidad text, tipo categoria_compra, cantidad numeric, recibido numeric)
language sql stable security definer set search_path = public as $$
  select o.id, o.folio, coalesce(p.nombre_comercial, p.razon_social), o.confirmada_en, r.id,
         r.descripcion, a.unidad, a.tipo, r.cantidad, recibido_renglon(r.id)
    from ordenes_compra o
    join proveedores p on p.id = o.proveedor_id
    join orden_renglones r on r.orden_id = o.id
    join articulos a on a.id = r.articulo_id
   where o.estado = 'confirmada' and a.tipo <> 'consumible'
     and mi_rol()::text in ('encargado', 'gerente', 'admin')
     and (o.sucursal_id = mi_sucursal() or (mi_rol()::text = 'admin' and o.sucursal_id is null))
   order by o.confirmada_en, o.folio, r.creado_en, r.id
$$;

-- ─── Permisos de ejecución ──────────────────────────────────────────────────
-- ligar_recepciones_dodo escribe: solo la llaman otras funciones (corren como dueño), nunca la API.
revoke execute on function ligar_recepciones_dodo() from public, anon, authenticated;
-- Las de solo lectura las usan la vista renglones_recibido y las pantallas: solo usuarios con sesión.
revoke execute on function recibido_renglon(uuid), hay_recepciones(uuid) from public, anon;
grant execute on function recibido_renglon(uuid), hay_recepciones(uuid) to authenticated;
