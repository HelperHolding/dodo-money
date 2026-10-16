begin;
set local lock_timeout='5s';
alter table public.compra_adjuntos add column retirado_en timestamptz, add column retirado_por uuid references public.perfiles(id), add column retiro_motivo text;
alter table public.compra_adjuntos add constraint compra_adjunto_retiro_completo check ((retirado_en is null and retirado_por is null and retiro_motivo is null) or (retirado_en is not null and retirado_por is not null and retiro_motivo is not null and length(trim(retiro_motivo)) between 5 and 500));
alter policy compra_adjuntos_consulta on public.compra_adjuntos using(retirado_en is null and public.ve_compras() and (confirmado_en is not null or usuario_id=auth.uid() and public.edita_compras()));
create function public.retirar_adjunto_compra(p_id uuid,p_tipo text,p_documento uuid,p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare v public.compra_adjuntos;
begin
 perform public.exigir_admin_compras();
 if p_motivo is null or length(trim(p_motivo)) not between 5 and 500 then raise exception 'Escribe un motivo de 5 a 500 caracteres.';end if;
 select * into v from public.compra_adjuntos where id=p_id for update;
 if not found or v.confirmado_en is null or p_documento is null or p_tipo is null or p_tipo not in ('orden','factura') or (case when p_tipo='orden' then v.orden_id else v.factura_id end) is distinct from p_documento then raise exception 'Adjunto no encontrado en este documento.';end if;
 if v.retirado_en is not null then
  if v.retirado_por=auth.uid() and v.retiro_motivo=trim(p_motivo) then return;end if;
  raise exception 'Este adjunto ya fue retirado. Recarga la pÃ¡gina.';
 end if;
 update public.compra_adjuntos set retirado_en=now(),retirado_por=auth.uid(),retiro_motivo=trim(p_motivo) where id=p_id;
 insert into public.compra_notas(orden_id,factura_id,texto,usuario_id) values(v.orden_id,v.factura_id,'Adjunto retirado: '||v.nombre||' â€” '||trim(p_motivo),auth.uid());
end $$;
revoke all on function public.retirar_adjunto_compra(uuid,text,uuid,text) from public,anon;
grant execute on function public.retirar_adjunto_compra(uuid,text,uuid,text) to authenticated;
commit;
