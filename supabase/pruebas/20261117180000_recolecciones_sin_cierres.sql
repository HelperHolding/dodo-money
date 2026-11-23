-- Reversible: el mensaje PRUEBAS OK deshace todos los datos del ensayo.
-- Ejecutar después de supabase/migrations/20261117180000_recolecciones_sin_cierres.sql.
do $pruebas$
declare a uuid;s uuid;d0 date;d1 date;exp jsonb;rid uuid:=gen_random_uuid();n int;cand record;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 if a is null then raise exception 'FALTAN DATOS: un admin activo.';end if;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 -- Una sucursal con bóveda, caja corporativo y efectivo disponible; una semana de lunes a domingo de 2025 sin cierres ni recolecciones.
 for cand in select su.id from public.sucursales su
  where exists(select 1 from public.cajas c where c.sucursal_id=su.id and c.tipo='boveda') and exists(select 1 from public.cajas c where c.sucursal_id=su.id and c.tipo='corporativo') order by su.nombre loop
  select w::date into d0 from generate_series(date '2025-01-06',date '2025-12-29',interval '7 days') w
   where not exists(select 1 from public.cierres_dia cd where cd.sucursal_id=cand.id and cd.fecha between w::date and w::date+6)
   and not exists(select 1 from public.recolecciones_corporativo r where r.sucursal_id=cand.id and r.desde<=w::date+6 and r.hasta>=w::date) order by w limit 1;
  if d0 is not null and (public.vista_recoleccion(cand.id,d0,d0+6)->>'maximo')::numeric>=1 then s:=cand.id;exit;end if;
 end loop;
 if s is null then raise exception 'FALTAN DATOS: ninguna sucursal tiene al menos $1 disponible en bóveda para el ensayo.';end if;
 d1:=d0+6;
 exp:=public.vista_recoleccion(s,d0,d1);
 if not (exp->>'sin_cierres')::boolean or jsonb_array_length(exp->'cierres')<>0 or exp->'incremento_periodo'<>'null'::jsonb then raise exception 'FALLÓ: la vista no marca la semana sin cierres.';end if;
 begin
  perform public.registrar_recoleccion(rid,s,d0,d1,1,'ENSAYO-SC','Ensayo sin cierres',true,false);raise exception 'FALLÓ: registró sin confirmar el conteo.';
 exception when raise_exception then if sqlerrm not like '%no tienen cierres del día%' then raise;end if;end;
 perform public.registrar_recoleccion(rid,s,d0,d1,1,'ENSAYO-SC','Ensayo sin cierres',true,true);
 if public.registrar_recoleccion(rid,s,d0,d1,1,'ENSAYO-SC','Ensayo sin cierres',true,true)<>rid then raise exception 'FALLÓ: repetir la solicitud creó otra entrega.';end if;
 if not exists(select 1 from public.recolecciones_corporativo r join public.movimientos m on m.id=r.id where r.id=rid and (r.expediente->>'sin_cierres')::boolean and m.monto=1 and m.estado='pendiente' and m.tipo='salida_corporativo') then raise exception 'FALLÓ: entrega sin cierres mal guardada.';end if;
 select count(*) into n from public.recoleccion_cierres where recoleccion_id=rid;
 if n<>0 then raise exception 'FALLÓ: se ligaron cierres que no existen.';end if;
 begin
  perform public.vista_recoleccion(s,d0,d1);raise exception 'FALLÓ: la vista permite otra entrega de la misma semana.';
 exception when raise_exception then if sqlerrm not like '%Ya hay una recolección de estas fechas%' then raise;end if;end;
 begin
  perform public.registrar_recoleccion(gen_random_uuid(),s,d0,d1,1,'ENSAYO-SC2','Ensayo duplicado',true,true);raise exception 'FALLÓ: registró dos entregas de la misma semana.';
 exception when raise_exception then if sqlerrm not like '%Ya hay una recolección de estas fechas%' then raise;end if;end;
 execute 'reset role';
 if has_function_privilege('anon','public.registrar_recoleccion(uuid,uuid,date,date,numeric,text,text,boolean,boolean)','execute') then raise exception 'FALLÓ: anónimo ejecuta.';end if;
 if not has_function_privilege('authenticated','public.registrar_recoleccion(uuid,uuid,date,date,numeric,text,text,boolean,boolean)','execute') then raise exception 'FALLÓ: usuarios sin permiso de registrar.';end if;
 if exists(select 1 from pg_proc where proname='registrar_recoleccion' and pronamespace='public'::regnamespace and pronargs=8) then raise exception 'FALLÓ: quedó la versión anterior de registrar_recoleccion.';end if;
 raise exception 'PRUEBAS OK — semana sin cierres visible · pide confirmar el conteo · registra entrega sin ligar cierres · solicitud repetida no duplica · bloquea otra entrega de la misma semana · anónimo sin ejecución · sin versión anterior';
end
$pruebas$;
