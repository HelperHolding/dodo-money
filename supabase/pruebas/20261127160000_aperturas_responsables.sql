-- Después de 20261127160000_aperturas_responsables.sql. PRUEBAS OK revierte todas las pruebas: no deja responsables, registros ni bitácora.
do $$
declare a uuid;p uuid;r uuid;i uuid;ru uuid;j uuid;u uuid;claves text[];n integer;t text;nombre_r text:='Prueba responsable '||left(gen_random_uuid()::text,8);
 nuevo_r text:='Prueba renombrada '||left(gen_random_uuid()::text,8);extra text:='';nombre_a text;
begin
 select id,nombre into a,nombre_a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by id limit 1;
 select proyecto_id into p from public.apertura_items order by proyecto_id,clave limit 1;
 if a is null or p is null then raise exception 'FALTAN DATOS: admin activo y una apertura con registros.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);

 -- Responsable externo y registro completo asignado a él.
 r:=public.guardar_responsable_apertura(null,nombre_r,null,true,true);
 i:=public.crear_apertura_item_completo(p,'actividad','P1',null,'Registro de prueba','Descripción de prueba',r,current_date,current_date+1);
 select responsable into t from public.apertura_items where id=i and responsable_id=r and clave like 'MAN-%' and descripcion='Descripción de prueba';
 if t is distinct from nombre_r then raise exception 'FALLÓ: el alta completa no quedó con el responsable (%)',t;end if;

 -- Bitácora.
 perform public.agregar_bitacora_apertura(i,null,30,'En curso','Bitácora de prueba');
 if (select count(*) from public.apertura_bitacora where item_id=i and usuario_id=a and avance=30)<>1 then raise exception 'FALLÓ: la bitácora no se guardó';end if;

 -- División en 2.
 claves:=public.dividir_apertura_item(i,jsonb_build_array(jsonb_build_object('nombre','Parte A de prueba','responsable_id',r),jsonb_build_object('nombre','Parte B de prueba')));
 select clave into t from public.apertura_items where id=i;
 if claves is distinct from array[t||'-1',t||'-2'] then raise exception 'FALLÓ: claves de la división (%), se esperaban %-1 y %-2',claves,t,t;end if;
 if (select count(*) from public.apertura_items where origen_id=i and proyecto_id=p and clave=any(claves))<>2 then raise exception 'FALLÓ: las partes no guardaron origen_id';end if;
 if not exists(select 1 from public.apertura_items where id=i and estado='no_aplica' and evidencia='Dividida en '||array_to_string(claves,', ')) then raise exception 'FALLÓ: la original no quedó no_aplica';end if;
 begin perform public.dividir_apertura_item(i,'[{"nombre":"x"},{"nombre":"y"}]');raise exception 'FALLÓ: dividió una original que ya no aplica';
 exception when others then if sqlerrm<>'Este registro ya no aplica; no se puede dividir.' then raise;end if;end;
 -- El equipo no se divide (perdería cantidad, precio, orden y factura).
 j:=public.crear_apertura_item_completo(p,'equipo','P4',null,'Equipo de prueba',null,null,null,null);
 begin perform public.dividir_apertura_item(j,'[{"nombre":"x"},{"nombre":"y"}]');raise exception 'FALLÓ: dividió un equipo';
 exception when others then if sqlerrm<>'Solo se pueden dividir actividades y validaciones; para equipo, ajusta cantidades o agrega partidas.' then raise;end if;end;
 -- La bitácora se lee con el nombre de quien la escribió.
 if not exists(select 1 from public.bitacora_apertura(i) b where b.avance=30 and b.usuario_nombre is not distinct from nombre_a) then raise exception 'FALLÓ: bitacora_apertura no trae el autor';end if;

 -- Renombrar en el catálogo sincroniza el texto de sus registros.
 perform public.guardar_responsable_apertura(r,nuevo_r,null,true,true);
 select count(*) into n from public.apertura_items where responsable_id=r and responsable=nuevo_r;
 if n<>2 then raise exception 'FALLÓ: el renombre sincronizó % de 2 registros',n;end if;

 -- Si hay un usuario activo que no es admin ni corporativo y no está en el catálogo, se prueba como responsable.
 select id into u from public.perfiles x where x.activo and not x.debe_cambiar_contrasena and x.rol::text not in ('admin','corporativo')
  and not exists(select 1 from public.apertura_responsables y where y.perfil_id=x.id) order by x.id limit 1;
 if u is not null then
  ru:=public.guardar_responsable_apertura(null,'Prueba usuario '||left(gen_random_uuid()::text,8),u,false,true);
  j:=public.crear_apertura_item_completo(p,'actividad','P2',null,'Registro del usuario de prueba',null,ru,null,null);
  perform public.actualizar_apertura_item(j,1,'{"precio":"10"}');
  perform public.agregar_bitacora_apertura(j,null,null,null,'Bitácora del registro del usuario');
  perform set_config('request.jwt.claims',json_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  if (select count(*) from public.apertura_items)<>1 or not exists(select 1 from public.apertura_items where id=j) then raise exception 'FALLÓ: el responsable ve registros ajenos';end if;
  if (select count(*) from public.apertura_proyectos)<>1 then raise exception 'FALLÓ: el responsable ve aperturas ajenas';end if;
  if (select count(*) from public.apertura_bitacora where item_id<>j)<>0 or (select count(*) from public.apertura_historial where item_id<>j)<>0 then raise exception 'FALLÓ: el responsable ve bitácora o historial ajenos';end if;
  begin perform public.actualizar_apertura_item(j,2,'{"precio":"1"}');raise exception 'FALLÓ: el responsable cambió el precio';
  exception when others then if sqlerrm<>'Solo administración puede cambiar precio.' then raise;end if;end;
  perform public.actualizar_apertura_item(j,2,'{"estado":"en_curso","notas":"Prueba"}');
  if not exists(select 1 from public.apertura_items where id=j and estado='en_curso' and precio=10) then raise exception 'FALLÓ: el responsable no pudo cambiar el estado';end if;
  -- Nombre de la sucursal y autor de la bitácora aunque el RLS de sucursales y perfiles no se los muestre; nada ajeno.
  if (select count(*) from public.nombres_aperturas_visibles())<>1 or not exists(select 1 from public.nombres_aperturas_visibles() x where x.proyecto_id=p and x.sucursal_nombre is not null) then raise exception 'FALLÓ: nombres_aperturas_visibles del responsable';end if;
  if (select count(*) from public.bitacora_apertura(j) b where b.usuario_nombre is not distinct from nombre_a)<>1 then raise exception 'FALLÓ: bitacora_apertura del responsable';end if;
  if exists(select 1 from public.bitacora_apertura(i)) then raise exception 'FALLÓ: bitacora_apertura muestra un registro ajeno';end if;
  execute 'reset role';
  extra:=' · usuario responsable: ve solo su registro y no cambia el precio; nombres de sucursal y bitácora';
 end if;

 raise exception 'PRUEBAS OK — alta completa · bitácora · división en 2 con claves y original no_aplica · renombre sincronizado%',extra;
end $$;
