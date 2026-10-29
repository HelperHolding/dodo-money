-- Calendario de cumplimiento: obligaciones (permisos, licencias, protección civil, extintores, trámites fiscales, seguros)
-- por sucursal o razón social, con evidencia (foto + PDF) y factura si llevan pago. Las fechas futuras se calculan de la
-- regla (fechas_cumplimiento); solo se guarda una fecha cuando alguien actúa sobre ella. cumplimiento_en_rango une
-- obligaciones, compromisos con servicio y mantenimientos; avisos_cumplimiento es lo que n8n entrega cada mañana.
begin;
create table public.cumplimiento_obligaciones (
 id uuid primary key default gen_random_uuid(),
 tipo text not null check(tipo in ('permiso','licencia','proteccion_civil','extintores','tramite_fiscal','seguro','otro')),
 nombre text not null check(length(trim(nombre)) between 3 and 150),
 descripcion text check(length(descripcion)<=300),
 autoridad text check(length(autoridad)<=150),
 folio text check(length(folio)<=100),
 notas text check(length(notas)<=1000),
 sucursal_id uuid references public.sucursales(id),
 razon_social_rfc text references public.razones_sociales(rfc),
 frecuencia text not null check(frecuencia in ('semanal','quincenal','mensual','bimestral','anual')),
 inicio date not null check(inicio>='2000-01-01'), fin date,
 con_pago boolean not null default false,
 proveedor_id uuid references public.proveedores(id),
 monto_estimado numeric(16,2) check(monto_estimado>0 and monto_estimado<1e12),
 revision integer not null default 1,
 creado_por uuid not null default auth.uid() references public.perfiles(id),
 creado_en timestamptz not null default now(),
 check((sucursal_id is null)<>(razon_social_rfc is null)),
 check(fin is null or fin>=inicio),
 check(not con_pago or proveedor_id is not null),
 check(con_pago or (proveedor_id is null and monto_estimado is null)),
 check(tipo<>'otro' or length(trim(coalesce(descripcion,'')))>=3)
);
create index cumplimiento_obligaciones_sucursal on public.cumplimiento_obligaciones(sucursal_id);
create table public.cumplimiento_fechas (
 id uuid primary key default gen_random_uuid(),
 obligacion_id uuid not null references public.cumplimiento_obligaciones(id),
 vence date not null,
 estado text not null default 'pendiente' check(estado in ('pendiente','cumplida','omitida')),
 cumplida_fecha date,
 nota text check(nota is null or length(trim(nota)) between 5 and 2000),
 omitida_motivo text check(omitida_motivo is null or length(trim(omitida_motivo)) between 5 and 1000),
 factura_id uuid unique references public.facturas(id),
 revision integer not null default 0,
 unique(obligacion_id,vence),
 check(estado<>'cumplida' or (cumplida_fecha is not null and nota is not null)),
 check((estado='omitida')=(omitida_motivo is not null)),
 check(estado<>'omitida' or factura_id is null)
);
create table public.cumplimiento_historial (
 id bigint generated always as identity primary key,
 obligacion_id uuid not null references public.cumplimiento_obligaciones(id),
 evento text not null, anterior jsonb not null, nuevo jsonb not null,
 usuario_id uuid not null references public.perfiles(id), fecha timestamptz not null default now()
);
create index cumplimiento_historial_obligacion on public.cumplimiento_historial(obligacion_id,fecha);
-- Un renglón por aviso entregado y canal: n8n puede reintentar sin duplicar.
create table public.cumplimiento_avisos_enviados (
 id bigint generated always as identity primary key,
 clave text not null, canal text not null check(canal in ('correo','chat')),
 origen text not null check(origen in ('obligacion','compromiso','mantenimiento')),
 referencia_id uuid not null, vence date not null,
 tipo_aviso text not null check(tipo_aviso in ('vencida','por_vencer','sin_factura')),
 enviado_el date not null, usuario_id uuid not null references public.perfiles(id), creado_en timestamptz not null default now(),
 unique(clave,canal)
);
alter table public.cumplimiento_obligaciones enable row level security;
alter table public.cumplimiento_fechas enable row level security;
alter table public.cumplimiento_historial enable row level security;
alter table public.cumplimiento_avisos_enviados enable row level security;
create policy ver_cumplimiento_obligaciones on public.cumplimiento_obligaciones for select using(public.ve_compras());
create policy ver_cumplimiento_fechas on public.cumplimiento_fechas for select using(public.ve_compras());
create policy ver_cumplimiento_historial on public.cumplimiento_historial for select using(public.ve_compras());
create policy ver_cumplimiento_avisos on public.cumplimiento_avisos_enviados for select using(public.ve_compras());
revoke all on public.cumplimiento_obligaciones,public.cumplimiento_fechas,public.cumplimiento_historial,public.cumplimiento_avisos_enviados from public,anon,authenticated;
grant select on public.cumplimiento_obligaciones,public.cumplimiento_fechas,public.cumplimiento_historial,public.cumplimiento_avisos_enviados to authenticated;

-- Única fuente de la regla. Semanal: cada 7 días desde el inicio. Quincenal: día 15 y último día de cada mes.
-- Mensual, bimestral y anual: el día del inicio cada 1, 2 o 12 meses (si el mes es más corto, su último día).
create function public.fechas_cumplimiento(p_obligacion uuid,p_desde date,p_hasta date) returns setof date
language sql stable set search_path='' as $$
 with o as (select * from public.cumplimiento_obligaciones where id=p_obligacion),
 meses as (
  select o.frecuencia,o.inicio,k,(date_trunc('month',o.inicio::timestamp)+make_interval(months=>k))::date m from o
  cross join lateral generate_series(0,greatest(0,((extract(year from p_hasta)-extract(year from o.inicio))*12+extract(month from p_hasta)-extract(month from o.inicio))::int)) k
  where o.frecuencia<>'semanal'),
 fechas as (
  select o.inicio+7*k d from o cross join lateral generate_series(0,greatest(0,(p_hasta-o.inicio)/7)) k where o.frecuencia='semanal'
  union all select m+14 from meses where frecuencia='quincenal'
  union all select (m+interval '1 month - 1 day')::date from meses where frecuencia='quincenal'
  union all select m+(least(extract(day from inicio)::int,extract(day from m+interval '1 month - 1 day')::int)-1) from meses
   where frecuencia in ('mensual','bimestral','anual') and k%(case frecuencia when 'mensual' then 1 when 'bimestral' then 2 else 12 end)=0)
 select f.d from fechas f cross join o where f.d>=o.inicio and (o.fin is null or f.d<=o.fin) and f.d between p_desde and p_hasta order by f.d
$$;

-- Días antes del vencimiento en que se avisa (0 = el mismo día).
create function public.dias_aviso_cumplimiento(p_frecuencia text) returns integer[]
language sql immutable set search_path='' as $$
 select case when p_frecuencia in ('semanal','quincenal') then array[2,0] when p_frecuencia='anual' then array[60,30,7,0] else array[7,2,0] end
$$;

create function public.guardar_obligacion(p_id uuid,p_revision integer,p_datos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.cumplimiento_obligaciones;n public.cumplimiento_obligaciones;v_fin date;v_pago boolean;
begin
 perform public.exigir_admin_compras();
 if jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k not in ('tipo','nombre','descripcion','autoridad','folio','notas','sucursal_id','razon_social_rfc','frecuencia','inicio','fin','con_pago','proveedor_id','monto_estimado')) then raise exception 'Datos inválidos.';end if;
 if exists(select 1 from jsonb_each_text(p_datos) e where length(e.value)>1000) then raise exception 'Texto demasiado largo.';end if;
 v_fin:=nullif(p_datos->>'fin','')::date;
 v_pago:=coalesce((p_datos->>'con_pago')::boolean,false);
 if p_id is null then
  insert into public.cumplimiento_obligaciones(tipo,nombre,descripcion,autoridad,folio,notas,sucursal_id,razon_social_rfc,frecuencia,inicio,fin,con_pago,proveedor_id,monto_estimado)
  values(p_datos->>'tipo',trim(p_datos->>'nombre'),nullif(trim(p_datos->>'descripcion'),''),nullif(trim(p_datos->>'autoridad'),''),nullif(trim(p_datos->>'folio'),''),nullif(trim(p_datos->>'notas'),''),
   nullif(p_datos->>'sucursal_id','')::uuid,nullif(p_datos->>'razon_social_rfc',''),p_datos->>'frecuencia',(p_datos->>'inicio')::date,v_fin,v_pago,
   case when v_pago then nullif(p_datos->>'proveedor_id','')::uuid end,case when v_pago then nullif(p_datos->>'monto_estimado','')::numeric end) returning * into n;
 else
  select * into a from public.cumplimiento_obligaciones where id=p_id for update;
  if not found then raise exception 'Obligación inexistente.';end if;
  if a.revision is distinct from p_revision then raise exception 'La obligación cambió. Recarga antes de guardar.';end if;
  if p_datos->>'tipo' is distinct from a.tipo or nullif(p_datos->>'sucursal_id','')::uuid is distinct from a.sucursal_id
   or nullif(p_datos->>'razon_social_rfc','') is distinct from a.razon_social_rfc or p_datos->>'frecuencia' is distinct from a.frecuencia
   or (p_datos->>'inicio')::date is distinct from a.inicio then
   raise exception 'Tipo, sucursal o razón social, frecuencia e inicio no cambian. Ponle fin a esta obligación y crea otra.';
  end if;
  if v_fin is not null and exists(select 1 from public.cumplimiento_fechas where obligacion_id=p_id and vence>v_fin and (estado<>'pendiente' or factura_id is not null)) then
   raise exception 'Hay fechas cumplidas, omitidas o con factura después del fin.';end if;
  if not v_pago and exists(select 1 from public.cumplimiento_fechas where obligacion_id=p_id and factura_id is not null) then
   raise exception 'Hay facturas ligadas. Quítalas antes de marcarla sin pago.';end if;
  update public.cumplimiento_obligaciones set nombre=trim(p_datos->>'nombre'),descripcion=nullif(trim(p_datos->>'descripcion'),''),autoridad=nullif(trim(p_datos->>'autoridad'),''),
   folio=nullif(trim(p_datos->>'folio'),''),notas=nullif(trim(p_datos->>'notas'),''),fin=v_fin,con_pago=v_pago,
   proveedor_id=case when v_pago then nullif(p_datos->>'proveedor_id','')::uuid end,monto_estimado=case when v_pago then nullif(p_datos->>'monto_estimado','')::numeric end,
   revision=revision+1 where id=p_id returning * into n;
 end if;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(n.id,case when p_id is null then 'Alta' else 'Actualización' end,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());
 return n.id;
end $$;

revoke all on function public.fechas_cumplimiento(uuid,date,date),public.dias_aviso_cumplimiento(text),public.guardar_obligacion(uuid,integer,jsonb) from public,anon;
grant execute on function public.fechas_cumplimiento(uuid,date,date),public.dias_aviso_cumplimiento(text),public.guardar_obligacion(uuid,integer,jsonb) to authenticated;

-- Fila de una fecha (la crea si aún no existe), bloqueada. Rechaza fechas que no salen de la regla.
create function public.fila_fecha_cumplimiento(p_obligacion uuid,p_vence date) returns public.cumplimiento_fechas
language plpgsql security definer set search_path='' as $$
declare r public.cumplimiento_fechas;
begin
 if not exists(select 1 from public.fechas_cumplimiento(p_obligacion,p_vence,p_vence)) then raise exception 'Esa fecha no corresponde a la obligación.';end if;
 insert into public.cumplimiento_fechas(obligacion_id,vence) values(p_obligacion,p_vence) on conflict(obligacion_id,vence) do nothing;
 select * into r from public.cumplimiento_fechas where obligacion_id=p_obligacion and vence=p_vence for update;
 return r;
end $$;

-- Evidencia (foto o PDF): mismo patrón preparar → subir → confirmar que compromiso_evidencias.
create table public.cumplimiento_evidencias (
 id uuid primary key, fecha_id uuid not null references public.cumplimiento_fechas(id),
 clase text not null check(clase in ('foto','documento')),
 nombre text not null check(length(nombre) between 1 and 200), ruta text not null unique,
 mime text not null check(mime in ('application/pdf','image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes between 1 and 4194304), sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 usuario_id uuid not null references public.perfiles(id), creado_en timestamptz not null default now(), confirmado_en timestamptz,
 check((clase='documento')=(mime='application/pdf'))
);
create index cumplimiento_evidencias_fecha on public.cumplimiento_evidencias(fecha_id,creado_en);
alter table public.cumplimiento_evidencias enable row level security;
revoke all on public.cumplimiento_evidencias from public,anon,authenticated;
grant select on public.cumplimiento_evidencias to authenticated;
create policy ver_cumplimiento_evidencias on public.cumplimiento_evidencias for select to authenticated using(public.ve_compras() and (confirmado_en is not null or usuario_id=auth.uid() and public.edita_compras()));
create policy cumplimiento_evidencias_lectura on storage.objects for select to authenticated using(bucket_id='adjuntos-compras' and public.ve_compras() and exists(select 1 from public.cumplimiento_evidencias e where e.ruta=name));
create policy cumplimiento_evidencias_subir on storage.objects for insert to authenticated with check(bucket_id='adjuntos-compras' and public.edita_compras() and exists(select 1 from public.cumplimiento_evidencias e where e.ruta=name and e.usuario_id=auth.uid() and e.confirmado_en is null and e.creado_en>now()-interval '1 day'));

create function public.preparar_evidencia_cumplimiento(p_id uuid,p_obligacion uuid,p_vence date,p_nombre text,p_extension text,p_mime text,p_bytes integer,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.cumplimiento_fechas;v public.cumplimiento_evidencias;ruta_nueva text;mime_esperado text;
begin
 perform public.exigir_admin_compras();
 if p_id is null or p_nombre is null or length(trim(p_nombre)) not between 1 and 200 or p_nombre~'[[:cntrl:]/\\]' or p_bytes is null or p_bytes not between 1 and 4194304 or p_sha256 is null or p_sha256!~'^[0-9a-f]{64}$' then raise exception 'Datos de archivo inválidos.';end if;
 mime_esperado:=case p_extension when 'pdf' then 'application/pdf' when 'jpg' then 'image/jpeg' when 'png' then 'image/png' when 'webp' then 'image/webp' end;
 if mime_esperado is null or p_mime is distinct from mime_esperado then raise exception 'La evidencia debe ser PDF o foto.';end if;
 if not exists(select 1 from public.cumplimiento_obligaciones where id=p_obligacion) then raise exception 'Obligación inexistente.';end if;
 r:=public.fila_fecha_cumplimiento(p_obligacion,p_vence);
 if r.estado='omitida' then raise exception 'La fecha está omitida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('evidencia-cumplimiento:'||p_id::text,0));
 ruta_nueva:='cumplimiento/'||r.id::text||'/'||p_id::text||'.'||p_extension;
 select * into v from public.cumplimiento_evidencias where id=p_id;
 if found then
  if v.usuario_id<>auth.uid() or v.ruta<>ruta_nueva or v.sha256<>p_sha256 or v.bytes<>p_bytes then raise exception 'Esta solicitud ya corresponde a otro archivo.';end if;
 else
  insert into public.cumplimiento_evidencias(id,fecha_id,clase,nombre,ruta,mime,bytes,sha256,usuario_id)
  values(p_id,r.id,case when p_mime='application/pdf' then 'documento' else 'foto' end,trim(p_nombre),ruta_nueva,p_mime,p_bytes,p_sha256,auth.uid()) returning * into v;
 end if;
 return jsonb_build_object('ruta',v.ruta,'disponible',v.confirmado_en is not null);
end $$;

create function public.confirmar_evidencia_cumplimiento(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.cumplimiento_evidencias;
begin
 perform public.exigir_admin_compras();
 select * into v from public.cumplimiento_evidencias where id=p_id for update;
 if not found or v.usuario_id<>auth.uid() then raise exception 'Evidencia no encontrada.';end if;
 if v.confirmado_en is not null then return;end if;
 if not exists(select 1 from storage.objects o where o.bucket_id='adjuntos-compras' and o.name=v.ruta and (o.metadata->>'size')::bigint=v.bytes and o.metadata->>'mimetype'=v.mime) then raise exception 'El archivo no está subido o no coincide con la reserva.';end if;
 update public.cumplimiento_evidencias set confirmado_en=now() where id=p_id;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id)
  select f.obligacion_id,'Evidencia','{}'::jsonb,jsonb_build_object('nombre',v.nombre,'clase',v.clase,'fecha',f.vence),auth.uid() from public.cumplimiento_fechas f where f.id=v.fecha_id;
end $$;

create function public.cerrar_fecha_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_fecha date,p_nota text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.cumplimiento_fechas;n public.cumplimiento_fechas;
begin
 perform public.exigir_admin_compras();
 perform 1 from public.cumplimiento_obligaciones where id=p_obligacion for update;
 if not found then raise exception 'Obligación inexistente.';end if;
 if p_fecha is null or p_fecha>public.hoy_mx() then raise exception 'Indica cuándo se cumplió; no puede ser una fecha futura.';end if;
 if length(trim(coalesce(p_nota,'')))<5 then raise exception 'Escribe qué se hizo (al menos 5 letras).';end if;
 r:=public.fila_fecha_cumplimiento(p_obligacion,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if r.estado='omitida' then raise exception 'La fecha está omitida.';end if;
 if r.estado='cumplida' then raise exception 'La fecha ya está cumplida.';end if;
 if not exists(select 1 from public.cumplimiento_evidencias e where e.fecha_id=r.id and e.clase='foto' and e.confirmado_en is not null)
  or not exists(select 1 from public.cumplimiento_evidencias e where e.fecha_id=r.id and e.clase='documento' and e.confirmado_en is not null) then
  raise exception 'Sube al menos una foto y un documento PDF antes de cerrarla.';end if;
 update public.cumplimiento_fechas set estado='cumplida',cumplida_fecha=p_fecha,nota=trim(p_nota),revision=revision+1 where id=r.id returning * into n;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(p_obligacion,'Cumplida',to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create function public.omitir_fecha_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.cumplimiento_fechas;n public.cumplimiento_fechas;v_motivo text:=nullif(trim(coalesce(p_motivo,'')),'');
begin
 perform public.exigir_admin_compras();
 if not exists(select 1 from public.cumplimiento_obligaciones where id=p_obligacion) then raise exception 'Obligación inexistente.';end if;
 if v_motivo is not null and length(v_motivo)<5 then raise exception 'Escribe el motivo (al menos 5 letras).';end if;
 r:=public.fila_fecha_cumplimiento(p_obligacion,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if r.estado='cumplida' then raise exception 'La fecha ya está cumplida.';end if;
 if r.factura_id is not null then raise exception 'La fecha ya tiene factura. Quítala antes de omitirla.';end if;
 update public.cumplimiento_fechas set estado=case when v_motivo is null then 'pendiente' else 'omitida' end,omitida_motivo=v_motivo,revision=revision+1 where id=r.id returning * into n;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(p_obligacion,case when v_motivo is null then 'Omisión quitada' else 'Fecha omitida' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create function public.ligar_factura_cumplimiento(p_obligacion uuid,p_vence date,p_revision integer,p_factura uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.cumplimiento_obligaciones;r public.cumplimiento_fechas;n public.cumplimiento_fechas;f public.facturas;
begin
 perform public.exigir_admin_compras();
 select * into o from public.cumplimiento_obligaciones where id=p_obligacion for update;
 if not found then raise exception 'Obligación inexistente.';end if;
 r:=public.fila_fecha_cumplimiento(p_obligacion,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if p_factura is not null then
  if not o.con_pago then raise exception 'Esta obligación no lleva pago.';end if;
  if r.estado='omitida' then raise exception 'La fecha está omitida. Quita la omisión antes de ligar la factura.';end if;
  select * into f from public.facturas where id=p_factura for update;
  if not found or f.tipo<>'ingreso' or f.estado='cancelada' then raise exception 'Elige una factura vigente.';end if;
  if f.proveedor_id<>o.proveedor_id then raise exception 'La factura debe ser del proveedor de la obligación.';end if;
  if o.sucursal_id is not null and f.sucursal_id is distinct from o.sucursal_id then raise exception 'La factura debe ser de la sucursal de la obligación.';end if;
  if o.razon_social_rfc is not null and f.rfc_receptor is distinct from o.razon_social_rfc then raise exception 'La factura debe ser de la razón social de la obligación.';end if;
  if exists(select 1 from public.cumplimiento_fechas where factura_id=p_factura and id<>r.id) or exists(select 1 from public.compromiso_fechas where factura_id=p_factura) then
   raise exception 'Esa factura ya está ligada a otra fecha.';end if;
 end if;
 update public.cumplimiento_fechas set factura_id=p_factura,revision=revision+1 where id=r.id returning * into n;
 insert into public.cumplimiento_historial(obligacion_id,evento,anterior,nuevo,usuario_id) values(p_obligacion,case when p_factura is null then 'Factura quitada' else 'Factura ligada' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

-- Cuando un gasto sin CFDI ligado se sustituye por su CFDI, la liga pasa al CFDI (si el CFDI no está ligado ya).
create function public.cumplimiento_sigue_sustitucion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.cumplimiento_fechas set factura_id=new.sustituido_por,revision=revision+1
  where factura_id=new.id and not exists(select 1 from public.cumplimiento_fechas x where x.factura_id=new.sustituido_por)
   and not exists(select 1 from public.compromiso_fechas x where x.factura_id=new.sustituido_por);
 return new;
end $$;
create trigger cumplimiento_sustitucion after update of sustituido_por on public.facturas
 for each row when (new.sustituido_por is not null and old.sustituido_por is distinct from new.sustituido_por)
 execute function public.cumplimiento_sigue_sustitucion();

-- Una factura va a una sola fecha, sea de compromiso o de cumplimiento: los compromisos también revisan cumplimiento_fechas.
-- Mismo cuerpo que en 20261028180000_compromisos_recurrentes.sql (create or replace conserva los permisos).
create or replace function public.ligar_factura_compromiso(p_compromiso uuid,p_vence date,p_revision integer,p_factura uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c public.compromisos;r public.compromiso_fechas;n public.compromiso_fechas;f public.facturas;
begin
 perform public.exigir_admin_compras();
 select * into c from public.compromisos where id=p_compromiso for update;
 if not found then raise exception 'Compromiso inexistente.';end if;
 r:=public.fila_fecha_compromiso(p_compromiso,p_vence);
 if r.revision is distinct from p_revision then raise exception 'La fecha cambió. Recarga antes de guardar.';end if;
 if p_factura is not null then
  if r.omitida_motivo is not null then raise exception 'La fecha está omitida. Quita la omisión antes de ligar la factura.';end if;
  select * into f from public.facturas where id=p_factura for update;
  if not found or f.tipo<>'ingreso' or f.estado='cancelada' then raise exception 'Elige una factura vigente.';end if;
  if f.proveedor_id<>c.proveedor_id or f.sucursal_id is distinct from c.sucursal_id then raise exception 'La factura debe ser del mismo proveedor y sucursal del compromiso.';end if;
  if exists(select 1 from public.compromiso_fechas where factura_id=p_factura and id<>r.id) or exists(select 1 from public.cumplimiento_fechas where factura_id=p_factura) then
   raise exception 'Esa factura ya está ligada a otra fecha.';end if;
 end if;
 update public.compromiso_fechas set factura_id=p_factura,revision=revision+1 where id=r.id returning * into n;
 insert into public.compromiso_historial(compromiso_id,evento,anterior,nuevo,usuario_id) values(p_compromiso,case when p_factura is null then 'Factura quitada' else 'Factura ligada' end,to_jsonb(r),to_jsonb(n),auth.uid());
end $$;

create or replace function public.compromiso_sigue_sustitucion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update public.compromiso_fechas set factura_id=new.sustituido_por,revision=revision+1
  where factura_id=new.id and not exists(select 1 from public.compromiso_fechas x where x.factura_id=new.sustituido_por)
   and not exists(select 1 from public.cumplimiento_fechas x where x.factura_id=new.sustituido_por);
 return new;
end $$;

revoke all on function public.fila_fecha_cumplimiento(uuid,date),public.cumplimiento_sigue_sustitucion() from public,anon,authenticated;
revoke all on function public.preparar_evidencia_cumplimiento(uuid,uuid,date,text,text,text,integer,text),public.confirmar_evidencia_cumplimiento(uuid),
 public.cerrar_fecha_cumplimiento(uuid,date,integer,date,text),public.omitir_fecha_cumplimiento(uuid,date,integer,text),public.ligar_factura_cumplimiento(uuid,date,integer,uuid) from public,anon;
grant execute on function public.preparar_evidencia_cumplimiento(uuid,uuid,date,text,text,text,integer,text),public.confirmar_evidencia_cumplimiento(uuid),
 public.cerrar_fecha_cumplimiento(uuid,date,integer,date,text),public.omitir_fecha_cumplimiento(uuid,date,integer,text),public.ligar_factura_cumplimiento(uuid,date,integer,uuid) to authenticated;
-- Lo que leen el calendario, las alertas y los avisos: los tres orígenes con un estado común.
-- Compromisos: solo los que comprueban servicio (fumigación, basura, trampas); la renta se queda en Pagos.
create function public.cumplimiento_en_rango(p_desde date,p_hasta date,p_hoy date)
returns table(origen text,referencia_id uuid,fecha_id uuid,revision integer,titulo text,detalle text,tipo text,sucursal_id uuid,razon_social_rfc text,ambito text,
 vence date,fecha date,frecuencia text,estado text,falta_evidencia boolean,falta_factura boolean,factura_id uuid,ruta text)
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
begin
 if p_desde is null or p_hasta is null or p_hoy is null or p_hasta<p_desde or p_hasta-p_desde>800 then raise exception 'Rango de fechas inválido.';end if;
 return query
 select 'obligacion'::text,o.id,f.id,coalesce(f.revision,0),o.nombre,coalesce(o.autoridad,''),o.tipo,o.sucursal_id,o.razon_social_rfc,coalesce(s.nombre,rs.razon_social),
  v.d,case when f.estado='cumplida' then f.cumplida_fecha else v.d end,o.frecuencia,
  case when f.estado='omitida' then 'omitida'
   when f.estado='cumplida' and o.con_pago and (f.factura_id is null or fs.estado::text='cancelada') then 'cumplida_sin_factura'
   when f.estado='cumplida' then 'cumplida'
   when v.d<p_hoy then 'vencida'
   when v.d-p_hoy<=(public.dias_aviso_cumplimiento(o.frecuencia))[1] then 'por_vencer'
   else 'pendiente' end,
  false,
  o.con_pago and coalesce(f.estado,'pendiente')<>'omitida' and (f.factura_id is null or fs.estado::text='cancelada'),
  f.factura_id,'/cumplimiento/'||o.id||'#fecha-'||v.d
 from public.cumplimiento_obligaciones o
 cross join lateral public.fechas_cumplimiento(o.id,p_desde,p_hasta) v(d)
 left join public.cumplimiento_fechas f on f.obligacion_id=o.id and f.vence=v.d
 left join public.facturas_saldo fs on fs.id=f.factura_id
 left join public.sucursales s on s.id=o.sucursal_id
 left join public.razones_sociales rs on rs.rfc=o.razon_social_rfc
 union all
 select 'compromiso',c.id,r.fecha_id,r.revision,
  case when c.concepto='otro' and c.descripcion is not null then c.descripcion
   else case c.concepto when 'fumigacion' then 'Fumigación' when 'basura' then 'Recolección de basura' when 'trampas_grasa' then 'Limpieza de trampas de grasa' when 'renta' then 'Renta' else 'Otro' end end,
  'Compromiso fijo',c.concepto,c.sucursal_id,null::text,s.nombre,r.vence,
  case when r.servicio='realizado' then r.servicio_fecha else r.vence end,q.frecuencia,
  case when r.omitida_motivo is not null or r.servicio='no_realizado' then 'omitida'
   when r.servicio='realizado' and (r.factura_id is null or r.factura_estado='cancelada') then 'cumplida_sin_factura'
   when r.servicio='realizado' then 'cumplida'
   when r.vence<p_hoy then 'vencida'
   when r.vence-p_hoy<=(public.dias_aviso_cumplimiento(q.frecuencia))[1] then 'por_vencer'
   else 'pendiente' end,
  r.servicio='realizado' and not exists(select 1 from public.compromiso_evidencias e where e.fecha_id=r.fecha_id and e.confirmado_en is not null),
  r.omitida_motivo is null and r.servicio<>'no_realizado' and (r.factura_id is null or r.factura_estado='cancelada'),
  r.factura_id,'/compras/pagos/compromisos/'||c.id||'#fecha-'||r.vence
 from public.compromisos_en_rango(p_desde,p_hasta) r
 join public.compromisos c on c.id=r.compromiso_id
 cross join lateral (select case when c.unidad='semana' then case when c.cada=1 then 'semanal' else 'quincenal' end
  when c.cada=1 then 'mensual' when c.cada<12 then 'bimestral' else 'anual' end) q(frecuencia)
 left join public.sucursales s on s.id=c.sucursal_id
 where c.requiere_servicio
 union all
 select 'mantenimiento',m.id,null::uuid,m.revision,a.nombre,m.tarea,m.tipo,a.sucursal_id,null::text,s.nombre,m.programado,
  case when m.estado='completado' then m.realizado else m.programado end,null::text,
  case when m.estado='anulado' then 'omitida' when m.estado='completado' then 'cumplida'
   when m.programado<p_hoy then 'vencida'
   when m.programado-p_hoy<=(public.dias_aviso_cumplimiento('mensual'))[1] then 'por_vencer'
   else 'pendiente' end,
  false,false,null::uuid,'/activos/'||a.id||'#servicio-'||m.id
 from public.activo_mantenimientos m
 join public.activos a on a.id=m.activo_id
 left join public.sucursales s on s.id=a.sucursal_id
 where (case when m.estado='completado' then m.realizado else m.programado end) between p_desde and p_hasta;
end $$;

-- Lo que toca avisar hoy por un canal: vencidas y cumplidas sin factura cada día; por vencer solo en los días de
-- anticipación de su frecuencia. Excluye lo ya entregado por ese canal hoy. Ventana: lo que muestran las pantallas, 12 meses
-- atrás (calendario) y 3 meses para compromisos (su ficha), hasta 61 días adelante (el aviso anual más lejano es a 60).
create function public.avisos_cumplimiento(p_hoy date,p_canal text)
returns table(clave text,origen text,referencia_id uuid,titulo text,detalle text,ambito text,vence date,tipo_aviso text,dias integer,ruta text)
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
begin
 perform public.exigir_admin_compras();
 if p_hoy is null or p_canal is null or p_canal not in ('correo','chat') then raise exception 'Datos inválidos.';end if;
 return query
 select x.clave,x.origen,x.referencia_id,x.titulo,x.detalle,x.ambito,x.vence,x.tipo_aviso,x.dias,x.ruta from (
  select concat_ws(':',r.origen,r.referencia_id,r.vence,t.tipo_aviso,p_hoy) clave,r.origen,r.referencia_id,r.titulo,r.detalle,r.ambito,r.vence,t.tipo_aviso,(r.vence-p_hoy) dias,r.ruta
  from public.cumplimiento_en_rango((p_hoy-interval '12 months')::date,p_hoy+61,p_hoy) r
  cross join lateral (select case when r.estado='vencida' then 'vencida' when r.estado='cumplida_sin_factura' then 'sin_factura'
   when r.estado='por_vencer' and (r.vence-p_hoy)=any(public.dias_aviso_cumplimiento(coalesce(r.frecuencia,'mensual'))) then 'por_vencer' end) t(tipo_aviso)
  where t.tipo_aviso is not null and (r.origen<>'compromiso' or r.vence>=(p_hoy-interval '3 months')::date)) x
 where not exists(select 1 from public.cumplimiento_avisos_enviados e where e.clave=x.clave and e.canal=p_canal)
 order by case x.tipo_aviso when 'vencida' then 0 when 'por_vencer' then 1 else 2 end,x.vence,x.titulo;
end $$;

create function public.registrar_avisos_cumplimiento(p_claves text[],p_canal text) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 perform public.exigir_admin_compras();
 if p_canal is null or p_canal not in ('correo','chat') then raise exception 'Canal inválido.';end if;
 if p_claves is null or cardinality(p_claves) not between 1 and 500 then raise exception 'Envía de 1 a 500 claves.';end if;
 if exists(select 1 from unnest(p_claves) c where c is null or c!~'^(obligacion|compromiso|mantenimiento):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]{4}-[0-9]{2}-[0-9]{2}:(vencida|por_vencer|sin_factura):[0-9]{4}-[0-9]{2}-[0-9]{2}$') then
  raise exception 'Clave de aviso inválida.';end if;
 insert into public.cumplimiento_avisos_enviados(clave,canal,origen,referencia_id,vence,tipo_aviso,enviado_el,usuario_id)
 select distinct c,p_canal,split_part(c,':',1),split_part(c,':',2)::uuid,split_part(c,':',3)::date,split_part(c,':',4),split_part(c,':',5)::date,auth.uid()
 from unnest(p_claves) c
 on conflict(clave,canal) do nothing;
 get diagnostics n=row_count;
 return n;
end $$;

-- Correos de los administradores activos (viven en auth.users; la app no los lee directo).
create function public.correos_avisos_cumplimiento() returns setof text
language plpgsql security definer set search_path='' as $$
begin
 perform public.exigir_admin_compras();
 return query select u.email::text from auth.users u join public.perfiles p on p.id=u.id
  where p.activo and p.rol::text='admin' and u.email is not null order by 1;
end $$;

revoke all on function public.cumplimiento_en_rango(date,date,date),public.avisos_cumplimiento(date,text),public.registrar_avisos_cumplimiento(text[],text),public.correos_avisos_cumplimiento() from public,anon;
grant execute on function public.cumplimiento_en_rango(date,date,date),public.avisos_cumplimiento(date,text),public.registrar_avisos_cumplimiento(text[],text),public.correos_avisos_cumplimiento() to authenticated;
commit;
