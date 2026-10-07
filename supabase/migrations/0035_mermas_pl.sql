begin;
alter table mermas_dodo_dias add column productos_completos boolean not null default false;
-- Los días anteriores requieren reimportar para verificar si incluían la hoja de productos, incluso vacía.
create table mermas_costos_producto (
 id uuid primary key default gen_random_uuid(),orden bigint generated always as identity unique,sucursal_id uuid not null references sucursales(id),clave text not null,
 vigente_desde date not null,costo_unitario numeric(16,6) not null check(costo_unitario>0 and costo_unitario<1e6),
 fuente text not null check(length(trim(fuente)) between 10 and 1000),registrado_por uuid not null references perfiles(id),registrado_en timestamptz not null default now(),
 anulado_en timestamptz,anulado_por uuid references perfiles(id),motivo_anulacion text,
 check((anulado_en is null)=(anulado_por is null))
);
create index on mermas_costos_producto(sucursal_id,clave,vigente_desde,registrado_en);
alter table mermas_costos_producto enable row level security;
create policy leer_costos_merma on mermas_costos_producto for select using(ve_finanzas());
revoke all on mermas_costos_producto from anon,authenticated;
grant select on mermas_costos_producto to authenticated;
create function registrar_costo_merma(p_sucursal uuid,p_clave text,p_desde date,p_costo numeric,p_fuente text) returns uuid
language plpgsql security definer set search_path=public as $$
declare resultado uuid;
begin
 if not edita_finanzas() then raise exception 'Solo el admin registra costos de merma.';end if;
 if p_desde is null or p_desde<'2020-01-01' or p_desde>hoy_mx() or p_clave is null
 or not exists(select 1 from mermas_dodo where sucursal_id=p_sucursal and clave=p_clave and tipo='producto') then raise exception 'Producto o vigencia inválidos.';end if;
 if p_costo is null or not(p_costo>0 and p_costo<1e6) or p_costo<>round(p_costo,6)
 or exists(select 1 from mermas_dodo where sucursal_id=p_sucursal and clave=p_clave and tipo='producto' and fecha>=p_desde and cantidad*p_costo>=1e12) then raise exception 'Costo unitario inválido.';end if;
 if p_fuente is null or length(trim(p_fuente)) not between 10 and 1000 then raise exception 'Escribe la fuente del costo sin IVA (10 a 1000 caracteres).';end if;
 -- Versiones inmutables, ordenadas por vigencia y momento de registro. La última corrige la misma fecha sin perder historial.
 perform pg_advisory_xact_lock(hashtextextended('costo_merma:'||p_sucursal::text||p_clave,0));
 insert into mermas_costos_producto(sucursal_id,clave,vigente_desde,costo_unitario,fuente,registrado_por)
 values(p_sucursal,p_clave,p_desde,p_costo,trim(p_fuente),auth.uid()) returning id into resultado;
 return resultado;
end $$;
create function anular_costo_merma(p_id uuid,p_motivo text) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not edita_finanzas() then raise exception 'Solo el admin registra costos de merma.';end if;
 if p_motivo is null or length(trim(p_motivo)) not between 10 and 1000 then raise exception 'Escribe el motivo (10 a 1000 caracteres).';end if;
 update mermas_costos_producto set anulado_en=now(),anulado_por=auth.uid(),motivo_anulacion=trim(p_motivo) where id=p_id and anulado_en is null;
 if not found then raise exception 'El costo no existe o ya está anulado.';end if;
end $$;
revoke all on function registrar_costo_merma(uuid,text,date,numeric,text),anular_costo_merma(uuid,text) from public,anon;
grant execute on function registrar_costo_merma(uuid,text,date,numeric,text),anular_costo_merma(uuid,text) to authenticated;
create or replace function importar_mermas_dodo(p_archivo text, p_huella text, p_dias jsonb, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_dia record; v_reemplazados integer; v_desde date; v_hasta date;
begin
  if not coalesce(edita_finanzas(), false) then raise exception 'Solo el admin puede importar mermas.'; end if;
  if p_archivo is null or length(trim(p_archivo)) not between 1 and 255 or p_huella is null or p_huella !~ '^[0-9a-f]{64}$'
    then raise exception 'Archivo o huella inválidos.'; end if;
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
    select sucursal_id,fecha,trim(p_archivo),p_huella,v_desde,v_hasta,auth.uid(),coalesce(productos_completos,false) from jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date,productos_completos boolean)
    on conflict(sucursal_id,fecha) do update set archivo=excluded.archivo,huella=excluded.huella,desde=excluded.desde,hasta=excluded.hasta,registrado_por=excluded.registrado_por,registrado_en=now(),productos_completos=excluded.productos_completos;
  delete from mermas_dodo m using jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date) where m.sucursal_id=d.sucursal_id and m.fecha=d.fecha;
  insert into mermas_dodo select * from jsonb_to_recordset(p_filas) as f(sucursal_id uuid,fecha date,tipo text,clave text,nombre text,unidad text,categoria text,cantidad numeric,costo numeric,sin_costo boolean);
  return jsonb_build_object('dias',jsonb_array_length(p_dias),'filas',jsonb_array_length(p_filas),'reemplazados',v_reemplazados);
end $$;
commit;
