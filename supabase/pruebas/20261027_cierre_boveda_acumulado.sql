-- Después de 20261027231046_cierre_boveda_acumulado.sql.
-- Solo lectura y configuración temporal de identidad; ROLLBACK conserva producción.
begin;
do $$
declare a uuid; d jsonb; historicos jsonb; entregas jsonb;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 if a is null then raise exception 'Falta un administrador activo para verificar.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 select jsonb_agg(to_jsonb(c) order by id) into historicos from public.cierres_dia c;
 select jsonb_agg(to_jsonb(r) order by id) into entregas from public.recolecciones_corporativo r;
 d:=public.datos_boveda_cierre('260324e5-6f5a-44d8-9a75-f4a4ba3ed10e',public.hoy_mx());
 if d is null or not(d ? 'ultimoCierre') or (d->>'bovedaInicial') is null then raise exception 'Falta el cálculo acumulado.';end if;
 if has_function_privilege('anon','public.datos_boveda_cierre(uuid,date)','execute') then raise exception 'Anónimo tiene ejecución.';end if;
 if (select prosecdef from pg_proc where oid='public.datos_boveda_cierre(uuid,date)'::regprocedure) then raise exception 'La consulta debe respetar RLS.';end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.cierres_dia'::regclass and tgname='incluir_pagos_boveda_corte' and (tgtype::int & 4)=4 and (tgtype::int & 16)=0 and tgenabled='O') then raise exception 'El trigger debe operar solo al insertar.';end if;
 if historicos is distinct from (select jsonb_agg(to_jsonb(c) order by id) from public.cierres_dia c)
 or entregas is distinct from (select jsonb_agg(to_jsonb(r) order by id) from public.recolecciones_corporativo r) then raise exception 'Cambió un dato histórico.';end if;
end $$;
select 'VERIFICACIÓN OK · consulta acumulada · trigger solo INSERT · históricos y entregas intactos · sin ejecución anónima' as resultado,
 public.datos_boveda_cierre('260324e5-6f5a-44d8-9a75-f4a4ba3ed10e',public.hoy_mx()) as calculo_actual;
rollback;
