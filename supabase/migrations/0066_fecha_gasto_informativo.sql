begin;
set local lock_timeout='5s';
alter table public.gastos_caja_chica add column fecha_capturada_original date;

-- Una corrección atómica: fecha real + clasificación informativa. Si falta respaldo,
-- la función anterior rechaza todo y tampoco cambia la fecha.
create function public.corregir_fecha_gasto_informativo(p_id uuid,p_fecha date,p_motivo text,p_referencia text,p_respaldo text,p_confirmado boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_g public.gastos_caja_chica;
begin
 if public.mi_rol() is null or public.mi_rol()::text not in ('admin','gerente') then raise exception 'Solo administración o gerencia corrige gastos.';end if;
 select * into v_g from public.gastos_caja_chica where id=p_id;
 if not found or not coalesce(public.mi_rol()::text='admin' or v_g.sucursal_id=public.mi_sucursal(),false) then raise exception 'Gasto sin acceso.';end if;
 perform 1 from public.cajas where sucursal_id=v_g.sucursal_id and tipo='boveda' for update;
 select * into v_g from public.gastos_caja_chica where id=p_id for update;
 if p_fecha is null or p_fecha>=public.hoy_mx() then raise exception 'Indica la fecha real del pago, anterior a hoy.';end if;
 if v_g.informativo then
  if v_g.fecha is distinct from p_fecha then raise exception 'El gasto informativo conserva su fecha; no se sobrescribe.';end if;
  return public.marcar_gasto_informativo(p_id,p_motivo,p_referencia,p_respaldo,p_confirmado);
 end if;
 if v_g.fecha is distinct from p_fecha then
  update public.gastos_caja_chica set fecha_capturada_original=coalesce(fecha_capturada_original,fecha),fecha=p_fecha where id=p_id;
 end if;
 return public.marcar_gasto_informativo(p_id,p_motivo,p_referencia,p_respaldo,p_confirmado);
end $$;
revoke all on function public.corregir_fecha_gasto_informativo(uuid,date,text,text,text,boolean) from public,anon;
grant execute on function public.corregir_fecha_gasto_informativo(uuid,date,text,text,text,boolean) to authenticated;
commit;
