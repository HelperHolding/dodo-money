-- Pruebas de la migración 0005 (checklists de zonas). Córrelas completas en Supabase → SQL Editor
-- después de 0005_checklists_zonas.sql y seed_checklists_zonas.sql.
-- Necesitan un encargado activo y otro usuario activo en su misma sucursal (si no hay cajero, ese usuario
-- actúa como cajero, y otro perfil actúa como corporativo, solo mientras corre el script).
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_enc uuid; v_caj uuid; v_suc uuid; v_corpo uuid;
  v_enc_man uuid; v_prep uuid; v_limp uuid; v_resp jsonb; v_resp_mala jsonb; v_reg uuid;
  v_ayer date := dia_operativo() - 1; v_n int; v_ok text[] := '{}';
begin
  -- ── Sin usuarios ───────────────────────────────────────────────────────
  if area_limpieza_profunda('2026-09-21') <> 'Horno (parte de arriba)' then raise exception 'FALLÓ: 21 sep 2026 (semana 39, lunes) debe ser Horno (parte de arriba)'; end if;
  if area_limpieza_profunda('2026-09-28') <> 'Horno (parte de abajo)' then raise exception 'FALLÓ: 28 sep 2026 (semana 40, lunes) debe ser Horno (parte de abajo)'; end if;
  if area_limpieza_profunda('2026-09-23') <> 'Cocina' then raise exception 'FALLÓ: 23 sep 2026 (semana 39, miércoles) debe ser Cocina'; end if;
  if area_limpieza_profunda('2027-01-01') <> 'Congelador' and area_limpieza_profunda('2027-01-01') <> 'Fregadero de fregonas y almacén' then
    raise exception 'FALLÓ: 1 ene 2027 debe tener área de viernes'; end if;
  v_ok := array_append(v_ok, 'área de limpieza profunda');

  select id into v_enc_man from checklists where clave = 'encargado_manana';
  select id into v_prep from checklists where clave = 'preparaciones';
  select id into v_limp from checklists where clave = 'limpieza';
  if v_enc_man is null or v_prep is null or v_limp is null then raise exception 'FALTAN DATOS: corre seed_checklists_zonas.sql.'; end if;
  select jsonb_agg(jsonb_build_object('punto_id', id, 'cumple', true)) into v_resp
    from checklist_puntos where checklist_id = v_prep and momento = 'cierre';
  select jsonb_agg(jsonb_build_object('punto_id', id, 'cumple', false)) into v_resp_mala
    from checklist_puntos where checklist_id = v_prep and momento = 'cierre';

  -- Recorrido sigue aislado: registrar_recorrido no acepta una lista.
  begin
    perform registrar_recorrido(v_prep, dia_operativo(), 12, '[]'::jsonb);
    raise exception 'FALLÓ: registrar_recorrido no debe aceptar listas';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Checklist no encontrado%' then raise exception 'FALLÓ: mensaje inesperado (recorrido con lista): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'recorridos aislados');

  -- Usuarios de prueba.
  select e.id, c.id, e.sucursal_id into v_enc, v_caj, v_suc
    from perfiles e join perfiles c on c.sucursal_id = e.sucursal_id and c.id <> e.id and c.activo
   where e.rol = 'encargado' and e.activo
   order by (c.rol = 'cajero') desc
   limit 1;
  if v_enc is null then raise exception 'FALTAN DATOS: se necesita un encargado activo y otro usuario activo en su sucursal.'; end if;
  update perfiles set rol = 'cajero' where id = v_caj;
  select id into v_corpo from perfiles where activo and id not in (v_enc, v_caj) limit 1;

  -- ── Como cajero ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_caj, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform registrar_checklist(v_enc_man, 'apertura', null, null, 'Prueba', '[]'::jsonb);
    raise exception 'FALLÓ: un cajero no debe registrar listas del encargado';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Esta lista la registra%' then raise exception 'FALLÓ: mensaje inesperado (cajero lista encargado): %', sqlerrm; end if;
  end;
  begin
    perform registrar_checklist(v_prep, 'cierre', null, null, '   ', v_resp);
    raise exception 'FALLÓ: una lista sin nombre debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe quién%' then raise exception 'FALLÓ: mensaje inesperado (sin nombre): %', sqlerrm; end if;
  end;
  begin
    perform registrar_checklist(v_prep, 'cierre', null, null, 'Prueba', '[]'::jsonb);
    raise exception 'FALLÓ: una lista incompleta debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Marca Cumple%' then raise exception 'FALLÓ: mensaje inesperado (incompleta): %', sqlerrm; end if;
  end;
  begin
    perform registrar_checklist(v_prep, 'cierre', null, null, 'Prueba', v_resp_mala);
    raise exception 'FALLÓ: un no cumple sin comentario debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe qué pasó%' then raise exception 'FALLÓ: mensaje inesperado (no cumple): %', sqlerrm; end if;
  end;
  begin
    perform registrar_checklist(v_limp, 'hora', v_ayer, 8, 'Prueba',
      (select jsonb_agg(jsonb_build_object('punto_id', id, 'cumple', true)) from checklist_puntos where checklist_id = v_limp and momento = 'hora'));
    raise exception 'FALLÓ: una ronda de una hora cerrada debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'La hora de las 08:00 cerró%' then raise exception 'FALLÓ: mensaje inesperado (ronda fuera de hora): %', sqlerrm; end if;
  end;
  begin
    insert into objetivos_turno (sucursal_id, turno, empleado, objetivo) values (v_suc, 'manana', 'x', 'y');
    raise exception 'FALLÓ: un cajero no debe registrar objetivos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado (objetivo cajero): %', sqlerrm; end if;
  end;
  begin
    insert into lotes_amasado (sucursal_id, inicio, fin, temp_area, plan_bolas, bolas_resultado, temp_sala, temp_harina, temp_agua, temp_masa,
                               g_agua, g_sal, g_azucar, g_aceite, g_harina, g_levadura, minutos_amasado, empleado)
    values (v_suc, '10:00', '10:05', 25, 40, 40, 22, 20, 15, 28, 1000, 40, 20, 30, 1500, 10, 5, 'Prueba');
    raise exception 'FALLÓ: masa a 28 °C sin comentario debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe qué pasó: la masa%' then raise exception 'FALLÓ: mensaje inesperado (amasado): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'reglas de registro');

  if not exists (select 1 from registros_checklist where sucursal_id = v_suc and checklist_id = v_prep and fecha = dia_operativo() and momento = 'cierre') then
    v_reg := registrar_checklist(v_prep, 'cierre', null, null, 'Prueba', v_resp);
    begin
      perform registrar_checklist(v_prep, 'cierre', null, null, 'Prueba', v_resp);
      raise exception 'FALLÓ: la misma lista no debe registrarse dos veces';
    exception when unique_violation then null;
    end;
    begin
      perform revisar('checklist', v_reg);
      raise exception 'FALLÓ: un cajero no debe marcar revisado';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like 'Solo el encargado%' then raise exception 'FALLÓ: mensaje inesperado (cajero revisa): %', sqlerrm; end if;
    end;
    v_ok := array_append(v_ok, 'sin duplicados y cajero no revisa');
  end if;

  if not exists (select 1 from limpiezas_profundas where sucursal_id = v_suc and fecha = dia_operativo()) then
    insert into limpiezas_profundas (sucursal_id, empleado) values (v_suc, 'Prueba');
    select count(*) into v_n from limpiezas_profundas
     where sucursal_id = v_suc and fecha = dia_operativo() and area = area_limpieza_profunda(dia_operativo());
    if v_n <> 1 then raise exception 'FALLÓ: la limpieza profunda debe tomar el área del día'; end if;
    v_ok := array_append(v_ok, 'limpieza profunda con área del día');
  end if;

  -- ── Como encargado ─────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_enc, 'role', 'authenticated')::text, true);
  if v_reg is not null then
    perform revisar('checklist', v_reg);
    begin
      perform revisar('checklist', v_reg);
      raise exception 'FALLÓ: no se debe revisar dos veces';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like 'Ya estaba revisado%' then raise exception 'FALLÓ: mensaje inesperado (revisar dos veces): %', sqlerrm; end if;
    end;
    v_ok := array_append(v_ok, 'encargado revisa una vez');
  end if;
  insert into objetivos_turno (sucursal_id, turno, empleado, objetivo) values (v_suc, 'manana', 'Prueba', 'Sacar 20 pizzas en 15 min');
  v_ok := array_append(v_ok, 'encargado registra objetivos');

  -- ── Como corporativo ───────────────────────────────────────────────────
  if v_corpo is not null then
    execute 'reset role';
    update perfiles set rol = 'corporativo', sucursal_id = null where id = v_corpo;
    perform set_config('request.jwt.claims', json_build_object('sub', v_corpo, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform registrar_checklist(v_prep, 'apertura', null, null, 'x', '[]'::jsonb);
      raise exception 'FALLÓ: corporativo no debe registrar listas';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo lista): %', sqlerrm; end if;
    end;
    begin
      perform revisar('checklist', gen_random_uuid());
      raise exception 'FALLÓ: corporativo no debe revisar';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo revisa): %', sqlerrm; end if;
    end;
    begin
      insert into limpiezas_profundas (sucursal_id, empleado) values (v_suc, 'x');
      raise exception 'FALLÓ: corporativo no debe registrar limpieza profunda';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like '%row-level security%' and sqlerrm not like '%duplicate key%' then raise exception 'FALLÓ: mensaje inesperado (corporativo limpieza): %', sqlerrm; end if;
    end;
    v_ok := array_append(v_ok, 'corporativo no registra');
  end if;

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
