-- Autoriza Master Sitru (CMS230321FI8) también en Dodo-5, conservando sus sucursales actuales.
-- Requiere la migración 20261118120000_editar_sucursales_razon_social (y su PRUEBAS OK).
-- Queda en el historial de la razón social a nombre del admin Sebastián, con el motivo.
do $$
declare yo uuid;d5 uuid;s uuid[];
begin
 if (select count(*) from public.perfiles where activo and rol::text='admin' and nombre ilike 'Sebasti%')<>1 then raise exception 'No encontré un solo perfil admin de Sebastián.';end if;
 select id into yo from public.perfiles where activo and rol::text='admin' and nombre ilike 'Sebasti%';
 if (select count(*) from public.sucursales where nombre ilike '%Dodo-5%')<>1 then raise exception 'No encontré una sola sucursal Dodo-5.';end if;
 select id into d5 from public.sucursales where nombre ilike '%Dodo-5%';
 select array_agg(x) into s from (select sucursal_id x from public.razon_social_sucursales where rfc='CMS230321FI8' union select d5) q;
 perform set_config('request.jwt.claims',json_build_object('sub',yo,'role','authenticated')::text,true);
 perform public.editar_sucursales_razon_social('CMS230321FI8',s,'Pagos de Scala 54 (renta y servicios de Dodo-5) a nombre de Master Sitru');
end $$;

-- Comprobación: deben salir Dodo-1 y Dodo-5.
select e.razon_social,x.nombre from public.razones_sociales e join public.razon_social_sucursales r on r.rfc=e.rfc join public.sucursales x on x.id=r.sucursal_id where e.rfc='CMS230321FI8' order by x.nombre;
