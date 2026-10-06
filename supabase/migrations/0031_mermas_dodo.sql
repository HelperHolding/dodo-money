-- Mermas importadas de Dodo IS. Consulta únicamente: todavía no alimentan el P&L.
begin;
create table mermas_dodo_dias (
  sucursal_id uuid not null references sucursales(id), fecha date not null check (fecha <= hoy_mx()),
  archivo text not null check (length(archivo) between 1 and 255), huella text not null check (huella ~ '^[0-9a-f]{64}$'),
  desde date not null, hasta date not null, registrado_por uuid not null references perfiles(id),
  registrado_en timestamptz not null default now(), primary key (sucursal_id, fecha),
  check (desde <= fecha and fecha <= hasta and hasta - desde <= 365)
);
create table mermas_dodo (
  sucursal_id uuid not null, fecha date not null, tipo text not null check (tipo in ('insumo','producto')),
  clave text not null check (length(clave) between 1 and 500), nombre text not null check (length(trim(nombre)) between 1 and 500),
  unidad text not null check (length(trim(unidad)) between 1 and 60), categoria text not null check (length(categoria) <= 100),
  cantidad numeric not null check (cantidad > 0 and cantidad < 1000000000),
  costo numeric(16,2) not null check (costo >= 0 and costo < 1000000000000), sin_costo boolean not null,
  primary key (sucursal_id,fecha,tipo,clave),
  foreign key (sucursal_id,fecha) references mermas_dodo_dias on delete cascade
);
alter table mermas_dodo_dias enable row level security;
alter table mermas_dodo enable row level security;
create policy consultar_mermas_dodo_dias on mermas_dodo_dias for select using (ve_finanzas());
create policy consultar_mermas_dodo on mermas_dodo for select using (ve_finanzas());
revoke all on mermas_dodo_dias, mermas_dodo from anon, authenticated;
grant select on mermas_dodo_dias, mermas_dodo to authenticated;

create function importar_mermas_dodo(p_archivo text, p_huella text, p_dias jsonb, p_filas jsonb) returns jsonb
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
  insert into mermas_dodo_dias (sucursal_id,fecha,archivo,huella,desde,hasta,registrado_por)
    select sucursal_id,fecha,trim(p_archivo),p_huella,v_desde,v_hasta,auth.uid() from jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date)
    on conflict(sucursal_id,fecha) do update set archivo=excluded.archivo,huella=excluded.huella,desde=excluded.desde,hasta=excluded.hasta,registrado_por=excluded.registrado_por,registrado_en=now();
  delete from mermas_dodo m using jsonb_to_recordset(p_dias) as d(sucursal_id uuid,fecha date) where m.sucursal_id=d.sucursal_id and m.fecha=d.fecha;
  insert into mermas_dodo select * from jsonb_to_recordset(p_filas) as f(sucursal_id uuid,fecha date,tipo text,clave text,nombre text,unidad text,categoria text,cantidad numeric,costo numeric,sin_costo boolean);
  return jsonb_build_object('dias',jsonb_array_length(p_dias),'filas',jsonb_array_length(p_filas),'reemplazados',v_reemplazados);
end $$;
revoke execute on function importar_mermas_dodo(text,text,jsonb,jsonb) from public, anon;
grant execute on function importar_mermas_dodo(text,text,jsonb,jsonb) to authenticated;
commit;
