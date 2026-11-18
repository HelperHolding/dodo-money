-- Agregar la foto del ticket a un gasto ya registrado, sin mover saldo ni P&L.
-- Solo llena foto_path cuando el gasto no tenía; monto, origen, fecha e informativo no cambian.
-- Requiere 20261020220000_editar_anular_gastos_admin (gastos_historial, versión y triggers).
begin;
set local lock_timeout='5s';
create or replace function public.agregar_foto_gasto_admin(p_solicitud uuid,p_id uuid,p_version bigint,p_foto text) returns uuid
language plpgsql security definer set search_path='' as $$
declare g public.gastos_caja_chica;h public.gastos_historial;antes jsonb;despues jsonb;sol jsonb;
begin
 if public.mi_rol()::text is distinct from 'admin' then raise exception 'Solo administración agrega fotos a gastos registrados.';end if;
 if p_solicitud is null or p_id is null or p_version is null or length(trim(coalesce(p_foto,'')))=0 then raise exception 'Revisa solicitud, gasto y foto.';end if;
 sol:=jsonb_build_object('gasto',p_id,'version',p_version,'accion','agregar_foto','foto',p_foto);
 perform pg_advisory_xact_lock(hashtextextended('gasto-admin:'||p_solicitud,0));
 select * into h from public.gastos_historial where id=p_solicitud;
 if found then
  if h.autor_id<>auth.uid() or h.solicitud is distinct from sol then raise exception 'Esta solicitud pertenece a otra corrección.';end if;
  return h.gasto_id;
 end if;
 select * into g from public.gastos_caja_chica where id=p_id for update;
 if not found then raise exception 'Gasto no encontrado.';end if;
 if g.anulado_en is not null then raise exception 'El gasto ya fue eliminado.';end if;
 if g.version<>p_version then raise exception 'El gasto cambió. Recarga antes de agregar la foto.';end if;
 if g.foto_path is not null then raise exception 'El gasto ya tiene foto.';end if;
 if left(p_foto,length(g.sucursal_id::text)+1)<>g.sucursal_id::text||'/' then raise exception 'La foto debe pertenecer a la sucursal del gasto.';end if;
 antes:=to_jsonb(g);
 perform set_config('dodo.editar_gasto_admin','si',true);
 update public.gastos_caja_chica set foto_path=p_foto where id=g.id;
 perform set_config('dodo.editar_gasto_admin','no',true);
 select to_jsonb(x) into despues from public.gastos_caja_chica x where x.id=g.id;
 insert into public.gastos_historial(id,gasto_id,autor_id,accion,motivo,solicitud,antes,despues)
 values(p_solicitud,g.id,auth.uid(),'agregar_foto','Foto agregada después de registrar el gasto',sol,antes,despues);
 return g.id;
end $$;
revoke all on function public.agregar_foto_gasto_admin(uuid,uuid,bigint,text) from public,anon;
grant execute on function public.agregar_foto_gasto_admin(uuid,uuid,bigint,text) to authenticated;
commit;
