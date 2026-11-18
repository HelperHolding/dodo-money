-- Editar las sucursales autorizadas de una razón social ya registrada (antes solo había alta).
-- El RFC y el nombre no cambian: los documentos conservan su RFC receptor.
-- Quitar una sucursal solo afecta capturas nuevas; los documentos ya registrados se quedan como están.
begin;
set local lock_timeout='5s';

create function public.editar_sucursales_razon_social(p_rfc text,p_sucursales uuid[],p_motivo text) returns void
language plpgsql security definer set search_path='' as $$
declare receptor text:=upper(trim(p_rfc));e public.razones_sociales;antes uuid[];despues uuid[];
begin
 perform public.exigir_admin_compras();
 if coalesce(cardinality(p_sucursales),0)=0 or coalesce(length(trim(p_motivo)),0) not between 5 and 500 then
  raise exception 'Elige al menos una sucursal y escribe el motivo (mínimo 5 caracteres).';
 end if;
 if exists(select 1 from unnest(p_sucursales) s where s is null or not exists(select 1 from public.sucursales x where x.id=s)) then raise exception 'Sucursal no válida.';end if;
 perform pg_advisory_xact_lock(hashtextextended('razon-social:'||receptor,0));
 select * into e from public.razones_sociales where rfc=receptor;
 if not found then raise exception 'La razón social % no está registrada.',receptor;end if;
 if e.principal then raise exception 'La empresa principal ya aplica a todas las sucursales; no se edita aquí.';end if;
 if not e.activa then raise exception 'La razón social está inactiva; no se le autorizan sucursales.';end if;
 select coalesce(array_agg(sucursal_id order by sucursal_id),'{}') into antes from public.razon_social_sucursales where rfc=receptor;
 select array_agg(distinct s order by s) into despues from unnest(p_sucursales) s;
 if antes=despues then raise exception 'No hay cambios en las sucursales.';end if;
 delete from public.razon_social_sucursales where rfc=receptor and sucursal_id<>all(despues);
 insert into public.razon_social_sucursales(rfc,sucursal_id) select receptor,s from unnest(despues) s on conflict do nothing;
 insert into public.razones_sociales_historial(rfc,datos,usuario_id)
 values(receptor,jsonb_build_object('evento','sucursales','antes',antes,'despues',despues,'motivo',trim(p_motivo)),auth.uid());
end $$;
revoke all on function public.editar_sucursales_razon_social(text,uuid[],text) from public,anon;
grant execute on function public.editar_sucursales_razon_social(text,uuid[],text) to authenticated;

commit;
