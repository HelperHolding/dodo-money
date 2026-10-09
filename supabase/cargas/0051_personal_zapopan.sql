-- Carga inicial desde el desglose confirmado de septiembre. No modifica nómina ni pagos.
begin;
do $$
declare s uuid;a uuid;p uuid;v uuid;e jsonb;datos jsonb;pendiente jsonb;filas jsonb:=$datos$[{"nombre": "RIVAS HERNANDEZ BRANDON MANUEL", "puesto": "Jefe de turno", "renglon": "gerencia", "sueldo": 13800, "imss": 2355.8, "cesantia": 1087.92, "retiro": 289.6, "impuesto": 276, "infonavit": 724.02, "ajuste": -74.3, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería.", "bono": 0, "ingreso": null, "baja": null, "codigo": "001"}, {"nombre": "HERNANDEZ CORTES EDGAR RAUL", "puesto": "Pizzero / cajero", "renglon": "cocina", "sueldo": 12000, "imss": 2013.72, "cesantia": 832.68, "retiro": 251.84, "impuesto": 240, "infonavit": 629.58, "ajuste": 48.74, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería.", "bono": 0, "ingreso": null, "baja": null, "codigo": "002"}, {"nombre": "COMPARAN QUIRARTE GAEL", "puesto": "Jefe de turno", "renglon": "gerencia", "sueldo": 13800, "imss": 2355.8, "cesantia": 1087.92, "retiro": 289.6, "impuesto": 276, "infonavit": 724.02, "ajuste": -74.3, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería.", "bono": 0, "ingreso": null, "baja": null, "codigo": "003"}, {"nombre": "TELLO HERNANDEZ EDITH LIZBETH", "puesto": "Pizzero / cajero", "renglon": "cocina", "sueldo": 12000, "imss": 2013.72, "cesantia": 832.68, "retiro": 251.84, "impuesto": 240, "infonavit": 629.58, "ajuste": 48.74, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería.", "bono": 0, "ingreso": null, "baja": null, "codigo": "004"}, {"nombre": "ARRIOLA MARTINEZ LEONARDO ALEXANDER", "puesto": "Pizzero / cajero", "renglon": "cocina", "sueldo": 6800, "imss": 1141.1, "cesantia": 471.85, "retiro": 142.71, "impuesto": 136, "infonavit": 356.76, "ajuste": 27.62, "nota": "Se conserva TOTAL OBLIGACIONES del reporte; ajuste muestra su diferencia con los conceptos. IMSS empresa ya incluye invalidez, enfermedad, riesgo y guardería.", "bono": 0, "ingreso": null, "baja": null, "codigo": "005"}, {"nombre": "Ricardo Villa", "puesto": "Gerente Distrital", "renglon": "gerencia", "sueldo": 22000, "imss": 0, "cesantia": 0, "retiro": 0, "impuesto": 0, "infonavit": 0, "ajuste": 0, "nota": "Excepción septiembre: importe completo de $22,000 netos reconocido sin cargas adicionales por instrucción de administración. Desde octubre falta sueldo bruto y desglose patronal; no extrapolar septiembre.", "bono": 0, "ingreso": null, "baja": null, "codigo": "RV-PENDIENTE"}]$datos$::jsonb;k text;
begin
 select id into s from public.sucursales where lower(nombre)='zapopan-1';
 select id into a from public.perfiles where activo and not debe_cambiar_contrasena and rol::text='admin' limit 1;
 if s is null or a is null then raise exception 'FALTAN DATOS: Zapopan-1 y admin activo.';end if;
 perform set_config('request.jwt.claims',json_build_object('sub',a,'role','authenticated')::text,true);
 for e in select value from jsonb_array_elements(filas) loop
  p:=null;v:=null;datos:=e-'codigo';
  select id into p from public.personal where sucursal_id=s and codigo=e->>'codigo';
  if p is not null then
   if exists(select 1 from public.personal_versiones pv where pv.personal_id=p and pv.desde=date '2026-09-01' and pv.sustituida_en is null and pv.datos=e) and exists(select 1 from public.personal_versiones where personal_id=p and desde=date '2026-10-01' and sustituida_en is null) then continue;end if;
   raise exception 'Ya hay otro perfil con código %. Revisa antes de cargar.',e->>'codigo';
  end if;
  p:=public.guardar_personal(null,s,e->>'codigo',date '2026-09-01',date '2026-09-30',datos,null);
  select id into v from public.personal_versiones where personal_id=p and sustituida_en is null order by desde desc limit 1;
  pendiente:=datos;
  foreach k in array array['sueldo','bono','imss','cesantia','retiro','impuesto','infonavit','ajuste'] loop pendiente:=jsonb_set(pendiente,array[k],'null'::jsonb);end loop;
  pendiente:=jsonb_set(pendiente,'{nota}',to_jsonb('Octubre: completar sueldo bruto y obligaciones reales. No extrapolar septiembre. Fecha de ingreso pendiente.'::text||case when e->>'codigo'='RV-PENDIENTE' then ' Ricardo aún no tiene código CONTPAQi informado.' else '' end));
  perform public.guardar_personal(p,s,e->>'codigo',date '2026-10-01',null,pendiente,v);
 end loop;
end $$;
select 'CARGA OK' resultado,count(*) perfiles from public.personal where sucursal_id=(select id from public.sucursales where lower(nombre)='zapopan-1') and codigo in ('001','002','003','004','005','RV-PENDIENTE');
commit;
