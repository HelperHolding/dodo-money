-- Agente del Help Desk: atiende cada ticket nuevo con la sesión de quien reporta (desde la app, con after()) y cierra con
-- agente_cerrar_ticket (solo service_role). Si no termina en 5 minutos, la cola de n8n lo marca fallido y avisa como siempre.
-- Notas internas: solo soporte las ve (hilo_ticket y RLS). Resumen diario de lo que resolvió: soporte_resumen_agente.
begin;
set local lock_timeout = '5s';

alter table public.soporte_ajustes
 add column agente_activo boolean not null default false,
 add column resumen_diario boolean not null default true;

alter table public.soporte_tickets
 add column agente_estado text check(agente_estado in ('pendiente','resuelto','escalado','mejora','fallido','reabierto')),
 add column agente_en timestamptz,
 add column agente_modelo text check(length(agente_modelo)<=100),
 add column agente_tokens_entrada integer check(agente_tokens_entrada>=0),
 add column agente_tokens_salida integer check(agente_tokens_salida>=0);
create index soporte_tickets_agente_pendiente on public.soporte_tickets(creado_en) where agente_estado='pendiente';

alter table public.soporte_comentarios
 alter column autor_id drop not null,
 add column es_agente boolean not null default false,
 add column interna boolean not null default false,
 add constraint soporte_comentarios_autor_agente check(es_agente=(autor_id is null)),
 add constraint soporte_comentarios_interna_soporte check(not interna or es_soporte);

drop policy ver_soporte_comentarios on public.soporte_comentarios;
create policy ver_soporte_comentarios on public.soporte_comentarios for select
 using((not interna or public.es_soporte()) and exists(select 1 from public.soporte_tickets t where t.id=ticket_id));

alter table public.soporte_avisos drop constraint soporte_avisos_evento_check, drop constraint soporte_avisos_check;
alter table public.soporte_avisos
 add constraint soporte_avisos_evento_check check(evento in ('nuevo','comentario','escalado')),
 add constraint soporte_avisos_comentario_check check((evento in ('comentario','escalado'))=(comentario_id is not null));

-- «escalado» siempre se avisa a los correos configurados (el agente necesita a soporte).
create or replace function public.encolar_aviso_soporte(p_ticket uuid,p_evento text,p_comentario bigint) returns void
language sql security definer set search_path='' as $$
 insert into public.soporte_avisos(ticket_id,evento,comentario_id,para)
 select p_ticket,p_evento,p_comentario,c from public.soporte_ajustes a cross join lateral unnest(a.correos) c
 where (p_evento='nuevo' and a.avisar_nuevos) or (p_evento='comentario' and a.avisar_comentarios) or p_evento='escalado'
$$;

create or replace function public.crear_ticket(p_datos jsonb) returns bigint
language plpgsql security definer set search_path='' as $$
declare r text:=public.mi_rol()::text;tipo text;bloquea boolean;cap text;ruta text;resp uuid;tid uuid;n bigint;agente boolean;
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
 if ruta is not null and (ruta !~ '^/(?![/\\])' or ruta ~ '[[:cntrl:]]' or length(ruta)>300) then ruta:=null;end if;
 cap:=nullif(p_datos->>'captura','');
 if cap is not null and cap !~ ('^'||auth.uid()::text||'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|heif)$') then
  raise exception 'La captura no es válida.';
 end if;
 select a.responsable_default into resp from public.soporte_ajustes a
  join public.perfiles p on p.id=a.responsable_default and p.activo and p.rol::text='admin';
 select a.agente_activo into agente from public.soporte_ajustes a;
 insert into public.soporte_tickets(tipo,prioridad,titulo,descripcion,seccion,ruta_origen,bloquea,captura,creado_por,rol_creador,sucursal_id,responsable,agente_estado)
 values(tipo::public.tipo_ticket,(case when bloquea then 'alta' when tipo='problema' then 'media' else 'baja' end)::public.prioridad_tarea,
  trim(p_datos->>'titulo'),trim(p_datos->>'descripcion'),trim(p_datos->>'seccion'),ruta,bloquea,cap,auth.uid(),r,public.mi_sucursal(),resp,
  case when coalesce(agente,false) then 'pendiente' end)
 returning id,numero into tid,n;
 insert into public.soporte_lecturas(ticket_id,usuario_id) values(tid,auth.uid());
 if not coalesce(agente,false) then perform public.encolar_aviso_soporte(tid,'nuevo',null);end if;
 return n;
end $$;

drop function public.tickets_visibles(bigint);
create function public.tickets_visibles(p_numero bigint default null)
returns table(id uuid,numero bigint,tipo text,estado text,prioridad text,titulo text,descripcion text,seccion text,ruta_origen text,
 bloquea boolean,captura text,creado_por uuid,creador text,rol_creador text,sucursal_id uuid,sucursal text,responsable uuid,responsable_nombre text,
 revision integer,creado_en timestamptz,actualizado_en timestamptz,cerrado_en timestamptz,sin_leer boolean,agente_estado text)
language sql stable security definer set search_path='' as $$
 select t.id,t.numero,t.tipo::text,t.estado::text,t.prioridad::text,t.titulo,t.descripcion,t.seccion,t.ruta_origen,
  t.bloquea,t.captura,t.creado_por,c.nombre,t.rol_creador,t.sucursal_id,s.nombre,t.responsable,r.nombre,
  t.revision,t.creado_en,t.actualizado_en,t.cerrado_en,
  case when public.es_soporte() then coalesce(t.novedad_soporte>coalesce(l.leido_en,'-infinity'::timestamptz),false)
   else coalesce(t.novedad_reporta>coalesce(l.leido_en,'-infinity'::timestamptz),false) end,
  t.agente_estado
 from public.soporte_tickets t
 join public.perfiles c on c.id=t.creado_por
 left join public.perfiles r on r.id=t.responsable
 left join public.sucursales s on s.id=t.sucursal_id
 left join public.soporte_lecturas l on l.ticket_id=t.id and l.usuario_id=auth.uid()
 where public.puede_ver_ticket(t.creado_por) and (p_numero is null or t.numero=p_numero)
 order by t.numero desc
$$;
revoke all on function public.tickets_visibles(bigint) from public,anon;
grant execute on function public.tickets_visibles(bigint) to authenticated;

drop function public.hilo_ticket(bigint);
create function public.hilo_ticket(p_numero bigint)
returns table(tipo text,autor text,es_soporte boolean,texto text,campo text,antes text,despues text,fecha timestamptz,es_agente boolean,interna boolean)
language sql stable security definer set search_path='' as $$
 with t as (select x.id from public.soporte_tickets x where x.numero=p_numero and public.puede_ver_ticket(x.creado_por))
 select u.tipo,u.autor,u.es_soporte,u.texto,u.campo,u.antes,u.despues,u.fecha,u.es_agente,u.interna from (
  select 'comentario'::text tipo,case when c.es_agente then 'Agente DODO' else p.nombre end autor,c.es_soporte,c.texto,
   null::text campo,null::text antes,null::text despues,c.fecha,c.id,c.es_agente,c.interna
  from public.soporte_comentarios c join t on t.id=c.ticket_id left join public.perfiles p on p.id=c.autor_id
  where not c.interna or public.es_soporte()
  union all
  select 'cambio',coalesce(p.nombre,'Agente DODO'),null::boolean,null,h.campo,
   case when h.campo='responsable' then (select y.nombre from public.perfiles y where y.id=h.antes::uuid) else h.antes end,
   case when h.campo='responsable' then (select y.nombre from public.perfiles y where y.id=h.despues::uuid) else h.despues end,h.fecha,h.id,null::boolean,null::boolean
  from public.soporte_historial h join t on t.id=h.ticket_id left join public.perfiles p on p.id=h.usuario_id
  where h.campo<>'prioridad' or public.es_soporte()
 ) u order by u.fecha,u.tipo,u.id
$$;
revoke all on function public.hilo_ticket(bigint) from public,anon;
grant execute on function public.hilo_ticket(bigint) to authenticated;

-- Reapertura: quien reporta comenta en un ticket que resolvió el agente → vuelve a soporte. El agente no reintenta.
create or replace function public.comentar_ticket(p_numero bigint,p_texto text) returns void
language plpgsql security definer set search_path='' as $$
declare t public.soporte_tickets;s boolean:=public.es_soporte();txt text:=trim(coalesce(p_texto,''));cid bigint;resp uuid;
begin
 t:=public.ticket_para_escribir(p_numero,null);
 if txt='' then raise exception 'Escribe un comentario.';end if;
 if length(txt)>4000 then raise exception 'El comentario es demasiado largo (máximo 4000 caracteres).';end if;
 if t.estado::text='descartado' and not s then raise exception 'El ticket está descartado. Si sigue pasando, levanta uno nuevo.';end if;
 insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,texto) values(t.id,auth.uid(),s,txt) returning id into cid;
 if s then
  update public.soporte_tickets set novedad_reporta=now(),actualizado_en=now() where id=t.id;
 elsif t.estado::text='resuelto' and t.agente_estado='resuelto' then
  select a.responsable_default into resp from public.soporte_ajustes a
   join public.perfiles p on p.id=a.responsable_default and p.activo and p.rol::text='admin';
  update public.soporte_tickets set estado='en_revision',cerrado_en=null,responsable=coalesce(resp,t.responsable),agente_estado='reabierto',
   revision=revision+1,novedad_soporte=now(),actualizado_en=now()
  where id=t.id;
  perform public.encolar_aviso_soporte(t.id,'comentario',cid);
 else
  update public.soporte_tickets set novedad_soporte=now(),actualizado_en=now() where id=t.id;
  perform public.encolar_aviso_soporte(t.id,'comentario',cid);
 end if;
 perform public.marcar_leido_soporte(t.id);
end $$;

-- Cierre del agente. Idempotente: solo actúa sobre agente_estado='pendiente'. Repite las reglas del servidor:
-- una mejora nunca se resuelve y un problema nunca termina en mejora.
create function public.agente_cerrar_ticket(p_ticket uuid,p_desenlace text,p_publica text,p_interna text,p_prioridad text,
 p_modelo text,p_entrada integer,p_salida integer) returns text
language plpgsql security definer set search_path='' as $$
declare t public.soporte_tickets;d text:=p_desenlace;pub text:=trim(coalesce(p_publica,''));nota text:=trim(coalesce(p_interna,''));resp uuid;cid bigint;
begin
 select * into t from public.soporte_tickets where id=p_ticket for update;
 if not found then raise exception 'Ticket no encontrado.';end if;
 if t.agente_estado is distinct from 'pendiente' then return 'ignorado';end if;
 if d is null or d not in ('resuelto','escalado','mejora','fallido') then raise exception 'Desenlace inválido.';end if;
 if p_prioridad is not null and p_prioridad not in ('alta','media','baja') then raise exception 'Prioridad inválida.';end if;
 if d<>'fallido' and length(pub) not between 1 and 2000 then raise exception 'Falta la respuesta pública (1 a 2000 caracteres).';end if;
 nota:=left(nota,3000);
 if t.tipo::text='mejora' and d<>'fallido' then d:='mejora';end if;
 if t.tipo::text='problema' and d='mejora' then d:='escalado';end if;
 -- Si una persona ya tocó el ticket mientras el agente trabajaba, el agente solo deja una nota interna: no pisa estado, responsable ni prioridad.
 if t.estado::text<>'nuevo' or t.revision<>1 then
  insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,es_agente,interna,texto)
   values(t.id,null,true,true,true,left(case when d='fallido'
    then 'El agente no pudo atender este ticket.'||case when nota<>'' then ' Detalle: '||nota else '' end
    else 'El agente terminó ('||d||') después de que soporte tomó el ticket. Respuesta propuesta: '||pub||case when nota<>'' then E'

Nota del agente: '||nota else '' end end,4000));
  update public.soporte_tickets set agente_estado=d,agente_en=now(),agente_modelo=left(p_modelo,100),
   agente_tokens_entrada=greatest(p_entrada,0),agente_tokens_salida=greatest(p_salida,0)
  where id=t.id;
  return d;
 end if;
 if d='fallido' then
  insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,es_agente,interna,texto)
   values(t.id,null,true,true,true,left('El agente no pudo atender este ticket; se atiende como siempre.'||case when nota<>'' then ' Detalle: '||nota else '' end,4000));
  update public.soporte_tickets set agente_estado='fallido',agente_en=now(),agente_modelo=left(p_modelo,100),
   agente_tokens_entrada=greatest(p_entrada,0),agente_tokens_salida=greatest(p_salida,0)
  where id=t.id;
  perform public.encolar_aviso_soporte(t.id,'nuevo',null);
  return d;
 end if;
 insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,es_agente,interna,texto) values(t.id,null,true,true,false,pub);
 if d='resuelto' then
  if nota<>'' then insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,es_agente,interna,texto) values(t.id,null,true,true,true,nota);end if;
  update public.soporte_tickets set estado='resuelto',cerrado_en=now(),novedad_reporta=now(),revision=revision+1,actualizado_en=now(),
   agente_estado='resuelto',agente_en=now(),agente_modelo=left(p_modelo,100),agente_tokens_entrada=greatest(p_entrada,0),agente_tokens_salida=greatest(p_salida,0)
  where id=t.id;
  return d;
 end if;
 insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,es_agente,interna,texto)
  values(t.id,null,true,true,true,coalesce(nullif(nota,''),'El agente no dejó diagnóstico.')) returning id into cid;
 select a.responsable_default into resp from public.soporte_ajustes a
  join public.perfiles p on p.id=a.responsable_default and p.activo and p.rol::text='admin';
 update public.soporte_tickets set estado=case when estado='nuevo' then 'en_revision'::public.estado_ticket else estado end,
  responsable=coalesce(resp,responsable),prioridad=coalesce(p_prioridad::public.prioridad_tarea,prioridad),
  novedad_reporta=now(),novedad_soporte=now(),revision=revision+1,actualizado_en=now(),
  agente_estado=d,agente_en=now(),agente_modelo=left(p_modelo,100),agente_tokens_entrada=greatest(p_entrada,0),agente_tokens_salida=greatest(p_salida,0)
 where id=t.id;
 perform public.encolar_aviso_soporte(t.id,'escalado',cid);
 return d;
end $$;

-- Hasta 5 tickets abiertos con palabras en común (para la nota interna del agente).
create function public.soporte_tickets_parecidos(p_ticket uuid,p_busqueda text) returns table(numero bigint,titulo text,estado text)
language sql stable security definer set search_path='' as $$
 select t.numero,t.titulo,t.estado::text from public.soporte_tickets t
 where t.id<>p_ticket and t.estado::text not in ('resuelto','descartado') and length(trim(coalesce(p_busqueda,''))) between 2 and 100
  and to_tsvector('simple',t.titulo||' '||t.descripcion) @@ plainto_tsquery('simple',p_busqueda)
 order by t.numero desc limit 5
$$;

create function public.soporte_resumen_agente(p_desde timestamptz,p_hasta timestamptz)
returns table(numero bigint,titulo text,tipo text,creador text,sucursal text,respuesta text,reabierto boolean,agente_en timestamptz)
language sql stable security definer set search_path='' as $$
 select t.numero,t.titulo,t.tipo::text,p.nombre,s.nombre,
  (select c.texto from public.soporte_comentarios c where c.ticket_id=t.id and c.es_agente and not c.interna order by c.id limit 1),
  t.agente_estado='reabierto',t.agente_en
 from public.soporte_tickets t join public.perfiles p on p.id=t.creado_por left join public.sucursales s on s.id=t.sucursal_id
 where t.agente_estado in ('resuelto','reabierto') and t.agente_en>=p_desde and t.agente_en<p_hasta
 order by t.agente_en,t.numero
$$;

-- Red de seguridad: un ticket pendiente del agente por más de 5 minutos se atiende como siempre.
create or replace function public.soporte_tomar_avisos(p_lote integer)
returns table(aviso_id uuid,para text,evento text,numero bigint,tipo text,titulo text,descripcion text,seccion text,prioridad text,
 sucursal text,creador text,rol_creador text,con_captura boolean,comentario text,autor_comentario text)
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare v uuid;
begin
 for v in update public.soporte_tickets set agente_estado='fallido',agente_en=now()
   where agente_estado='pendiente' and creado_en<now()-interval '5 minutes' returning id loop
  insert into public.soporte_comentarios(ticket_id,autor_id,es_soporte,es_agente,interna,texto)
   values(v,null,true,true,true,'El agente no terminó a tiempo; el ticket se atiende como siempre.');
  perform public.encolar_aviso_soporte(v,'nuevo',null);
 end loop;
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
  t.captura is not null,c.texto,case when c.es_agente then 'Agente DODO' else pc.nombre end
 from tomados k
 join public.soporte_tickets t on t.id=k.ticket_id
 join public.perfiles p on p.id=t.creado_por
 left join public.sucursales s on s.id=t.sucursal_id
 left join public.soporte_comentarios c on c.id=k.comentario_id
 left join public.perfiles pc on pc.id=c.autor_id
 order by k.creado_en,k.id;
end $$;

drop function public.guardar_ajustes_soporte(uuid,text[],boolean,boolean);
create function public.guardar_ajustes_soporte(p_responsable uuid,p_correos text[],p_avisar_nuevos boolean,p_avisar_comentarios boolean,
 p_agente_activo boolean default false,p_resumen_diario boolean default true) returns void
language plpgsql security definer set search_path='' as $$
declare limpios text[];
begin
 if not public.es_soporte() then raise exception 'Solo soporte puede cambiar los ajustes.';end if;
 select coalesce(array_agg(distinct lower(trim(c)) order by lower(trim(c))) filter(where trim(c)<>''),array[]::text[])
  into limpios from unnest(coalesce(p_correos,array[]::text[])) c;
 if cardinality(limpios)>10 then raise exception 'Máximo 10 correos.';end if;
 if exists(select 1 from unnest(limpios) c where c !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then raise exception 'Revisa los correos: hay uno que no es válido.';end if;
 if (coalesce(p_avisar_nuevos,false) or coalesce(p_avisar_comentarios,false) or coalesce(p_agente_activo,false) or coalesce(p_resumen_diario,false))
   and cardinality(limpios)=0 then
  raise exception 'Escribe al menos un correo para recibir avisos.';
 end if;
 if p_responsable is not null and not exists(select 1 from public.perfiles p where p.id=p_responsable and p.activo and p.rol::text='admin') then
  raise exception 'Esa persona no puede ser responsable.';
 end if;
 update public.soporte_ajustes set responsable_default=p_responsable,correos=limpios,avisar_nuevos=coalesce(p_avisar_nuevos,false),
  avisar_comentarios=coalesce(p_avisar_comentarios,false),agente_activo=coalesce(p_agente_activo,false),
  resumen_diario=coalesce(p_resumen_diario,false),actualizado_en=now()
 where id;
end $$;

revoke all on function public.agente_cerrar_ticket(uuid,text,text,text,text,text,integer,integer),
 public.soporte_tickets_parecidos(uuid,text),public.soporte_resumen_agente(timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.agente_cerrar_ticket(uuid,text,text,text,text,text,integer,integer),
 public.soporte_tickets_parecidos(uuid,text),public.soporte_resumen_agente(timestamptz,timestamptz) to service_role;
revoke all on function public.guardar_ajustes_soporte(uuid,text[],boolean,boolean,boolean,boolean) from public,anon;
grant execute on function public.guardar_ajustes_soporte(uuid,text[],boolean,boolean,boolean,boolean) to authenticated;
commit;
