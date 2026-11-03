-- Ajustes del P&L con nota: una capa sobre el real (tope % de la venta neta o monto en pesos) por sucursal, mes y renglón de gasto.
-- El real no cambia. Admin captura y anula por RPC; admin y corporativo leen. Nunca se borra. Requiere 0025 (ve_finanzas, edita_finanzas).
create table public.pl_ajustes (
  id uuid primary key,
  sucursal_id uuid not null references public.sucursales(id),
  mes date not null check (extract(day from mes) = 1 and mes >= date '2026-10-01'),
  renglon text not null check (renglon in ('alimento', 'merma', 'nomina_cocina', 'nomina_gerencia', 'repartidores', 'agregadores',
    'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'regalias', 'otros', 'oficina')),
  tipo text not null check (tipo in ('tope_pct', 'monto')),
  valor numeric(14,4) not null check ((tipo = 'tope_pct' and valor > 0 and valor <= 1)
    or (tipo = 'monto' and valor <> 0 and valor = round(valor, 2) and abs(valor) < 100000000)),
  nota text not null check (nota = trim(nota) and length(nota) between 10 and 500),
  creado_por uuid not null references public.perfiles(id),
  creado_en timestamptz not null default now(),
  anulado_por uuid references public.perfiles(id),
  anulado_en timestamptz,
  motivo_anulacion text check (motivo_anulacion is null or length(trim(motivo_anulacion)) between 5 and 500),
  check ((anulado_en is null) = (anulado_por is null) and (anulado_en is null) = (motivo_anulacion is null))
);
create unique index pl_ajustes_un_vigente on public.pl_ajustes (sucursal_id, mes, renglon) where anulado_en is null;

alter table public.pl_ajustes enable row level security;
create policy ver_pl_ajustes on public.pl_ajustes for select using (public.ve_finanzas());
revoke all on public.pl_ajustes from public, anon, authenticated;
grant select on public.pl_ajustes to authenticated;

create function public.guardar_ajuste_pl(p_solicitud uuid, p_sucursal uuid, p_mes date, p_renglon text, p_tipo text, p_valor numeric, p_nota text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare x public.pl_ajustes; v_nota text := trim(p_nota);
begin
  if not coalesce(public.edita_finanzas(), false) then raise exception 'Solo administración captura ajustes del P&L.'; end if;
  if p_solicitud is null then raise exception 'Falta el id de la solicitud.'; end if;
  select * into x from public.pl_ajustes where id = p_solicitud;
  if found then
    if x.sucursal_id = p_sucursal and x.mes = p_mes and x.renglon = p_renglon and x.tipo = p_tipo and x.valor = p_valor and x.nota = v_nota
      then return x.id; end if;
    raise exception 'La solicitud ya se utilizó con otros datos.';
  end if;
  if v_nota is null or length(v_nota) not between 10 and 500 then raise exception 'Escribe la nota del ajuste (10 a 500 caracteres).'; end if;
  if p_tipo is null or p_tipo not in ('tope_pct', 'monto') then raise exception 'Tipo de ajuste inválido.'; end if;
  if p_tipo = 'tope_pct' and (p_valor is null or p_valor <= 0 or p_valor > 1) then raise exception 'El tope debe ser mayor a 0 %% y hasta 100 %%.'; end if;
  if p_tipo = 'monto' and (p_valor is null or p_valor = 0 or p_valor <> round(p_valor, 2) or abs(p_valor) >= 100000000)
    then raise exception 'El monto debe ser distinto de cero, con hasta dos decimales.'; end if;
  if p_mes is null or extract(day from p_mes) <> 1 or p_mes < date '2026-10-01' then raise exception 'El mes debe ser el día 1, desde octubre 2026.'; end if;
  if p_renglon is null or p_renglon not in ('alimento', 'merma', 'nomina_cocina', 'nomina_gerencia', 'repartidores', 'agregadores',
    'marketing_agregadores', 'marketing', 'renta', 'servicios', 'mantenimiento', 'consumibles_equipo', 'regalias', 'otros', 'oficina')
    then raise exception 'Renglón inválido: solo renglones de gasto.'; end if;
  if not exists (select 1 from public.sucursales where id = p_sucursal) then raise exception 'Sucursal inválida.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_sucursal::text || '|' || p_mes::text || '|' || p_renglon, 0));
  if exists (select 1 from public.pl_ajustes where sucursal_id = p_sucursal and mes = p_mes and renglon = p_renglon and anulado_en is null)
    then raise exception 'Ya hay un ajuste vigente en ese renglón y mes; anúlalo para capturar otro.'; end if;
  insert into public.pl_ajustes (id, sucursal_id, mes, renglon, tipo, valor, nota, creado_por)
  values (p_solicitud, p_sucursal, p_mes, p_renglon, p_tipo, p_valor, v_nota, auth.uid());
  return p_solicitud;
end $$;

create function public.anular_ajuste_pl(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.edita_finanzas(), false) then raise exception 'Solo administración anula ajustes del P&L.'; end if;
  if p_motivo is null or length(trim(p_motivo)) not between 5 and 500 then raise exception 'Escribe el motivo (5 a 500 caracteres).'; end if;
  update public.pl_ajustes set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo)
  where id = p_id and anulado_en is null;
  if not found then raise exception 'El ajuste no existe o ya está anulado.'; end if;
end $$;

revoke all on function public.guardar_ajuste_pl(uuid, uuid, date, text, text, numeric, text), public.anular_ajuste_pl(uuid, text) from public, anon;
grant execute on function public.guardar_ajuste_pl(uuid, uuid, date, text, text, numeric, text), public.anular_ajuste_pl(uuid, text) to authenticated;
