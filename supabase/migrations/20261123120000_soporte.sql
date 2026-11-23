-- Help Desk: tickets de problemas y mejoras del sistema que levanta cualquier puesto y atiende soporte (admin).
-- Toda escritura pasa por funciones. Cada quien ve sus tickets; admin ve todos. Los avisos por correo quedan en
-- soporte_avisos y los recoge n8n (/api/soporte/avisos). novedad_soporte/novedad_reporta contra soporte_lecturas
-- dan los contadores de "sin leer".
begin;
set local lock_timeout = '5s';
create type public.tipo_ticket as enum ('problema','mejora');
create type public.estado_ticket as enum ('nuevo','en_revision','en_progreso','resuelto','descartado');
create sequence public.soporte_tickets_numero;

-- Una sola fila. El responsable inicial es Sebastián si su usuario admin ya existe con ese correo.
create table public.soporte_ajustes (
 id boolean primary key default true check(id),
 responsable_default uuid references public.perfiles(id),
 correos text[] not null default array['scervera@dodopizza.mx']::text[] check(cardinality(correos)<=10),
 avisar_nuevos boolean not null default true,
 avisar_comentarios boolean not null default true,
 actualizado_en timestamptz not null default now()
);
insert into public.soporte_ajustes(responsable_default)
 select (select p.id from public.perfiles p join auth.users u on u.id=p.id
  where lower(u.email)='scervera@dodopizza.mx' and p.rol::text='admin' and p.activo limit 1);

create table public.soporte_tickets (
 id uuid primary key default gen_random_uuid(),
 numero bigint not null unique default nextval('public.soporte_tickets_numero'),
 tipo public.tipo_ticket not null,
 estado public.estado_ticket not null default 'nuevo',
 prioridad public.prioridad_tarea not null,
 titulo text not null check(length(trim(titulo)) between 5 and 150),
 descripcion text not null check(length(trim(descripcion)) between 10 and 4000),
 seccion text not null check(length(trim(seccion)) between 1 and 60),
 ruta_origen text check(ruta_origen ~ '^/' and length(ruta_origen)<=300),
 bloquea boolean not null default false,
 captura text unique check(length(captura)<=200),
 creado_por uuid not null references public.perfiles(id),
 rol_creador text not null,
 sucursal_id uuid references public.sucursales(id),
 responsable uuid references public.perfiles(id),
 revision integer not null default 1,
 -- Última novedad que le toca ver a soporte (alta, comentario de quien reporta) y a quien reporta (respuesta o cambio de estado).
 novedad_soporte timestamptz not null default now(),
 novedad_reporta timestamptz,
 creado_en timestamptz not null default now(),
 actualizado_en timestamptz not null default now(),
 cerrado_en timestamptz,
 check((estado in ('resuelto','descartado'))=(cerrado_en is not null)),
 check(tipo='problema' or not bloquea)
);
create index soporte_tickets_creador on public.soporte_tickets(creado_por);
create index soporte_tickets_estado on public.soporte_tickets(estado);

create table public.soporte_comentarios (
 id bigint generated always as identity primary key,
 ticket_id uuid not null references public.soporte_tickets(id) on delete cascade,
 autor_id uuid not null references public.perfiles(id),
 es_soporte boolean not null,
 texto text not null check(length(trim(texto)) between 1 and 4000),
 fecha timestamptz not null default now()
);
create index soporte_comentarios_ticket on public.soporte_comentarios(ticket_id,fecha);
create table public.soporte_historial (
 id bigint generated always as identity primary key,
 ticket_id uuid not null references public.soporte_tickets(id) on delete cascade,
 usuario_id uuid references public.perfiles(id),
 campo text not null, antes text, despues text,
 fecha timestamptz not null default now()
);
create index soporte_historial_ticket on public.soporte_historial(ticket_id,fecha);
create table public.soporte_lecturas (
 ticket_id uuid not null references public.soporte_tickets(id) on delete cascade,
 usuario_id uuid not null references public.perfiles(id),
 leido_en timestamptz not null default now(),
 primary key(ticket_id,usuario_id)
);
create table public.soporte_avisos (
 id uuid primary key default gen_random_uuid(),
 ticket_id uuid not null references public.soporte_tickets(id) on delete cascade,
 evento text not null check(evento in ('nuevo','comentario')),
 comentario_id bigint references public.soporte_comentarios(id) on delete cascade,
 para text not null check(para ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
 estado text not null default 'pendiente' check(estado in ('pendiente','enviando','enviado','fallido')),
 intentos integer not null default 0,
 ultimo_error text check(length(ultimo_error)<=1500),
 creado_en timestamptz not null default now(),
 tomado_en timestamptz,
 enviado_en timestamptz,
 check((evento='comentario')=(comentario_id is not null))
);
create index soporte_avisos_cola on public.soporte_avisos(creado_en) where estado in ('pendiente','enviando');

-- Un registro por campo que cambió, más 'creado' al insertar. Nadie escribe el historial directo.
create function public.registrar_historial_ticket() returns trigger
language plpgsql security definer set search_path='' as $$
declare c text;a text;d text;
begin
 if tg_op='INSERT' then
  insert into public.soporte_historial(ticket_id,usuario_id,campo,antes,despues) values(new.id,auth.uid(),'creado',null,new.estado::text);
  return new;
 end if;
 foreach c in array array['estado','prioridad','responsable'] loop
  a:=to_jsonb(old)->>c;d:=to_jsonb(new)->>c;
  if a is distinct from d then insert into public.soporte_historial(ticket_id,usuario_id,campo,antes,despues) values(new.id,auth.uid(),c,a,d);end if;
 end loop;
 return new;
end $$;
create trigger soporte_tickets_historial after insert or update on public.soporte_tickets for each row execute function public.registrar_historial_ticket();

create function public.es_soporte() returns boolean
language sql stable security definer set search_path='' as $$ select coalesce(public.mi_rol()::text='admin',false) $$;

create function public.puede_ver_ticket(p_creador uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.mi_rol() is not null and (public.mi_rol()::text='admin' or p_creador=auth.uid()),false)
$$;

-- Un aviso por correo configurado, si el evento está encendido en ajustes.
create function public.encolar_aviso_soporte(p_ticket uuid,p_evento text,p_comentario bigint) returns void
language sql security definer set search_path='' as $$
 insert into public.soporte_avisos(ticket_id,evento,comentario_id,para)
 select p_ticket,p_evento,p_comentario,c from public.soporte_ajustes a cross join lateral unnest(a.correos) c
 where (p_evento='nuevo' and a.avisar_nuevos) or (p_evento='comentario' and a.avisar_comentarios)
$$;

create function public.crear_ticket(p_datos jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare r text:=public.mi_rol()::text;tipo text;bloquea boolean;cap text;ruta text;resp uuid;tid uuid;n bigint;
begin
 if r is null then raise exception 'Tu usuario no está activo.';end if;
 if jsonb_typeof(p_datos) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_datos) k where k<>all(array['tipo','titulo','descripcion','seccion','ruta_origen','bloquea','captura'])) then
  raise exception 'Datos del ticket inválidos.';
 end if;
 tipo:=p_datos->>'tipo';
 if tipo is null or tipo not in ('problema','mejora') then raise exception 'Elige si es un problema o una mejora.';end if;
 if length(trim(coalesce(p_datos->>'titulo',''))) not between 5 and 150 then raise exception 'El título debe tener de 5 a 150 caracteres.';end if;
 if length(trim(coalesce(p_datos->>'descripcion',''))) not between 10 and 4000 then raise exception 'Describe el ticket con 10 a 4000 caracteres.';end if;
 if length(trim(coalesce(p_datos->>'seccion',''))) not between 1 and 60 then raise exception 'Elige la sección del sistema.';end if;
 bloquea:=tipo='problema' and coalesce(p_datos->>'bloquea','')='true';
 ruta:=nullif(p_datos->>'ruta_origen','');
 if ruta is not null and (ruta !~ '^/(?!/)' or length(ruta)>300) then ruta:=null;end if;
 cap:=nullif(p_datos->>'captura','');
 if cap is not null and cap !~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|heif)$') then
  raise exception 'La captura no es válida.';
 end if;
 select a.responsable_default into resp from public.soporte_ajustes a
  join public.perfiles p on p.id=a.responsable_default and p.activo and p.rol::text='admin';
 insert into public.soporte_tickets(tipo,prioridad,titulo,descripcion,seccion,ruta_origen,bloquea,captura,creado_por,rol_creador,sucursal_id,responsable)
 values(tipo::public.tipo_ticket,(case when bloquea then 'alta' when tipo='problema' then 'media' else 'baja' end)::public.prioridad_tarea,
  trim(p_datos->>'titulo'),trim(p_datos->>'descripcion'),trim(p_datos->>'seccion'),ruta,bloquea,cap,auth.uid(),r,public.mi_sucursal(),resp)
 returning id,numero into tid,n;
 insert into public.soporte_lecturas(ticket_id,usuario_id) values(tid,auth.uid());
 perform public.encolar_aviso_soporte(tid,'nuevo',null);
 return n;
end $$;

-- Lo que esta persona ve, con nombres y si tiene novedades sin leer.
create function public.tickets_visibles(p_numero bigint default null)
returns table(id uuid,numero bigint,tipo text,estado text,prioridad text,titulo text,descripcion text,seccion text,ruta_origen text,
 bloquea boolean,captura text,creado_por uuid,creador text,rol_creador text,sucursal_id uuid,sucursal text,responsable uuid,responsable_nombre text,
 revision integer,creado_en timestamptz,actualizado_en timestamptz,cerrado_en timestamptz,sin_leer boolean)
language sql stable security definer set search_path='' as $$
 select t.id,t.numero,t.tipo::text,t.estado::text,t.prioridad::text,t.titulo,t.descripcion,t.seccion,t.ruta_origen,
  t.bloquea,t.captura,t.creado_por,c.nombre,t.rol_creador,t.sucursal_id,s.nombre,t.responsable,r.nombre,
  t.revision,t.creado_en,t.actualizado_en,t.cerrado_en,
  case when public.es_soporte() then t.novedad_soporte>coalesce(l.leido_en,'-infinity'::timestamptz)
   else coalesce(t.novedad_reporta>coalesce(l.leido_en,'-infinity'::timestamptz),false) end
 from public.soporte_tickets t
 join public.perfiles c on c.id=t.creado_por
 left join public.perfiles r on r.id=t.responsable
 left join public.sucursales s on s.id=t.sucursal_id
 left join public.soporte_lecturas l on l.ticket_id=t.id and l.usuario_id=auth.uid()
 where public.puede_ver_ticket(t.creado_por) and (p_numero is null or t.numero=p_numero)
 order by t.numero desc
$$;

alter table public.soporte_ajustes enable row level security;
alter table public.soporte_tickets enable row level security;
alter table public.soporte_comentarios enable row level security;
alter table public.soporte_historial enable row level security;
alter table public.soporte_lecturas enable row level security;
alter table public.soporte_avisos enable row level security;
create policy ver_soporte_ajustes on public.soporte_ajustes for select using(public.es_soporte());
create policy ver_soporte_tickets on public.soporte_tickets for select using(public.puede_ver_ticket(creado_por));
create policy ver_soporte_comentarios on public.soporte_comentarios for select using(exists(select 1 from public.soporte_tickets t where t.id=ticket_id));
create policy ver_soporte_historial on public.soporte_historial for select using(exists(select 1 from public.soporte_tickets t where t.id=ticket_id));
create policy ver_soporte_lecturas on public.soporte_lecturas for select using(usuario_id=auth.uid());
create policy ver_soporte_avisos on public.soporte_avisos for select using(public.es_soporte());
revoke all on public.soporte_ajustes,public.soporte_tickets,public.soporte_comentarios,public.soporte_historial,public.soporte_lecturas,public.soporte_avisos from anon,authenticated;
grant select on public.soporte_ajustes,public.soporte_tickets,public.soporte_comentarios,public.soporte_historial,public.soporte_lecturas,public.soporte_avisos to authenticated;
revoke all on sequence public.soporte_tickets_numero from public,anon,authenticated;
revoke all on function public.registrar_historial_ticket(),public.encolar_aviso_soporte(uuid,text,bigint) from public,anon,authenticated;
revoke all on function public.es_soporte(),public.puede_ver_ticket(uuid),public.crear_ticket(jsonb),public.tickets_visibles(bigint) from public,anon;
-- es_soporte y puede_ver_ticket también las necesita la RLS, que corre como el usuario.
grant execute on function public.es_soporte(),public.puede_ver_ticket(uuid),public.crear_ticket(jsonb),public.tickets_visibles(bigint) to authenticated;

-- Lee el ticket para escribir: usuario activo, ticket visible y en la revisión que vio la pantalla.
create function public.ticket_para_escribir(p_numero bigint,p_revision integer) returns public.soporte_tickets
language plpgsql security definer set search_path='' as $$
declare t public.soporte_tickets;
begin
 if public.mi_rol() is null then raise exception 'Tu usuario no está activo.';end if;
 select * into t from public.soporte_tickets where numero=p_numero for update;
 if not found or not public.puede_ver_ticket(t.creado_por) then raise exception 'Ticket no encontrado.';end if;
 if p_revision is not null and t.revision<>p_revision then raise exception 'El ticket cambió mientras lo veías. Recarga e intenta de nuevo.';end if;
 return t;
end $$;

create function public.marcar_leido_soporte(p_ticket uuid) returns void
language sql security definer set search_path='' as $$
 insert into public.soporte_lecturas(ticket_id,usuario_id,leido_en) values(p_ticket,auth.uid(),now())
 on conflict (ticket_id,usuario_id) do update set leido_en=excluded.leido_en
$$;

create function public.comentar_ticket(p_numero bigint,p_texto text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.soporte_tickets;s boolean:=public.es_soporte();txt text:=trim(coalesce(p_texto,''));cid bigint;
begin
 t:=public.ticket_para_escribir(p_numero,null);
 if txt='' then raise exception 'Escribe un comentario.';end if;
 if length(txt)>4000 then raise exception 'El comentario es demasiado largo (máximo 4000 caracteres).';end if;
 if t.estado::text='descartado' and not s then raise exception 'El ticket está descartado. Si sigue pasando, levanta uno nuevo.';end if;
 insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,texto) values(t.id,auth.uid(),s,txt) returning id into cid;
 if s then
  update public.soporte_tickets set novedad_reporta=now(),actualizado_en=now() where id=t.id;
 else
  update public.soporte_tickets set novedad_soporte=now(),actualizado_en=now() where id=t.id;
  perform public.encolar_aviso_soporte(t.id,'comentario',cid);
 end if;
 perform public.marcar_leido_soporte(t.id);
end $$;

-- Soporte cambia estado, prioridad y responsable; una clave ausente no cambia. Cerrar exige respuesta.
create function public.cambiar_ticket(p_numero bigint,p_revision integer,p_datos jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare t public.soporte_tickets;e text;pr text;resp uuid;nota text;cambia boolean;
begin
 t:=public.ticket_para_escribir(p_numero,p_revision);
 if p_revision is null then raise exception 'El ticket cambió mientras lo veías. Recarga e intenta de nuevo.';end if;
 if not public.es_soporte() then raise exception 'Solo soporte puede cambiar el ticket.';end if;
 if jsonb_typeof(p_datos) is distinct from 'object'
   or exists(select 1 from jsonb_object_keys(p_datos) k where k<>all(array['estado','prioridad','responsable','comentario'])) then
  raise exception 'Datos del ticket inválidos.';
 end if;
 e:=coalesce(nullif(p_datos->>'estado',''),t.estado::text);
 pr:=coalesce(nullif(p_datos->>'prioridad',''),t.prioridad::text);
 nota:=trim(coalesce(p_datos->>'comentario',''));
 if e not in ('nuevo','en_revision','en_progreso','resuelto','descartado') then raise exception 'Estado inválido.';end if;
 if pr not in ('alta','media','baja') then raise exception 'Prioridad inválida.';end if;
 cambia:=e<>t.estado::text;
 if cambia and t.estado::text||'>'||e not in ('nuevo>en_revision','nuevo>en_progreso','nuevo>resuelto','nuevo>descartado',
   'en_revision>en_progreso','en_revision>resuelto','en_revision>descartado','en_progreso>en_revision','en_progreso>resuelto',
   'en_progreso>descartado','resuelto>en_progreso','descartado>en_revision') then
  raise exception 'No puedes hacer ese cambio de estado.';
 end if;
 if cambia and e in ('resuelto','descartado') and length(nota)<5 then
  raise exception 'Para cerrar el ticket escribe la respuesta para quien lo levantó (al menos 5 caracteres).';
 end if;
 if length(nota)>4000 then raise exception 'El comentario es demasiado largo (máximo 4000 caracteres).';end if;
 if p_datos ? 'responsable' then
  if nullif(p_datos->>'responsable','') is null then resp:=null;
  elsif p_datos->>'responsable' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    or not exists(select 1 from public.perfiles p where p.id=(p_datos->>'responsable')::uuid and p.activo and p.rol::text='admin') then
   raise exception 'Esa persona no puede ser responsable.';
  else resp:=(p_datos->>'responsable')::uuid;
  end if;
 else resp:=t.responsable;
 end if;
 if not cambia and pr=t.prioridad::text and resp is not distinct from t.responsable and nota='' then raise exception 'No hay cambios que guardar.';end if;
 update public.soporte_tickets set estado=e::public.estado_ticket,prioridad=pr::public.prioridad_tarea,responsable=resp,
  revision=revision+1,actualizado_en=now(),
  cerrado_en=case when e in ('resuelto','descartado') then case when cambia then now() else cerrado_en end end,
  novedad_reporta=case when cambia or nota<>'' then now() else novedad_reporta end
 where id=t.id;
 if nota<>'' then insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,texto) values(t.id,auth.uid(),true,nota);end if;
 perform public.marcar_leido_soporte(t.id);
end $$;

create function public.marcar_ticket_leido(p_numero bigint) returns void
language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 select t.id into tid from public.soporte_tickets t where t.numero=p_numero and public.puede_ver_ticket(t.creado_por);
 if tid is not null then perform public.marcar_leido_soporte(tid);end if;
end $$;

-- Soporte: tickets nuevos o con comentarios sin leer (urgente si hay un problema que bloquea sin atender).
-- Quien reporta: sus tickets con respuesta o cambio de estado sin leer.
create function public.contar_soporte() returns table(pendientes integer,urgente boolean)
language sql stable security definer set search_path='' as $$
 select count(*)::integer,
  coalesce(bool_or(public.es_soporte() and t.estado::text='nuevo' and t.tipo::text='problema' and t.prioridad::text='alta'),false)
 from public.soporte_tickets t
 left join public.soporte_lecturas l on l.ticket_id=t.id and l.usuario_id=auth.uid()
 where public.mi_rol() is not null and case when public.es_soporte()
  then t.estado::text='nuevo' or t.novedad_soporte>coalesce(l.leido_en,'-infinity'::timestamptz)
  else t.creado_por=auth.uid() and coalesce(t.novedad_reporta>coalesce(l.leido_en,'-infinity'::timestamptz),false) end
$$;

-- Comentarios e historial juntos, en orden. En cambios de responsable, antes/después ya vienen como nombres.
create function public.hilo_ticket(p_numero bigint)
returns table(tipo text,autor text,es_soporte boolean,texto text,campo text,antes text,despues text,fecha timestamptz)
language sql stable security definer set search_path='' as $$
 with t as (select x.id from public.soporte_tickets x where x.numero=p_numero and public.puede_ver_ticket(x.creado_por))
 select u.tipo,u.autor,u.es_soporte,u.texto,u.campo,u.antes,u.despues,u.fecha from (
  select 'comentario'::text tipo,p.nombre autor,c.es_soporte,c.texto,null::text campo,null::text antes,null::text despues,c.fecha,c.id
  from public.soporte_comentarios c join t on t.id=c.ticket_id join public.perfiles p on p.id=c.autor_id
  union all
  select 'cambio',p.nombre,null::boolean,null,h.campo,
   case when h.campo='responsable' then (select y.nombre from public.perfiles y where y.id=h.antes::uuid) else h.antes end,
   case when h.campo='responsable' then (select y.nombre from public.perfiles y where y.id=h.despues::uuid) else h.despues end,h.fecha,h.id
  from public.soporte_historial h join t on t.id=h.ticket_id left join public.perfiles p on p.id=h.usuario_id
 ) u order by u.fecha,u.tipo,u.id
$$;

create function public.personas_soporte() returns table(id uuid,nombre text)
language sql stable security definer set search_path='' as $$
 select p.id,p.nombre from public.perfiles p where public.es_soporte() and p.activo and p.rol::text='admin' order by p.nombre
$$;

revoke all on function public.ticket_para_escribir(bigint,integer),public.marcar_leido_soporte(uuid) from public,anon,authenticated;
revoke all on function public.comentar_ticket(bigint,text),public.cambiar_ticket(bigint,integer,jsonb),public.marcar_ticket_leido(bigint),
 public.contar_soporte(),public.hilo_ticket(bigint),public.personas_soporte() from public,anon;
grant execute on function public.comentar_ticket(bigint,text),public.cambiar_ticket(bigint,integer,jsonb),public.marcar_ticket_leido(bigint),
 public.contar_soporte(),public.hilo_ticket(bigint),public.personas_soporte() to authenticated;

-- n8n (service_role) toma hasta 10 avisos: los que llevan más de 10 minutos "enviando" sin respuesta vuelven a la cola
-- (o quedan fallidos al quinto intento). Devuelve los datos para que la app arme el correo.
create function public.soporte_tomar_avisos(p_lote integer)
returns table(aviso_id uuid,para text,evento text,numero bigint,tipo text,titulo text,descripcion text,seccion text,prioridad text,
 sucursal text,creador text,rol_creador text,con_captura boolean,comentario text,autor_comentario text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
begin
 update public.soporte_avisos set estado=case when intentos>=5 then 'fallido' else 'pendiente' end,
  ultimo_error=coalesce(ultimo_error,'n8n no reportó el resultado.')
 where estado='enviando' and tomado_en<now()-interval '10 minutes';
 return query
 with elegidos as (
  select x.id from public.soporte_avisos x where x.estado='pendiente' order by x.creado_en,x.id
  limit least(greatest(coalesce(p_lote,10),1),10) for update skip locked
 ), tomados as (
  update public.soporte_avisos a set estado='enviando',tomado_en=now(),intentos=a.intentos+1
  from elegidos e where a.id=e.id returning a.id,a.para,a.evento,a.ticket_id,a.comentario_id,a.creado_en
 )
 select k.id,k.para,k.evento,t.numero,t.tipo::text,t.titulo,t.descripcion,t.seccion,t.prioridad::text,s.nombre,p.nombre,t.rol_creador,
  t.captura is not null,c.texto,pc.nombre
 from tomados k
 join public.soporte_tickets t on t.id=k.ticket_id
 join public.perfiles p on p.id=t.creado_por
 left join public.sucursales s on s.id=t.sucursal_id
 left join public.soporte_comentarios c on c.id=k.comentario_id
 left join public.perfiles pc on pc.id=c.autor_id
 order by k.creado_en,k.id;
end $$;

create function public.soporte_resultado_aviso(p_aviso uuid,p_ok boolean,p_error text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.soporte_avisos;
begin
 select * into a from public.soporte_avisos where id=p_aviso for update;
 if not found then raise exception 'Aviso no encontrado.';end if;
 if a.estado<>'enviando' then raise exception 'El aviso no está en envío.';end if;
 if coalesce(p_ok,false) then
  update public.soporte_avisos set estado='enviado',enviado_en=now(),ultimo_error=null where id=p_aviso;
 else
  update public.soporte_avisos set estado=case when a.intentos>=5 then 'fallido' else 'pendiente' end,
   ultimo_error=left(coalesce(nullif(trim(p_error),''),'Error sin detalle.'),1500)
  where id=p_aviso;
 end if;
end $$;

create function public.guardar_ajustes_soporte(p_responsable uuid,p_correos text[],p_avisar_nuevos boolean,p_avisar_comentarios boolean) returns void
language plpgsql security definer set search_path='' as $$
declare limpios text[];
begin
 if not public.es_soporte() then raise exception 'Solo soporte puede cambiar los ajustes.';end if;
 select coalesce(array_agg(distinct lower(trim(c)) order by lower(trim(c))) filter(where trim(c)<>''),array[]::text[])
  into limpios from unnest(coalesce(p_correos,array[]::text[])) c;
 if cardinality(limpios)>10 then raise exception 'Máximo 10 correos.';end if;
 if exists(select 1 from unnest(limpios) c where c !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Revisa los correos: hay uno que no es válido.';end if;
 if (coalesce(p_avisar_nuevos,false) or coalesce(p_avisar_comentarios,false)) and cardinality(limpios)=0 then
  raise exception 'Escribe al menos un correo para recibir avisos.';
 end if;
 if p_responsable is not null and not exists(select 1 from public.perfiles p where p.id=p_responsable and p.activo and p.rol::text='admin') then
  raise exception 'Esa persona no puede ser responsable.';
 end if;
 update public.soporte_ajustes set responsable_default=p_responsable,correos=limpios,avisar_nuevos=coalesce(p_avisar_nuevos,false),
  avisar_comentarios=coalesce(p_avisar_comentarios,false),actualizado_en=now();
end $$;

revoke all on function public.soporte_tomar_avisos(integer),public.soporte_resultado_aviso(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.soporte_tomar_avisos(integer),public.soporte_resultado_aviso(uuid,boolean,text) to service_role;
revoke all on function public.guardar_ajustes_soporte(uuid,text[],boolean,boolean) from public,anon;
grant execute on function public.guardar_ajustes_soporte(uuid,text[],boolean,boolean) to authenticated;

-- Capturas: cada quien sube a su carpeta (<usuario>/<uuid>.<ext>); la dueña y soporte las leen; solo se borra una
-- captura que no quedó ligada a un ticket (cuando falla el alta).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('soporte','soporte',false,4194304,array['image/jpeg','image/png','image/webp','image/heic','image/heif']);
create policy soporte_subir on storage.objects for insert to authenticated
 with check(bucket_id='soporte' and (storage.foldername(name))[1]=auth.uid()::text and public.mi_rol() is not null);
create policy soporte_leer on storage.objects for select to authenticated
 using(bucket_id='soporte' and ((storage.foldername(name))[1]=auth.uid()::text or public.es_soporte()));
create policy soporte_borrar on storage.objects for delete to authenticated
 using(bucket_id='soporte' and (storage.foldername(name))[1]=auth.uid()::text
  and not exists(select 1 from public.soporte_tickets t where t.captura=name));
commit;
