-- Ensayo reversible. El RAISE PRUEBAS OK revierte todos los datos de ensayo.
do $$
declare a uuid;c uuid;s1 uuid;s2 uuid;primaria text;n bigint;h jsonb;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select rfc into primaria from public.razones_sociales where principal;
 if a is null or c is null or primaria is null then raise exception 'FALTAN DATOS: admin, corporativo y empresa principal.';end if;
 insert into public.sucursales(nombre) values('Ensayo razón A '||gen_random_uuid()) returning id into s1;
 insert into public.sucursales(nombre) values('Ensayo razón B '||gen_random_uuid()) returning id into s2;
 insert into public.razones_sociales(rfc,razon_social) values('PRB010101AB1','Razón de ensayo');
 insert into public.razon_social_sucursales values('PRB010101AB1',s1);
 insert into public.razones_sociales(rfc,razon_social,activa) values('PRB010101AB2','Razón inactiva de ensayo',false);
 select count(*) into n from public.razones_sociales_historial;

 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 -- Agregar una sucursal: la razón social queda en las dos y deja historial.
 perform public.editar_sucursales_razon_social('prb010101ab1',array[s1,s2,s2],'Autorizar sucursal B');
 if (select count(*) from public.razon_social_sucursales where rfc='PRB010101AB1')<>2 then raise exception 'FALLÓ: agregar sucursal';end if;
 select datos into h from public.razones_sociales_historial where rfc='PRB010101AB1' order by id desc limit 1;
 if h->>'evento'<>'sucursales' or jsonb_array_length(h->'antes')<>1 or jsonb_array_length(h->'despues')<>2 or h->>'motivo'<>'Autorizar sucursal B' then raise exception 'FALLÓ: historial %',h;end if;
 -- Quitar una sucursal.
 perform public.editar_sucursales_razon_social('PRB010101AB1',array[s2],'Solo sucursal B');
 if exists(select 1 from public.razon_social_sucursales where rfc='PRB010101AB1' and sucursal_id=s1) or not exists(select 1 from public.razon_social_sucursales where rfc='PRB010101AB1' and sucursal_id=s2) then raise exception 'FALLÓ: quitar sucursal';end if;
 if (select count(*) from public.razones_sociales_historial)<>n+2 then raise exception 'FALLÓ: conteo de historial';end if;
 -- Rechazos.
 begin perform public.editar_sucursales_razon_social('PRB010101AB1',array[s2],'Sin cambios');raise exception 'FALLÓ: sin cambios';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.editar_sucursales_razon_social('PRB010101AB1','{}','Vacío de ensayo');raise exception 'FALLÓ: sin sucursales';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.editar_sucursales_razon_social('PRB010101AB1',array[s1],'no');raise exception 'FALLÓ: motivo corto';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.editar_sucursales_razon_social('PRB010101AB1',array[gen_random_uuid()],'Sucursal inventada');raise exception 'FALLÓ: sucursal inexistente';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.editar_sucursales_razon_social(primaria,array[s1],'Tocar la principal');raise exception 'FALLÓ: principal';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.editar_sucursales_razon_social('PRB010101AB2',array[s1],'Activar por la puerta trasera');raise exception 'FALLÓ: inactiva';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.editar_sucursales_razon_social('ZZZ010101AB1',array[s1],'RFC que no existe');raise exception 'FALLÓ: RFC inexistente';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin insert into public.razon_social_sucursales values('PRB010101AB1',s1);raise exception 'FALLÓ: escritura directa';exception when insufficient_privilege then null;end;
 -- Corporativo solo consulta.
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 begin perform public.editar_sucursales_razon_social('PRB010101AB1',array[s1],'Corporativo intenta');raise exception 'FALLÓ: corporativo edita';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 reset role;
 if has_function_privilege('anon','public.editar_sucursales_razon_social(text,uuid[],text)','execute') then raise exception 'FALLÓ: anon ejecuta';end if;
 raise exception 'PRUEBAS OK';
end $$;
