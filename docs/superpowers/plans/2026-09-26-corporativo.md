# Usuario corporativo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar el rol `corporativo`, que ve todas las sucursales en una vista general por día y entra al detalle de cada una sin poder registrar nada.

**Architecture:** Una migración (`0004_corporativo.sql`) agrega el rol, amplía las políticas de lectura con `ve_todas_las_sucursales()` y cierra las dos funciones que dejarían escribir a un usuario sin sucursal. En la app, `obtenerContexto()` toma la sucursal de una cookie para corporativo y devuelve `soloLectura`; las acciones pasan por `obtenerContextoParaEscribir()`. La vista general vive en `app/corporativo/`, con la lógica de alertas en `lib/corporativo.ts` (probada con `node --test`).

**Tech Stack:** Next.js 15 (App Router, server actions, cookies), React 19, TypeScript estricto, Supabase (Postgres, RLS, Storage), CSS propio, `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-26-corporativo-design.md`

## Global Constraints

- Corporativo **solo consulta**: ninguna acción de la app ni ninguna escritura directa a la base de datos debe funcionar con ese rol.
- En SQL de esta migración, comparar el rol como texto (`mi_rol()::text = 'corporativo'`), nunca `'corporativo'::rol_usuario` (el valor de enum nuevo no se puede usar en la misma transacción).
- Mensaje único para intentos de escritura: `Corporativo solo puede consultar.`
- El `admin` no cambia de comportamiento.
- Día de la vista general = día operativo de Ciudad de México (`diaOperativoMX`), hoy por defecto, nunca una fecha futura.
- Montos: una diferencia se considera cero si redondeada a centavos es 0.
- Texto de interfaz en español de México; sin dependencias npm nuevas; seguir patrones existentes.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Diferencias de centavos por redondeo** (p. ej. 0.004): no deben pintar la celda en rojo. Prueba: `alertasDeSucursal` con `diferenciaArqueos: 0.004` (Task 2).
2. **Revisión nocturna (00:00–04:00) o a media tarde:** "Falta el cierre" y "Mermas sin cerrar" solo son alerta cuando el día ya terminó. Prueba: `alertasDeSucursal` con `diaTerminado` falso y verdadero (Task 2).
3. **Sucursal nueva sin actividad:** muestra ceros y no truena; solo marca alertas de horas ya cerradas y de día terminado. Prueba: fixture vacío en `alertasDeSucursal` (Task 2).
4. **Pestaña vieja o rol cambiado:** un corporativo que envía un formulario que quedó abierto recibe "Corporativo solo puede consultar." Pruebas: `puedeAbrirTurno`/`puedeSupervisar`/`puedeGestionar` en Task 2 y rechazos en `supabase/pruebas/0004_corporativo.sql` (Task 1).
5. **Fecha manipulada en la URL** (futura o mal formada): se usa hoy. Prueba: `fechaElegida` (Task 2).

---

## File Structure

| Archivo | Acción | Responsabilidad |
|---|---|---|
| `supabase/migrations/0004_corporativo.sql` | Crear | Rol, restricción, `ve_todas_las_sucursales()`, políticas de lectura, guardas en funciones |
| `supabase/pruebas/0004_corporativo.sql` | Crear | Pruebas de lectura global y rechazos de escritura |
| `lib/roles.ts`, `lib/roles.test.ts` | Crear | Permisos por rol (puros) y mensaje de solo consulta |
| `lib/corporativo.ts`, `lib/corporativo.test.ts` | Crear | Tipo `DatosSucursal`, alertas, orden, fecha elegida |
| `lib/tipos.ts` | Modificar | `Rol` agrega `"corporativo"` |
| `lib/contexto.ts` | Modificar | `obtenerPerfil`, cookie de sucursal, `soloLectura`, `obtenerContextoParaEscribir`; permisos desde `roles.ts` |
| `app/login/actions.ts` | Modificar | Borrar la cookie al salir |
| 10 archivos `actions.ts` de `app/(app)` | Modificar | Usar `obtenerContextoParaEscribir(ruta)` |
| `components/Nav.tsx`, `app/(app)/layout.tsx` | Modificar | Franja de solo lectura y enlace "Corporativo" |
| 8 páginas de `app/(app)` | Modificar | Ocultar formularios si `soloLectura` |
| `app/corporativo/layout.tsx`, `page.tsx`, `actions.ts`, `datos.ts` | Crear | Vista general |
| `app/globals.css` | Modificar | Franja, tabla corporativa, celda de alerta |
| `package.json` | Modificar | Agregar las pruebas nuevas al script `test` |
| `README.md` | Modificar | Puesta en marcha y guion de prueba |

---

### Task 1: Base de datos

**Files:**
- Create: `supabase/migrations/0004_corporativo.sql`
- Create: `supabase/pruebas/0004_corporativo.sql`

**Interfaces:**
- Consumes: de 0001 `mi_sucursal()`, `mi_rol()`, tablas y políticas `ver_*`, funciones `confirmar_movimiento(uuid, boolean)` y `recibir_arqueo(uuid)`; de 0002 políticas `ver_mermas`, `ver_cierres_merma`, `ver_lecturas_masa`, `ver_recorridos`, `ver_recorrido_respuestas`; de 0003 `ver_comprobante`.
- Produces: valor de enum `corporativo`; restricción `perfiles_corporativo_sin_sucursal`; función `ve_todas_las_sucursales() returns boolean`; error `Corporativo solo puede consultar.` desde `confirmar_movimiento` y `recibir_arqueo`.

- [ ] **Step 1: Escribir las pruebas SQL**

Create `supabase/pruebas/0004_corporativo.sql`:

```sql
-- Pruebas de la migración 0004 (usuario corporativo). Córrelas completas en Supabase → SQL Editor.
-- Necesitan al menos dos usuarios activos con sucursal. Un usuario se vuelve corporativo solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_corpo uuid; v_otro uuid; v_suc_a uuid; v_suc_b uuid;
  v_boveda uuid; v_venta uuid; v_turno uuid; v_mov uuid; v_arqueo uuid; v_prod uuid; v_check uuid;
  v_n int; v_ok text[] := '{}';
begin
  select p.id, o.id, o.sucursal_id into v_corpo, v_otro, v_suc_a
    from perfiles p join perfiles o on o.id <> p.id and o.activo and o.sucursal_id is not null
   where p.activo and p.sucursal_id is not null
   limit 1;
  if v_corpo is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos con sucursal.'; end if;

  -- Segunda sucursal: la que exista o una temporal.
  select id into v_suc_b from sucursales where id <> v_suc_a limit 1;
  if v_suc_b is null then
    insert into sucursales (nombre) values ('Prueba corporativo') returning id into v_suc_b;
  end if;

  -- Datos de prueba en las dos sucursales (como dueño de las tablas, sin RLS).
  insert into turnos (sucursal_id, fecha, tipo, encargado_id) values (v_suc_a, '2000-01-01', 'matutino', v_otro) returning id into v_turno;
  insert into turnos (sucursal_id, fecha, tipo, encargado_id) values (v_suc_b, '2000-01-01', 'matutino', v_otro);
  select id into v_boveda from cajas where sucursal_id = v_suc_a and tipo = 'boveda';
  select id into v_venta from cajas where sucursal_id = v_suc_a and tipo = 'venta';
  if v_boveda is null or v_venta is null then raise exception 'FALTAN DATOS: la sucursal % no tiene cajas de bóveda y venta.', v_suc_a; end if;
  insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto, registrado_por)
  values (v_suc_a, 'apertura', v_boveda, v_venta, 100, v_otro) returning id into v_mov;
  insert into arqueos (turno_id, momento, total_contado, entrega_id) values (v_turno, 'inicio', 0, v_otro) returning id into v_arqueo;
  select id into v_prod from productos_merma where activo limit 1;
  select id into v_check from checklists limit 1;

  -- La regla de datos: corporativo sin sucursal, los demás con sucursal.
  begin
    update perfiles set rol = 'corporativo' where id = v_corpo;
    raise exception 'FALLÓ: un corporativo no debe tener sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%perfiles_corporativo_sin_sucursal%' then raise exception 'FALLÓ: mensaje inesperado (corporativo con sucursal): %', sqlerrm; end if;
  end;
  begin
    update perfiles set sucursal_id = null where id = v_otro;
    raise exception 'FALLÓ: un usuario de sucursal no debe quedar sin sucursal';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%perfiles_corporativo_sin_sucursal%' then raise exception 'FALLÓ: mensaje inesperado (sin sucursal): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo sin sucursal y los demás con sucursal');

  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_corpo;

  -- ── Como corporativo ───────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', v_corpo, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(distinct sucursal_id) into v_n from turnos where fecha = '2000-01-01';
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe leer turnos de dos sucursales (leyó %)', v_n; end if;
  select count(*) into v_n from sucursales where id in (v_suc_a, v_suc_b);
  if v_n <> 2 then raise exception 'FALLÓ: corporativo debe ver las dos sucursales'; end if;
  select count(*) into v_n from arqueos where id = v_arqueo;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo debe leer arqueos de cualquier sucursal'; end if;
  v_ok := array_append(v_ok, 'lee todas las sucursales');

  begin
    perform confirmar_movimiento(v_mov, true);
    raise exception 'FALLÓ: corporativo no debe confirmar movimientos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado al confirmar: %', sqlerrm; end if;
  end;
  begin
    perform recibir_arqueo(v_arqueo);
    raise exception 'FALLÓ: corporativo no debe recibir arqueos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado al recibir arqueo: %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'no confirma ni recibe');

  -- Cualquier error cuenta como rechazo (RLS, triggers o reglas); lo que no puede pasar es que se guarde.
  begin insert into turnos (sucursal_id, fecha, tipo) values (v_suc_a, '2000-01-02', 'matutino');
    raise exception 'FALLÓ: corporativo no debe abrir turnos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin insert into movimientos (sucursal_id, tipo, caja_origen_id, caja_destino_id, monto) values (v_suc_a, 'apertura', v_boveda, v_venta, 1);
    raise exception 'FALLÓ: corporativo no debe registrar movimientos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin insert into arqueos (turno_id, momento, total_contado) values (v_turno, 'traspaso', 0);
    raise exception 'FALLÓ: corporativo no debe registrar arqueos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin insert into gastos_caja_chica (sucursal_id, fecha, concepto, monto, comprobante) values (v_suc_a, current_date, 'x', 1, 'nota');
    raise exception 'FALLÓ: corporativo no debe registrar gastos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin insert into storage.objects (bucket_id, name) values ('comprobantes', v_suc_a::text || '/corpo.jpg');
    raise exception 'FALLÓ: corporativo no debe subir fotos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin insert into mermas (sucursal_id, producto_id, cantidad, motivo, empleado) values (v_suc_a, v_prod, 1, 'caducidad', 'x');
    raise exception 'FALLÓ: corporativo no debe registrar mermas';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin insert into cierres_merma (sucursal_id, capturado_dodo) values (v_suc_a, true);
    raise exception 'FALLÓ: corporativo no debe cerrar mermas';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin insert into lecturas_masa (sucursal_id, fecha, hora, temp_area, bolas, temperatura, comentario) values (v_suc_a, current_date, 12, 25, 2, 18, 'x');
    raise exception 'FALLÓ: corporativo no debe registrar masa';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin perform registrar_recorrido(v_check, current_date, 12, '[]'::jsonb);
    raise exception 'FALLÓ: corporativo no debe registrar recorridos';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  begin insert into cierres_dia (sucursal_id, fecha) values (v_suc_a, '2000-01-01');
    raise exception 'FALLÓ: corporativo no debe cerrar el día';
  exception when others then if sqlerrm like 'FALLÓ%' then raise; end if; end;
  v_ok := array_append(v_ok, 'no registra nada');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 2: Correr las pruebas para verlas fallar**

Pide a Sebastián que las corra en Supabase → SQL Editor.
Expected: `FALLÓ: mensaje inesperado (corporativo con sucursal): invalid input value for enum rol_usuario: "corporativo"` (todavía no existe el rol).

- [ ] **Step 3: Escribir la migración**

Create `supabase/migrations/0004_corporativo.sql`:

```sql
-- Usuario corporativo: lee todas las sucursales y no escribe nada.
-- Requiere 0001, 0002 y 0003.
--
-- Postgres no deja usar un valor de enum en la misma transacción en que se agrega, y el SQL Editor
-- corre todo el script en una sola transacción: por eso aquí el rol se compara como texto.

do $$
begin
  if exists (select 1 from perfiles where sucursal_id is null) then
    raise exception 'Hay perfiles sin sucursal. Asígnales una antes de correr esta migración: select * from perfiles where sucursal_id is null;';
  end if;
end $$;

alter type rol_usuario add value if not exists 'corporativo';

-- Corporativo nunca tiene sucursal; los demás roles siempre la tienen.
alter table perfiles add constraint perfiles_corporativo_sin_sucursal
  check ((rol::text = 'corporativo') = (sucursal_id is null));

create or replace function ve_todas_las_sucursales() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(mi_rol()::text in ('admin', 'corporativo'), false)
$$;


-- ─── Lectura: admin y corporativo ven todas las sucursales ──────────────────
drop policy ver_sucursal on sucursales;
create policy ver_sucursal on sucursales for select
  using (id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_perfiles on perfiles;
create policy ver_perfiles on perfiles for select
  using (id = auth.uid() or sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_cajas on cajas;
create policy ver_cajas on cajas for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_turnos on turnos;
create policy ver_turnos on turnos for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_arqueos on arqueos;
create policy ver_arqueos on arqueos for select
  using (exists (select 1 from turnos t where t.id = turno_id
                 and (t.sucursal_id = mi_sucursal() or ve_todas_las_sucursales())));

drop policy ver_movimientos on movimientos;
create policy ver_movimientos on movimientos for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_gastos on gastos_caja_chica;
create policy ver_gastos on gastos_caja_chica for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_cierres on cierres_dia;
create policy ver_cierres on cierres_dia for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_mermas on mermas;
create policy ver_mermas on mermas for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_cierres_merma on cierres_merma;
create policy ver_cierres_merma on cierres_merma for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_lecturas_masa on lecturas_masa;
create policy ver_lecturas_masa on lecturas_masa for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_recorridos on recorridos;
create policy ver_recorridos on recorridos for select
  using (sucursal_id = mi_sucursal() or ve_todas_las_sucursales());

drop policy ver_recorrido_respuestas on recorrido_respuestas;
create policy ver_recorrido_respuestas on recorrido_respuestas for select
  using (exists (select 1 from recorridos r where r.id = recorrido_id
                 and (r.sucursal_id = mi_sucursal() or ve_todas_las_sucursales())));

drop policy ver_comprobante on storage.objects;
create policy ver_comprobante on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes'
         and ((storage.foldername(name))[1] = public.mi_sucursal()::text or public.ve_todas_las_sucursales()));


-- ─── Escritura: las dos funciones que no rechazaban a un usuario sin sucursal ─
-- Las políticas de inserción ya exigen sucursal_id = mi_sucursal(), que nunca se cumple sin sucursal.

create or replace function confirmar_movimiento(p_id uuid, p_aceptar boolean) returns void
language plpgsql security definer set search_path = public as $$
declare m movimientos;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  select * into m from movimientos where id = p_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if m.sucursal_id <> mi_sucursal() and mi_rol() <> 'admin' then
    raise exception 'El movimiento es de otra sucursal';
  end if;
  if m.estado <> 'pendiente' then raise exception 'El movimiento ya fue %', m.estado; end if;
  if m.registrado_por = auth.uid() then
    raise exception 'Quien registra el movimiento no puede confirmarlo';
  end if;
  if m.tipo in ('deposito_banco', 'reposicion_caja_chica') and mi_rol() not in ('gerente', 'admin') then
    raise exception 'Solo un gerente confirma depósitos y reposiciones';
  end if;

  update movimientos
     set estado = case when p_aceptar then 'confirmado'::estado_movimiento else 'rechazado'::estado_movimiento end,
         confirmado_por = auth.uid(),
         confirmado_en = now()
   where id = p_id;
end $$;

create or replace function recibir_arqueo(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a arqueos; s uuid;
begin
  if mi_rol()::text = 'corporativo' then raise exception 'Corporativo solo puede consultar.'; end if;
  select * into a from arqueos where id = p_id for update;
  if not found then raise exception 'Arqueo no encontrado'; end if;
  select sucursal_id into s from turnos where id = a.turno_id;
  if s <> mi_sucursal() and mi_rol() <> 'admin' then raise exception 'El arqueo es de otra sucursal'; end if;
  if a.recibe_id is not null then raise exception 'El arqueo ya fue recibido'; end if;
  if a.entrega_id = auth.uid() then raise exception 'Quien entrega no puede recibir su propio arqueo'; end if;
  update arqueos set recibe_id = auth.uid(), recibido_en = now() where id = p_id;
end $$;
```

- [ ] **Step 4: Correr migración y pruebas**

Pide a Sebastián: en SQL Editor, primero `select * from perfiles where sucursal_id is null;` (debe salir vacío), luego `supabase/migrations/0004_corporativo.sql` y después `supabase/pruebas/0004_corporativo.sql`.
Expected: migración "Success"; pruebas terminan con `PRUEBAS OK — corporativo sin sucursal y los demás con sucursal · lee todas las sucursales · no confirma ni recibe · no registra nada`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_corporativo.sql supabase/pruebas/0004_corporativo.sql
git commit -m "Corporativo: rol de solo lectura en la base de datos y pruebas SQL

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Permisos por rol y lógica de la vista general

**Files:**
- Create: `lib/roles.ts`, `lib/roles.test.ts`, `lib/corporativo.ts`, `lib/corporativo.test.ts`
- Modify: `lib/tipos.ts:1`, `package.json` (script `test`)

**Interfaces:**
- Consumes: tipo `Rol` de `lib/tipos.ts`.
- Produces:
  - `lib/roles.ts`: `SOLO_CONSULTA = "Corporativo solo puede consultar."`, `esCorporativo(rol: Rol): boolean`, `puedeAbrirTurno(rol: Rol): boolean`, `puedeSupervisar(rol: Rol): boolean`, `puedeGestionar(rol: Rol): boolean`.
  - `lib/corporativo.ts`: `type DatosSucursal`, `type Alerta`, `alertasDeSucursal(d: DatosSucursal, diaTerminado: boolean): Alerta[]`, `ordenarSucursales<T extends { nombre: string; alertas: readonly Alerta[] }>(filas: readonly T[]): T[]`, `fechaElegida(pedida: string | undefined, hoy: string): string`.

- [ ] **Step 1: Pruebas**

In `lib/tipos.ts`, change line 1 to:

```ts
export type Rol = "cajero" | "encargado" | "gerente" | "admin" | "corporativo";
```

Create `lib/roles.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { esCorporativo, puedeAbrirTurno, puedeGestionar, puedeSupervisar } from "./roles.ts";

test("corporativo solo consulta: no abre turno, no supervisa, no gestiona", () => {
  assert.equal(esCorporativo("corporativo"), true);
  assert.equal(puedeAbrirTurno("corporativo"), false);
  assert.equal(puedeSupervisar("corporativo"), false);
  assert.equal(puedeGestionar("corporativo"), false);
});

test("los roles de sucursal conservan sus permisos", () => {
  assert.equal(puedeAbrirTurno("cajero"), false);
  assert.equal(puedeSupervisar("cajero"), false);
  assert.equal(puedeAbrirTurno("encargado"), true);
  assert.equal(puedeSupervisar("encargado"), true);
  assert.equal(puedeGestionar("encargado"), false);
  for (const rol of ["gerente", "admin"] as const) {
    assert.equal(puedeAbrirTurno(rol), true);
    assert.equal(puedeSupervisar(rol), true);
    assert.equal(puedeGestionar(rol), true);
    assert.equal(esCorporativo(rol), false);
  }
});
```

Create `lib/corporativo.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { alertasDeSucursal, fechaElegida, ordenarSucursales, type DatosSucursal } from "./corporativo.ts";

const base: DatosSucursal = {
  id: "a", nombre: "Zapopan-1",
  turnosAbiertos: 0, turnosCerrados: 2,
  diferenciaArqueos: 0, pendientes: 0, deposito: 5000,
  cierre: { cerradoEn: "2026-09-26T05:00:00Z", ventaTotal: 20000, bovedaDiferencia: 0 },
  masa: { total: 13, registradas: 13, faltantes: 0, fueraDeNorma: 0 },
  recorrido: { total: 12, hechos: 12, faltantes: 0, conFallas: 0 },
  mermasCerradas: true, mermas: 3, gastos: 250, sinComprobante: 0,
};

test("una sucursal en orden no tiene alertas", () => {
  assert.deepEqual(alertasDeSucursal(base, true), []);
});

test("centavos de redondeo no son alerta; una diferencia real sí", () => {
  assert.deepEqual(alertasDeSucursal({ ...base, diferenciaArqueos: 0.004 }, true), []);
  assert.deepEqual(alertasDeSucursal({ ...base, diferenciaArqueos: -120 }, true), ["arqueos"]);
  assert.deepEqual(alertasDeSucursal({ ...base, cierre: { ...base.cierre!, bovedaDiferencia: 50 } }, true), ["boveda"]);
});

test("falta de cierre y mermas sin cerrar solo son alerta cuando el día terminó", () => {
  const abierta = { ...base, cierre: null, mermasCerradas: false };
  assert.deepEqual(alertasDeSucursal(abierta, false), []);
  assert.deepEqual(alertasDeSucursal(abierta, true), ["cierre", "mermas"]);
});

test("día cerrado sin depósito es alerta", () => {
  assert.deepEqual(alertasDeSucursal({ ...base, deposito: 0 }, true), ["deposito"]);
});

test("pendientes, checklists y gastos sin comprobante", () => {
  assert.deepEqual(alertasDeSucursal({ ...base, pendientes: 2 }, true), ["pendientes"]);
  assert.deepEqual(alertasDeSucursal({ ...base, masa: { ...base.masa, faltantes: 1 } }, true), ["masa"]);
  assert.deepEqual(alertasDeSucursal({ ...base, masa: { ...base.masa, fueraDeNorma: 1 } }, true), ["masa"]);
  assert.deepEqual(alertasDeSucursal({ ...base, recorrido: { ...base.recorrido, conFallas: 1 } }, true), ["recorrido"]);
  assert.deepEqual(alertasDeSucursal({ ...base, sinComprobante: 1 }, true), ["comprobantes"]);
});

test("una sucursal nueva sin actividad a media tarde no marca nada que aún no toca", () => {
  const nueva: DatosSucursal = {
    ...base, turnosCerrados: 0, deposito: 0, cierre: null, mermasCerradas: false, mermas: 0, gastos: 0,
    masa: { total: 13, registradas: 0, faltantes: 0, fueraDeNorma: 0 },
    recorrido: { total: 12, hechos: 0, faltantes: 0, conFallas: 0 },
  };
  assert.deepEqual(alertasDeSucursal(nueva, false), []);
});

test("las sucursales con alertas van primero y luego por nombre", () => {
  const filas = [
    { nombre: "Zapopan-1", alertas: [] },
    { nombre: "Tlaquepaque", alertas: ["pendientes"] as const },
    { nombre: "Ávila Camacho", alertas: [] },
    { nombre: "Chapalita", alertas: ["masa"] as const },
  ];
  assert.deepEqual(ordenarSucursales(filas).map((f) => f.nombre), ["Chapalita", "Tlaquepaque", "Ávila Camacho", "Zapopan-1"]);
});

test("fechaElegida usa hoy si la fecha falta, está mal formada o es futura", () => {
  assert.equal(fechaElegida(undefined, "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("ayer", "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("2026-09-27", "2026-09-26"), "2026-09-26");
  assert.equal(fechaElegida("2026-09-20", "2026-09-26"), "2026-09-20");
});
```

In `package.json`, append the two files to the `test` script:

```json
    "test": "node --experimental-strip-types --test lib/franjas.test.ts lib/masa.test.ts lib/formato.test.ts lib/fotos.test.ts lib/roles.test.ts lib/corporativo.test.ts"
```

- [ ] **Step 2: Correr para verlas fallar**

Run: `npm test`
Expected: FAIL con `Cannot find module '…/lib/roles.ts'` y `'…/lib/corporativo.ts'`.

- [ ] **Step 3: Implementar**

Create `lib/roles.ts`:

```ts
import type { Rol } from "./tipos";

export const SOLO_CONSULTA = "Corporativo solo puede consultar.";

export const esCorporativo = (rol: Rol) => rol === "corporativo";
export const puedeAbrirTurno = (rol: Rol) => rol === "encargado" || rol === "gerente" || rol === "admin";
/** Recorrido de supervisor y cierre de mermas. */
export const puedeSupervisar = puedeAbrirTurno;
export const puedeGestionar = (rol: Rol) => rol === "gerente" || rol === "admin";
```

Create `lib/corporativo.ts`:

```ts
/** Vista general de corporativo: datos por sucursal para un día y qué merece atención. */

export type DatosSucursal = {
  id: string;
  nombre: string;
  turnosAbiertos: number;
  turnosCerrados: number;
  diferenciaArqueos: number;
  pendientes: number;
  deposito: number;
  cierre: { cerradoEn: string; ventaTotal: number; bovedaDiferencia: number } | null;
  /** faltantes = horas ya cerradas sin registro. */
  masa: { total: number; registradas: number; faltantes: number; fueraDeNorma: number };
  recorrido: { total: number; hechos: number; faltantes: number; conFallas: number };
  mermasCerradas: boolean;
  mermas: number;
  gastos: number;
  sinComprobante: number;
};

export type Alerta =
  | "arqueos" | "pendientes" | "deposito" | "cierre" | "boveda"
  | "masa" | "recorrido" | "mermas" | "comprobantes";

/** Una diferencia cuenta si no es cero al redondear a centavos. */
const hayDiferencia = (n: number) => Math.round(n * 100) !== 0;

export function alertasDeSucursal(d: DatosSucursal, diaTerminado: boolean): Alerta[] {
  const alertas: Alerta[] = [];
  if (hayDiferencia(d.diferenciaArqueos)) alertas.push("arqueos");
  if (d.pendientes > 0) alertas.push("pendientes");
  if (d.cierre && !hayDiferencia(d.deposito)) alertas.push("deposito");
  if (!d.cierre && diaTerminado) alertas.push("cierre");
  if (d.cierre && hayDiferencia(d.cierre.bovedaDiferencia)) alertas.push("boveda");
  if (d.masa.faltantes > 0 || d.masa.fueraDeNorma > 0) alertas.push("masa");
  if (d.recorrido.faltantes > 0 || d.recorrido.conFallas > 0) alertas.push("recorrido");
  if (!d.mermasCerradas && diaTerminado) alertas.push("mermas");
  if (d.sinComprobante > 0) alertas.push("comprobantes");
  return alertas;
}

/** Las sucursales con alertas primero; dentro de cada grupo, por nombre. */
export function ordenarSucursales<T extends { nombre: string; alertas: readonly Alerta[] }>(filas: readonly T[]): T[] {
  return [...filas].sort(
    (a, b) => Number(b.alertas.length > 0) - Number(a.alertas.length > 0) || a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** La fecha pedida en la URL si es válida y no es futura; si no, hoy. */
export function fechaElegida(pedida: string | undefined, hoy: string): string {
  return pedida && /^\d{4}-\d{2}-\d{2}$/.test(pedida) && pedida <= hoy ? pedida : hoy;
}
```

- [ ] **Step 4: Correr pruebas y typecheck**

Run: `npm test && npm run typecheck`
Expected: todas pasan (`fail 0`); typecheck sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/roles.ts lib/roles.test.ts lib/corporativo.ts lib/corporativo.test.ts lib/tipos.ts package.json
git commit -m "Corporativo: permisos por rol y alertas de la vista general con pruebas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Contexto, cookie de sucursal y candado en las acciones

**Files:**
- Modify: `lib/contexto.ts` (reemplazo completo), `app/login/actions.ts`
- Modify: `app/(app)/actions.ts`, `app/(app)/arqueo/actions.ts`, `app/(app)/caja-chica/actions.ts`, `app/(app)/checklists/masa/actions.ts`, `app/(app)/checklists/mermas/actions.ts`, `app/(app)/checklists/recorrido/actions.ts`, `app/(app)/cierre/actions.ts`, `app/(app)/movimientos/actions.ts`

**Interfaces:**
- Consumes: `esCorporativo`, `puedeAbrirTurno`, `puedeSupervisar`, `puedeGestionar`, `SOLO_CONSULTA` (Task 2).
- Produces (usado por Tasks 4 y 5):
  - `COOKIE_SUCURSAL = "sucursal_vista"`.
  - `obtenerPerfil(): Promise<{ supabase, user, perfil: Perfil }>`.
  - `obtenerContexto()`: mismo retorno que antes más `soloLectura: boolean`.
  - `obtenerContextoParaEscribir(ruta: string)`: igual, pero si `soloLectura` redirige a `ruta?error=Corporativo solo puede consultar.`.
  - `lib/contexto.ts` sigue exportando `puedeAbrirTurno`, `puedeSupervisar` y `puedeGestionar` (ahora desde `roles.ts`).

- [ ] **Step 1: Reescribir el contexto**

Replace the whole content of `lib/contexto.ts` with:

```ts
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { esCorporativo, SOLO_CONSULTA } from "@/lib/roles";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { Caja, Perfil, Sucursal, Turno } from "@/lib/tipos";

export { puedeAbrirTurno, puedeGestionar, puedeSupervisar } from "@/lib/roles";

/** Sucursal que corporativo eligió en la vista general. */
export const COOKIE_SUCURSAL = "sucursal_vista";

/** Sesión y perfil, sin sucursal. Redirige a /login si falta algo. */
export async function obtenerPerfil() {
  const supabase = await crearClienteServidor();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: perfil } = await supabase
    .from("perfiles").select("id, nombre, rol, sucursal_id").eq("id", user.id).single<Perfil>();
  if (!perfil) redirect("/login?error=sin-perfil");

  return { supabase, user, perfil };
}

/**
 * Sesión, perfil, sucursal, cajas y turno abierto.
 * Corporativo ve la sucursal que eligió (cookie) en solo lectura; sin elegir, vuelve a la vista general.
 */
export async function obtenerContexto() {
  const { supabase, user, perfil } = await obtenerPerfil();
  const soloLectura = esCorporativo(perfil.rol);
  const sucursalId = soloLectura ? (await cookies()).get(COOKIE_SUCURSAL)?.value : perfil.sucursal_id;
  if (!sucursalId) redirect(soloLectura ? "/corporativo" : "/login?error=sin-perfil");

  const [{ data: sucursal }, { data: cajas }, { data: turno }] = await Promise.all([
    supabase.from("sucursales")
      .select("id, nombre, fondo_caja_venta, fondo_cambios, fondo_caja_chica, limite_retiro")
      .eq("id", sucursalId).maybeSingle<Sucursal>(),
    supabase.from("cajas").select("id, tipo, nombre").eq("sucursal_id", sucursalId).returns<Caja[]>(),
    supabase.from("turnos").select("id, fecha, tipo, abierto_en, cerrado_en, encargado_id")
      .eq("sucursal_id", sucursalId).is("cerrado_en", null)
      .order("abierto_en", { ascending: false }).limit(1).maybeSingle<Turno>(),
  ]);
  if (!sucursal) redirect(soloLectura ? "/corporativo" : "/login?error=sin-sucursal");

  const cajaPorTipo = Object.fromEntries((cajas ?? []).map((c) => [c.tipo, c])) as Partial<Record<Caja["tipo"], Caja>>;

  return { supabase, user, perfil, sucursal, cajas: cajas ?? [], cajaPorTipo, turno: turno ?? null, soloLectura };
}

/** Para server actions que escriben: corporativo regresa a `ruta` con el aviso de solo consulta. */
export async function obtenerContextoParaEscribir(ruta: string) {
  const contexto = await obtenerContexto();
  if (contexto.soloLectura) redirect(`${ruta}?error=${encodeURIComponent(SOLO_CONSULTA)}`);
  return contexto;
}
```

- [ ] **Step 2: Borrar la cookie al salir**

In `app/login/actions.ts`, add the imports and delete the cookie in `cerrarSesion`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SUCURSAL } from "@/lib/contexto";
import { crearClienteServidor } from "@/lib/supabase/server";
```

```ts
export async function cerrarSesion() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_SUCURSAL);
  redirect("/login");
}
```

- [ ] **Step 3: Candado en todas las acciones que escriben**

En cada archivo, reemplaza el nombre `obtenerContexto` por `obtenerContextoParaEscribir` en el `import` y en cada llamada, y pasa la ruta de su página:

| Archivo | Ruta |
|---|---|
| `app/(app)/actions.ts` | `"/"` |
| `app/(app)/arqueo/actions.ts` | `"/arqueo"` |
| `app/(app)/caja-chica/actions.ts` | `"/caja-chica"` |
| `app/(app)/checklists/masa/actions.ts` | `"/checklists/masa"` |
| `app/(app)/checklists/mermas/actions.ts` | `"/checklists/mermas"` |
| `app/(app)/checklists/recorrido/actions.ts` | `"/checklists/recorrido"` |
| `app/(app)/cierre/actions.ts` | `"/cierre"` |
| `app/(app)/movimientos/actions.ts` | `"/movimientos"` |

Ejemplo (`app/(app)/caja-chica/actions.ts`): `import { obtenerContexto } from "@/lib/contexto";` → `import { obtenerContextoParaEscribir } from "@/lib/contexto";` y `await obtenerContexto();` → `await obtenerContextoParaEscribir("/caja-chica");`.

Con bash, desde la raíz del repo:

```bash
for par in "app/(app)/actions.ts|/" "app/(app)/arqueo/actions.ts|/arqueo" "app/(app)/caja-chica/actions.ts|/caja-chica" \
  "app/(app)/checklists/masa/actions.ts|/checklists/masa" "app/(app)/checklists/mermas/actions.ts|/checklists/mermas" \
  "app/(app)/checklists/recorrido/actions.ts|/checklists/recorrido" "app/(app)/cierre/actions.ts|/cierre" \
  "app/(app)/movimientos/actions.ts|/movimientos"; do
  f="${par%%|*}"; r="${par##*|}"
  sed -i -E "s/\bobtenerContexto\b/obtenerContextoParaEscribir/g; s#obtenerContextoParaEscribir\(\)#obtenerContextoParaEscribir(\"$r\")#g" "$f"
done
grep -rn "obtenerContexto()" "app/(app)" --include=actions.ts
```

Expected: el `grep` final no imprime nada.

- [ ] **Step 4: Typecheck, pruebas y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/contexto.ts app/login/actions.ts "app/(app)"
git commit -m "Corporativo: sucursal elegida por cookie y candado de solo lectura en las acciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Pantallas de sucursal en solo lectura

**Files:**
- Modify: `components/Nav.tsx`, `app/(app)/layout.tsx`, `app/globals.css`
- Modify: `app/(app)/page.tsx`, `app/(app)/arqueo/page.tsx`, `app/(app)/movimientos/page.tsx`, `app/(app)/caja-chica/page.tsx`, `app/(app)/cierre/page.tsx`, `app/(app)/checklists/page.tsx`, `app/(app)/checklists/mermas/page.tsx`, `app/(app)/checklists/masa/page.tsx`

**Interfaces:**
- Consumes: `soloLectura` de `obtenerContexto()` (Task 3); `puedeAbrirTurno`, `puedeSupervisar`, `puedeGestionar` ya devuelven `false` para corporativo (Task 2).
- Produces: `Nav({ corporativo?: boolean })`; clase CSS `.franja-lectura`.

- [ ] **Step 1: Menú y franja**

`components/Nav.tsx`: change the component to accept `corporativo`:

```tsx
export function Nav({ corporativo = false }: { corporativo?: boolean }) {
  const ruta = usePathname();
  const enlaces = corporativo ? [{ href: "/corporativo", texto: "Corporativo" }, ...ENLACES] : ENLACES;
  return (
    <nav className="nav" aria-label="Secciones">
      {enlaces.map((e) => (
        <Link key={e.href} href={e.href} aria-current={activo(ruta, e.href) ? "page" : undefined}>
          {e.texto}
        </Link>
      ))}
    </nav>
  );
}
```

`app/(app)/layout.tsx`:
- add `import Link from "next/link";`
- `const ROL` adds `corporativo: "Corporativo"`;
- `const { perfil, sucursal, turno } = await obtenerContexto();` → `const { perfil, sucursal, turno, soloLectura } = await obtenerContexto();`
- replace `<Nav />` with:

```tsx
      {soloLectura && (
        <p className="franja-lectura">
          Viendo {sucursal.nombre} · Solo lectura · <Link href="/corporativo">Volver a corporativo</Link>
        </p>
      )}
      <Nav corporativo={soloLectura} />
```

`app/globals.css`, insert before `/* ─── Login ─── */`:

```css
/* ─── Corporativo ─── */
.franja-lectura {
  margin: 0; padding: 10px clamp(16px, 4vw, 40px);
  background: var(--papel-2); border-bottom: 1px solid var(--linea); font-weight: 700;
}
.tabla-corporativo th[scope="row"], .tabla-corporativo thead tr:last-child th:first-child {
  position: sticky; left: 0; z-index: 1; background: var(--blanco); white-space: nowrap;
}
.tabla-corporativo thead .grupos th { text-align: center; border-bottom: 1px solid var(--linea); color: var(--tinta); }
.tabla-corporativo td { white-space: nowrap; }
.celda-alerta { background: var(--alerta-fondo); color: var(--alerta-texto); font-weight: 700; }
.celda-alerta::before { content: "⚠ "; }

```

- [ ] **Step 2: Ocultar formularios**

Cada página agrega `soloLectura` a lo que toma de `obtenerContexto()` y aplica estos cambios exactos:

`app/(app)/page.tsx` — `const { supabase, perfil, sucursal, turno, cajas } = await obtenerContexto();` → `const { supabase, perfil, sucursal, turno, cajas, soloLectura } = await obtenerContexto();`
- `<Link className="boton" href="/arqueo">Registrar arqueo</Link>` → `{!soloLectura && <Link className="boton" href="/arqueo">Registrar arqueo</Link>}`
- `<p className="vacio">No hay turno abierto. Pide al encargado que lo abra.</p>` → `<p className="vacio">{soloLectura ? "No hay turno abierto." : "No hay turno abierto. Pide al encargado que lo abra."}</p>`
- `{m.registrado_por === perfil.id ? (` → `{soloLectura ? null : m.registrado_por === perfil.id ? (`

`app/(app)/arqueo/page.tsx` — `const { supabase, perfil, sucursal, turno } = await obtenerContexto();` → `const { supabase, perfil, sucursal, turno, soloLectura } = await obtenerContexto();`
- `{a.recibe_id ? persona.get(a.recibe_id) : a.entrega_id === perfil.id ? (` → `{a.recibe_id ? persona.get(a.recibe_id) : soloLectura || a.entrega_id === perfil.id ? (`
- `<FormArqueo fondoInicial={fondo} retirosBoveda={retiros} momentoSugerido={momentoSugerido} />` → `{!soloLectura && <FormArqueo fondoInicial={fondo} retirosBoveda={retiros} momentoSugerido={momentoSugerido} />}`

`app/(app)/movimientos/page.tsx` — `const { supabase, perfil, sucursal, cajas } = await obtenerContexto();` → `const { supabase, perfil, sucursal, cajas, soloLectura } = await obtenerContexto();`
- `<FormMovimiento limiteRetiro={Number(sucursal.limite_retiro)} />` → `{!soloLectura && <FormMovimiento limiteRetiro={Number(sucursal.limite_retiro)} />}`
- `{m.estado === "pendiente" && m.registrado_por !== perfil.id ? (` → `{m.estado === "pendiente" && m.registrado_por !== perfil.id && !soloLectura ? (`

`app/(app)/caja-chica/page.tsx` — `const { supabase, sucursal } = await obtenerContexto();` → `const { supabase, sucursal, soloLectura } = await obtenerContexto();`
- `{porReponer > 0 && (` → `{porReponer > 0 && !soloLectura && (`
- `      <form action={registrarGasto} className="seccion" aria-labelledby="t-gasto">` → `      {!soloLectura && (\n      <form action={registrarGasto} className="seccion" aria-labelledby="t-gasto">`
- the `</form>` that closes that form, followed by the blank line and `<section className="seccion" aria-labelledby="t-gastos">`, becomes `</form>\n      )}` followed by the same blank line and section.

`app/(app)/cierre/page.tsx` — `const { supabase, perfil, sucursal, turno } = await obtenerContexto();` → `const { supabase, perfil, sucursal, turno, soloLectura } = await obtenerContexto();`
- `<p className="aviso aviso-info">El cierre del día lo hace el gerente.</p>` → `<p className="aviso aviso-info">{soloLectura ? "Este día todavía no se cierra." : "El cierre del día lo hace el gerente."}</p>`

`app/(app)/checklists/page.tsx` — `const { supabase, sucursal } = await obtenerContexto();` → `const { supabase, sucursal, soloLectura } = await obtenerContexto();`
- las tres apariciones de `{esHoy && <Link className="boton"` → `{esHoy && !soloLectura && <Link className="boton"`

`app/(app)/checklists/mermas/page.tsx` — `const { supabase, perfil, sucursal } = await obtenerContexto();` → `const { supabase, perfil, sucursal, soloLectura } = await obtenerContexto();`
- `      ) : (\n        <form action={registrarMerma}` → `      ) : soloLectura ? null : (\n        <form action={registrarMerma}`

`app/(app)/checklists/masa/page.tsx` — `const { supabase, sucursal } = await obtenerContexto();` → `const { supabase, sucursal, soloLectura } = await obtenerContexto();`
- `{abiertas.length ? <FormMasa` → `{soloLectura ? <p className="vacio">Corporativo solo puede consultar.</p> : abiertas.length ? <FormMasa`

(`app/(app)/checklists/recorrido/page.tsx` no cambia: `puedeSupervisar` ya es falso para corporativo y muestra "El recorrido lo registra el encargado o el gerente.")

- [ ] **Step 3: Verificar que no quedó ningún formulario de escritura sin condición**

Run: `grep -n "action={" "app/(app)/page.tsx" "app/(app)/arqueo/page.tsx" "app/(app)/movimientos/page.tsx" "app/(app)/caja-chica/page.tsx" "app/(app)/checklists/mermas/page.tsx"`
Expected: cada formulario listado está dentro de una rama que excluye `soloLectura` o `puedeX(perfil.rol)` (revísalos uno por uno contra los cambios de arriba).

- [ ] **Step 4: Pruebas, typecheck y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add components/Nav.tsx app/globals.css "app/(app)"
git commit -m "Corporativo: pantallas de sucursal en solo lectura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Vista general

**Files:**
- Create: `app/corporativo/layout.tsx`, `app/corporativo/page.tsx`, `app/corporativo/actions.ts`, `app/corporativo/datos.ts`

**Interfaces:**
- Consumes: `obtenerPerfil`, `COOKIE_SUCURSAL` (Task 3); `esCorporativo` (Task 2); `alertasDeSucursal`, `ordenarSucursales`, `fechaElegida`, `DatosSucursal`, `Alerta` (Task 2); `diaOperativoMX`, `estadoFranja` de `lib/franjas.ts`; `bolasNorma` de `lib/masa.ts`; `rangoDiaMX`, `hora`, `pesos` de `lib/formato.ts`; clases CSS de Task 4.
- Produces: ruta `/corporativo`; server action `verSucursal(formData)` con campo `sucursal_id`.

- [ ] **Step 1: Carga de datos**

Create `app/corporativo/datos.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DatosSucursal } from "@/lib/corporativo";
import { estadoFranja } from "@/lib/franjas";
import { rangoDiaMX } from "@/lib/formato";
import { bolasNorma } from "@/lib/masa";
import type { Checklist, NormaMasa, TempArea } from "@/lib/tipos";

/** Todas las sucursales en un día: una consulta por tabla, no una por sucursal. */
export async function datosCorporativo(supabase: SupabaseClient, fecha: string, ahora: Date): Promise<DatosSucursal[]> {
  const { desde, hasta } = rangoDiaMX(fecha);
  const [
    { data: sucursales }, { data: turnos }, { data: movimientos }, { data: cierres },
    { data: normas }, { data: lecturas }, { data: checklists }, { data: recorridos },
    { data: cierresMerma }, { data: mermas }, { data: gastos },
  ] = await Promise.all([
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("turnos").select("id, sucursal_id, cerrado_en").eq("fecha", fecha)
      .returns<{ id: string; sucursal_id: string; cerrado_en: string | null }[]>(),
    supabase.from("movimientos").select("sucursal_id, tipo, estado, monto").gte("creado_en", desde).lt("creado_en", hasta)
      .returns<{ sucursal_id: string; tipo: string; estado: string; monto: number }[]>(),
    supabase.from("cierres_dia").select("sucursal_id, cerrado_en, venta_total, boveda_diferencia").eq("fecha", fecha)
      .returns<{ sucursal_id: string; cerrado_en: string; venta_total: number; boveda_diferencia: number }[]>(),
    supabase.from("normas_masa").select("hora, bolas_25, bolas_30, bolas_35").returns<NormaMasa[]>(),
    supabase.from("lecturas_masa").select("sucursal_id, hora, temp_area, bolas, en_norma").eq("fecha", fecha)
      .returns<{ sucursal_id: string; hora: number; temp_area: TempArea; bolas: number; en_norma: boolean }[]>(),
    supabase.from("checklists").select("id, clave, nombre, horas, roles").returns<Checklist[]>(),
    supabase.from("recorridos").select("sucursal_id, checklist_id, hora, recorrido_respuestas(cumple)").eq("fecha", fecha)
      .returns<{ sucursal_id: string; checklist_id: string; hora: number; recorrido_respuestas: { cumple: boolean }[] }[]>(),
    supabase.from("cierres_merma").select("sucursal_id").eq("fecha", fecha).returns<{ sucursal_id: string }[]>(),
    supabase.from("mermas").select("sucursal_id").eq("fecha", fecha).returns<{ sucursal_id: string }[]>(),
    supabase.from("gastos_caja_chica").select("sucursal_id, monto, comprobante").eq("fecha", fecha)
      .returns<{ sucursal_id: string; monto: number; comprobante: string }[]>(),
  ]);

  const idsTurnos = (turnos ?? []).map((t) => t.id);
  const { data: arqueos } = idsTurnos.length
    ? await supabase.from("arqueos").select("turno_id, diferencia").in("turno_id", idsTurnos).eq("momento", "cierre")
        .returns<{ turno_id: string; diferencia: number }[]>()
    : { data: [] as { turno_id: string; diferencia: number }[] };

  const sucursalDeTurno = new Map((turnos ?? []).map((t) => [t.id, t.sucursal_id]));
  const normaPorHora = new Map((normas ?? []).map((n) => [n.hora, n]));
  const horasMasa = [...normaPorHora.keys()];
  const horasRecorrido = (checklists ?? []).flatMap((c) => c.horas.map((h) => ({ checklistId: c.id, hora: h })));
  const cerrada = (h: number) => estadoFranja({ fecha, hora: h }, ahora) === "cerrada";
  const de = <T extends { sucursal_id: string }>(filas: T[] | null, id: string) => (filas ?? []).filter((f) => f.sucursal_id === id);

  return (sucursales ?? []).map((s) => {
    const ts = de(turnos, s.id);
    const ms = de(movimientos, s.id);
    const cierre = de(cierres, s.id)[0];
    const ls = de(lecturas, s.id);
    const rs = de(recorridos, s.id);
    const gs = de(gastos, s.id);
    const horasConLectura = new Set(ls.map((l) => l.hora));
    const recorridosHechos = new Set(rs.map((r) => `${r.checklist_id}|${r.hora}`));

    return {
      id: s.id,
      nombre: s.nombre,
      turnosAbiertos: ts.filter((t) => !t.cerrado_en).length,
      turnosCerrados: ts.filter((t) => t.cerrado_en).length,
      diferenciaArqueos: (arqueos ?? [])
        .filter((a) => sucursalDeTurno.get(a.turno_id) === s.id)
        .reduce((suma, a) => suma + Number(a.diferencia), 0),
      pendientes: ms.filter((m) => m.estado === "pendiente").length,
      deposito: ms.filter((m) => m.tipo === "deposito_banco" && m.estado === "confirmado")
        .reduce((suma, m) => suma + Number(m.monto), 0),
      cierre: cierre
        ? { cerradoEn: cierre.cerrado_en, ventaTotal: Number(cierre.venta_total), bovedaDiferencia: Number(cierre.boveda_diferencia) }
        : null,
      masa: {
        total: horasMasa.length,
        registradas: ls.length,
        faltantes: horasMasa.filter((h) => !horasConLectura.has(h) && cerrada(h)).length,
        fueraDeNorma: ls.filter((l) => {
          const n = normaPorHora.get(l.hora);
          return !l.en_norma || (n !== undefined && l.bolas !== bolasNorma(n, l.temp_area));
        }).length,
      },
      recorrido: {
        total: horasRecorrido.length,
        hechos: rs.length,
        faltantes: horasRecorrido.filter((x) => !recorridosHechos.has(`${x.checklistId}|${x.hora}`) && cerrada(x.hora)).length,
        conFallas: rs.filter((r) => r.recorrido_respuestas.some((x) => !x.cumple)).length,
      },
      mermasCerradas: de(cierresMerma, s.id).length > 0,
      mermas: de(mermas, s.id).length,
      gastos: gs.reduce((suma, g) => suma + Number(g.monto), 0),
      sinComprobante: gs.filter((g) => g.comprobante === "sin_comprobante").length,
    };
  });
}
```

- [ ] **Step 2: Acción para elegir sucursal**

Create `app/corporativo/actions.ts`:

```ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SUCURSAL, obtenerPerfil } from "@/lib/contexto";
import { esCorporativo } from "@/lib/roles";

/** Guarda la sucursal elegida y abre sus pantallas en solo lectura. obtenerContexto() valida que exista. */
export async function verSucursal(formData: FormData) {
  const { perfil } = await obtenerPerfil();
  if (!esCorporativo(perfil.rol)) redirect("/");
  const id = String(formData.get("sucursal_id") ?? "");
  if (!id) redirect("/corporativo");
  (await cookies()).set(COOKIE_SUCURSAL, id, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}
```

- [ ] **Step 3: Encabezado propio**

Create `app/corporativo/layout.tsx`:

```tsx
import { redirect } from "next/navigation";
import { cerrarSesion } from "@/app/login/actions";
import { obtenerPerfil } from "@/lib/contexto";
import { esCorporativo } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function LayoutCorporativo({ children }: { children: React.ReactNode }) {
  const { perfil } = await obtenerPerfil();
  if (!esCorporativo(perfil.rol)) redirect("/");
  return (
    <>
      <header className="barra">
        <span className="barra-marca">Corporativo</span>
        <span className="barra-turno">Todas las sucursales · solo lectura</span>
        <div className="barra-usuario">
          <span>{perfil.nombre}</span>
          <form action={cerrarSesion}><button type="submit">Salir</button></form>
        </div>
      </header>
      <main className="pagina">{children}</main>
    </>
  );
}
```

- [ ] **Step 4: Página**

Create `app/corporativo/page.tsx`:

```tsx
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { alertasDeSucursal, fechaElegida, ordenarSucursales, type Alerta } from "@/lib/corporativo";
import { diaOperativoMX } from "@/lib/franjas";
import { hora, pesos } from "@/lib/formato";
import { verSucursal } from "./actions";
import { datosCorporativo } from "./datos";

const clases = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ") || undefined;

export default async function Corporativo({ searchParams }: { searchParams: Promise<{ fecha?: string }> }) {
  const { fecha: pedida } = await searchParams;
  const ahora = new Date();
  const hoy = diaOperativoMX(ahora);
  const fecha = fechaElegida(pedida, hoy);
  const { supabase } = await obtenerPerfil();

  const datos = await datosCorporativo(supabase, fecha, ahora);
  const filas = ordenarSucursales(datos.map((d) => ({ ...d, alertas: alertasDeSucursal(d, fecha < hoy) })));
  const conAlertas = filas.filter((f) => f.alertas.length > 0).length;
  const venta = filas.reduce((suma, f) => suma + (f.cierre?.ventaTotal ?? 0), 0);
  const alerta = (f: { alertas: readonly Alerta[] }, a: Alerta) => f.alertas.includes(a) && "celda-alerta";

  return (
    <>
      <div className="encabezado">
        <h1>Vista general</h1>
        <p>
          {filas.length} {filas.length === 1 ? "sucursal" : "sucursales"} · {conAlertas} con algo por revisar · venta total {pesos(venta)}
        </p>
      </div>

      <form className="acciones" method="get">
        <label htmlFor="fecha" className="etiqueta">Día</label>
        <input id="fecha" name="fecha" type="date" defaultValue={fecha} max={hoy} />
        <button className="boton boton-secundario" type="submit">Ver</button>
      </form>

      <section className="seccion" aria-labelledby="t-sucursales">
        <h2 id="t-sucursales">Sucursales</h2>
        {!filas.length ? <p className="vacio">No hay sucursales.</p> : (
          <div className="tabla-contenedor">
            <table className="tabla tabla-corporativo">
              <thead>
                <tr className="grupos">
                  <th /><th colSpan={4}>Efectivo</th><th colSpan={3}>Cierre</th><th colSpan={3}>Checklists</th><th colSpan={3}>Mermas y caja chica</th><th />
                </tr>
                <tr>
                  <th>Sucursal</th>
                  <th>Turnos</th><th>Dif. arqueos</th><th>Pendientes</th><th>Depósito</th>
                  <th>Cierre</th><th>Venta</th><th>Bóveda</th>
                  <th>Masa</th><th>Recorrido</th><th>Mermas cerradas</th>
                  <th>Mermas</th><th>Gastos</th><th>Sin comprobante</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => (
                  <tr key={f.id}>
                    <th scope="row">{f.nombre}</th>
                    <td>{f.turnosAbiertos} abiertos · {f.turnosCerrados} cerrados</td>
                    <td className={clases("monto", alerta(f, "arqueos"))}>{pesos(f.diferenciaArqueos)}</td>
                    <td className={clases(alerta(f, "pendientes"))}>{f.pendientes}</td>
                    <td className={clases("monto", alerta(f, "deposito"))}>{pesos(f.deposito)}</td>
                    <td className={clases(alerta(f, "cierre"))}>{f.cierre ? hora(f.cierre.cerradoEn) : "Falta"}</td>
                    <td className="monto">{f.cierre ? pesos(f.cierre.ventaTotal) : "—"}</td>
                    <td className={clases("monto", alerta(f, "boveda"))}>{f.cierre ? pesos(f.cierre.bovedaDiferencia) : "—"}</td>
                    <td className={clases(alerta(f, "masa"))}>
                      {f.masa.registradas}/{f.masa.total}{f.masa.fueraDeNorma ? ` · ${f.masa.fueraDeNorma} fuera de norma` : ""}
                    </td>
                    <td className={clases(alerta(f, "recorrido"))}>
                      {f.recorrido.hechos}/{f.recorrido.total}{f.recorrido.conFallas ? ` · ${f.recorrido.conFallas} con fallas` : ""}
                    </td>
                    <td className={clases(alerta(f, "mermas"))}>{f.mermasCerradas ? "Sí" : "No"}</td>
                    <td>{f.mermas}</td>
                    <td className="monto">{pesos(f.gastos)}</td>
                    <td className={clases(alerta(f, "comprobantes"))}>{f.sinComprobante}</td>
                    <td>
                      <form action={verSucursal}>
                        <input type="hidden" name="sucursal_id" value={f.id} />
                        <BotonEnviar className="boton boton-secundario" pendiente="Abriendo…">Ver sucursal</BotonEnviar>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
```

- [ ] **Step 5: Pruebas, typecheck y build**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: sin errores; el build lista `ƒ /corporativo`.

- [ ] **Step 6: Commit**

```bash
git add app/corporativo
git commit -m "Corporativo: vista general de sucursales por día

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: README y verificación final

**Files:**
- Modify: `README.md` (sección antes de `## Siguiente paso: conectar con Dodo IS`)

- [ ] **Step 1: Documentar**

Insert before `## Siguiente paso: conectar con Dodo IS`:

````markdown
## Usuario corporativo

Rol de **solo consulta** para oficina central. No tiene sucursal: al entrar ve la **vista general** con todas las
sucursales del día (efectivo, cierre, checklists, mermas y caja chica), con lo que merece atención en rojo y primero.
"Ver sucursal" abre las mismas pantallas del gerente sin formularios; "Volver a corporativo" regresa a la tabla.
La base de datos rechaza cualquier escritura de este rol.

### Puesta en marcha

En Supabase → **SQL Editor**:

1. `select * from perfiles where sucursal_id is null;` debe salir vacío (si no, asigna sucursal a esos perfiles).
2. `supabase/migrations/0004_corporativo.sql`
3. `supabase/pruebas/0004_corporativo.sql`: debe terminar con el error `PRUEBAS OK — …`.
4. Crea el usuario en **Authentication → Users** y su perfil, sin sucursal:

   ```sql
   insert into perfiles (id, nombre, rol)
   select id, 'Nombre Apellido', 'corporativo' from auth.users where email = 'correo@dominio.com';
   ```

### Prueba manual

1. Entra como corporativo: debe abrir la vista general, no el inicio de una sucursal.
2. Cambia el día a ayer: el cierre y las mermas sin cerrar aparecen en rojo si faltaron.
3. "Ver sucursal": arriba dice "Viendo … · Solo lectura" y no hay formularios en Inicio, Arqueo, Movimientos,
   Caja chica, Cierre ni Checklists. "Ver foto" en Caja chica sí abre.
4. "Volver a corporativo" regresa a la tabla. "Salir" cierra la sesión.
````

- [ ] **Step 2: Verificación completa**

Run: `npm test && npm run typecheck && NEXT_PUBLIC_SUPABASE_URL=https://x.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=x npm run build`
Expected: todas las pruebas pasan; typecheck limpio; el build lista `/corporativo`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Corporativo: documentación y guion de prueba

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Publicar (fusionar a `main`) solo después de que Sebastián confirme la migración y las pruebas SQL de Task 1.
