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
commit;
