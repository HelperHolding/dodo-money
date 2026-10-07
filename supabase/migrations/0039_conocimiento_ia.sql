begin;
create function public.kb_activo() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena)
$$;
create function public.kb_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena and rol::text='admin')
$$;
create table public.kb_articulos (
 id uuid primary key default gen_random_uuid(),slug text not null unique,titulo text not null check(length(trim(titulo)) between 3 and 200),
 categoria text not null check(length(trim(categoria)) between 1 and 100),contenido text not null check(length(trim(contenido)) between 20 and 30000),
 roles text[] not null default array['operacion','encargado','gerente','admin','corporativo'] check(cardinality(roles)>0 and roles<@array['operacion','encargado','gerente','admin','corporativo']),
 publicado boolean not null default false,revision integer not null default 1,actualizado_en timestamptz not null default now(),autor_id uuid references public.perfiles(id)
);
create index kb_busqueda on public.kb_articulos using gin(to_tsvector('spanish',titulo||' '||contenido));
create table public.kb_preguntas (
 id uuid primary key default gen_random_uuid(),titulo text not null check(length(trim(titulo)) between 5 and 200),
 contenido text not null check(length(trim(contenido)) between 10 and 5000),autor_id uuid not null references public.perfiles(id),
 respuesta text check(length(trim(respuesta)) between 10 and 10000),respondido_por uuid references public.perfiles(id),
 respondido_en timestamptz,revision integer not null default 1,creado_en timestamptz not null default now()
);
create table public.kb_historial (
 id uuid primary key default gen_random_uuid(),articulo_id uuid references public.kb_articulos(id),pregunta_id uuid references public.kb_preguntas(id),
 anterior jsonb not null,nuevo jsonb not null,usuario_id uuid not null references public.perfiles(id),fecha timestamptz not null default now(),
 check((articulo_id is not null)::integer+(pregunta_id is not null)::integer=1)
);
create table public.ia_consultas (
 id uuid primary key default gen_random_uuid(),usuario_id uuid not null references public.perfiles(id),sucursal_id uuid references public.sucursales(id),
 iniciado_en timestamptz not null default now(),terminado_en timestamptz,estado text not null default 'iniciada' check(estado in ('iniciada','completada','error')),
 modelo text,tokens_entrada integer check(tokens_entrada>=0),tokens_salida integer check(tokens_salida>=0),fuentes jsonb not null default '[]'
);
create index ia_usuario_fecha on public.ia_consultas(usuario_id,iniciado_en);
alter table public.kb_articulos enable row level security;
alter table public.kb_preguntas enable row level security;
alter table public.kb_historial enable row level security;
alter table public.ia_consultas enable row level security;
create policy kb_ver_articulo on public.kb_articulos for select using(public.kb_admin() or (public.kb_activo() and publicado and public.mi_rol()::text=any(roles)));
create policy kb_ver_pregunta on public.kb_preguntas for select using(public.kb_activo());
create policy kb_ver_historial on public.kb_historial for select using(public.kb_admin());
create policy ia_ver_consultas on public.ia_consultas for select using(public.kb_activo() and (usuario_id=auth.uid() or public.kb_admin()));
revoke all on public.kb_articulos,public.kb_preguntas,public.kb_historial,public.ia_consultas from public,anon,authenticated;
grant select on public.kb_articulos,public.kb_preguntas,public.kb_historial,public.ia_consultas to authenticated;
create function public.kb_guardar_articulo(p_id uuid,p_revision integer,p_titulo text,p_categoria text,p_contenido text,p_roles text[],p_publicado boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare a public.kb_articulos;n public.kb_articulos;r uuid;
begin
 if not public.kb_admin() then raise exception 'Solo administración publica manuales.';end if;
 if p_id is not null then
 select * into a from public.kb_articulos where id=p_id for update;
 if not found then raise exception 'Manual inexistente.';end if;
 if a.revision is distinct from p_revision then raise exception 'El manual cambió. Recarga antes de guardar.';end if;
 r:=p_id;
 else insert into public.kb_articulos(slug,titulo,categoria,contenido,roles,publicado,autor_id) values(gen_random_uuid()::text,trim(p_titulo),trim(p_categoria),trim(p_contenido),p_roles,p_publicado,auth.uid()) returning id into r;end if;
 update public.kb_articulos set titulo=trim(p_titulo),categoria=trim(p_categoria),contenido=trim(p_contenido),roles=p_roles,publicado=p_publicado,autor_id=auth.uid(),revision=case when p_id is null then 1 else revision+1 end,actualizado_en=now() where id=r returning * into n;
 insert into public.kb_historial(articulo_id,anterior,nuevo,usuario_id) values(r,case when p_id is null then '{}'::jsonb else to_jsonb(a) end,to_jsonb(n),auth.uid());return r;
end $$;
create function public.kb_preguntar(p_titulo text,p_contenido text) returns uuid
language plpgsql security definer set search_path='' as $$
declare r uuid;
begin
 if not public.kb_activo() then raise exception 'Necesitas un usuario activo.';end if;
 perform pg_advisory_xact_lock(hashtext('kb-pregunta:'||auth.uid()::text));
 if (select count(*) from public.kb_preguntas where autor_id=auth.uid() and creado_en>now()-interval '1 hour')>=10 then raise exception 'Puedes publicar hasta diez preguntas por hora.';end if;
 insert into public.kb_preguntas(titulo,contenido,autor_id) values(trim(p_titulo),trim(p_contenido),auth.uid()) returning id into r;return r;
end $$;
create function public.kb_responder(p_id uuid,p_revision integer,p_respuesta text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.kb_preguntas;n public.kb_preguntas;
begin
 if not public.kb_admin() then raise exception 'Solo administración publica respuestas oficiales.';end if;
 select * into a from public.kb_preguntas where id=p_id for update;if not found then raise exception 'Pregunta inexistente.';end if;
 if a.revision is distinct from p_revision then raise exception 'La pregunta cambió. Recarga antes de guardar.';end if;
 if p_respuesta is null or length(trim(p_respuesta)) not between 10 and 10000 then raise exception 'Escribe una respuesta de 10 a 10000 caracteres.';end if;
 update public.kb_preguntas set respuesta=trim(p_respuesta),respondido_por=auth.uid(),respondido_en=now(),revision=revision+1 where id=p_id returning * into n;
 insert into public.kb_historial(pregunta_id,anterior,nuevo,usuario_id) values(p_id,to_jsonb(a),to_jsonb(n),auth.uid());
end $$;
create function public.ia_reservar_consulta() returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.perfiles;r uuid;
begin
 select * into p from public.perfiles where id=auth.uid();
 if not public.kb_activo() or p.rol::text not in ('admin','corporativo','gerente') or (p.rol::text='gerente' and p.sucursal_id is null) then raise exception 'Sin acceso al asistente.';end if;
 perform pg_advisory_xact_lock(hashtext('ia-consulta:'||auth.uid()::text));
 if (select count(*) from public.ia_consultas where usuario_id=p.id and iniciado_en>=(date_trunc('day',now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'))>=20 then raise exception 'Llegaste al límite de veinte consultas de IA por día.';end if;
 if (select count(*) from public.ia_consultas where usuario_id=p.id and iniciado_en>now()-interval '1 minute')>=3 then raise exception 'Espera un minuto antes de consultar otra vez.';end if;
 insert into public.ia_consultas(usuario_id,sucursal_id) values(p.id,case when p.rol::text='gerente' then p.sucursal_id else null end) returning id into r;return r;
end $$;
create function public.ia_cerrar_consulta(p_id uuid,p_estado text,p_modelo text,p_entrada integer,p_salida integer,p_fuentes jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.kb_activo() or p_estado is null or p_estado not in ('completada','error') or jsonb_typeof(p_fuentes) is distinct from 'array' or length(coalesce(p_modelo,''))>200 or length(p_fuentes::text)>10000 then raise exception 'Registro de consulta inválido.';end if;
 update public.ia_consultas set estado=p_estado,modelo=p_modelo,tokens_entrada=p_entrada,tokens_salida=p_salida,fuentes=p_fuentes,terminado_en=now() where id=p_id and usuario_id=auth.uid() and estado='iniciada';
 if not found then raise exception 'La consulta no existe o ya se cerró.';end if;
end $$;
revoke all on function public.kb_activo(),public.kb_admin(),public.kb_guardar_articulo(uuid,integer,text,text,text,text[],boolean),public.kb_preguntar(text,text),public.kb_responder(uuid,integer,text),public.ia_reservar_consulta(),public.ia_cerrar_consulta(uuid,text,text,integer,integer,jsonb) from public,anon;
grant execute on function public.kb_activo(),public.kb_admin(),public.kb_guardar_articulo(uuid,integer,text,text,text,text[],boolean),public.kb_preguntar(text,text),public.kb_responder(uuid,integer,text),public.ia_reservar_consulta(),public.ia_cerrar_consulta(uuid,text,text,integer,integer,jsonb) to authenticated;
commit;
