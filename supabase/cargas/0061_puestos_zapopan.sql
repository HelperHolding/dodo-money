-- Dos bases reutilizables desde el último desglose completo registrado; no cambia empleados ni nóminas.
begin;
do $$
declare s uuid;a uuid;v public.personal_versiones;r public.personal_puestos;puesto text;salario numeric;nombre_base text;d jsonb;k text;
begin
 select id into s from public.sucursales where lower(nombre)='zapopan-1';
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 if s is null or a is null then raise exception 'FALTAN DATOS: Zapopan-1 y administración.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 foreach puesto in array array['Jefe de turno','Pizzero / cajero'] loop
  salario:=case when puesto='Jefe de turno' then 13800 else 12000 end;
  nombre_base:=puesto||' · base $'||salario::text;
  select pv.* into v from public.personal_versiones pv join public.personal p on p.id=pv.personal_id
   where p.sucursal_id=s and lower(pv.datos->>'puesto')=lower(puesto) and (pv.datos->>'sueldo')::numeric=salario
   and not exists(select 1 from unnest(array['sueldo','bono','imss','cesantia','retiro','impuesto','infonavit','ajuste']) as c(valor) where jsonb_typeof(pv.datos->c.valor) is distinct from 'number')
   order by pv.desde desc,pv.creado_en desc,pv.id limit 1;
  if not found then raise exception 'FALTA DESGLOSE COMPLETO: % con sueldo %.',puesto,salario;end if;
  d:=jsonb_build_object('puesto',v.datos->>'puesto','renglon',v.datos->>'renglon');
  foreach k in array array['sueldo','bono','imss','cesantia','retiro','impuesto','infonavit','ajuste'] loop d:=d||jsonb_build_object(k,v.datos->k);end loop;
  select * into r from public.personal_puestos where sucursal_id=s and nombre=nombre_base;
  if found then
   if r.datos<>d then raise exception 'La plantilla % tiene otros importes. Revisa antes de reemplazar.',nombre_base;end if;
  else
   perform public.guardar_plantilla_puesto(gen_random_uuid(),nombre_base,v.id,'Base desde el desglose real previamente cargado. Revisar vigencia, cargas y ajuste al aplicarlo a una persona.');
  end if;
 end loop;
end $$;
select 'CARGA OK' resultado,nombre,datos->>'sueldo' sueldo,fuente from public.personal_puestos where sucursal_id=(select id from public.sucursales where lower(nombre)='zapopan-1') order by nombre;
commit;
