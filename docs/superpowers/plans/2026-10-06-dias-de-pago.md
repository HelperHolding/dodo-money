# Días de pago autorizados — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pagar proveedores solo en días autorizados (viernes): sugerir el viernes de cada factura, programar en bloque y pedir motivo a un pago fuera de día.

**Architecture:** Reglas puras de calendario en `lib/compras/diasPago.ts`. La base guarda los días en `empresa.dias_pago` y los hace cumplir en `programar_pago`, `programar_pagos` (nueva) y `registrar_pago` (con motivo). Las pantallas enriquecen cada factura con su `pago_sugerido_el` antes de usar `fechaDePago`, que ahora lo toma en cuenta.

**Tech Stack:** Next.js 15, React 19, TypeScript estricto, Supabase, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-dias-de-pago-design.md`

## Global Constraints

- Días de la semana ISO: 1 = lunes … 5 = viernes … 7 = domingo; por omisión `{5}`.
- Sugerido = último día autorizado **en o antes** del vencimiento; si ya pasó, el **próximo** día autorizado desde hoy (fecha de calendario de CDMX: `hoyCalendarioMX`, `hoy_mx()` en la base).
- Programar: solo días autorizados y de hoy en adelante. Pago fuera de día: motivo obligatorio.
- Los módulos de `lib/` se importan entre sí solo como tipos; CRLF; reemplazos con función; pruebas nuevas al script `test`.
- Después de `review-package`, volver a la rama antes de arreglar.

## Review Focus

1. **Fin de semana y cambio de mes/año** al buscar el viernes anterior o el próximo (Tarea 1).
2. **Factura programada en una fecha que ya pasó** sin pagar: cae en el próximo día autorizado, marcada (Tarea 3).
3. **Varios días autorizados** (martes y viernes): sugerido y lista de próximos días (Tarea 1).
4. **Registrar pago un sábado sin motivo**: error claro, no un pago a medias (Tarea 2).
5. **Corporativo** ve "Programar pagos" sin poder programar (Tarea 4).

---

### Task 1: Calendario de pagos (`lib/compras/diasPago.ts`)

**Files:** Create `lib/compras/diasPago.ts`, `lib/compras/diasPago.test.ts`; Modify `package.json`.

**Interfaces — Produces:** `NOMBRE_DIA: Record<number, string>`, `diaIso(fecha)`, `esDiaDePago(fecha, dias)`, `proximoDiaDePago(desde, dias)`, `diaDePagoSugerido(vence, hoy, dias)`, `proximosDiasDePago(desde, dias, n)`, `textoDia(fecha)` ("Viernes 9/10"), `leerDiasPago(valores: string[]): { dias: number[] } | { error: string }`.

- [ ] **Step 1: Prueba**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { diaDePagoSugerido, esDiaDePago, leerDiasPago, proximoDiaDePago, proximosDiasDePago, textoDia } from "./diasPago.ts";

const VIERNES = [5];

test("esDiaDePago y próximo día de pago (el mismo día cuenta)", () => {
  assert.equal(esDiaDePago("2026-10-09", VIERNES), true);
  assert.equal(esDiaDePago("2026-10-10", VIERNES), false);
  assert.equal(proximoDiaDePago("2026-10-09", VIERNES), "2026-10-09");
  assert.equal(proximoDiaDePago("2026-10-10", VIERNES), "2026-10-16");
  assert.equal(proximoDiaDePago("2026-12-26", VIERNES), "2027-01-01");
});

test("diaDePagoSugerido: el viernes en o antes del vencimiento; si ya pasó, el próximo", () => {
  assert.equal(diaDePagoSugerido("2026-10-14", "2026-10-06", VIERNES), "2026-10-09");   // miércoles → viernes anterior
  assert.equal(diaDePagoSugerido("2026-10-16", "2026-10-06", VIERNES), "2026-10-16");   // vence en viernes
  assert.equal(diaDePagoSugerido("2026-10-18", "2026-10-06", VIERNES), "2026-10-16");   // domingo
  assert.equal(diaDePagoSugerido("2026-10-14", "2026-10-12", VIERNES), "2026-10-16");   // el viernes 9 ya pasó
  assert.equal(diaDePagoSugerido("2026-10-01", "2026-10-06", VIERNES), "2026-10-09");   // vencida
  assert.equal(diaDePagoSugerido("2026-10-15", "2026-10-06", [2, 5]), "2026-10-13");    // martes y viernes
});

test("próximos días de pago, texto y lectura del formulario", () => {
  assert.deepEqual(proximosDiasDePago("2026-10-06", [2, 5], 4), ["2026-10-06", "2026-10-09", "2026-10-13", "2026-10-16"]);
  assert.equal(textoDia("2026-10-09"), "Viernes 9/10");
  assert.deepEqual(leerDiasPago(["5"]), { dias: [5] });
  assert.deepEqual(leerDiasPago(["5", "2", "5"]), { dias: [2, 5] });
  assert.deepEqual(leerDiasPago([]), { error: "Elige al menos un día de pago." });
  assert.deepEqual(leerDiasPago(["8"]), { error: "Elige al menos un día de pago." });
});
```

Run: `node --experimental-strip-types --test lib/compras/diasPago.test.ts` → Expected: FAIL (no existe).

- [ ] **Step 2: Implementar**

```ts
/** Días de pago autorizados a proveedores (hoy: viernes). Días ISO: 1 = lunes … 7 = domingo. Fechas YYYY-MM-DD. */
export const NOMBRE_DIA: Record<number, string> = { 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado", 7: "Domingo" };

const sumarDias = (f: string, n: number) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const diaIso = (f: string) => ((new Date(`${f}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
export const esDiaDePago = (f: string, dias: readonly number[]) => dias.includes(diaIso(f));

/** El primer día autorizado desde `desde` (incluido). */
export function proximoDiaDePago(desde: string, dias: readonly number[]): string {
  let d = desde;
  for (let i = 0; i < 7 && !esDiaDePago(d, dias); i++) d = sumarDias(d, 1);
  return d;
}

/** Último día autorizado en o antes del vencimiento (nunca se paga tarde); si ya pasó, el próximo desde hoy. */
export function diaDePagoSugerido(vence: string, hoy: string, dias: readonly number[]): string {
  let d = vence;
  for (let i = 0; i < 7 && !esDiaDePago(d, dias); i++) d = sumarDias(d, -1);
  return d < hoy ? proximoDiaDePago(hoy, dias) : d;
}

export function proximosDiasDePago(desde: string, dias: readonly number[], n: number): string[] {
  const r: string[] = [];
  for (let d = proximoDiaDePago(desde, dias); r.length < n; d = proximoDiaDePago(sumarDias(d, 1), dias)) r.push(d);
  return r;
}

export const textoDia = (f: string) => `${NOMBRE_DIA[diaIso(f)]} ${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;

export function leerDiasPago(valores: readonly string[]): { dias: number[] } | { error: string } {
  const dias = [...new Set(valores.map(Number))].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7).sort((a, b) => a - b);
  return dias.length ? { dias } : { error: "Elige al menos un día de pago." };
}
```

Run → PASS; agregar al script `test`.

- [ ] **Step 3: Commit** — `git commit -m "feat(compras): calendario de días de pago autorizados"`

---

### Task 2: Migración 0028 y su prueba

**Files:** Create `supabase/migrations/0028_dias_de_pago.sql`, `supabase/pruebas/0028_dias_de_pago.sql`.

**Interfaces — Produces:** `empresa.dias_pago smallint[]`, `pagos.motivo_fuera_de_dia`, `es_dia_de_pago(date)`, `programar_pago` (valida), `programar_pagos(uuid[], date) returns integer`, `registrar_pago(..., p_aplicaciones jsonb, p_motivo_fuera_de_dia text default null)`.

- [ ] **Step 1: Migración**

```sql
-- Días de pago autorizados a proveedores (por omisión los viernes): programar solo en esos días y, si un pago se
-- registra otro día, pedir el motivo. Requiere 0001–0027.

alter table empresa add column dias_pago smallint[] not null default '{5}'
  check (cardinality(dias_pago) > 0 and dias_pago <@ '{1,2,3,4,5,6,7}'::smallint[]);
alter table pagos add column motivo_fuera_de_dia text;

create or replace function es_dia_de_pago(p_fecha date) returns boolean
language sql stable security definer set search_path = public as $$
  select extract(isodow from p_fecha)::smallint = any (coalesce((select dias_pago from empresa), '{5}'::smallint[]))
$$;

create or replace function programar_pago(p_factura uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if p_fecha is not null then
    if p_fecha < hoy_mx() then raise exception 'No se programa un pago en una fecha que ya pasó.'; end if;
    if not es_dia_de_pago(p_fecha) then raise exception 'El % no es día de pago autorizado.', to_char(p_fecha, 'DD/MM/YYYY'); end if;
  end if;
  update facturas set pago_programado_el = p_fecha where id = p_factura and tipo = 'ingreso' and estado in ('por_pagar', 'parcial');
  if not found then raise exception 'Solo se programa una factura por pagar'; end if;
end $$;

create or replace function programar_pagos(p_facturas uuid[], p_fecha date) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  perform exigir_admin_compras();
  if p_fecha is null then raise exception 'Elige el día de pago.'; end if;
  if p_fecha < hoy_mx() then raise exception 'No se programa un pago en una fecha que ya pasó.'; end if;
  if not es_dia_de_pago(p_fecha) then raise exception 'El % no es día de pago autorizado.', to_char(p_fecha, 'DD/MM/YYYY'); end if;
  update facturas set pago_programado_el = p_fecha
   where id = any (coalesce(p_facturas, '{}')) and tipo = 'ingreso' and estado in ('por_pagar', 'parcial');
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Elige al menos una factura por pagar.'; end if;
  return v_n;
end $$;
revoke execute on function programar_pagos(uuid[], date) from public, anon;
grant execute on function programar_pagos(uuid[], date) to authenticated;

-- registrar_pago: igual que en 0014, más el motivo cuando el pago no cae en día autorizado.
drop function registrar_pago(uuid, date, numeric, text, text, text, text, jsonb);
create or replace function registrar_pago(p_proveedor uuid, p_fecha date, p_monto numeric, p_forma text, p_cuenta text, p_referencia text,
                                          p_comprobante text, p_aplicaciones jsonb, p_motivo_fuera_de_dia text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; f facturas; v_suma numeric := 0; v_id uuid; v_cotejo text;
begin
  perform exigir_admin_compras();
  if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto del pago'; end if;
  if p_fecha is null or p_fecha > hoy_mx() then raise exception 'La fecha del pago no puede ser futura'; end if;
  if not es_dia_de_pago(p_fecha) and coalesce(trim(p_motivo_fuera_de_dia), '') = '' then
    raise exception 'El % no es día de pago autorizado: escribe el motivo del pago.', to_char(p_fecha, 'DD/MM/YYYY');
  end if;
  if jsonb_array_length(coalesce(p_aplicaciones, '[]'::jsonb)) = 0 then raise exception 'Elige al menos una factura'; end if;
  if (select count(*) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric))
     <> (select count(distinct factura_id) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric)) then
    raise exception 'Una factura viene dos veces en el pago';
  end if;

  for a in select * from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric) order by factura_id loop
    select * into f from facturas where id = a.factura_id for update;
    if not found then raise exception 'Factura no encontrada'; end if;
    if f.proveedor_id <> p_proveedor then raise exception 'Todas las facturas del pago deben ser del mismo proveedor'; end if;
    if f.tipo <> 'ingreso' or f.estado = 'cancelada' then raise exception 'La factura % no se puede pagar', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid); end if;
    if a.monto is null or a.monto <= 0 then raise exception 'Cada factura del pago debe llevar un monto mayor a cero'; end if;
    if a.monto > saldo_factura(f.id) + 0.005 then
      raise exception 'A la factura % se le aplican % pero su saldo es %', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid), a.monto, saldo_factura(f.id);
    end if;
    v_cotejo := cotejo_factura(f.id);
    if v_cotejo not in ('cuadra', 'sin_orden') and not f.revisada then
      raise exception 'La factura % no cuadra con su orden: márcala como revisada antes de pagarla', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid);
    end if;
    v_suma := v_suma + a.monto;
  end loop;
  if abs(v_suma - p_monto) > 0.005 then raise exception 'Lo aplicado (%) no suma el monto del pago (%)', v_suma, p_monto; end if;

  insert into pagos (proveedor_id, fecha, monto, forma, cuenta_origen, referencia, comprobante_ruta, motivo_fuera_de_dia)
  values (p_proveedor, p_fecha, round(p_monto, 2), p_forma::forma_pago, nullif(trim(p_cuenta), ''), nullif(trim(p_referencia), ''), nullif(p_comprobante, ''),
          nullif(trim(p_motivo_fuera_de_dia), ''))
  returning id into v_id;
  insert into pago_aplicaciones (pago_id, factura_id, monto)
  select v_id, x.factura_id, round(x.monto, 2) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric);
  perform actualizar_estado_factura(x.factura_id) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric);
  return v_id;
end $$;
```

(Antes de escribirla, comparar el cuerpo con el `registrar_pago` vigente de 0014 por si una migración posterior lo cambió: `grep -rn "function registrar_pago" supabase/migrations`.)

- [ ] **Step 2: Prueba SQL**

```sql
-- Pruebas de la migración 0028 (días de pago). Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un admin activo y un usuario corporativo activo. Si no hay datos de la empresa, usa unos de prueba (se deshace).
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_prov uuid; v_f1 uuid; v_f2 uuid; v_viernes date; v_otro date; v_pasado date; v_pago uuid; v_n int;
  v_ok text[] := '{}';
  ren jsonb := jsonb_build_array(jsonb_build_object('descripcion', 'Servicio', 'importe', 100, 'cuenta_pl', 'otros'));
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  if v_a is null or v_c is null then raise exception 'FALTAN DATOS: se necesitan un admin y un corporativo activos.'; end if;
  if not exists (select 1 from empresa) then insert into empresa (rfc, razon_social) values ('DMX010101AB1', 'Empresa de prueba'); end if;
  update empresa set dias_pago = '{5}';

  v_viernes := hoy_mx() + ((5 - extract(isodow from hoy_mx())::int + 7) % 7);           -- hoy si es viernes
  v_otro := case when extract(isodow from hoy_mx()) = 5 then hoy_mx() - 1 else hoy_mx() end;   -- hoy o ayer, no viernes
  v_pasado := hoy_mx() - ((extract(isodow from hoy_mx())::int - 5 + 7) % 7);           -- el viernes más reciente (hoy o antes)

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Proveedor 0028', 'PRUE800101AB1', '601') returning id into v_prov;
  v_f1 := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'P1',
    'renglones', ren, 'subtotal', 100, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 100));
  v_f2 := registrar_gasto_manual(jsonb_build_object('proveedor_id', v_prov, 'sucursal_id', null, 'fecha', hoy_mx(), 'folio', 'P2',
    'renglones', ren, 'subtotal', 100, 'iva', 0, 'retencion_iva', 0, 'retencion_isr', 0, 'total', 100));

  perform programar_pago(v_f1, v_viernes);
  if (select pago_programado_el from facturas where id = v_f1) <> v_viernes then raise exception 'FALLÓ: se programa en viernes'; end if;
  begin
    perform programar_pago(v_f1, v_viernes + 1);
    raise exception 'FALLÓ: el sábado no es día de pago';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%no es día de pago autorizado%' then raise exception 'FALLÓ: mensaje inesperado (sábado): %', sqlerrm; end if;
  end;
  begin
    perform programar_pago(v_f1, v_viernes - 7);
    raise exception 'FALLÓ: no se programa en el pasado';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'No se programa un pago en una fecha que ya pasó%' then raise exception 'FALLÓ: mensaje inesperado (pasado): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'programar solo en día autorizado y no en el pasado');

  v_n := programar_pagos(array[v_f1, v_f2], v_viernes + 7);
  if v_n <> 2 or (select count(*) from facturas where id in (v_f1, v_f2) and pago_programado_el = v_viernes + 7) <> 2 then raise exception 'FALLÓ: programar en bloque'; end if;
  v_ok := array_append(v_ok, 'programar en bloque');

  begin
    perform registrar_pago(v_prov, v_otro, 50, 'transferencia', null, 'x', null, jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 50)));
    raise exception 'FALLÓ: un pago fuera de día sin motivo no pasa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%escribe el motivo del pago%' then raise exception 'FALLÓ: mensaje inesperado (motivo): %', sqlerrm; end if;
  end;
  v_pago := registrar_pago(v_prov, v_otro, 50, 'transferencia', null, 'x', null,
    jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 50)), 'El proveedor corta el servicio');
  if (select motivo_fuera_de_dia from pagos where id = v_pago) <> 'El proveedor corta el servicio' then raise exception 'FALLÓ: guarda el motivo'; end if;
  v_pago := registrar_pago(v_prov, v_pasado, 50, 'transferencia', null, 'x', null, jsonb_build_array(jsonb_build_object('factura_id', v_f2, 'monto', 50)));
  if (select motivo_fuera_de_dia from pagos where id = v_pago) is not null then raise exception 'FALLÓ: en viernes no hay motivo'; end if;
  v_ok := array_append(v_ok, 'pago fuera de día pide motivo; en viernes no');

  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform programar_pagos(array[v_f2], v_viernes + 14);
    raise exception 'FALLÓ: corporativo no programa';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo solo puede consultar%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'corporativo no programa');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 3: Commit** — `git commit -m "feat(compras): migración 0028 de días de pago"`

---

### Task 3: Fecha de pago con el sugerido y agrupación por día

**Files:** Modify `lib/compras/pagos.ts`, `lib/compras/pagos.test.ts`.

**Interfaces — Produces:** `PorPagar.pago_sugerido_el?: string | null`; `fechaDePago(f)` = programada ?? sugerida ?? vencimiento; `agruparPorDiaDePago(facturas, hoy, proximo): { dia: string; total: number; facturas: (T & { programada: boolean; atrasada: boolean })[] }[]` (una programada en el pasado o una vencida cae en `proximo`).

- [ ] **Step 1: Prueba**

```ts
test("fechaDePago: programada, si no la sugerida, si no el vencimiento", () => {
  assert.equal(fechaDePago({ vence_el: "2026-10-14", pago_programado_el: null, pago_sugerido_el: "2026-10-09" }), "2026-10-09");
  assert.equal(fechaDePago({ vence_el: "2026-10-14", pago_programado_el: "2026-10-16", pago_sugerido_el: "2026-10-09" }), "2026-10-16");
  assert.equal(fechaDePago({ vence_el: "2026-10-14", pago_programado_el: null }), "2026-10-14");
});

test("agruparPorDiaDePago: por día con su total; lo atrasado cae en el próximo día de pago", () => {
  const f = (id: string, saldo: number, vence: string, programada: string | null, sugerida: string) =>
    ({ id, saldo, vence_el: vence, pago_programado_el: programada, pago_sugerido_el: sugerida, estado: "por_pagar" as const });
  const g = agruparPorDiaDePago([
    f("a", 100, "2026-10-14", null, "2026-10-09"),
    f("b", 50.5, "2026-10-16", "2026-10-16", "2026-10-16"),
    f("c", 10, "2026-10-01", null, "2026-10-09"),
    f("d", 20, "2026-10-20", "2026-10-02", "2026-10-16"),
  ], "2026-10-06", "2026-10-09");
  assert.deepEqual(g.map((x) => [x.dia, x.total, x.facturas.map((y) => `${y.id}${y.programada ? "P" : ""}${y.atrasada ? "!" : ""}`)]),
    [["2026-10-09", 130, ["a", "c!", "dP!"]], ["2026-10-16", 50.5, ["bP"]]]);
});
```

Run → FAIL.

- [ ] **Step 2: Implementar** en `lib/compras/pagos.ts`:

```ts
export type PorPagar = { id: string; saldo: number; vence_el: string; pago_programado_el: string | null; estado: EstadoFactura; pago_sugerido_el?: string | null };

/** El día en que se paga: el programado; si no, el sugerido (día de pago autorizado); si no, el vencimiento. */
export const fechaDePago = (f: { vence_el: string; pago_programado_el: string | null; pago_sugerido_el?: string | null }) =>
  f.pago_programado_el ?? f.pago_sugerido_el ?? f.vence_el;

/**
 * Facturas por día de pago, con su total. Lo programado en una fecha que ya pasó o lo vencido sin programar cae en
 * `proximo` (el próximo día de pago desde hoy), marcado como atrasado.
 */
export function agruparPorDiaDePago<T extends PorPagar>(facturas: readonly T[], hoy: string, proximo: string) {
  const grupos = new Map<string, (T & { programada: boolean; atrasada: boolean })[]>();
  for (const f of facturas) {
    const fecha = fechaDePago(f);
    const atrasada = fecha < hoy || (!f.pago_programado_el && f.vence_el < hoy);
    const dia = fecha < hoy ? proximo : fecha;
    grupos.set(dia, [...(grupos.get(dia) ?? []), { ...f, programada: !!f.pago_programado_el, atrasada }]);
  }
  return [...grupos].sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, lista]) => ({ dia, total: lista.reduce((s, x) => s + centavos(x.saldo), 0) / 100, facturas: lista }));
}
```

(Una factura vencida sin programar ya trae como sugerido el próximo día de pago — ver `diaDePagoSugerido` —, así que cae en `proximo` y se marca atrasada por su vencimiento.)

Run → PASS.

- [ ] **Step 3: Commit** — `git commit -m "feat(compras): fecha de pago sugerida y agrupación por día de pago"`

---

### Task 4: Pantallas

**Files:**
- Modify `app/compras/facturas/empresa/page.tsx`, `app/compras/facturas/acciones.ts` (`guardarEmpresa` lee los días)
- Create `app/compras/pagos/programar/page.tsx`; Modify `app/compras/pagos/acciones.ts` (+ `programarPagos`), `app/compras/pagos/page.tsx` (sugerido + enlace), `app/corporativo/page.tsx` (sugerido)
- Modify `app/compras/facturas/[id]/page.tsx` (selector de días autorizados)
- Modify `app/compras/pagos/nuevo/FormPago.tsx`, `app/compras/pagos/nuevo/page.tsx`, `app/compras/pagos/acciones.ts` (`registrarPago` manda el motivo), `app/compras/pagos/[id]/page.tsx` (muestra el motivo)
- Modify `lib/migas.ts` (+ "Programar pagos" antes de `/compras/pagos/:id`) y su prueba

**Pasos (cada uno con su verificación `tsc` + `npm test`):**

- [ ] **Datos de la empresa:** casillas "Días de pago autorizados" (Lunes … Domingo, `name="dias_pago"`, marcados los de `empresa.dias_pago`, por omisión viernes). `guardarEmpresa`: `const d = leerDiasPago(fd.getAll("dias_pago").map(String)); if ("error" in d) volver(ruta, "error", d.error);` y `upsert({ id: true, ...datos, dias_pago: d.dias })`. Agregar `dias_pago` al select de la página.
- [ ] **Días en las pantallas de pagos:** helper en `app/compras/servidor.ts`: `export async function diasDePago(supabase)` → `(await supabase.from("empresa").select("dias_pago").maybeSingle()).data?.dias_pago ?? [5]`. En `pagos/page.tsx` y `corporativo/page.tsx`, enriquecer cada factura: `pago_sugerido_el: diaDePagoSugerido(f.vence_el, hoy, dias)` antes de agrupar/resumir. En Pagos, junto a "Registrar un pago": `<Link href="/compras/pagos/programar">Programar pagos</Link>`.
- [ ] **Programar pagos** (`/compras/pagos/programar`, filtros `?proveedor=&sucursal=` iguales a Pagos): `agruparPorDiaDePago(enriquecidas, hoy, proximoDiaDePago(hoy, dias))`; por grupo un `<section>` con título `{textoDia(dia)} · {n} facturas · {pesos(total)}`; si edita, un `<form action={programarPagos}>` con casilla por factura (`name="factura" value={id}`, marcadas las no programadas), `<select name="dia">` con `proximosDiasDePago(hoy, dias, 8)` (por omisión el del grupo) y `<BotonEnviar>Programar marcadas</BotonEnviar>`; cada renglón en `lista-filas`: proveedor y folio (`nombreFactura`), "vence {fecha}", saldo y etiqueta "programada"/"sugerida"/"atrasada". Corporativo ve la lista sin casillas.
- [ ] **Acción `programarPagos`:** `rpc("programar_pagos", { p_facturas: fd.getAll("factura").map(String), p_fecha: String(fd.get("dia")) })`; mensaje "N facturas programadas para {textoDia}".
- [ ] **Factura:** el formulario de programar usa `<select name="pago_programado_el">` con `<option value="">Sin programar (sugerido: {textoDia(sugerido)})</option>` + `proximosDiasDePago(hoy, dias, 8)`; si la fecha programada actual no está en la lista, se agrega como opción.
- [ ] **Registrar pago:** `FormPago` recibe `diaDePago: boolean` (si `hoy` es día autorizado) y muestra siempre `<div className="campo"><label htmlFor="motivo_fuera_de_dia">Motivo si no es día de pago</label><input id="motivo_fuera_de_dia" name="motivo_fuera_de_dia" required={!diaDePago} /><small>{diaDePago ? "Hoy es día de pago." : `Hoy no es día de pago (${días autorizados}). Escribe por qué se paga hoy.`}</small></div>`; `registrarPago` manda `p_motivo_fuera_de_dia`. Detalle del pago: `<dt>Fuera de día de pago</dt><dd>{motivo}</dd>` si lo trae.
- [ ] **Migas:** `{ patron: "/compras/pagos/programar", texto: "Programar pagos" }` antes de `/compras/pagos/:id`; prueba: `migas("/compras/pagos/programar", admin)` → `Compras › Pagos(/compras/pagos) › Programar pagos`.
- [ ] **Commit** — `git commit -m "feat(compras): programar pagos por día autorizado; motivo para pagos fuera de día"`

---

### Task 5: Vista previa y cierre

- [ ] Página temporal con la lista agrupada de "Programar pagos" con datos de ejemplo (dos viernes, una atrasada); revisar a 1280 y 375 px; borrar.
- [ ] Revisión final de la rama (modelo más capaz); **volver a la rama** después de `review-package`.
- [ ] Sebastián corre 0028 y su prueba → "PRUEBAS OK"; fusionar (confirmando que la rama tenga todos los commits); copiar; borrar la rama.
