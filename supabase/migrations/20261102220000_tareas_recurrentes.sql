-- Tareas recurrentes: una tarea manual puede repetirse cada semana o cada mes. Al cerrarla (hecho o cancelada) sale sola la
-- siguiente con la misma persona, prioridad, título, descripción y sucursal (sin documento) y el vencimiento corrido a la
-- próxima fecha que no haya pasado. Cancelar con «dejar de repetir» corta la serie; editar la tarea abierta también.
-- Requiere 20261102120000_tareas.sql y 20261102200000_tareas_automaticas.sql.
begin;
set local lock_timeout = '5s';
alter table public.tareas
 add column repite text check(repite in ('semanal','mensual')),
 -- Día del mes que se respeta en las mensuales: un 31 cae al último día de los meses cortos y regresa al 31 después.
 add column repite_dia smallint check(repite_dia between 1 and 31),
 add column anterior_id uuid references public.tareas(id),
 add constraint tareas_repite_vence check(repite is null or vence is not null),
 add constraint tareas_repite_dia check(coalesce(repite='mensual',false)=(repite_dia is not null)),
 add constraint tareas_repite_manual check(repite is null or origen='manual');
-- Cada tarea tiene a lo más una siguiente.
create unique index tareas_anterior on public.tareas(anterior_id) where anterior_id is not null;

-- El historial también anota cuándo se prende, cambia o apaga la repetición.
create or replace function public.registrar_historial_tarea() returns trigger
language plpgsql security definer set search_path='' as $$
declare c text;a text;d text;
begin
 if tg_op='INSERT' then
  insert into public.tarea_historial(tarea_id,usuario_id,campo,antes,despues) values(new.id,auth.uid(),'creada',null,new.estado::text);
  return new;
 end if;
 foreach c in array array['estado','prioridad','vence','asignado_a','titulo','descripcion','repite'] loop
  a:=to_jsonb(old)->>c;d:=to_jsonb(new)->>c;
  if a is distinct from d then insert into public.tarea_historial(tarea_id,usuario_id,campo,antes,despues) values(new.id,auth.uid(),c,a,d);end if;
 end loop;
 return new;
end $$;

-- Un periodo después de p_vence, y otro más mientras la fecha ya haya pasado (hoy cuenta como no pasada).
create function public.siguiente_vence(p_vence date,p_repite text,p_dia smallint,p_hoy date) returns date
language plpgsql immutable set search_path='' as $$
declare k integer:=1;mes date;n date;
begin
 loop
  if p_repite='semanal' then n:=p_vence+7*k;
  else
   mes:=(date_trunc('month',p_vence)+make_interval(months=>k))::date;
   n:=mes+least(p_dia,extract(day from (mes+interval '1 month'-interval '1 day'))::integer)-1;
  end if;
  exit when n>=p_hoy;
  k:=k+1;
 end loop;
 return n;
end $$;

create function public.crear_siguiente_tarea() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.tareas(titulo,descripcion,prioridad,vence,asignado_a,creado_por,sucursal_id,repite,repite_dia,anterior_id)
 values(new.titulo,new.descripcion,new.prioridad,public.siguiente_vence(new.vence,new.repite,new.repite_dia,public.hoy_mx()),
  new.asignado_a,new.creado_por,new.sucursal_id,new.repite,new.repite_dia,new.id)
 on conflict (anterior_id) where anterior_id is not null do nothing;
 return null;
end $$;
create trigger tareas_siguiente after update of estado on public.tareas for each row
 when (new.repite is not null and new.estado in ('hecho','cancelada') and old.estado not in ('hecho','cancelada'))
 execute function public.crear_siguiente_tarea();

create or replace function public.error_datos_tarea(p_datos jsonb,p_permitidas text[]) returns text
language sql immutable set search_path='' as $$
 select case
  when jsonb_typeof(p_datos) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_datos) k where k<>all(p_permitidas)) then 'Datos de tarea inválidos.'
  when length(trim(coalesce(p_datos->>'titulo',''))) not between 3 and 200 then 'El título debe tener de 3 a 200 caracteres.'
  when length(coalesce(p_datos->>'descripcion',''))>4000 then 'La descripción es demasiado larga (máximo 4000 caracteres).'
  when coalesce(nullif(p_datos->>'prioridad',''),'media') not in ('alta','media','baja') then 'Prioridad inválida.'
  when coalesce(p_datos->>'vence','')<>'' and not public.es_fecha_iso(p_datos->>'vence') then 'La fecha de vencimiento no es válida.'
  when coalesce(p_datos->>'repite','') not in ('','semanal','mensual') then 'Repetición inválida.'
  when coalesce(p_datos->>'repite','')<>'' and coalesce(p_datos->>'vence','')='' then 'Para que se repita, ponle fecha de vencimiento.'
  when coalesce(p_datos->>'documento_id','')<>'' and p_datos->>'documento_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'El documento ligado está incompleto.'
  when coalesce(p_datos->>'sucursal_id','')<>'' and p_datos->>'sucursal_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'Sucursal inválida.'
  when coalesce(p_datos->>'asignado_a','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then 'Esa persona no puede recibir esta tarea.'
 end
$$;

create or replace function public.crear_tarea(p_datos jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare r text:=public.mi_rol()::text;tipo text;doc uuid;d record;vs uuid;vf date;txt text;s uuid;asignado uuid;n bigint;msg text;rep text;
begin
 if r is null then raise exception 'Tu usuario no está activo.';end if;
 if r='corporativo' then raise exception 'Corporativo solo puede consultar.';end if;
 if r not in ('admin','gerente','encargado') then raise exception 'Tu puesto no puede crear tareas.';end if;
 msg:=public.error_datos_tarea(p_datos,array['titulo','descripcion','prioridad','vence','asignado_a','sucursal_id','documento_tipo','documento_id','repite']);
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
 rep:=nullif(p_datos->>'repite','');
 insert into public.tareas(titulo,descripcion,prioridad,vence,asignado_a,creado_por,sucursal_id,
   orden_id,factura_id,ventas_sucursal_id,ventas_fecha,apertura_proyecto_id,apertura_item_id,documento_texto,repite,repite_dia)
 values(trim(p_datos->>'titulo'),nullif(trim(coalesce(p_datos->>'descripcion','')),''),coalesce(nullif(p_datos->>'prioridad',''),'media')::public.prioridad_tarea,
   nullif(p_datos->>'vence','')::date,asignado,auth.uid(),s,
   case when tipo='orden' then doc end,case when tipo='factura' then doc end,vs,vf,
   case when tipo='apertura_proyecto' then doc end,case when tipo='apertura_item' then doc end,txt,
   rep,case when rep='mensual' then extract(day from (p_datos->>'vence')::date)::smallint end)
 returning numero into n;
 return n;
end $$;

-- Reemplaza los seis campos: quien llame debe mandar titulo, descripcion, prioridad, vence, asignado_a y repite
-- (los ausentes se borran; prioridad vuelve a 'media' y la tarea deja de repetirse).
create or replace function public.actualizar_tarea(p_numero bigint,p_revision integer,p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare t public.tareas;msg text;rep text:=nullif(p_datos->>'repite','');
begin
 t:=public.tarea_para_escribir(p_numero,p_revision);
 if p_revision is null then raise exception 'La tarea cambió mientras la veías. Recarga e intenta de nuevo.';end if;
 if not public.administra_tarea(t) then raise exception 'Solo quien creó la tarea, su gerente o un admin pueden editarla.';end if;
 if t.estado::text in ('hecho','cancelada') then raise exception 'La tarea ya está cerrada.';end if;
 msg:=public.error_datos_tarea(p_datos,array['titulo','descripcion','prioridad','vence','asignado_a','repite']);
 if msg is not null then raise exception '%',msg;end if;
 if rep is not null and t.origen<>'manual' then raise exception 'Las tareas automáticas no se repiten.';end if;
 if (p_datos->>'asignado_a')::uuid<>t.asignado_a
   and not exists(select 1 from public.personas_asignables(t.sucursal_id) x where x.id=(p_datos->>'asignado_a')::uuid) then
  raise exception 'Esa persona no puede recibir esta tarea.';
 end if;
 update public.tareas set titulo=trim(p_datos->>'titulo'),descripcion=nullif(trim(coalesce(p_datos->>'descripcion','')),''),
  prioridad=coalesce(nullif(p_datos->>'prioridad',''),'media')::public.prioridad_tarea,vence=nullif(p_datos->>'vence','')::date,
  asignado_a=(p_datos->>'asignado_a')::uuid,repite=rep,repite_dia=case when rep='mensual' then extract(day from (p_datos->>'vence')::date)::smallint end,
  revision=revision+1,actualizada_en=now()
 where id=t.id;
end $$;

-- Ahora devuelve el número de la siguiente tarea (null si no se repite). p_detener, al cancelar, corta la serie.
-- Con default para que la pantalla anterior (cuatro parámetros) siga funcionando mientras se publica la nueva.
drop function public.mover_tarea(bigint,integer,text,text);
create function public.mover_tarea(p_numero bigint,p_revision integer,p_estado text,p_comentario text,p_detener boolean default false) returns bigint
language plpgsql security definer set search_path='' as $$
declare t public.tareas;paso text;manda boolean;nota text:=trim(coalesce(p_comentario,''));corta boolean;
begin
 t:=public.tarea_para_escribir(p_numero,p_revision);
 if p_revision is null then raise exception 'La tarea cambió mientras la veías. Recarga e intenta de nuevo.';end if;
 if p_estado is null or p_estado not in ('por_hacer','en_curso','en_revision','hecho','cancelada') then raise exception 'No puedes hacer ese cambio de estado.';end if;
 paso:=t.estado::text||'>'||coalesce(p_estado,'');
 manda:=public.administra_tarea(t);
 if not ((paso in ('por_hacer>en_curso','por_hacer>en_revision','en_curso>en_revision') and (manda or t.asignado_a=auth.uid()))
   or (manda and (paso in ('en_revision>hecho','en_revision>en_curso') or (p_estado='cancelada' and t.estado::text not in ('hecho','cancelada'))))) then
  raise exception 'No puedes hacer ese cambio de estado.';
 end if;
 if paso='en_revision>en_curso' and length(nota)<5 then raise exception 'Para regresar la tarea escribe qué falta (al menos 5 caracteres).';end if;
 if p_estado='cancelada' and length(nota)<5 then raise exception 'Escribe el motivo de la cancelación (al menos 5 caracteres).';end if;
 if length(nota)>4000 then raise exception 'El comentario es demasiado largo (máximo 4000 caracteres).';end if;
 if p_estado='cancelada' and length(nota)>1000 then raise exception 'El motivo de cancelación es demasiado largo (máximo 1000 caracteres).';end if;
 corta:=p_estado='cancelada' and coalesce(p_detener,false);
 -- Si corta, repite queda en null en el mismo update y el trigger tareas_siguiente no crea la siguiente.
 update public.tareas set estado=p_estado::public.estado_tarea,revision=revision+1,actualizada_en=now(),
  cerrada_en=case when p_estado in ('hecho','cancelada') then now() end,
  motivo_cierre=case when p_estado='cancelada' then nota else motivo_cierre end,
  repite=case when corta then null else repite end,repite_dia=case when corta then null else repite_dia end
 where id=t.id;
 if nota<>'' then insert into public.tarea_comentarios(tarea_id,autor_id,texto) values(t.id,auth.uid(),nota);end if;
 return (select x.numero from public.tareas x where x.anterior_id=t.id);
end $$;

-- Igual que antes, más la repetición y de qué tarea viene y cuál sigue.
drop function public.tareas_visibles(bigint,uuid);
create function public.tareas_visibles(p_numero bigint default null,p_documento uuid default null)
returns table(id uuid,numero bigint,titulo text,descripcion text,estado text,prioridad text,vence date,
 asignado_a uuid,asignado text,asignado_activo boolean,creado_por uuid,creador text,sucursal_id uuid,sucursal text,origen text,
 documento_tipo text,documento_id uuid,documento_texto text,documento_ruta text,documento_anulado boolean,
 motivo_cierre text,revision integer,creada_en timestamptz,actualizada_en timestamptz,cerrada_en timestamptz,
 repite text,anterior_numero bigint,siguiente_numero bigint)
language sql stable security definer set search_path='' as $$
 select t.id,t.numero,t.titulo,t.descripcion,t.estado::text,t.prioridad::text,t.vence,
  t.asignado_a,a.nombre,a.activo,t.creado_por,c.nombre,t.sucursal_id,s.nombre,t.origen,
  x.tipo,x.doc,t.documento_texto,d.ruta,coalesce(d.anulado,false),
  t.motivo_cierre,t.revision,t.creada_en,t.actualizada_en,t.cerrada_en,
  t.repite,(select p.numero from public.tareas p where p.id=t.anterior_id),(select n.numero from public.tareas n where n.anterior_id=t.id)
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

revoke all on function public.siguiente_vence(date,text,smallint,date),public.crear_siguiente_tarea() from public,anon,authenticated;
revoke all on function public.mover_tarea(bigint,integer,text,text,boolean),public.tareas_visibles(bigint,uuid) from public,anon;
grant execute on function public.mover_tarea(bigint,integer,text,text,boolean),public.tareas_visibles(bigint,uuid) to authenticated;
commit;
