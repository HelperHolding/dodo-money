-- Después de 20261127120000_cierres_semanales.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare p uuid;s uuid;sem date;n int;t jsonb;nota text;
begin
 select id into p from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by id limit 1;
 if p is null then raise exception 'FALTAN DATOS: no hay un admin activo sin cambio de contraseña pendiente';end if;
 select id into s from public.sucursales order by id limit 1;
 if s is null then raise exception 'FALTAN DATOS: no hay sucursales';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',p,'role','authenticated')::text,true);
 sem:=date_trunc('week',(now() at time zone 'America/Mexico_City')::date)::date - 14;
 t:=jsonb_build_object('dias',(select jsonb_agg(jsonb_build_object('i',g)) from generate_series(1,7) g));
 perform public.aprobar_cierre_semanal(s,sem,t,'primera');
 perform public.aprobar_cierre_semanal(s,sem,t,'segunda');
 select count(*),max(c.nota) into n,nota from public.cierres_semanales c where c.sucursal_id=s and c.semana=sem;
 if n<>1 then raise exception 'FALLÓ: se esperaba una sola fila y hay %',n;end if;
 if nota is distinct from 'segunda' then raise exception 'FALLÓ: la nota no se reemplazó (%)',nota;end if;
 begin
  perform public.aprobar_cierre_semanal(s,date_trunc('week',(now() at time zone 'America/Mexico_City')::date)::date,t,null);
  raise exception 'FALLÓ: aceptó la semana en curso';
 exception when others then
  if sqlerrm not like 'La semana aún no termina%' then raise;end if;
 end;
 raise exception 'PRUEBAS OK — aprueba, reaprueba reemplazando (una sola fila) · rechaza la semana en curso';
end $$;
