-- Checklists de zonas, turno, amasado, limpieza profunda y objetivos del turno.
-- Requiere 0001–0004. No modifica masa, mermas ni el comportamiento de los recorridos.

-- ─── Ampliación del esquema de checklists ───────────────────────────────────
create type momento_checklist as enum ('apertura', 'cambio', 'durante_manana', 'durante_tarde', 'cierre', 'hora', 'semanal');

alter table checklists
  add column tipo text not null default 'recorrido' check (tipo in ('recorrido', 'lista')),
  add column en_ronda boolean not null default false,
  add column orden int not null default 0;

alter table checklist_puntos
  add column momento momento_checklist not null default 'hora',
  add column dia_semana int check (dia_semana between 1 and 7),
  add constraint checklist_puntos_semanal_con_dia check ((momento = 'semanal') = (dia_semana is not null));

-- registrar_recorrido (0002) solo acepta recorridos: mismo cuerpo, con el filtro de tipo.
create or replace function registrar_recorrido(p_checklist uuid, p_fecha date, p_hora int, p_respuestas jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c checklists; v_id uuid; total int; marcados int;
begin
  select * into c from checklists where id = p_checklist and tipo = 'recorrido';
  if not found then raise exception 'Checklist no encontrado.'; end if;
  if mi_sucursal() is null then raise exception 'Tu usuario no tiene sucursal asignada.'; end if;
  if mi_rol() is null or not (mi_rol() = any(c.roles)) then
    raise exception 'Solo un encargado o gerente registra el recorrido.';
  end if;
  if not (p_hora = any(c.horas)) then
    raise exception '% no incluye la hora de las %:00.', c.nombre, lpad(p_hora::text, 2, '0');
  end if;
  if jsonb_typeof(p_respuestas) is distinct from 'array' then raise exception 'Respuestas inválidas.'; end if;

  select count(*) into total from checklist_puntos where checklist_id = c.id;
  select count(distinct p.id) into marcados
    from jsonb_array_elements(p_respuestas) r
    join checklist_puntos p on p.checklist_id = c.id and p.id::text = r->>'punto_id'
   where jsonb_typeof(r->'cumple') = 'boolean';
  if marcados <> total then raise exception 'Marca Cumple o No cumple en todos los puntos.'; end if;

  if exists (select 1 from jsonb_array_elements(p_respuestas) r
              where r->>'cumple' = 'false' and coalesce(trim(r->>'comentario'), '') = '') then
    raise exception 'Escribe qué pasó en cada punto que no cumple.';
  end if;

  perform validar_franja(p_fecha, p_hora);

  insert into recorridos (sucursal_id, checklist_id, fecha, hora, registrado_por)
  values (mi_sucursal(), c.id, p_fecha, p_hora, auth.uid())
  returning id into v_id;

  insert into recorrido_respuestas (recorrido_id, punto_id, cumple, comentario)
  select distinct on (p.id) v_id, p.id, (r->>'cumple')::boolean, nullif(trim(r->>'comentario'), '')
    from jsonb_array_elements(p_respuestas) r
    join checklist_puntos p on p.checklist_id = c.id and p.id::text = r->>'punto_id';

  return v_id;
end $$;


-- ─── Registros de listas (ronda de la hora, turno, semanal) ─────────────────
create table registros_checklist (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  checklist_id    uuid not null references checklists(id),
  fecha           date not null,
  momento         momento_checklist not null,
  hora            int check (hora between 0 and 23),
  empleado        text not null check (trim(empleado) <> ''),
  registrado_por  uuid not null references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  revisado_por    uuid references perfiles(id),
  revisado_en     timestamptz,
  check ((momento = 'hora') = (hora is not null))
);
create unique index registros_checklist_unico on registros_checklist (sucursal_id, checklist_id, fecha, momento, coalesce(hora, -1));
create index on registros_checklist (sucursal_id, fecha);

create table registro_respuestas (
  registro_id  uuid not null references registros_checklist(id),
  punto_id     uuid not null references checklist_puntos(id),
  cumple       boolean not null,
  comentario   text,
  check (cumple or coalesce(trim(comentario), '') <> ''),
  primary key (registro_id, punto_id)
);

create or replace function registrar_checklist(
  p_checklist uuid, p_momento momento_checklist, p_fecha date, p_hora int, p_empleado text, p_respuestas jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare c checklists; v_fecha date; v_dia int; v_id uuid; total int; marcados int;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  select * into c from checklists where id = p_checklist and tipo = 'lista';
  if not found then raise exception 'Lista no encontrada.'; end if;
  if mi_sucursal() is null then raise exception 'Tu usuario no tiene sucursal asignada.'; end if;
  if mi_rol() is null or not (mi_rol() = any(c.roles)) then
    raise exception 'Esta lista la registra el encargado o el gerente.';
  end if;
  if coalesce(trim(p_empleado), '') = '' then raise exception 'Escribe quién hizo la lista.'; end if;

  if p_momento = 'hora' then
    if p_fecha is null or p_hora is null or not (p_hora = any(c.horas)) then
      raise exception '% no se revisa a esa hora.', c.nombre;
    end if;
    v_fecha := p_fecha;
  else
    v_fecha := dia_operativo();
  end if;
  v_dia := extract(isodow from v_fecha)::int;

  select count(*) into total from checklist_puntos
   where checklist_id = c.id and momento = p_momento and (p_momento <> 'semanal' or dia_semana = v_dia);
  if total = 0 then raise exception '% no tiene puntos para este momento.', c.nombre; end if;
  if jsonb_typeof(p_respuestas) is distinct from 'array' then raise exception 'Respuestas inválidas.'; end if;

  select count(distinct p.id) into marcados
    from jsonb_array_elements(p_respuestas) r
    join checklist_puntos p on p.id::text = r->>'punto_id' and p.checklist_id = c.id and p.momento = p_momento
                          and (p_momento <> 'semanal' or p.dia_semana = v_dia)
   where jsonb_typeof(r->'cumple') = 'boolean';
  if marcados <> total then raise exception 'Marca Cumple o No cumple en todos los puntos.'; end if;

  if exists (select 1 from jsonb_array_elements(p_respuestas) r
              where r->>'cumple' = 'false' and coalesce(trim(r->>'comentario'), '') = '') then
    raise exception 'Escribe qué pasó en cada punto que no cumple.';
  end if;

  if p_momento = 'hora' then perform validar_franja(v_fecha, p_hora); end if;

  insert into registros_checklist (sucursal_id, checklist_id, fecha, momento, hora, empleado, registrado_por)
  values (mi_sucursal(), c.id, v_fecha, p_momento, case when p_momento = 'hora' then p_hora end, trim(p_empleado), auth.uid())
  returning id into v_id;

  insert into registro_respuestas (registro_id, punto_id, cumple, comentario)
  select distinct on (p.id) v_id, p.id, (r->>'cumple')::boolean, nullif(trim(r->>'comentario'), '')
    from jsonb_array_elements(p_respuestas) r
    join checklist_puntos p on p.id::text = r->>'punto_id' and p.checklist_id = c.id and p.momento = p_momento
                          and (p_momento <> 'semanal' or p.dia_semana = v_dia);

  return v_id;
end $$;

grant execute on function registrar_checklist(uuid, momento_checklist, date, int, text, jsonb) to authenticated;


-- ─── Amasado de masa ────────────────────────────────────────────────────────
create table lotes_amasado (
  id               uuid primary key default gen_random_uuid(),
  sucursal_id      uuid not null references sucursales(id),
  fecha            date not null default dia_operativo(),
  inicio           time not null,
  fin              time not null,
  temp_area        int not null check (temp_area in (25, 30, 35)),
  plan_bolas       int not null check (plan_bolas >= 0),
  bolas_resultado  int not null check (bolas_resultado >= 0),
  temp_sala        numeric(4,1) not null check (temp_sala between -5 and 60),
  temp_harina      numeric(4,1) not null check (temp_harina between -5 and 60),
  temp_agua        numeric(4,1) not null check (temp_agua between -5 and 60),
  temp_masa        numeric(4,1) not null check (temp_masa between -5 and 60),
  g_agua           numeric(8,1) not null check (g_agua >= 0),
  g_sal            numeric(8,1) not null check (g_sal >= 0),
  g_azucar         numeric(8,1) not null check (g_azucar >= 0),
  g_aceite         numeric(8,1) not null check (g_aceite >= 0),
  g_harina         numeric(8,1) not null check (g_harina >= 0),
  g_levadura       numeric(8,1) not null check (g_levadura >= 0),
  minutos_amasado  numeric(4,1) not null check (minutos_amasado > 0),
  empleado         text not null check (trim(empleado) <> ''),
  comentario       text,
  registrado_por   uuid not null references perfiles(id) default auth.uid(),
  creado_en        timestamptz not null default now(),
  revisado_por     uuid references perfiles(id),
  revisado_en      timestamptz
);
create index on lotes_amasado (sucursal_id, fecha);

create or replace function validar_lote_amasado() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.fecha := dia_operativo();
  new.empleado := trim(new.empleado);
  new.comentario := nullif(trim(new.comentario), '');
  if new.comentario is null then
    if new.temp_masa not between 24 and 26 then
      raise exception 'Escribe qué pasó: la masa está a % °C, fuera de 24 a 26 °C.', new.temp_masa;
    end if;
    if new.temp_sala not between 16 and 26 then
      raise exception 'Escribe qué pasó: la sala está a % °C, fuera de 16 a 26 °C.', new.temp_sala;
    end if;
    if new.temp_harina not between 16 and 26 then
      raise exception 'Escribe qué pasó: la harina está a % °C, fuera de 16 a 26 °C.', new.temp_harina;
    end if;
    if new.temp_agua not between 9 and 20 then
      raise exception 'Escribe qué pasó: el agua está a % °C, fuera de 9 a 20 °C.', new.temp_agua;
    end if;
  end if;
  return new;
end $$;

create trigger lotes_amasado_validar before insert on lotes_amasado
  for each row execute function validar_lote_amasado();


-- ─── Limpieza profunda ──────────────────────────────────────────────────────
create table areas_limpieza_profunda (
  semana      int not null check (semana in (1, 2)),
  dia_semana  int not null check (dia_semana between 1 and 7),
  area        text not null,
  primary key (semana, dia_semana)
);

-- Semana ISO impar = tabla 1, par = tabla 2. Al cambiar de año puede repetirse la tabla 1.
create or replace function area_limpieza_profunda(p_fecha date) returns text
language sql stable set search_path = public as $$
  select area from areas_limpieza_profunda
   where semana = case when extract(week from p_fecha)::int % 2 = 1 then 1 else 2 end
     and dia_semana = extract(isodow from p_fecha)::int
$$;

create table limpiezas_profundas (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  fecha           date not null default dia_operativo(),
  area            text not null,
  empleado        text not null check (trim(empleado) <> ''),
  registrado_por  uuid not null references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  revisado_por    uuid references perfiles(id),
  revisado_en     timestamptz,
  unique (sucursal_id, fecha)
);

create or replace function fijar_limpieza_profunda() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.fecha := dia_operativo();
  new.area := area_limpieza_profunda(new.fecha);
  if new.area is null then raise exception 'No hay área de limpieza profunda para hoy.'; end if;
  new.empleado := trim(new.empleado);
  return new;
end $$;

create trigger limpiezas_profundas_fijar before insert on limpiezas_profundas
  for each row execute function fijar_limpieza_profunda();


-- ─── Objetivos del turno ────────────────────────────────────────────────────
create table objetivos_turno (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  fecha           date not null default dia_operativo(),
  turno           text not null check (turno in ('manana', 'tarde')),
  empleado        text not null check (trim(empleado) <> ''),
  objetivo        text not null check (trim(objetivo) <> ''),
  registrado_por  uuid not null references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now()
);
create index on objetivos_turno (sucursal_id, fecha);


-- ─── Revisado ───────────────────────────────────────────────────────────────
create or replace function revisar(p_tipo text, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare s uuid; r uuid;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  if mi_rol() is null or mi_rol()::text not in ('encargado', 'gerente', 'admin') then
    raise exception 'Solo el encargado o el gerente marca como revisado.';
  end if;
  if p_tipo = 'checklist' then
    select sucursal_id, revisado_por into s, r from registros_checklist where id = p_id for update;
  elsif p_tipo = 'amasado' then
    select sucursal_id, revisado_por into s, r from lotes_amasado where id = p_id for update;
  elsif p_tipo = 'limpieza' then
    select sucursal_id, revisado_por into s, r from limpiezas_profundas where id = p_id for update;
  else
    raise exception 'Tipo de registro inválido.';
  end if;
  if s is null then raise exception 'Registro no encontrado.'; end if;
  if s <> mi_sucursal() and mi_rol() <> 'admin' then raise exception 'El registro es de otra sucursal.'; end if;
  if r is not null then raise exception 'Ya estaba revisado.'; end if;

  if p_tipo = 'checklist' then
    update registros_checklist set revisado_por = auth.uid(), revisado_en = now() where id = p_id;
  elsif p_tipo = 'amasado' then
    update lotes_amasado set revisado_por = auth.uid(), revisado_en = now() where id = p_id;
  else
    update limpiezas_profundas set revisado_por = auth.uid(), revisado_en = now() where id = p_id;
  end if;
end $$;

grant execute on function revisar(text, uuid) to authenticated;


-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table registros_checklist      enable row level security;
alter table registro_respuestas      enable row level security;
alter table lotes_amasado            enable row level security;
alter table areas_limpieza_profunda  enable row level security;
alter table limpiezas_profundas      enable row level security;
alter table objetivos_turno          enable row level security;

create policy ver_registros_checklist on registros_checklist for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());
create policy ver_registro_respuestas on registro_respuestas for select
  using (exists (select 1 from registros_checklist r where r.id = registro_id
                 and (r.sucursal_id = mi_sucursal() or ve_todas_las_sucursales())));

create policy ver_lotes_amasado on lotes_amasado for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());
create policy registrar_lote_amasado on lotes_amasado for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid() and revisado_por is null);

create policy ver_areas_limpieza_profunda on areas_limpieza_profunda for select to authenticated using (true);

create policy ver_limpiezas_profundas on limpiezas_profundas for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());
create policy registrar_limpieza_profunda on limpiezas_profundas for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid() and revisado_por is null);

create policy ver_objetivos_turno on objetivos_turno for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());
create policy registrar_objetivo_turno on objetivos_turno for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid()
              and mi_rol()::text in ('encargado', 'gerente', 'admin'));

-- Sin políticas de update ni delete. "Revisado" solo pasa por revisar().
