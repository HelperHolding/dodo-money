-- Después de 20261109180000_capex_aperturas.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;c uuid;p uuid;r integer;n integer;
begin
 select id into a from public.perfiles where activo and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and rol::text='corporativo' limit 1;
 select id into p from public.apertura_proyectos order by id limit 1;
 if a is null or p is null then raise exception 'FALTAN DATOS: un admin y al menos una apertura.';end if;
 if (select count(*) from public.capex_categorias)<>10 then raise exception 'FALLÓ: categorías';end if;
 if (select count(*) from public.capex_equivalencias_historico)<>23 then raise exception 'FALLÓ: equivalencias del histórico';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 select coalesce(max(revision),0) into n from public.capex_presupuestos where proyecto_id=p;
 r:=public.aprobar_capex_presupuesto(p,n,'{"obra_civil":100,"equipo_cocina":50}'::jsonb,'Prueba de revisión');
 if r<>n+1 or (select sum(monto) from public.capex_presupuestos where proyecto_id=p and revision=r)<>150 then raise exception 'FALLÓ: aprobar presupuesto';end if;
 begin perform public.aprobar_capex_presupuesto(p,n,'{"obra_civil":1}'::jsonb,'Prueba de conflicto');raise exception 'FALLÓ: conflicto de revisión';
 exception when others then if sqlerrm not like 'El presupuesto cambió%' then raise;end if;end;
 begin perform public.guardar_capex_asignacion('factura',gen_random_uuid(),'[]'::jsonb,'Prueba documento inexistente');raise exception 'FALLÓ: documento inexistente';
 exception when others then if sqlerrm<>'El documento no existe.' then raise;end if;end;
 perform 1 from public.capex_resumen where proyecto_id=p;
 perform 1 from public.capex_historico;
 if c is not null then
  perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
  begin perform public.aprobar_capex_presupuesto(p,r,'{"obra_civil":1}'::jsonb,'Prueba corporativo');raise exception 'FALLÓ: corporativo aprueba';
  exception when others then if sqlerrm not like 'Solo administración%' then raise;end if;end;
 end if;
 if has_function_privilege('anon','public.aprobar_capex_presupuesto(uuid,integer,jsonb,text)','EXECUTE')
 or has_function_privilege('anon','public.guardar_capex_asignacion(text,uuid,jsonb,text)','EXECUTE')
 or has_function_privilege('anon','public.guardar_capex_equivalencia(text,text,text)','EXECUTE') then raise exception 'FALLÓ: permisos de anon';end if;
 raise exception 'PRUEBAS OK — 10 categorías · 23 equivalencias · revisión de presupuesto con conflicto · documento inexistente rechazado · vistas legibles · corporativo no aprueba · anon sin ejecutar';
end $$;
