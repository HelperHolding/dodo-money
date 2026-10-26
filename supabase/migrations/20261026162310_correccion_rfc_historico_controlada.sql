-- Requiere la revisión de octubre 20261026155811. No cambia datos ni desactiva triggers.
begin;
set local lock_timeout='5s';
create or replace function public.validar_razon_documento() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='ordenes_compra' and new.rfc_receptor is null then
  new.rfc_receptor:=(select rfc from public.razones_sociales where principal);
 end if;
 if tg_op='UPDATE' and new.rfc_receptor is distinct from old.rfc_receptor then
  -- Excepción única para reparar el RFC histórico de una prefactura manual.
  -- No la puede activar una sesión de la API, ni permite cambiar otros campos.
  if not coalesce((
   session_user::text in ('postgres','supabase_admin')
   and current_setting('role',true) in ('none','postgres','supabase_admin')
   and current_setting('dodo.correccion_rfc_historico',true)='CUENTAS-OCTUBRE-20261026'
   and tg_table_name='facturas'
   and old.id='b4051f86-ce2d-465f-a470-aa1b9a1da0fe'::uuid
   and old.rfc_receptor='HCM260306G93' and new.rfc_receptor='HCM260306B93'
   and to_jsonb(old)->>'origen'='manual' and to_jsonb(old)->>'uuid' is null
   and to_jsonb(old)->>'sustituido_por' is null and to_jsonb(old)->>'estado'<>'cancelada'
   and old.sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e'::uuid
   and to_jsonb(new)-'rfc_receptor'=to_jsonb(old)-'rfc_receptor'
   and exists(select 1 from public.perfiles p where p.id=auth.uid() and p.rol::text='admin' and p.activo and not p.debe_cambiar_contrasena)
   and public.razon_admite_sucursal(new.rfc_receptor,new.sucursal_id)
  ),false) then raise exception 'La razón social de un documento registrado no se cambia.';end if;
 end if;
 if tg_op='INSERT' or new.sucursal_id is distinct from old.sucursal_id then
  if not public.razon_admite_sucursal(new.rfc_receptor,new.sucursal_id) then raise exception 'La razón social no está activa o no corresponde a esta sucursal.';end if;
 end if;
 if tg_table_name='facturas' then
  if new.uuid_relacionado is not null and exists(select 1 from public.facturas f where f.uuid=new.uuid_relacionado and f.rfc_receptor<>new.rfc_receptor) then raise exception 'La nota de crédito corresponde a otra razón social.';end if;
  if new.uuid is not null and exists(select 1 from public.facturas f where f.uuid_relacionado=new.uuid and f.rfc_receptor<>new.rfc_receptor) then raise exception 'Existen notas de crédito de otra razón social para este UUID.';end if;
  if new.uuid is not null and exists(select 1 from public.complemento_facturas cf join public.complementos_pago c on c.id=cf.complemento_id where cf.factura_uuid=new.uuid and c.rfc_receptor<>new.rfc_receptor) then raise exception 'El complemento registrado corresponde a otra razón social.';end if;
 end if;
 return new;
end $$;
revoke all on function public.validar_razon_documento() from public,anon,authenticated;
commit;
