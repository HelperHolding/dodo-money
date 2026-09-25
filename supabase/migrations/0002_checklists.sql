-- Checklists digitales · Dodo Pizza
-- Mermas del día, temperatura de masa cada hora y recorrido de supervisor cada hora.
-- Igual que en efectivo: nada se edita ni se borra, y las reglas las aplica la base de datos.
-- Requiere 0001_control_efectivo.sql (sucursales, perfiles, rol_usuario, mi_sucursal(), mi_rol()).


-- ─── Horario ────────────────────────────────────────────────────────────────
-- Ciudad de México es UTC−6 todo el año desde 2022 (igual que lib/formato.ts).

-- El día operativo cambia a las 4:00: el cierre nocturno después de medianoche cuenta para el día que termina.
create or replace function dia_operativo(p_ahora timestamptz default now()) returns date
language sql stable as $$
  select ((p_ahora at time zone interval '-06:00') - interval '4 hours')::date
$$;

-- La hora h de una fecha acepta registros de h:00 a (h+1):10.
create or replace function franja_abierta(p_fecha date, p_hora int, p_ahora timestamptz default now()) returns boolean
language sql stable as $$
  select (p_ahora at time zone interval '-06:00') >= p_fecha + make_time(p_hora, 0, 0)
     and (p_ahora at time zone interval '-06:00') <  p_fecha + make_time(p_hora, 0, 0) + interval '70 minutes'
$$;

create or replace function validar_franja(p_fecha date, p_hora int) returns void
language plpgsql as $$
begin
  if (now() at time zone interval '-06:00') < p_fecha + make_time(p_hora, 0, 0) then
    raise exception 'La hora de las %:00 todavía no empieza.', lpad(p_hora::text, 2, '0');
  end if;
  if not franja_abierta(p_fecha, p_hora) then
    raise exception 'La hora de las %:00 cerró a las %:10.', lpad(p_hora::text, 2, '0'), lpad(((p_hora + 1) % 24)::text, 2, '0');
  end if;
end $$;


-- ─── Mermas ─────────────────────────────────────────────────────────────────
create type motivo_merma as enum ('caducidad', 'empaque_danado', 'mal_estado', 'error_humano');

-- Catálogo igual para todas las sucursales. Solo el admin lo cambia desde el SQL Editor.
create table productos_merma (
  id         uuid primary key default gen_random_uuid(),
  categoria  text not null,
  nombre     text not null unique,
  unidad     text not null,
  orden      int  not null,
  activo     boolean not null default true
);

create table mermas (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  fecha           date not null default dia_operativo(),
  producto_id     uuid not null references productos_merma(id),
  cantidad        numeric(10,3) not null check (cantidad > 0),
  motivo          motivo_merma not null,
  empleado        text not null check (trim(empleado) <> ''),
  registrado_por  uuid not null references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now()
);

create table cierres_merma (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  fecha           date not null default dia_operativo(),
  capturado_dodo  boolean not null check (capturado_dodo),
  cerrado_por     uuid not null references perfiles(id) default auth.uid(),
  cerrado_en      timestamptz not null default now(),
  unique (sucursal_id, fecha)
);

create index on mermas (sucursal_id, fecha);

create or replace function validar_merma() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.fecha := dia_operativo();
  new.empleado := trim(new.empleado);
  if not exists (select 1 from productos_merma where id = new.producto_id and activo) then
    raise exception 'Ese producto no está en la lista de mermas.';
  end if;
  if exists (select 1 from cierres_merma where sucursal_id = new.sucursal_id and fecha = new.fecha) then
    raise exception 'Las mermas de hoy ya se cerraron.';
  end if;
  return new;
end $$;

create trigger mermas_validar
  before insert on mermas
  for each row execute function validar_merma();

create or replace function fijar_fecha_cierre_merma() returns trigger
language plpgsql as $$
begin
  new.fecha := dia_operativo();
  return new;
end $$;

create trigger cierres_merma_fecha
  before insert on cierres_merma
  for each row execute function fijar_fecha_cierre_merma();


-- ─── Temperatura de masa ────────────────────────────────────────────────────
-- Bolas que se sacan en cada hora según la temperatura del área. Igual para todas las sucursales.
create table normas_masa (
  hora      int primary key check (hora between 0 and 23),
  bolas_25  int not null check (bolas_25 >= 0),
  bolas_30  int not null check (bolas_30 >= 0),
  bolas_35  int not null check (bolas_35 >= 0)
);

create table lecturas_masa (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  fecha           date not null,
  hora            int  not null references normas_masa(hora),
  temp_area       int  not null check (temp_area in (25, 30, 35)),
  bolas           int  not null check (bolas >= 0),
  temperatura     numeric(4,1) not null check (temperatura between -5 and 50),
  en_norma        boolean generated always as (temperatura between 12 and 22) stored,
  comentario      text,
  registrado_por  uuid not null references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  unique (sucursal_id, fecha, hora)
);

create or replace function validar_lectura_masa() returns trigger
language plpgsql security definer set search_path = public as $$
declare n normas_masa; norma int;
begin
  select * into n from normas_masa where hora = new.hora;
  if not found then raise exception 'No hay norma de masa para las %:00.', lpad(new.hora::text, 2, '0'); end if;
  norma := case new.temp_area when 25 then n.bolas_25 when 30 then n.bolas_30 else n.bolas_35 end;

  new.comentario := nullif(trim(new.comentario), '');
  if new.comentario is null then
    if new.temperatura not between 12 and 22 then
      raise exception 'Escribe qué pasó: la masa está a % °C, fuera de 12 a 22 °C.', new.temperatura;
    end if;
    if new.bolas <> norma then
      raise exception 'Escribe qué pasó: sacaste % bolas y la norma es %.', new.bolas, norma;
    end if;
  end if;

  perform validar_franja(new.fecha, new.hora);
  return new;
end $$;

create trigger lecturas_masa_validar
  before insert on lecturas_masa
  for each row execute function validar_lectura_masa();


-- ─── Recorrido de supervisor (checklists de puntos sí/no) ───────────────────
create table checklists (
  id      uuid primary key default gen_random_uuid(),
  clave   text not null unique,
  nombre  text not null,
  horas   int[] not null,
  roles   rol_usuario[] not null
);

create table checklist_puntos (
  id                uuid primary key default gen_random_uuid(),
  checklist_id      uuid not null references checklists(id),
  orden             int  not null,
  texto             text not null,
  detalle_por_hora  jsonb,
  unique (checklist_id, orden)
);

create table recorridos (
  id              uuid primary key default gen_random_uuid(),
  sucursal_id     uuid not null references sucursales(id),
  checklist_id    uuid not null references checklists(id),
  fecha           date not null,
  hora            int  not null,
  registrado_por  uuid not null references perfiles(id) default auth.uid(),
  creado_en       timestamptz not null default now(),
  unique (sucursal_id, checklist_id, fecha, hora)
);

create table recorrido_respuestas (
  recorrido_id  uuid not null references recorridos(id),
  punto_id      uuid not null references checklist_puntos(id),
  cumple        boolean not null,
  comentario    text,
  check (cumple or coalesce(trim(comentario), '') <> ''),
  primary key (recorrido_id, punto_id)
);

-- El recorrido y sus respuestas se guardan juntos, con todas las reglas.
create or replace function registrar_recorrido(p_checklist uuid, p_fecha date, p_hora int, p_respuestas jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare c checklists; v_id uuid; total int; marcados int;
begin
  select * into c from checklists where id = p_checklist;
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

grant execute on function registrar_recorrido(uuid, date, int, jsonb) to authenticated;


-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table productos_merma       enable row level security;
alter table mermas                enable row level security;
alter table cierres_merma         enable row level security;
alter table normas_masa           enable row level security;
alter table lecturas_masa         enable row level security;
alter table checklists            enable row level security;
alter table checklist_puntos      enable row level security;
alter table recorridos            enable row level security;
alter table recorrido_respuestas  enable row level security;

-- Catálogos: todos los usuarios los leen; nadie los cambia desde la app.
create policy ver_productos_merma on productos_merma for select to authenticated using (true);
create policy ver_normas_masa on normas_masa for select to authenticated using (true);
create policy ver_checklists on checklists for select to authenticated using (true);
create policy ver_checklist_puntos on checklist_puntos for select to authenticated using (true);

create policy ver_mermas on mermas for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');
create policy registrar_merma on mermas for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid());

create policy ver_cierres_merma on cierres_merma for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');
create policy cerrar_mermas on cierres_merma for insert
  with check (sucursal_id = mi_sucursal() and cerrado_por = auth.uid()
              and mi_rol() in ('encargado', 'gerente', 'admin'));

create policy ver_lecturas_masa on lecturas_masa for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');
create policy registrar_lectura_masa on lecturas_masa for insert
  with check (sucursal_id = mi_sucursal() and registrado_por = auth.uid());

-- Recorridos: solo se insertan con registrar_recorrido().
create policy ver_recorridos on recorridos for select
  using (sucursal_id = mi_sucursal() or mi_rol() = 'admin');
create policy ver_recorrido_respuestas on recorrido_respuestas for select
  using (exists (select 1 from recorridos r where r.id = recorrido_id
                 and (r.sucursal_id = mi_sucursal() or mi_rol() = 'admin')));

-- Sin políticas de update ni delete: los registros no se editan ni se borran.
