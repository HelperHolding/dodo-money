# Checklists digitales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Digitalizar tres registros de papel dentro de la app de control de efectivo: mermas del día, temperatura de masa cada hora y recorrido de supervisor cada hora.

**Architecture:** Una migración SQL nueva (`0002_checklists.sql`) con tablas, reglas (triggers y una función `registrar_recorrido`) y seguridad por renglón, igual que la 0001. Funciones puras en `lib/franjas.ts` y `lib/masa.ts` (probadas con `node --test`) calculan franjas horarias con 10 minutos de tolerancia y la norma de masa. Cuatro pantallas nuevas en `app/(app)/checklists/` siguen el patrón existente: página de servidor con `obtenerContexto()`, server action que redirige con `?ok=`/`?error=` y componente cliente solo donde hay interacción en vivo.

**Tech Stack:** Next.js 15 (App Router, server actions), React 19, TypeScript estricto, Supabase (Postgres, RLS, `@supabase/ssr`), CSS propio en `app/globals.css`. Pruebas de funciones puras con el runner nativo de Node (`node --test --experimental-strip-types`), sin dependencias nuevas.

**Spec:** `docs/superpowers/specs/2026-09-25-checklists-design.md`

## Global Constraints

- Todo texto de interfaz y mensajes de error en español de México, en segunda persona ("Escribe qué pasó…").
- Nada se edita ni se borra: sin políticas de `update` ni `delete` en ninguna tabla nueva.
- Hora de Ciudad de México = UTC−6 fijo (igual que `lib/formato.ts`). En SQL: `at time zone interval '-06:00'`.
- Una franja `(fecha, h)` acepta registro de `h:00` a `(h+1):10`. La franja de las 23:00 cierra a las 00:10 del día siguiente y pertenece a `fecha`.
- Día operativo (mermas y resumen): cambia a las **04:00** de Ciudad de México, para que el cierre nocturno después de medianoche siga contando para el día que termina.
- Masa en norma: temperatura de **12 a 22 °C inclusive**; bolas iguales a la norma de la temperatura del área (25, 30 o 35 °C). Fuera de norma → comentario obligatorio.
- Permisos: registrar merma y masa, cualquier rol; cerrar mermas y registrar recorrido, `encargado`, `gerente` o `admin`. Cada quien solo ve y registra su sucursal; `admin` ve todas.
- Sin dependencias npm nuevas. Seguir los nombres y patrones de los archivos existentes (`volver(...)`, `Aviso`, `BotonEnviar`, clases de `globals.css`).
- Cada commit termina con la línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Registro alrededor de medianoche:** a las 00:05 el recorrido de las 23:00 debe poder registrarse y guardarse con la fecha del día anterior, y el resumen debe seguir mostrando ese día. Pruebas: `franjasAbiertas` y `diaOperativoMX` en Task 2; `franja_abierta` y `dia_operativo` en Task 1.
2. **Doble toque en la tablet:** enviar dos veces la misma hora debe mostrar "Ya se registró … de las HH:00", no un error técnico. Prueba: registro duplicado de masa en `supabase/pruebas/0002_checklists.sql` (Task 1); traducción del código `23505` en las acciones (Tasks 5 y 6).
3. **Coma decimal:** "0,5" kg o "18,5" °C deben leerse como 0.5 y 18.5, no como 5 o 185 (`numero()` de `lib/formato.ts` quita las comas). Prueba: `decimal()` en Task 2.
4. **Temperatura absurda (180, −20, grados Fahrenheit):** se rechaza con un mensaje claro antes de llegar a la base de datos. Prueba: `temperaturaValida()` en Task 2; `check` de la columna en Task 1.
5. **Fuera de horario:** a las 09:30 (antes de la primera hora de masa) o con la hora actual ya registrada, la pantalla muestra cuándo es la siguiente hora en lugar de un formulario vacío. Prueba: `siguienteFranja()` en Task 2.

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0002_checklists.sql` | Crear | Tipos, tablas, funciones de horario, triggers, `registrar_recorrido`, RLS |
| `supabase/seed_checklists.sql` | Crear | Norma de masa, checklists de recorrido y sus puntos, catálogo de productos de merma |
| `supabase/pruebas/0002_checklists.sql` | Crear | Pruebas de reglas para correr en SQL Editor (no dejan datos) |
| `lib/franjas.ts` | Crear | Reloj de Ciudad de México, franjas abiertas, estado de casilla, día operativo |
| `lib/franjas.test.ts` | Crear | Pruebas de `lib/franjas.ts` |
| `lib/masa.ts` | Crear | Norma de bolas, rango de temperatura, motivo de comentario obligatorio |
| `lib/masa.test.ts` | Crear | Pruebas de `lib/masa.ts` |
| `lib/formato.ts` | Modificar | Agregar `decimal()` y `numeroCorto()` |
| `lib/formato.test.ts` | Crear | Pruebas de `decimal()` y `numeroCorto()` |
| `lib/tipos.ts` | Modificar | Tipos de checklists y `NOMBRE_MOTIVO` |
| `lib/contexto.ts` | Modificar | `puedeSupervisar()` |
| `tsconfig.json`, `package.json` | Modificar | Excluir `*.test.ts` del typecheck; script `test` |
| `components/Nav.tsx` | Modificar | Entrada "Checklists" y resaltado en subrutas |
| `components/Franjas.tsx` | Crear | Rejilla de casillas por hora |
| `app/globals.css` | Modificar | Estilos de franjas, botones sí/no, casilla, formulario |
| `app/(app)/checklists/page.tsx` | Crear | Resumen del día |
| `app/(app)/checklists/mermas/page.tsx`, `actions.ts` | Crear | Mermas y cierre del día |
| `app/(app)/checklists/masa/page.tsx`, `FormMasa.tsx`, `actions.ts` | Crear | Temperatura de masa |
| `app/(app)/checklists/recorrido/page.tsx`, `FormRecorrido.tsx`, `actions.ts` | Crear | Recorrido de supervisor |
| `README.md` | Modificar | Sección de checklists, puesta en marcha y guion de prueba |

---

### Task 0: Entorno de desarrollo

La máquina actual no tiene Node, así que no se pueden correr pruebas, typecheck ni build. Esta tarea lo deja listo.

**Files:** ninguno.

- [ ] **Step 1: Verificar Node**

Run: `node -v`
Expected: `v22.6.0` o mayor. Si dice "command not found", pide a Sebastián que instale Node LTS (por ejemplo con `winget install OpenJS.NodeJS.LTS`) y que abra una terminal nueva. **No lo instales tú**: descargar e instalar software requiere su permiso explícito.

- [ ] **Step 2: Instalar dependencias y comprobar la línea base**

Run: `npm ci && npm run typecheck`
Expected: termina sin errores. Si el typecheck falla antes de tocar nada, detente y repórtalo: es un problema previo, no de este plan.

---

### Task 1: Base de datos (migración, datos iniciales y pruebas SQL)

**Files:**
- Create: `supabase/migrations/0002_checklists.sql`
- Create: `supabase/seed_checklists.sql`
- Create: `supabase/pruebas/0002_checklists.sql`

**Interfaces:**
- Consumes: de la migración 0001, `sucursales(id)`, `perfiles(id)`, el tipo `rol_usuario` y las funciones `mi_sucursal()` y `mi_rol()`.
- Produces (usado por Tasks 3–6):
  - Tablas `productos_merma`, `mermas`, `cierres_merma`, `normas_masa`, `lecturas_masa`, `checklists`, `checklist_puntos`, `recorridos`, `recorrido_respuestas` con las columnas de abajo.
  - `mermas.fecha` y `cierres_merma.fecha` los fija la base de datos (`dia_operativo()`); la app no los envía.
  - RPC `registrar_recorrido(p_checklist uuid, p_fecha date, p_hora int, p_respuestas jsonb) returns uuid`, con `p_respuestas` = `[{ "punto_id": uuid, "cumple": boolean, "comentario": string | null }]`.
  - Duplicados de franja → error con código `23505`.

- [ ] **Step 1: Escribir las pruebas SQL (fallarán porque las tablas no existen)**

Create `supabase/pruebas/0002_checklists.sql`:

```sql
-- Pruebas de la migración 0002 (checklists). Córrelas completas en Supabase → SQL Editor
-- después de 0002_checklists.sql y seed_checklists.sql.
--
-- Necesitan un perfil activo con rol 'cajero' y otro con rol 'encargado' en la misma sucursal.
-- El resultado aparece como ERROR A PROPÓSITO: así Postgres deshace todo y no queda ningún dato.
--   · "PRUEBAS OK — …"  → todas las reglas funcionan.
--   · "FALLÓ: …"        → dice qué regla no se cumplió.
--   · "FALTAN DATOS: …" → crea los usuarios de prueba primero.

do $$
declare
  v_cajero uuid; v_enc uuid; v_suc uuid;
  v_prod uuid; v_check uuid; v_resp jsonb; v_resp_mala jsonb; v_merma uuid;
  v_ayer date := dia_operativo() - 1;
  v_hora int; v_n int;
  v_ok text[] := '{}';
begin
  -- ── Sin usuarios: horario ──────────────────────────────────────────────
  if not franja_abierta('2026-09-25', 12, '2026-09-25 12:30-06') then raise exception 'FALLÓ: 12:30 debe aceptar la hora de las 12'; end if;
  if not franja_abierta('2026-09-25', 12, '2026-09-25 13:09-06') then raise exception 'FALLÓ: 13:09 debe aceptar la hora de las 12 (tolerancia)'; end if;
  if franja_abierta('2026-09-25', 12, '2026-09-25 13:10-06') then raise exception 'FALLÓ: 13:10 ya no debe aceptar la hora de las 12'; end if;
  if franja_abierta('2026-09-25', 12, '2026-09-25 11:59-06') then raise exception 'FALLÓ: 11:59 todavía no debe aceptar la hora de las 12'; end if;
  if not franja_abierta('2026-09-25', 23, '2026-09-26 00:05-06') then raise exception 'FALLÓ: 00:05 debe aceptar la hora de las 23 del día anterior'; end if;
  if dia_operativo('2026-09-26 03:59-06') <> date '2026-09-25' then raise exception 'FALLÓ: a las 3:59 sigue siendo el día anterior'; end if;
  if dia_operativo('2026-09-26 04:00-06') <> date '2026-09-26' then raise exception 'FALLÓ: a las 4:00 empieza el día'; end if;
  v_ok := v_ok || 'horario y tolerancia';

  -- ── Datos de prueba ────────────────────────────────────────────────────
  select c.id, e.id, c.sucursal_id into v_cajero, v_enc, v_suc
    from perfiles c
    join perfiles e on e.sucursal_id = c.sucursal_id and e.rol = 'encargado' and e.activo
   where c.rol = 'cajero' and c.activo
   limit 1;
  if v_cajero is null then raise exception 'FALTAN DATOS: crea un cajero y un encargado activos en la misma sucursal.'; end if;
  select id into v_prod from productos_merma where activo order by orden limit 1;
  select id into v_check from checklists where clave = 'recorrido_manana';
  if v_prod is null or v_check is null then raise exception 'FALTAN DATOS: corre seed_checklists.sql.'; end if;
  select jsonb_agg(jsonb_build_object('punto_id', id, 'cumple', true)) into v_resp
    from checklist_puntos where checklist_id = v_check;
  select jsonb_agg(jsonb_build_object('punto_id', id, 'cumple', orden <> 1)) into v_resp_mala
    from checklist_puntos where checklist_id = v_check;

  -- ── Como cajero ────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_cajero, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  begin
    perform registrar_recorrido(v_check, dia_operativo(), 12, v_resp);
    raise exception 'FALLÓ: un cajero no debe registrar recorridos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Solo un encargado%' then raise exception 'FALLÓ: mensaje inesperado para cajero en recorrido: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'cajero no registra recorrido';

  begin
    insert into cierres_merma (sucursal_id, capturado_dodo) values (v_suc, true);
    raise exception 'FALLÓ: un cajero no debe cerrar mermas';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%row-level security%' then raise exception 'FALLÓ: mensaje inesperado para cajero al cerrar: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'cajero no cierra mermas';

  begin
    insert into mermas (sucursal_id, producto_id, cantidad, motivo, empleado) values (v_suc, v_prod, 1, 'caducidad', '   ');
    raise exception 'FALLÓ: una merma sin nombre de empleado debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%mermas_empleado_check%' then raise exception 'FALLÓ: mensaje inesperado para merma sin empleado: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'merma exige empleado';

  -- Solo se puede probar si hoy no hay cierre real de mermas.
  if not exists (select 1 from cierres_merma where sucursal_id = v_suc and fecha = dia_operativo()) then
    insert into mermas (sucursal_id, producto_id, cantidad, motivo, empleado)
    values (v_suc, v_prod, 0.5, 'caducidad', 'Prueba') returning id into v_merma;
    update mermas set cantidad = 99 where id = v_merma;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'FALLÓ: una merma no debe poder editarse'; end if;
    delete from mermas where id = v_merma;
    get diagnostics v_n = row_count;
    if v_n <> 0 then raise exception 'FALLÓ: una merma no debe poder borrarse'; end if;
    v_ok := v_ok || 'mermas no se editan ni borran';
  end if;

  -- ── Como encargado ─────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_enc, 'role', 'authenticated')::text, true);

  begin
    perform registrar_recorrido(v_check, dia_operativo(), 12, (v_resp - 0));
    raise exception 'FALLÓ: un recorrido incompleto debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Marca Cumple o No cumple%' then raise exception 'FALLÓ: mensaje inesperado para recorrido incompleto: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'recorrido completo';

  begin
    perform registrar_recorrido(v_check, dia_operativo(), 12, v_resp_mala);
    raise exception 'FALLÓ: un "no cumple" sin comentario debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe qué pasó%' then raise exception 'FALLÓ: mensaje inesperado para no cumple sin comentario: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'no cumple exige comentario';

  begin
    perform registrar_recorrido(v_check, v_ayer, 12, v_resp);
    raise exception 'FALLÓ: un recorrido de una hora cerrada debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'La hora de las 12:00 cerró%' then raise exception 'FALLÓ: mensaje inesperado para recorrido fuera de hora: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'recorrido fuera de hora';

  begin
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura) values (v_suc, v_ayer, 13, 25, 4, 30);
    raise exception 'FALLÓ: masa fuera de 12–22 °C sin comentario debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe qué pasó: la masa está%' then raise exception 'FALLÓ: mensaje inesperado para masa fuera de rango: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'masa fuera de rango exige comentario';

  begin
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura) values (v_suc, v_ayer, 13, 25, 3, 18);
    raise exception 'FALLÓ: bolas distintas a la norma sin comentario debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Escribe qué pasó: sacaste%' then raise exception 'FALLÓ: mensaje inesperado para bolas fuera de norma: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'bolas fuera de norma exigen comentario';

  begin
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura) values (v_suc, v_ayer, 13, 25, 4, 18);
    raise exception 'FALLÓ: una lectura de una hora cerrada debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'La hora de las 13:00 cerró%' then raise exception 'FALLÓ: mensaje inesperado para masa fuera de hora: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'masa fuera de hora';

  begin
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura, comentario) values (v_suc, v_ayer, 13, 25, 4, 180, 'x');
    raise exception 'FALLÓ: 180 °C debe rechazarse';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%lecturas_masa_temperatura_check%' then raise exception 'FALLÓ: mensaje inesperado para 180 °C: %', sqlerrm; end if;
  end;
  v_ok := v_ok || 'temperatura absurda';

  -- Doble registro: solo si ahora hay una hora de masa abierta.
  select n.hora into v_hora from normas_masa n
   where franja_abierta(dia_operativo(), n.hora)
     and not exists (select 1 from lecturas_masa l where l.sucursal_id = v_suc and l.fecha = dia_operativo() and l.hora = n.hora)
   limit 1;
  if v_hora is not null then
    insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura, comentario)
    values (v_suc, dia_operativo(), v_hora, 25, 0, 18, 'prueba');
    begin
      insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura, comentario)
      values (v_suc, dia_operativo(), v_hora, 25, 0, 18, 'prueba');
      raise exception 'FALLÓ: la misma hora de masa no debe registrarse dos veces';
    exception when unique_violation then null;
    end;
    v_ok := v_ok || 'masa sin duplicados';
  end if;

  if not exists (select 1 from cierres_merma where sucursal_id = v_suc and fecha = dia_operativo()) then
    insert into cierres_merma (sucursal_id, capturado_dodo) values (v_suc, true);
    begin
      insert into mermas (sucursal_id, producto_id, cantidad, motivo, empleado) values (v_suc, v_prod, 1, 'caducidad', 'Prueba');
      raise exception 'FALLÓ: después del cierre no se deben agregar mermas';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like 'Las mermas de hoy ya se cerraron%' then raise exception 'FALLÓ: mensaje inesperado tras cierre: %', sqlerrm; end if;
    end;
    v_ok := v_ok || 'cierre bloquea mermas';
  end if;

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

Pide a Sebastián que abra Supabase → SQL Editor, pegue `supabase/pruebas/0002_checklists.sql` y lo corra.
Expected: error `function franja_abierta(unknown, integer, unknown) does not exist` (todavía no hay migración).

- [ ] **Step 3: Escribir la migración**

Create `supabase/migrations/0002_checklists.sql`:

```sql
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
```

- [ ] **Step 4: Escribir los datos iniciales**

Create `supabase/seed_checklists.sql`:

```sql
-- Datos iniciales de checklists. Se puede volver a correr: no duplica nada.

-- Norma de precalentamiento de masa (hoja "Dough warming"): bolas por hora según la temperatura del área.
insert into normas_masa (hora, bolas_25, bolas_30, bolas_35) values
  (10, 2, 1, 1), (11, 2, 1, 1), (12, 2, 2, 2), (13, 4, 2, 2), (14, 2, 1, 1), (15, 2, 1, 1), (16, 2, 1, 1),
  (17, 2, 1, 1), (18, 4, 3, 3), (19, 4, 3, 3), (20, 2, 1, 1), (21, 2, 1, 1), (22, 2, 1, 1)
on conflict (hora) do update set bolas_25 = excluded.bolas_25, bolas_30 = excluded.bolas_30, bolas_35 = excluded.bolas_35;

-- Recorridos de supervisor (hojas "Supervisor morning / evening ESP", sección de inspección).
insert into checklists (clave, nombre, horas, roles) values
  ('recorrido_manana', 'Recorrido de supervisor · Mañana', '{12,13,14,15,16,17}', '{encargado,gerente,admin}'),
  ('recorrido_tarde',  'Recorrido de supervisor · Tarde',  '{18,19,20,21,22,23}', '{encargado,gerente,admin}')
on conflict (clave) do nothing;

insert into checklist_puntos (checklist_id, orden, texto, detalle_por_hora)
select c.id, p.orden, p.texto,
       case when p.orden = 7 then
         case c.clave
           when 'recorrido_manana' then '{"12":"Línea de ingredientes","13":"Línea de ingredientes","14":"Línea de ingredientes","15":"Nevera de preparaciones","16":"Línea de ingredientes","17":"Cámara congeladora"}'::jsonb
           else '{"18":"Línea de ingredientes","19":"Línea de ingredientes","20":"Línea de ingredientes","21":"Nevera de preparaciones","22":"Línea de ingredientes","23":"Cámara congeladora"}'::jsonb
         end
       end
from checklists c
cross join (values
  (1, 'La cocina está limpia.'),
  (2, 'Se han comprobado el FEFO y las fechas de caducidad. No hay productos caducados.'),
  (3, 'La cantidad de masa precalentada corresponde al plan.'),
  (4, 'Las preparaciones se hacen según los estándares y normas.'),
  (5, 'Las zonas de entrada están limpias.'),
  (6, 'Las vitrinas se reponen según los estándares.'),
  (7, 'Se revisan las fechas de caducidad de los ingredientes en congeladores, neveras y zonas de almacenamiento.')
) as p(orden, texto)
where c.clave in ('recorrido_manana', 'recorrido_tarde')
on conflict (checklist_id, orden) do nothing;

-- Productos de merma: forecast de Dodo IS (24.09.2026) más categorías genéricas para arrancar.
insert into productos_merma (categoria, nombre, unidad, orden) values
  ('Salsas', 'Salsa para pizza', 'kg', 10),
  ('Salsas', 'Mango habanero', 'kg', 20),
  ('Salsas', 'Salsa BBQ', 'kg', 30),
  ('Salsas', 'Búfalo', 'kg', 40),
  ('Salsas', 'Chimichurri', 'kg', 50),
  ('Salsas', 'Leche condensada', 'kg', 60),
  ('Salsas', 'Aderezo Ranch', 'kg', 70),
  ('Otros', 'Orégano', 'kg', 80),
  ('Otros', 'Ajo', 'kg', 90),
  ('Otros', 'Tortilla', 'pieza', 100),
  ('Otros', 'Canela', 'kg', 110),
  ('Otros', 'Aceite', 'kg', 120),
  ('Otros', 'Levadura', 'kg', 130),
  ('Otros', 'Sal', 'kg', 140),
  ('Otros', 'Azúcar', 'kg', 150),
  ('Entrantes', 'Papas francesas', 'kg', 160),
  ('Entrantes', 'Alitas', 'kg', 170),
  ('Entrantes', 'Boneless', 'kg', 180),
  ('Entrantes', 'Papas Gajo Medium', 'pieza', 190),
  ('Verduras', 'Perejil', 'kg', 200),
  ('Verduras', 'Cebolla morada', 'kg', 210),
  ('Verduras', 'Pimiento verde', 'kg', 220),
  ('Verduras', 'Jitomate', 'kg', 230),
  ('Verduras', 'Champiñones', 'kg', 240),
  ('Productos en conserva', 'Piña', 'kg', 250),
  ('Productos en conserva', 'Elote', 'kg', 260),
  ('Productos en conserva', 'Jalapeño', 'kg', 270),
  ('Queso', 'Queso de cabra', 'kg', 280),
  ('Queso', 'Mozzarella', 'kg', 290),
  ('Queso', 'Parmesano', 'kg', 300),
  ('Queso', 'Cheddar', 'l', 310),
  ('Carne', 'Jamón de pavo', 'kg', 320),
  ('Carne', 'Pepperoni', 'pieza', 330),
  ('Carne', 'Pollo', 'kg', 340),
  ('Carne', 'Tocino', 'kg', 350),
  ('Carne', 'Carne molida', 'kg', 360),
  ('Masa', 'Masa', 'bola', 370),
  ('Productos terminados', 'Pizza', 'pieza', 380),
  ('Productos terminados', 'Entrante preparado', 'pieza', 390),
  ('Bebidas', 'Refresco', 'pieza', 400),
  ('Bebidas', 'Agua', 'pieza', 410),
  ('Postres', 'Postre', 'pieza', 420),
  ('Empaques', 'Caja de pizza', 'pieza', 430),
  ('Empaques', 'Caja de entrante', 'pieza', 440),
  ('Empaques', 'Bolsa', 'pieza', 450),
  ('Empaques', 'Vaso', 'pieza', 460)
on conflict (nombre) do nothing;
```

- [ ] **Step 5: Correr migración, datos y pruebas**

Pide a Sebastián que, en Supabase → SQL Editor, corra en este orden: `supabase/migrations/0002_checklists.sql`, `supabase/seed_checklists.sql` y `supabase/pruebas/0002_checklists.sql`.
Expected: las dos primeras terminan con "Success". La tercera termina con el error `PRUEBAS OK — horario y tolerancia · cajero no registra recorrido · …`. Cualquier `FALLÓ:` se corrige en la migración antes de seguir (para rehacer, borra las tablas nuevas con `drop table … cascade` y vuelve a correr la migración: todavía no hay datos reales).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0002_checklists.sql supabase/seed_checklists.sql supabase/pruebas/0002_checklists.sql
git commit -m "Checklists: migración, datos iniciales y pruebas SQL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Funciones puras de horario, masa y formato

**Files:**
- Create: `lib/franjas.ts`, `lib/franjas.test.ts`, `lib/masa.ts`, `lib/masa.test.ts`, `lib/formato.test.ts`
- Modify: `lib/formato.ts` (agregar al final), `lib/tipos.ts` (agregar al final), `lib/contexto.ts` (agregar al final), `tsconfig.json`, `package.json`

**Interfaces:**
- Consumes: nada de otras tareas.
- Produces (usado por Tasks 3–6):
  - `lib/franjas.ts`: `type Franja = { fecha: string; hora: number }`, `type EstadoCasilla = "ok" | "alerta" | "abierta" | "falta" | "futura"`, `TOLERANCIA_MIN`, `relojMX(ahora: Date): { fecha: string; minutos: number }`, `franjasAbiertas(horas: readonly number[], ahora: Date): Franja[]` (la más reciente primero), `estadoFranja(f: Franja, ahora: Date): "futura" | "abierta" | "cerrada"`, `estadoCasilla(registro: "ok" | "alerta" | undefined, f: Franja, ahora: Date): EstadoCasilla`, `siguienteFranja(horas: readonly number[], ahora: Date): number | null`, `diaOperativoMX(ahora: Date): string`, `etiquetaHora(h: number): string`.
  - `lib/masa.ts`: `TEMP_MIN = 12`, `TEMP_MAX = 22`, `TEMPS_AREA = [25, 30, 35] as const`, `bolasNorma(n: NormaMasa, t: TempArea): number`, `temperaturaEnNorma(c: number): boolean`, `temperaturaValida(c: number): boolean`, `motivoComentario(n: NormaMasa, t: TempArea, bolas: number, temperatura: number): string | null`.
  - `lib/formato.ts`: `decimal(valor: FormDataEntryValue | null): number` (NaN si no es número), `numeroCorto(n: number): string`.
  - `lib/tipos.ts`: `MotivoMerma`, `TempArea`, `NOMBRE_MOTIVO`, `ProductoMerma`, `Merma`, `CierreMerma`, `NormaMasa`, `LecturaMasa`, `Checklist`, `PuntoChecklist`.
  - `lib/contexto.ts`: `puedeSupervisar(rol: Perfil["rol"]): boolean`.

- [ ] **Step 1: Configurar el runner de pruebas**

In `tsconfig.json`, replace the `exclude` line:

```json
  "exclude": ["node_modules", "**/*.test.ts"]
```

In `package.json`, add the `test` script after `typecheck`:

```json
    "typecheck": "tsc --noEmit",
    "test": "node --experimental-strip-types --test lib/franjas.test.ts lib/masa.test.ts lib/formato.test.ts"
```

Las pruebas importan con extensión `.ts` (lo exige Node) y por eso se excluyen del typecheck de Next.

- [ ] **Step 2: Escribir las pruebas**

Create `lib/franjas.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { diaOperativoMX, estadoCasilla, estadoFranja, franjasAbiertas, relojMX, siguienteFranja } from "./franjas.ts";

/** Instante a partir de una hora de Ciudad de México. */
const mx = (s: string) => new Date(`${s}-06:00`);

test("relojMX convierte a hora de Ciudad de México", () => {
  assert.deepEqual(relojMX(mx("2026-09-25T12:30:00")), { fecha: "2026-09-25", minutos: 750 });
});

test("a media hora solo está abierta la hora actual", () => {
  assert.deepEqual(franjasAbiertas([10, 11, 12, 13], mx("2026-09-25T12:30:00")), [{ fecha: "2026-09-25", hora: 12 }]);
});

test("en los primeros 10 minutos sigue abierta la hora anterior", () => {
  assert.deepEqual(franjasAbiertas([12, 13], mx("2026-09-25T13:09:00")), [
    { fecha: "2026-09-25", hora: 13 },
    { fecha: "2026-09-25", hora: 12 },
  ]);
});

test("al minuto 10 la hora anterior ya cerró", () => {
  assert.deepEqual(franjasAbiertas([12, 13], mx("2026-09-25T13:10:00")), [{ fecha: "2026-09-25", hora: 13 }]);
});

test("solo devuelve horas del checklist", () => {
  assert.deepEqual(franjasAbiertas([12, 13, 14, 15, 16, 17], mx("2026-09-25T18:05:00")), [{ fecha: "2026-09-25", hora: 17 }]);
  assert.deepEqual(franjasAbiertas([12, 13], mx("2026-09-25T09:00:00")), []);
});

test("la hora de las 23:00 se registra a las 00:05 con la fecha del día anterior", () => {
  assert.deepEqual(franjasAbiertas([18, 19, 20, 21, 22, 23], mx("2026-09-26T00:05:00")), [{ fecha: "2026-09-25", hora: 23 }]);
});

test("estadoFranja marca futura, abierta y cerrada", () => {
  const f = { fecha: "2026-09-25", hora: 12 };
  assert.equal(estadoFranja(f, mx("2026-09-25T11:59:00")), "futura");
  assert.equal(estadoFranja(f, mx("2026-09-25T12:00:00")), "abierta");
  assert.equal(estadoFranja(f, mx("2026-09-25T13:09:59")), "abierta");
  assert.equal(estadoFranja(f, mx("2026-09-25T13:10:00")), "cerrada");
});

test("estadoCasilla prefiere el registro y si no hay, usa el horario", () => {
  const f = { fecha: "2026-09-25", hora: 12 };
  assert.equal(estadoCasilla("alerta", f, mx("2026-09-25T20:00:00")), "alerta");
  assert.equal(estadoCasilla(undefined, f, mx("2026-09-25T12:30:00")), "abierta");
  assert.equal(estadoCasilla(undefined, f, mx("2026-09-25T20:00:00")), "falta");
  assert.equal(estadoCasilla(undefined, f, mx("2026-09-25T08:00:00")), "futura");
});

test("diaOperativoMX cambia a las 4:00", () => {
  assert.equal(diaOperativoMX(mx("2026-09-26T00:05:00")), "2026-09-25");
  assert.equal(diaOperativoMX(mx("2026-09-26T03:59:00")), "2026-09-25");
  assert.equal(diaOperativoMX(mx("2026-09-26T04:00:00")), "2026-09-26");
});

test("siguienteFranja da la próxima hora del checklist o null", () => {
  assert.equal(siguienteFranja([10, 11, 12], mx("2026-09-25T09:30:00")), 10);
  assert.equal(siguienteFranja([12, 13], mx("2026-09-25T12:30:00")), 13);
  assert.equal(siguienteFranja([12, 13], mx("2026-09-25T13:30:00")), null);
});
```

Create `lib/masa.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { bolasNorma, motivoComentario, temperaturaEnNorma, temperaturaValida } from "./masa.ts";

const n = { hora: 13, bolas_25: 4, bolas_30: 2, bolas_35: 2 };

test("bolasNorma usa la columna de la temperatura del área", () => {
  assert.equal(bolasNorma(n, 25), 4);
  assert.equal(bolasNorma(n, 30), 2);
  assert.equal(bolasNorma(n, 35), 2);
});

test("temperaturaEnNorma incluye 12 y 22 °C", () => {
  assert.equal(temperaturaEnNorma(12), true);
  assert.equal(temperaturaEnNorma(22), true);
  assert.equal(temperaturaEnNorma(11.9), false);
  assert.equal(temperaturaEnNorma(22.1), false);
});

test("temperaturaValida rechaza lecturas absurdas", () => {
  assert.equal(temperaturaValida(18), true);
  assert.equal(temperaturaValida(180), false);
  assert.equal(temperaturaValida(-20), false);
  assert.equal(temperaturaValida(Number.NaN), false);
});

test("motivoComentario explica por qué el comentario es obligatorio", () => {
  assert.equal(motivoComentario(n, 25, 4, 18), null);
  assert.match(motivoComentario(n, 25, 4, 23) ?? "", /fuera de 12 a 22 °C/);
  assert.match(motivoComentario(n, 30, 4, 18) ?? "", /sacaste 4 bolas y la norma es 2/);
});
```

Create `lib/formato.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { decimal, numeroCorto } from "./formato.ts";

test("decimal acepta punto o coma", () => {
  assert.equal(decimal("0,5"), 0.5);
  assert.equal(decimal("18.5"), 18.5);
  assert.equal(decimal(" 2 "), 2);
});

test("decimal devuelve NaN si no hay número", () => {
  assert.ok(Number.isNaN(decimal("")));
  assert.ok(Number.isNaN(decimal(null)));
  assert.ok(Number.isNaN(decimal("abc")));
});

test("numeroCorto muestra hasta tres decimales", () => {
  assert.equal(numeroCorto(0.5), "0.5");
  assert.equal(numeroCorto(2), "2");
  assert.equal(numeroCorto(1.23456), "1.235");
});
```

- [ ] **Step 3: Correr las pruebas para verlas fallar**

Run: `npm test`
Expected: FAIL con `Cannot find module '…/lib/franjas.ts'` (y lo mismo para `masa.ts`); `formato.test.ts` falla porque `decimal` no existe.

- [ ] **Step 4: Implementar**

Create `lib/franjas.ts`:

```ts
/** Franjas horarias de los checklists, en hora de Ciudad de México (UTC−6 todo el año desde 2022). */

export const TOLERANCIA_MIN = 10;
/** El día operativo cambia a esta hora: el cierre nocturno después de medianoche cuenta para el día que termina. */
export const CORTE_DIA_HORAS = 4;
const DESFASE_MS = -6 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

export type Franja = { fecha: string; hora: number };
export type EstadoCasilla = "ok" | "alerta" | "abierta" | "falta" | "futura";

export const etiquetaHora = (h: number) => `${String(h).padStart(2, "0")}:00`;

/** Fecha (YYYY-MM-DD) y minutos transcurridos del día en Ciudad de México. */
export function relojMX(ahora: Date): { fecha: string; minutos: number } {
  const mx = new Date(ahora.getTime() + DESFASE_MS);
  return { fecha: mx.toISOString().slice(0, 10), minutos: mx.getUTCHours() * 60 + mx.getUTCMinutes() };
}

function diaAnterior(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Franjas del checklist que aceptan registro ahora: la actual y, en los primeros minutos, la anterior. */
export function franjasAbiertas(horas: readonly number[], ahora: Date): Franja[] {
  const { fecha, minutos } = relojMX(ahora);
  const h = Math.floor(minutos / 60);
  const candidatas: Franja[] = [{ fecha, hora: h }];
  if (minutos % 60 < TOLERANCIA_MIN) {
    candidatas.push(h === 0 ? { fecha: diaAnterior(fecha), hora: 23 } : { fecha, hora: h - 1 });
  }
  return candidatas.filter((f) => horas.includes(f.hora));
}

export function estadoFranja(f: Franja, ahora: Date): "futura" | "abierta" | "cerrada" {
  const inicio = Date.parse(`${f.fecha}T${etiquetaHora(f.hora)}:00-06:00`);
  const t = ahora.getTime();
  if (t < inicio) return "futura";
  if (t < inicio + HORA_MS + TOLERANCIA_MIN * 60 * 1000) return "abierta";
  return "cerrada";
}

/** Estado de una casilla del resumen: el registro manda; sin registro, depende del horario. */
export function estadoCasilla(registro: "ok" | "alerta" | undefined, f: Franja, ahora: Date): EstadoCasilla {
  if (registro) return registro;
  const e = estadoFranja(f, ahora);
  return e === "abierta" ? "abierta" : e === "cerrada" ? "falta" : "futura";
}

/** Próxima hora del checklist después de la hora actual, o null si ya no hay más hoy. */
export function siguienteFranja(horas: readonly number[], ahora: Date): number | null {
  const actual = Math.floor(relojMX(ahora).minutos / 60);
  const siguientes = horas.filter((h) => h > actual);
  return siguientes.length ? Math.min(...siguientes) : null;
}

/** Día operativo (YYYY-MM-DD): el de Ciudad de México menos CORTE_DIA_HORAS. */
export function diaOperativoMX(ahora: Date): string {
  return new Date(ahora.getTime() + DESFASE_MS - CORTE_DIA_HORAS * HORA_MS).toISOString().slice(0, 10);
}
```

Create `lib/masa.ts`:

```ts
import type { NormaMasa, TempArea } from "./tipos";

export const TEMP_MIN = 12;
export const TEMP_MAX = 22;
export const TEMPS_AREA = [25, 30, 35] as const;

export const bolasNorma = (n: NormaMasa, t: TempArea) => (t === 25 ? n.bolas_25 : t === 30 ? n.bolas_30 : n.bolas_35);

export const temperaturaEnNorma = (c: number) => c >= TEMP_MIN && c <= TEMP_MAX;

/** Descarta lecturas imposibles (Fahrenheit, dedo de más). La base de datos acepta de −5 a 50 °C. */
export const temperaturaValida = (c: number) => Number.isFinite(c) && c >= -5 && c <= 50;

/** Por qué la lectura necesita comentario, o null si está en norma. */
export function motivoComentario(n: NormaMasa, t: TempArea, bolas: number, temperatura: number): string | null {
  if (!temperaturaEnNorma(temperatura)) return `la masa está a ${temperatura} °C, fuera de ${TEMP_MIN} a ${TEMP_MAX} °C`;
  const norma = bolasNorma(n, t);
  if (bolas !== norma) return `sacaste ${bolas} bolas y la norma es ${norma}`;
  return null;
}
```

Append to `lib/formato.ts`:

```ts

/** Número con punto o coma decimal ("0,5" o "0.5"). Devuelve NaN si no es número. */
export function decimal(valor: FormDataEntryValue | null): number {
  const texto = String(valor ?? "").replace(/\s/g, "").replace(",", ".");
  return texto === "" ? Number.NaN : Number(texto);
}

const corto = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 3 });

/** Cantidad con hasta tres decimales, para kilos y piezas. */
export const numeroCorto = (n: number) => corto.format(n);
```

Append to `lib/tipos.ts`:

```ts

// ─── Checklists ─────────────────────────────────────────────────────────────
export type MotivoMerma = "caducidad" | "empaque_danado" | "mal_estado" | "error_humano";
export type TempArea = 25 | 30 | 35;

export const NOMBRE_MOTIVO: Record<MotivoMerma, string> = {
  caducidad: "Caducidad",
  empaque_danado: "Empaque dañado",
  mal_estado: "Producto en mal estado",
  error_humano: "Error humano",
};

export interface ProductoMerma {
  id: string;
  categoria: string;
  nombre: string;
  unidad: string;
  orden: number;
  activo: boolean;
}

export interface Merma {
  id: string;
  fecha: string;
  producto_id: string;
  cantidad: number;
  motivo: MotivoMerma;
  empleado: string;
  registrado_por: string;
  creado_en: string;
}

export interface CierreMerma {
  fecha: string;
  capturado_dodo: boolean;
  cerrado_por: string;
  cerrado_en: string;
}

export interface NormaMasa {
  hora: number;
  bolas_25: number;
  bolas_30: number;
  bolas_35: number;
}

export interface LecturaMasa {
  id: string;
  fecha: string;
  hora: number;
  temp_area: TempArea;
  bolas: number;
  temperatura: number;
  en_norma: boolean;
  comentario: string | null;
  registrado_por: string;
  creado_en: string;
}

export interface Checklist {
  id: string;
  clave: string;
  nombre: string;
  horas: number[];
  roles: Rol[];
}

export interface PuntoChecklist {
  id: string;
  checklist_id: string;
  orden: number;
  texto: string;
  detalle_por_hora: Record<string, string> | null;
}
```

Append to `lib/contexto.ts`:

```ts
export const puedeSupervisar = (rol: Perfil["rol"]) => rol !== "cajero";
```

- [ ] **Step 5: Correr pruebas y typecheck**

Run: `npm test && npm run typecheck`
Expected: todas las pruebas en `pass`, `fail 0`; typecheck sin errores. (Node puede avisar `ExperimentalWarning: Type Stripping`; es normal.)

- [ ] **Step 6: Commit**

```bash
git add lib/franjas.ts lib/franjas.test.ts lib/masa.ts lib/masa.test.ts lib/formato.ts lib/formato.test.ts lib/tipos.ts lib/contexto.ts tsconfig.json package.json
git commit -m "Checklists: funciones de horario, norma de masa y formato con pruebas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Menú, estilos y resumen del día

**Files:**
- Modify: `components/Nav.tsx`
- Create: `components/Franjas.tsx`
- Modify: `app/globals.css` (insertar antes del bloque `/* ─── Login ─── */`)
- Create: `app/(app)/checklists/page.tsx`

**Interfaces:**
- Consumes: `diaOperativoMX`, `estadoCasilla`, `etiquetaHora`, `EstadoCasilla` (Task 2); `bolasNorma` (Task 2); tipos `Checklist`, `CierreMerma`, `LecturaMasa`, `NormaMasa` (Task 2); tablas de Task 1.
- Produces: componente `Franjas({ titulo, casillas: { hora: number; estado: EstadoCasilla }[] })`; clases CSS `.formulario`, `.franjas`, `.franja`, `.puntos`, `.punto`, `.si-no`, `.casilla`, `.fallas` usadas por Tasks 4–6.

- [ ] **Step 1: Agregar "Checklists" al menú**

In `components/Nav.tsx`, add the entry at the end of `ENLACES` and highlight subroutes:

```tsx
const ENLACES = [
  { href: "/", texto: "Inicio" },
  { href: "/arqueo", texto: "Arqueo de turno" },
  { href: "/movimientos", texto: "Movimientos" },
  { href: "/caja-chica", texto: "Caja chica" },
  { href: "/cierre", texto: "Cierre del día" },
  { href: "/checklists", texto: "Checklists" },
];

const activo = (ruta: string, href: string) => ruta === href || (href !== "/" && ruta.startsWith(`${href}/`));
```

and in the `Link`, replace `aria-current={ruta === e.href ? "page" : undefined}` with:

```tsx
        <Link key={e.href} href={e.href} aria-current={activo(ruta, e.href) ? "page" : undefined}>
```

- [ ] **Step 2: Componente de casillas por hora**

Create `components/Franjas.tsx`:

```tsx
import { etiquetaHora, type EstadoCasilla } from "@/lib/franjas";

const TEXTO: Record<EstadoCasilla, string> = {
  ok: "Listo",
  alerta: "Revisar",
  abierta: "Ahora",
  falta: "Falta",
  futura: "—",
};

export function Franjas({ titulo, casillas }: { titulo: string; casillas: { hora: number; estado: EstadoCasilla }[] }) {
  return (
    <ul className="franjas" aria-label={titulo}>
      {casillas.map((c) => (
        <li key={c.hora} className="franja" data-estado={c.estado}>
          <strong>{etiquetaHora(c.hora)}</strong>
          <span>{TEXTO[c.estado]}</span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: Estilos**

In `app/globals.css`, insert before `/* ─── Login ─── */`:

```css
/* ─── Checklists ─── */
.formulario { display: flex; flex-direction: column; gap: 16px; }
fieldset.campo { border: 0; padding: 0; margin: 0; min-width: 0; }
input[type="checkbox"], input[type="radio"] { min-height: auto; width: 22px; height: 22px; padding: 0; accent-color: var(--accion); }

.franjas { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; grid-template-columns: repeat(auto-fill, minmax(68px, 1fr)); }
.franja {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 4px; border-radius: 8px; font-size: 0.85rem;
  border: 1.5px solid var(--linea); background: var(--blanco);
}
.franja strong { font-family: var(--display); font-size: 1rem; }
.franja[data-estado="ok"] { background: var(--cuadra-fondo); border-color: #b7d6c5; color: #174d39; }
.franja[data-estado="alerta"] { background: var(--alerta-fondo); border-color: #e3c09f; color: #7a3a08; }
.franja[data-estado="abierta"] { border: 2px solid var(--accion); font-weight: 700; }
.franja[data-estado="falta"] { background: var(--papel-2); color: var(--tinta-2); }
.franja[data-estado="falta"] span { text-decoration: line-through; }
.franja[data-estado="futura"] { color: var(--tinta-2); border-style: dashed; }

.puntos { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 16px; }
.punto { display: flex; flex-direction: column; gap: 10px; padding-bottom: 16px; border-bottom: 1px solid var(--papel-2); }

.si-no { display: flex; flex-wrap: wrap; gap: 8px; }
.si-no label {
  flex: 1 1 120px; display: flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 52px; padding: 0 12px; border-radius: 8px; cursor: pointer;
  border: 1.5px solid var(--linea); background: var(--blanco); font-weight: 700;
}
.si-no label:has(input:checked) { border-color: var(--accion); background: var(--papel-2); }
.si-no label:has(input[value="si"]:checked) { border-color: var(--cuadra); background: var(--cuadra-fondo); color: #174d39; }
.si-no label:has(input[value="no"]:checked) { border-color: var(--alerta); background: var(--alerta-fondo); color: #7a3a08; }
.si-no label:has(input:focus-visible) { outline: 3px solid var(--accion); outline-offset: 2px; }

.casilla { display: flex; align-items: center; gap: 10px; font-weight: 700; }
.fallas { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }

```

- [ ] **Step 4: Página de resumen**

Create `app/(app)/checklists/page.tsx`:

```tsx
import Link from "next/link";
import { Franjas } from "@/components/Franjas";
import { obtenerContexto } from "@/lib/contexto";
import { diaOperativoMX, estadoCasilla } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { bolasNorma } from "@/lib/masa";
import type { Checklist, CierreMerma, LecturaMasa, NormaMasa } from "@/lib/tipos";

type LecturaResumen = Pick<LecturaMasa, "hora" | "temp_area" | "bolas" | "en_norma">;
type RecorridoResumen = { checklist_id: string; hora: number; recorrido_respuestas: { cumple: boolean }[] };

export default async function Checklists({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: fechaPedida } = await searchParams;
  const ahora = new Date();
  const hoy = diaOperativoMX(ahora);
  const fecha = fechaPedida && /^\d{4}-\d{2}-\d{2}$/.test(fechaPedida) ? fechaPedida : hoy;
  const { supabase, sucursal } = await obtenerContexto();

  const [{ data: normas }, { data: lecturas }, { data: checklists }, { data: recorridos }, { count: mermas }, { data: cierre }] =
    await Promise.all([
      supabase.from("normas_masa").select("hora, bolas_25, bolas_30, bolas_35").order("hora").returns<NormaMasa[]>(),
      supabase.from("lecturas_masa").select("hora, temp_area, bolas, en_norma")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).returns<LecturaResumen[]>(),
      supabase.from("checklists").select("id, clave, nombre, horas, roles").returns<Checklist[]>(),
      supabase.from("recorridos").select("checklist_id, hora, recorrido_respuestas(cumple)")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).returns<RecorridoResumen[]>(),
      supabase.from("mermas").select("id", { count: "exact", head: true }).eq("sucursal_id", sucursal.id).eq("fecha", fecha),
      supabase.from("cierres_merma").select("fecha, capturado_dodo, cerrado_por, cerrado_en")
        .eq("sucursal_id", sucursal.id).eq("fecha", fecha).maybeSingle<CierreMerma>(),
    ]);

  const lecturaPorHora = new Map((lecturas ?? []).map((l) => [l.hora, l]));
  const casillasMasa = (normas ?? []).map((n) => {
    const l = lecturaPorHora.get(n.hora);
    const registro = !l ? undefined : l.en_norma && l.bolas === bolasNorma(n, l.temp_area) ? ("ok" as const) : ("alerta" as const);
    return { hora: n.hora, estado: estadoCasilla(registro, { fecha, hora: n.hora }, ahora) };
  });

  const listas = [...(checklists ?? [])].sort((a, b) => a.horas[0] - b.horas[0]);
  const casillasRecorrido = (c: Checklist) =>
    c.horas.map((h) => {
      const r = (recorridos ?? []).find((x) => x.checklist_id === c.id && x.hora === h);
      const registro = !r ? undefined : r.recorrido_respuestas.every((x) => x.cumple) ? ("ok" as const) : ("alerta" as const);
      return { hora: h, estado: estadoCasilla(registro, { fecha, hora: h }, ahora) };
    });

  const esHoy = fecha === hoy;
  const totalMermas = mermas ?? 0;

  return (
    <>
      <div className="encabezado">
        <h1>Checklists</h1>
        <p>Temperatura de masa y recorrido cada hora, y mermas del día. Cada hora se puede registrar hasta 10 minutos después de que termina.</p>
      </div>

      <form className="acciones" method="get">
        <label htmlFor="fecha" className="etiqueta">Día</label>
        <input id="fecha" name="fecha" type="date" defaultValue={fecha} max={hoy} />
        <button className="boton boton-secundario" type="submit">Ver</button>
        {!esHoy && <Link href="/checklists">Volver a hoy</Link>}
      </form>
      <p className="saldo-nota">Listo: registrado y en norma · Revisar: fuera de norma o con puntos que no cumplen · Ahora: se puede registrar · Falta: no se registró a tiempo.</p>

      <section className="seccion" aria-labelledby="t-masa">
        <div className="acciones">
          <h2 id="t-masa">Temperatura de masa</h2>
          {esHoy && <Link className="boton" href="/checklists/masa">Registrar</Link>}
        </div>
        <Franjas titulo="Horas de temperatura de masa" casillas={casillasMasa} />
      </section>

      <section className="seccion" aria-labelledby="t-recorrido">
        <div className="acciones">
          <h2 id="t-recorrido">Recorrido de supervisor</h2>
          {esHoy && <Link className="boton" href="/checklists/recorrido">Registrar</Link>}
        </div>
        {listas.map((c) => (
          <div key={c.id} className="formulario">
            <h3>{c.nombre}</h3>
            <Franjas titulo={c.nombre} casillas={casillasRecorrido(c)} />
          </div>
        ))}
      </section>

      <section className="seccion" aria-labelledby="t-mermas">
        <div className="acciones">
          <h2 id="t-mermas">Mermas</h2>
          {esHoy && <Link className="boton" href="/checklists/mermas">Registrar</Link>}
        </div>
        <p>
          {totalMermas} {totalMermas === 1 ? "merma registrada" : "mermas registradas"}.{" "}
          {cierre ? `Cerradas a las ${hora(cierre.cerrado_en)} y capturadas en Dodo IS.` : "Falta cerrarlas."}
        </p>
      </section>
    </>
  );
}
```

- [ ] **Step 5: Typecheck y build**

Run: `npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores; la tabla de rutas del build incluye `ƒ /checklists`. (Las variables falsas bastan: las páginas son dinámicas y no consultan Supabase al compilar. En PowerShell: `$env:NEXT_PUBLIC_SUPABASE_URL="https://x.supabase.co"; $env:NEXT_PUBLIC_SUPABASE_ANON_KEY="x"; npm run build`.)

- [ ] **Step 6: Commit**

```bash
git add components/Nav.tsx components/Franjas.tsx app/globals.css "app/(app)/checklists/page.tsx"
git commit -m "Checklists: menú, estilos y resumen del día

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Mermas

**Files:**
- Create: `app/(app)/checklists/mermas/actions.ts`
- Create: `app/(app)/checklists/mermas/page.tsx`

**Interfaces:**
- Consumes: `obtenerContexto`, `puedeSupervisar` (Task 2); `diaOperativoMX` (Task 2); `decimal`, `numeroCorto`, `hora` de `lib/formato.ts`; `NOMBRE_MOTIVO`, `MotivoMerma`, `ProductoMerma`, `Merma`, `CierreMerma` (Task 2); tablas `productos_merma`, `mermas`, `cierres_merma` (Task 1); clases `.casilla` (Task 3).
- Produces: server actions `registrarMerma(formData)` y `cerrarMermas(formData)`.

- [ ] **Step 1: Acciones**

Create `app/(app)/checklists/mermas/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { decimal } from "@/lib/formato";
import { NOMBRE_MOTIVO } from "@/lib/tipos";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/mermas?${clave}=${encodeURIComponent(texto)}`);

export async function registrarMerma(formData: FormData) {
  const { supabase, sucursal } = await obtenerContexto();
  const productoId = String(formData.get("producto_id") ?? "");
  const cantidad = decimal(formData.get("cantidad"));
  const motivo = String(formData.get("motivo") ?? "");
  const empleado = String(formData.get("empleado") ?? "").trim();

  if (!productoId) volver("error", "Elige el producto.");
  if (!(cantidad > 0)) volver("error", "Escribe una cantidad mayor a cero.");
  if (!(motivo in NOMBRE_MOTIVO)) volver("error", "Elige el motivo.");
  if (!empleado) volver("error", "Escribe el nombre de quien hizo la merma.");

  // La fecha la pone la base de datos (día operativo); no se envía.
  const { error } = await supabase.from("mermas").insert({
    sucursal_id: sucursal.id, producto_id: productoId, cantidad, motivo, empleado,
  });
  if (error) volver("error", error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Merma registrada.");
}

export async function cerrarMermas(formData: FormData) {
  const { supabase, perfil, sucursal } = await obtenerContexto();
  if (!puedeSupervisar(perfil.rol)) volver("error", "Solo un encargado o gerente cierra las mermas del día.");
  if (formData.get("capturado_dodo") !== "si") volver("error", "Marca que ya capturaste las mermas en Dodo IS.");

  const { error } = await supabase.from("cierres_merma").insert({ sucursal_id: sucursal.id, capturado_dodo: true });
  if (error) volver("error", error.code === "23505" ? "Las mermas de hoy ya se cerraron." : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", "Mermas del día cerradas.");
}
```

- [ ] **Step 2: Página**

Create `app/(app)/checklists/mermas/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX } from "@/lib/franjas";
import { hora, numeroCorto } from "@/lib/formato";
import { NOMBRE_MOTIVO, type CierreMerma, type Merma, type MotivoMerma, type ProductoMerma } from "@/lib/tipos";
import { cerrarMermas, registrarMerma } from "./actions";

export default async function Mermas({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal } = await obtenerContexto();
  const fecha = diaOperativoMX(new Date());

  const [{ data: productos }, { data: mermas }, { data: cierre }, { data: nombres }] = await Promise.all([
    supabase.from("productos_merma").select("id, categoria, nombre, unidad, orden, activo").order("orden").returns<ProductoMerma[]>(),
    supabase.from("mermas").select("id, fecha, producto_id, cantidad, motivo, empleado, registrado_por, creado_en")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).order("creado_en", { ascending: false }).returns<Merma[]>(),
    supabase.from("cierres_merma").select("fecha, capturado_dodo, cerrado_por, cerrado_en")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).maybeSingle<CierreMerma>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  // El mapa incluye productos inactivos para que las mermas viejas sigan mostrando su nombre.
  const producto = new Map((productos ?? []).map((p) => [p.id, p]));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const activos = (productos ?? []).filter((p) => p.activo);
  const categorias = [...new Set(activos.map((p) => p.categoria))];

  const suma = new Map<string, number>();
  for (const m of mermas ?? []) suma.set(m.producto_id, (suma.get(m.producto_id) ?? 0) + Number(m.cantidad));
  const totales = [...suma.entries()]
    .map(([id, cantidad]) => ({ id, p: producto.get(id), cantidad }))
    .sort((a, b) => (a.p?.orden ?? 0) - (b.p?.orden ?? 0));

  return (
    <>
      <div className="encabezado">
        <h1>Mermas</h1>
        <p>Registra cada merma cuando pase, con el nombre de quien la hizo. Al final del día el encargado las captura en Dodo IS y cierra la lista.</p>
      </div>
      <Aviso ok={ok} error={error} />

      {cierre ? (
        <p className="aviso aviso-info">
          Las mermas de hoy se cerraron a las {hora(cierre.cerrado_en)} ({persona.get(cierre.cerrado_por)}). Ya no se pueden agregar.
        </p>
      ) : (
        <form action={registrarMerma} className="seccion" aria-labelledby="t-registrar">
          <h2 id="t-registrar">Registrar merma</h2>
          <div className="rejilla">
            <div className="campo">
              <label htmlFor="producto_id">Producto</label>
              <select id="producto_id" name="producto_id" required defaultValue="">
                <option value="" disabled>Elige el producto</option>
                {categorias.map((c) => (
                  <optgroup key={c} label={c}>
                    {activos.filter((p) => p.categoria === c).map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre} ({p.unidad})</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="cantidad">Cantidad</label>
              <input id="cantidad" name="cantidad" inputMode="decimal" required placeholder="Ej. 0.5" autoComplete="off" />
              <small>En la unidad del producto: kg, pieza, bola…</small>
            </div>
            <div className="campo">
              <label htmlFor="motivo">Motivo</label>
              <select id="motivo" name="motivo" required defaultValue="">
                <option value="" disabled>Elige el motivo</option>
                {(Object.keys(NOMBRE_MOTIVO) as MotivoMerma[]).map((m) => (
                  <option key={m} value={m}>{NOMBRE_MOTIVO[m]}</option>
                ))}
              </select>
            </div>
            <div className="campo">
              <label htmlFor="empleado">Quién hizo la merma</label>
              <input id="empleado" name="empleado" required autoComplete="off" placeholder="Nombre y apellido" />
            </div>
          </div>
          <div className="acciones"><BotonEnviar>Registrar merma</BotonEnviar></div>
        </form>
      )}

      <section className="seccion" aria-labelledby="t-totales">
        <h2 id="t-totales">Totales para Dodo IS</h2>
        {!totales.length ? <p className="vacio">No hay mermas hoy.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Producto</th><th>Cantidad</th></tr></thead>
              <tbody>
                {totales.map(({ id, p, cantidad }) => (
                  <tr key={id}><td>{p?.nombre}</td><td className="monto">{numeroCorto(cantidad)} {p?.unidad}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!cierre && puedeSupervisar(perfil.rol) && (
          <form action={cerrarMermas} className="acciones">
            <label className="casilla">
              <input type="checkbox" name="capturado_dodo" value="si" required /> Ya capturé estas mermas en Dodo IS
            </label>
            <BotonEnviar className="boton boton-secundario" pendiente="Cerrando…">Cerrar mermas del día</BotonEnviar>
          </form>
        )}
      </section>

      <section className="seccion" aria-labelledby="t-lista">
        <h2 id="t-lista">Mermas de hoy</h2>
        {!mermas?.length ? <p className="vacio">Todavía no hay mermas registradas.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Hora</th><th>Producto</th><th>Cantidad</th><th>Motivo</th><th>Quién</th><th>Sesión</th></tr></thead>
              <tbody>
                {mermas.map((m) => {
                  const p = producto.get(m.producto_id);
                  return (
                    <tr key={m.id}>
                      <td>{hora(m.creado_en)}</td>
                      <td>{p?.nombre}</td>
                      <td className="monto">{numeroCorto(Number(m.cantidad))} {p?.unidad}</td>
                      <td>{NOMBRE_MOTIVO[m.motivo]}</td>
                      <td>{m.empleado}</td>
                      <td>{persona.get(m.registrado_por)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 3: Typecheck y build**

Run: `npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores; el build lista `ƒ /checklists/mermas`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/checklists/mermas"
git commit -m "Checklists: registro y cierre de mermas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Temperatura de masa

**Files:**
- Create: `app/(app)/checklists/masa/actions.ts`
- Create: `app/(app)/checklists/masa/FormMasa.tsx`
- Create: `app/(app)/checklists/masa/page.tsx`

**Interfaces:**
- Consumes: `diaOperativoMX`, `etiquetaHora`, `franjasAbiertas`, `siguienteFranja`, `Franja` (Task 2); `TEMPS_AREA`, `bolasNorma`, `motivoComentario`, `temperaturaValida` (Task 2); `decimal`, `hora` de `lib/formato.ts`; `NormaMasa`, `LecturaMasa`, `TempArea` (Task 2); tabla `lecturas_masa` (Task 1); clases `.formulario`, `.si-no` (Task 3).
- Produces: server action `registrarLectura(formData)` que espera los campos `franja` (`"YYYY-MM-DD|H"`), `temp_area`, `bolas`, `temperatura` y `comentario`.

- [ ] **Step 1: Acción**

Create `app/(app)/checklists/masa/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContexto } from "@/lib/contexto";
import { etiquetaHora } from "@/lib/franjas";
import { decimal } from "@/lib/formato";
import { TEMPS_AREA, temperaturaValida } from "@/lib/masa";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/masa?${clave}=${encodeURIComponent(texto)}`);

export async function registrarLectura(formData: FormData) {
  const { supabase, sucursal } = await obtenerContexto();
  const [fecha, horaTexto] = String(formData.get("franja") ?? "").split("|");
  const hora = Number(horaTexto);
  const tempArea = Number(formData.get("temp_area"));
  const bolasTexto = String(formData.get("bolas") ?? "").trim();
  const bolas = bolasTexto === "" ? Number.NaN : Number(bolasTexto);
  const temperatura = decimal(formData.get("temperatura"));
  const comentario = String(formData.get("comentario") ?? "").trim() || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || !Number.isInteger(hora)) volver("error", "Elige la hora que vas a registrar.");
  if (!(TEMPS_AREA as readonly number[]).includes(tempArea)) volver("error", "Elige la temperatura del área: 25, 30 o 35 °C.");
  if (!Number.isInteger(bolas) || bolas < 0) volver("error", "Escribe cuántas bolas sacaste.");
  if (!temperaturaValida(temperatura)) volver("error", "Revisa la temperatura de la masa: escríbela en grados centígrados.");

  // Si la lectura sale de norma sin comentario, la base de datos responde "Escribe qué pasó: …".
  const { error } = await supabase.from("lecturas_masa").insert({
    sucursal_id: sucursal.id, fecha, hora, temp_area: tempArea, bolas, temperatura, comentario,
  });
  if (error) volver("error", error.code === "23505" ? `Ya se registró la masa de las ${etiquetaHora(hora)}.` : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", `Temperatura de las ${etiquetaHora(hora)} registrada.`);
}
```

- [ ] **Step 2: Formulario con comentario obligatorio en vivo**

Create `app/(app)/checklists/masa/FormMasa.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { etiquetaHora, type Franja } from "@/lib/franjas";
import { decimal } from "@/lib/formato";
import { TEMPS_AREA, bolasNorma, motivoComentario } from "@/lib/masa";
import type { NormaMasa, TempArea } from "@/lib/tipos";
import { registrarLectura } from "./actions";

const clave = (f: Franja) => `${f.fecha}|${f.hora}`;

export function FormMasa({ franjas, normas }: { franjas: Franja[]; normas: NormaMasa[] }) {
  const [franja, setFranja] = useState(clave(franjas[0]));
  const [tempArea, setTempArea] = useState<TempArea | null>(null);
  const [bolas, setBolas] = useState("");
  const [temperatura, setTemperatura] = useState("");

  const horaElegida = Number(franja.split("|")[1]);
  const norma = normas.find((n) => n.hora === horaElegida);
  const tempNum = decimal(temperatura);
  const motivo = norma && tempArea && bolas !== "" && Number.isFinite(tempNum)
    ? motivoComentario(norma, tempArea, Number(bolas), tempNum)
    : null;

  return (
    <form action={registrarLectura} className="formulario">
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="franja">Hora</label>
          <select id="franja" name="franja" value={franja} onChange={(e) => setFranja(e.target.value)}>
            {franjas.map((f) => (
              <option key={clave(f)} value={clave(f)}>{etiquetaHora(f.hora)} – {etiquetaHora((f.hora + 1) % 24)}</option>
            ))}
          </select>
          {norma && <small>Norma: {norma.bolas_25} bolas a 25 °C · {norma.bolas_30} a 30 °C · {norma.bolas_35} a 35 °C</small>}
        </div>
        <div className="campo">
          <label htmlFor="bolas">Bolas sacadas</label>
          <input
            id="bolas" name="bolas" type="number" inputMode="numeric" min="0" step="1" required
            value={bolas} onChange={(e) => setBolas(e.target.value)}
          />
          {norma && tempArea && <small>La norma a {tempArea} °C es {bolasNorma(norma, tempArea)}.</small>}
        </div>
        <div className="campo">
          <label htmlFor="temperatura">Temperatura de la masa (°C)</label>
          <input
            id="temperatura" name="temperatura" inputMode="decimal" required autoComplete="off" placeholder="Ej. 18"
            value={temperatura} onChange={(e) => setTemperatura(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="campo">
        <legend className="etiqueta">Temperatura del área</legend>
        <div className="si-no">
          {TEMPS_AREA.map((t) => (
            <label key={t}>
              <input type="radio" name="temp_area" value={t} required checked={tempArea === t} onChange={() => setTempArea(t)} />
              <span>{t} °C</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="campo">
        <label htmlFor="comentario">Comentario{motivo ? " (obligatorio)" : ""}</label>
        <textarea
          id="comentario" name="comentario" rows={2} required={!!motivo}
          placeholder="Si sacaste más o menos bolas, o hay problemas con la masa"
        />
        {motivo && <small role="status">Escribe qué pasó: {motivo}.</small>}
      </div>

      <div className="acciones"><BotonEnviar>Registrar temperatura</BotonEnviar></div>
    </form>
  );
}
```

- [ ] **Step 3: Página**

Create `app/(app)/checklists/masa/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { obtenerContexto } from "@/lib/contexto";
import { diaOperativoMX, etiquetaHora, franjasAbiertas, siguienteFranja } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import { bolasNorma } from "@/lib/masa";
import type { LecturaMasa, NormaMasa } from "@/lib/tipos";
import { FormMasa } from "./FormMasa";

export default async function Masa({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, sucursal } = await obtenerContexto();
  const ahora = new Date();
  const fecha = diaOperativoMX(ahora);

  const [{ data: normas }, { data: lecturas }, { data: nombres }] = await Promise.all([
    supabase.from("normas_masa").select("hora, bolas_25, bolas_30, bolas_35").order("hora").returns<NormaMasa[]>(),
    supabase.from("lecturas_masa")
      .select("id, fecha, hora, temp_area, bolas, temperatura, en_norma, comentario, registrado_por, creado_en")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).order("hora").returns<LecturaMasa[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const horas = (normas ?? []).map((n) => n.hora);
  const normaPorHora = new Map((normas ?? []).map((n) => [n.hora, n]));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));
  const registradas = new Set((lecturas ?? []).map((l) => `${l.fecha}|${l.hora}`));
  const enHorario = franjasAbiertas(horas, ahora);
  const abiertas = enHorario.filter((f) => !registradas.has(`${f.fecha}|${f.hora}`));
  const siguiente = siguienteFranja(horas, ahora);
  const sinFormulario =
    (enHorario.length ? "Ya se registró la hora de ahora." : "No hay hora abierta.") +
    (siguiente !== null ? ` La siguiente es a las ${etiquetaHora(siguiente)}.` : " Ya no hay más horas hoy.");

  return (
    <>
      <div className="encabezado">
        <h1>Temperatura de masa</h1>
        <p>Cada hora saca las bolas que marca la norma para la temperatura del área y toma la temperatura de la masa. En norma: de 12 a 22 °C.</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-registro">
        <h2 id="t-registro">Registrar</h2>
        {abiertas.length ? <FormMasa franjas={abiertas} normas={normas ?? []} /> : <p className="vacio">{sinFormulario}</p>}
      </section>

      <section className="seccion" aria-labelledby="t-lecturas">
        <h2 id="t-lecturas">Lecturas de hoy</h2>
        {!lecturas?.length ? <p className="vacio">Todavía no hay lecturas hoy.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Hora</th><th>Área</th><th>Bolas / norma</th><th>Masa</th><th>Comentario</th><th>Registró</th></tr></thead>
              <tbody>
                {lecturas.map((l) => {
                  const n = normaPorHora.get(l.hora);
                  return (
                    <tr key={l.id}>
                      <td>{etiquetaHora(l.hora)}</td>
                      <td>{l.temp_area} °C</td>
                      <td>{l.bolas} / {n ? bolasNorma(n, l.temp_area) : "—"}</td>
                      <td>
                        <span className={`estado ${l.en_norma ? "estado-confirmado" : "estado-pendiente"}`}>{Number(l.temperatura)} °C</span>
                      </td>
                      <td>{l.comentario ?? ""}</td>
                      <td>{persona.get(l.registrado_por)} · {hora(l.creado_en)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Typecheck y build**

Run: `npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores; el build lista `ƒ /checklists/masa`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/checklists/masa"
git commit -m "Checklists: temperatura de masa por hora

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Recorrido de supervisor

**Files:**
- Create: `app/(app)/checklists/recorrido/actions.ts`
- Create: `app/(app)/checklists/recorrido/FormRecorrido.tsx`
- Create: `app/(app)/checklists/recorrido/page.tsx`

**Interfaces:**
- Consumes: `obtenerContexto`, `puedeSupervisar` (Task 2); `diaOperativoMX`, `etiquetaHora`, `franjasAbiertas`, `siguienteFranja` (Task 2); `hora` de `lib/formato.ts`; `Checklist`, `PuntoChecklist` (Task 2); RPC `registrar_recorrido` y tablas de Task 1; clases `.formulario`, `.puntos`, `.punto`, `.si-no`, `.fallas` (Task 3).
- Produces: server action `registrarRecorrido(formData)` que espera `checklist_id`, `franja` (`"YYYY-MM-DD|H"`), `cumple_<punto_id>` (`"si"`/`"no"`) y `comentario_<punto_id>`; tipo `OpcionRecorrido`.

- [ ] **Step 1: Acción**

Create `app/(app)/checklists/recorrido/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { etiquetaHora } from "@/lib/franjas";

const volver = (clave: "ok" | "error", texto: string) => redirect(`/checklists/recorrido?${clave}=${encodeURIComponent(texto)}`);

export async function registrarRecorrido(formData: FormData) {
  const { supabase, perfil } = await obtenerContexto();
  if (!puedeSupervisar(perfil.rol)) volver("error", "El recorrido lo registra el encargado o el gerente.");

  const checklistId = String(formData.get("checklist_id") ?? "");
  const [fecha, horaTexto] = String(formData.get("franja") ?? "").split("|");
  const hora = Number(horaTexto);
  if (!checklistId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha ?? "") || !Number.isInteger(hora)) volver("error", "Elige la hora del recorrido.");

  const { data: puntos } = await supabase.from("checklist_puntos").select("id")
    .eq("checklist_id", checklistId).returns<{ id: string }[]>();
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

  const { error } = await supabase.rpc("registrar_recorrido", {
    p_checklist: checklistId, p_fecha: fecha, p_hora: hora, p_respuestas: respuestas,
  });
  if (error) volver("error", error.code === "23505" ? `Ya se registró el recorrido de las ${etiquetaHora(hora)}.` : error.message);
  revalidatePath("/checklists", "layout");
  volver("ok", `Recorrido de las ${etiquetaHora(hora)} guardado.`);
}
```

- [ ] **Step 2: Formulario de puntos**

Create `app/(app)/checklists/recorrido/FormRecorrido.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { etiquetaHora } from "@/lib/franjas";
import type { PuntoChecklist } from "@/lib/tipos";
import { registrarRecorrido } from "./actions";

export type OpcionRecorrido = { checklistId: string; nombre: string; fecha: string; hora: number };

export function FormRecorrido({
  opciones, puntosPorChecklist,
}: { opciones: OpcionRecorrido[]; puntosPorChecklist: Record<string, PuntoChecklist[]> }) {
  const [indice, setIndice] = useState(0);
  const [respuestas, setRespuestas] = useState<Record<string, "si" | "no">>({});
  const opcion = opciones[indice];
  const puntos = puntosPorChecklist[opcion.checklistId] ?? [];
  const marcar = (id: string, valor: "si" | "no") => setRespuestas({ ...respuestas, [id]: valor });

  return (
    <form action={registrarRecorrido} className="formulario">
      <input type="hidden" name="checklist_id" value={opcion.checklistId} />
      <input type="hidden" name="franja" value={`${opcion.fecha}|${opcion.hora}`} />

      {opciones.length > 1 ? (
        <div className="campo">
          <label htmlFor="opcion">Hora del recorrido</label>
          <select id="opcion" value={indice} onChange={(e) => { setIndice(Number(e.target.value)); setRespuestas({}); }}>
            {opciones.map((o, i) => (
              <option key={`${o.checklistId}|${o.fecha}|${o.hora}`} value={i}>{o.nombre} · {etiquetaHora(o.hora)}</option>
            ))}
          </select>
        </div>
      ) : (
        <p><strong>{opcion.nombre} · {etiquetaHora(opcion.hora)}</strong></p>
      )}

      <ol className="puntos">
        {puntos.map((p) => {
          const detalle = p.detalle_por_hora?.[String(opcion.hora)];
          const valor = respuestas[p.id];
          return (
            <li key={p.id} className="punto">
              <fieldset className="campo">
                <legend className="etiqueta">{p.orden}. {p.texto}</legend>
                {detalle && <small>En esta hora revisa: {detalle}.</small>}
                <div className="si-no">
                  <label>
                    <input type="radio" name={`cumple_${p.id}`} value="si" required checked={valor === "si"} onChange={() => marcar(p.id, "si")} />
                    <span>Cumple</span>
                  </label>
                  <label>
                    <input type="radio" name={`cumple_${p.id}`} value="no" checked={valor === "no"} onChange={() => marcar(p.id, "no")} />
                    <span>No cumple</span>
                  </label>
                </div>
              </fieldset>
              {valor === "no" && (
                <div className="campo">
                  <label htmlFor={`comentario_${p.id}`}>¿Qué pasó?</label>
                  <textarea id={`comentario_${p.id}`} name={`comentario_${p.id}`} rows={2} required />
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="acciones"><BotonEnviar>Guardar recorrido</BotonEnviar></div>
    </form>
  );
}
```

- [ ] **Step 3: Página**

Create `app/(app)/checklists/recorrido/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { obtenerContexto, puedeSupervisar } from "@/lib/contexto";
import { diaOperativoMX, etiquetaHora, franjasAbiertas, siguienteFranja } from "@/lib/franjas";
import { hora } from "@/lib/formato";
import type { Checklist, PuntoChecklist } from "@/lib/tipos";
import { FormRecorrido, type OpcionRecorrido } from "./FormRecorrido";

type RecorridoDia = {
  id: string; checklist_id: string; fecha: string; hora: number; registrado_por: string; creado_en: string;
  recorrido_respuestas: { punto_id: string; cumple: boolean; comentario: string | null }[];
};

export default async function Recorrido({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil, sucursal } = await obtenerContexto();
  const ahora = new Date();
  const fecha = diaOperativoMX(ahora);

  const [{ data: checklists }, { data: puntos }, { data: recorridos }, { data: nombres }] = await Promise.all([
    supabase.from("checklists").select("id, clave, nombre, horas, roles").returns<Checklist[]>(),
    supabase.from("checklist_puntos").select("id, checklist_id, orden, texto, detalle_por_hora").order("orden").returns<PuntoChecklist[]>(),
    supabase.from("recorridos")
      .select("id, checklist_id, fecha, hora, registrado_por, creado_en, recorrido_respuestas(punto_id, cumple, comentario)")
      .eq("sucursal_id", sucursal.id).eq("fecha", fecha).order("hora").returns<RecorridoDia[]>(),
    supabase.from("perfiles").select("id, nombre").returns<{ id: string; nombre: string }[]>(),
  ]);

  const listas = [...(checklists ?? [])].sort((a, b) => a.horas[0] - b.horas[0]);
  const registrados = new Set((recorridos ?? []).map((r) => `${r.checklist_id}|${r.fecha}|${r.hora}`));
  const opciones: OpcionRecorrido[] = listas
    .flatMap((c) =>
      franjasAbiertas(c.horas, ahora)
        .filter((f) => !registrados.has(`${c.id}|${f.fecha}|${f.hora}`))
        .map((f) => ({ checklistId: c.id, nombre: c.nombre, fecha: f.fecha, hora: f.hora })))
    .sort((a, b) => (a.fecha === b.fecha ? b.hora - a.hora : b.fecha.localeCompare(a.fecha)));
  const puntosPorChecklist = Object.fromEntries(listas.map((c) => [c.id, (puntos ?? []).filter((p) => p.checklist_id === c.id)]));
  const puntoPorId = new Map((puntos ?? []).map((p) => [p.id, p]));
  const nombreChecklist = new Map(listas.map((c) => [c.id, c.nombre]));
  const persona = new Map((nombres ?? []).map((p) => [p.id, p.nombre]));

  const hayAbierta = listas.some((c) => franjasAbiertas(c.horas, ahora).length > 0);
  const siguiente = siguienteFranja(listas.flatMap((c) => c.horas), ahora);
  const sinFormulario =
    (hayAbierta ? "Ya se registró el recorrido de esta hora." : "No hay recorrido abierto.") +
    (siguiente !== null ? ` El siguiente es a las ${etiquetaHora(siguiente)}.` : " Ya no hay más recorridos hoy.");

  return (
    <>
      <div className="encabezado">
        <h1>Recorrido de supervisor</h1>
        <p>Cada hora recorre la pizzería y marca cada punto. Si algo no cumple, escribe qué pasó.</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion" aria-labelledby="t-registro">
        <h2 id="t-registro">Registrar recorrido</h2>
        {!puedeSupervisar(perfil.rol) ? <p className="vacio">El recorrido lo registra el encargado o el gerente.</p>
          : opciones.length ? <FormRecorrido opciones={opciones} puntosPorChecklist={puntosPorChecklist} />
          : <p className="vacio">{sinFormulario}</p>}
      </section>

      <section className="seccion" aria-labelledby="t-hechos">
        <h2 id="t-hechos">Recorridos de hoy</h2>
        {!recorridos?.length ? <p className="vacio">Todavía no hay recorridos hoy.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla">
              <thead><tr><th>Hora</th><th>Checklist</th><th>Resultado</th><th>Registró</th></tr></thead>
              <tbody>
                {recorridos.map((r) => {
                  const fallas = r.recorrido_respuestas.filter((x) => !x.cumple);
                  return (
                    <tr key={r.id}>
                      <td>{etiquetaHora(r.hora)}</td>
                      <td>{nombreChecklist.get(r.checklist_id)}</td>
                      <td>
                        {fallas.length === 0 ? <span className="estado estado-confirmado">Todo cumple</span> : (
                          <ul className="fallas">
                            {fallas.map((x) => (
                              <li key={x.punto_id}><strong>{puntoPorId.get(x.punto_id)?.texto}</strong> {x.comentario}</li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td>{persona.get(r.registrado_por)} · {hora(r.creado_en)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 4: Typecheck y build**

Run: `npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores; el build lista `ƒ /checklists/recorrido`.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/checklists/recorrido"
git commit -m "Checklists: recorrido de supervisor por hora

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: README, verificación final y publicación

**Files:**
- Modify: `README.md` (sección nueva antes de `## Siguiente paso: conectar con Dodo IS`, y renglón en la estructura)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación de puesta en marcha y guion de prueba manual.

- [ ] **Step 1: Documentar**

In `README.md`, add to the `app/` tree under "Estructura", after the `(app)/cierre/` line:

```
  (app)/checklists/      mermas, temperatura de masa y recorrido de supervisor
```

and add after `supabase/seed.sql        sucursal inicial`:

```
supabase/seed_checklists.sql  norma de masa, recorridos y productos de merma
supabase/pruebas/        pruebas de reglas para correr en el SQL Editor
```

Insert before `## Siguiente paso: conectar con Dodo IS`:

````markdown
## Checklists

Tres registros que antes eran de papel, en **Checklists** del menú:

| Registro | Cuándo | Quién | Regla |
|---|---|---|---|
| Temperatura de masa | Cada hora de 10:00 a 22:00 | Cualquier rol | Masa de 12 a 22 °C y bolas según la norma de la temperatura del área; si no, comentario obligatorio |
| Recorrido de supervisor | Cada hora, 12:00–17:00 (mañana) y 18:00–23:00 (tarde) | Encargado, gerente o admin | Los 7 puntos marcados; cada "no cumple" con comentario |
| Mermas | Cuando pasan; se cierran al final del día | Cualquiera registra; encargado, gerente o admin cierra | Producto de la lista, cantidad, motivo y nombre de quien la hizo; después del cierre no se agregan |

- Cada hora se puede registrar desde su inicio hasta 10 minutos después de que termina. La hora la fija el servidor.
- El día de mermas y del resumen cambia a las 4:00, para que el cierre nocturno cuente para el día que termina.
- Nada se edita ni se borra.

### Puesta en marcha

En Supabase → **SQL Editor**, corre en orden:

1. `supabase/migrations/0002_checklists.sql`
2. `supabase/seed_checklists.sql`
3. `supabase/pruebas/0002_checklists.sql`: debe terminar con el error `PRUEBAS OK — …` (es a propósito, para no dejar datos). Necesita un cajero y un encargado activos en la misma sucursal.

Para cambiar el catálogo de mermas:

```sql
insert into productos_merma (categoria, nombre, unidad, orden) values ('Bebidas', 'Refresco 600 ml', 'pieza', 405);
update productos_merma set activo = false where nombre = 'Refresco';   -- quitar sin borrar
```

### Prueba manual

Con una ventana de incógnito por usuario:

1. **Cajero** → Checklists → Temperatura de masa: registra la hora actual con la norma exacta y 18 °C. Debe guardarse sin comentario.
2. En la siguiente hora abierta, escribe 25 °C sin comentario: el formulario pide comentario; si lo quitas, la app responde "Escribe qué pasó: …".
3. **Cajero** → Recorrido: debe decir que lo registra el encargado o el gerente.
4. **Encargado** → Recorrido: marca un punto como "No cumple"; sin comentario no se guarda. Con comentario, aparece en "Recorridos de hoy".
5. **Cajero** → Mermas: registra "0,5" kg de Mozzarella con nombre de empleado. En totales aparece 0.5 kg.
6. **Encargado** → Mermas: marca "Ya capturé…" y cierra. El formulario desaparece y el cajero ya no puede agregar mermas.
7. **Gerente** → Checklists: el resumen muestra las horas en Listo, Revisar, Ahora o Falta, y al elegir el día anterior se ve su historial.
````

- [ ] **Step 2: Verificación completa**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: pruebas `fail 0`, typecheck sin errores y build con `/checklists`, `/checklists/mermas`, `/checklists/masa` y `/checklists/recorrido`.

- [ ] **Step 3: Commit y publicación**

Confirma con Sebastián que ya corrió la migración y los datos iniciales en Supabase (Task 1, Step 5): si se publica sin ellos, las pantallas de checklists fallan. Con su visto bueno:

```bash
git add README.md
git commit -m "Checklists: documentación y guion de prueba

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

Expected: Vercel despliega. Sebastián sigue el guion de "Prueba manual" del README en la URL de producción.
