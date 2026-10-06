-- Retenciones por enterar: lo retenido se calcula de pagos; solo se guarda el historial del entero.
-- Requiere migraciones 0001–0029. La fecha límite se presenta conforme al diseño aprobado (día 17).
create table enteros_retenciones (
  id uuid primary key default gen_random_uuid(),
  mes date not null check (extract(day from mes) = 1),
  fecha date not null check (fecha >= mes and fecha <= (now() at time zone 'America/Mexico_City')::date),
  iva numeric(14,2) not null check (iva >= 0 and iva <> 'NaN'::numeric),
  isr numeric(14,2) not null check (isr >= 0 and isr <> 'NaN'::numeric),
  operacion text check (length(operacion) <= 60),
  acuse_ruta text unique,
  registrado_por uuid not null references perfiles(id) default auth.uid(),
  registrado_en timestamptz not null default now(),
  anulado_por uuid references perfiles(id), anulado_en timestamptz, motivo_anulacion text,
  check (iva + isr > 0),
  check (acuse_ruta is null or acuse_ruta ~ ('^' || to_char(mes, 'YYYY-MM') || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$')),
  check ((anulado_en is null and anulado_por is null and motivo_anulacion is null)
      or (anulado_en is not null and anulado_por is not null and length(trim(motivo_anulacion)) > 0 and motivo_anulacion is not null))
);
create index on enteros_retenciones (mes, fecha);
alter table enteros_retenciones enable row level security;
create policy ver_enteros_retenciones on enteros_retenciones for select using (ve_finanzas());
revoke insert, update, delete on enteros_retenciones from anon, authenticated;
grant select on enteros_retenciones to authenticated;

create or replace function exigir_admin_finanzas() returns void
language plpgsql security definer set search_path = public as $$
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  if not coalesce(edita_finanzas(), false) then raise exception 'Solo el admin puede registrar o anular enteros.'; end if;
end $$;

create or replace function registrar_entero(p_mes date, p_fecha date, p_iva numeric, p_isr numeric, p_operacion text, p_acuse text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform exigir_admin_finanzas();
  if p_mes is null or extract(day from p_mes) <> 1 then raise exception 'Elige el mes (día 1).'; end if;
  if p_fecha is null or p_fecha > hoy_mx() then raise exception 'La fecha no puede ser futura.'; end if;
  if p_fecha < p_mes then raise exception 'La fecha no puede ser anterior al mes.'; end if;
  if p_iva is null or p_isr is null or p_iva = 'NaN'::numeric or p_isr = 'NaN'::numeric or p_iva < 0 or p_isr < 0 or p_iva + p_isr <= 0
     or p_iva <> round(p_iva, 2) or p_isr <> round(p_isr, 2) then raise exception 'Revisa los montos: cero o más, alguno mayor que cero y hasta dos decimales.'; end if;
  if length(trim(p_operacion)) > 60 then raise exception 'La operación admite hasta 60 caracteres.'; end if;
  if p_acuse is not null then
    if p_acuse !~ ('^' || to_char(p_mes, 'YYYY-MM') || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then raise exception 'Ruta del acuse inválida.'; end if;
    if not exists (select 1 from storage.objects where bucket_id = 'acuses-sat' and name = p_acuse) then raise exception 'No se encontró el acuse subido.'; end if;
  end if;
  insert into enteros_retenciones (mes, fecha, iva, isr, operacion, acuse_ruta, registrado_por)
    values (p_mes, p_fecha, p_iva, p_isr, nullif(trim(p_operacion), ''), p_acuse, auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function anular_entero(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_entero enteros_retenciones;
begin
  perform exigir_admin_finanzas();
  if p_motivo is null or trim(p_motivo) = '' then raise exception 'Escribe el motivo de anulación.'; end if;
  select * into v_entero from enteros_retenciones where id = p_id for update;
  if not found then raise exception 'Entero no encontrado.'; end if;
  if v_entero.anulado_en is not null then raise exception 'Ese entero ya está anulado.'; end if;
  update enteros_retenciones set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo) where id = p_id;
end $$;

revoke execute on function exigir_admin_finanzas(), registrar_entero(date,date,numeric,numeric,text,text), anular_entero(uuid,text) from public, anon;
grant execute on function exigir_admin_finanzas(), registrar_entero(date,date,numeric,numeric,text,text), anular_entero(uuid,text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('acuses-sat', 'acuses-sat', false, 5242880, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy subir_acuse_sat on storage.objects for insert to authenticated
  with check (bucket_id = 'acuses-sat' and public.edita_finanzas() and name ~ '^\d{4}-(0[1-9]|1[0-2])/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$');
create policy ver_acuse_sat on storage.objects for select to authenticated
  using (bucket_id = 'acuses-sat' and public.ve_finanzas());
-- Se permite retirar únicamente un archivo huérfano si falló el registro.
create policy retirar_acuse_huerfano on storage.objects for delete to authenticated
  using (bucket_id = 'acuses-sat' and public.edita_finanzas()
    and not exists (select 1 from public.enteros_retenciones e where e.acuse_ruta = name));
