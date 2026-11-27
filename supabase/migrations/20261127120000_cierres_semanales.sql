-- HD-5: cierre semanal de ventas por sucursal. Solo administración aprueba; administración y corporativo leen.
-- Requiere ve_finanzas() y edita_finanzas() (0025).
begin;
set local lock_timeout='5s';
create table if not exists public.cierres_semanales(
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid not null references public.sucursales(id),
  semana date not null check(extract(isodow from semana)=1),
  totales jsonb not null check(jsonb_typeof(totales)='object'),
  nota text check(length(nota)<=500),
  aprobado_por uuid not null,
  aprobado_en timestamptz not null default now(),
  unique(sucursal_id, semana)
);
alter table public.cierres_semanales enable row level security;
drop policy if exists cierres_semanales_select on public.cierres_semanales;
create policy cierres_semanales_select on public.cierres_semanales for select using(public.ve_finanzas());
revoke all on public.cierres_semanales from public, anon, authenticated;
grant select on public.cierres_semanales to authenticated;

create or replace function public.aprobar_cierre_semanal(p_sucursal uuid, p_semana date, p_totales jsonb, p_nota text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_nota text := nullif(btrim(coalesce(p_nota, '')), ''); v_id uuid;
begin
  if not public.edita_finanzas() then raise exception 'Solo administración aprueba el cierre semanal.'; end if;
  if p_semana is null or extract(isodow from p_semana) <> 1 then raise exception 'La semana debe empezar en lunes.'; end if;
  if p_semana + 7 > (now() at time zone 'America/Mexico_City')::date then raise exception 'La semana aún no termina.'; end if;
  if p_totales is null or jsonb_typeof(p_totales) <> 'object'
     or jsonb_typeof(p_totales->'dias') is distinct from 'array' or jsonb_array_length(p_totales->'dias') <> 7 then
    raise exception 'Los totales no son válidos.';
  end if;
  if length(v_nota) > 500 then raise exception 'La nota admite hasta 500 caracteres.'; end if;
  insert into public.cierres_semanales(sucursal_id, semana, totales, nota, aprobado_por, aprobado_en)
  values (p_sucursal, p_semana, p_totales, v_nota, auth.uid(), now())
  on conflict (sucursal_id, semana) do update
    set totales = excluded.totales, nota = excluded.nota, aprobado_por = excluded.aprobado_por, aprobado_en = excluded.aprobado_en
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.aprobar_cierre_semanal(uuid, date, jsonb, text) from public, anon;
grant execute on function public.aprobar_cierre_semanal(uuid, date, jsonb, text) to authenticated;
commit;
