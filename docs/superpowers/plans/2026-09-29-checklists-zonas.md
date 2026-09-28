# Checklists de zonas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitalizar las hojas restantes del Excel: listas del encargado, limpieza, preparaciones, zona caliente, caja y sala, baño (ronda de la hora y listas por turno), amasado de masa, limpieza profunda y objetivos del turno.

**Architecture:** La migración `0005` amplía `checklists` / `checklist_puntos` con `tipo`, `en_ronda`, `orden`, `momento` y `dia_semana`, agrega `registros_checklist` + `registro_respuestas` (inserción solo por `registrar_checklist`), tablas propias para amasado, limpieza profunda y objetivos, y una función `revisar`. La lógica pura (área de limpieza del día, rangos de amasado, estado de las listas, alertas de corporativo) vive en `lib/` con pruebas `node --test`. Las pantallas siguen el patrón existente (página de servidor + server action + componente cliente donde hay interacción).

**Tech Stack:** Next.js 15, React 19, TypeScript estricto, Supabase (Postgres, RLS), CSS propio, `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-29-checklists-zonas-design.md`

## Global Constraints

- Nada se edita ni se borra; corporativo solo consulta (base de datos y app).
- Día = día operativo (`dia_operativo()` / `diaOperativoMX()` / `hoyMX()`, cambio a las 4:00).
- Rondas de la hora: `h:00`–`(h+1):10` (`validar_franja`, `franjasAbiertas`).
- Listas por turno y tareas semanales: solo el día operativo en curso.
- Nombre de quien hizo la tarea: obligatorio en ronda, listas, amasado y limpieza profunda.
- "No cumple" siempre con comentario. Amasado fuera de rango (masa 24–26, sala 16–26, harina 16–26, agua 9–20 °C) con comentario.
- Revisado: solo `encargado`, `gerente`, `admin`.
- Los recorridos existentes (`tipo = 'recorrido'`) no cambian de comportamiento.
- En pantallas para celular: tarjetas o listas verticales, no tablas anchas (preferencia de Sebastián).
- Texto en español de México; sin dependencias nuevas; commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Recorridos intactos:** con listas nuevas en `checklists`, la pantalla de recorrido, el resumen y corporativo deben seguir mostrando solo los dos recorridos (sin `horas[0]` indefinido). Prueba: `registrar_recorrido` rechaza una lista (SQL, Task 1); filtros `tipo = 'recorrido'` (Task 3, revisados en el build y el guion manual).
2. **Ronda a medias:** si el cajero llena su zona y el pizzero deja la suya incompleta, se guarda la completa y se avisa cuál falta, sin perder la otra por error del servidor. Prueba: validación de cliente + mensaje combinado (Task 4) y `zonaCompleta` (Task 2).
3. **Semanas del ciclo de limpieza profunda en el cambio de año:** 2026 tiene 53 semanas ISO; el 1 de enero de 2027 debe caer en semana 1 del ciclo sin romper. Prueba: `cicloDeFecha` (Task 2) y `area_limpieza_profunda` (SQL, Task 1).
4. **Tareas semanales en días sin tareas (vie–dom):** la casilla debe verse "—" (no aplica), no "Pendiente" en rojo. Prueba: `filasListas` con `diaSemana = 5` (Task 2).
5. **Doble toque o dos personas guardando la misma lista:** el segundo recibe "Esta lista ya se registró hoy.", no un error técnico. Prueba: duplicado en SQL (Task 1) y traducción de 23505 en las acciones (Tasks 4–6).

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0005_checklists_zonas.sql` | Crear | Esquema, funciones, triggers, RLS |
| `supabase/seed_checklists_zonas.sql` | Crear | Listas y puntos del Excel, áreas de limpieza profunda |
| `supabase/pruebas/0005_checklists_zonas.sql` | Crear | Pruebas de reglas |
| `lib/limpiezaProfunda.ts` (+ test) | Crear | Semana ISO, ciclo, área del día |
| `lib/amasado.ts` (+ test) | Crear | Rangos y motivo del comentario |
| `lib/zonas.ts` (+ test) | Crear | Columnas, estado de listas, filas de la rejilla, zona completa |
| `lib/corporativo.ts` (+ test) | Modificar | Datos y alertas nuevas |
| `lib/tipos.ts` | Modificar | Tipos nuevos |
| `package.json` | Modificar | Pruebas nuevas en `test` |
| `app/(app)/checklists/layout.tsx`, `components/AccesosChecklists.tsx` | Crear | Barra de accesos |
| `app/(app)/checklists/Revisar.tsx`, `app/(app)/checklists/revisar.ts` | Crear | Botón y acción "Revisado" |
| `app/(app)/checklists/FormPuntos.tsx` | Crear | Puntos Cumple/No cumple reutilizable |
| `app/(app)/checklists/TarjetasListas.tsx` | Crear | Tarjetas de listas del turno (turno y resumen) |
| `app/(app)/checklists/ronda/*` | Crear | Ronda de la hora |
| `app/(app)/checklists/turno/*` | Crear | Listas del turno |
| `app/(app)/checklists/amasado/*` | Crear | Amasado |
| `app/(app)/checklists/limpieza-profunda/*` | Crear | Limpieza profunda |
| `app/(app)/checklists/objetivos/*` | Crear | Objetivos del turno |
| `app/(app)/checklists/page.tsx`, `recorrido/page.tsx` | Modificar | Filtro `tipo`, resumen ampliado |
| `app/corporativo/datos.ts`, `page.tsx` | Modificar | Datos y tarjeta ampliados |
| `app/globals.css`, `README.md` | Modificar | Estilos y documentación |

---

### Task 1: Base de datos

**Files:**
- Create: `supabase/migrations/0005_checklists_zonas.sql`, `supabase/seed_checklists_zonas.sql`, `supabase/pruebas/0005_checklists_zonas.sql`

**Interfaces:**
- Consumes: `mi_sucursal()`, `mi_rol()`, `ve_todas_las_sucursales()`, `dia_operativo()`, `validar_franja()`, tablas `checklists`, `checklist_puntos`, `sucursales`, `perfiles`.
- Produces:
  - `checklists.tipo` (`'recorrido' | 'lista'`), `checklists.en_ronda`, `checklists.orden`; `checklist_puntos.momento`, `checklist_puntos.dia_semana`.
  - RPC `registrar_checklist(p_checklist uuid, p_momento momento_checklist, p_fecha date, p_hora int, p_empleado text, p_respuestas jsonb) returns uuid`.
  - RPC `revisar(p_tipo text, p_id uuid) returns void` con `p_tipo in ('checklist','amasado','limpieza')`.
  - Tablas `registros_checklist(id, sucursal_id, checklist_id, fecha, momento, hora, empleado, registrado_por, creado_en, revisado_por, revisado_en)`, `registro_respuestas(registro_id, punto_id, cumple, comentario)`, `lotes_amasado`, `areas_limpieza_profunda(semana, dia_semana, area)`, `limpiezas_profundas(id, sucursal_id, fecha, area, empleado, registrado_por, creado_en, revisado_por, revisado_en)`, `objetivos_turno(id, sucursal_id, fecha, turno, empleado, objetivo, registrado_por, creado_en)`.
  - Función `area_limpieza_profunda(fecha date) returns text`.

- [ ] **Step 1: Pruebas SQL**

Create `supabase/pruebas/0005_checklists_zonas.sql`:

```sql
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
```

- [ ] **Step 2: Correr para verlas fallar**

Pide a Sebastián que las corra en SQL Editor.
Expected: `function area_limpieza_profunda(unknown) does not exist`.

- [ ] **Step 3: Migración**

Create `supabase/migrations/0005_checklists_zonas.sql`:

```sql
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
```

- [ ] **Step 4: Datos iniciales**

Create `supabase/seed_checklists_zonas.sql`:

```sql
-- Listas y puntos de las hojas ESP de "MX Checklists (base).xlsx" y calendario de limpieza profunda.
-- Se puede volver a correr: no duplica nada.

insert into checklists (clave, nombre, tipo, en_ronda, orden, horas, roles) values
  ('encargado_manana', 'Encargado · Mañana', 'lista', false, 10, '{}', '{encargado,gerente,admin}'),
  ('encargado_tarde',  'Encargado · Tarde',  'lista', false, 20, '{}', '{encargado,gerente,admin}'),
  ('tareas_semanales', 'Tareas semanales',   'lista', false, 30, '{}', '{encargado,gerente,admin}'),
  ('limpieza',         'Limpieza',           'lista', true,  40, '{8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23}', '{cajero,encargado,gerente,admin}'),
  ('preparaciones',    'Zona de preparaciones', 'lista', false, 50, '{}', '{cajero,encargado,gerente,admin}'),
  ('zona_caliente',    'Zona caliente',      'lista', true,  60, '{8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23}', '{cajero,encargado,gerente,admin}'),
  ('caja_sala',        'Caja y sala',        'lista', true,  70, '{8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23}', '{cajero,encargado,gerente,admin}'),
  ('bano',             'Baño',               'lista', true,  80, '{11,12,13,14,15,16,17,18,19,20,21,22,23}', '{cajero,encargado,gerente,admin}')
on conflict (clave) do nothing;

insert into checklist_puntos (checklist_id, orden, momento, dia_semana, texto)
select c.id, p.orden, p.momento::momento_checklist, p.dia, p.texto
from (values
  -- Encargado · Mañana
  ('encargado_manana', 1, 'apertura', null, 'Todos los empleados y repartidores son registrados según el procedimiento.'),
  ('encargado_manana', 2, 'apertura', null, 'Cocina: el extractor, horno, estante térmico, impresoras de etiquetas, tablets, aire acondicionado y música en la cocina y la sala están encendidos.'),
  ('encargado_manana', 3, 'apertura', null, 'Zona de caja y sala: terminal de la caja y menú digital están encendidos.'),
  ('encargado_manana', 4, 'apertura', null, 'Caja de reparto: se cuenta el efectivo, se imprime el reporte X, se prepara el cambio y se llena el registro de caja.'),
  ('encargado_manana', 5, 'apertura', null, 'Terminal de la caja del restaurante: se cuenta el efectivo, se imprime el reporte X, el efectivo coincide con el reporte X, se prepara el cambio y se llena el registro de caja.'),
  ('encargado_manana', 6, 'apertura', null, 'Caja fuerte: se cuenta el efectivo y se actualiza el registro de caja.'),
  ('encargado_manana', 7, 'apertura', null, 'Se revisa el stock de ingredientes en Dodo IS. Se revisa la stop list.'),
  ('encargado_manana', 8, 'apertura', null, 'Se revisa el horario del personal en Dodo IS y se completa el checklist de posición del turno.'),
  ('encargado_manana', 9, 'apertura', null, 'Se bajan las sillas y se limpia la sala.'),
  ('encargado_manana', 10, 'apertura', null, 'Se realiza el inventario diario.'),
  ('encargado_manana', 11, 'apertura', null, 'Se revisa la velocidad y temperatura del horno.'),
  ('encargado_manana', 12, 'apertura', null, 'La puerta del restaurante se abre 10 minutos antes de que comiencen las ventas y se inspecciona el área circundante.'),
  ('encargado_manana', 13, 'apertura', null, 'Se toma y envía un reporte fotográfico de la apertura.'),
  ('encargado_manana', 20, 'cambio', null, 'Se cuenta el efectivo en cajas y caja fuerte y se completa el registro de caja. Se imprime el reporte X del terminal de la caja del restaurante. El efectivo disponible coincide con el reporte X y se prepara el cambio.'),
  ('encargado_manana', 21, 'cambio', null, 'El plan de preparaciones está completo.'),
  ('encargado_manana', 22, 'cambio', null, 'Hay cajas de suministro y consumibles.'),
  ('encargado_manana', 23, 'cambio', null, 'Se inspecciona la limpieza de todas las estaciones: platos, equipo, la sala y la zona de entrada.'),
  ('encargado_manana', 24, 'cambio', null, 'Todos los empleados son evaluados mediante evaluaciones de rendimiento y se les da feedback.'),
  ('encargado_manana', 25, 'cambio', null, 'Cualquier problema con el equipo, inventario u otras emergencias se informa al gerente.'),
  ('encargado_manana', 30, 'durante_manana', null, 'Se revisan las alarmas para mermas.'),
  ('encargado_manana', 31, 'durante_manana', null, 'Se inspeccionan las verduras frescas y los productos rechazados se merman.'),
  ('encargado_manana', 32, 'durante_manana', null, 'Se completa el registro de temperatura y humedad.'),
  ('encargado_manana', 33, 'durante_manana', null, 'Se llena el registro de limpieza profunda.'),
  ('encargado_manana', 34, 'durante_manana', null, 'Los empleados y repartidores son admitidos al turno por el procedimiento estándar y se actualiza el registro de salud.'),
  -- Encargado · Tarde
  ('encargado_tarde', 1, 'cambio', null, 'Se revisa el stock de ingredientes en Dodo IS. Se revisa la stop list.'),
  ('encargado_tarde', 2, 'cambio', null, 'Se revisa el horario del personal en Dodo IS y se completa el checklist de posición del turno.'),
  ('encargado_tarde', 3, 'cambio', null, 'Todos los empleados y repartidores son registrados según el procedimiento.'),
  ('encargado_tarde', 4, 'cambio', null, 'Se cuenta el efectivo en cajas y caja fuerte y se completa el registro de caja. Se imprime el reporte X del terminal de la caja del restaurante. El efectivo disponible coincide con el reporte X y se prepara el cambio.'),
  ('encargado_tarde', 5, 'cambio', null, 'Se inspecciona la limpieza de todas las estaciones: platos, equipo, la sala y la zona de entrada.'),
  ('encargado_tarde', 10, 'durante_tarde', null, 'Se revisan las alarmas para mermas.'),
  ('encargado_tarde', 11, 'durante_tarde', null, 'Se inspeccionan las verduras frescas y los productos rechazados se merman.'),
  ('encargado_tarde', 12, 'durante_tarde', null, 'Se completa el registro de temperatura y humedad.'),
  ('encargado_tarde', 13, 'durante_tarde', null, 'Se llena el registro de limpieza profunda.'),
  ('encargado_tarde', 14, 'durante_tarde', null, 'Los empleados y repartidores son admitidos al turno por el procedimiento estándar y se actualiza el registro de salud.'),
  ('encargado_tarde', 20, 'cierre', null, 'Se cierran los turnos de los repartidores.'),
  ('encargado_tarde', 21, 'cierre', null, 'Las mermas se registran en Dodo IS.'),
  ('encargado_tarde', 22, 'cierre', null, 'Se revisa el stock de ingredientes en Dodo IS. Se revisa la stop list.'),
  ('encargado_tarde', 23, 'cierre', null, 'Cajas y caja fuerte: se cuenta el efectivo, se imprime el reporte X, la cantidad coincide con el reporte, se imprime el reporte Z y se llena el registro de caja.'),
  ('encargado_tarde', 24, 'cierre', null, 'Se realiza la recolección de efectivo. La recolección de efectivo del terminal de la caja del restaurante se registra en Dodo IS.'),
  ('encargado_tarde', 25, 'cierre', null, 'Se inspecciona la limpieza de todas las estaciones: platos, equipo, la sala y la zona de entrada.'),
  ('encargado_tarde', 26, 'cierre', null, 'Se revisa la calidad de los platos lavados y las bandejas vacías se limpian de restos de masa.'),
  ('encargado_tarde', 27, 'cierre', null, 'Se revisa que los checklists del día estén completos en la app.'),
  ('encargado_tarde', 28, 'cierre', null, 'Todos los empleados son evaluados mediante evaluaciones de rendimiento y se les da feedback.'),
  ('encargado_tarde', 29, 'cierre', null, 'Cocina: el extractor, horno, estante térmico, impresoras de etiquetas, tablets, aire acondicionado y música en la cocina y la sala están apagados.'),
  ('encargado_tarde', 30, 'cierre', null, 'Zona de caja y sala: terminal de la caja y menú digital están apagados.'),
  ('encargado_tarde', 31, 'cierre', null, 'Se toma y envía un reporte fotográfico del cierre de turno.'),
  ('encargado_tarde', 32, 'cierre', null, 'Cualquier problema con el equipo, inventario u otras emergencias se informa al gerente. Si es necesario, se llena el registro de incidentes para artículos de vidrio.'),
  ('encargado_tarde', 33, 'cierre', null, 'El turno se cierra en Dodo IS.'),
  -- Tareas semanales (1 = lunes)
  ('tareas_semanales', 1, 'semanal', 1, 'Se realizó un inventario de ingredientes.'),
  ('tareas_semanales', 2, 'semanal', 1, 'Se realizó un inventario del botiquín de primeros auxilios.'),
  ('tareas_semanales', 3, 'semanal', 1, 'Se pidieron verduras.'),
  ('tareas_semanales', 4, 'semanal', 2, 'Se pidieron suministros.'),
  ('tareas_semanales', 5, 'semanal', 2, 'Se regaron las flores en la terraza.'),
  ('tareas_semanales', 6, 'semanal', 2, 'Se pidieron bebidas.'),
  ('tareas_semanales', 7, 'semanal', 3, 'Se depositó efectivo en el banco.'),
  ('tareas_semanales', 8, 'semanal', 3, 'Se pidió cambio.'),
  ('tareas_semanales', 9, 'semanal', 4, 'Se enviaron delantales para lavar.'),
  ('tareas_semanales', 10, 'semanal', 4, 'Se enviaron cuchillos para afilar.'),
  -- Limpieza
  ('limpieza', 1, 'apertura', null, 'Todos los dispensadores están surtidos: jabón, desinfectante, toallas de papel y guantes.'),
  ('limpieza', 2, 'apertura', null, 'Los cepillos y fregonas se enjuagan y se cuelgan para secar.'),
  ('limpieza', 3, 'apertura', null, 'Los cubos con solución desinfectante y paños se colocan en las estaciones y en el terminal de la caja.'),
  ('limpieza', 4, 'apertura', null, 'Se prepara y etiqueta un nuevo desinfectante en spray para el día.'),
  ('limpieza', 5, 'apertura', null, 'Se llena un recipiente para desinfectar cuchillos.'),
  ('limpieza', 6, 'apertura', null, 'Se enciende el lavavajillas.'),
  ('limpieza', 10, 'hora', null, 'Se lavan los platos y el equipo.'),
  ('limpieza', 11, 'hora', null, 'Todos los dispensadores están surtidos: jabón, desinfectante, toallas de papel y guantes.'),
  ('limpieza', 12, 'hora', null, 'Las estaciones se limpian si están sucias.'),
  ('limpieza', 13, 'hora', null, 'Se barren los suelos en las áreas de comida.'),
  ('limpieza', 14, 'hora', null, 'Los cubos de basura no están llenos.'),
  ('limpieza', 15, 'hora', null, 'Los lavamanos y fregaderos de verduras están limpios.'),
  ('limpieza', 16, 'hora', null, 'El equipo, utensilios y cortadores de pizza están limpios.'),
  ('limpieza', 20, 'cierre', null, 'Se barren y friegan los suelos en la cámara frigorífica.'),
  ('limpieza', 21, 'cierre', null, 'Todos los utensilios, platos y equipos sucios se lavan en la zona de la pica. Las bandejas vacías se limpian de restos de masa.'),
  ('limpieza', 22, 'cierre', null, 'Los fregaderos, lavavajillas, paredes y suelo en la zona de la pica están limpios.'),
  ('limpieza', 23, 'cierre', null, 'Se desinfectan las manijas de las puertas y de las neveras.'),
  ('limpieza', 24, 'cierre', null, 'Los cubos de basura se lavan y desinfectan por dentro y por fuera en todas las áreas.'),
  ('limpieza', 25, 'cierre', null, 'Toda la zona amarilla está limpia: paredes, mesas, equipo, fregaderos y suelo.'),
  ('limpieza', 26, 'cierre', null, 'El baño está limpio: paredes, accesorios y suelo. El baño se limpia con desinfectante.'),
  ('limpieza', 27, 'cierre', null, 'Las herramientas de trabajo se lavan y desinfectan: cubos, carros de cubos, recogedores y pulverizadores.'),
  ('limpieza', 28, 'cierre', null, 'El cuarto de limpieza y el fregadero están limpios. Las fregonas y escobas se remojan en desinfectante durante la noche.'),
  -- Zona de preparaciones
  ('preparaciones', 1, 'apertura', null, 'Se registra el stock restante y se da seguimiento a las preparaciones.'),
  ('preparaciones', 2, 'apertura', null, 'Los ingredientes están preparados.'),
  ('preparaciones', 3, 'apertura', null, 'El stock congelado se saca según las normas.'),
  ('preparaciones', 10, 'cierre', null, 'Toda la zona de preparaciones está limpia: paredes, mesas, equipo, fregaderos y suelo.'),
  -- Zona caliente
  ('zona_caliente', 1, 'apertura', null, 'Los carros están preparados y se saca la cantidad necesaria de masa para precalentar.'),
  ('zona_caliente', 2, 'apertura', null, 'Se organizan las herramientas limpias: tamices, rasquetas, dockers, cucharones, tazas, recipientes gastronorm, portarrecipientes, cuchillos, pala de pizza y manoplas de horno.'),
  ('zona_caliente', 3, 'apertura', null, 'Los ingredientes se reponen en la línea de ingredientes, mesa de empaque y equipos de congelación. Se revisan las fechas de caducidad.'),
  ('zona_caliente', 4, 'apertura', null, 'Se configuran las alarmas para las mermas.'),
  ('zona_caliente', 10, 'durante_manana', null, 'Los cucharones, recipientes y cortadores de pizza están limpios.'),
  ('zona_caliente', 11, 'durante_manana', null, 'Los problemas de equipo, herramientas rotas y cualquier asunto urgente se informan al encargado del turno.'),
  ('zona_caliente', 12, 'durante_manana', null, 'La sémola está limpia; se tamiza si se ensucia.'),
  ('zona_caliente', 20, 'durante_tarde', null, 'Los cucharones, recipientes y cortadores de pizza están limpios.'),
  ('zona_caliente', 21, 'durante_tarde', null, 'Los problemas de equipo, herramientas rotas y cualquier asunto urgente se informan al encargado del turno.'),
  ('zona_caliente', 22, 'durante_tarde', null, 'La sémola está limpia; se tamiza si se ensucia.'),
  ('zona_caliente', 30, 'hora', null, 'La masa se saca según las normas.'),
  ('zona_caliente', 31, 'hora', null, 'Los dodsters se preparan según las normas.'),
  ('zona_caliente', 32, 'hora', null, 'Se revisa el etiquetado en la línea de ingredientes.'),
  ('zona_caliente', 33, 'hora', null, 'Se revisa el etiquetado en la nevera.'),
  ('zona_caliente', 34, 'hora', null, 'Se revisa el etiquetado en el congelador.'),
  ('zona_caliente', 40, 'cierre', null, 'Los ingredientes de la línea de ingredientes y la mesa de empaque se devuelven a la nevera.'),
  ('zona_caliente', 41, 'cierre', null, 'Todos los artículos que deben desecharse antes de abrir (productos, ingredientes, ensaladas, masa y preparaciones de entrantes) se merman.'),
  ('zona_caliente', 42, 'cierre', null, 'Todos los utensilios se llevan a la zona de la pica: tamiz, rasquetas, docker, cucharones, tazas, recipientes gastronorm, cuchillos, pala de pizza y manoplas de horno.'),
  ('zona_caliente', 43, 'cierre', null, 'La línea de ingredientes se limpia y desinfecta según los procedimientos estándar.'),
  ('zona_caliente', 44, 'cierre', null, 'Toda la zona caliente se limpia: paredes, mesas, equipo, fregaderos y suelo. Las superficies en contacto con alimentos se desinfectan según los estándares.'),
  ('zona_caliente', 45, 'cierre', null, 'Se vacían los cubos de basura y se desecha la basura.'),
  -- Caja y sala
  ('caja_sala', 1, 'apertura', null, 'Caja del restaurante: se cuenta el efectivo, se genera el reporte X, el efectivo coincide con el reporte X y se llena el registro de caja.'),
  ('caja_sala', 2, 'apertura', null, 'Hay suficiente cambio para las transacciones y un rollo de papel térmico de repuesto.'),
  ('caja_sala', 3, 'apertura', null, 'Se revisan las bebidas en la nevera: se verifica la vida útil y se alinean según FEFO.'),
  ('caja_sala', 4, 'apertura', null, 'Hay suficientes bebidas calientes, té y cacao.'),
  ('caja_sala', 5, 'apertura', null, 'Hay suficientes bolsas de plástico.'),
  ('caja_sala', 10, 'hora', null, 'Se revisan FEFO y las fechas de caducidad.'),
  ('caja_sala', 11, 'hora', null, 'Hay suficientes bebidas en la nevera, organizadas según FEFO.'),
  ('caja_sala', 12, 'hora', null, 'Hay repuestos de consumibles: servilletas, cubiertos, etc.'),
  ('caja_sala', 13, 'hora', null, 'La sala está limpia: mesas, bases, sillas, sofás y suelos.'),
  ('caja_sala', 14, 'hora', null, 'La temperatura de la sala está entre 17 y 27 °C.'),
  ('caja_sala', 15, 'hora', null, 'Los soportes, carteles de mesa y bolsillos están limpios, intactos y surtidos con folletos y encuestas.'),
  ('caja_sala', 16, 'hora', null, 'La zona de entrada está limpia: pasillo, puerta de entrada, ventanas, escaleras y pasamanos.'),
  ('caja_sala', 17, 'hora', null, 'El cubo de basura no está lleno.'),
  ('caja_sala', 20, 'cierre', null, 'El baño de clientes está limpio: paredes, accesorios y suelo. El baño se desinfecta.'),
  ('caja_sala', 21, 'cierre', null, 'Se cuenta el efectivo, se crea el reporte X y las cantidades coinciden. Se imprime el reporte Z y se llena el registro de caja. Se recoge el efectivo de las cajas y la recolección de la caja del restaurante se registra en Dodo IS.'),
  ('caja_sala', 22, 'cierre', null, 'Los cubos de basura se lavan y desinfectan por dentro y por fuera.'),
  ('caja_sala', 23, 'cierre', null, 'La sala está limpia: todas las superficies, lámparas, alféizares, sofás, sillas, mesas y suelos.'),
  ('caja_sala', 24, 'cierre', null, 'Se desinfectan las manijas de las puertas, pasamanos, mostradores, la zona de caja y el asa del hervidor.'),
  ('caja_sala', 25, 'cierre', null, 'La zona de caja está limpia: superficies, equipo, utensilios y suelos.'),
  ('caja_sala', 26, 'cierre', null, 'Las herramientas de trabajo se lavan y desinfectan: cubos, carros de cubos, recogedores y pulverizadores.'),
  -- Baño
  ('bano', 1, 'hora', null, 'El baño está limpio: lavabo, inodoro, espejo y suelo.'),
  ('bano', 2, 'hora', null, 'Hay papel higiénico, jabón y toallas de papel.'),
  ('bano', 3, 'hora', null, 'El cubo de basura no está lleno.')
) as p(clave, orden, momento, dia, texto)
join checklists c on c.clave = p.clave
on conflict (checklist_id, orden) do nothing;

insert into areas_limpieza_profunda (semana, dia_semana, area) values
  (1, 1, 'Horno (parte de arriba)'), (1, 2, 'Lavavajillas y zona de lavado'), (1, 3, 'Cocina'),
  (1, 4, 'Cuarto del personal'), (1, 5, 'Fregadero de fregonas y almacén'),
  (1, 6, 'Zona de empaque y nevera de bebidas'), (1, 7, 'Cámara fría'),
  (2, 1, 'Horno (parte de abajo)'), (2, 2, 'Lavavajillas y zona de lavado'), (2, 3, 'Sala'),
  (2, 4, 'Baño'), (2, 5, 'Congelador'), (2, 6, 'Entrada'), (2, 7, 'Zona de caja')
on conflict (semana, dia_semana) do update set area = excluded.area;
```

- [ ] **Step 5: Correr migración, datos y pruebas**

Pide a Sebastián: en SQL Editor, `0005_checklists_zonas.sql`, luego `seed_checklists_zonas.sql`, luego `pruebas/0005_checklists_zonas.sql`.
Expected: "Success" dos veces; pruebas terminan con `PRUEBAS OK — área de limpieza profunda · recorridos aislados · reglas de registro · …`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0005_checklists_zonas.sql supabase/seed_checklists_zonas.sql supabase/pruebas/0005_checklists_zonas.sql
git commit -m "Checklists de zonas: migración, datos del Excel y pruebas SQL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Lógica pura (limpieza profunda, amasado, listas, corporativo)

**Files:**
- Create: `lib/limpiezaProfunda.ts`, `lib/limpiezaProfunda.test.ts`, `lib/amasado.ts`, `lib/amasado.test.ts`, `lib/zonas.ts`, `lib/zonas.test.ts`
- Modify: `lib/tipos.ts` (agregar al final), `lib/corporativo.ts`, `lib/corporativo.test.ts`, `package.json`

**Interfaces:**
- Produces:
  - `lib/tipos.ts`: `Momento`, `RegistroChecklist`, `LoteAmasado`, `LimpiezaProfunda`, `ObjetivoTurno`, `AreaLimpieza`; `Checklist` agrega `tipo`, `en_ronda`, `orden`; `PuntoChecklist` agrega `momento`, `dia_semana`.
  - `lib/limpiezaProfunda.ts`: `semanaISO(fecha: string): number`, `diaSemanaISO(fecha: string): number` (1 = lunes), `cicloDeFecha(fecha: string): { semana: 1 | 2; dia: number }`, `areaDelDia(areas: readonly AreaLimpieza[], fecha: string): string | null`, `NOMBRE_DIA: readonly string[]` (índice 1–7).
  - `lib/amasado.ts`: `RANGOS_AMASADO`, `type TempsAmasado = { masa: number; sala: number; harina: number; agua: number }`, `fueraDeRango(t: TempsAmasado): (keyof TempsAmasado)[]`, `motivoAmasado(t: TempsAmasado): string | null`.
  - `lib/zonas.ts`: `COLUMNAS: readonly { momento: Momento; titulo: string }[]`, `type EstadoLista = "pendiente" | "hecho" | "revisado" | "no-aplica"`, `estadoLista(aplica: boolean, registro?: { revisado_por: string | null }): EstadoLista`, `type FilaLista`, `filasListas(checklists, puntos, registros, diaSemana): FilaLista[]`, `contarListas(filas: readonly FilaLista[]): { total: number; hechas: number }`, `zonaCompleta(empleado: string, respuestas: readonly { cumple: boolean | null; comentario: string | null }[]): boolean`.
  - `lib/corporativo.ts`: `DatosSucursal` agrega `rondas: { total; hechas; faltantes; conFallas }`, `listas: { total; hechas }`, `amasadoFuera: number`, `limpiezaProfunda: boolean`; `Alerta` agrega `"rondas" | "listas" | "amasado" | "limpieza"`.

- [ ] **Step 1: Pruebas**

Create `lib/limpiezaProfunda.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { areaDelDia, cicloDeFecha, diaSemanaISO, semanaISO } from "./limpiezaProfunda.ts";

const areas = [
  { semana: 1 as const, dia_semana: 1, area: "Horno (parte de arriba)" },
  { semana: 2 as const, dia_semana: 1, area: "Horno (parte de abajo)" },
  { semana: 1 as const, dia_semana: 3, area: "Cocina" },
  { semana: 1 as const, dia_semana: 5, area: "Fregadero de fregonas y almacén" },
];

test("semanaISO y día de la semana", () => {
  assert.equal(semanaISO("2026-09-21"), 39);
  assert.equal(semanaISO("2026-09-28"), 40);
  assert.equal(semanaISO("2026-01-01"), 1);
  assert.equal(diaSemanaISO("2026-09-28"), 1);
  assert.equal(diaSemanaISO("2026-10-04"), 7);
});

test("semanas impares usan la tabla 1 y pares la tabla 2", () => {
  assert.deepEqual(cicloDeFecha("2026-09-21"), { semana: 1, dia: 1 });
  assert.deepEqual(cicloDeFecha("2026-09-28"), { semana: 2, dia: 1 });
  assert.equal(areaDelDia(areas, "2026-09-21"), "Horno (parte de arriba)");
  assert.equal(areaDelDia(areas, "2026-09-28"), "Horno (parte de abajo)");
  assert.equal(areaDelDia(areas, "2026-09-23"), "Cocina");
});

test("cambio de año: 2026 tiene 53 semanas y el 1 de enero de 2027 cae en la tabla 1", () => {
  assert.equal(semanaISO("2027-01-01"), 53);
  assert.deepEqual(cicloDeFecha("2027-01-01"), { semana: 1, dia: 5 });
  assert.equal(areaDelDia(areas, "2027-01-01"), "Fregadero de fregonas y almacén");
  assert.deepEqual(cicloDeFecha("2027-01-04"), { semana: 1, dia: 1 });
});

test("sin área para ese día devuelve null", () => {
  assert.equal(areaDelDia(areas, "2026-09-22"), null);
});
```

Create `lib/amasado.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fueraDeRango, motivoAmasado } from "./amasado.ts";

const bien = { masa: 25, sala: 22, harina: 20, agua: 15 };

test("dentro de rango no pide comentario (bordes incluidos)", () => {
  assert.deepEqual(fueraDeRango(bien), []);
  assert.deepEqual(fueraDeRango({ masa: 24, sala: 16, harina: 26, agua: 9 }), []);
  assert.equal(motivoAmasado(bien), null);
});

test("cada temperatura fuera de rango se reporta, la masa primero", () => {
  assert.deepEqual(fueraDeRango({ ...bien, masa: 28, agua: 22 }), ["masa", "agua"]);
  assert.equal(motivoAmasado({ ...bien, masa: 28 }), "la masa está a 28 °C, fuera de 24 a 26 °C");
  assert.equal(motivoAmasado({ ...bien, sala: 30 }), "la sala está a 30 °C, fuera de 16 a 26 °C");
  assert.equal(motivoAmasado({ ...bien, agua: 5 }), "el agua está a 5 °C, fuera de 9 a 20 °C");
});
```

Create `lib/zonas.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { contarListas, estadoLista, filasListas, zonaCompleta } from "./zonas.ts";

const checklists = [
  { id: "em", clave: "encargado_manana", nombre: "Encargado · Mañana", orden: 10 },
  { id: "ts", clave: "tareas_semanales", nombre: "Tareas semanales", orden: 30 },
  { id: "bn", clave: "bano", nombre: "Baño", orden: 80 },
];
const puntos = [
  { checklist_id: "em", momento: "apertura" as const, dia_semana: null },
  { checklist_id: "em", momento: "cambio" as const, dia_semana: null },
  { checklist_id: "em", momento: "durante_manana" as const, dia_semana: null },
  { checklist_id: "ts", momento: "semanal" as const, dia_semana: 1 },
  { checklist_id: "bn", momento: "hora" as const, dia_semana: null },
];
const registros = [
  { checklist_id: "em", momento: "apertura" as const, revisado_por: "u1" },
  { checklist_id: "em", momento: "cambio" as const, revisado_por: null },
];

test("estadoLista", () => {
  assert.equal(estadoLista(false), "no-aplica");
  assert.equal(estadoLista(true), "pendiente");
  assert.equal(estadoLista(true, { revisado_por: null }), "hecho");
  assert.equal(estadoLista(true, { revisado_por: "u1" }), "revisado");
});

test("filasListas arma una fila por lista con momentos de turno y omite las que solo tienen ronda", () => {
  const filas = filasListas(checklists, puntos, registros, 1);
  assert.deepEqual(filas.map((f) => f.clave), ["encargado_manana", "tareas_semanales"]);
  const em = Object.fromEntries(filas[0].celdas.map((c) => [c.momento, c.estado]));
  assert.deepEqual(em, {
    apertura: "revisado", cambio: "hecho", durante_manana: "pendiente",
    durante_tarde: "no-aplica", cierre: "no-aplica", semanal: "no-aplica",
  });
  assert.equal(filas[1].celdas.find((c) => c.momento === "semanal")?.estado, "pendiente");
});

test("tareas semanales en viernes no aplican", () => {
  const filas = filasListas(checklists, puntos, [], 5);
  assert.equal(filas[1].celdas.find((c) => c.momento === "semanal")?.estado, "no-aplica");
});

test("contarListas cuenta solo las casillas que aplican", () => {
  assert.deepEqual(contarListas(filasListas(checklists, puntos, registros, 1)), { total: 4, hechas: 2 });
});

test("zonaCompleta exige nombre, todos los puntos y comentario en cada no cumple", () => {
  assert.equal(zonaCompleta("Ana", [{ cumple: true, comentario: null }, { cumple: false, comentario: "sucio" }]), true);
  assert.equal(zonaCompleta(" ", [{ cumple: true, comentario: null }]), false);
  assert.equal(zonaCompleta("Ana", [{ cumple: null, comentario: null }]), false);
  assert.equal(zonaCompleta("Ana", [{ cumple: false, comentario: null }]), false);
});
```

In `lib/corporativo.test.ts`, replace the line `  mermasCerradas: true, mermas: 3, gastos: 250, sinComprobante: 0,` in `base` with:

```ts
  mermasCerradas: true, mermas: 3, gastos: 250, sinComprobante: 0,
  rondas: { total: 61, hechas: 61, faltantes: 0, conFallas: 0 },
  listas: { total: 12, hechas: 12 },
  amasadoFuera: 0, limpiezaProfunda: true,
```

and append:

```ts
test("rondas con horas faltantes o fallas, listas y limpieza incompletas al terminar el día, amasado fuera de rango", () => {
  assert.deepEqual(alertasDeSucursal({ ...base, rondas: { ...base.rondas, faltantes: 2 } }, false), ["rondas"]);
  assert.deepEqual(alertasDeSucursal({ ...base, rondas: { ...base.rondas, conFallas: 1 } }, true), ["rondas"]);
  assert.deepEqual(alertasDeSucursal({ ...base, listas: { total: 12, hechas: 9 } }, false), []);
  assert.deepEqual(alertasDeSucursal({ ...base, listas: { total: 12, hechas: 9 } }, true), ["listas"]);
  assert.deepEqual(alertasDeSucursal({ ...base, amasadoFuera: 1 }, false), ["amasado"]);
  assert.deepEqual(alertasDeSucursal({ ...base, limpiezaProfunda: false }, false), []);
  assert.deepEqual(alertasDeSucursal({ ...base, limpiezaProfunda: false }, true), ["limpieza"]);
});
```

In the existing test "una sucursal nueva sin actividad a media tarde no marca nada que aún no toca", add to `nueva`: `rondas: { total: 61, hechas: 0, faltantes: 0, conFallas: 0 }, listas: { total: 12, hechas: 0 }, amasadoFuera: 0, limpiezaProfunda: false,`.

In `package.json`, append `lib/limpiezaProfunda.test.ts lib/amasado.test.ts lib/zonas.test.ts` to the `test` script's file list.

- [ ] **Step 2: Correr para verlas fallar**

Run: `npm test`
Expected: FAIL (`Cannot find module …/lib/limpiezaProfunda.ts`, `…/lib/amasado.ts`, `…/lib/zonas.ts`; la prueba nueva de corporativo falla porque no hay alertas `rondas`/`listas`/`amasado`/`limpieza`).

- [ ] **Step 3: Implementar**

Append to `lib/tipos.ts`:

```ts

// ─── Checklists de zonas ────────────────────────────────────────────────────
export type Momento = "apertura" | "cambio" | "durante_manana" | "durante_tarde" | "cierre" | "hora" | "semanal";

export interface RegistroChecklist {
  id: string;
  checklist_id: string;
  fecha: string;
  momento: Momento;
  hora: number | null;
  empleado: string;
  registrado_por: string;
  creado_en: string;
  revisado_por: string | null;
  revisado_en: string | null;
  registro_respuestas: { punto_id: string; cumple: boolean; comentario: string | null }[];
}

export interface LoteAmasado {
  id: string; fecha: string; inicio: string; fin: string; temp_area: TempArea;
  plan_bolas: number; bolas_resultado: number;
  temp_sala: number; temp_harina: number; temp_agua: number; temp_masa: number;
  g_agua: number; g_sal: number; g_azucar: number; g_aceite: number; g_harina: number; g_levadura: number;
  minutos_amasado: number; empleado: string; comentario: string | null;
  registrado_por: string; creado_en: string; revisado_por: string | null; revisado_en: string | null;
}

export interface AreaLimpieza { semana: 1 | 2; dia_semana: number; area: string }

export interface LimpiezaProfunda {
  id: string; fecha: string; area: string; empleado: string;
  registrado_por: string; creado_en: string; revisado_por: string | null; revisado_en: string | null;
}

export interface ObjetivoTurno {
  id: string; fecha: string; turno: "manana" | "tarde"; empleado: string; objetivo: string;
  registrado_por: string; creado_en: string;
}
```

In `lib/tipos.ts`, extend the existing interfaces:

```ts
export interface Checklist {
  id: string;
  clave: string;
  nombre: string;
  horas: number[];
  roles: Rol[];
  tipo: "recorrido" | "lista";
  en_ronda: boolean;
  orden: number;
}

export interface PuntoChecklist {
  id: string;
  checklist_id: string;
  orden: number;
  texto: string;
  detalle_por_hora: Record<string, string> | null;
  momento: Momento;
  dia_semana: number | null;
}
```

Create `lib/limpiezaProfunda.ts`:

```ts
import type { AreaLimpieza } from "./tipos";

export const NOMBRE_DIA = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;

const aFecha = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

/** Día de la semana ISO (1 = lunes … 7 = domingo) de una fecha YYYY-MM-DD. */
export function diaSemanaISO(fecha: string): number {
  return aFecha(fecha).getUTCDay() || 7;
}

/** Semana ISO (1–53) de una fecha YYYY-MM-DD, igual que extract(week) de Postgres. */
export function semanaISO(fecha: string): number {
  const d = aFecha(fecha);
  d.setUTCDate(d.getUTCDate() + 4 - diaSemanaISO(fecha));
  const inicio = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - inicio) / 86_400_000 + 1) / 7);
}

/** Semana ISO impar = tabla 1, par = tabla 2. */
export function cicloDeFecha(fecha: string): { semana: 1 | 2; dia: number } {
  return { semana: semanaISO(fecha) % 2 === 1 ? 1 : 2, dia: diaSemanaISO(fecha) };
}

export function areaDelDia(areas: readonly AreaLimpieza[], fecha: string): string | null {
  const { semana, dia } = cicloDeFecha(fecha);
  return areas.find((a) => a.semana === semana && a.dia_semana === dia)?.area ?? null;
}
```

Create `lib/amasado.ts`:

```ts
/** Rangos de la hoja "Dough mixing, production" (°C, inclusivos). */
export const RANGOS_AMASADO = { masa: [24, 26], sala: [16, 26], harina: [16, 26], agua: [9, 20] } as const;

export type TempsAmasado = { masa: number; sala: number; harina: number; agua: number };

const NOMBRE: Record<keyof TempsAmasado, string> = { masa: "la masa", sala: "la sala", harina: "la harina", agua: "el agua" };
const ORDEN: (keyof TempsAmasado)[] = ["masa", "sala", "harina", "agua"];

export function fueraDeRango(t: TempsAmasado): (keyof TempsAmasado)[] {
  return ORDEN.filter((k) => t[k] < RANGOS_AMASADO[k][0] || t[k] > RANGOS_AMASADO[k][1]);
}

/** Por qué el comentario es obligatorio (la primera temperatura fuera de rango), o null. */
export function motivoAmasado(t: TempsAmasado): string | null {
  const k = fueraDeRango(t)[0];
  if (!k) return null;
  const [min, max] = RANGOS_AMASADO[k];
  return `${NOMBRE[k]} está a ${t[k]} °C, fuera de ${min} a ${max} °C`;
}
```

Create `lib/zonas.ts`:

```ts
import type { Momento } from "./tipos";

/** Columnas de las listas del turno, en orden de la jornada. */
export const COLUMNAS: readonly { momento: Momento; titulo: string }[] = [
  { momento: "apertura", titulo: "Apertura" },
  { momento: "cambio", titulo: "Cambio de turno" },
  { momento: "durante_manana", titulo: "Durante (mañana)" },
  { momento: "durante_tarde", titulo: "Durante (tarde)" },
  { momento: "cierre", titulo: "Cierre" },
  { momento: "semanal", titulo: "Tareas del día" },
];

export type EstadoLista = "pendiente" | "hecho" | "revisado" | "no-aplica";

export function estadoLista(aplica: boolean, registro?: { revisado_por: string | null }): EstadoLista {
  if (!aplica) return "no-aplica";
  if (!registro) return "pendiente";
  return registro.revisado_por ? "revisado" : "hecho";
}

export type FilaLista = {
  checklistId: string;
  clave: string;
  nombre: string;
  celdas: { momento: Momento; titulo: string; estado: EstadoLista }[];
};

/** Una fila por lista que tiene momentos de turno; las que solo tienen ronda de la hora quedan fuera. */
export function filasListas(
  checklists: readonly { id: string; clave: string; nombre: string; orden: number }[],
  puntos: readonly { checklist_id: string; momento: Momento; dia_semana: number | null }[],
  registros: readonly { checklist_id: string; momento: Momento; revisado_por: string | null }[],
  diaSemana: number,
): FilaLista[] {
  return [...checklists]
    .sort((a, b) => a.orden - b.orden)
    .filter((c) => puntos.some((p) => p.checklist_id === c.id && p.momento !== "hora"))
    .map((c) => ({
      checklistId: c.id,
      clave: c.clave,
      nombre: c.nombre,
      celdas: COLUMNAS.map(({ momento, titulo }) => {
        const aplica = puntos.some((p) => p.checklist_id === c.id && p.momento === momento
          && (momento !== "semanal" || p.dia_semana === diaSemana));
        const registro = registros.find((r) => r.checklist_id === c.id && r.momento === momento);
        return { momento, titulo, estado: estadoLista(aplica, registro) };
      }),
    }));
}

export function contarListas(filas: readonly FilaLista[]): { total: number; hechas: number } {
  const celdas = filas.flatMap((f) => f.celdas).filter((c) => c.estado !== "no-aplica");
  return { total: celdas.length, hechas: celdas.filter((c) => c.estado !== "pendiente").length };
}

/** Una zona de la ronda se puede guardar si tiene nombre, todos los puntos marcados y comentario en cada "no cumple". */
export function zonaCompleta(
  empleado: string,
  respuestas: readonly { cumple: boolean | null; comentario: string | null }[],
): boolean {
  return empleado.trim() !== ""
    && respuestas.length > 0
    && respuestas.every((r) => r.cumple !== null && (r.cumple || (r.comentario ?? "").trim() !== ""));
}
```

In `lib/corporativo.ts`, add to `DatosSucursal` after `sinComprobante: number;`:

```ts
  /** Ronda de la hora de las zonas: faltantes = horas ya cerradas sin registro. */
  rondas: { total: number; hechas: number; faltantes: number; conFallas: number };
  /** Listas del turno que aplican hoy y cuántas ya se registraron. */
  listas: { total: number; hechas: number };
  amasadoFuera: number;
  limpiezaProfunda: boolean;
```

extend `Alerta` with `| "rondas" | "listas" | "amasado" | "limpieza"`, and in `alertasDeSucursal`, before `return alertas;`:

```ts
  if (d.rondas.faltantes > 0 || d.rondas.conFallas > 0) alertas.push("rondas");
  if (d.listas.hechas < d.listas.total && diaTerminado) alertas.push("listas");
  if (d.amasadoFuera > 0) alertas.push("amasado");
  if (!d.limpiezaProfunda && diaTerminado) alertas.push("limpieza");
```

- [ ] **Step 4: Pruebas y typecheck**

Run: `npm test && npm run typecheck`
Expected: todo pasa. (El typecheck puede marcar `app/corporativo/datos.ts` por los campos nuevos de `DatosSucursal`; si pasa, sigue a Task 3 y ahí se agregan. Si falla, agrega temporalmente `rondas: { total: 0, hechas: 0, faltantes: 0, conFallas: 0 }, listas: { total: 0, hechas: 0 }, amasadoFuera: 0, limpiezaProfunda: false,` al objeto que devuelve `datosCorporativo` y regístralo en el ledger; Task 8 lo reemplaza.)

- [ ] **Step 5: Commit**

```bash
git add lib package.json app/corporativo/datos.ts
git commit -m "Checklists de zonas: lógica de limpieza profunda, amasado, listas y alertas con pruebas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Filtro de recorridos, accesos, estilos y piezas comunes

**Files:**
- Modify: `app/(app)/checklists/page.tsx`, `app/(app)/checklists/recorrido/page.tsx`, `app/globals.css`
- Create: `components/AccesosChecklists.tsx`, `app/(app)/checklists/layout.tsx`, `app/(app)/checklists/Revisar.tsx`, `app/(app)/checklists/revisar.ts`, `app/(app)/checklists/FormPuntos.tsx`, `app/(app)/checklists/TarjetasListas.tsx`

**Interfaces:**
- Consumes: `obtenerContextoParaEscribir`, `puedeSupervisar` (contexto), `hora` (formato), `FilaLista` (Task 2).
- Produces:
  - `AccesosChecklists()` (cliente).
  - `Revisar({ tipo, id, volver, revisadoPor, revisadoEn, puede }: { tipo: "checklist" | "amasado" | "limpieza"; id: string; volver: string; revisadoPor: string | null | undefined; revisadoEn: string | null; puede: boolean })`.
  - server action `revisarRegistro(formData)` (campos `tipo`, `id`, `volver`).
  - `FormPuntos({ puntos, prefijo, requerido }: { puntos: { id: string; orden: number; texto: string }[]; prefijo?: string; requerido: boolean })` → radios `cumple_<id>` y comentario `comentario_<id>`; reporta cambios con `onCambio?: (id: string, valor: "si" | "no") => void`.
  - `TarjetasListas({ filas, enlace }: { filas: FilaLista[]; enlace: boolean })`.
  - clases CSS: `.accesos`, `.zona`, `.estado-lista`.

- [ ] **Step 1: Filtrar recorridos**

In `app/(app)/checklists/page.tsx`, change the checklists query to only recorridos:

```ts
      supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden").eq("tipo", "recorrido").returns<Checklist[]>(),
```

In `app/(app)/checklists/recorrido/page.tsx`, change `supabase.from("checklists").select("id, clave, nombre, horas, roles").returns<Checklist[]>(),` to:

```ts
    supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden").eq("tipo", "recorrido").returns<Checklist[]>(),
```

and its `checklist_puntos` query to `.select("id, checklist_id, orden, texto, detalle_por_hora, momento, dia_semana").eq("momento", "hora")`.

- [ ] **Step 2: Barra de accesos**

Create `components/AccesosChecklists.tsx`:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ACCESOS = [
  { href: "/checklists", texto: "Resumen" },
  { href: "/checklists/ronda", texto: "Ronda de la hora" },
  { href: "/checklists/turno", texto: "Listas del turno" },
  { href: "/checklists/masa", texto: "Masa" },
  { href: "/checklists/recorrido", texto: "Recorrido" },
  { href: "/checklists/amasado", texto: "Amasado" },
  { href: "/checklists/mermas", texto: "Mermas" },
  { href: "/checklists/limpieza-profunda", texto: "Limpieza profunda" },
  { href: "/checklists/objetivos", texto: "Objetivos" },
];

export function AccesosChecklists() {
  const ruta = usePathname();
  return (
    <nav className="accesos" aria-label="Checklists">
      {ACCESOS.map((a) => (
        <Link key={a.href} href={a.href} aria-current={ruta === a.href ? "page" : undefined}>{a.texto}</Link>
      ))}
    </nav>
  );
}
```

Create `app/(app)/checklists/layout.tsx`:

```tsx
import { AccesosChecklists } from "@/components/AccesosChecklists";

export default function LayoutChecklists({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AccesosChecklists />
      {children}
    </>
  );
}
```

- [ ] **Step 3: Revisado**

Create `app/(app)/checklists/revisar.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";

const TIPOS = ["checklist", "amasado", "limpieza"];

/** "Revisado" para listas, lotes de amasado y limpieza profunda. Regresa a la página de origen. */
export async function revisarRegistro(formData: FormData) {
  const pedido = String(formData.get("volver") ?? "/checklists");
  const volver = pedido.startsWith("/checklists") ? pedido : "/checklists";
  const { supabase } = await obtenerContextoParaEscribir(volver.split("?")[0]);
  const tipo = String(formData.get("tipo") ?? "");
  const sep = volver.includes("?") ? "&" : "?";
  if (!TIPOS.includes(tipo)) redirect(`${volver}${sep}error=${encodeURIComponent("Tipo de registro inválido.")}`);

  const { error } = await supabase.rpc("revisar", { p_tipo: tipo, p_id: String(formData.get("id") ?? "") });
  if (error) redirect(`${volver}${sep}error=${encodeURIComponent(error.message)}`);
  revalidatePath("/checklists", "layout");
  redirect(`${volver}${sep}ok=${encodeURIComponent("Marcado como revisado.")}`);
}
```

Create `app/(app)/checklists/Revisar.tsx`:

```tsx
import { BotonEnviar } from "@/components/BotonEnviar";
import { hora } from "@/lib/formato";
import { revisarRegistro } from "./revisar";

export function Revisar({
  tipo, id, volver, revisadoPor, revisadoEn, puede,
}: {
  tipo: "checklist" | "amasado" | "limpieza"; id: string; volver: string;
  revisadoPor: string | null | undefined; revisadoEn: string | null; puede: boolean;
}) {
  if (revisadoPor) {
    return <span className="estado estado-confirmado">Revisado · {revisadoPor}{revisadoEn ? ` · ${hora(revisadoEn)}` : ""}</span>;
  }
  if (!puede) return <span className="estado estado-pendiente">Por revisar</span>;
  return (
    <form action={revisarRegistro}>
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="volver" value={volver} />
      <BotonEnviar className="boton boton-secundario" pendiente="…">Revisado</BotonEnviar>
    </form>
  );
}
```

- [ ] **Step 4: Puntos Cumple / No cumple reutilizables**

Create `app/(app)/checklists/FormPuntos.tsx`:

```tsx
"use client";

import { useState } from "react";

/** Lista de puntos con Cumple / No cumple; "No cumple" abre un comentario obligatorio. */
export function FormPuntos({
  puntos, prefijo = "", requerido,
}: { puntos: { id: string; orden: number; texto: string }[]; prefijo?: string; requerido: boolean }) {
  const [valores, setValores] = useState<Record<string, "si" | "no">>({});
  return (
    <ol className="puntos">
      {puntos.map((p) => (
        <li key={p.id} className="punto">
          <fieldset className="campo">
            <legend className="etiqueta">{p.texto}</legend>
            <div className="si-no">
              <label>
                <input type="radio" name={`${prefijo}cumple_${p.id}`} value="si" required={requerido}
                  checked={valores[p.id] === "si"} onChange={() => setValores({ ...valores, [p.id]: "si" })} />
                <span>Cumple</span>
              </label>
              <label>
                <input type="radio" name={`${prefijo}cumple_${p.id}`} value="no"
                  checked={valores[p.id] === "no"} onChange={() => setValores({ ...valores, [p.id]: "no" })} />
                <span>No cumple</span>
              </label>
            </div>
          </fieldset>
          {valores[p.id] === "no" && (
            <div className="campo">
              <label htmlFor={`${prefijo}comentario_${p.id}`}>¿Qué pasó?</label>
              <textarea id={`${prefijo}comentario_${p.id}`} name={`${prefijo}comentario_${p.id}`} rows={2} required />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 5: Tarjetas de listas del turno**

Create `app/(app)/checklists/TarjetasListas.tsx`:

```tsx
import Link from "next/link";
import type { EstadoLista, FilaLista } from "@/lib/zonas";

const TEXTO: Record<EstadoLista, string> = { pendiente: "Pendiente", hecho: "Hecho", revisado: "Revisado", "no-aplica": "—" };

export function TarjetasListas({ filas, enlace }: { filas: FilaLista[]; enlace: boolean }) {
  return (
    <div className="tarjetas">
      {filas.map((f) => (
        <article key={f.checklistId} className="tarjeta zona" aria-label={f.nombre}>
          <h3>{f.nombre}</h3>
          <ul className="estados-lista">
            {f.celdas.filter((c) => c.estado !== "no-aplica").map((c) => (
              <li key={c.momento}>
                <span>{c.titulo}</span>
                {enlace ? (
                  <Link className="estado-lista" data-estado={c.estado} href={`/checklists/turno?lista=${f.clave}&momento=${c.momento}`}>
                    {TEXTO[c.estado]}
                  </Link>
                ) : (
                  <span className="estado-lista" data-estado={c.estado}>{TEXTO[c.estado]}</span>
                )}
              </li>
            ))}
            {f.celdas.every((c) => c.estado === "no-aplica") && <li><span className="saldo-nota">Nada que hacer hoy.</span></li>}
          </ul>
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Estilos**

In `app/globals.css`, insert before `/* ─── Corporativo ─── */`:

```css
/* ─── Checklists de zonas ─── */
.accesos { display: flex; flex-wrap: wrap; gap: 8px; }
.accesos a {
  padding: 6px 12px; border-radius: 999px; border: 1.5px solid var(--linea);
  background: var(--blanco); color: var(--tinta); text-decoration: none; font-size: 0.9rem; min-height: 36px;
  display: inline-flex; align-items: center;
}
.accesos a[aria-current="page"] { border-color: var(--accion); background: var(--accion); color: var(--accion-texto); font-weight: 700; }
.zona { gap: 10px; }
.zona h3 { font-size: 1.1rem; }
fieldset.zona { border: 1px solid var(--linea); border-radius: 10px; padding: 16px; margin: 0; background: var(--blanco); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
fieldset.zona legend { padding: 0 6px; font-family: var(--display); font-weight: 700; font-size: 1.15rem; }
.estados-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.estados-lista li { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.estado-lista {
  display: inline-block; min-width: 96px; text-align: center; padding: 4px 10px; border-radius: 999px;
  font-size: 0.85rem; font-weight: 700; text-decoration: none; border: 1.5px solid var(--linea); color: var(--tinta);
}
.estado-lista[data-estado="pendiente"] { background: var(--alerta-fondo); color: var(--alerta-texto); border-color: var(--alerta-borde); }
.estado-lista[data-estado="hecho"] { background: var(--papel-2); }
.estado-lista[data-estado="revisado"] { background: var(--cuadra-fondo); color: var(--cuadra-texto); border-color: var(--cuadra-borde); }

```

- [ ] **Step 7: Typecheck y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores.

- [ ] **Step 8: Commit**

```bash
git add components/AccesosChecklists.tsx app/globals.css "app/(app)/checklists"
git commit -m "Checklists de zonas: accesos, Revisado, puntos reutilizables y filtro de recorridos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Ronda de la hora

**Files:**
- Create: `app/(app)/checklists/ronda/actions.ts`, `app/(app)/checklists/ronda/FormRonda.tsx`, `app/(app)/checklists/ronda/page.tsx`

**Interfaces:**
- Consumes: `registrar_checklist` (Task 1); `zonaCompleta` (Task 2); `FormPuntos`, `Revisar` (Task 3); `franjasAbiertas`, `siguienteFranja`, `claveFranjas`, `etiquetaHora`, `diaOperativoMX`, `Franja` (lib/franjas).
- Produces: server action `registrarRonda(formData)` (campos `franja` = `"YYYY-MM-DD|H"`, `empleado_<checklistId>`, `<checklistId>:cumple_<puntoId>`, `<checklistId>:comentario_<puntoId>`).

- [ ] **Step 1: Acción**

Create `app/(app)/checklists/ronda/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { etiquetaHora } from "@/lib/franjas";
import { zonaCompleta } from "@/lib/zonas";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/ronda?${clave}=${encodeURIComponent(texto)}`);

/** Guarda por separado cada zona completa de la ronda; las zonas sin tocar se ignoran. */
export async function registrarRonda(formData: FormData) {
  const { supabase } = await obtenerContextoParaEscribir("/checklists/ronda");
  const [fecha, horaTexto] = String(formData.get("franja") ?? "").split("|");
  const hora = Number(horaTexto);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || !Number.isInteger(hora)) volver("error", "Elige la hora de la ronda.");

  const [{ data: zonas }, { data: puntos }] = await Promise.all([
    supabase.from("checklists").select("id, nombre, horas").eq("tipo", "lista").eq("en_ronda", true).order("orden")
      .returns<{ id: string; nombre: string; horas: number[] }[]>(),
    supabase.from("checklist_puntos").select("id, checklist_id").eq("momento", "hora").order("orden")
      .returns<{ id: string; checklist_id: string }[]>(),
  ]);

  const guardadas: string[] = [];
  const incompletas: string[] = [];
  const fallas: string[] = [];
  for (const z of zonas ?? []) {
    if (!z.horas.includes(hora)) continue;
    const empleado = String(formData.get(`empleado_${z.id}`) ?? "").trim();
    const respuestas = (puntos ?? []).filter((p) => p.checklist_id === z.id).map((p) => {
      const valor = formData.get(`${z.id}:cumple_${p.id}`);
      return {
        punto_id: p.id,
        cumple: valor === "si" ? true : valor === "no" ? false : null,
        comentario: String(formData.get(`${z.id}:comentario_${p.id}`) ?? "").trim() || null,
      };
    });
    const tocada = empleado !== "" || respuestas.some((r) => r.cumple !== null);
    if (!tocada) continue;
    if (!zonaCompleta(empleado, respuestas)) { incompletas.push(z.nombre); continue; }
    const { error } = await supabase.rpc("registrar_checklist", {
      p_checklist: z.id, p_momento: "hora", p_fecha: fecha, p_hora: hora, p_empleado: empleado, p_respuestas: respuestas,
    });
    if (error) fallas.push(`${z.nombre}: ${error.code === "23505" ? `ya se registró la ronda de las ${etiquetaHora(hora)}` : error.message}`);
    else guardadas.push(z.nombre);
  }

  revalidatePath("/checklists", "layout");
  const faltan = incompletas.length ? `Falta completar el nombre y todos los puntos de: ${incompletas.join(", ")}.` : "";
  if (!guardadas.length) volver("error", [...fallas, faltan].filter(Boolean).join(" ") || "Llena al menos una zona.");
  volver("ok", [`Guardado: ${guardadas.join(", ")}.`, faltan, ...fallas].filter(Boolean).join(" "));
}
```

- [ ] **Step 2: Formulario**

Create `app/(app)/checklists/ronda/FormRonda.tsx`:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { etiquetaHora, type Franja } from "@/lib/franjas";
import { zonaCompleta } from "@/lib/zonas";
import { FormPuntos } from "../FormPuntos";
import { registrarRonda } from "./actions";

export type ZonaRonda = { id: string; nombre: string; horas: number[]; puntos: { id: string; orden: number; texto: string }[] };

export function FormRonda({ franjas, zonas, registradas }: { franjas: Franja[]; zonas: ZonaRonda[]; registradas: string[] }) {
  const [indice, setIndice] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const franja = franjas[indice];
  const pendientes = zonas.filter((z) => z.horas.includes(franja.hora) && !registradas.includes(`${z.id}|${franja.fecha}|${franja.hora}`));

  // Antes de enviar: una zona empezada debe estar completa, para no perder lo que se escribió.
  function revisarAntes(e: FormEvent<HTMLFormElement>) {
    const datos = new FormData(e.currentTarget);
    const incompletas = pendientes.filter((z) => {
      const empleado = String(datos.get(`empleado_${z.id}`) ?? "");
      const respuestas = z.puntos.map((p) => {
        const v = datos.get(`${z.id}:cumple_${p.id}`);
        return { cumple: v === "si" ? true : v === "no" ? false : null, comentario: String(datos.get(`${z.id}:comentario_${p.id}`) ?? "") || null };
      });
      const tocada = empleado.trim() !== "" || respuestas.some((r) => r.cumple !== null);
      return tocada && !zonaCompleta(empleado, respuestas);
    });
    if (incompletas.length) {
      e.preventDefault();
      setAviso(`Completa el nombre y todos los puntos de: ${incompletas.map((z) => z.nombre).join(", ")}.`);
    } else setAviso(null);
  }

  return (
    <form action={registrarRonda} onSubmit={revisarAntes} className="formulario">
      <input type="hidden" name="franja" value={`${franja.fecha}|${franja.hora}`} />
      {franjas.length > 1 ? (
        <div className="campo">
          <label htmlFor="franja-ronda">Hora de la ronda</label>
          <select id="franja-ronda" value={indice} onChange={(e) => setIndice(Number(e.target.value))}>
            {franjas.map((f, i) => <option key={`${f.fecha}|${f.hora}`} value={i}>{etiquetaHora(f.hora)}</option>)}
          </select>
        </div>
      ) : (
        <p><strong>Ronda de las {etiquetaHora(franja.hora)}</strong></p>
      )}
      <p className="saldo-nota">Cada zona se guarda por separado: llena solo la tuya si alguien más revisa otra.</p>
      {!pendientes.length ? <p className="vacio">Todas las zonas de esta hora ya están registradas.</p> : pendientes.map((z) => (
        <fieldset key={`${z.id}|${franja.hora}`} className="zona">
          <legend>{z.nombre}</legend>
          <div className="campo">
            <label htmlFor={`empleado_${z.id}`}>¿Quién revisó?</label>
            <input id={`empleado_${z.id}`} name={`empleado_${z.id}`} autoComplete="off" placeholder="Nombre y apellido" />
          </div>
          <FormPuntos puntos={z.puntos} prefijo={`${z.id}:`} requerido={false} />
        </fieldset>
      ))}
      {aviso && <p className="aviso aviso-error" role="alert">{aviso}</p>}
      {!!pendientes.length && <div className="acciones"><BotonEnviar>Guardar ronda</BotonEnviar></div>}
    </form>
  );
}
```

- [ ] **Step 3: Página**

Create `app/(app)/checklists/ronda/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { claveFranjas, diaOperativoMX, etiquetaHora, franjasAbiertas, siguienteFranja } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import type { Checklist, PuntoChecklist, RegistroChecklist } from "@/lib/tipos";
import { Revisar } from "../Revisar";
import { FormRonda, type ZonaRonda } from "./FormRonda";

export default async function Ronda({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const ahora = new Date();
  const fecha = diaOperativoMX(ahora);

  const [{ data: checklists }, { data: puntos }, { data: registros }, { data: nombres }] = await Promise.all([
    supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden")
      .eq("tipo", "lista").eq("en_ronda", true).order("orden").returns<Checklist[]>(),
    supabase.from("checklist_puntos").select("id, checklist_id, orden, texto, detalle_por_hora, momento, dia_semana")
      .eq("momento", "hora").order("orden").returns<PuntoChecklist[]>(),
    supabase.from("registros_checklist")
      .select("id, checklist_id, fecha, momento, hora, empleado, registrado_por, creado_en, revisado_por, revisado_en, registro_respuestas(punto_id, cumple, comentario)")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).eq("momento", "hora").order("hora", { ascending: false })
      .returns<RegistroChecklist[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const zonas: ZonaRonda[] = (checklists ?? []).map((c) => ({
    id: c.id, nombre: c.nombre, horas: c.horas,
    puntos: (puntos ?? []).filter((p) => p.checklist_id === c.id).map((p) => ({ id: p.id, orden: p.orden, texto: p.texto })),
  }));
  const horas = [...new Set(zonas.flatMap((z) => z.horas))].sort((a, b) => a - b);
  const abiertas = franjasAbiertas(horas, ahora);
  const registradas = (registros ?? []).map((r) => `${r.checklist_id}|${r.fecha}|${r.hora}`);
  const siguiente = siguienteFranja(horas, ahora);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const nombreZona = new Map(zonas.map((z) => [z.id, z.nombre]));
  const textoPunto = new Map((puntos ?? []).map((p) => [p.id, p.texto]));

  return (
    <>
      <div className="encabezado">
        <h1>Ronda de la hora</h1>
        <p>Limpieza, zona caliente, caja y sala, y baño. Cada hora se puede registrar hasta 10 minutos después de que termina.</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-ronda">
        <h2 id="t-ronda">Registrar</h2>
        {soloLectura ? <p className="vacio">Corporativo solo puede consultar.</p>
          : abiertas.length ? <FormRonda key={claveFranjas(abiertas)} franjas={abiertas} zonas={zonas} registradas={registradas} />
          : <p className="vacio">No hay ronda abierta.{siguiente !== null ? ` La siguiente es a las ${etiquetaHora(siguiente)}.` : " Ya no hay más rondas hoy."}</p>}
      </section>

      <section className="seccion" aria-labelledby="t-hechas">
        <h2 id="t-hechas">Rondas de hoy</h2>
        {!registros?.length ? <p className="vacio">Todavía no hay rondas hoy.</p> : (
          <div className="tarjetas">
            {registros.map((r) => {
              const fallas = r.registro_respuestas.filter((x) => !x.cumple);
              return (
                <article key={r.id} className="tarjeta zona" data-alerta={fallas.length ? "si" : undefined}>
                  <h3>{nombreZona.get(r.checklist_id)} · {etiquetaHora(r.hora ?? 0)}</h3>
                  <p className="saldo-nota">{r.empleado} · {hora(r.creado_en)} · sesión de {persona.get(r.registrado_por)}</p>
                  {fallas.length ? (
                    <ul className="fallas">{fallas.map((x) => <li key={x.punto_id}><strong>{textoPunto.get(x.punto_id)}</strong> {x.comentario}</li>)}</ul>
                  ) : <span className="estado estado-confirmado">Todo cumple</span>}
                  <Revisar tipo="checklist" id={r.id} volver="/checklists/ronda"
                    revisadoPor={r.revisado_por ? persona.get(r.revisado_por) : null} revisadoEn={r.revisado_en}
                    puede={puedeSupervisar(perfil.rol)} />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Pruebas, typecheck y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores; el build lista `ƒ /checklists/ronda`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/checklists/ronda"
git commit -m "Checklists de zonas: ronda de la hora

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Listas del turno

**Files:**
- Create: `app/(app)/checklists/turno/actions.ts`, `app/(app)/checklists/turno/FormLista.tsx`, `app/(app)/checklists/turno/page.tsx`

**Interfaces:**
- Consumes: `registrar_checklist` (Task 1); `filasListas`, `COLUMNAS` (Task 2); `diaSemanaISO` (Task 2); `FormPuntos`, `Revisar`, `TarjetasListas` (Task 3); `hoyMX` (formato).
- Produces: server action `registrarLista(formData)` (campos `checklist_id`, `momento`, `empleado`, `cumple_<puntoId>`, `comentario_<puntoId>`).

- [ ] **Step 1: Acción**

Create `app/(app)/checklists/turno/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { diaSemanaISO } from "@/lib/limpiezaProfunda";
import { COLUMNAS } from "@/lib/zonas";

const MOMENTOS = COLUMNAS.map((c) => c.momento as string);

export async function registrarLista(formData: FormData) {
  const { supabase } = await obtenerContextoParaEscribir("/checklists/turno");
  const checklistId = String(formData.get("checklist_id") ?? "");
  const momento = String(formData.get("momento") ?? "");
  const empleado = String(formData.get("empleado") ?? "").trim();

  const { data: lista } = await supabase.from("checklists").select("clave").eq("id", checklistId).eq("tipo", "lista")
    .maybeSingle<{ clave: string }>();
  const base = lista ? `/checklists/turno?lista=${lista.clave}&momento=${momento}` : "/checklists/turno?x=1";
  const volver = (clave: "ok" | "error", texto: string) => redirect(`${base}&${clave}=${encodeURIComponent(texto)}`);

  if (!lista || !MOMENTOS.includes(momento)) volver("error", "Elige la lista y el momento.");
  if (!empleado) volver("error", "Escribe quién hizo la lista.");

  let consulta = supabase.from("checklist_puntos").select("id").eq("checklist_id", checklistId).eq("momento", momento);
  if (momento === "semanal") consulta = consulta.eq("dia_semana", diaSemanaISO(hoyMX()));
  const { data: puntos } = await consulta.returns<{ id: string }[]>();
  const respuestas = (puntos ?? []).map((p) => {
    const valor = formData.get(`cumple_${p.id}`);
    return {
      punto_id: p.id,
      cumple: valor === "si" ? true : valor === "no" ? false : null,
      comentario: String(formData.get(`comentario_${p.id}`) ?? "").trim() || null,
    };
  });
  if (!respuestas.length || respuestas.some((r) => r.cumple === null)) volver("error", "Marca Cumple o No cumple en todos los puntos.");
  if (respuestas.some((r) => r.cumple === false && !r.comentario)) volver("error", "Escribe qué pasó en cada punto que no cumple.");

  const { error } = await supabase.rpc("registrar_checklist", {
    p_checklist: checklistId, p_momento: momento, p_fecha: null, p_hora: null, p_empleado: empleado, p_respuestas: respuestas,
  });
  if (error) volver("error", error.code === "23505" ? "Esta lista ya se registró hoy." : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Lista guardada.");
}
```

- [ ] **Step 2: Formulario**

Create `app/(app)/checklists/turno/FormLista.tsx`:

```tsx
import { BotonEnviar } from "@/components/BotonEnviar";
import { FormPuntos } from "../FormPuntos";
import { registrarLista } from "./actions";

export function FormLista({
  checklistId, momento, puntos,
}: { checklistId: string; momento: string; puntos: { id: string; orden: number; texto: string }[] }) {
  return (
    <form action={registrarLista} className="formulario">
      <input type="hidden" name="checklist_id" value={checklistId} />
      <input type="hidden" name="momento" value={momento} />
      <div className="campo">
        <label htmlFor="empleado">¿Quién hizo la lista?</label>
        <input id="empleado" name="empleado" required autoComplete="off" placeholder="Nombre y apellido" />
      </div>
      <FormPuntos puntos={puntos} requerido />
      <div className="acciones"><BotonEnviar>Guardar lista</BotonEnviar></div>
    </form>
  );
}
```

- [ ] **Step 3: Página**

Create `app/(app)/checklists/turno/page.tsx`:

```tsx
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { diaSemanaISO } from "@/lib/limpiezaProfunda";
import type { Checklist, PuntoChecklist, RegistroChecklist } from "@/lib/tipos";
import { COLUMNAS, filasListas } from "@/lib/zonas";
import { Revisar } from "../Revisar";
import { TarjetasListas } from "../TarjetasListas";
import { FormLista } from "./FormLista";

export default async function ListasDelTurno({
  searchParams,
}: { searchParams: Promise<{ ok?: string; error?: string; lista?: string; momento?: string }> }) {
  const { ok, error, lista, momento } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());
  const dia = diaSemanaISO(fecha);

  const [{ data: checklists }, { data: puntos }, { data: registros }, { data: nombres }] = await Promise.all([
    supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden")
      .eq("tipo", "lista").order("orden").returns<Checklist[]>(),
    supabase.from("checklist_puntos").select("id, checklist_id, orden, texto, detalle_por_hora, momento, dia_semana")
      .neq("momento", "hora").order("orden").returns<PuntoChecklist[]>(),
    supabase.from("registros_checklist")
      .select("id, checklist_id, fecha, momento, hora, empleado, registrado_por, creado_en, revisado_por, revisado_en, registro_respuestas(punto_id, cumple, comentario)")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).neq("momento", "hora").returns<RegistroChecklist[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const filas = filasListas(checklists ?? [], puntos ?? [], registros ?? [], dia);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));

  const elegida = (checklists ?? []).find((c) => c.clave === lista);
  const columna = COLUMNAS.find((c) => c.momento === momento);
  const puntosElegidos = elegida && columna
    ? (puntos ?? []).filter((p) => p.checklist_id === elegida.id && p.momento === columna.momento
        && (columna.momento !== "semanal" || p.dia_semana === dia))
    : [];
  const registro = elegida && columna ? (registros ?? []).find((r) => r.checklist_id === elegida.id && r.momento === columna.momento) : undefined;
  const puedeRegistrar = !!elegida && !soloLectura && elegida.roles.includes(perfil.rol);
  const textoPunto = new Map((puntos ?? []).map((p) => [p.id, p.texto]));

  return (
    <>
      <div className="encabezado">
        <h1>Listas del turno</h1>
        <p>Apertura, cambio de turno, durante el turno, cierre y tareas del día. Toca una casilla para llenarla o verla.</p>
      </div>
      <Aviso ok={ok} error={error} />

      {elegida && columna && (
        <section className="seccion" aria-labelledby="t-lista">
          <div className="acciones">
            <h2 id="t-lista">{elegida.nombre} · {columna.titulo}</h2>
            <Link href="/checklists/turno">Volver a las listas</Link>
          </div>
          {registro ? (
            <>
              <p className="saldo-nota">Hecha por {registro.empleado} · {hora(registro.creado_en)} · sesión de {persona.get(registro.registrado_por)}</p>
              <ul className="fallas">
                {registro.registro_respuestas.filter((x) => !x.cumple).map((x) => (
                  <li key={x.punto_id}><strong>{textoPunto.get(x.punto_id)}</strong> {x.comentario}</li>
                ))}
              </ul>
              {registro.registro_respuestas.every((x) => x.cumple) && <span className="estado estado-confirmado">Todo cumple</span>}
              <Revisar tipo="checklist" id={registro.id} volver={`/checklists/turno?lista=${elegida.clave}&momento=${columna.momento}`}
                revisadoPor={registro.revisado_por ? persona.get(registro.revisado_por) : null} revisadoEn={registro.revisado_en}
                puede={puedeSupervisar(perfil.rol)} />
            </>
          ) : !puntosElegidos.length ? <p className="vacio">Esta lista no tiene nada que hacer en este momento hoy.</p>
            : puedeRegistrar ? <FormLista checklistId={elegida.id} momento={columna.momento} puntos={puntosElegidos} />
            : <p className="vacio">{soloLectura ? "Corporativo solo puede consultar." : "Esta lista la registra el encargado o el gerente."}</p>}
        </section>
      )}

      <section className="seccion" aria-labelledby="t-listas">
        <h2 id="t-listas">Hoy</h2>
        <TarjetasListas filas={filas} enlace />
      </section>
    </>
  );
}
```

- [ ] **Step 4: Pruebas, typecheck y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores; el build lista `ƒ /checklists/turno`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/checklists/turno"
git commit -m "Checklists de zonas: listas del turno

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Amasado, limpieza profunda y objetivos

**Files:**
- Create: `app/(app)/checklists/amasado/actions.ts`, `FormAmasado.tsx`, `page.tsx`; `app/(app)/checklists/limpieza-profunda/actions.ts`, `page.tsx`; `app/(app)/checklists/objetivos/actions.ts`, `page.tsx`

**Interfaces:**
- Consumes: tablas de Task 1; `motivoAmasado`, `RANGOS_AMASADO`, `areaDelDia`, `NOMBRE_DIA`, `diaSemanaISO` (Task 2); `Revisar` (Task 3); `decimal`, `hora` (formato); `TEMPS_AREA` (lib/masa).
- Produces: server actions `registrarLote`, `registrarLimpiezaProfunda`, `registrarObjetivo`.

- [ ] **Step 1: Amasado**

Create `app/(app)/checklists/amasado/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";
import { decimal } from "@/lib/formato";
import { TEMPS_AREA } from "@/lib/masa";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/amasado?${clave}=${encodeURIComponent(texto)}`);
const TEMPS = ["temp_sala", "temp_harina", "temp_agua", "temp_masa"] as const;
const GRAMOS = ["g_agua", "g_sal", "g_azucar", "g_aceite", "g_harina", "g_levadura"] as const;

export async function registrarLote(formData: FormData) {
  const { supabase, sucursal } = await obtenerContextoParaEscribir("/checklists/amasado");
  const texto = (k: string) => String(formData.get(k) ?? "").trim();
  const entero = (k: string) => (texto(k) === "" ? Number.NaN : Number(texto(k)));

  const inicio = texto("inicio"), fin = texto("fin"), empleado = texto("empleado");
  const tempArea = Number(formData.get("temp_area"));
  if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin)) volver("error", "Escribe la hora de inicio y de fin del amasado.");
  if (!(TEMPS_AREA as readonly number[]).includes(tempArea)) volver("error", "Elige la temperatura del área: 25, 30 o 35 °C.");
  if (!empleado) volver("error", "Escribe quién amasó.");

  const fila: Record<string, number | string | null> = {
    sucursal_id: sucursal.id, inicio, fin, temp_area: tempArea, empleado, comentario: texto("comentario") || null,
    plan_bolas: entero("plan_bolas"), bolas_resultado: entero("bolas_resultado"), minutos_amasado: decimal(formData.get("minutos_amasado")),
  };
  for (const k of TEMPS) fila[k] = decimal(formData.get(k));
  for (const k of GRAMOS) fila[k] = decimal(formData.get(k));

  if (![fila.plan_bolas, fila.bolas_resultado].every((n) => Number.isInteger(n) && (n as number) >= 0)) volver("error", "Escribe las bolas planeadas y las que salieron.");
  if (!TEMPS.every((k) => Number.isFinite(fila[k]) && (fila[k] as number) >= -5 && (fila[k] as number) <= 60)) volver("error", "Revisa las temperaturas: escríbelas en grados centígrados.");
  if (!GRAMOS.every((k) => Number.isFinite(fila[k]) && (fila[k] as number) >= 0)) volver("error", "Escribe los gramos de cada ingrediente.");
  if (!(Number.isFinite(fila.minutos_amasado) && (fila.minutos_amasado as number) > 0)) volver("error", "Escribe los minutos de amasado.");

  // Si alguna temperatura sale de rango sin comentario, la base de datos responde "Escribe qué pasó: …".
  const { error } = await supabase.from("lotes_amasado").insert(fila);
  if (error) volver("error", error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Lote registrado.");
}
```

Create `app/(app)/checklists/amasado/FormAmasado.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { RANGOS_AMASADO, motivoAmasado } from "@/lib/amasado";
import { decimal } from "@/lib/formato";
import { TEMPS_AREA } from "@/lib/masa";
import { registrarLote } from "./actions";

const TEMPS = [
  { k: "temp_sala", clave: "sala", texto: "Temperatura de la pizzería" },
  { k: "temp_harina", clave: "harina", texto: "Temperatura de la harina" },
  { k: "temp_agua", clave: "agua", texto: "Temperatura del agua" },
  { k: "temp_masa", clave: "masa", texto: "Temperatura de la masa" },
] as const;
const GRAMOS = [
  { k: "g_agua", texto: "Agua" }, { k: "g_sal", texto: "Sal" }, { k: "g_azucar", texto: "Azúcar" },
  { k: "g_aceite", texto: "Aceite" }, { k: "g_harina", texto: "Harina" }, { k: "g_levadura", texto: "Levadura" },
] as const;

export function FormAmasado() {
  const [temps, setTemps] = useState<Record<string, string>>({});
  const numeros = { sala: decimal(temps.temp_sala ?? ""), harina: decimal(temps.temp_harina ?? ""), agua: decimal(temps.temp_agua ?? ""), masa: decimal(temps.temp_masa ?? "") };
  const completas = Object.values(numeros).every(Number.isFinite);
  const motivo = completas ? motivoAmasado(numeros) : null;
  const fuera = (clave: keyof typeof RANGOS_AMASADO) =>
    Number.isFinite(numeros[clave]) && (numeros[clave] < RANGOS_AMASADO[clave][0] || numeros[clave] > RANGOS_AMASADO[clave][1]);

  return (
    <form action={registrarLote} className="formulario">
      <div className="rejilla">
        <div className="campo"><label htmlFor="inicio">Inicio del amasado</label><input id="inicio" name="inicio" type="time" required /></div>
        <div className="campo"><label htmlFor="fin">Fin del amasado</label><input id="fin" name="fin" type="time" required /></div>
        <div className="campo"><label htmlFor="minutos_amasado">Minutos de amasado</label>
          <input id="minutos_amasado" name="minutos_amasado" inputMode="decimal" required autoComplete="off" />
          <small>Lento 3 min · rápido 5 min</small></div>
        <div className="campo"><label htmlFor="plan_bolas">Bolas planeadas</label><input id="plan_bolas" name="plan_bolas" type="number" min="0" step="1" required /></div>
        <div className="campo"><label htmlFor="bolas_resultado">Bolas que salieron</label><input id="bolas_resultado" name="bolas_resultado" type="number" min="0" step="1" required /></div>
      </div>
      <fieldset className="campo">
        <legend className="etiqueta">Temperatura del área (norma de bolas)</legend>
        <div className="si-no">
          {TEMPS_AREA.map((t) => <label key={t}><input type="radio" name="temp_area" value={t} required /><span>{t} °C</span></label>)}
        </div>
      </fieldset>
      <div className="rejilla">
        {TEMPS.map((t) => (
          <div key={t.k} className="campo">
            <label htmlFor={t.k}>{t.texto} (°C)</label>
            <input id={t.k} name={t.k} inputMode="decimal" required autoComplete="off"
              aria-invalid={fuera(t.clave) || undefined} className={fuera(t.clave) ? "fuera-rango" : undefined}
              value={temps[t.k] ?? ""} onChange={(e) => setTemps({ ...temps, [t.k]: e.target.value })} />
            <small>Norma: {RANGOS_AMASADO[t.clave][0]} a {RANGOS_AMASADO[t.clave][1]} °C</small>
          </div>
        ))}
      </div>
      <div className="rejilla">
        {GRAMOS.map((g) => (
          <div key={g.k} className="campo">
            <label htmlFor={g.k}>{g.texto} (g)</label>
            <input id={g.k} name={g.k} inputMode="decimal" required autoComplete="off" />
          </div>
        ))}
      </div>
      <div className="campo"><label htmlFor="empleado">¿Quién amasó?</label><input id="empleado" name="empleado" required autoComplete="off" placeholder="Nombre y apellido" /></div>
      <div className="campo">
        <label htmlFor="comentario">Comentario{motivo ? " (obligatorio)" : ""}</label>
        <textarea id="comentario" name="comentario" rows={2} required={!!motivo} />
        {motivo && <small role="status">Escribe qué pasó: {motivo}.</small>}
      </div>
      <p className="saldo-nota">Después del amasado, la masa reposa 60 minutos en cruces.</p>
      <div className="acciones"><BotonEnviar>Registrar lote</BotonEnviar></div>
    </form>
  );
}
```

Create `app/(app)/checklists/amasado/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { fueraDeRango } from "@/lib/amasado";
import { diaOperativoMX } from "@/lib/franjas";
import type { LoteAmasado } from "@/lib/tipos";
import { Revisar } from "../Revisar";
import { FormAmasado } from "./FormAmasado";

export default async function Amasado({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());
  const [{ data: lotes }, { data: nombres }] = await Promise.all([
    supabase.from("lotes_amasado").select("*").eq("sucursal_id", sucursal.id).eq("fecha", fecha)
      .order("creado_en", { ascending: false }).returns<LoteAmasado[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));

  return (
    <>
      <div className="encabezado">
        <h1>Amasado de masa</h1>
        <p>Un registro por lote. La masa debe quedar entre 24 y 26 °C; si alguna temperatura sale de norma, escribe qué pasó.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <section className="seccion" aria-labelledby="t-lote">
        <h2 id="t-lote">Registrar lote</h2>
        {soloLectura ? <p className="vacio">Corporativo solo puede consultar.</p> : <FormAmasado />}
      </section>
      <section className="seccion" aria-labelledby="t-lotes">
        <h2 id="t-lotes">Lotes de hoy</h2>
        {!lotes?.length ? <p className="vacio">Todavía no hay lotes hoy.</p> : (
          <div className="tarjetas">
            {lotes.map((l) => {
              const fuera = fueraDeRango({ masa: Number(l.temp_masa), sala: Number(l.temp_sala), harina: Number(l.temp_harina), agua: Number(l.temp_agua) });
              return (
                <article key={l.id} className="tarjeta zona" data-alerta={fuera.length ? "si" : undefined}>
                  <h3>{l.inicio.slice(0, 5)} a {l.fin.slice(0, 5)} · {l.bolas_resultado} de {l.plan_bolas} bolas</h3>
                  <p>Masa <span className={fuera.includes("masa") ? "alerta-texto" : undefined}>{Number(l.temp_masa)} °C</span> · sala {Number(l.temp_sala)} · harina {Number(l.temp_harina)} · agua {Number(l.temp_agua)} °C · {Number(l.minutos_amasado)} min</p>
                  <p className="saldo-nota">{l.empleado}{l.comentario ? ` · ${l.comentario}` : ""}</p>
                  <Revisar tipo="amasado" id={l.id} volver="/checklists/amasado"
                    revisadoPor={l.revisado_por ? persona.get(l.revisado_por) : null} revisadoEn={l.revisado_en}
                    puede={puedeSupervisar(perfil.rol)} />
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
```

In `app/globals.css`, append inside the "Checklists de zonas" block:

```css
input.fuera-rango { border-color: var(--alerta); background: var(--alerta-fondo); }
.alerta-texto { color: var(--alerta-texto); font-weight: 700; }
.tarjeta.zona[data-alerta] { border-top-color: var(--alerta); }
```

- [ ] **Step 2: Limpieza profunda**

Create `app/(app)/checklists/limpieza-profunda/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/limpieza-profunda?${clave}=${encodeURIComponent(texto)}`);

export async function registrarLimpiezaProfunda(formData: FormData) {
  const { supabase, sucursal } = await obtenerContextoParaEscribir("/checklists/limpieza-profunda");
  const empleado = String(formData.get("empleado") ?? "").trim();
  if (!empleado) volver("error", "Escribe quién hizo la limpieza profunda.");
  // La fecha y el área las pone la base de datos según el día.
  const { error } = await supabase.from("limpiezas_profundas").insert({ sucursal_id: sucursal.id, empleado });
  if (error) volver("error", error.code === "23505" ? "La limpieza profunda de hoy ya se registró." : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Limpieza profunda registrada.");
}
```

Create `app/(app)/checklists/limpieza-profunda/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { NOMBRE_DIA, areaDelDia, diaSemanaISO } from "@/lib/limpiezaProfunda";
import type { AreaLimpieza, LimpiezaProfunda } from "@/lib/tipos";
import { Revisar } from "../Revisar";
import { registrarLimpiezaProfunda } from "./actions";

export default async function LimpiezaProfundaPagina({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());
  const hace14 = new Date(`${fecha}T00:00:00Z`);
  hace14.setUTCDate(hace14.getUTCDate() - 13);

  const [{ data: areas }, { data: registros }, { data: nombres }] = await Promise.all([
    supabase.from("areas_limpieza_profunda").select("semana, dia_semana, area").returns<AreaLimpieza[]>(),
    supabase.from("limpiezas_profundas").select("*").eq("sucursal_id", sucursal.id)
      .gte("fecha", hace14.toISOString().slice(0, 10)).order("fecha", { ascending: false }).returns<LimpiezaProfunda[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const areaHoy = areaDelDia(areas ?? [], fecha);
  const deHoy = (registros ?? []).find((r) => r.fecha === fecha);

  return (
    <>
      <div className="encabezado">
        <h1>Limpieza profunda</h1>
        <p>Un área distinta cada día, en un ciclo de dos semanas. El encargado la revisa al terminar.</p>
      </div>
      <Aviso ok={ok} error={error} />
      <section className="seccion" aria-labelledby="t-hoy">
        <h2 id="t-hoy">Hoy toca: {NOMBRE_DIA[diaSemanaISO(fecha)]} · {areaHoy ?? "sin área"}</h2>
        {deHoy ? (
          <>
            <p>Hecha por {deHoy.empleado} a las {hora(deHoy.creado_en)}.</p>
            <Revisar tipo="limpieza" id={deHoy.id} volver="/checklists/limpieza-profunda"
              revisadoPor={deHoy.revisado_por ? persona.get(deHoy.revisado_por) : null} revisadoEn={deHoy.revisado_en}
              puede={puedeSupervisar(perfil.rol)} />
          </>
        ) : soloLectura ? <p className="vacio">Todavía no se registra hoy.</p> : (
          <form action={registrarLimpiezaProfunda} className="acciones">
            <div className="campo">
              <label htmlFor="empleado">¿Quién la hizo?</label>
              <input id="empleado" name="empleado" required autoComplete="off" placeholder="Nombre y apellido" />
            </div>
            <BotonEnviar>Registrar limpieza</BotonEnviar>
          </form>
        )}
      </section>
      <section className="seccion" aria-labelledby="t-historial">
        <h2 id="t-historial">Últimos 14 días</h2>
        {!registros?.length ? <p className="vacio">Sin registros.</p> : (
          <ul className="estados-lista">
            {registros.map((r) => (
              <li key={r.id}>
                <span>{r.fecha} · {r.area} · {r.empleado}</span>
                <span className="estado-lista" data-estado={r.revisado_por ? "revisado" : "hecho"}>{r.revisado_por ? "Revisado" : "Hecho"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 3: Objetivos del turno**

Create `app/(app)/checklists/objetivos/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir, puedeSupervisar } from "@/lib/contexto";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/objetivos?${clave}=${encodeURIComponent(texto)}`);

export async function registrarObjetivo(formData: FormData) {
  const { supabase, perfil, sucursal } = await obtenerContextoParaEscribir("/checklists/objetivos");
  if (!puedeSupervisar(perfil.rol)) volver("error", "Los objetivos del turno los registra el encargado o el gerente.");
  const turno = String(formData.get("turno") ?? "");
  const empleado = String(formData.get("empleado") ?? "").trim();
  const objetivo = String(formData.get("objetivo") ?? "").trim();
  if (turno !== "manana" && turno !== "tarde") volver("error", "Elige el turno.");
  if (!empleado || !objetivo) volver("error", "Escribe el empleado y su objetivo.");
  const { error } = await supabase.from("objetivos_turno").insert({ sucursal_id: sucursal.id, turno, empleado, objetivo });
  if (error) volver("error", error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Objetivo registrado.");
}
```

Create `app/(app)/checklists/objetivos/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX } from "@/lib/franjas";
import type { ObjetivoTurno } from "@/lib/tipos";
import { registrarObjetivo } from "./actions";

const TURNO = { manana: "Mañana", tarde: "Tarde" } as const;

export default async function Objetivos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());
  const { data: objetivos } = await supabase.from("objetivos_turno").select("*").eq("sucursal_id", sucursal.id).eq("fecha", fecha)
    .order("creado_en").returns<ObjetivoTurno[]>();

  return (
    <>
      <div className="encabezado">
        <h1>Objetivos del turno</h1>
        <p>Específico (qué hacer), medible (cuánto o en cuánto tiempo), con fecha límite. Pide al empleado que lo repita para confirmar que quedó claro.</p>
      </div>
      <Aviso ok={ok} error={error} />
      {!soloLectura && puedeSupervisar(perfil.rol) && (
        <form action={registrarObjetivo} className="seccion" aria-labelledby="t-nuevo">
          <h2 id="t-nuevo">Nuevo objetivo</h2>
          <div className="rejilla">
            <div className="campo"><label htmlFor="turno">Turno</label>
              <select id="turno" name="turno" defaultValue="manana"><option value="manana">Mañana</option><option value="tarde">Tarde</option></select></div>
            <div className="campo"><label htmlFor="empleado">Empleado</label><input id="empleado" name="empleado" required autoComplete="off" /></div>
          </div>
          <div className="campo"><label htmlFor="objetivo">Objetivo</label>
            <textarea id="objetivo" name="objetivo" rows={2} required placeholder="Ej. Preparar 3 kg de pepperoni antes de las 12:00" /></div>
          <div className="acciones"><BotonEnviar>Registrar objetivo</BotonEnviar></div>
        </form>
      )}
      <section className="seccion" aria-labelledby="t-hoy">
        <h2 id="t-hoy">Objetivos de hoy</h2>
        {!objetivos?.length ? <p className="vacio">Todavía no hay objetivos hoy.</p> : (
          <ul className="estados-lista">
            {objetivos.map((o) => (
              <li key={o.id}><span><strong>{o.empleado}</strong> · {o.objetivo}</span><span className="estado-lista" data-estado="hecho">{TURNO[o.turno]}</span></li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Pruebas, typecheck y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores; el build lista `/checklists/amasado`, `/checklists/limpieza-profunda`, `/checklists/objetivos`.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css "app/(app)/checklists/amasado" "app/(app)/checklists/limpieza-profunda" "app/(app)/checklists/objetivos"
git commit -m "Checklists de zonas: amasado, limpieza profunda y objetivos del turno

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Resumen ampliado

**Files:**
- Modify: `app/(app)/checklists/page.tsx`

**Interfaces:**
- Consumes: `filasListas`, `contarListas` (Task 2), `fueraDeRango`, `areaDelDia`, `diaSemanaISO` (Task 2), `TarjetasListas` (Task 3), `estadoCasilla`, `Franjas`.

- [ ] **Step 1: Consultas nuevas**

In `app/(app)/checklists/page.tsx`, after the existing `Promise.all` block, add:

```ts
  const [{ data: listasZonas }, { data: puntosListas }, { data: registrosListas }, { data: lotes }, { data: areas }, { data: limpieza }] =
    await Promise.all([
      supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden").eq("tipo", "lista").order("orden").returns<Checklist[]>(),
      supabase.from("checklist_puntos").select("checklist_id, momento, dia_semana")
        .returns<{ checklist_id: string; momento: Momento; dia_semana: number | null }[]>(),
      supabase.from("registros_checklist").select("checklist_id, momento, hora, revisado_por, registro_respuestas(cumple)")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha)
        .returns<{ checklist_id: string; momento: Momento; hora: number | null; revisado_por: string | null; registro_respuestas: { cumple: boolean }[] }[]>(),
      supabase.from("lotes_amasado").select("temp_masa, temp_sala, temp_harina, temp_agua, revisado_por").eq("sucursal_id", sucursal.id).eq("fecha", fecha)
        .returns<{ temp_masa: number; temp_sala: number; temp_harina: number; temp_agua: number; revisado_por: string | null }[]>(),
      supabase.from("areas_limpieza_profunda").select("semana, dia_semana, area").returns<AreaLimpieza[]>(),
      supabase.from("limpiezas_profundas").select("empleado, revisado_por").eq("sucursal_id", sucursal.id).eq("fecha", fecha)
        .maybeSingle<{ empleado: string; revisado_por: string | null }>(),
    ]);

  const zonasRonda = (listasZonas ?? []).filter((c) => c.en_ronda);
  const casillasRonda = (c: Checklist) => c.horas.map((h) => {
    const r = (registrosListas ?? []).find((x) => x.checklist_id === c.id && x.momento === "hora" && x.hora === h);
    const registro = !r ? undefined : r.registro_respuestas.every((x) => x.cumple) ? ("ok" as const) : ("alerta" as const);
    return { hora: h, estado: estadoCasilla(registro, { fecha, hora: h }, ahora) };
  });
  const filas = filasListas(listasZonas ?? [], puntosListas ?? [], (registrosListas ?? []).filter((r) => r.momento !== "hora"), diaSemanaISO(fecha));
  const conteoListas = contarListas(filas);
  const lotesFuera = (lotes ?? []).filter((l) => fueraDeRango({ masa: Number(l.temp_masa), sala: Number(l.temp_sala), harina: Number(l.temp_harina), agua: Number(l.temp_agua) }).length).length;
  const porRevisar = (registrosListas ?? []).filter((r) => !r.revisado_por).length
    + (lotes ?? []).filter((l) => !l.revisado_por).length + (limpieza && !limpieza.revisado_por ? 1 : 0);
```

Add imports: `import { fueraDeRango } from "@/lib/amasado";`, `import { areaDelDia, diaSemanaISO } from "@/lib/limpiezaProfunda";`, `import { contarListas, filasListas } from "@/lib/zonas";`, `import { TarjetasListas } from "./TarjetasListas";`, and extend the tipos import with `AreaLimpieza, Momento`.

- [ ] **Step 2: Secciones nuevas**

In the JSX, right after the `<p className="saldo-nota">Listo: …</p>` line, add:

```tsx
      {porRevisar > 0 && <p className="aviso aviso-info">{porRevisar} {porRevisar === 1 ? "registro espera" : "registros esperan"} "Revisado" del encargado.</p>}

      <section className="seccion" aria-labelledby="t-ronda">
        <div className="acciones">
          <h2 id="t-ronda">Ronda de la hora</h2>
          {esHoy && !soloLectura && <Link className="boton" href="/checklists/ronda">Registrar</Link>}
        </div>
        {zonasRonda.map((c) => (
          <div key={c.id} className="formulario">
            <h3>{c.nombre}</h3>
            <Franjas titulo={c.nombre} casillas={casillasRonda(c)} />
          </div>
        ))}
      </section>

      <section className="seccion" aria-labelledby="t-turno">
        <div className="acciones">
          <h2 id="t-turno">Listas del turno · {conteoListas.hechas} de {conteoListas.total}</h2>
          {esHoy && !soloLectura && <Link className="boton" href="/checklists/turno">Abrir</Link>}
        </div>
        <TarjetasListas filas={filas} enlace={esHoy} />
      </section>

      <section className="seccion" aria-labelledby="t-otros">
        <h2 id="t-otros">Amasado y limpieza profunda</h2>
        <p>
          {(lotes ?? []).length} {(lotes ?? []).length === 1 ? "lote de amasado" : "lotes de amasado"}
          {lotesFuera ? <>, <span className="alerta-texto">{lotesFuera} fuera de rango</span></> : ""}.
        </p>
        <p>
          Limpieza profunda ({areaDelDia(areas ?? [], fecha) ?? "sin área"}):{" "}
          {limpieza ? `hecha por ${limpieza.empleado}${limpieza.revisado_por ? " y revisada" : ", falta revisar"}.` : "pendiente."}
        </p>
      </section>
```

Also change the page's intro paragraph to: `Rondas y listas de las zonas, temperatura de masa, recorrido, amasado, limpieza profunda y mermas del día.`

- [ ] **Step 3: Pruebas, typecheck y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/checklists/page.tsx"
git commit -m "Checklists de zonas: resumen con rondas, listas, amasado y limpieza profunda

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Vista de corporativo

**Files:**
- Modify: `app/corporativo/datos.ts`, `app/corporativo/page.tsx`

**Interfaces:**
- Consumes: `filasListas`, `contarListas`, `fueraDeRango`, `diaSemanaISO` (Task 2); `DatosSucursal` ampliado (Task 2).

- [ ] **Step 1: Datos**

In `app/corporativo/datos.ts`:
- change the checklists query to `supabase.from("checklists").select("id, clave, nombre, horas, roles, tipo, en_ronda, orden").returns<Checklist[]>(),`
- append to the `Promise.all([...])` array, after the `gastos_caja_chica` query:

```ts
    supabase.from("checklist_puntos").select("checklist_id, momento, dia_semana")
      .returns<{ checklist_id: string; momento: Momento; dia_semana: number | null }[]>(),
    supabase.from("registros_checklist").select("sucursal_id, checklist_id, momento, hora, revisado_por, registro_respuestas(cumple)").eq("fecha", fecha)
      .returns<{ sucursal_id: string; checklist_id: string; momento: Momento; hora: number | null; revisado_por: string | null; registro_respuestas: { cumple: boolean }[] }[]>(),
    supabase.from("lotes_amasado").select("sucursal_id, temp_masa, temp_sala, temp_harina, temp_agua").eq("fecha", fecha)
      .returns<{ sucursal_id: string; temp_masa: number; temp_sala: number; temp_harina: number; temp_agua: number }[]>(),
    supabase.from("limpiezas_profundas").select("sucursal_id").eq("fecha", fecha).returns<{ sucursal_id: string }[]>(),
```

- extend the destructuring with `{ data: puntosListas }, { data: registrosListas }, { data: lotes }, { data: limpiezas },` after `{ data: gastos },`.
- replace `const horasRecorrido = (checklists ?? []).flatMap(` with `const recorridos_ = (checklists ?? []).filter((c) => c.tipo === "recorrido");\n  const horasRecorrido = recorridos_.flatMap(` (same rest of the line).
- after `const horasRecorrido = …;` add:

```ts
  const listasCl = (checklists ?? []).filter((c) => c.tipo === "lista");
  const horasRonda = listasCl.filter((c) => c.en_ronda).flatMap((c) => c.horas.map((h) => ({ checklistId: c.id, hora: h })));
  const diaSemana = diaSemanaISO(fecha);
```

- inside the `.map((s) => {`, after `const arqueosDeSucursal = …;` add:

```ts
    const rl = de(registrosListas, s.id);
    const rondasHechas = rl.filter((r) => r.momento === "hora");
    const hechasRonda = new Set(rondasHechas.map((r) => `${r.checklist_id}|${r.hora}`));
    const conteoListas = contarListas(filasListas(listasCl, puntosListas ?? [], rl.filter((r) => r.momento !== "hora"), diaSemana));
```

- in the returned object, after `sinComprobante: …,` add:

```ts
      rondas: {
        total: horasRonda.length,
        hechas: rondasHechas.length,
        faltantes: horasRonda.filter((x) => !hechasRonda.has(`${x.checklistId}|${x.hora}`) && cerrada(x.hora)).length,
        conFallas: rondasHechas.filter((r) => r.registro_respuestas.some((x) => !x.cumple)).length,
      },
      listas: conteoListas,
      amasadoFuera: de(lotes, s.id).filter((l) => fueraDeRango({ masa: Number(l.temp_masa), sala: Number(l.temp_sala), harina: Number(l.temp_harina), agua: Number(l.temp_agua) }).length).length,
      limpiezaProfunda: de(limpiezas, s.id).length > 0,
```

- add imports: `import { fueraDeRango } from "@/lib/amasado";`, `import { diaSemanaISO } from "@/lib/limpiezaProfunda";`, `import { contarListas, filasListas } from "@/lib/zonas";`, and `Momento` in the tipos import. Remove any temporary placeholder added in Task 2 Step 4.

- [ ] **Step 2: Tarjeta**

In `app/corporativo/page.tsx`, right after `<span className={clases(alerta(f, "mermas"))}>Mermas cerradas: {f.mermasCerradas ? "sí" : "no"}</span>` add:

```tsx
                    <span className={clases(alerta(f, "rondas"))}>
                      Rondas {f.rondas.hechas}/{f.rondas.total}{f.rondas.conFallas ? ` · ${f.rondas.conFallas} con fallas` : ""}
                    </span>
                    <span className={clases(alerta(f, "listas"))}>Listas del turno {f.listas.hechas}/{f.listas.total}</span>
                    {f.amasadoFuera > 0 && <span className={clases(alerta(f, "amasado"))}>Amasado: {f.amasadoFuera} fuera de rango</span>}
                    <span className={clases(alerta(f, "limpieza"))}>Limpieza profunda: {f.limpiezaProfunda ? "sí" : "no"}</span>
```

- [ ] **Step 3: Pruebas, typecheck y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/corporativo
git commit -m "Checklists de zonas: rondas, listas, amasado y limpieza profunda en la vista de corporativo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: README y verificación final

**Files:**
- Modify: `README.md` (sección antes de `## Foto del ticket en caja chica`)

- [ ] **Step 1: Documentar**

Insert before `## Foto del ticket en caja chica`:

````markdown
## Checklists de zonas

Las demás hojas del Excel, en **Checklists** (barra de accesos arriba):

| Pantalla | Qué se registra | Quién |
|---|---|---|
| Ronda de la hora | Cada hora: limpieza, zona caliente y caja y sala (8:00–23:00), baño (11:00–23:00). Cada zona se guarda por separado | Cualquiera con el nombre de quien revisó; el encargado marca Revisado |
| Listas del turno | Apertura, cambio de turno, durante el turno, cierre y tareas semanales del encargado y de cada zona | Zonas: cualquiera; encargado: encargado o gerente |
| Amasado | Un lote: horas, bolas, temperaturas (masa 24–26 °C), gramos, minutos | Cualquiera; comentario si algo sale de norma |
| Limpieza profunda | El área del día (ciclo de 14 días) | Cualquiera; el encargado la revisa |
| Objetivos | Empleado y objetivo por turno | Encargado o gerente |

Nada frena el efectivo: lo incompleto se ve en el resumen y en corporativo.

### Puesta en marcha

En Supabase → **SQL Editor**:

1. `supabase/migrations/0005_checklists_zonas.sql`
2. `supabase/seed_checklists_zonas.sql`
3. `supabase/pruebas/0005_checklists_zonas.sql`: debe terminar con el error `PRUEBAS OK — …`.

### Prueba manual

1. **Ronda de la hora:** llena solo Caja y sala con un nombre y guarda; aparece en "Rondas de hoy" y las demás zonas siguen pendientes. Empieza Limpieza sin nombre: la app pide completarla antes de enviar.
2. **Listas del turno:** abre Encargado · Mañana · Apertura como encargado y guárdala; la tarjeta cambia a "Hecho". Toca "Revisado": cambia a "Revisado". Como cajero, la lista del encargado dice que la registra el encargado.
3. **Amasado:** escribe 28 °C en la masa: el campo se marca y el comentario se vuelve obligatorio.
4. **Limpieza profunda:** dice qué área toca hoy; regístrala y revísala.
5. **Resumen y corporativo:** aparecen rondas, listas del turno, amasado y limpieza profunda.
````

- [ ] **Step 2: Verificación completa**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: todas las pruebas pasan; el build lista `/checklists/ronda`, `/checklists/turno`, `/checklists/amasado`, `/checklists/limpieza-profunda`, `/checklists/objetivos`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Checklists de zonas: documentación y guion de prueba

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Publicar (fusionar a `main`) solo después de que Sebastián confirme `PRUEBAS OK` de Task 1.
