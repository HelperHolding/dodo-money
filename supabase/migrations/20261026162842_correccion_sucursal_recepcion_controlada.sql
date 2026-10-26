-- No anula ni modifica recepciones. Requiere las migraciones contables anteriores.
begin;
set local lock_timeout='5s';
create or replace function public.proteger_recepcion_directa() returns trigger language plpgsql security definer set search_path='' as $$
declare fid uuid;
begin
 if tg_table_name='factura_conceptos' and tg_op='UPDATE' then
 if new.factura_id is distinct from old.factura_id then raise exception 'Un concepto no cambia de factura.';end if;end if;
 if tg_table_name='facturas' then fid:=old.id;else fid:=coalesce(new.factura_id,old.factura_id);end if;
 perform 1 from public.facturas where id=fid for update;
 if exists(select 1 from public.factura_recepciones where factura_id=fid and anulada_en is null) then
 if tg_table_name='factura_ordenes' then raise exception 'Anula la recepción directa antes de vincular una orden.';end if;
 if tg_table_name='factura_conceptos' then
 if tg_op<>'UPDATE' then raise exception 'Anula la recepción antes de cambiar conceptos.';end if;
 if new.factura_id is distinct from old.factura_id or new.cantidad is distinct from old.cantidad then raise exception 'Anula la recepción antes de cambiar conceptos o cantidades.';end if;end if;
 if tg_table_name='facturas' then
 if new.estado='cancelada' then raise exception 'Anula la recepción antes de cancelar o cambiar la sucursal.';end if;
 if new.sucursal_id is distinct from old.sucursal_id then
  -- Corrección puntual de clasificación; la recepción hereda sucursal de la factura.
  -- Solo SQL Editor, dos facturas confirmadas, Oficina → La Calma y sin otros cambios.
  if not coalesce((
   session_user::text in ('postgres','supabase_admin')
   and current_setting('role',true) in ('none','postgres','supabase_admin')
   and current_setting('dodo.correccion_sucursal_recibida',true)='CUENTAS-OCTUBRE-20261026'
   and old.id in ('f2a01469-2c13-4762-bf4a-d80e6c63d75d'::uuid,'c82935ad-f1c0-4edd-b4ac-04fa41645435'::uuid)
   and old.sucursal_id is null and new.sucursal_id='260324e5-6f5a-44d8-9a75-f4a4ba3ed10e'::uuid
   and old.rfc_receptor='HCM260306B93'
   and to_jsonb(new)-'sucursal_id'=to_jsonb(old)-'sucursal_id'
   and exists(select 1 from public.perfiles p where p.id=auth.uid() and p.rol::text='admin' and p.activo and not p.debe_cambiar_contrasena)
   and public.razon_admite_sucursal(new.rfc_receptor,new.sucursal_id)
  ),false) then raise exception 'Anula la recepción antes de cancelar o cambiar la sucursal.';end if;
 end if;end if;
 end if;
 return coalesce(new,old);
end $$;
revoke all on function public.proteger_recepcion_directa() from public,anon,authenticated;
commit;
