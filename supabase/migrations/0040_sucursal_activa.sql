-- El admin opera en la sucursal que elija: cambiar_mi_sucursal mueve su sucursal activa (perfiles.sucursal_id), y todas las
-- reglas que usan mi_sucursal() (qué ve, en qué caja registra, quién confirma) la siguen sin cambios. Los demás roles quedan
-- en la suya; corporativo sigue sin sucursal y en solo lectura. Requiere 0001–0039.

create or replace function cambiar_mi_sucursal(p_sucursal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador cambia de sucursal.'; end if;
  if not exists (select 1 from sucursales where id = p_sucursal) then raise exception 'Sucursal no encontrada.'; end if;
  update perfiles set sucursal_id = p_sucursal where id = auth.uid();
end $$;

revoke execute on function cambiar_mi_sucursal(uuid) from public, anon;
grant execute on function cambiar_mi_sucursal(uuid) to authenticated;
