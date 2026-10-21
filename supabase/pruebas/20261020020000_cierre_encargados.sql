-- Ejecutar después de la migración. PRUEBAS OK provoca rollback de todo el ensayo.
do $pruebas$
declare
 usuario uuid; sucursal uuid; otra uuid; cierre uuid;
begin
 select p.id,p.sucursal_id into usuario,sucursal from public.perfiles p
 where p.activo and p.rol::text='encargado' and p.sucursal_id is not null limit 1;
 if usuario is null then raise exception 'FALTAN DATOS: se necesita un encargado activo con sucursal.';end if;
 select s.id into otra from public.sucursales s where s.id<>sucursal limit 1;
 if otra is null then raise exception 'FALTAN DATOS: se necesita otra sucursal para probar aislamiento.';end if;
 perform set_config('request.jwt.claim.sub',usuario::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',usuario,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 insert into public.cierres_dia(sucursal_id,fecha) values(sucursal,'1901-01-01') returning id into cierre;
 perform public.registrar_corte_rappi(cierre,100,null);
 if not exists(select 1 from public.cierres_dia c where c.id=cierre and c.cerrado_por=usuario and c.rappi_corte=100) then raise exception 'FALLÓ: encargado registra su corte.';end if;
 begin
  insert into public.cierres_dia(sucursal_id,fecha) values(otra,'1901-01-01');
  raise exception 'FALLÓ: permitió otra sucursal.';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.cierres_dia(sucursal_id,fecha) values(sucursal,'1901-01-01');
  raise exception 'FALLÓ: permitió duplicar el día.';
 exception when unique_violation then null;end;
 begin
  perform public.registrar_corte_rappi(cierre,200,null);
  raise exception 'FALLÓ: permitió sobrescribir Rappi.';
 exception when raise_exception then
  if sqlerrm not like '%ya está registrado%' then raise;end if;
 end;
 update public.cierres_dia set efectivo=999 where id=cierre;
 if exists(select 1 from public.cierres_dia c where c.id=cierre and c.efectivo=999) then raise exception 'FALLÓ: edición directa.';end if;
 execute 'reset role';
 if has_function_privilege('anon','public.registrar_corte_rappi(uuid,numeric,text)','execute') then raise exception 'FALLÓ: anónimo ejecuta.';end if;
 raise exception 'PRUEBAS OK — encargado registra corte propio · autor · sucursal protegida · día único · Rappi sin sobrescritura · sin edición directa · anónimo sin ejecución · ensayo reversible';
end
$pruebas$;
