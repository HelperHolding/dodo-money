-- Ejecutar después de la migración. Ensayo completo, siempre se revierte.
begin;
do $prueba$
<<ensayo>>
declare a uuid;co uuid;g uuid;s uuid:=gen_random_uuid();r text;sol uuid:=gen_random_uuid();otro uuid;rep jsonb;m jsonb;resultado uuid;
 fuente text:=encode(decode('504b030400','hex'),'base64');originales jsonb;posteriores jsonb;
begin
 select id into a from public.perfiles where rol::text='admin' and activo and not debe_cambiar_contrasena limit 1;
 select id into co from public.perfiles where rol::text='corporativo' and activo and not debe_cambiar_contrasena limit 1;
 select id into g from public.perfiles where rol::text='gerente' and activo and not debe_cambiar_contrasena limit 1;
 select rfc into r from public.razones_sociales where activa and principal;
 if a is null or co is null or g is null or r is null then raise exception 'FALTAN DATOS: admin, corporativo, gerente y razón principal activos.';end if;
 select jsonb_build_array((select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'')) from public.cierres_dia x),(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'')) from public.recolecciones_corporativo x),(select count(*) from public.rappi_ordenes)) into originales;
 insert into public.sucursales(id,nombre) values(s,'ENSAYO FIN '||sol);
 insert into public.razon_social_sucursales(rfc,sucursal_id) values(r,s);
 m:=jsonb_build_object('fila',3,'fecha','2026-01-01','orden','99999001','tienda','99999000','lote','99999100','tipo','ORDEN','estado','pending_review','bruta',116,'aliado',0,'dar',0,'compensacion',0,'cancelacion',0,'comision',-20.88,'creditoDar',0,'ivaComision',-3.3408,'creditoDarIva',0,'retencionIva',-8,'retencionIsr',-2.5,'neto',81.2792);
 rep:=jsonb_build_object('desde','2026-01-01','hasta','2026-01-01','tienda','99999000','movimientos',jsonb_build_array(m),'uuidsComision','[]'::jsonb,'facturasComision','[]'::jsonb);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 resultado:=public.importar_rappi_financiero(sol,s,r,'ensayo.xlsx',fuente,rep,'{}','Prueba del cierre financiero');
 if resultado<>sol or not exists(select 1 from public.rappi_fin_importaciones x where x.id=sol and x.creado_por=a and x.reporte=rep) or not exists(select 1 from public.rappi_fin_archivos x where x.importacion_id=sol and x.contenido=decode(fuente,'base64')) then raise exception 'FALLÓ: importación, autor y original privado';end if;
 if public.importar_rappi_financiero(sol,s,r,'ensayo.xlsx',fuente,rep,'{}','Prueba del cierre financiero')<>sol or public.importar_rappi_financiero(gen_random_uuid(),s,r,'copia.xlsx',fuente,rep,'{}','Prueba del cierre financiero')<>sol then raise exception 'FALLÓ: doble envío';end if;
 begin perform public.importar_rappi_financiero(sol,s,r,'otro.xlsx',fuente,rep,'{}','Prueba del cierre financiero');raise exception 'FALLÓ: solicitud sobrescrita';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.importar_rappi_financiero(gen_random_uuid(),s,r,'neto.xlsx',encode(decode('504b030401','hex'),'base64'),jsonb_set(rep,'{movimientos,0,neto}','900'),array[sol],'Prueba del cierre financiero');raise exception 'FALLÓ: neto inválido';exception when others then if sqlerrm not like '%neto o los créditos%' then raise;end if;end;
 begin perform public.importar_rappi_financiero(gen_random_uuid(),s,r,'dar.xlsx',encode(decode('504b030402','hex'),'base64'),jsonb_set(rep,'{movimientos,0,dar}','-1'),array[sol],'Prueba del cierre financiero');raise exception 'FALLÓ: DAR inválido';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.importar_rappi_financiero(gen_random_uuid(),s,r,'duplicado.xlsx',encode(decode('504b030403','hex'),'base64'),jsonb_set(rep,'{movimientos}',jsonb_build_array(m,m)),array[sol],'Prueba del cierre financiero');raise exception 'FALLÓ: duplicado';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.importar_rappi_financiero(gen_random_uuid(),s,r,'fuente.xlsx',encode(decode('504b030404','hex'),'base64'),rep,'{}','Prueba del cierre financiero');raise exception 'FALLÓ: revisión obsoleta';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.importar_rappi_financiero(gen_random_uuid(),s,r,'motivo.xlsx',fuente,rep,array[sol],'Hoy');raise exception 'FALLÓ: motivo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 otro:=public.importar_rappi_financiero(gen_random_uuid(),s,r,'corregido.xlsx',encode(decode('504b030405','hex'),'base64'),rep,array[sol],'Corrección documentada del reporte');
 if not exists(select 1 from public.rappi_fin_importaciones x where x.id=sol and x.sustituida_por=otro and x.sustituida_en is not null and x.reporte=rep) or (select count(*) from public.rappi_fin_importaciones x where x.sucursal_id=s and x.sustituida_en is null)<>1 or (select count(*) from public.rappi_fin_archivos x where x.importacion_id in(sol,otro))<>2 then raise exception 'FALLÓ: versiones sin sobrescritura';end if;
 begin update public.rappi_fin_importaciones set motivo='Escritura directa' where id=sol;raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 begin delete from public.rappi_fin_archivos where importacion_id=sol;raise exception 'FALLÓ: borrar original';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',co,'role','authenticated')::text,true);
 if not exists(select 1 from public.rappi_fin_importaciones x where x.id=sol) or not exists(select 1 from public.rappi_fin_archivos x where x.importacion_id=sol) then raise exception 'FALLÓ: corporativo consulta';end if;
 begin perform public.importar_rappi_financiero(gen_random_uuid(),s,r,'corporativo.xlsx',fuente,rep,array[otro],'Prueba del cierre financiero');raise exception 'FALLÓ: corporativo modifica';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 if exists(select 1 from public.rappi_fin_importaciones x where x.id=sol) or exists(select 1 from public.rappi_fin_archivos x where x.importacion_id=sol) then raise exception 'FALLÓ: gerente consulta';end if;
 reset role;
 if has_function_privilege('anon','public.importar_rappi_financiero(uuid,uuid,text,text,text,jsonb,uuid[],text)','execute') or has_table_privilege('anon','public.rappi_fin_archivos','select') then raise exception 'FALLÓ: anónimo';end if;
 select jsonb_build_array((select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'')) from public.cierres_dia x),(select md5(coalesce(jsonb_agg(to_jsonb(x) order by x.id)::text,'')) from public.recolecciones_corporativo x),(select count(*) from public.rappi_ordenes)) into posteriores;
 if posteriores is distinct from originales then raise exception 'FALLÓ: cambió el historial operativo, corte físico o recolección';end if;
 raise notice 'PRUEBAS OK — financiero Rappi · tienda y empresa · DAR y neto · original privado · versiones · doble envío · revisión obsoleta · sin sobrescritura · conserva cortes y entrega 004 · corporativo consulta · gerente sin acceso · sin escritura directa · anónimo sin ejecución · ensayo reversible';
end;
$prueba$;
rollback;
