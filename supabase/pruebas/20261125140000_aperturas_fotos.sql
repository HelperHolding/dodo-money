-- Después de 20261125140000_aperturas_fotos.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;p uuid;i uuid;j uuid;f1 text;f2 text;f3 text;r record;d record;ant text;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select proyecto_id,id into p,i from public.apertura_items where tipo='equipo' order by proyecto_id,clave limit 1;
 select id into j from public.apertura_items where tipo='equipo' and proyecto_id=p and id<>i order by clave limit 1;
 if a is null or i is null or j is null then raise exception 'FALTAN DATOS: admin activo y una apertura con dos partidas de equipo.';end if;
 f1:=p||'/'||gen_random_uuid()||'.jpg';f2:=p||'/'||gen_random_uuid()||'.png';f3:=p||'/'||gen_random_uuid()||'.webp';
 insert into storage.objects(bucket_id,name) values('aperturas-fotos',f1),('aperturas-fotos',f2),('aperturas-fotos',f3);
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 select * into r from public.importar_apertura_dodo(p,jsonb_build_array(
  jsonb_build_object('item_id',i,'codigo','PRUEBA-1','matriz','digital','matriz_url','https://docs.google.com/spreadsheets/d/prueba','sustituto','Sustituto de prueba','foto',f1),
  jsonb_build_object('item_id',j,'codigo','PRUEBA-2','matriz','mobiliario')));
 if r.ligadas<>2 or r.con_foto<>1 then raise exception 'FALLÓ: la importación inicial (% ligadas, % con foto)',r.ligadas,r.con_foto;end if;
 ant:=public.guardar_foto_real(i,f3);
 if ant is not null then raise exception 'FALLÓ: la foto real no debía tener anterior';end if;
 select * into r from public.importar_apertura_dodo(p,jsonb_build_array(jsonb_build_object('item_id',i,'codigo','PRUEBA-1','matriz','digital','foto',f2)));
 select * into d from public.apertura_item_dodo where item_id=i;
 if d.foto_real is distinct from f3 then raise exception 'FALLÓ: la reimportación perdió la foto real';end if;
 if d.foto_proyecto is distinct from f2 then raise exception 'FALLÓ: la reimportación no reemplazó la foto del proyecto';end if;
 if r.fotos_anteriores is distinct from array[f1] then raise exception 'FALLÓ: la foto anterior no se devolvió (%)',r.fotos_anteriores;end if;
 select * into d from public.apertura_item_dodo where item_id=j;
 if d.foto_proyecto is not null or d.matriz is distinct from 'mobiliario' then raise exception 'FALLÓ: la partida sin foto quedó mal';end if;
 raise exception 'PRUEBAS OK — importa 2 partidas · foto real se conserva al reimportar · la foto anterior del proyecto se devuelve';
end $$;
