-- Conector de Grok (docs/superpowers/specs/2026-11-19-grok-mcp-design.md): registro de llamadas del endpoint
-- /api/mcp y límites por cuenta. Solo admin lee el registro. Se corre antes de publicar el endpoint.
begin;
create table public.mcp_llamadas(
 id uuid primary key default gen_random_uuid(),
 usuario_id uuid not null references public.perfiles(id),
 herramienta text not null check (herramienta in ('sucursales','ventas','cortes','costos','manuales','pl')),
 argumentos jsonb not null default '{}' check (jsonb_typeof(argumentos)='object' and length(argumentos::text)<=2000),
 estado text not null default 'iniciada' check (estado in ('iniciada','completada','error')),
 error text check (length(error)<=500),
 iniciado_en timestamptz not null default now(),
 terminado_en timestamptz
);
create index mcp_llamadas_usuario_inicio on public.mcp_llamadas(usuario_id,iniciado_en desc);
alter table public.mcp_llamadas enable row level security;
create policy mcp_llamadas_ver_admin on public.mcp_llamadas for select using(public.kb_admin());
revoke all on public.mcp_llamadas from public,anon,authenticated;
grant select on public.mcp_llamadas to authenticated;

create function public.mcp_reservar_llamada(p_herramienta text,p_argumentos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.perfiles;r uuid;
 inicio timestamptz:=date_trunc('day',now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
begin
 select * into p from public.perfiles where id=auth.uid();
 if not public.kb_activo() or p.rol::text not in ('admin','corporativo') then raise exception 'Sin acceso al conector.';end if;
 perform pg_advisory_xact_lock(hashtext('mcp:'||auth.uid()::text));
 if (select count(*) from public.mcp_llamadas where usuario_id=p.id and iniciado_en>now()-interval '1 minute')>=10 then raise exception 'Espera un minuto: límite de diez llamadas por minuto.';end if;
 if (select count(*) from public.mcp_llamadas where usuario_id=p.id and iniciado_en>=inicio)>=300 then raise exception 'Llegaste al límite de trescientas llamadas por día.';end if;
 insert into public.mcp_llamadas(usuario_id,herramienta,argumentos) values(p.id,p_herramienta,coalesce(p_argumentos,'{}')) returning id into r;
 return r;
end $$;

create function public.mcp_cerrar_llamada(p_id uuid,p_estado text,p_error text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.kb_activo() or p_estado is null or p_estado not in ('completada','error') or length(coalesce(p_error,''))>500 then raise exception 'Registro de llamada inválido.';end if;
 update public.mcp_llamadas set estado=p_estado,error=p_error,terminado_en=now() where id=p_id and usuario_id=auth.uid() and estado='iniciada';
 if not found then raise exception 'La llamada no existe o ya se cerró.';end if;
end $$;

revoke all on function public.mcp_reservar_llamada(text,jsonb),public.mcp_cerrar_llamada(uuid,text,text) from public,anon;
grant execute on function public.mcp_reservar_llamada(text,jsonb),public.mcp_cerrar_llamada(uuid,text,text) to authenticated;
commit;
