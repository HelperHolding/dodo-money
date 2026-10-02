-- Arqueos: un solo inicio vigente por turno, y anular un arqueo equivocado sin borrarlo.
--   · Nadie impedía registrar dos "inicio de turno" en el mismo turno (pasó: uno con $500 y otro con $0).
--   · Los registros no se editan ni se borran: un arqueo equivocado se anula con motivo. Queda a la vista,
--     tachado, con quién lo anuló y por qué, y deja de contar en diferencias y reportes.
--   · El arqueo de cierre no se anula: es el que cerró el turno.
-- Requiere 0001–0017.

alter table arqueos
  add column anulado_por      uuid references perfiles(id),
  add column anulado_en       timestamptz,
  add column motivo_anulacion text,
  add constraint arqueo_anulado_completo check (
    (anulado_en is null and anulado_por is null and motivo_anulacion is null)
    or (anulado_en is not null and anulado_por is not null and coalesce(trim(motivo_anulacion), '') <> ''));

-- Antes de guardar: el turno sigue abierto y, si es inicio, no hay otro vigente.
-- Se bloquea el turno para que dos clics al mismo tiempo no guarden dos inicios.
create or replace function validar_arqueo() returns trigger
language plpgsql security definer set search_path = public as $$
declare t turnos;
begin
  select * into t from turnos where id = new.turno_id for update;
  if not found then raise exception 'Turno no encontrado'; end if;
  if t.cerrado_en is not null then raise exception 'El turno ya está cerrado'; end if;
  if new.momento = 'inicio' and exists (
    select 1 from arqueos where turno_id = new.turno_id and momento = 'inicio' and anulado_en is null
  ) then
    raise exception 'Este turno ya tiene su arqueo de inicio';
  end if;
  return new;
end $$;

create trigger arqueos_validar
  before insert on arqueos
  for each row execute function validar_arqueo();

-- Al registrar, nadie puede adelantar una anulación.
drop policy registrar_arqueo on arqueos;
create policy registrar_arqueo on arqueos for insert
  with check (entrega_id = auth.uid()
              and exists (select 1 from turnos t where t.id = turno_id and t.sucursal_id = mi_sucursal())
              and anulado_en is null and anulado_por is null and motivo_anulacion is null);

-- El gerente o el admin anulan un arqueo equivocado, con motivo.
create or replace function anular_arqueo(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
declare a arqueos; s uuid;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  if mi_rol() not in ('gerente', 'admin') then raise exception 'Solo el gerente o el admin anulan un arqueo'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe por qué se anula el arqueo'; end if;
  select * into a from arqueos where id = p_id for update;
  if not found then raise exception 'Arqueo no encontrado'; end if;
  select sucursal_id into s from turnos where id = a.turno_id;
  if s <> mi_sucursal() and mi_rol() <> 'admin' then raise exception 'El arqueo es de otra sucursal'; end if;
  if a.anulado_en is not null then raise exception 'El arqueo ya estaba anulado'; end if;
  if a.momento = 'cierre' then raise exception 'El arqueo de cierre no se anula: es el que cerró el turno'; end if;
  update arqueos set anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = trim(p_motivo) where id = p_id;
end $$;
revoke execute on function anular_arqueo(uuid, text) from public, anon;
grant execute on function anular_arqueo(uuid, text) to authenticated;

-- Igual que en 0004, y un arqueo anulado ya no se recibe.
create or replace function recibir_arqueo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a arqueos; s uuid;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  select * into a from arqueos where id = p_id for update;
  if not found then raise exception 'Arqueo no encontrado'; end if;
  select sucursal_id into s from turnos where id = a.turno_id;
  if s <> mi_sucursal() and mi_rol() <> 'admin' then raise exception 'El arqueo es de otra sucursal'; end if;
  if a.anulado_en is not null then raise exception 'El arqueo está anulado'; end if;
  if a.recibe_id is not null then raise exception 'El arqueo ya fue recibido'; end if;
  if a.entrega_id = auth.uid() then raise exception 'Quien entrega no puede recibir su propio arqueo'; end if;
  update arqueos set recibe_id = auth.uid(), recibido_en = now() where id = p_id;
end $$;
