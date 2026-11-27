-- Prueba de la carga capex_presupuesto_guadalajara1_corte_20261013.sql. PRUEBAS OK revierte todo.
do $$
declare v_proyecto uuid;v_n integer;v_admin uuid;v_rev integer;v_total numeric;
begin
 select count(*) into v_n from public.apertura_proyectos p join public.sucursales s on s.id=p.sucursal_id where s.nombre ilike 'Guadalajara-1%';
 if v_n<>1 then raise exception 'Se esperaba una sola apertura de Guadalajara-1 y hay %',v_n;end if;
 select p.id into v_proyecto from public.apertura_proyectos p join public.sucursales s on s.id=p.sucursal_id where s.nombre ilike 'Guadalajara-1%';
 select max(revision) into v_rev from public.capex_presupuestos where proyecto_id=v_proyecto;
 if v_rev is not null then
  raise exception 'PRUEBAS OK — ya existía presupuesto (revisión %), no se tocó',v_rev;
 end if;
 -- Aprobador: de preferencia scervera@dodopizza.mx (trazabilidad); si no está disponible, el primer admin activo.
 select p.id into v_admin from public.perfiles p join auth.users u on u.id=p.id where p.activo and not p.debe_cambiar_contrasena and p.rol::text='admin' and lower(u.email)='scervera@dodopizza.mx' limit 1;
 if v_admin is null then
  select id into v_admin from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by nombre,id limit 1;
 end if;
 if v_admin is null then raise exception 'Falta un admin activo sin cambio de contraseña pendiente.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',v_admin,'role','authenticated')::text,true);
 perform public.aprobar_capex_presupuesto(v_proyecto,0,jsonb_build_object(
  'obra_civil',1325236.75,'equipo_cocina',1226257.79,'tecnologia',128000.00,
  'mobiliario',19800.00,'smallware',170586.80,'proyecto_permisos',28500.00),
  'Corte del presupuesto del 13-oct-2026 (Dodo2_Presupuesto_Final.xlsx)');
 select max(revision) into v_rev from public.capex_presupuestos where proyecto_id=v_proyecto;
 select sum(monto) into v_total from public.capex_presupuestos where proyecto_id=v_proyecto and revision=v_rev;
 if v_rev<>1 or v_total is distinct from 2898381.34 then raise exception 'FALLÓ: revisión % con total %',v_rev,v_total;end if;
 if (select count(*) from public.capex_presupuestos where proyecto_id=v_proyecto and revision=1)<>10 then raise exception 'FALLÓ: la revisión 1 debe tener las 10 categorías';end if;
 raise exception 'PRUEBAS OK — revisión 1 · 6 categorías con monto · total 2898381.34';
end $$;
