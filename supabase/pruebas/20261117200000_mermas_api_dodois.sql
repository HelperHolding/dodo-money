-- Ejecutar completo después de 20261117200000_mermas_api_dodois.sql. PRUEBAS OK es un ERROR intencional: revierte todo.
do $$
declare a uuid;s uuid;r jsonb;dias jsonb;filas jsonb;
begin
 select id into a from perfiles where activo and rol::text='admin' order by nombre limit 1;
 select id into s from sucursales order by nombre limit 1;
 if a is null or s is null then raise exception 'FALTAN DATOS: un admin activo y una sucursal.';end if;
 if exists(select 1 from mermas_dodo_dias where sucursal_id=s and fecha in ('2020-01-04','2020-01-05')) then raise exception 'Usa otras fechas reservadas para la prueba.';end if;
 dias:=jsonb_build_array(jsonb_build_object('sucursal_id',s,'fecha','2020-01-04','productos_completos',true),jsonb_build_object('sucursal_id',s,'fecha','2020-01-05','productos_completos',true));
 filas:=jsonb_build_array(
  jsonb_build_object('sucursal_id',s,'fecha','2020-01-04','tipo','producto','clave','prueba pizza','nombre','Prueba pizza','unidad','piezas','categoria','Producto terminado','cantidad',1,'costo',40,'sin_costo',false),
  jsonb_build_object('sucursal_id',s,'fecha','2020-01-05','tipo','producto','clave','marketing:prueba pizza','nombre','Prueba pizza','unidad','piezas','categoria','Marketing','cantidad',1,'costo',25,'sin_costo',false));

 -- 1. La del cron (sin usuario) registra «API Dodo IS» y sin registrado_por.
 perform set_config('request.jwt.claims','',true);
 r:=importar_mermas_dodo_api(dias,filas);
 if (r->>'dias')::int<>2 or (r->>'filas')::int<>2 then raise exception 'FALLÓ: importación API %',r;end if;
 if exists(select 1 from mermas_dodo_dias where sucursal_id=s and fecha in ('2020-01-04','2020-01-05') and (archivo<>'API Dodo IS' or registrado_por is not null or not productos_completos))
  then raise exception 'FALLÓ: registro de la API';end if;

 -- 2. Otra corrida reemplaza el día completo.
 r:=importar_mermas_dodo_api(jsonb_build_array(dias->1),'[]'::jsonb);
 if (r->>'reemplazados')::int<>1 or exists(select 1 from mermas_dodo where sucursal_id=s and fecha='2020-01-05') then raise exception 'FALLÓ: reemplazo de día';end if;

 -- 3. La de la app sigue exigiendo admin y lo registra.
 begin perform importar_mermas_dodo('API Dodo IS (manual)',repeat('a',64),dias,filas);raise exception 'FALLÓ: importó sin admin';
 exception when others then if sqlerrm<>'Solo el admin puede importar mermas.' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 r:=importar_mermas_dodo('API Dodo IS (manual)',repeat('a',64),dias,filas);
 if exists(select 1 from mermas_dodo_dias where sucursal_id=s and fecha in ('2020-01-04','2020-01-05') and registrado_por is distinct from a) then raise exception 'FALLÓ: registro del admin';end if;

 -- 4. Permisos: solo service_role ejecuta la del cron; nadie de la app la interna.
 if has_function_privilege('authenticated','importar_mermas_dodo_api(jsonb,jsonb)','execute') or not has_function_privilege('service_role','importar_mermas_dodo_api(jsonb,jsonb)','execute')
  or has_function_privilege('authenticated','importar_mermas_dodo_interno(text,text,jsonb,jsonb,uuid)','execute') then raise exception 'FALLÓ: permisos';end if;

 -- 5. Un registro manual sin usuario no se permite.
 begin insert into mermas_dodo_dias(sucursal_id,fecha,archivo,huella,desde,hasta,registrado_por) values(s,'2020-01-06','manual.xlsx',repeat('c',64),'2020-01-06','2020-01-06',null);raise exception 'FALLÓ: registro sin usuario';
 exception when check_violation then null;end;

 -- 6. La bitácora acepta corridas de mermas.
 if not exists(select 1 from pg_constraint where conname='dodois_sincronizaciones_tipo_check' and pg_get_constraintdef(oid) like '%mermas%') then raise exception 'FALLÓ: bitácora';end if;

 raise exception 'PRUEBAS OK';
end $$;
