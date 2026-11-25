-- Carga del presupuesto CAPEX de Guadalajara-1 (López Mateos) desde el corte del 13-oct-2026.
-- Después de 20261109180000_capex_aperturas.sql. Idempotente: si ya hay presupuesto, no toca nada.
-- Montos sin IVA. Reparto concepto → categoría:
--   Obra civil                     1,325,236.75 → obra_civil
--   Equipo de cocina               1,226,257.79 → equipo_cocina
--   Tecnología                       128,000.00 → tecnologia
--   Mobiliario                        19,800.00 → mobiliario
--   Smallware                        170,586.80 → smallware
--   Proyecto y permisos               28,500.00 → proyecto_permisos
--   Total                          2,898,381.34 (las demás categorías quedan en 0)
do $$
declare v_proyecto uuid;v_n integer;v_admin uuid;v_total numeric;
begin
 select count(*) into v_n from public.apertura_proyectos p join public.sucursales s on s.id=p.sucursal_id where s.nombre ilike 'Guadalajara-1%';
 if v_n<>1 then raise exception 'Se esperaba una sola apertura de Guadalajara-1 y hay %',v_n;end if;
 select p.id into v_proyecto from public.apertura_proyectos p join public.sucursales s on s.id=p.sucursal_id where s.nombre ilike 'Guadalajara-1%';
 if exists(select 1 from public.capex_presupuestos where proyecto_id=v_proyecto) then
  raise notice 'Ya hay presupuesto CAPEX: no se carga nada.';
  return;
 end if;
 select id into v_admin from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' order by nombre,id limit 1;
 if v_admin is null then raise exception 'Falta un admin activo sin cambio de contraseña pendiente.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',v_admin,'role','authenticated')::text,true);
 perform public.aprobar_capex_presupuesto(v_proyecto,0,jsonb_build_object(
  'obra_civil',1325236.75,'equipo_cocina',1226257.79,'tecnologia',128000.00,
  'mobiliario',19800.00,'smallware',170586.80,'proyecto_permisos',28500.00),
  'Corte del presupuesto del 13-oct-2026 (Dodo2_Presupuesto_Final.xlsx)');
 select sum(monto) into v_total from public.capex_presupuestos where proyecto_id=v_proyecto and revision=1;
 if v_total is distinct from 2898381.34 then raise exception 'FALLÓ: la suma de la revisión 1 es % y debía ser 2898381.34',v_total;end if;
 raise notice 'Presupuesto CAPEX cargado (revisión 1): 6 categorías, total %.',v_total;
end $$;
