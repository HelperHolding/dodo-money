-- Mermas desde la API de Dodo IS. El cron usa la llave de servicio (sin usuario), así que:
-- 1) la importación queda en una función interna que recibe quién registra;
-- 2) importar_mermas_dodo (admin desde la app) conserva su control y su firma;
-- 3) importar_mermas_dodo_api solo la ejecuta service_role y registra sin usuario, con archivo «API Dodo IS».
begin;

-- La bitácora de sincronizaciones también registra las corridas de mermas.
-- Se quita la restricción de tipo cualquiera que sea su nombre (se creó junto con la columna).
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'dodois_sincronizaciones'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%tipo%' loop
    execute format('alter table dodois_sincronizaciones drop constraint %I', c);
  end loop;
end $$;
alter table dodois_sincronizaciones add constraint dodois_sincronizaciones_tipo_check check (tipo in ('ventas', 'recepciones', 'mermas'));

alter table mermas_dodo_dias alter column registrado_por drop not null;
alter table mermas_dodo_dias add constraint mermas_dodo_dias_registro_api
  check (registrado_por is not null or archivo like 'API Dodo IS%');

create function importar_mermas_dodo_interno(p_archivo text, p_huella text, p_dias jsonb, p_filas jsonb, p_usuario uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dia record; v_reemplazados integer; v_desde date; v_hasta date;
begin
  if p_archivo is null or length(trim(p_archivo)) not between 1 and 255 or p_huella is null or p_huella !~ '^[0-9a-f]{64}$'
    then raise exception 'Archivo o huella inválidos.'; end if;
  if p_usuario is null and p_archivo not like 'API Dodo IS%' then raise exception 'Solo la API de Dodo IS registra sin usuario.'; end if;
  if p_dias is null or p_filas is null or jsonb_typeof(p_dias) <> 'array' or jsonb_typeof(p_filas) <> 'array'
    then raise exception 'Se requieren días y renglones.'; end if;
  if jsonb_array_length(p_dias) not between 1 and 10000 or jsonb_array_length(p_filas) > 50000
    then raise exception 'Exporta un periodo más corto.'; end if;
  if exists (select 1 from jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date)
    where d.sucursal_id is null or d.fecha is null or d.fecha > hoy_mx() or not exists (select 1 from sucursales s where s.id=d.sucursal_id))
    then raise exception 'Sucursal o fecha inválida.'; end if;
  if exists (select 1 from jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date) group by sucursal_id,fecha having count(*) > 1)
    then raise exception 'Días repetidos.'; end if;
  select min(fecha),max(fecha) into v_desde,v_hasta from jsonb_to_recordset(p_dias) as d(fecha date);
  if v_hasta-v_desde > 365 then raise exception 'El periodo excede 366 días.'; end if;
  -- Serializar importaciones completas, incluidas las de días que aún no existen.
  for v_dia in select sucursal_id,fecha from jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date) order by sucursal_id,fecha loop
    perform pg_advisory_xact_lock(hashtextextended(v_dia.sucursal_id::text || '|' || v_dia.fecha::text,0));
  end loop;
  if exists (select 1 from jsonb_to_recordset(p_filas) as f(sucursal_id uuid,fecha date,tipo text,clave text,nombre text,unidad text,categoria text,cantidad numeric,costo numeric,sin_costo boolean)
    where not exists (select 1 from jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date) where d.sucursal_id=f.sucursal_id and d.fecha=f.fecha)
      or f.tipo is null or f.tipo not in ('insumo','producto') or f.clave is null or length(f.clave) not between 1 and 500
      or f.nombre is null or length(trim(f.nombre)) not between 1 and 500 or f.unidad is null or length(trim(f.unidad)) not between 1 and 60
      or f.categoria is null or length(f.categoria)>100 or f.cantidad is null or not (f.cantidad>0 and f.cantidad<1000000000)
      or f.costo is null or not (f.costo>=0 and f.costo<1000000000000) or f.costo<>round(f.costo,2) or f.sin_costo is null)
    then raise exception 'Renglón inválido o fuera del periodo.'; end if;
  select count(*) into v_reemplazados from mermas_dodo_dias m join jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date) using(sucursal_id,fecha);
  insert into mermas_dodo_dias (sucursal_id,fecha,archivo,huella,desde,hasta,registrado_por,productos_completos)
    select sucursal_id,fecha,trim(p_archivo),p_huella,v_desde,v_hasta,p_usuario,coalesce(productos_completos,false) from jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date,productos_completos boolean)
    on conflict(sucursal_id,fecha) do update set archivo=excluded.archivo,huella=excluded.huella,desde=excluded.desde,hasta=excluded.hasta,registrado_por=excluded.registrado_por,registrado_en=now(),productos_completos=excluded.productos_completos;
  delete from mermas_dodo m using jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date) where m.sucursal_id=d.sucursal_id and m.fecha=d.fecha;
  insert into mermas_dodo select * from jsonb_to_recordset(p_filas) as f(sucursal_id uuid,fecha date,tipo text,clave text,nombre text,unidad text,categoria text,cantidad numeric,costo numeric,sin_costo boolean);
  return jsonb_build_object('dias',jsonb_array_length(p_dias),'filas',jsonb_array_length(p_filas),'reemplazados',v_reemplazados);
end $$;
revoke all on function importar_mermas_dodo_interno(text,text,jsonb,jsonb,uuid) from public, anon, authenticated;

create or replace function importar_mermas_dodo(p_archivo text, p_huella text, p_dias jsonb, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce(edita_finanzas(), false) then raise exception 'Solo el admin puede importar mermas.'; end if;
  if auth.uid() is null then raise exception 'Solo el admin puede importar mermas.'; end if;
  return importar_mermas_dodo_interno(p_archivo, p_huella, p_dias, p_filas, auth.uid());
end $$;
revoke execute on function importar_mermas_dodo(text,text,jsonb,jsonb) from public, anon;
grant execute on function importar_mermas_dodo(text,text,jsonb,jsonb) to authenticated;

create function importar_mermas_dodo_api(p_dias jsonb, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return importar_mermas_dodo_interno('API Dodo IS', encode(sha256(convert_to(coalesce(p_dias::text,'') || coalesce(p_filas::text,''), 'UTF8')), 'hex'), p_dias, p_filas, null);
end $$;
revoke all on function importar_mermas_dodo_api(jsonb,jsonb) from public, anon, authenticated;
grant execute on function importar_mermas_dodo_api(jsonb,jsonb) to service_role;

commit;
