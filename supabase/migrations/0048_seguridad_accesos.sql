-- Seguridad de contraseña temporal y consultas de Compras. Requiere 0001–0046; independiente de 0047.
begin;
set local lock_timeout='5s';
create or replace function public.mi_rol() returns public.rol_usuario
language sql stable security definer set search_path='' as $$
 select rol from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena
$$;
create or replace function public.mi_sucursal() returns uuid
language sql stable security definer set search_path='' as $$
 select sucursal_id from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena
$$;
-- Solo una actualización real de la contraseña en Auth libera la cuenta.
create or replace function public.registrar_cambio_password_auth() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.encrypted_password is distinct from old.encrypted_password and coalesce(new.encrypted_password,'')<>'' then
  update public.perfiles set debe_cambiar_contrasena=false where id=new.id and debe_cambiar_contrasena;
 end if;
 return new;
end $$;
revoke all on function public.registrar_cambio_password_auth() from public,anon,authenticated;
drop trigger if exists password_cambiado_perfil on auth.users;
create trigger password_cambiado_perfil after update of encrypted_password on auth.users
 for each row execute function public.registrar_cambio_password_auth();
-- Compatibilidad con clientes desplegados: ya no modifica perfiles.
create or replace function public.contrasena_cambiada() returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.perfiles where id=auth.uid() and activo and not debe_cambiar_contrasena) then
  raise exception 'Cambia tu contraseña en Mi contraseña antes de continuar.';
 end if;
end $$;
revoke all on function public.contrasena_cambiada() from public,anon;
grant execute on function public.contrasena_cambiada() to authenticated;
-- Recepción: Compras consulta todas; gerente/encargado solo su sucursal.
create function public.puede_consultar_recepcion(p_orden uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ordenes_compra o where o.id=p_orden and
 (public.ve_compras() or (public.mi_rol()::text in ('gerente','encargado') and o.sucursal_id=public.mi_sucursal())))
$$;
revoke all on function public.puede_consultar_recepcion(uuid) from public,anon;
grant execute on function public.puede_consultar_recepcion(uuid) to authenticated;
create or replace function recibido_renglon(p_renglon uuid) returns numeric
language sql stable security definer set search_path = public as $$
 select case when exists(select 1 from public.orden_renglones r where r.id=p_renglon and public.puede_consultar_recepcion(r.orden_id)) then (select coalesce((select sum(cantidad) from recepciones_dodo where orden_renglon_id = p_renglon), 0)
       + coalesce((select sum(cantidad) from recepciones_app where orden_renglon_id = p_renglon and anulada_en is null), 0)) else null end
$$;
create or replace function hay_recepciones(p_orden uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select case when public.puede_consultar_recepcion(p_orden) then (select exists (select 1 from orden_renglones r where r.orden_id = p_orden and recibido_renglon(r.id) > 0)) else null end
$$;
create or replace function total_orden(p_orden uuid) returns numeric
language sql stable security definer set search_path = public as $$
 select case when public.ve_compras() then (select coalesce(sum(round(cantidad * precio, 2) + round(round(cantidad * precio, 2) * case when tasa_iva = '16' then 0.16 else 0 end, 2)), 0)
    from orden_renglones where orden_id = p_orden) else null end
$$;
create or replace function facturado_orden(p_orden uuid) returns numeric
language sql stable security definer set search_path = public as $$
 select case when public.ve_compras() then (select coalesce(sum(neto_factura(f.id)), 0)
    from factura_ordenes fo join facturas f on f.id = fo.factura_id
   where fo.orden_id = p_orden and f.tipo = 'ingreso' and f.estado <> 'cancelada') else null end
$$;
create or replace function recepcion_completa(p_orden uuid) returns boolean
language sql stable security definer set search_path = public as $$
 select case when public.ve_compras() then (select exists (select 1 from orden_renglones where orden_id = p_orden)
     and not exists (select 1 from orden_renglones r where r.orden_id = p_orden and recibido_renglon(r.id) < r.cantidad)) else null end
$$;
create or replace function cubierto_por_complementos(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
 select case when public.ve_compras() then (select coalesce((select sum(cf.monto_pagado) from complemento_facturas cf join facturas f on f.uuid = cf.factura_uuid where f.id = p_id), 0)) else null end
$$;
revoke execute on function public.recibido_renglon(uuid),public.hay_recepciones(uuid),public.total_orden(uuid),public.facturado_orden(uuid),public.recepcion_completa(uuid),public.cubierto_por_complementos(uuid) from public,anon;
grant execute on function public.recibido_renglon(uuid),public.hay_recepciones(uuid),public.total_orden(uuid),public.facturado_orden(uuid),public.recepcion_completa(uuid),public.cubierto_por_complementos(uuid) to authenticated;
commit;
