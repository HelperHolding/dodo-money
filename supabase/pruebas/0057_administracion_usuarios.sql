-- PRUEBAS OK revierte todos los cambios del ensayo.
do $$
declare a uuid;c uuid;g uuid;s uuid;j jsonb;k jsonb;n bigint;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select id into c from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='corporativo' limit 1;
 select id,sucursal_id into g,s from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='gerente' limit 1;
 if a is null or c is null or g is null then raise exception 'FALTAN DATOS: admin, corporativo y gerente activos.';end if;
 select jsonb_build_object('id',id,'nombre',nombre,'rol',rol,'sucursal_id',sucursal_id,'activo',activo,'debe_cambiar_contrasena',debe_cambiar_contrasena) into j from public.perfiles where id=g;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 set local role authenticated;
 select count(*) into n from public.usuarios_historial where usuario_id=g;
 perform public.administrar_usuario(g,j,'Usuario ensayo','encargado',s,false,'Baja de ensayo reversible');
 if not exists(select 1 from public.perfiles where id=g and nombre='Usuario ensayo' and rol::text='encargado' and not activo) then raise exception 'FALLÓ: cambios';end if;
 if (select count(*) from public.usuarios_historial where usuario_id=g)<>n+1 then raise exception 'FALLÓ: historial';end if;
 perform public.administrar_usuario(g,j,'Usuario ensayo','encargado',s,false,'Baja de ensayo reversible');
 if (select count(*) from public.usuarios_historial where usuario_id=g)<>n+1 then raise exception 'FALLÓ: doble envío';end if;
 begin perform public.administrar_usuario(g,j,'Otro nombre','gerente',s,true,'Cambio obsoleto');raise exception 'FALLÓ: sobrescritura';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 select jsonb_build_object('id',id,'nombre',nombre,'rol',rol,'sucursal_id',sucursal_id,'activo',activo,'debe_cambiar_contrasena',debe_cambiar_contrasena) into k from public.perfiles where id=g;
 begin perform public.administrar_usuario(g,k,'Otro nombre','gerente',s,true,'');raise exception 'FALLÓ: motivo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin perform public.administrar_usuario(g,k,'Otro nombre','gerente',null,true,'Sucursal faltante');raise exception 'FALLÓ: sucursal';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform public.administrar_usuario(g,k,j->>'nombre','gerente',s,true,'Reactivar usuario de ensayo');
 select jsonb_build_object('id',id,'nombre',nombre,'rol',rol,'sucursal_id',sucursal_id,'activo',activo,'debe_cambiar_contrasena',debe_cambiar_contrasena) into k from public.perfiles where id=a;
 begin perform public.administrar_usuario(a,k,k->>'nombre','gerente',(k->>'sucursal_id')::uuid,true,'Quitar acceso propio');raise exception 'FALLÓ: acceso propio';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 begin update public.usuarios_historial set motivo='Alterado';raise exception 'FALLÓ: escritura historial';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claims',json_build_object('sub',c,'role','authenticated')::text,true);
 if exists(select 1 from public.usuarios_historial) then raise exception 'FALLÓ: historial privado';end if;
 begin perform public.administrar_usuario(g,j,j->>'nombre','gerente',s,false,'Corporativo no gestiona');raise exception 'FALLÓ: corporativo';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 perform set_config('request.jwt.claims',json_build_object('sub',g,'role','authenticated')::text,true);
 begin perform public.administrar_usuario(g,j,j->>'nombre','admin',s,true,'Escalamiento de ensayo');raise exception 'FALLÓ: gerente';exception when others then if sqlerrm like 'FALLÓ:%' then raise;end if;end;
 if has_function_privilege('anon','public.administrar_usuario(uuid,jsonb,text,text,uuid,boolean,text)','execute') then raise exception 'FALLÓ: anónimo';end if;
 raise exception 'PRUEBAS OK — administración de usuarios · sucursal y rol · baja y reactivación · motivo e historial · doble envío · evita sobrescritura · protege acceso propio · historial privado · corporativo y gerente sin gestión · anónimo sin ejecución';
end $$;
