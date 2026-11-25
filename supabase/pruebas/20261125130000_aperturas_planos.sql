-- Después de 20261125130000_aperturas_planos.sql. PRUEBAS OK revierte todas las pruebas.
do $$
declare a uuid;p uuid;i uuid;h uuid;r integer;m integer;
begin
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 select proyecto_id,id into p,i from public.apertura_items order by proyecto_id,clave limit 1;
 if a is null or i is null then raise exception 'FALTAN DATOS: admin activo y una apertura con una partida.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 h:=public.guardar_apertura_plano(p,'PRUEBA','Hoja de prueba',current_date,p||'/o.pdf',p||'/i.png',1000,800,null);
 perform public.colocar_apertura_marca(h,i,0.25,0.75);
 h:=public.guardar_apertura_plano(p,'PRUEBA','Hoja de prueba v2',current_date,p||'/o2.pdf',p||'/i2.png',1000,800,1);
 select revision into r from public.apertura_planos where id=h;
 select count(*) into m from public.apertura_plano_marcas where plano_id=h and item_id=i and x=0.25 and y=0.75;
 if r<>2 then raise exception 'FALLÓ: la revisión no subió (%)',r;end if;
 if m<>1 then raise exception 'FALLÓ: la marca no se conservó al reemplazar';end if;
 raise exception 'PRUEBAS OK — hoja creada · marca colocada · reemplazo conserva marcas y sube revisión';
end $$;
