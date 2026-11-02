-- Tareas y backlog: pendientes asignados a una persona, ligados a lo más a un documento (orden, factura, día de
-- venta, proyecto o ítem de apertura). Toda escritura pasa por funciones; puede_ver_tarea decide qué ve cada puesto
-- y la usan la RLS y las funciones de lectura (que además devuelven nombres que la RLS de perfiles no deja ver).
begin;
create type public.estado_tarea as enum ('por_hacer','en_curso','en_revision','hecho','cancelada');
create type public.prioridad_tarea as enum ('alta','media','baja');
create sequence public.tareas_numero;

create table public.tareas (
 id uuid primary key default gen_random_uuid(),
 numero bigint not null unique default nextval('public.tareas_numero'),
 titulo text not null check(length(trim(titulo)) between 3 and 200),
 descripcion text check(length(descripcion)<=4000),
 estado public.estado_tarea not null default 'por_hacer',
 prioridad public.prioridad_tarea not null default 'media',
 vence date,
 asignado_a uuid not null references public.perfiles(id),
 creado_por uuid references public.perfiles(id),
 sucursal_id uuid references public.sucursales(id),
 origen text not null default 'manual' check(origen in ('manual','automatica')),
 regla text,
 orden_id uuid references public.ordenes_compra(id),
 factura_id uuid references public.facturas(id),
 -- El día de venta se liga por su clave natural: una reimportación borra y recrea la fila de ventas_dia con otro id.
 ventas_sucursal_id uuid references public.sucursales(id),
 ventas_fecha date,
 apertura_proyecto_id uuid references public.apertura_proyectos(id),
 apertura_item_id uuid references public.apertura_items(id),
 -- Texto del documento al crear la tarea: el asignado lo lee aunque no pueda abrir el documento.
 documento_texto text check(length(documento_texto)<=300),
 motivo_cierre text check(length(motivo_cierre)<=1000),
 revision integer not null default 1,
 creada_en timestamptz not null default now(),
 actualizada_en timestamptz not null default now(),
 cerrada_en timestamptz,
 constraint tareas_un_documento check(num_nonnulls(orden_id,factura_id,ventas_fecha,apertura_proyecto_id,apertura_item_id)<=1),
 check((ventas_sucursal_id is null)=(ventas_fecha is null)),
 check((num_nonnulls(orden_id,factura_id,ventas_fecha,apertura_proyecto_id,apertura_item_id)=1)=(documento_texto is not null)),
 check((estado in ('hecho','cancelada'))=(cerrada_en is not null)),
 check(estado<>'cancelada' or length(trim(coalesce(motivo_cierre,'')))>=5),
 check((origen='manual')=(creado_por is not null)),
 check((origen='automatica')=(regla is not null))
);
create index tareas_asignado_abiertas on public.tareas(asignado_a) where estado not in ('hecho','cancelada');
create index tareas_sucursal_estado on public.tareas(sucursal_id,estado);
create index tareas_orden on public.tareas(orden_id) where orden_id is not null;
create index tareas_factura on public.tareas(factura_id) where factura_id is not null;
create index tareas_ventas_dia on public.tareas(ventas_sucursal_id,ventas_fecha) where ventas_fecha is not null;
create index tareas_apertura_proyecto on public.tareas(apertura_proyecto_id) where apertura_proyecto_id is not null;
create index tareas_apertura_item on public.tareas(apertura_item_id) where apertura_item_id is not null;

create table public.tarea_comentarios (
 id bigint generated always as identity primary key,
 tarea_id uuid not null references public.tareas(id) on delete cascade,
 autor_id uuid not null references public.perfiles(id),
 texto text not null check(length(trim(texto)) between 1 and 4000),
 fecha timestamptz not null default now()
);
create index tarea_comentarios_tarea on public.tarea_comentarios(tarea_id,fecha);
create table public.tarea_historial (
 id bigint generated always as identity primary key,
 tarea_id uuid not null references public.tareas(id) on delete cascade,
 usuario_id uuid references public.perfiles(id), -- null = sistema (tareas automáticas)
 campo text not null, antes text, despues text,
 fecha timestamptz not null default now()
);
create index tarea_historial_tarea on public.tarea_historial(tarea_id,fecha);

-- Un registro por campo que cambió, más 'creada' al insertar. Nadie escribe el historial directo.
create function public.registrar_historial_tarea() returns trigger
language plpgsql security definer set search_path='' as $$
declare c text;a text;d text;
begin
 if tg_op='INSERT' then
  insert into public.tarea_historial(tarea_id,usuario_id,campo,antes,despues) values(new.id,auth.uid(),'creada',null,new.estado::text);
  return new;
 end if;
 foreach c in array array['estado','prioridad','vence','asignado_a','titulo','descripcion'] loop
  a:=to_jsonb(old)->>c;d:=to_jsonb(new)->>c;
  if a is distinct from d then insert into public.tarea_historial(tarea_id,usuario_id,campo,antes,despues) values(new.id,auth.uid(),c,a,d);end if;
 end loop;
 return new;
end $$;
create trigger tareas_historial after insert or update on public.tareas for each row execute function public.registrar_historial_tarea();

-- Texto, sucursal, ruta y si está anulado, para cualquier tipo de documento. Solo uso interno.
create function public.documento_tarea(p_tipo text,p_id uuid)
returns table(texto text,sucursal_id uuid,ruta text,anulado boolean)
language sql stable security definer set search_path='' as $$
 select 'Orden '||o.folio||' · '||coalesce(p.nombre_comercial,p.razon_social),o.sucursal_id,'/compras/ordenes/'||o.id,o.estado::text='cancelada'
  from public.ordenes_compra o join public.proveedores p on p.id=o.proveedor_id where p_tipo='orden' and o.id=p_id
 union all
 select 'Factura '||coalesce(nullif(concat_ws('-',f.serie,f.folio),''),left(f.uuid,8))||' · '||f.nombre_emisor,f.sucursal_id,'/compras/facturas/'||f.id,f.estado::text='cancelada'
  from public.facturas f where p_tipo='factura' and f.id=p_id
 union all
 select 'Venta '||s.nombre||' · '||to_char(v.fecha,'DD/MM/YYYY'),v.sucursal_id,'/ventas/conciliacion?mes='||to_char(v.fecha,'YYYY-MM')||'&sucursal='||v.sucursal_id,false
  from public.ventas_dia v join public.sucursales s on s.id=v.sucursal_id where p_tipo='ventas_dia' and v.id=p_id
 union all
 select 'Apertura '||s.nombre,a.sucursal_id,'/aperturas/'||a.id,false
  from public.apertura_proyectos a join public.sucursales s on s.id=a.sucursal_id where p_tipo='apertura_proyecto' and a.id=p_id
 union all
 select 'Apertura '||s.nombre||' · '||i.clave||' '||i.nombre,a.sucursal_id,'/aperturas/'||a.id||'/items/'||i.id,false
  from public.apertura_items i join public.apertura_proyectos a on a.id=i.proyecto_id join public.sucursales s on s.id=a.sucursal_id
  where p_tipo='apertura_item' and i.id=p_id
$$;

-- Admin y corporativo ven todo; cada quien lo suyo y lo que creó; el gerente, su sucursal; el encargado, además,
-- lo asignado a operación de su sucursal. Un usuario inactivo no ve nada.
create function public.puede_ver_tarea(p_asignado uuid,p_creador uuid,p_sucursal uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.mi_rol() is not null and (
  public.mi_rol()::text in ('admin','corporativo')
  or p_asignado=auth.uid() or p_creador=auth.uid()
  or (public.mi_rol()::text='gerente' and p_sucursal=public.mi_sucursal())
  or (public.mi_rol()::text='encargado' and p_sucursal=public.mi_sucursal()
      and exists(select 1 from public.perfiles x where x.id=p_asignado and x.rol::text='operacion' and x.sucursal_id=public.mi_sucursal()))),false)
$$;

-- Ligar exige ver el documento: compras y aperturas son de oficina (admin); el gerente, días de venta de su sucursal.
create function public.puede_ligar_documento(p_tipo text,p_sucursal uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.mi_rol()::text='admin' or (public.mi_rol()::text='gerente' and p_tipo='ventas_dia' and p_sucursal=public.mi_sucursal()),false)
$$;

alter table public.tareas enable row level security;
alter table public.tarea_comentarios enable row level security;
alter table public.tarea_historial enable row level security;
create policy ver_tareas on public.tareas for select using(public.puede_ver_tarea(asignado_a,creado_por,sucursal_id));
create policy ver_tarea_comentarios on public.tarea_comentarios for select using(exists(select 1 from public.tareas t where t.id=tarea_id));
create policy ver_tarea_historial on public.tarea_historial for select using(exists(select 1 from public.tareas t where t.id=tarea_id));
revoke all on public.tareas,public.tarea_comentarios,public.tarea_historial from anon,authenticated;
grant select on public.tareas,public.tarea_comentarios,public.tarea_historial to authenticated;

-- Admin: a cualquiera activo (menos corporativo); en tareas de sucursal, a admins o a gente de esa sucursal.
-- Gerente: a su sucursal. Encargado: a encargados y operación de su sucursal. Los demás, a nadie.
create function public.personas_asignables(p_sucursal uuid)
returns table(id uuid,nombre text,rol text)
language sql stable security definer set search_path='' as $$
 select p.id,p.nombre,p.rol::text from public.perfiles p
 where p.activo and p.rol::text<>'corporativo' and case public.mi_rol()::text
  when 'admin' then p_sucursal is null or p.sucursal_id=p_sucursal or p.rol::text='admin'
  when 'gerente' then p.sucursal_id=public.mi_sucursal() and p.rol::text in ('gerente','encargado','operacion')
  when 'encargado' then p.sucursal_id=public.mi_sucursal() and p.rol::text in ('encargado','operacion')
  else false end
 order by p.nombre
$$;

create function public.documento_para_tarea(p_tipo text,p_id uuid)
returns table(texto text,sucursal_id uuid,ruta text,anulado boolean)
language plpgsql stable security definer set search_path='' as $$
declare d record;
begin
 select * into d from public.documento_tarea(p_tipo,p_id);
 if not found then raise exception 'El documento no existe.';end if;
 if not public.puede_ligar_documento(p_tipo,d.sucursal_id) then raise exception 'No puedes ligar tareas a este documento.';end if;
 return query select d.texto,d.sucursal_id,d.ruta,d.anulado;
end $$;

-- true si el texto es una fecha AAAA-MM-DD que existe en el calendario.
create function public.es_fecha_iso(p text) returns boolean
language plpgsql immutable set search_path='' as $$
begin
 return p ~ '^\d{4}-\d{2}-\d{2}$' and to_char(p::date,'YYYY-MM-DD')=p;
exception when others then return false;
end $$;

-- Valida los datos comunes de alta y edición; devuelve el mensaje de error o null.
create function public.error_datos_tarea(p_datos jsonb,p_permitidas text[]) returns text
language sql immutable set search_path='' as $$
 select case
  when jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k<>all(p_permitidas)) then 'Datos de tarea inválidos.'
  when length(trim(coalesce(p_datos->>'titulo',''))) not between 3 and 200 then 'El título debe tener de 3 a 200 caracteres.'
  when length(coalesce(p_datos->>'descripcion',''))>4000 then 'La descripción es demasiado larga (máximo 4000 caracteres).'
  when coalesce(nullif(p_datos->>'prioridad',''),'media') not in ('alta','media','baja') then 'Prioridad inválida.'
  when coalesce(p_datos->>'vence','')<>'' and not public.es_fecha_iso(p_datos->>'vence') then 'La fecha de vencimiento no es válida.'
  when coalesce(p_datos->>'documento_id','')<>'' and p_datos->>'documento_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'El documento ligado está incompleto.'
  when coalesce(p_datos->>'sucursal_id','')<>'' and p_datos->>'sucursal_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'Sucursal inválida.'
  when coalesce(p_datos->>'asignado_a','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'Esa persona no puede recibir esta tarea.'
 end
$$;

create function public.crear_tarea(p_datos jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare r text:=public.mi_rol()::text;tipo text;doc uuid;d record;vs uuid;vf date;txt text;s uuid;asignado uuid;n bigint;msg text;
begin
 if r is null then raise exception 'Tu usuario no está activo.';end if;
 if r='corporativo' then raise exception 'Corporativo solo puede consultar.';end if;
 if r not in ('admin','gerente','encargado') then raise exception 'Tu puesto no puede crear tareas.';end if;
 msg:=public.error_datos_tarea(p_datos,array['titulo','descripcion','prioridad','vence','asignado_a','sucursal_id','documento_tipo','documento_id']);
 if msg is not null then raise exception '%',msg;end if;
 tipo:=nullif(p_datos->>'documento_tipo','');
 if (tipo is null)<>(nullif(p_datos->>'documento_id','') is null) then raise exception 'Documento incompleto.';end if;
 if tipo is not null then
  if tipo not in ('orden','factura','ventas_dia','apertura_proyecto','apertura_item') then raise exception 'Tipo de documento inválido.';end if;
  doc:=(p_datos->>'documento_id')::uuid;
  select * into d from public.documento_tarea(tipo,doc);
  if not found then raise exception 'El documento no existe.';end if;
  if not public.puede_ligar_documento(tipo,d.sucursal_id) then raise exception 'No puedes ligar tareas a este documento.';end if;
  s:=d.sucursal_id;txt:=d.texto;
  if tipo='ventas_dia' then select v.sucursal_id,v.fecha into vs,vf from public.ventas_dia v where v.id=doc;end if;
 elsif r='admin' then
  s:=nullif(p_datos->>'sucursal_id','')::uuid;
  if s is not null and not exists(select 1 from public.sucursales x where x.id=s) then raise exception 'Sucursal inválida.';end if;
 else s:=public.mi_sucursal();
 end if;
 asignado:=(p_datos->>'asignado_a')::uuid;
 if not exists(select 1 from public.personas_asignables(s) x where x.id=asignado) then raise exception 'Esa persona no puede recibir esta tarea.';end if;
 insert into public.tareas(titulo,descripcion,prioridad,vence,asignado_a,creado_por,sucursal_id,
   orden_id,factura_id,ventas_sucursal_id,ventas_fecha,apertura_proyecto_id,apertura_item_id,documento_texto)
 values(trim(p_datos->>'titulo'),nullif(trim(coalesce(p_datos->>'descripcion','')),''),coalesce(nullif(p_datos->>'prioridad',''),'media')::public.prioridad_tarea,
   nullif(p_datos->>'vence','')::date,asignado,auth.uid(),s,
   case when tipo='orden' then doc end,case when tipo='factura' then doc end,vs,vf,
   case when tipo='apertura_proyecto' then doc end,case when tipo='apertura_item' then doc end,txt)
 returning numero into n;
 return n;
end $$;

-- Lo que esta persona ve, con nombres y datos vivos del documento. Las cerradas, solo los últimos 30 días
-- (una tarea pedida por número o por documento sale siempre).
create function public.tareas_visibles(p_numero bigint default null,p_documento uuid default null)
returns table(id uuid,numero bigint,titulo text,descripcion text,estado text,prioridad text,vence date,
 asignado_a uuid,asignado text,asignado_activo boolean,creado_por uuid,creador text,sucursal_id uuid,sucursal text,origen text,
 documento_tipo text,documento_id uuid,documento_texto text,documento_ruta text,documento_anulado boolean,
 motivo_cierre text,revision integer,creada_en timestamptz,actualizada_en timestamptz,cerrada_en timestamptz)
language sql stable security definer set search_path='' as $$
 select t.id,t.numero,t.titulo,t.descripcion,t.estado::text,t.prioridad::text,t.vence,
  t.asignado_a,a.nombre,a.activo,t.creado_por,c.nombre,t.sucursal_id,s.nombre,t.origen,
  x.tipo,x.doc,t.documento_texto,d.ruta,coalesce(d.anulado,false),
  t.motivo_cierre,t.revision,t.creada_en,t.actualizada_en,t.cerrada_en
 from public.tareas t
 join public.perfiles a on a.id=t.asignado_a
 left join public.perfiles c on c.id=t.creado_por
 left join public.sucursales s on s.id=t.sucursal_id
 cross join lateral (select case when t.orden_id is not null then 'orden' when t.factura_id is not null then 'factura'
   when t.ventas_fecha is not null then 'ventas_dia' when t.apertura_proyecto_id is not null then 'apertura_proyecto'
   when t.apertura_item_id is not null then 'apertura_item' end tipo,
   coalesce(t.orden_id,t.factura_id,(select v.id from public.ventas_dia v where v.sucursal_id=t.ventas_sucursal_id and v.fecha=t.ventas_fecha),t.apertura_proyecto_id,t.apertura_item_id) doc) x
 left join lateral public.documento_tarea(x.tipo,x.doc) d on true
 where public.puede_ver_tarea(t.asignado_a,t.creado_por,t.sucursal_id)
  and (p_numero is null or t.numero=p_numero)
  and (p_documento is null or x.doc=p_documento)
  and (p_numero is not null or p_documento is not null or t.cerrada_en is null or t.cerrada_en>now()-interval '30 days')
 order by t.numero desc
$$;

create function public.contar_mis_tareas() returns table(abiertas integer,vencidas integer)
language sql stable security definer set search_path='' as $$
 select count(*)::integer,(count(*) filter(where vence<public.hoy_mx()))::integer
 from public.tareas where asignado_a=auth.uid() and public.mi_rol() is not null and estado not in ('hecho','cancelada')
$$;

-- (Task 3 agrega aquí mover_tarea, actualizar_tarea, comentar_tarea e hilo_tarea.)

revoke all on sequence public.tareas_numero from public,anon,authenticated;
revoke all on function public.es_fecha_iso(text),public.registrar_historial_tarea(),public.documento_tarea(text,uuid),public.puede_ligar_documento(text,uuid),
 public.error_datos_tarea(jsonb,text[]) from public,anon,authenticated;
revoke all on function public.puede_ver_tarea(uuid,uuid,uuid),public.personas_asignables(uuid),public.documento_para_tarea(text,uuid),
 public.crear_tarea(jsonb),public.tareas_visibles(bigint,uuid),public.contar_mis_tareas() from public,anon;
-- puede_ver_tarea también la necesita la RLS, que corre como el usuario.
grant execute on function public.puede_ver_tarea(uuid,uuid,uuid),public.personas_asignables(uuid),public.documento_para_tarea(text,uuid),
 public.crear_tarea(jsonb),public.tareas_visibles(bigint,uuid),public.contar_mis_tareas() to authenticated;
commit;
