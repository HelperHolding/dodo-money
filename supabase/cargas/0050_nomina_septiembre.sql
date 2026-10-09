-- Ejecutar después de migración 0050 y su prueba. No registra pagos.
-- Fuente: Acumulado Septiembre.xlsx, Hoja1 filas 14–18; Ricardo por instrucción del usuario.
begin;
do $$
declare s uuid;a uuid;actual public.nomina_reales; filas jsonb:=$datos$[{"nombre": "RIVAS HERNANDEZ BRANDON MANUEL", "puesto": "Jefe de turno", "renglon": "gerencia", "sueldo": 13800, "imss": 2355.8, "cesantia": 1087.92, "retiro": 289.6, "impuesto": 276, "infonavit": 724.02, "ajuste": -74.3, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería."}, {"nombre": "HERNANDEZ CORTES EDGAR RAUL", "puesto": "Pizzero / cajero", "renglon": "cocina", "sueldo": 12000, "imss": 2013.72, "cesantia": 832.68, "retiro": 251.84, "impuesto": 240, "infonavit": 629.58, "ajuste": 48.74, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería."}, {"nombre": "COMPARAN QUIRARTE GAEL", "puesto": "Jefe de turno", "renglon": "gerencia", "sueldo": 13800, "imss": 2355.8, "cesantia": 1087.92, "retiro": 289.6, "impuesto": 276, "infonavit": 724.02, "ajuste": -74.3, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería."}, {"nombre": "TELLO HERNANDEZ EDITH LIZBETH", "puesto": "Pizzero / cajero", "renglon": "cocina", "sueldo": 12000, "imss": 2013.72, "cesantia": 832.68, "retiro": 251.84, "impuesto": 240, "infonavit": 629.58, "ajuste": 48.74, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería."}, {"nombre": "ARRIOLA MARTINEZ LEONARDO ALEXANDER", "puesto": "Pizzero / cajero", "renglon": "cocina", "sueldo": 6800, "imss": 1141.1, "cesantia": 471.85, "retiro": 142.71, "impuesto": 136, "infonavit": 356.76, "ajuste": 27.62, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería."}, {"nombre": "Ricardo Villa", "puesto": "Gerente Distrital", "renglon": "gerencia", "sueldo": 22000, "imss": 0, "cesantia": 0, "retiro": 0, "impuesto": 0, "infonavit": 0, "ajuste": 0, "nota": "Excepción septiembre: importe completo de $22,000 netos reconocido sin cargas adicionales por instrucción de administración. Desde octubre falta sueldo bruto y desglose patronal; no extrapolar septiembre."}]$datos$::jsonb; nuevo uuid;
begin
 select id into s from public.sucursales where lower(nombre)='zapopan-1';
 if s is null then raise exception 'FALTAN DATOS: Zapopan-1.';end if;
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 if a is null then raise exception 'FALTAN DATOS: administrador activo.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 select * into actual from public.nomina_reales where sucursal_id=s and mes=date '2026-09-01' and anulada_en is null;
 if found then
  if actual.empleados<>filas then raise exception 'Ya hay otra nómina real de septiembre; revisa antes de sustituirla.';end if;
 else
  nuevo:=public.guardar_nomina_real(s,date '2026-09-01','Acumulado Septiembre CONTPAQi: total reportado conservado; diferencia patronal -23.50. Ricardo Villa: excepción septiembre 22,000 sin cargas; octubre pendiente.',filas,null);
 end if;
end $$;
select 'CARGA OK' resultado,mes,jsonb_array_length(empleados) empleados,
 (select sum((e->>'sueldo')::numeric) from jsonb_array_elements(empleados)e) sueldos,
 (select sum((e->>'imss')::numeric+(e->>'cesantia')::numeric+(e->>'retiro')::numeric+(e->>'impuesto')::numeric+(e->>'infonavit')::numeric+(e->>'ajuste')::numeric) from jsonb_array_elements(empleados)e) obligaciones
 from public.nomina_reales where sucursal_id=(select id from public.sucursales where lower(nombre)='zapopan-1') and mes=date '2026-09-01' and anulada_en is null;
commit;
