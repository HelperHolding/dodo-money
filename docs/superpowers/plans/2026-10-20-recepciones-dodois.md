# Recepciones de insumos desde Dodo IS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las recepciones de insumos de Dodo IS llegan solas a Compras, entrega por entrega, con proveedor, factura e importes, y se ligan a la orden (mismo proveedor) y a la factura (por folio).

**Architecture:** Traducción pura en `lib/dodois/recepciones.ts`. La base guarda con `sincronizar_recepciones_dodo` (solo `service_role`): reemplaza lo del Excel por día pasando la clasificación manual, quita entregas borradas, liga factura y orden. La sincronización de ventas (`app/ventas/dodois/sincronizar.ts`) agrega el paso de recepciones. La pantalla de Recepciones muestra los datos nuevos y liga proveedores de Dodo con la cartera.

**Tech Stack:** Next.js 15, React 19, TypeScript estricto, Supabase, `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-10-20-recepciones-dodois-design.md`

## Global Constraints

- Solo insumos (artículos consumibles con `dodo_insumo_id`); lo demás no cambia.
- Ids de Dodo (documento, insumo, proveedor) en **mayúsculas**.
- Ventanas: cron 7 días, noche 31, manual 31 (terminan hoy, CDMX).
- Folio normalizado: mayúsculas, sin nada que no sea A–Z/0–9, sin ceros a la izquierda; vacío = sin folio. Igual en TS y SQL.
- Liga a factura: mismo proveedor, factura de ingreso no cancelada, folio normalizado igual a `serie+folio` o a `folio`, emisión a ±15 días; solo si hay exactamente una.
- Precio unitario = importe sin IVA ÷ cantidad (4 decimales). Aviso ámbar si difiere más de 1 % del precio de la orden.
- Migración: `supabase/migrations/20261020200000_recepciones_dodois.sql`; prueba: `supabase/pruebas/20261020200000_recepciones_dodois.sql`.
- Módulos de `lib/` solo se importan entre sí como tipos; CRLF; pruebas nuevas al script `test` con `node ../agregar-test.cjs <archivo>`.

## Review Focus

1. **La sincronización corre sin usuario:** `ligar_recepciones_dodo` debe calcular lo pendiente sin depender de permisos del que llama (Tarea 2: `recibido_renglon_total`).
2. **Dos entregas del mismo insumo el mismo día** ligadas al mismo renglón y conciliadas: `recibido_renglon` no debe restar dos veces (Tarea 2).
3. **La importación de Excel** no debe borrar ni pisar un día con recepciones de la API (Tarea 2, prueba SQL).
4. **Un mismo insumo repetido en una entrega** no debe romper el `on conflict` (Tarea 1: se suman).
5. **Folio ambiguo** (`0002` y `002` de dos facturas): no se liga (Tarea 2, prueba SQL).

---

### Task 1: Traducción de recepciones (`lib/dodois/recepciones.ts`)

**Files:** Create `lib/dodois/recepciones.ts`, `lib/dodois/recepciones.test.ts`; Modify `package.json`.

**Interfaces — Produces:** `type RecepcionApi`, `type RecepcionCarga`, `traducirRecepciones(items: readonly RecepcionApi[], unitId: string): RecepcionCarga[]`, `folioNormalizado(t: string | null | undefined): string | null`, `DIAS_RECEPCIONES: Record<"cron" | "noche" | "manual", number>`, `ventanaRecepciones(dias: number, hoy: string): { desde: string; hasta: string; from: string; to: string }`.

- [ ] **Step 1: Prueba** — `lib/dodois/recepciones.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DIAS_RECEPCIONES, folioNormalizado, traducirRecepciones, ventanaRecepciones, type RecepcionApi } from "./recepciones.ts";

const UNIDAD = "11f187558e757f53b0570d952420b810";
const base: RecepcionApi = {
  unitId: UNIDAD, stockItemId: "11f1956aaa89ab11296f1a5942e37170", stockItemName: "Azúcar", quantity: 6, measurementUnit: "Kilogram",
  totalPriceWithoutVat: 158.7, totalPriceWithVat: 184.09, vatRate: 16, incomingStockOrderId: "01a0f928e25177bfa7bb06699e173c4e",
  supplierId: "11f1ae3f0c877591842b32ad820bb779", suppliedAtLocal: "2026-10-01T13:21:45", invoiceNumber: "aa1654842",
  invoiceDate: "2026-10-01", incomingStockOrderModifiedAt: "2026-10-01T20:30:03",
};

test("traducirRecepciones: ids en mayúsculas, unidad, fecha local, precio unitario sin IVA e importes", () => {
  const [r] = traducirRecepciones([base], UNIDAD);
  assert.deepEqual(r, {
    dodo_documento_id: "01A0F928E25177BFA7BB06699E173C4E", dodo_insumo_id: "11F1956AAA89AB11296F1A5942E37170", material: "Azúcar", unidad: "kg",
    fecha: "2026-10-01", recibido_en: "2026-10-01T13:21:45", cantidad: 6, precio: 26.45, importe_sin_iva: 158.7, importe_con_iva: 184.09, tasa_iva: 16,
    dodo_proveedor_id: "11F1AE3F0C877591842B32AD820BB779", factura_texto: "aa1654842", factura_fecha: "2026-10-01", modificado_dodo: "2026-10-01T20:30:03",
  });
});

test("mismo insumo dos veces en una entrega: se suma; otra unidad o cantidad cero: se omite", () => {
  const r = traducirRecepciones([
    base,
    { ...base, quantity: 4, totalPriceWithoutVat: 105.8, totalPriceWithVat: 122.73 },
    { ...base, unitId: "otra" },
    { ...base, incomingStockOrderId: "otro-doc", quantity: 0 },
    { ...base, incomingStockOrderId: "doc-pza", stockItemId: "caja", stockItemName: "Caja 35", measurementUnit: "Quantity", quantity: 100, totalPriceWithoutVat: 450, totalPriceWithVat: 450, vatRate: 0, invoiceNumber: "  ", supplierId: null },
  ], UNIDAD);
  assert.equal(r.length, 2);
  assert.deepEqual([r[0].cantidad, r[0].importe_sin_iva, r[0].importe_con_iva, r[0].precio], [10, 264.5, 306.82, 26.45]);
  assert.deepEqual([r[1].unidad, r[1].precio, r[1].tasa_iva, r[1].factura_texto, r[1].dodo_proveedor_id], ["pza", 4.5, 0, null, null]);
});

test("folio normalizado", () => {
  assert.equal(folioNormalizado("Aa1657629"), "AA1657629");
  assert.equal(folioNormalizado(" aa-165 7629 "), "AA1657629");
  assert.equal(folioNormalizado("0002"), "2");
  assert.equal(folioNormalizado("000"), "0");
  assert.equal(folioNormalizado("30 de septiembre 2026"), "30DESEPTIEMBRE2026");
  assert.equal(folioNormalizado("  "), null);
  assert.equal(folioNormalizado(null), null);
});

test("ventanas: 7 días con el cron, 31 en la noche y a mano; terminan hoy", () => {
  assert.deepEqual(DIAS_RECEPCIONES, { cron: 7, noche: 31, manual: 31 });
  assert.deepEqual(ventanaRecepciones(7, "2026-10-20"), { desde: "2026-10-14", hasta: "2026-10-20", from: "2026-10-14T00:00:00", to: "2026-10-21T00:00:00" });
  assert.deepEqual(ventanaRecepciones(31, "2026-10-20"), { desde: "2026-09-20", hasta: "2026-10-20", from: "2026-09-20T00:00:00", to: "2026-10-21T00:00:00" });
});
```

Agrega la prueba: `node ../agregar-test.cjs lib/dodois/recepciones.test.ts`.

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: FAIL (no existe `recepciones.ts`).

- [ ] **Step 3: Implementación** — `lib/dodois/recepciones.ts`:

```ts
/**
 * Recepciones de insumos de la API de Dodo IS → filas de `recepciones_dodo` (una por entrega e insumo). Puro, sin red.
 * Ids en mayúsculas (como el Excel); si un insumo viene dos veces en una entrega, se suma.
 */
export type RecepcionApi = {
  unitId: string; stockItemId: string; stockItemName: string; quantity: number; measurementUnit: string;
  totalPriceWithoutVat: number; totalPriceWithVat: number; vatRate: number | null; incomingStockOrderId: string;
  supplierId: string | null; suppliedAtLocal: string; invoiceNumber: string | null; invoiceDate: string | null;
  incomingStockOrderModifiedAt: string | null;
};
export type RecepcionCarga = {
  dodo_documento_id: string; dodo_insumo_id: string; material: string; unidad: string; fecha: string; recibido_en: string;
  cantidad: number; precio: number; importe_sin_iva: number; importe_con_iva: number; tasa_iva: number | null;
  dodo_proveedor_id: string | null; factura_texto: string | null; factura_fecha: string | null; modificado_dodo: string | null;
};

const UNIDAD: Record<string, string> = { kilogram: "kg", gram: "g", quantity: "pza", liter: "l", meter: "m" };
const centavos = (n: number) => Math.round(n * 100) / 100;

export function traducirRecepciones(items: readonly RecepcionApi[], unitId: string): RecepcionCarga[] {
  const porClave = new Map<string, RecepcionCarga>();
  for (const x of items) {
    if (x.unitId !== unitId || !(Number(x.quantity) > 0)) continue;
    const doc = x.incomingStockOrderId.toUpperCase(), insumo = x.stockItemId.toUpperCase();
    const previo = porClave.get(`${doc}|${insumo}`);
    const cantidad = Math.round(((previo?.cantidad ?? 0) + Number(x.quantity)) * 1000) / 1000;
    const sin = centavos((previo?.importe_sin_iva ?? 0) + Number(x.totalPriceWithoutVat ?? 0));
    const con = centavos((previo?.importe_con_iva ?? 0) + Number(x.totalPriceWithVat ?? 0));
    porClave.set(`${doc}|${insumo}`, {
      dodo_documento_id: doc, dodo_insumo_id: insumo, material: x.stockItemName,
      unidad: UNIDAD[(x.measurementUnit ?? "").toLowerCase()] ?? x.measurementUnit, fecha: x.suppliedAtLocal.slice(0, 10),
      recibido_en: x.suppliedAtLocal.slice(0, 19), cantidad, precio: Math.round((sin / cantidad) * 10_000) / 10_000,
      importe_sin_iva: sin, importe_con_iva: con, tasa_iva: x.vatRate ?? null,
      dodo_proveedor_id: x.supplierId ? x.supplierId.toUpperCase() : null, factura_texto: x.invoiceNumber?.trim() || null,
      factura_fecha: x.invoiceDate?.slice(0, 10) || null, modificado_dodo: x.incomingStockOrderModifiedAt?.slice(0, 19) || null,
    });
  }
  return [...porClave.values()];
}

/** Para comparar con el folio de la factura: mayúsculas, solo letras y números, sin ceros a la izquierda. */
export const folioNormalizado = (t: string | null | undefined) =>
  (t ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+(?=.)/, "") || null;

export const DIAS_RECEPCIONES = { cron: 7, noche: 31, manual: 31 } as const;

const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Últimos `dias` días terminando hoy (CDMX), con el `from`/`to` que espera la API. */
export function ventanaRecepciones(dias: number, hoy: string) {
  const desde = sumarDias(hoy, -(dias - 1));
  return { desde, hasta: hoy, from: `${desde}T00:00:00`, to: `${sumarDias(hoy, 1)}T00:00:00` };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` y `node node_modules/typescript/bin/tsc --noEmit`
Expected: todas pasan; sin errores.

- [ ] **Step 5: Commit**

```bash
git add lib/dodois package.json
git commit -m "feat(dodois): traducción de recepciones de insumos"
```

---

### Task 2: Migración y prueba SQL

**Files:** Create `supabase/migrations/20261020200000_recepciones_dodois.sql`, `supabase/pruebas/20261020200000_recepciones_dodois.sql`.

**Interfaces — Produces:** `proveedores.dodois_supplier_id`; columnas nuevas de `recepciones_dodo` (`fuente`, `dodo_documento_id`, `dodo_proveedor_id`, `proveedor_id`, `recibido_en`, `factura_texto`, `factura_fecha`, `importe_sin_iva`, `importe_con_iva`, `tasa_iva`, `factura_id`, `modificado_dodo`); `dodois_sincronizaciones.tipo`; `folio_normalizado(text)`; `recibido_renglon_total(uuid)`; `ligar_facturas_recepciones()`; `sincronizar_recepciones_dodo(p_sucursal uuid, p_desde date, p_hasta date, p_renglones jsonb) → jsonb {renglones, ligadas, pendientes, sin_proveedor, con_factura, varias}` (service_role); `ligar_proveedor_dodois(p_proveedor uuid, p_supplier text) → integer` (admin de compras).

- [ ] **Step 1: Prueba SQL** — `supabase/pruebas/20261020200000_recepciones_dodois.sql`:

```sql
-- Pruebas de recepciones de insumos desde Dodo IS. Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un admin activo y una sucursal de la razón social principal. Usan febrero de 2020 (sin recepciones).
--   · "PRUEBAS OK — …" → todo bien (no deja cambios).   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_s uuid; v_rfc text; v_p1 uuid; v_p2 uuid; v_art uuid; v_o1 uuid; v_o2 uuid; v_r1 uuid; v_r2 uuid; v_imp uuid; v_f1 uuid; v_res jsonb; v_ok text[] := '{}';
  servidor text := json_build_object('role', 'service_role')::text;
  ins text := 'AAAA0000000000000000000000000001';
  fila jsonb := jsonb_build_object('dodo_insumo_id', 'AAAA0000000000000000000000000001', 'material', 'Insumo prueba', 'unidad', 'kg',
    'recibido_en', '2020-02-03T10:00:00', 'precio', 26.45, 'tasa_iva', 16, 'dodo_proveedor_id', 'S1PRUEBA', 'factura_fecha', null, 'modificado_dodo', null);
  r1 jsonb; r2 jsonb; r3 jsonb;
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select rfc into v_rfc from razones_sociales where principal;
  select id into v_s from sucursales s where razon_admite_sucursal(v_rfc, s.id) order by nombre limit 1;
  if v_a is null or v_s is null then raise exception 'FALTAN DATOS: se necesitan un admin y una sucursal de la razón social principal.'; end if;
  if exists (select 1 from recepciones_dodo where fecha between '2020-02-01' and '2020-02-29') then raise exception 'FALTAN DATOS: febrero de 2020 ya tiene recepciones.'; end if;
  r1 := fila || jsonb_build_object('dodo_documento_id', 'D1', 'fecha', '2020-02-03', 'cantidad', 6, 'importe_sin_iva', 158.7, 'importe_con_iva', 184.09, 'factura_texto', 'Aa1654842');
  r2 := fila || jsonb_build_object('dodo_documento_id', 'D2', 'fecha', '2020-02-04', 'cantidad', 2, 'importe_sin_iva', 52.9, 'importe_con_iva', 61.36, 'factura_texto', '0002');
  r3 := fila || jsonb_build_object('dodo_documento_id', 'D3', 'fecha', '2020-02-04', 'cantidad', 3, 'importe_sin_iva', 79.35, 'importe_con_iva', 92.05, 'factura_texto', null);

  -- Datos: dos proveedores con orden confirmada del mismo insumo (la de P2 es más antigua).
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Proveedor recepciones 1', 'PRUE800101AB4', '601') returning id into v_p1;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Proveedor recepciones 2', 'PRUE800101AB5', '601') returning id into v_p2;
  insert into articulos (nombre, unidad, tipo, dodo_insumo_id) values ('Insumo prueba recepciones', 'kg', 'consumible', ins) returning id into v_art;
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_p2, v_s) returning id into v_o2;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_o2, v_art, 'Insumo', 10, 26.45, '16');
  update ordenes_compra set estado = 'confirmada', confirmada_en = '2020-01-31 12:00-06' where id = v_o2;
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_p1, v_s) returning id into v_o1;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_o1, v_art, 'Insumo', 10, 26.45, '16') returning id into v_r1;
  update ordenes_compra set estado = 'confirmada', confirmada_en = '2020-02-01 12:00-06' where id = v_o1;
  insert into facturas (origen, uuid, serie, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('cfdi', 'PRUEBA-REC-F1', 'AA', '1654842', 'ingreso', '2020-02-03', 'PRUE800101AB4', 'Proveedor recepciones 1', '601', v_rfc, 158.7, 184.09, v_p1, '2020-02-03', 'prueba-rec-1.xml')
  returning id into v_f1;
  insert into facturas (origen, uuid, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, subtotal, total, proveedor_id, vence_el, xml_ruta)
  values ('cfdi', 'PRUEBA-REC-F2', '2', 'ingreso', '2020-02-04', 'PRUE800101AB4', 'Proveedor recepciones 1', '601', v_rfc, 10, 10, v_p1, '2020-02-04', 'prueba-rec-2.xml'),
         ('cfdi', 'PRUEBA-REC-F3', '002', 'ingreso', '2020-02-05', 'PRUE800101AB4', 'Proveedor recepciones 1', '601', v_rfc, 10, 10, v_p1, '2020-02-05', 'prueba-rec-3.xml');

  -- Lo del Excel: el 3 marcado a mano como traspaso; el 4 como compra sin orden.
  insert into importaciones_recepciones (archivo, renglones) values ('prueba.xlsx', 2) returning id into v_imp;
  insert into recepciones_dodo (sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id, clasificacion)
  values (v_s, ins, 'Insumo prueba', 'kg', '2020-02-03', 6, 26.45, v_imp, 'traspaso'), (v_s, ins, 'Insumo prueba', 'kg', '2020-02-04', 5, 26.45, v_imp, 'sin_orden');

  -- Solo el servidor sincroniza.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  begin
    perform sincronizar_recepciones_dodo(v_s, '2020-02-03', '2020-02-05', jsonb_build_array(r1, r2, r3));
    raise exception 'FALLÓ: un usuario no sincroniza';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo el servidor sincroniza recepciones.' then raise exception 'FALLÓ: mensaje inesperado (usuario): %', sqlerrm; end if;
  end;

  perform set_config('request.jwt.claims', servidor, true);
  v_res := sincronizar_recepciones_dodo(v_s, '2020-02-03', '2020-02-05', jsonb_build_array(r1, r2, r3));
  if exists (select 1 from recepciones_dodo where sucursal_id = v_s and fuente = 'excel' and fecha in ('2020-02-03', '2020-02-04')) then raise exception 'FALLÓ: lo del Excel de esos días se reemplaza'; end if;
  if (select count(*) from recepciones_dodo where sucursal_id = v_s and fuente = 'api' and fecha between '2020-02-03' and '2020-02-05') <> 3 then raise exception 'FALLÓ: se guardan 3 entregas'; end if;
  if (select clasificacion from recepciones_dodo where dodo_documento_id = 'D1') <> 'traspaso' then raise exception 'FALLÓ: con una sola entrega pasa la clasificación manual'; end if;
  if (select clasificacion from recepciones_dodo where dodo_documento_id = 'D2') <> 'pendiente' or (v_res->>'varias')::int <> 1 then raise exception 'FALLÓ: con varias entregas queda pendiente y se avisa (%)', v_res; end if;
  if (v_res->>'sin_proveedor')::int <> 3 then raise exception 'FALLÓ: sin proveedor ligado (%)', v_res; end if;
  perform sincronizar_recepciones_dodo(v_s, '2020-02-03', '2020-02-05', jsonb_build_array(r1, r2, r3));
  if (select count(*) from recepciones_dodo where sucursal_id = v_s and fuente = 'api') <> 3 then raise exception 'FALLÓ: volver a sincronizar no duplica'; end if;
  v_ok := array_append(v_ok, 'solo servidor; reemplaza el Excel pasando la clasificación; varias entregas quedan pendientes; sin duplicar');

  -- Ligar el proveedor: liga factura por folio (no la ambigua) y orden del mismo proveedor (no la más antigua de otro).
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  if ligar_proveedor_dodois(v_p1, 's1prueba') <> 3 then raise exception 'FALLÓ: ligar el proveedor actualiza sus 3 recepciones'; end if;
  if (select factura_id from recepciones_dodo where dodo_documento_id = 'D1') is distinct from v_f1 then raise exception 'FALLÓ: liga la factura por folio'; end if;
  if (select factura_id from recepciones_dodo where dodo_documento_id = 'D2') is not null then raise exception 'FALLÓ: un folio ambiguo no se liga'; end if;
  if (select orden_renglon_id from recepciones_dodo where dodo_documento_id = 'D2') is distinct from v_r1 then raise exception 'FALLÓ: liga la orden del mismo proveedor'; end if;
  begin
    perform ligar_proveedor_dodois(v_p2, 'S1PRUEBA');
    raise exception 'FALLÓ: un proveedor de Dodo no se liga a dos de la cartera';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Ese proveedor de Dodo IS ya está ligado a otro proveedor.' then raise exception 'FALLÓ: mensaje inesperado (doble): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'liga factura por folio sin ambigüedad y orden del mismo proveedor');

  -- Entrega borrada en Dodo: se quita.
  perform set_config('request.jwt.claims', servidor, true);
  perform sincronizar_recepciones_dodo(v_s, '2020-02-03', '2020-02-05', jsonb_build_array(r1, r2));
  if exists (select 1 from recepciones_dodo where dodo_documento_id = 'D3') then raise exception 'FALLÓ: la entrega que ya no viene se quita'; end if;
  v_ok := array_append(v_ok, 'quita entregas borradas');

  -- El Excel no pisa un día con API; un día sin API sí entra.
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform importar_recepciones_dodo('prueba2.xlsx',
    jsonb_build_array(jsonb_build_object('sucursal_id', v_s, 'fecha', '2020-02-03'), jsonb_build_object('sucursal_id', v_s, 'fecha', '2020-02-06')),
    jsonb_build_array(jsonb_build_object('sucursal_id', v_s, 'dodo_insumo_id', ins, 'material', 'Insumo prueba', 'unidad', 'kg', 'fecha', '2020-02-03', 'cantidad', 9, 'precio', 1),
                      jsonb_build_object('sucursal_id', v_s, 'dodo_insumo_id', ins, 'material', 'Insumo prueba', 'unidad', 'kg', 'fecha', '2020-02-06', 'cantidad', 1, 'precio', 1)));
  if exists (select 1 from recepciones_dodo where sucursal_id = v_s and fuente = 'excel' and fecha = '2020-02-03')
     or not exists (select 1 from recepciones_dodo where dodo_documento_id = 'D1') then raise exception 'FALLÓ: el Excel no pisa un día con API'; end if;
  if not exists (select 1 from recepciones_dodo where sucursal_id = v_s and fuente = 'excel' and fecha = '2020-02-06') then raise exception 'FALLÓ: un día sin API sí entra del Excel'; end if;
  v_ok := array_append(v_ok, 'el Excel respeta los días de la API');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 2: Migración** — `supabase/migrations/20261020200000_recepciones_dodois.sql`:

```sql
-- Recepciones de insumos desde la API de Dodo IS: una fila por entrega e insumo, con proveedor, número de factura e
-- importes; liga a la orden del mismo proveedor y a la factura por folio. Reemplaza lo importado del Excel por día.
-- Requiere 20261020180000_sincronizacion_dodois.sql.

alter table proveedores add column if not exists dodois_supplier_id text unique;

alter table recepciones_dodo
  add column fuente text not null default 'excel' check (fuente in ('excel', 'api')),
  add column dodo_documento_id text,
  add column dodo_proveedor_id text,
  add column proveedor_id uuid references proveedores(id),
  add column recibido_en timestamp,
  add column factura_texto text,
  add column factura_fecha date,
  add column importe_sin_iva numeric(14,2),
  add column importe_con_iva numeric(14,2),
  add column tasa_iva numeric(5,2),
  add column factura_id uuid references facturas(id),
  add column modificado_dodo timestamp,
  alter column importacion_id drop not null;
alter table recepciones_dodo add constraint recepciones_dodo_origen_completo
  check ((fuente = 'excel' and importacion_id is not null) or (fuente = 'api' and dodo_documento_id is not null and importacion_id is null));
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'recepciones_dodo'::regclass and contype = 'u' loop
    execute format('alter table recepciones_dodo drop constraint %I', c);
  end loop;
end $$;
create unique index recepciones_dodo_excel_dia on recepciones_dodo (sucursal_id, dodo_insumo_id, fecha) where fuente = 'excel';
create unique index recepciones_dodo_api_entrega on recepciones_dodo (dodo_documento_id, dodo_insumo_id) where fuente = 'api';
create index recepciones_dodo_factura on recepciones_dodo (factura_id);
create index recepciones_dodo_proveedor_dodo on recepciones_dodo (dodo_proveedor_id) where proveedor_id is null;

alter table dodois_sincronizaciones add column if not exists tipo text not null default 'ventas' check (tipo in ('ventas', 'recepciones'));

create or replace function folio_normalizado(p text) returns text
language sql immutable as $$
  select nullif(regexp_replace(regexp_replace(upper(coalesce(p, '')), '[^A-Z0-9]', '', 'g'), '^0+(?=.)', ''), '')
$$;

-- Lo recibido de un renglón sin revisar permisos (la usa la base; la sincronización corre sin usuario). Las entregas de
-- Dodo del mismo día se suman antes de restar lo conciliado, para no restarlo dos veces.
create or replace function recibido_renglon_total(p_renglon uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cantidad) from recepciones_dodo where orden_renglon_id = p_renglon), 0)
       + coalesce((select sum(cantidad) from recepciones_app where orden_renglon_id = p_renglon and anulada_en is null), 0)
       - coalesce((select sum(least(c.cantidad, d.cantidad)) from
           (select dodo_sucursal, dodo_insumo, dodo_fecha, sum(cantidad) cantidad from recepciones_app
             where orden_renglon_id = p_renglon and anulada_en is null and conciliada_en is not null group by 1, 2, 3) c
           join (select sucursal_id, dodo_insumo_id, fecha, sum(cantidad) cantidad from recepciones_dodo
                  where orden_renglon_id = p_renglon group by 1, 2, 3) d
             on d.sucursal_id = c.dodo_sucursal and d.dodo_insumo_id = c.dodo_insumo and d.fecha = c.dodo_fecha), 0)
$$;
revoke all on function recibido_renglon_total(uuid) from public, anon, authenticated;

create or replace function recibido_renglon(p_renglon uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.orden_renglones r where r.id = p_renglon and public.puede_consultar_recepcion(r.orden_id))
              then public.recibido_renglon_total(p_renglon) else null end
$$;

-- Liga a la orden: igual que antes, y las filas de la API exigen el mismo proveedor de la orden.
create or replace function ligar_recepciones_dodo() returns void
language plpgsql security definer set search_path = public as $$
declare rec record; v_renglon uuid;
begin
  update public.recepciones_dodo d set orden_renglon_id = c.renglon, clasificacion = 'orden' from
   (select dodo_sucursal, dodo_insumo, dodo_fecha, (array_agg(distinct orden_renglon_id))[1] renglon from public.recepciones_app
     where conciliada_en is not null and anulada_en is null group by dodo_sucursal, dodo_insumo, dodo_fecha having count(distinct orden_renglon_id) = 1) c
   where d.clasificacion = 'pendiente' and d.sucursal_id = c.dodo_sucursal and d.dodo_insumo_id = c.dodo_insumo and d.fecha = c.dodo_fecha;
  for rec in select * from recepciones_dodo where clasificacion = 'pendiente'
      and (fuente = 'excel' or proveedor_id is not null)
      and not exists (select 1 from public.recepciones_app m join public.orden_renglones r on r.id = m.orden_renglon_id
                       join public.ordenes_compra o on o.id = r.orden_id join public.articulos a on a.id = r.articulo_id
                      where m.anulada_en is null and m.fecha = recepciones_dodo.fecha and o.sucursal_id = recepciones_dodo.sucursal_id
                        and a.dodo_insumo_id = recepciones_dodo.dodo_insumo_id)
      order by fecha, id loop
    select r.id into v_renglon
      from orden_renglones r join ordenes_compra o on o.id = r.orden_id join articulos a on a.id = r.articulo_id
     where o.estado = 'confirmada' and o.sucursal_id = rec.sucursal_id and a.dodo_insumo_id = rec.dodo_insumo_id
       and (rec.fuente = 'excel' or o.proveedor_id = rec.proveedor_id)
       and rec.fecha between (o.confirmada_en at time zone 'America/Mexico_City')::date and (o.confirmada_en at time zone 'America/Mexico_City')::date + 7
       and r.cantidad > recibido_renglon_total(r.id)
     order by o.confirmada_en, r.creado_en, r.id
     limit 1;
    if v_renglon is not null then
      update recepciones_dodo set orden_renglon_id = v_renglon, clasificacion = 'orden' where id = rec.id;
    end if;
  end loop;
end $$;

-- Liga a la factura por folio: mismo proveedor, ±15 días, y solo si hay exactamente una.
create or replace function ligar_facturas_recepciones() returns void
language plpgsql security definer set search_path = public as $$
begin
  update recepciones_dodo d set factura_id = m.factura_id
    from (select d2.id, min(f.id::text)::uuid factura_id
            from recepciones_dodo d2
            join facturas f on f.proveedor_id = d2.proveedor_id and f.tipo = 'ingreso' and f.estado <> 'cancelada'
             and folio_normalizado(d2.factura_texto) in (folio_normalizado(coalesce(f.serie, '') || coalesce(f.folio, '')), folio_normalizado(f.folio))
             and f.fecha_emision between coalesce(d2.factura_fecha, d2.fecha) - 15 and coalesce(d2.factura_fecha, d2.fecha) + 15
           where d2.fuente = 'api' and d2.factura_id is null and d2.proveedor_id is not null
           group by d2.id having count(distinct f.id) = 1) m
   where d.id = m.id;
end $$;

create or replace function sincronizar_recepciones_dodo(p_sucursal uuid, p_desde date, p_hasta date, p_renglones jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_varias integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Solo el servidor sincroniza recepciones.'; end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then raise exception 'Rango de fechas inválido.'; end if;
  perform pg_advisory_xact_lock(hashtext('recepciones|' || p_sucursal::text));

  drop table if exists tmp_rec, tmp_excel;
  create temp table tmp_rec on commit drop as
    select * from jsonb_to_recordset(coalesce(p_renglones, '[]')) as x(
      dodo_documento_id text, dodo_insumo_id text, material text, unidad text, fecha date, recibido_en timestamp, cantidad numeric,
      precio numeric, importe_sin_iva numeric, importe_con_iva numeric, tasa_iva numeric, dodo_proveedor_id text, factura_texto text,
      factura_fecha date, modificado_dodo timestamp)
    where x.fecha between p_desde and p_hasta and x.cantidad > 0;

  -- Días que traen recepciones de la API: lo del Excel se reemplaza, guardando su clasificación para pasarla.
  create temp table tmp_excel on commit drop as
    select dodo_insumo_id, fecha, clasificacion, orden_renglon_id from recepciones_dodo
     where fuente = 'excel' and sucursal_id = p_sucursal and fecha in (select distinct fecha from tmp_rec);
  delete from recepciones_dodo where fuente = 'excel' and sucursal_id = p_sucursal and fecha in (select distinct fecha from tmp_rec);

  -- Entregas de la ventana que ya no vienen (borradas en Dodo IS).
  delete from recepciones_dodo d where d.fuente = 'api' and d.sucursal_id = p_sucursal and d.fecha between p_desde and p_hasta
     and not exists (select 1 from tmp_rec t where t.dodo_documento_id = d.dodo_documento_id and t.dodo_insumo_id = d.dodo_insumo_id);

  insert into recepciones_dodo (sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id, fuente, dodo_documento_id,
                                dodo_proveedor_id, proveedor_id, recibido_en, factura_texto, factura_fecha, importe_sin_iva, importe_con_iva, tasa_iva, modificado_dodo)
  select p_sucursal, t.dodo_insumo_id, t.material, t.unidad, t.fecha, t.cantidad, coalesce(t.precio, 0), null, 'api', t.dodo_documento_id,
         t.dodo_proveedor_id, (select p.id from proveedores p where p.dodois_supplier_id = t.dodo_proveedor_id), t.recibido_en, t.factura_texto,
         t.factura_fecha, t.importe_sin_iva, t.importe_con_iva, t.tasa_iva, t.modificado_dodo
    from tmp_rec t
  on conflict (dodo_documento_id, dodo_insumo_id) where fuente = 'api' do update set
    material = excluded.material, unidad = excluded.unidad, fecha = excluded.fecha, cantidad = excluded.cantidad, precio = excluded.precio,
    dodo_proveedor_id = excluded.dodo_proveedor_id, proveedor_id = excluded.proveedor_id, recibido_en = excluded.recibido_en,
    factura_texto = excluded.factura_texto, factura_fecha = excluded.factura_fecha, importe_sin_iva = excluded.importe_sin_iva,
    importe_con_iva = excluded.importe_con_iva, tasa_iva = excluded.tasa_iva, modificado_dodo = excluded.modificado_dodo,
    factura_id = case when recepciones_dodo.factura_texto is distinct from excluded.factura_texto then null else recepciones_dodo.factura_id end;

  -- Clasificación manual del Excel: pasa si ese día hubo una sola entrega de ese insumo; si hubo varias, se avisa.
  update recepciones_dodo d set clasificacion = e.clasificacion, orden_renglon_id = e.orden_renglon_id
    from tmp_excel e
   where d.fuente = 'api' and d.sucursal_id = p_sucursal and d.dodo_insumo_id = e.dodo_insumo_id and d.fecha = e.fecha
     and d.clasificacion = 'pendiente' and e.clasificacion <> 'pendiente'
     and (select count(*) from recepciones_dodo x where x.fuente = 'api' and x.sucursal_id = p_sucursal and x.dodo_insumo_id = e.dodo_insumo_id and x.fecha = e.fecha) = 1;
  select count(*) into v_varias from tmp_excel e
   where e.clasificacion <> 'pendiente'
     and (select count(*) from recepciones_dodo x where x.fuente = 'api' and x.sucursal_id = p_sucursal and x.dodo_insumo_id = e.dodo_insumo_id and x.fecha = e.fecha) > 1;

  perform ligar_facturas_recepciones();
  perform ligar_recepciones_dodo();

  return (select jsonb_build_object(
    'renglones', (select count(*) from tmp_rec),
    'ligadas', count(*) filter (where clasificacion = 'orden'),
    'pendientes', count(*) filter (where clasificacion = 'pendiente'),
    'sin_proveedor', count(*) filter (where proveedor_id is null),
    'con_factura', count(*) filter (where factura_id is not null),
    'varias', v_varias)
    from recepciones_dodo where fuente = 'api' and sucursal_id = p_sucursal and fecha between p_desde and p_hasta);
end $$;

create or replace function ligar_proveedor_dodois(p_proveedor uuid, p_supplier text) returns integer
language plpgsql security definer set search_path = public as $$
declare v_supplier text := upper(nullif(trim(p_supplier), '')); v_n integer;
begin
  perform exigir_admin_compras();
  if v_supplier is null then raise exception 'Falta el proveedor de Dodo IS.'; end if;
  update proveedores set dodois_supplier_id = v_supplier where id = p_proveedor;
  if not found then raise exception 'Proveedor no encontrado.'; end if;
  update recepciones_dodo set proveedor_id = p_proveedor where dodo_proveedor_id = v_supplier and fuente = 'api';
  get diagnostics v_n = row_count;
  perform ligar_facturas_recepciones();
  perform ligar_recepciones_dodo();
  return v_n;
exception when unique_violation then
  raise exception 'Ese proveedor de Dodo IS ya está ligado a otro proveedor.';
end $$;

-- La importación del Excel ya no toca los días que tienen recepciones de la API.
create or replace function importar_recepciones_dodo(p_archivo text, p_dias jsonb, p_filas jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_imp uuid; v_ligadas int; v_pendientes int;
begin
  perform exigir_admin_compras();
  insert into importaciones_recepciones (archivo, renglones) values (p_archivo, jsonb_array_length(p_filas)) returning id into v_imp;
  delete from recepciones_dodo r
   using jsonb_to_recordset(p_dias) d(sucursal_id uuid, fecha date)
   where r.fuente = 'excel' and r.sucursal_id = d.sucursal_id and r.fecha = d.fecha
     and not exists (select 1 from recepciones_dodo a where a.fuente = 'api' and a.sucursal_id = d.sucursal_id and a.fecha = d.fecha);
  insert into recepciones_dodo (sucursal_id, dodo_insumo_id, material, unidad, fecha, cantidad, precio, importacion_id)
  select f.sucursal_id, upper(f.dodo_insumo_id), f.material, f.unidad, f.fecha, f.cantidad, coalesce(f.precio, 0), v_imp
    from jsonb_to_recordset(p_filas) f(sucursal_id uuid, dodo_insumo_id text, material text, unidad text, fecha date, cantidad numeric, precio numeric)
   where not exists (select 1 from recepciones_dodo a where a.fuente = 'api' and a.sucursal_id = f.sucursal_id and a.fecha = f.fecha);
  perform ligar_recepciones_dodo();
  select count(*) filter (where clasificacion = 'orden'), count(*) filter (where clasificacion = 'pendiente')
    into v_ligadas, v_pendientes
    from recepciones_dodo where importacion_id = v_imp;
  return jsonb_build_object('recepciones', (select count(*) from recepciones_dodo where importacion_id = v_imp), 'ligadas', v_ligadas, 'pendientes', v_pendientes);
end $$;

revoke execute on function ligar_facturas_recepciones(), sincronizar_recepciones_dodo(uuid, date, date, jsonb) from public, anon, authenticated;
grant execute on function sincronizar_recepciones_dodo(uuid, date, date, jsonb) to service_role;
revoke execute on function ligar_proveedor_dodois(uuid, text) from public, anon;
grant execute on function ligar_proveedor_dodois(uuid, text) to authenticated;
```

- [ ] **Step 3: Revisar**

Run: `grep -n "raise" supabase/migrations/20261020200000_recepciones_dodois.sql supabase/pruebas/20261020200000_recepciones_dodois.sql`
Expected: cada `%` con su parámetro.

- [ ] **Step 4: Commit**

```bash
git add supabase
git commit -m "feat(dodois): recepciones por entrega con proveedor, factura y liga por proveedor en la base"
```

---

### Task 3: Sincronizar recepciones

**Files:** Modify `lib/dodois/cliente.ts`, `app/ventas/dodois/sincronizar.ts`, `app/ventas/dodois/page.tsx`, `app/ventas/dodois/acciones.ts`.

**Interfaces — Consumes:** Tarea 1 (`traducirRecepciones`, `ventanaRecepciones`, `DIAS_RECEPCIONES`, `RecepcionApi`), Tarea 2 (`sincronizar_recepciones_dodo`, `dodois_sincronizaciones.tipo`).
**Produces:** `ResultadoDia.tipo: "ventas" | "recepciones"`; `recepcionesDe(token, unitId, ventana): Promise<RecepcionApi[]>`.

- [ ] **Step 1: Cliente.** En `lib/dodois/cliente.ts`, agrega `import type { RecepcionApi } from "./recepciones";` y al final:

```ts
/** Recepciones de insumos de una unidad en una ventana, página por página (corta si una página no trae nada nuevo). */
export async function recepcionesDe(token: string, unitId: string, ventana: { from: string; to: string }): Promise<RecepcionApi[]> {
  const todas = new Map<string, RecepcionApi>();
  for (let skip = 0, pagina = 0; pagina < 20; pagina++) {
    const r = await getDodo<{ incomingStockItems: RecepcionApi[]; isEndOfListReached: boolean }>(token,
      `${API}/dodopizza/mx/accounting/incoming-stock-items?units=${unitId}&from=${ventana.from}&to=${ventana.to}&skip=${skip}&take=1000`);
    const antes = todas.size;
    for (const x of r.incomingStockItems ?? []) todas.set(JSON.stringify(x), x);
    if (r.isEndOfListReached || todas.size === antes) return [...todas.values()];
    skip += (r.incomingStockItems ?? []).length;
  }
  throw new ErrorDodo("Las recepciones traen demasiadas páginas.");
}
```

- [ ] **Step 2: Sincronización.** En `app/ventas/dodois/sincronizar.ts`:
  1. Importa `recepcionesDe` (junto a `ventasDelDia`) y `import { DIAS_RECEPCIONES, traducirRecepciones, ventanaRecepciones } from "@/lib/dodois/recepciones";`.
  2. `ResultadoDia` gana `tipo: "ventas" | "recepciones"`; todos los `r = { … }` existentes llevan `tipo: "ventas"` (incluido el error de token y el de "No hay sucursales ligadas").
  3. `registrar` inserta también `tipo: r.tipo`.
  4. Antes de la limpieza de 60 días (`if (!opciones.simular) await admin.from("dodois_sincronizaciones").delete()…`) agrega:

```ts
  // Recepciones de insumos: la ventana termina hoy (7 días con el cron; 31 en la noche o a mano).
  if (!opciones.simular) {
    const hoy = fechaASincronizar("manual", inicio);
    const v = ventanaRecepciones(DIAS_RECEPCIONES[origen], hoy);
    for (const s of sucursales ?? []) {
      let r: ResultadoDia;
      try {
        const filas = traducirRecepciones(await recepcionesDe(token, s.dodois_unit_id, v), s.dodois_unit_id);
        const { data, error } = await admin.rpc("sincronizar_recepciones_dodo", { p_sucursal: s.id, p_desde: v.desde, p_hasta: v.hasta, p_renglones: filas });
        if (error) throw new Error(error.message);
        const x = data as { renglones: number; ligadas: number; pendientes: number; sin_proveedor: number; con_factura: number; varias: number };
        r = {
          tipo: "recepciones", sucursal: s.nombre, fecha: v.hasta, estado: "ok", pedidos: x.renglones,
          total: centavos(filas.reduce((t, f) => t + f.importe_sin_iva, 0)),
          mensaje: `${v.desde} a ${v.hasta}: ${x.ligadas} ligadas, ${x.pendientes} por revisar, ${x.sin_proveedor} sin proveedor, ${x.con_factura} con factura${x.varias ? `, ${x.varias} revisiones del Excel por repetir` : ""}`,
        };
      } catch (e) {
        r = { tipo: "recepciones", sucursal: s.nombre, fecha: v.hasta, estado: "error", pedidos: 0, total: 0, mensaje: (e as Error).message };
      }
      resultados.push(r);
      await registrar(admin, origen, s.id, r, [], inicio);
    }
  }
```

- [ ] **Step 3: Pantalla Dodo IS y acciones.** En `app/ventas/dodois/page.tsx`: agrega `tipo` al `select` de `dodois_sincronizaciones` y al tipo `Registro` (`tipo: string`), y en la fila cambia `{r.sucursales?.nombre ?? "—"} · …` por `{r.tipo === "recepciones" ? "Recepciones" : "Ventas"} · {r.sucursales?.nombre ?? "—"} · …`; la columna del conteo dice `pedidos` para ventas y `renglones` para recepciones:
`<span>{r.pedidos ?? 0} {r.tipo === "recepciones" ? "renglones" : "pedidos"} · {pesos(Number(r.total ?? 0))}</span>`.
En `app/ventas/dodois/acciones.ts`, en el texto de `actualizarAhora`, antepone el tipo: `${x.tipo === "recepciones" ? "Recepciones" : "Ventas"} ${x.sucursal} …` y para recepciones muestra `x.mensaje`.

- [ ] **Step 4: Verificar**

Run: `node node_modules/typescript/bin/tsc --noEmit`, `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`, `npx next build > ../build.txt 2>&1; echo $?`
Expected: sin errores; todas pasan; build 0.

- [ ] **Step 5: Commit**

```bash
git add lib app
git commit -m "feat(dodois): sincroniza recepciones de insumos con las ventas"
```

---

### Task 4: Pantallas de Compras

**Files:** Modify `app/compras/recepciones/page.tsx`, `app/compras/recepciones/acciones.ts`, `app/compras/facturas/[id]/page.tsx`; Create `app/compras/facturas/RecepcionesDodo.tsx`.

**Interfaces — Consumes:** `ligar_proveedor_dodois` (Tarea 2); columnas nuevas de `recepciones_dodo`.

- [ ] **Step 1: Acción.** En `app/compras/recepciones/acciones.ts` agrega:

```ts
export async function ligarProveedorDodo(fd: FormData) {
  const ruta = "/compras/recepciones";
  const supabase = await clienteAdmin(ruta);
  const { data, error } = await supabase.rpc("ligar_proveedor_dodois", { p_proveedor: String(fd.get("proveedor_id") ?? ""), p_supplier: String(fd.get("supplier") ?? "") });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", `Proveedor ligado: ${data ?? 0} recepciones actualizadas y ligadas donde se pudo.`);
}
```

- [ ] **Step 2: Recepciones.** En `app/compras/recepciones/page.tsx`:
  1. El tipo `Recepcion` gana `fuente: "excel" | "api"; recibido_en: string | null; factura_texto: string | null; factura_id: string | null; importe_sin_iva: number | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null; facturas: { serie: string | null; folio: string | null } | null;` y los dos `select` de `recepciones_dodo` agregan `fuente, recibido_en, factura_texto, factura_id, importe_sin_iva, proveedores(razon_social, nombre_comercial), facturas(serie, folio)`.
  2. El tipo `Abierto` gana `precio: number` y su `select` agrega `precio` (después de `recibido`).
  3. Importa `ligarProveedorDodo` y `Plegable` (ya importado). Antes del `return`, agrega:

```tsx
  // Proveedores de Dodo IS sin ligar: se agrupan por su ID con insumos y folios de ejemplo para reconocerlos.
  const sinLigar = edita ? await leerTodo<{ dodo_proveedor_id: string; material: string; factura_texto: string | null; fecha: string }>((d, h) =>
    supabase.from("recepciones_dodo").select("dodo_proveedor_id, material, factura_texto, fecha").eq("fuente", "api").is("proveedor_id", null)
      .not("dodo_proveedor_id", "is", null).order("fecha", { ascending: false }).order("id").range(d, h)) : [];
  const proveedoresDodo = [...sinLigar.reduce((m, x) => {
    const p = m.get(x.dodo_proveedor_id) ?? { id: x.dodo_proveedor_id, renglones: 0, materiales: new Set<string>(), folios: new Set<string>(), ultima: x.fecha };
    p.renglones++; p.materiales.add(x.material); if (x.factura_texto) p.folios.add(x.factura_texto);
    return m.set(x.dodo_proveedor_id, p);
  }, new Map<string, { id: string; renglones: number; materiales: Set<string>; folios: Set<string>; ultima: string }>()).values()];
  const { data: cartera } = proveedoresDodo.length
    ? await supabase.from("proveedores").select("id, razon_social, nombre_comercial").eq("activo", true).order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>()
    : { data: [] };
  const precioOrden = (r: Recepcion) => (r.orden_renglon_id ? (abiertos ?? []).find((a) => a.id === r.orden_renglon_id)?.precio ?? null : null);
  const precioDistinto = (r: Recepcion) => { const p = precioOrden(r); return p !== null && Number(p) > 0 && Math.abs(Number(r.precio) - Number(p)) / Number(p) > 0.01; };
  const datosDodo = (r: Recepcion) => (
    <>
      {r.fuente === "api" && <><dt>Proveedor</dt><dd>{r.proveedores?.nombre_comercial ?? r.proveedores?.razon_social ?? "Sin ligar (ver Proveedores de Dodo IS)"}</dd></>}
      {r.fuente === "api" && <><dt>Factura</dt><dd>{r.factura_id ? <Link href={`/compras/facturas/${r.factura_id}`}>{`${r.facturas?.serie ?? ""}${r.facturas?.folio ?? ""}` || "Factura"}</Link> : r.factura_texto ? `${r.factura_texto} (sin ligar)` : "—"}</dd></>}
      <dt>Precio Dodo IS</dt><dd>{precioUnitario(r.precio)} por {r.unidad}{r.importe_sin_iva !== null ? ` · ${pesos(Number(r.importe_sin_iva))} sin IVA` : ""}</dd>
      {precioDistinto(r) && <><dt>Precio de la orden</dt><dd><span className="insignia" data-tono="aviso">{precioUnitario(Number(precioOrden(r)))} · distinto</span></dd></>}
    </>
  );
```

  4. Reemplaza `{edita && <FormImportarRecepciones />}` por:

```tsx
      {edita && proveedoresDodo.length > 0 && (
        <section className="seccion" aria-labelledby="t-proveedores-dodo">
          <h2 id="t-proveedores-dodo">Proveedores de Dodo IS sin ligar · {proveedoresDodo.length}</h2>
          <p className="saldo-nota">Dodo IS solo manda un ID por proveedor. Elige a quién corresponde una vez y sus recepciones se ligan a sus órdenes y facturas.</p>
          <div className="tarjetas">
            {proveedoresDodo.map((p) => (
              <article key={p.id} className="tarjeta" data-alerta="si">
                <div className="tarjeta-encabezado"><div><h3>{[...p.materiales].slice(0, 3).join(", ")}</h3><p className="tarjeta-estado">{p.renglones} renglones · última {fechaTexto(p.ultima)}</p></div></div>
                <dl className="tarjeta-datos"><dt>Folios</dt><dd>{[...p.folios].slice(0, 4).join(", ") || "—"}</dd><dt>ID Dodo IS</dt><dd><small>{p.id}</small></dd></dl>
                <form action={ligarProveedorDodo} className="formulario">
                  <input type="hidden" name="supplier" value={p.id} />
                  <label className="campo">Proveedor de la cartera
                    <select name="proveedor_id" required defaultValue="">
                      <option value="" disabled>Elige…</option>
                      {(cartera ?? []).map((c) => <option key={c.id} value={c.id}>{c.nombre_comercial ?? c.razon_social}</option>)}
                    </select>
                  </label>
                  <BotonEnviar>Ligar proveedor</BotonEnviar>
                </form>
              </article>
            ))}
          </div>
        </section>
      )}
      {edita && <Plegable id="respaldo-excel" titulo="Respaldo: importar Excel de Dodo IS" resumen="Solo para días sin recepciones de la API"><FormImportarRecepciones /></Plegable>}
```

  5. En la tarjeta de "Por revisar", reemplaza `<dl className="tarjeta-datos"><dt>Precio Dodo IS</dt><dd>{precioUnitario(r.precio)} por {r.unidad}</dd></dl>` por `<dl className="tarjeta-datos">{datosDodo(r)}</dl>`; en "Recientes", agrega `{datosDodo(r)}` dentro de su `<dl className="tarjeta-datos">` después del renglón de Orden, y `data-alerta={precioDistinto(r) ? "si" : undefined}` en su `<article>`.
  6. En el texto del encabezado: `descripcion="Lo que se recibió en Dodo IS, entrega por entrega, ligado a las órdenes de compra del mismo proveedor y a su factura cuando el folio coincide. Llega solo cada 15 minutos."`.

- [ ] **Step 3: Detalle de factura.** Crea `app/compras/facturas/RecepcionesDodo.tsx`:

```tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaTexto, pesos, precioUnitario } from "@/lib/formato";

type Fila = { id: string; material: string; cantidad: number; unidad: string; precio: number; fecha: string; importe_sin_iva: number | null; sucursales: { nombre: string } | null };

/** Recepciones de Dodo IS ligadas a la factura por su folio: lo recibido frente al subtotal facturado (informativo). */
export async function RecepcionesDodo({ supabase, facturaId, subtotal }: { supabase: SupabaseClient; facturaId: string; subtotal: number }) {
  const { data } = await supabase.from("recepciones_dodo").select("id, material, cantidad, unidad, precio, fecha, importe_sin_iva, sucursales(nombre)")
    .eq("factura_id", facturaId).order("fecha").order("material").returns<Fila[]>();
  const filas = data ?? [];
  if (!filas.length) return null;
  const recibido = filas.reduce((t, f) => t + Number(f.importe_sin_iva ?? Number(f.cantidad) * Number(f.precio)), 0);
  const diferencia = Math.round((recibido - subtotal) * 100) / 100;
  return (
    <section className="seccion" aria-labelledby="t-recepciones-dodo">
      <h2 id="t-recepciones-dodo">Recepciones de Dodo IS · {filas.length}</h2>
      <p className={Math.abs(diferencia) > 1 ? "aviso aviso-error" : "aviso aviso-ok"}>
        Recibido sin IVA {pesos(recibido)} · facturado {pesos(subtotal)}{Math.abs(diferencia) > 1 ? ` · diferencia ${pesos(diferencia)}` : " · cuadra"}
      </p>
      <ul className="lista-filas" style={{ "--columnas": 2 } as React.CSSProperties}>
        {filas.map((f) => (
          <li key={f.id} className="fila">
            <div className="fila-nombre"><strong>{f.material}</strong><small>{fechaTexto(f.fecha)} · {f.sucursales?.nombre}</small></div>
            <div className="fila-datos"><span>{f.cantidad} {f.unidad} · {precioUnitario(f.precio)}</span><span>{pesos(Number(f.importe_sin_iva ?? 0))}</span></div>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

En `app/compras/facturas/[id]/page.tsx` importa `RecepcionesDodo` y renderiza `<RecepcionesDodo supabase={supabase} facturaId={f.id} subtotal={Number(f.subtotal) - Number(f.descuento)} />` dentro de la vista principal de la factura, justo antes de la sección de cotejo (si la página usa pestañas, en la pestaña donde está el cotejo).

- [ ] **Step 4: Verificar**

Run: `node node_modules/typescript/bin/tsc --noEmit`, `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`, `npx next build > ../build.txt 2>&1; echo $?`
Expected: sin errores; todas pasan; build 0. Vista previa: en producción tras desplegar (el entorno local no tiene Supabase).

- [ ] **Step 5: Commit**

```bash
git add app
git commit -m "feat(compras): recepciones de Dodo IS por entrega, proveedores sin ligar y recepciones en la factura"
```

## Cierre

1. Sebastián corre la migración y su prueba (PRUEBAS OK); fusionar a main.
2. Ventas → Dodo IS → "Actualizar ahora" (trae 31 días de recepciones); revisar el registro "Recepciones".
3. Compras → Recepciones: ligar los 12 proveedores de Dodo IS; revisar que se liguen órdenes y facturas.
