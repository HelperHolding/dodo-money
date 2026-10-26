-- importar_rappi borraba los renglones de cada orden y los volvía a ligar al producto por su clave, así que una
-- reimportación deshacía los costeos manuales por orden (productos "Rappi interno · … · combo confirmado" o
-- "… · costeo individual …" que el admin asigna a un renglón). Ahora, si un renglón llega igual que el que ya existía
-- (misma posición, nombre, opciones, cantidad e importe), conserva su producto_id; si cambió, se liga por clave como antes.
-- El resto de la función no cambia. CREATE OR REPLACE conserva los permisos de 0032.
begin;
create or replace function importar_rappi(p_sucursal uuid,p_archivo text,p_huella text,p_ordenes jsonb,p_productos jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare tienda text; reemplazadas integer; orden record; previas jsonb;
begin
  if not edita_finanzas() then raise exception 'Solo el admin importa Rappi.';end if;
  if p_sucursal is null or not exists(select 1 from sucursales where id=p_sucursal) or p_archivo is null or length(trim(p_archivo)) not between 1 and 255 or p_huella is null or p_huella !~ '^[0-9a-f]{64}$' then raise exception 'Sucursal o archivo inválido.';end if;
  if p_ordenes is null or p_productos is null or jsonb_typeof(p_ordenes)<>'array' or jsonb_typeof(p_productos)<>'array' then raise exception 'Se requieren órdenes y productos.';end if;
  if jsonb_array_length(p_ordenes) not between 1 and 5000 or jsonb_array_length(p_productos) not between 1 and 50000 then raise exception 'Exporta un periodo más corto.';end if;
  if exists(select 1 from jsonb_to_recordset(p_ordenes) as o(rappi_id text,tienda_id text,fecha date,hora text,estado text,pago text,bruto numeric,descuento_restaurante numeric,subtotal_restaurante numeric,descuento_rappi numeric,facturar numeric)
    where rappi_id is null or rappi_id !~ '^[0-9]{5,20}$' or tienda_id is null or tienda_id !~ '^MX[0-9]+$' or fecha is null or fecha>hoy_mx() or hora is null or hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    or estado is null or estado not in ('Finalizado','Cancelado','Con reclamo') or pago is null or length(pago) not between 1 and 120
    or bruto is null or not(bruto>=0 and bruto<1e12) or bruto<>round(bruto,2) or descuento_restaurante is null or not(descuento_restaurante>=0 and descuento_restaurante<=bruto)
    or subtotal_restaurante is null or subtotal_restaurante<>bruto-descuento_restaurante or descuento_rappi is null or not(descuento_rappi>=0 and descuento_rappi<=subtotal_restaurante)
    or facturar is null or facturar<>subtotal_restaurante-descuento_rappi or descuento_restaurante<>round(descuento_restaurante,2) or descuento_rappi<>round(descuento_rappi,2)) then raise exception 'Orden inválida.';end if;
  if (select count(distinct tienda_id) from jsonb_to_recordset(p_ordenes) as o(tienda_id text))<>1 or exists(select 1 from jsonb_to_recordset(p_ordenes) as o(rappi_id text) group by rappi_id having count(*)>1) then raise exception 'Una tienda por archivo, sin órdenes repetidas.';end if;
  select tienda_id into tienda from jsonb_to_recordset(p_ordenes) as o(tienda_id text) limit 1;
  perform pg_advisory_xact_lock(hashtextextended('rappi:'||tienda,0));
  for orden in select rappi_id from jsonb_to_recordset(p_ordenes) as o(rappi_id text) order by rappi_id loop
    perform pg_advisory_xact_lock(hashtextextended('rappi:orden:'||orden.rappi_id,0));
  end loop;
  if exists(select 1 from rappi_tiendas where id=tienda and sucursal_id<>p_sucursal) then raise exception 'La tienda Rappi ya está ligada a otra sucursal.';end if;
  if exists(select 1 from rappi_ordenes r join jsonb_to_recordset(p_ordenes) as o(rappi_id text) using(rappi_id) where r.tienda_id<>tienda or r.sucursal_id<>p_sucursal) then raise exception 'Una orden pertenece a otra tienda o sucursal.';end if;
  if exists(select 1 from jsonb_to_recordset(p_productos) as p(rappi_id text,linea integer,nombre text,opciones text,cantidad integer,importe numeric,clave text)
    where not exists(select 1 from jsonb_to_recordset(p_ordenes) as o(rappi_id text) where o.rappi_id=p.rappi_id)
    or linea is null or linea<1 or nombre is null or length(nombre) not between 1 and 500 or opciones is null or length(opciones)>1000 or cantidad is null or cantidad not between 1 and 10000
    or importe is null or not(importe>=0 and importe<1e12) or importe<>round(importe,2) or clave is null or clave !~ '^[0-9a-f]{64}$') then raise exception 'Producto inválido.';end if;
  if (select sum(cantidad) from jsonb_to_recordset(p_productos) as p(cantidad integer))>100000 or exists(select 1 from jsonb_to_recordset(p_productos) as p(rappi_id text) group by rappi_id having count(*)>200) then raise exception 'Exporta un periodo más corto.';end if;
  if exists(select 1 from jsonb_to_recordset(p_productos) as p(rappi_id text,linea integer) group by rappi_id,linea having count(*)>1) then raise exception 'Renglones repetidos.';end if;
  if exists(select 1 from jsonb_to_recordset(p_ordenes) as o(rappi_id text,bruto numeric) where o.bruto is distinct from (select sum(importe) from jsonb_to_recordset(p_productos) as p(rappi_id text,importe numeric) where p.rappi_id=o.rappi_id)) then raise exception 'Los productos no cuadran con las órdenes.';end if;
  select count(*) into reemplazadas from rappi_ordenes r join jsonb_to_recordset(p_ordenes) as o(rappi_id text) using(rappi_id);
  insert into rappi_tiendas values(tienda,p_sucursal) on conflict do nothing;
  insert into rappi_productos(clave,nombre) select distinct clave,nombre||case when opciones='' then '' else ' · '||opciones end from jsonb_to_recordset(p_productos) as p(clave text,nombre text,opciones text) on conflict(clave) do nothing;
  insert into rappi_ordenes(rappi_id,tienda_id,sucursal_id,fecha,hora,estado,pago,bruto,descuento_restaurante,subtotal_restaurante,descuento_rappi,facturar,archivo,huella,registrado_por)
    select rappi_id,tienda_id,p_sucursal,fecha,hora,estado,pago,bruto,descuento_restaurante,subtotal_restaurante,descuento_rappi,facturar,p_archivo,p_huella,auth.uid()
    from jsonb_to_recordset(p_ordenes) as o(rappi_id text,tienda_id text,fecha date,hora time,estado text,pago text,bruto numeric,descuento_restaurante numeric,subtotal_restaurante numeric,descuento_rappi numeric,facturar numeric)
    on conflict(rappi_id) do update set fecha=excluded.fecha,hora=excluded.hora,estado=excluded.estado,pago=excluded.pago,bruto=excluded.bruto,descuento_restaurante=excluded.descuento_restaurante,subtotal_restaurante=excluded.subtotal_restaurante,descuento_rappi=excluded.descuento_rappi,facturar=excluded.facturar,archivo=excluded.archivo,huella=excluded.huella,registrado_por=excluded.registrado_por,registrado_en=now();
  -- Renglones que ya tenían estas órdenes, para conservar el producto de los que lleguen sin cambios.
  select coalesce(jsonb_agg(jsonb_build_object('rappi_id',l.rappi_id,'linea',l.linea,'producto_id',l.producto_id,'nombre',l.nombre,'opciones',l.opciones,'cantidad',l.cantidad,'importe',l.importe)),'[]'::jsonb) into previas
    from rappi_lineas l join jsonb_to_recordset(p_ordenes) as o(rappi_id text) using(rappi_id);
  delete from rappi_lineas l using jsonb_to_recordset(p_ordenes) as o(rappi_id text) where l.rappi_id=o.rappi_id;
  insert into rappi_lineas select p.rappi_id,p.linea,coalesce(v.producto_id,c.id),p.nombre,p.opciones,p.cantidad,p.importe
    from jsonb_to_recordset(p_productos) as p(rappi_id text,linea integer,nombre text,opciones text,cantidad integer,importe numeric,clave text)
    join rappi_productos c using(clave)
    left join jsonb_to_recordset(previas) as v(rappi_id text,linea integer,producto_id bigint,nombre text,opciones text,cantidad integer,importe numeric)
      on v.rappi_id=p.rappi_id and v.linea=p.linea and v.cantidad=p.cantidad and v.importe=p.importe
      and lower(btrim(v.nombre))=lower(btrim(p.nombre)) and lower(btrim(v.opciones))=lower(btrim(p.opciones));
  return jsonb_build_object('ordenes',jsonb_array_length(p_ordenes),'actualizadas',reemplazadas);
end $$;
commit;
