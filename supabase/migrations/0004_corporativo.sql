-- Usuario corporativo: lee todas las sucursales y no escribe nada.
-- Requiere 0001, 0002 y 0003.
--
-- Postgres no deja usar un valor de enum en la misma transacción en que se agrega, y el SQL Editor
-- corre todo el script en una sola transacción: por eso aquí el rol se compara como texto.

do $$
begin
  if exists (select 1 from perfiles where sucursal_id is null) then
    raise exception 'Hay perfiles sin sucursal. Asígnales una antes de correr esta migración: select * from perfiles where sucursal_id is null;';
  end if;
end $$;

alter type rol_usuario add value if not exists 'corporativo';

-- Corporativo nunca tiene sucursal; los demás roles siempre la tienen.
alter table perfiles add constraint perfiles_corporativo_sin_sucursal
  check ((rol::text = 'corporativo') = (sucursal_id is null));

create or replace function ve_todas_las_sucursales() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text in ('admin', 'corporativo'), false)
$$;


-- ─── Lectura: admin y corporativo ven todas las sucursales ──────────────────
drop policy ver_sucursal on sucursales;
create policy ver_sucursal on sucursales for select
  using (id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_perfiles on perfiles;
create policy ver_perfiles on perfiles for select
  using (id = auth.uid() or sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_cajas on cajas;
create policy ver_cajas on cajas for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_turnos on turnos;
create policy ver_turnos on turnos for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_arqueos on arqueos;
create policy ver_arqueos on arqueos for select
  using (exists (select 1 from turnos t where t.id = turno_id
                 and (t.sucursal_id = mi_sucursal() or ve_todas_las_sucursales())));

drop policy ver_movimientos on movimientos;
create policy ver_movimientos on movimientos for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_gastos on gastos_caja_chica;
create policy ver_gastos on gastos_caja_chica for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_cierres on cierres_dia;
create policy ver_cierres on cierres_dia for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_mermas on mermas;
create policy ver_mermas on mermas for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_cierres_merma on cierres_merma;
create policy ver_cierres_merma on cierres_merma for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_lecturas_masa on lecturas_masa;
create policy ver_lecturas_masa on lecturas_masa for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_recorridos on recorridos;
create policy ver_recorridos on recorridos for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_recorrido_respuestas on recorrido_respuestas;
create policy ver_recorrido_respuestas on recorrido_respuestas for select
  using (exists (select 1 from recorridos r where r.id = recorrido_id
                 and (r.sucursal_id = mi_sucursal() or ve_todas_las_sucursales())));

drop policy ver_comprobante on storage.objects;
create policy ver_comprobante on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes'
         and ((storage.foldername(name))[1] = public.mi_sucursal()::text or public.ve_todas_las_sucursales()));


-- ─── Escritura: las dos funciones que no rechazaban a un usuario sin sucursal ─
-- Las políticas de inserción ya exigen sucursal_id = mi_sucursal(), que nunca se cumple sin sucursal.

create or replace function confirmar_movimiento(p_id uuid, p_aceptar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m movimientos;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  select * into m from movimientos where id = p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if m.sucursal_id <> mi_sucursal() and mi_rol() <> 'admin' then
    raise exception 'El movimiento es de otra sucursal';
  end if;
  if m.estado <> 'pendiente' then raise exception 'El movimiento ya fue %', m.estado; end if;
  if m.registrado_por = auth.uid() then
    raise exception 'Quien registra el movimiento no puede confirmarlo';
  end if;
  if m.tipo in ('deposito_banco', 'reposicion_caja_chica') and mi_rol() not in ('gerente', 'admin') then
    raise exception 'Solo un gerente confirma depósitos y reposiciones';
  end if;

  update movimientos
     set estado = case when p_aceptar then 'confirmado'::estado_movimiento else 'rechazado'::estado_movimiento end,
         confirmado_por = auth.uid(),
         confirmado_en = now()
   where id = p_id;
end $$;

create or replace function recibir_arqueo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a arqueos; s uuid;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  select * into a from arqueos where id = p_id for update;
  if not found then raise exception 'Arqueo no encontrado'; end if;
  select sucursal_id into s from turnos where id = a.turno_id;
  if s <> mi_sucursal() and mi_rol() <> 'admin' then raise exception 'El arqueo es de otra sucursal'; end if;
  if a.recibe_id is not null then raise exception 'El arqueo ya fue recibido'; end if;
  if a.entrega_id = auth.uid() then raise exception 'Quien entrega no puede recibir su propio arqueo'; end if;
  update arqueos set recibe_id = auth.uid(), recibido_en = now() where id = p_id;
end $$;
