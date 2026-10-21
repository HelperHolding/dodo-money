# Sincronización de ventas con Dodo IS — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las ventas de Dodo IS llegan solas cada 15 minutos (más una pasada a las 3 a.m.) a las mismas tablas que llena "Datos brutos".

**Architecture:** Traducción pura API → pedidos en `lib/dodois/ventas.ts`; el resumen del día reutiliza `resumirDias`/`ivaDe` de `lib/ventas/pedidos.ts`. Cliente de servidor (`lib/dodois/cliente.ts`) con tokens en el Vault y renovación de uno a la vez. La base guarda cada día con `sincronizar_ventas_dodo` (solo `service_role`), que reutiliza el registro de importación del día. `pg_cron` llama a `POST /api/dodois/sincronizar` con una clave compartida.

**Tech Stack:** Next.js 15, React 19, TypeScript estricto, Supabase (Vault, pg_cron, pg_net), `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-10-20-sincronizacion-dodois-design.md`

## Global Constraints

- Auth `https://auth.dodois.com`; API `https://api.dodois.com` (unidades en la raíz `/auth/roles/units`; ventas en `/dodopizza/mx/accounting/sales`).
- Scopes: `openid offline_access user.role:read sales accounting:read unit:read productionefficiency`.
- `dodo_id` de pedido y `dodo_uuid` de producto **en mayúsculas**; `hora` como `HH:MM`.
- Un día cuyo registro de importación no es `'api'` (vino del Excel) no se toca.
- Tokens solo en el Vault; nunca en respuestas, logs ni chat. `DODOIS_CLIENT_ID`, `DODOIS_CLIENT_SECRET`, `DODOIS_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` solo en Vercel.
- Los módulos de `lib/` se importan entre sí solo como tipos (los valores se pasan como parámetros); CRLF; pruebas nuevas al script `test` con `node ../agregar-test.cjs <archivo>`.
- Migración: `supabase/migrations/20261020180000_sincronizacion_dodois.sql`; su prueba: `supabase/pruebas/20261020180000_sincronizacion_dodois.sql`.
- Después de `review-package`, volver a la rama antes de arreglar.

## Review Focus

1. **Paginación de ventas:** no sabemos si la API acepta `skip`/`take`; con un día de >1000 pedidos el ciclo no debe repetir la misma página para siempre (Tarea 3: `ventasDelDia` corta si una página no trae nada nuevo).
2. **Dos sincronizaciones a la vez** (cron + "Actualizar ahora"): solo una renueva el token de un solo uso (Tarea 2: `dodois_tomar_renovacion`; Tarea 3).
3. **Conciliación vigente** y venta que cambia las formas de pago: se anula; si no cambian, sigue (Tarea 2, prueba SQL).
4. **Día que vino del Excel:** la sincronización devuelve `excel` y no cambia nada (Tarea 2, prueba SQL).
5. **Conexión caída** (`invalid_grant` al renovar): queda `requiere_reconectar` y el tablero de Ventas lo avisa (Tareas 3 y 4).

---

### Task 1: Traducción de ventas de la API (`lib/dodois/ventas.ts`)

**Files:** Create `lib/dodois/ventas.ts`, `lib/dodois/ventas.test.ts`; Modify `package.json`.

**Interfaces — Produces:**
- `type VentaApi`, `type ProductoApi`, `type PedidoCarga`, `type ProductoCarga`, `type OrigenSincronizacion = "cron" | "noche" | "manual"`.
- `traducirVentas(ventas: readonly VentaApi[], o: { sucursalDeUnidad: ReadonlyMap<string, string>; tamanoDe: (nombre: string) => string | null; ivaDe: (precios: readonly number[]) => number }): { pedidos: PedidoCarga[]; productos: ProductoCarga[]; desconocidos: string[]; sinSucursal: number }`
- `ventanaDelDia(fecha: string): { from: string; to: string }`
- `fechaASincronizar(origen: OrigenSincronizacion, ahoraIso: string): string`

- [ ] **Step 1: Prueba** — `lib/dodois/ventas.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaASincronizar, traducirVentas, ventanaDelDia, type VentaApi } from "./ventas.ts";
import { ivaDe, resumirDias } from "../ventas/pedidos.ts";
import { tamanoPorNombre } from "../ventas/calculos.ts";

const UNIDAD = "11f187558e757f53b0570d952420b810", SUC = "suc-zapopan";
const p = (productId: string, defaultProductName: string, price: number, priceWithDiscount: number, extra: Partial<VentaApi["products"][number]> = {}) =>
  ({ productId, defaultProductName, price, priceWithDiscount, combo: null, discount: null, ...extra });
const venta = (orderId: string, soldAtLocal: string, paymentMethod: string, orderSource: string, products: VentaApi["products"], extra: Partial<VentaApi> = {}): VentaApi =>
  ({ orderId, soldAtLocal, unitId: UNIDAD, shiftId: "01a0d957b81078f5895147b76563a6dc", paymentMethod, salesChannel: "Dine-in", orderSource, aggregatorName: null, products, ...extra });
const DESCUENTO = { bonusActionName: "Pepperoni pizza for 119. NO promocode" };
const SOLO_DODO = { id: "11f1b32599175d0739fe6c5bef9187d0", name: "Solo Dodo" };

// Cuatro pedidos reales del 25/09 (API de Dodo IS).
const VENTAS: VentaApi[] = [
  venta("11f1b915aa984b4a87d45d5cae686d08", "2026-09-25T13:20:35", "Cash", "Dine-in", [
    p("11f19a78b9ad03c44e6b462afd065640", "Tres Carnes Mediano", 199, 199), p("11f19997a22f8b4d9c579af6b112b260", "Pepperoni Mediano", 129, 129)]),
  venta("11f1b91a0635641c9d59afb87d99391d", "2026-09-25T13:49:50", "Cash", "Dine-in", [
    p("11f19e46b86befb6c37b0de4a64539d0", "Papas Gajo  Medium", 49, 49), p("11f19aebbcaec131cd618e798a5bf370", "Coca Cola 2 L", 59, 59),
    p("11f19aebbcaec131cd618e798a5bf370", "Coca Cola 2 L", 59, 59), p("11f19997a22f8b4d9c579af6bf6b55b0", "Pepperoni Grande", 159, 119, { discount: DESCUENTO })]),
  venta("11f1b94bd1e8c8029810ebc4f8bccb5e", "2026-09-25T19:45:52", "Card", "Kiosk", [p("11f19a3ab84c9347b0fe6a292fd47730", "Dodo Supreme Pequeño", 155, 155)]),
  venta("11f1b9437f3b87058a1ab5066ca999ec", "2026-09-25T18:49:41", "Card", "Dine-in", [
    p("11f19a219be8517d93da27012e304670", "Quatro quesos Mediano", 169, 107.9, { combo: SOLO_DODO }),
    p("11f19aebbcaec131cd618e798751c0b0", "Coca Cola 0,6 L", 33, 21.1, { combo: SOLO_DODO }),
    p("11f19997a22f8b4d9c579af6c277f970", "Pepperoni T Grande", 159, 119, { discount: DESCUENTO })]),
];
const opciones = { sucursalDeUnidad: new Map([[UNIDAD, SUC]]), tamanoDe: tamanoPorNombre, ivaDe };

test("traducirVentas: ids en mayúsculas, hora en minutos, pago y origen, totales e IVA por pieza", () => {
  const t = traducirVentas(VENTAS, opciones);
  assert.equal(t.pedidos.length, 4);
  assert.deepEqual(t.desconocidos, []);
  const a = t.pedidos[0];
  assert.deepEqual(
    { id: a.dodo_id, suc: a.sucursal_id, fecha: a.fecha, hora: a.hora, pago: a.pago, tipo: a.tipo, origen: a.origen, total: a.total, sin: a.total_sin_descuento, iva: a.iva, piezas: a.productos },
    { id: "11F1B915AA984B4A87D45D5CAE686D08", suc: SUC, fecha: "2026-09-25", hora: "13:20", pago: "efectivo", tipo: "en_tienda", origen: "mostrador", total: 328, sin: 328, iva: 45.24, piezas: 2 });
  const b = t.pedidos[1];
  assert.deepEqual([b.total, b.total_sin_descuento, b.iva, b.promocion], [286, 326, 39.45, "Pepperoni pizza for 119. NO promocode"]);
  assert.deepEqual([t.pedidos[2].pago, t.pedidos[2].origen, t.pedidos[2].origen_dodo], ["tarjeta", "kiosco", "Kiosk"]);
  assert.equal(t.productos.length, 10);
  assert.deepEqual(t.productos.filter((x) => x.pedido_id === "11F1B9437F3B87058A1AB5066CA999EC").map((x) => [x.renglon, x.dodo_uuid, x.precio, x.precio_sin_descuento, x.combo]), [
    [1, "11F19A219BE8517D93DA27012E304670", 107.9, 169, "Solo Dodo"],
    [2, "11F19AEBBCAEC131CD618E798751C0B0", 21.1, 33, "Solo Dodo"],
    [3, "11F19997A22F8B4D9C579AF6C277F970", 119, 159, null],
  ]);
});

test("el día resumido con la misma lógica de Datos brutos", () => {
  const t = traducirVentas(VENTAS, opciones);
  const dias = resumirDias(
    t.pedidos.map((x) => ({ ...x, sucursal: x.sucursal_id, inicio_coccion: null, listo: null, entregado: null })),
    t.productos.map((x) => ({ pedido_id: x.pedido_id, nombre: x.nombre, precio: x.precio, combo: x.combo })));
  assert.equal(dias.length, 1);
  assert.deepEqual(dias[0].resumen, { pedidos: 4, total: 1017, efectivo: 614, tarjeta: 403, en_linea: 0, iva: 140.27 });
  assert.deepEqual(dias[0].desglose.map((d) => [d.tipo, d.pedidos, d.total]), [["restaurante", 4, 1017]]);
  assert.deepEqual(dias[0].productos, { piezas: 10, suma: 1017 });
});

test("canales, agregador y valores desconocidos", () => {
  const t = traducirVentas([
    venta("aa01", "2026-10-20T20:00:10", "Online", "MobileApp", [p("bb01", "Pepperoni Grande", 159, 159)], { salesChannel: "Delivery" }),
    venta("aa02", "2026-10-20T20:05:10", "Card", "Dine-in", [p("bb01", "Pepperoni Grande", 159, 159)], { salesChannel: "Takeaway", aggregatorName: "Rappi" }),
    venta("aa03", "2026-10-20T20:06:10", "Voucher", "Drone", [p("bb01", "Pepperoni Grande", 159, 159)], { salesChannel: "Drive" }),
    venta("aa04", "2026-10-20T20:07:10", "Cash", "Dine-in", [p("bb01", "Pepperoni Grande", 159, 159)], { unitId: "otra-unidad" }),
  ], opciones);
  assert.deepEqual(t.pedidos.map((x) => [x.tipo, x.para_llevar, x.origen, x.pago, x.agregador]), [
    ["entrega", false, "app", "en_linea", null],
    ["en_tienda", true, "mostrador", "tarjeta", "Rappi"],
    ["en_tienda", false, "otro", "otro", null],
  ]);
  assert.deepEqual(t.desconocidos, ["canal: Drive", "origen: Drone", "pago: Voucher"]);
  assert.equal(t.sinSucursal, 1);
});

test("ventana del día y fecha a sincronizar (CDMX, UTC−6)", () => {
  assert.deepEqual(ventanaDelDia("2026-09-25"), { from: "2026-09-25T00:00:00", to: "2026-09-26T00:00:00" });
  assert.deepEqual(ventanaDelDia("2026-12-31"), { from: "2026-12-31T00:00:00", to: "2027-01-01T00:00:00" });
  assert.equal(fechaASincronizar("cron", "2026-10-20T05:30:00Z"), "2026-10-19");
  assert.equal(fechaASincronizar("cron", "2026-10-20T16:15:00Z"), "2026-10-20");
  assert.equal(fechaASincronizar("noche", "2026-10-20T09:00:00Z"), "2026-10-19");
  assert.equal(fechaASincronizar("noche", "2027-01-01T09:00:00Z"), "2026-12-31");
  assert.equal(fechaASincronizar("manual", "2026-10-20T18:00:00Z"), "2026-10-20");
});
```

Agrega la prueba al script: `node ../agregar-test.cjs lib/dodois/ventas.test.ts`.

- [ ] **Step 2: Correr y ver que falla**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: FAIL (no existe `lib/dodois/ventas.ts`).

- [ ] **Step 3: Implementación** — `lib/dodois/ventas.ts`:

```ts
/**
 * Ventas de la API de Dodo IS → las mismas filas que llena "Datos brutos" (tablas `pedidos` y `pedido_productos`).
 * Puro, sin red. Los ids van en mayúsculas y la hora en minutos, como el Excel, para que un día no se duplique.
 */
import type { Origen, Pago, TipoPedido } from "../ventas/datosBrutos";

export type ProductoApi = {
  productId: string; defaultProductName: string; price: number; priceWithDiscount: number;
  combo: { id: string; name: string } | null; discount: { bonusActionName: string | null } | null;
};
export type VentaApi = {
  orderId: string; soldAtLocal: string; unitId: string; shiftId: string | null; paymentMethod: string | null;
  salesChannel: string | null; orderSource: string | null; aggregatorName: string | null; products: ProductoApi[];
};
export type PedidoCarga = {
  dodo_id: string; sucursal_id: string; fecha: string; hora: string; pago: Pago; tipo: TipoPedido; origen: Origen;
  origen_dodo: string | null; para_llevar: boolean; estado: "entregado"; total: number; total_sin_descuento: number; iva: number;
  productos: number; promocion: string | null; turno_dodo: string | null; agregador: string | null;
};
export type ProductoCarga = {
  pedido_id: string; renglon: number; dodo_uuid: string; nombre: string; tamano: string | null;
  precio: number; precio_sin_descuento: number; combo: string | null;
};
export type OrigenSincronizacion = "cron" | "noche" | "manual";

const PAGO: Record<string, Pago> = { cash: "efectivo", card: "tarjeta", bankcard: "tarjeta", online: "en_linea", internetacquiring: "en_linea" };
const ORIGEN: Record<string, Origen> = { "dine-in": "mostrador", restaurant: "mostrador", kiosk: "kiosco", mobile: "app", mobileapp: "app", site: "sitio", website: "sitio" };
const EN_TIENDA = new Set(["dine-in", "takeaway", "pickup"]);
const PARA_LLEVAR = new Set(["takeaway", "pickup"]);
const centavos = (n: number) => Math.round(n * 100) / 100;
const clave = (v: string | null) => (v ?? "").trim().toLowerCase();

export function traducirVentas(ventas: readonly VentaApi[], o: {
  sucursalDeUnidad: ReadonlyMap<string, string>; tamanoDe: (nombre: string) => string | null; ivaDe: (precios: readonly number[]) => number;
}) {
  const pedidos: PedidoCarga[] = [], productos: ProductoCarga[] = [];
  const desconocidos = new Set<string>();
  let sinSucursal = 0;
  for (const v of ventas) {
    const sucursal = o.sucursalDeUnidad.get(v.unitId);
    if (!sucursal) { sinSucursal++; continue; }
    const id = v.orderId.toUpperCase();
    const pago = PAGO[clave(v.paymentMethod)] ?? "otro";
    if (pago === "otro" && v.paymentMethod) desconocidos.add(`pago: ${v.paymentMethod}`);
    const canal = clave(v.salesChannel);
    if (canal !== "delivery" && !EN_TIENDA.has(canal) && v.salesChannel) desconocidos.add(`canal: ${v.salesChannel}`);
    const origen = ORIGEN[clave(v.orderSource)] ?? "otro";
    if (origen === "otro" && v.orderSource) desconocidos.add(`origen: ${v.orderSource}`);
    const precios = v.products.map((x) => Number(x.priceWithDiscount));
    pedidos.push({
      dodo_id: id, sucursal_id: sucursal, fecha: v.soldAtLocal.slice(0, 10), hora: v.soldAtLocal.slice(11, 16), pago,
      tipo: canal === "delivery" ? "entrega" : "en_tienda", origen, origen_dodo: v.orderSource, para_llevar: PARA_LLEVAR.has(canal),
      estado: "entregado", total: centavos(precios.reduce((s, x) => s + x, 0)),
      total_sin_descuento: centavos(v.products.reduce((s, x) => s + Number(x.price), 0)), iva: o.ivaDe(precios),
      productos: v.products.length, promocion: v.products.find((x) => x.discount?.bonusActionName)?.discount?.bonusActionName ?? null,
      turno_dodo: v.shiftId, agregador: v.aggregatorName || null,
    });
    v.products.forEach((x, i) => productos.push({
      pedido_id: id, renglon: i + 1, dodo_uuid: x.productId.toUpperCase(), nombre: x.defaultProductName, tamano: o.tamanoDe(x.defaultProductName),
      precio: Number(x.priceWithDiscount), precio_sin_descuento: Number(x.price), combo: x.combo?.name ?? null,
    }));
  }
  return { pedidos, productos, desconocidos: [...desconocidos].sort(), sinSucursal };
}

const siguienteDia = (fecha: string) => new Date(Date.parse(`${fecha}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/** Un día completo en hora local de la sucursal (como la API espera `from`/`to`). */
export const ventanaDelDia = (fecha: string) => ({ from: `${fecha}T00:00:00`, to: `${siguienteDia(fecha)}T00:00:00` });

/** Día a sincronizar en CDMX (UTC−6, sin horario de verano): la pasada de la noche es el día anterior. */
export function fechaASincronizar(origen: OrigenSincronizacion, ahoraIso: string): string {
  const hoy = new Date(Date.parse(ahoraIso) - 6 * 3_600_000).toISOString().slice(0, 10);
  return origen === "noche" ? new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10) : hoy;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` y `node node_modules/typescript/bin/tsc --noEmit`
Expected: todas pasan; sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add lib/dodois package.json
git commit -m "feat(dodois): traducción de ventas de la API a pedidos"
```

---

### Task 2: Migración y prueba SQL

**Files:** Create `supabase/migrations/20261020180000_sincronizacion_dodois.sql`, `supabase/pruebas/20261020180000_sincronizacion_dodois.sql`.

**Interfaces — Produces:** `sucursales.dodois_unit_id`; tablas `dodois_conexion`, `dodois_sincronizaciones`; funciones `dodois_conectar(p_refresh text, p_access text, p_expira timestamptz, p_unidades jsonb, p_scopes text)` (admin), `ligar_unidad_dodois(p_sucursal uuid, p_unit text)` (admin), `dodois_tokens() → (refresh, access, access_expira, estado)`, `dodois_tomar_renovacion() → boolean`, `dodois_guardar_tokens(p_refresh text, p_access text, p_expira timestamptz)`, `dodois_marcar_error(p_mensaje text, p_reconectar boolean)`, `sincronizar_ventas_dodo(p_sucursal uuid, p_fecha date, p_resumen jsonb, p_desglose jsonb, p_pedidos jsonb, p_productos jsonb) → text` ('ok' | 'excel' | 'vacio') — estas cinco solo `service_role` —, `dodois_disparar(p_origen text) → bigint` (para pg_cron).

- [ ] **Step 1: Prueba SQL** — `supabase/pruebas/20261020180000_sincronizacion_dodois.sql`:

```sql
-- Pruebas de la sincronización con Dodo IS. Córrelas completas en Supabase → SQL Editor después de la migración.
-- Necesitan un admin y un corporativo activos y al menos una sucursal. Usan días de 2020 (no deben tener ventas).
--   · "PRUEBAS OK — …" → todo bien (no deja cambios).   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_c uuid; v_s uuid; v_imp uuid; v_imp2 uuid; v_dia uuid; v_r text; v_ok text[] := '{}';
  servidor text := json_build_object('role', 'service_role')::text;
  d1 date := '2020-01-02'; d2 date := '2020-01-03';
  ped jsonb := jsonb_build_array(
    jsonb_build_object('dodo_id', 'PRUEBA0040A', 'sucursal_id', null, 'fecha', '2020-01-02', 'hora', '13:20', 'pago', 'efectivo', 'tipo', 'en_tienda',
      'origen', 'mostrador', 'origen_dodo', 'Dine-in', 'para_llevar', false, 'estado', 'entregado', 'total', 328, 'total_sin_descuento', 328,
      'iva', 45.24, 'productos', 2, 'promocion', null, 'turno_dodo', 't1', 'agregador', null),
    jsonb_build_object('dodo_id', 'PRUEBA0040B', 'sucursal_id', null, 'fecha', '2020-01-02', 'hora', '13:49', 'pago', 'tarjeta', 'tipo', 'en_tienda',
      'origen', 'kiosco', 'origen_dodo', 'Kiosk', 'para_llevar', false, 'estado', 'entregado', 'total', 155, 'total_sin_descuento', 155,
      'iva', 21.38, 'productos', 1, 'promocion', null, 'turno_dodo', 't1', 'agregador', null));
  prod jsonb := jsonb_build_array(
    jsonb_build_object('pedido_id', 'PRUEBA0040A', 'renglon', 1, 'dodo_uuid', 'PRUEBA-PROD-1', 'nombre', 'Producto prueba 0040', 'tamano', null, 'precio', 199, 'precio_sin_descuento', 199, 'combo', null),
    jsonb_build_object('pedido_id', 'PRUEBA0040A', 'renglon', 2, 'dodo_uuid', 'PRUEBA-PROD-1', 'nombre', 'Producto prueba 0040', 'tamano', null, 'precio', 129, 'precio_sin_descuento', 129, 'combo', null),
    jsonb_build_object('pedido_id', 'PRUEBA0040B', 'renglon', 1, 'dodo_uuid', 'PRUEBA-PROD-1', 'nombre', 'Producto prueba 0040', 'tamano', null, 'precio', 155, 'precio_sin_descuento', 155, 'combo', null));
  res jsonb := jsonb_build_object('pedidos', 2, 'total', 483, 'efectivo', 328, 'tarjeta', 155, 'en_linea', 0, 'iva', 66.62, 'venta_m2', null, 'suma_productos', 483, 'productos', 3);
  des jsonb := jsonb_build_array(jsonb_build_object('tipo', 'restaurante', 'pedidos', 2, 'total', 483, 'efectivo', 328, 'tarjeta', 155, 'en_linea', 0, 'iva', 66.62));
begin
  select id into v_a from perfiles where rol::text = 'admin' and activo limit 1;
  select id into v_c from perfiles where rol::text = 'corporativo' and activo limit 1;
  select id into v_s from sucursales order by nombre limit 1;
  if v_a is null or v_c is null or v_s is null then raise exception 'FALTAN DATOS: se necesitan un admin, un corporativo y una sucursal.'; end if;
  if exists (select 1 from ventas_dia where fecha in (d1, d2)) then raise exception 'FALTAN DATOS: los días de prueba ya tienen ventas.'; end if;
  ped := (select jsonb_agg(x || jsonb_build_object('sucursal_id', v_s)) from jsonb_array_elements(ped) x);

  -- Conexión (como admin) y permisos.
  perform set_config('request.jwt.claims', json_build_object('sub', v_c, 'role', 'authenticated')::text, true);
  begin
    perform dodois_conectar('r', 'a', now() + interval '1 day', '[]'::jsonb, 's');
    raise exception 'FALLÓ: corporativo no conecta';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo un administrador conecta Dodo IS.' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform dodois_conectar('refresh-prueba', 'access-prueba', now() + interval '1 day', '[]'::jsonb, 'sales');
  begin
    perform * from dodois_tokens();
    raise exception 'FALLÓ: un usuario no lee los tokens';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo el servidor.' then raise exception 'FALLÓ: mensaje inesperado (tokens): %', sqlerrm; end if;
  end;
  begin
    perform sincronizar_ventas_dodo(v_s, d1, res, des, ped, prod);
    raise exception 'FALLÓ: un usuario no sincroniza';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm <> 'Solo el servidor sincroniza ventas.' then raise exception 'FALLÓ: mensaje inesperado (sincronizar): %', sqlerrm; end if;
  end;
  perform set_config('request.jwt.claims', servidor, true);
  if (select refresh from dodois_tokens()) <> 'refresh-prueba' then raise exception 'FALLÓ: el servidor lee el token guardado'; end if;
  if not dodois_tomar_renovacion() then raise exception 'FALLÓ: la primera renovación toma el turno'; end if;
  if dodois_tomar_renovacion() then raise exception 'FALLÓ: una segunda renovación a la vez espera'; end if;
  perform dodois_guardar_tokens('refresh-2', 'access-2', now() + interval '1 day');
  if (select refresh from dodois_tokens()) <> 'refresh-2' or not dodois_tomar_renovacion() then raise exception 'FALLÓ: guardar libera el turno y reemplaza el token'; end if;
  v_ok := array_append(v_ok, 'conexión solo admin; tokens y sincronización solo servidor; una renovación a la vez');

  -- Primera sincronización.
  v_r := sincronizar_ventas_dodo(v_s, d1, res, des, ped, prod);
  select importacion_id, id into v_imp, v_dia from ventas_dia where sucursal_id = v_s and fecha = d1;
  if v_r <> 'ok' or v_imp is null then raise exception 'FALLÓ: la primera sincronización guarda el día (%)', v_r; end if;
  if (select formato from importaciones_ventas where id = v_imp) <> 'api' then raise exception 'FALLÓ: el registro es de la API'; end if;
  if (select total from ventas_dia where id = v_dia) <> 483 or (select count(*) from pedidos where importacion_id = v_imp) <> 2
     or (select sum(cantidad) from ventas_producto where sucursal_id = v_s and fecha = d1) <> 3 then raise exception 'FALLÓ: totales, pedidos y productos del día'; end if;
  -- Segunda: mismo registro, sin duplicar.
  perform sincronizar_ventas_dodo(v_s, d1, res, des, ped, prod);
  if (select importacion_id from ventas_dia where sucursal_id = v_s and fecha = d1) <> v_imp or (select id from ventas_dia where sucursal_id = v_s and fecha = d1) <> v_dia
     or (select count(*) from pedidos where importacion_id = v_imp) <> 2 or (select count(*) from importaciones_ventas where sucursal_id = v_s and fecha = d1) <> 1 then
    raise exception 'FALLÓ: volver a sincronizar reutiliza el registro sin duplicar';
  end if;
  v_ok := array_append(v_ok, 'guarda el día y lo vuelve a sincronizar sin duplicar');

  -- Conciliación: sigue si las formas de pago no cambian; se anula si cambian.
  insert into ventas_conciliaciones (sucursal_id, fecha, importacion_id, original, efectivo, tarjeta, en_linea, conciliar_productos, motivo, registrado_por)
  values (v_s, d1, v_imp, '{"total":483,"iva":66.62,"efectivo":328,"tarjeta":155,"en_linea":0,"suma_productos":483,"bruta_productos":483,"productos":3}',
          300, 183, 0, false, 'Prueba de conciliación 0040', v_a);
  perform sincronizar_ventas_dodo(v_s, d1, res, des, ped, prod);
  if not exists (select 1 from ventas_conciliaciones where importacion_id = v_imp and anulado_en is null) then raise exception 'FALLÓ: la conciliación sigue si la venta no cambia'; end if;
  perform sincronizar_ventas_dodo(v_s, d1, res || jsonb_build_object('efectivo', 300, 'tarjeta', 183), des, ped, prod);
  if exists (select 1 from ventas_conciliaciones where importacion_id = v_imp and anulado_en is null)
     or (select motivo_anulacion from ventas_conciliaciones where importacion_id = v_imp order by registrado_en desc limit 1) <> 'La venta de Dodo IS cambió después de conciliar.' then
    raise exception 'FALLÓ: la conciliación se anula si cambian las formas de pago';
  end if;
  v_ok := array_append(v_ok, 'conciliación sigue o se anula según las formas de pago');

  -- Un pedido que ya no viene se quita.
  perform sincronizar_ventas_dodo(v_s, d1, res || jsonb_build_object('pedidos', 1, 'total', 328, 'efectivo', 328, 'tarjeta', 0, 'iva', 45.24, 'suma_productos', 328, 'productos', 2),
    des, jsonb_build_array(ped->0), jsonb_build_array(prod->0, prod->1));
  if (select count(*) from pedidos where importacion_id = v_imp) <> 1 or exists (select 1 from pedidos where dodo_id = 'PRUEBA0040B') then raise exception 'FALLÓ: el pedido que ya no viene se quita'; end if;
  v_ok := array_append(v_ok, 'quita pedidos que ya no vienen');

  -- Día del Excel: no se toca.
  insert into importaciones_ventas (sucursal_id, fecha, archivo_ventas, archivo_productos, total, suma_productos, productos, pedidos, formato, importado_por)
  values (v_s, d2, 'excel.xlsx', null, 100, 100, 1, 1, 'datos_brutos', v_a) returning id into v_imp2;
  insert into ventas_dia (sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, importacion_id) values (v_s, d2, 1, 100, 100, 0, 0, 13.79, v_imp2);
  v_r := sincronizar_ventas_dodo(v_s, d2, res, des, ped, prod);
  if v_r <> 'excel' or (select total from ventas_dia where sucursal_id = v_s and fecha = d2) <> 100 then raise exception 'FALLÓ: el día del Excel no se toca (%)', v_r; end if;
  v_ok := array_append(v_ok, 'respeta los días del Excel');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 2: Migración** — `supabase/migrations/20261020180000_sincronizacion_dodois.sql`:

```sql
-- Sincronización de ventas con la API de Dodo IS: conexión (tokens en el Vault), sucursal ↔ unidad de Dodo, registro de
-- sincronizaciones y la función que guarda un día con la misma forma que "Datos brutos", reutilizando el registro de
-- importación del día (así una conciliación sigue aplicando). Quita la prueba de canje del 2026-10-14.
-- Requiere todas las migraciones anteriores (0001–0072 y 20261020013338).

alter table sucursales add column if not exists dodois_unit_id text unique;

do $$ declare c text; begin
  for c in select conname from pg_constraint
            where conrelid = 'importaciones_ventas'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%formato%' loop
    execute format('alter table importaciones_ventas drop constraint %I', c);
  end loop;
end $$;
alter table importaciones_ventas add constraint importaciones_ventas_formato_check check (formato in ('ventas_productos', 'datos_brutos', 'api'));

create table dodois_conexion (
  id                boolean primary key default true check (id),
  conectado_por     uuid not null references perfiles(id),
  conectado_en      timestamptz not null default now(),
  unidades          jsonb not null default '[]',
  scopes            text not null default '',
  refresh_secret_id uuid,
  access_secret_id  uuid,
  access_expira     timestamptz,
  renovando_hasta   timestamptz,
  estado            text not null default 'conectada' check (estado in ('conectada', 'requiere_reconectar')),
  ultimo_error      text
);
alter table dodois_conexion enable row level security;
create policy ver_dodois_conexion on dodois_conexion for select using (ve_finanzas());
revoke all on dodois_conexion from anon, authenticated;
grant select (id, conectado_por, conectado_en, unidades, scopes, access_expira, estado, ultimo_error) on dodois_conexion to authenticated;

create table dodois_sincronizaciones (
  id           bigint generated always as identity primary key,
  inicio       timestamptz not null default now(),
  fin          timestamptz,
  origen       text not null check (origen in ('cron', 'noche', 'manual')),
  sucursal_id  uuid references sucursales(id),
  fecha        date,
  pedidos      integer,
  total        numeric(12,2),
  estado       text not null check (estado in ('ok', 'omitido', 'error')),
  mensaje      text,
  desconocidos jsonb not null default '[]'
);
create index dodois_sincronizaciones_inicio on dodois_sincronizaciones (inicio desc);
alter table dodois_sincronizaciones enable row level security;
create policy ver_dodois_sincronizaciones on dodois_sincronizaciones for select using (ve_finanzas());
revoke all on dodois_sincronizaciones from anon, authenticated;
grant select on dodois_sincronizaciones to authenticated;

-- Guarda o reemplaza un secreto del Vault por nombre; devuelve su id.
create or replace function dodois_secreto(p_nombre text, p_valor text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = p_nombre;
  if v_id is null then return vault.create_secret(p_valor, p_nombre, 'Dodo IS (sincronización de ventas)'); end if;
  perform vault.update_secret(v_id, p_valor);
  return v_id;
end $$;
revoke execute on function dodois_secreto(text, text) from public, anon, authenticated;

create or replace function exigir_servidor() returns void
language plpgsql stable as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Solo el servidor.'; end if;
end $$;

-- Admin conecta (desde /api/dodois/callback): guarda los tokens y liga sucursales por nombre si aún no lo están.
create or replace function dodois_conectar(p_refresh text, p_access text, p_expira timestamptz, p_unidades jsonb, p_scopes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_r uuid; v_a uuid;
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador conecta Dodo IS.'; end if;
  v_r := dodois_secreto('dodois_refresh_token', p_refresh);
  v_a := dodois_secreto('dodois_access_token', p_access);
  insert into dodois_conexion (id, conectado_por, conectado_en, unidades, scopes, refresh_secret_id, access_secret_id, access_expira, renovando_hasta, estado, ultimo_error)
  values (true, auth.uid(), now(), coalesce(p_unidades, '[]'), coalesce(p_scopes, ''), v_r, v_a, p_expira, null, 'conectada', null)
  on conflict (id) do update set conectado_por = excluded.conectado_por, conectado_en = excluded.conectado_en, unidades = excluded.unidades,
    scopes = excluded.scopes, refresh_secret_id = excluded.refresh_secret_id, access_secret_id = excluded.access_secret_id,
    access_expira = excluded.access_expira, renovando_hasta = null, estado = 'conectada', ultimo_error = null;
  update sucursales s set dodois_unit_id = u->>'id'
    from jsonb_array_elements(coalesce(p_unidades, '[]')) u
   where lower(s.nombre) = lower(u->>'name') and s.dodois_unit_id is null
     and not exists (select 1 from sucursales o where o.dodois_unit_id = u->>'id');
end $$;

create or replace function ligar_unidad_dodois(p_sucursal uuid, p_unit text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(mi_rol()::text, '') <> 'admin' then raise exception 'Solo un administrador liga sucursales con Dodo IS.'; end if;
  update sucursales set dodois_unit_id = nullif(trim(p_unit), '') where id = p_sucursal;
  if not found then raise exception 'Sucursal no encontrada.'; end if;
exception when unique_violation then
  raise exception 'Esa unidad de Dodo IS ya está ligada a otra sucursal.';
end $$;

create or replace function dodois_tokens() returns table (refresh text, access text, access_expira timestamptz, estado text)
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  return query select (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.refresh_secret_id),
                      (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.access_secret_id),
                      c.access_expira, c.estado
                 from dodois_conexion c;
end $$;

-- Solo una renovación a la vez: el token de renovación es de un solo uso.
create or replace function dodois_tomar_renovacion() returns boolean
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  update dodois_conexion set renovando_hasta = now() + interval '30 seconds' where renovando_hasta is null or renovando_hasta < now();
  return found;
end $$;

create or replace function dodois_guardar_tokens(p_refresh text, p_access text, p_expira timestamptz) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  perform dodois_secreto('dodois_refresh_token', p_refresh);
  perform dodois_secreto('dodois_access_token', p_access);
  update dodois_conexion set access_expira = p_expira, renovando_hasta = null, estado = 'conectada', ultimo_error = null;
end $$;

create or replace function dodois_marcar_error(p_mensaje text, p_reconectar boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_servidor();
  update dodois_conexion set ultimo_error = left(p_mensaje, 500), renovando_hasta = null,
    estado = case when p_reconectar then 'requiere_reconectar' else estado end;
end $$;

-- Un día de una sucursal con la forma de "Datos brutos". 'excel': el día vino del Excel y no se toca; 'vacio': sin pedidos.
create or replace function sincronizar_ventas_dodo(p_sucursal uuid, p_fecha date, p_resumen jsonb, p_desglose jsonb, p_pedidos jsonb, p_productos jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_previa ventas_dia; v_formato text; v_imp uuid; v_dia uuid; v_por uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Solo el servidor sincroniza ventas.'; end if;
  select conectado_por into v_por from dodois_conexion;
  if v_por is null then raise exception 'Dodo IS no está conectado.'; end if;
  perform pg_advisory_xact_lock(hashtext(p_sucursal::text || p_fecha::text));

  select * into v_previa from ventas_dia where sucursal_id = p_sucursal and fecha = p_fecha;
  if v_previa.id is not null then
    select formato into v_formato from importaciones_ventas where id = v_previa.importacion_id;
    if v_formato is distinct from 'api' then return 'excel'; end if;
    v_imp := v_previa.importacion_id;
  elsif jsonb_array_length(coalesce(p_pedidos, '[]')) = 0 then
    return 'vacio';
  end if;

  if v_imp is null then
    insert into importaciones_ventas (sucursal_id, fecha, archivo_ventas, archivo_productos, total, suma_productos, productos, pedidos, formato, importado_por)
    values (p_sucursal, p_fecha, 'API Dodo IS', null, (p_resumen->>'total')::numeric, coalesce((p_resumen->>'suma_productos')::numeric, 0),
            coalesce((p_resumen->>'productos')::integer, 0), (p_resumen->>'pedidos')::integer, 'api', v_por)
    returning id into v_imp;
  else
    update importaciones_ventas set total = (p_resumen->>'total')::numeric, suma_productos = coalesce((p_resumen->>'suma_productos')::numeric, 0),
      productos = coalesce((p_resumen->>'productos')::integer, 0), pedidos = (p_resumen->>'pedidos')::integer, importado_en = now()
     where id = v_imp;
  end if;

  drop table if exists tmp_pedidos, tmp_productos;
  create temp table tmp_pedidos on commit drop as
    select * from jsonb_to_recordset(coalesce(p_pedidos, '[]')) as x(
      dodo_id text, hora time, pago text, tipo text, origen text, origen_dodo text, para_llevar boolean, estado text, total numeric,
      total_sin_descuento numeric, iva numeric, productos integer, promocion text, turno_dodo text, agregador text);
  create temp table tmp_productos on commit drop as
    select * from jsonb_to_recordset(coalesce(p_productos, '[]')) as x(
      pedido_id text, renglon integer, dodo_uuid text, nombre text, tamano text, precio numeric, precio_sin_descuento numeric, combo text);

  -- Catálogo, igual que importar_datos_brutos.
  insert into productos_codigos (dodo_uuid, dodo_id)
  select x.dodo_uuid, (select min(pv.dodo_id) from productos_venta pv where lower(pv.nombre) = lower(x.nombre))
    from (select distinct on (dodo_uuid) dodo_uuid, nombre from tmp_productos order by dodo_uuid, nombre) x
   where not exists (select 1 from productos_codigos c where c.dodo_uuid = x.dodo_uuid)
     and exists (select 1 from productos_venta pv where lower(pv.nombre) = lower(x.nombre));
  insert into productos_venta (dodo_id, nombre, tamano)
  select nextval('productos_venta_interno'), x.nombre, nullif(x.tamano, '')
    from (select distinct on (lower(t.nombre)) t.nombre, t.tamano from tmp_productos t
           where not exists (select 1 from productos_codigos c where c.dodo_uuid = t.dodo_uuid) order by lower(t.nombre), t.nombre) x;
  insert into productos_codigos (dodo_uuid, dodo_id)
  select x.dodo_uuid, (select min(pv.dodo_id) from productos_venta pv where lower(pv.nombre) = lower(x.nombre))
    from (select distinct on (dodo_uuid) dodo_uuid, nombre from tmp_productos order by dodo_uuid, nombre) x
   where not exists (select 1 from productos_codigos c where c.dodo_uuid = x.dodo_uuid);

  -- Pedidos sincronizados de este día que ya no vienen (cancelados o devueltos después) se quitan; los demás se guardan.
  delete from pedidos where importacion_id = v_imp and dodo_id not in (select dodo_id from tmp_pedidos);
  insert into pedidos (dodo_id, sucursal_id, fecha, hora, pago, tipo, origen, origen_dodo, para_llevar, estado, total, total_sin_descuento,
                       iva, productos, promocion, turno_dodo, agregador, importacion_id)
  select dodo_id, p_sucursal, p_fecha, hora, pago, tipo, origen, origen_dodo, coalesce(para_llevar, false), estado, total, total_sin_descuento,
         coalesce(iva, 0), coalesce(productos, 0), promocion, turno_dodo, agregador, v_imp
    from tmp_pedidos
  on conflict (dodo_id) do update set hora = excluded.hora, pago = excluded.pago, tipo = excluded.tipo, origen = excluded.origen,
    origen_dodo = excluded.origen_dodo, para_llevar = excluded.para_llevar, estado = excluded.estado, total = excluded.total,
    total_sin_descuento = excluded.total_sin_descuento, iva = excluded.iva, productos = excluded.productos, promocion = excluded.promocion,
    turno_dodo = excluded.turno_dodo, agregador = excluded.agregador, importacion_id = excluded.importacion_id;
  delete from pedido_productos where pedido_id in (select dodo_id from tmp_pedidos);
  insert into pedido_productos (pedido_id, renglon, dodo_uuid, dodo_id, nombre, precio, precio_sin_descuento, costo_dodo, combo)
  select t.pedido_id, t.renglon, t.dodo_uuid, c.dodo_id, t.nombre, t.precio, t.precio_sin_descuento, null, t.combo
    from tmp_productos t join tmp_pedidos p on p.dodo_id = t.pedido_id join productos_codigos c on c.dodo_uuid = t.dodo_uuid;

  insert into ventas_dia (sucursal_id, fecha, pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2, importacion_id)
  values (p_sucursal, p_fecha, (p_resumen->>'pedidos')::integer, (p_resumen->>'total')::numeric, (p_resumen->>'efectivo')::numeric,
          (p_resumen->>'tarjeta')::numeric, (p_resumen->>'en_linea')::numeric, (p_resumen->>'iva')::numeric, (p_resumen->>'venta_m2')::numeric, v_imp)
  on conflict (sucursal_id, fecha) do update set pedidos = excluded.pedidos, total = excluded.total, efectivo = excluded.efectivo,
    tarjeta = excluded.tarjeta, en_linea = excluded.en_linea, iva = excluded.iva, venta_m2 = excluded.venta_m2, importacion_id = excluded.importacion_id
  returning id into v_dia;
  delete from ventas_dia_desglose where ventas_dia_id = v_dia;
  insert into ventas_dia_desglose (ventas_dia_id, tipo, pedidos, total, efectivo, tarjeta, en_linea, iva)
  select v_dia, x->>'tipo', (x->>'pedidos')::integer, (x->>'total')::numeric, (x->>'efectivo')::numeric, (x->>'tarjeta')::numeric,
         (x->>'en_linea')::numeric, (x->>'iva')::numeric
    from jsonb_array_elements(coalesce(p_desglose, '[]')) x;
  delete from ventas_producto where sucursal_id = p_sucursal and fecha = p_fecha;
  insert into ventas_producto (sucursal_id, fecha, dodo_id, nombre, cantidad, importe, importe_sin_descuento)
  select p_sucursal, p_fecha, pp.dodo_id, min(pp.nombre), count(*), sum(pp.precio), sum(pp.precio_sin_descuento)
    from pedido_productos pp join pedidos p on p.dodo_id = pp.pedido_id
   where p.sucursal_id = p_sucursal and p.fecha = p_fecha and p.estado = 'entregado' and p.tipo <> 'personal'
   group by pp.dodo_id;

  -- Una conciliación conserva la suma original de las formas de pago: si cambiaron, deja de aplicar.
  if v_previa.id is not null and (v_previa.efectivo, v_previa.tarjeta, v_previa.en_linea) is distinct from
     ((p_resumen->>'efectivo')::numeric, (p_resumen->>'tarjeta')::numeric, (p_resumen->>'en_linea')::numeric) then
    update ventas_conciliaciones set anulado_en = now(), anulado_por = v_por, motivo_anulacion = 'La venta de Dodo IS cambió después de conciliar.'
     where importacion_id = v_imp and anulado_en is null;
  end if;
  return 'ok';
end $$;

-- pg_cron llama esto: avisa a la app (Vercel) con la clave compartida. La URL y la clave viven en el Vault.
create extension if not exists pg_net;
create or replace function dodois_disparar(p_origen text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_clave text; v_url text;
begin
  select decrypted_secret into v_clave from vault.decrypted_secrets where name = 'dodois_cron_secret';
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'dodois_sync_url';
  if v_clave is null or v_url is null then raise exception 'Faltan dodois_cron_secret o dodois_sync_url en el Vault.'; end if;
  return net.http_post(url := v_url, body := jsonb_build_object('origen', p_origen),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_clave), timeout_milliseconds := 60000);
end $$;

revoke execute on function dodois_conectar(text, text, timestamptz, jsonb, text), ligar_unidad_dodois(uuid, text) from public, anon;
grant execute on function dodois_conectar(text, text, timestamptz, jsonb, text), ligar_unidad_dodois(uuid, text) to authenticated;
revoke execute on function dodois_tokens(), dodois_tomar_renovacion(), dodois_guardar_tokens(text, text, timestamptz),
  dodois_marcar_error(text, boolean), sincronizar_ventas_dodo(uuid, date, jsonb, jsonb, jsonb, jsonb), dodois_disparar(text) from public, anon, authenticated;
grant execute on function dodois_tokens(), dodois_tomar_renovacion(), dodois_guardar_tokens(text, text, timestamptz),
  dodois_marcar_error(text, boolean), sincronizar_ventas_dodo(uuid, date, jsonb, jsonb, jsonb, jsonb) to service_role;

-- Fin de la prueba del 2026-10-14.
drop function if exists dodois_canjear_codigo(text, text, text, text);
delete from vault.secrets where name = 'dodois_client_secret';
```

Nota para el implementador: la prueba SQL corre como `postgres` y llama a funciones con `revoke ... from authenticated`; `postgres` es dueño y las puede ejecutar. Las llamadas "como usuario" dentro de la prueba solo cambian `request.jwt.claims`, que es lo que leen `auth.role()` y `mi_rol()`.

- [ ] **Step 3: Revisar**

Run: `grep -n "raise" supabase/migrations/20261020180000_sincronizacion_dodois.sql supabase/pruebas/20261020180000_sincronizacion_dodois.sql`
Expected: cada `%` con su parámetro.

- [ ] **Step 4: Commit**

```bash
git add supabase
git commit -m "feat(dodois): conexión, registro y sincronización de ventas en la base"
```

---

### Task 3: Cliente de Dodo IS, sincronización y rutas

**Files:** Create `lib/dodois/cliente.ts`, `app/ventas/dodois/sincronizar.ts`, `app/api/dodois/conectar/route.ts`, `app/api/dodois/sincronizar/route.ts`; Replace `app/api/dodois/callback/route.ts`; Delete `app/api/dodois/login/route.ts`, `app/api/dodois/diagnostico/route.ts`, `supabase/correcciones/2026-10-14_dodois_canje_prueba.sql`.

**Interfaces — Consumes:** Tarea 1 (`traducirVentas`, `ventanaDelDia`, `fechaASincronizar`, `VentaApi`, `OrigenSincronizacion`), Tarea 2 (RPCs). `crearClienteAdmin` de `lib/supabase/admin.ts`; `obtenerPerfil`; `resumirDias`, `ivaDe` de `lib/ventas/pedidos`; `tamanoPorNombre` de `lib/ventas/calculos`.
**Produces:** `sincronizarVentas(admin, origen, { fecha?, simular? }): Promise<ResultadoDia[]>`; `type ResultadoDia = { sucursal: string; fecha: string; estado: "ok" | "omitido" | "error"; pedidos: number; total: number; mensaje: string }`.

- [ ] **Step 1: Cliente** — `lib/dodois/cliente.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { VentaApi } from "./ventas";

export const AUTH = "https://auth.dodois.com";
export const API = "https://api.dodois.com";
export const SCOPES = "openid offline_access user.role:read sales accounting:read unit:read productionefficiency";

export class ErrorDodo extends Error {
  constructor(mensaje: string, readonly reconectar = false) { super(mensaje); }
}

export type Tokens = { access_token: string; refresh_token: string; expires_in: number; scope?: string };
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Canje o renovación en el servidor de tokens de Dodo IS (desde Vercel; Dodo ya no lo bloquea). */
export async function pedirToken(campos: Record<string, string>): Promise<Tokens> {
  const r = await fetch(`${AUTH}/connect/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.DODOIS_CLIENT_ID ?? "", client_secret: process.env.DODOIS_CLIENT_SECRET ?? "", ...campos }),
  });
  const t = await r.json().catch(() => ({})) as Partial<Tokens> & { error?: string };
  if (!r.ok || !t.access_token || !t.refresh_token) {
    throw new ErrorDodo(`Dodo IS no dio el token (${r.status}${t.error ? ` ${t.error}` : ""}).`, t.error === "invalid_grant");
  }
  return t as Tokens;
}

/** Token de acceso vigente: el guardado si le quedan más de 5 minutos; si no, lo renueva uno a la vez y guarda el nuevo par. */
export async function tokenDeAcceso(admin: SupabaseClient): Promise<string> {
  for (let intento = 0; intento < 5; intento++) {
    const { data, error } = await admin.rpc("dodois_tokens").maybeSingle<{ refresh: string | null; access: string | null; access_expira: string | null; estado: string }>();
    if (error || !data) throw new ErrorDodo("Dodo IS no está conectado.");
    if (data.estado === "requiere_reconectar") throw new ErrorDodo("Hay que reconectar Dodo IS.", true);
    if (data.access && data.access_expira && Date.parse(data.access_expira) - Date.now() > 5 * 60_000) return data.access;
    const { data: toca } = await admin.rpc("dodois_tomar_renovacion");
    if (toca) {
      try {
        const t = await pedirToken({ grant_type: "refresh_token", refresh_token: data.refresh ?? "" });
        await admin.rpc("dodois_guardar_tokens", { p_refresh: t.refresh_token, p_access: t.access_token, p_expira: new Date(Date.now() + t.expires_in * 1000).toISOString() });
        return t.access_token;
      } catch (e) {
        await admin.rpc("dodois_marcar_error", { p_mensaje: (e as Error).message, p_reconectar: e instanceof ErrorDodo && e.reconectar });
        throw e;
      }
    }
    await esperar(2000);
  }
  throw new ErrorDodo("Otra sincronización está renovando el token; se reintenta en la siguiente.");
}

/** GET con el token; reintenta 429 y 5xx dos veces. */
export async function getDodo<T>(token: string, url: string): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return r.json() as Promise<T>;
    if (r.status === 401) throw new ErrorDodo("Dodo IS rechazó el token (401).");
    if ((r.status === 429 || r.status >= 500) && i < 2) { await esperar(1500 * (i + 1)); continue; }
    throw new ErrorDodo(`Dodo IS respondió ${r.status} en ${new URL(url).pathname}.`);
  }
}

/** Ventas de una unidad en una ventana, página por página hasta `isEndOfListReached` (corta si una página no trae nada nuevo). */
export async function ventasDelDia(token: string, unitId: string, ventana: { from: string; to: string }): Promise<VentaApi[]> {
  const todas = new Map<string, VentaApi>();
  for (let skip = 0, pagina = 0; pagina < 20; pagina++) {
    const r = await getDodo<{ sales: VentaApi[]; isEndOfListReached: boolean }>(token,
      `${API}/dodopizza/mx/accounting/sales?units=${unitId}&from=${ventana.from}&to=${ventana.to}&skip=${skip}&take=1000`);
    const antes = todas.size;
    for (const v of r.sales ?? []) todas.set(v.orderId, v);
    if (r.isEndOfListReached || todas.size === antes) return [...todas.values()];
    skip += (r.sales ?? []).length;
  }
  throw new ErrorDodo("La venta del día trae demasiadas páginas.");
}
```

- [ ] **Step 2: Sincronización** — `app/ventas/dodois/sincronizar.ts`:

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ErrorDodo, tokenDeAcceso, ventasDelDia } from "@/lib/dodois/cliente";
import { fechaASincronizar, traducirVentas, ventanaDelDia, type OrigenSincronizacion } from "@/lib/dodois/ventas";
import { tamanoPorNombre } from "@/lib/ventas/calculos";
import { ivaDe, resumirDias } from "@/lib/ventas/pedidos";

export type ResultadoDia = { sucursal: string; fecha: string; estado: "ok" | "omitido" | "error"; pedidos: number; total: number; mensaje: string };
const centavos = (n: number) => Math.round(n * 100) / 100;

async function registrar(admin: SupabaseClient, origen: OrigenSincronizacion, sucursalId: string | null, r: ResultadoDia, desconocidos: string[], inicio: string) {
  await admin.from("dodois_sincronizaciones").insert({
    inicio, fin: new Date().toISOString(), origen, sucursal_id: sucursalId, fecha: r.fecha, pedidos: r.pedidos, total: r.total,
    estado: r.estado, mensaje: r.mensaje || null, desconocidos,
  });
}

/** Trae de Dodo IS el día completo de cada sucursal ligada y lo guarda (o solo lo calcula con `simular`). */
export async function sincronizarVentas(admin: SupabaseClient, origen: OrigenSincronizacion, opciones: { fecha?: string; simular?: boolean } = {}): Promise<ResultadoDia[]> {
  const inicio = new Date().toISOString();
  const fecha = opciones.fecha ?? fechaASincronizar(origen, inicio);
  const resultados: ResultadoDia[] = [];
  let token: string;
  try {
    token = await tokenDeAcceso(admin);
  } catch (e) {
    const r: ResultadoDia = { sucursal: "—", fecha, estado: "error", pedidos: 0, total: 0, mensaje: (e as Error).message };
    if (!opciones.simular) await registrar(admin, origen, null, r, [], inicio);
    return [r];
  }
  const { data: sucursales } = await admin.from("sucursales").select("id, nombre, m2_comedor, dodois_unit_id").not("dodois_unit_id", "is", null).order("nombre")
    .returns<{ id: string; nombre: string; m2_comedor: number | null; dodois_unit_id: string }[]>();
  if (!(sucursales ?? []).length) return [{ sucursal: "—", fecha, estado: "omitido", pedidos: 0, total: 0, mensaje: "No hay sucursales ligadas a Dodo IS." }];

  for (const s of sucursales ?? []) {
    let desconocidos: string[] = [];
    let r: ResultadoDia;
    try {
      const ventas = await ventasDelDia(token, s.dodois_unit_id, ventanaDelDia(fecha));
      const t = traducirVentas(ventas, { sucursalDeUnidad: new Map([[s.dodois_unit_id, s.id]]), tamanoDe: tamanoPorNombre, ivaDe });
      desconocidos = t.desconocidos;
      const pedidos = t.pedidos.filter((p) => p.fecha === fecha);
      const ids = new Set(pedidos.map((p) => p.dodo_id));
      const productos = t.productos.filter((x) => ids.has(x.pedido_id));
      const dia = resumirDias(
        pedidos.map((p) => ({ ...p, sucursal: s.id, inicio_coccion: null, listo: null, entregado: null })),
        productos.map((x) => ({ pedido_id: x.pedido_id, nombre: x.nombre, precio: x.precio, combo: x.combo })))[0];
      const resumen = dia && {
        ...dia.resumen,
        venta_m2: s.m2_comedor ? centavos(dia.resumen.total / Number(s.m2_comedor)) : null,
        suma_productos: dia.productos.suma, productos: dia.productos.piezas,
      };
      if (opciones.simular) {
        r = { sucursal: s.nombre, fecha, estado: "ok", pedidos: resumen?.pedidos ?? 0, total: resumen?.total ?? 0, mensaje: "Simulación: no se guardó." };
      } else {
        const { data, error } = await admin.rpc("sincronizar_ventas_dodo", {
          p_sucursal: s.id, p_fecha: fecha, p_resumen: resumen ?? { pedidos: 0, total: 0, efectivo: 0, tarjeta: 0, en_linea: 0, iva: 0, venta_m2: null, suma_productos: 0, productos: 0 },
          p_desglose: dia?.desglose ?? [], p_pedidos: pedidos, p_productos: productos,
        });
        if (error) throw new Error(error.message);
        const estado = data === "ok" ? "ok" : "omitido";
        const mensaje = data === "excel" ? "Día importado de Excel: se respeta." : data === "vacio" ? "Sin ventas todavía." : "";
        r = { sucursal: s.nombre, fecha, estado, pedidos: resumen?.pedidos ?? 0, total: resumen?.total ?? 0, mensaje };
      }
    } catch (e) {
      r = { sucursal: s.nombre, fecha, estado: "error", pedidos: 0, total: 0, mensaje: (e as Error).message };
      if (e instanceof ErrorDodo && e.reconectar) await admin.rpc("dodois_marcar_error", { p_mensaje: r.mensaje, p_reconectar: true });
    }
    resultados.push(r);
    if (!opciones.simular) await registrar(admin, origen, s.id, r, desconocidos, inicio);
  }
  if (!opciones.simular) await admin.from("dodois_sincronizaciones").delete().lt("inicio", new Date(Date.now() - 60 * 86_400_000).toISOString());
  return resultados;
}
```

- [ ] **Step 3: Rutas.**

`app/api/dodois/conectar/route.ts`:

```ts
// Conectar Dodo IS (solo admin): OAuth 2 + PKCE en auth.dodois.com.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH, SCOPES } from "@/lib/dodois/cliente";
import { obtenerPerfil } from "@/lib/contexto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { perfil } = await obtenerPerfil();
  const origen = new URL(request.url).origin;
  if (perfil.rol !== "admin") return NextResponse.redirect(`${origen}/ventas`);
  if (!process.env.DODOIS_CLIENT_ID || !process.env.DODOIS_CLIENT_SECRET) {
    return NextResponse.redirect(`${origen}/ventas/dodois?error=${encodeURIComponent("Faltan DODOIS_CLIENT_ID o DODOIS_CLIENT_SECRET en Vercel.")}`);
  }
  const verifier = randomBytes(32).toString("base64url"), state = randomBytes(16).toString("base64url");
  (await cookies()).set("dodois_pkce", JSON.stringify({ verifier, state }), { httpOnly: true, secure: true, sameSite: "lax", path: "/api/dodois", maxAge: 600 });
  const url = new URL(`${AUTH}/connect/authorize`);
  url.search = new URLSearchParams({
    client_id: process.env.DODOIS_CLIENT_ID, redirect_uri: `${origen}/api/dodois/callback`, response_type: "code", scope: SCOPES,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state,
  }).toString();
  return NextResponse.redirect(url);
}
```

`app/api/dodois/callback/route.ts` (reemplaza el de prueba):

```ts
// Regreso de Dodo IS: canjea el código, lee las unidades y guarda la conexión (tokens al Vault). No muestra tokens.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API, getDodo, pedirToken } from "@/lib/dodois/cliente";
import { obtenerPerfil } from "@/lib/contexto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { supabase, perfil } = await obtenerPerfil();
  const url = new URL(request.url);
  const volver = (clave: "ok" | "error", texto: string) => NextResponse.redirect(`${url.origin}/ventas/dodois?${clave}=${encodeURIComponent(texto)}`);
  if (perfil.rol !== "admin") return NextResponse.redirect(`${url.origin}/ventas`);
  if (url.searchParams.get("error")) return volver("error", `Dodo IS no dio permiso: ${url.searchParams.get("error_description") ?? url.searchParams.get("error")}`);
  const jar = await cookies();
  const guardado = JSON.parse(jar.get("dodois_pkce")?.value ?? "{}") as { verifier?: string; state?: string };
  jar.delete({ name: "dodois_pkce", path: "/api/dodois" });
  const code = url.searchParams.get("code");
  if (!code || !guardado.verifier || url.searchParams.get("state") !== guardado.state) return volver("error", "La conexión expiró; vuelve a darle Conectar.");
  try {
    const t = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: `${url.origin}/api/dodois/callback`, code_verifier: guardado.verifier });
    const unidades = await getDodo<{ id: string; name: string }[]>(t.access_token, `${API}/auth/roles/units`);
    const { error } = await supabase.rpc("dodois_conectar", {
      p_refresh: t.refresh_token, p_access: t.access_token, p_expira: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      p_unidades: unidades.map((u) => ({ id: u.id, name: u.name })), p_scopes: t.scope ?? "",
    });
    if (error) return volver("error", error.message);
  } catch (e) {
    return volver("error", (e as Error).message);
  }
  return volver("ok", "Dodo IS conectado.");
}
```

`app/api/dodois/sincronizar/route.ts`:

```ts
// Sincronización de ventas. La llama pg_cron (clave compartida) o un admin ("Actualizar ahora"; ?simular=1 calcula sin guardar).
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sincronizarVentas } from "@/app/ventas/dodois/sincronizar";
import type { OrigenSincronizacion } from "@/lib/dodois/ventas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: Request) {
  const clave = process.env.DODOIS_CRON_SECRET ?? "";
  const porCron = clave.length >= 32 && igual(request.headers.get("authorization") ?? "", `Bearer ${clave}`);
  const url = new URL(request.url);
  let origen: OrigenSincronizacion = "manual";
  if (porCron) {
    const cuerpo = await request.json().catch(() => ({})) as { origen?: string };
    origen = cuerpo.origen === "noche" ? "noche" : "cron";
  } else {
    const { perfil } = await obtenerPerfil();
    if (perfil.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  }
  const fecha = url.searchParams.get("fecha");
  const resultados = await sincronizarVentas(crearClienteAdmin(), origen, {
    fecha: !porCron && fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined,
    simular: !porCron && url.searchParams.get("simular") === "1",
  });
  return NextResponse.json({ origen, resultados });
}
```

Borra `app/api/dodois/login/route.ts`, `app/api/dodois/diagnostico/route.ts` y `supabase/correcciones/2026-10-14_dodois_canje_prueba.sql` (`git rm`).

- [ ] **Step 4: Verificar**

Run: `node node_modules/typescript/bin/tsc --noEmit` (si `.next/types` está viejo, `rm -rf .next/types`), `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` y `npx next build > ../build.txt 2>&1; echo $?` (y `grep -E "dodois|Failed|error" ../build.txt`).
Expected: sin errores; todas pasan; build 0 con las rutas `/api/dodois/conectar`, `/api/dodois/callback`, `/api/dodois/sincronizar`.

- [ ] **Step 5: Commit**

```bash
git add -A app lib supabase
git commit -m "feat(dodois): cliente con tokens en el Vault, sincronización por día y rutas"
```

---

### Task 4: Pantalla Dodo IS, menú y aviso en Ventas

**Files:** Create `app/ventas/dodois/page.tsx`, `app/ventas/dodois/acciones.ts`; Modify `lib/roles.ts`, `lib/roles.test.ts`, `app/ventas/page.tsx`.

**Interfaces — Consumes:** `sincronizarVentas`, `ResultadoDia` (Tarea 3); `ligar_unidad_dodois` (Tarea 2); `crearClienteAdmin`; `puedeImportarVentas`.

- [ ] **Step 1: Prueba del menú.** En `lib/roles.test.ts` reemplaza
`assert.deepEqual(grupo("admin", "Ventas"), ["/ventas", "/ventas/rappi", "/ventas/conciliacion", "/ventas/importar", "/ventas/costos"]);`
por
`assert.deepEqual(grupo("admin", "Ventas"), ["/ventas", "/ventas/rappi", "/ventas/conciliacion", "/ventas/importar", "/ventas/dodois", "/ventas/costos"]);`

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` → Expected: FAIL (falta el enlace).

- [ ] **Step 2: Menú.** En `lib/roles.ts`, después de `...(puedeImportarVentas(rol) ? [{ href: "/ventas/importar", texto: "Importar" }] : []),` agrega
`...(puedeImportarVentas(rol) ? [{ href: "/ventas/dodois", texto: "Dodo IS" }] : []),`

Run: `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` → Expected: todas pasan.

- [ ] **Step 3: Acciones** — `app/ventas/dodois/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sincronizarVentas } from "./sincronizar";

const RUTA = "/ventas/dodois";
const volver = (clave: "ok" | "error", texto: string): never => redirect(`${RUTA}?${clave}=${encodeURIComponent(texto)}`);

async function soloAdmin() {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) volver("error", "Solo un administrador.");
  return supabase;
}

export async function actualizarAhora(fd: FormData) {
  await soloAdmin();
  const fecha = String(fd.get("fecha") ?? "").trim();
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) volver("error", "Revisa la fecha.");
  const simular = fd.get("simular") === "si";
  const r = await sincronizarVentas(crearClienteAdmin(), "manual", { fecha: fecha || undefined, simular });
  revalidatePath("/ventas", "layout");
  const texto = r.map((x) => `${x.sucursal} ${x.fecha}: ${x.estado === "error" ? `error — ${x.mensaje}` : `${x.pedidos} pedidos, ${pesos(x.total)}${x.mensaje ? ` (${x.mensaje})` : ""}`}`).join(" · ");
  volver(r.some((x) => x.estado === "error") ? "error" : "ok", texto);
}

export async function ligarUnidad(fd: FormData) {
  const supabase = await soloAdmin();
  const { error } = await supabase.rpc("ligar_unidad_dodois", { p_sucursal: String(fd.get("sucursal_id") ?? ""), p_unit: String(fd.get("unidad") ?? "") });
  if (error) volver("error", error.message);
  revalidatePath(RUTA);
  volver("ok", "Sucursal ligada.");
}
```

- [ ] **Step 4: Pantalla** — `app/ventas/dodois/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaMX, fechaTexto, hora, hoyCalendarioMX, pesos } from "@/lib/formato";
import { puedeImportarVentas } from "@/lib/roles";
import { actualizarAhora, ligarUnidad } from "./acciones";

type Conexion = { conectado_en: string; estado: string; ultimo_error: string | null; unidades: { id: string; name: string }[]; perfiles: { nombre: string } | null };
type Registro = { id: number; inicio: string; origen: string; fecha: string | null; pedidos: number | null; total: number | null; estado: string; mensaje: string | null; sucursales: { nombre: string } | null };
const ORIGEN: Record<string, string> = { cron: "Cada 15 min", noche: "Cierre 3 a.m.", manual: "Manual" };

/** Conexión con Dodo IS: estado, sucursales ligadas, actualizar ahora y últimas sincronizaciones. Solo admin. */
export default async function PaginaDodoIS({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeImportarVentas(perfil.rol)) redirect("/ventas");
  const [{ data: conexion }, { data: sucursales }, { data: registros }] = await Promise.all([
    supabase.from("dodois_conexion").select("conectado_en, estado, ultimo_error, unidades, perfiles(nombre)").maybeSingle<Conexion>(),
    supabase.from("sucursales").select("id, nombre, dodois_unit_id").order("nombre").returns<{ id: string; nombre: string; dodois_unit_id: string | null }[]>(),
    supabase.from("dodois_sincronizaciones").select("id, inicio, origen, fecha, pedidos, total, estado, mensaje, sucursales(nombre)")
      .order("inicio", { ascending: false }).limit(20).returns<Registro[]>(),
  ]);
  const unidades = conexion?.unidades ?? [];
  return (
    <>
      <EncabezadoPagina titulo="Dodo IS" descripcion="Las ventas llegan solas cada 15 minutos de 10:00 a 0:00 y el día anterior se cierra a las 3 a.m. Los días importados del Excel no se tocan." />
      <Aviso ok={ok} error={error} />

      <section className="seccion">
        <h2>Conexión</h2>
        {!conexion ? <p className="vacio">Dodo IS no está conectado.</p> : (
          <dl className="tarjeta-datos">
            <dt>Estado</dt><dd>{conexion.estado === "conectada" ? "Conectada" : "Hay que reconectar"}</dd>
            <dt>Conectada por</dt><dd>{conexion.perfiles?.nombre ?? "—"} · {fechaTexto(fechaMX(conexion.conectado_en))}</dd>
            {conexion.ultimo_error && <><dt>Último error</dt><dd>{conexion.ultimo_error}</dd></>}
          </dl>
        )}
        <p><a className={conexion?.estado === "conectada" ? "boton boton-secundario" : "boton"} href="/api/dodois/conectar">{conexion ? "Reconectar" : "Conectar con Dodo IS"}</a></p>
      </section>

      {conexion && (
        <section className="seccion">
          <h2>Sucursales</h2>
          <ul className="lista-filas" style={{ "--columnas": 1 } as React.CSSProperties}>
            {(sucursales ?? []).map((s) => (
              <li key={s.id} className="fila" data-alerta={s.dodois_unit_id ? undefined : "si"}>
                <div className="fila-nombre"><strong>{s.nombre}</strong><small>{s.dodois_unit_id ? "Sincroniza" : "Sin ligar: no sincroniza"}</small></div>
                <div className="fila-datos"><span>
                  <form action={ligarUnidad} className="acciones">
                    <input type="hidden" name="sucursal_id" value={s.id} />
                    <select name="unidad" defaultValue={s.dodois_unit_id ?? ""} aria-label={`Unidad de Dodo IS de ${s.nombre}`}>
                      <option value="">Sin ligar</option>
                      {unidades.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                    <BotonEnviar className="boton boton-secundario">Guardar</BotonEnviar>
                  </form>
                </span></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {conexion && (
        <section className="seccion">
          <h2>Actualizar ahora</h2>
          <form action={actualizarAhora} className="formulario">
            <div className="rejilla">
              <div className="campo"><label htmlFor="fecha">Día (vacío = hoy)</label><input id="fecha" name="fecha" type="date" max={hoyCalendarioMX()} /></div>
              <label className="campo"><span><input type="checkbox" name="simular" value="si" /> Solo calcular, sin guardar</span></label>
            </div>
            <BotonEnviar pendiente="Trayendo de Dodo IS…">Actualizar ahora</BotonEnviar>
          </form>
        </section>
      )}

      <section className="seccion">
        <h2>Últimas sincronizaciones</h2>
        {!(registros ?? []).length ? <p className="vacio">Todavía no hay sincronizaciones.</p> : (
          <ul className="lista-filas" style={{ "--columnas": 3 } as React.CSSProperties}>
            {(registros ?? []).map((r) => (
              <li key={r.id} className="fila" data-alerta={r.estado === "error" ? "si" : undefined}>
                <div className="fila-nombre"><strong>{r.sucursales?.nombre ?? "—"} · {r.fecha ? fechaTexto(r.fecha) : "—"}</strong><small>{ORIGEN[r.origen] ?? r.origen} · {fechaTexto(fechaMX(r.inicio))} {hora(r.inicio)}</small></div>
                <div className="fila-datos">
                  <span>{r.estado === "ok" ? "Al día" : r.estado === "omitido" ? "Sin cambios" : "Error"}</span>
                  <span>{r.pedidos ?? 0} pedidos · {pesos(Number(r.total ?? 0))}</span>
                  <span>{r.mensaje ?? ""}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p><Link href="/ventas/importar">Importar Datos brutos (respaldo) →</Link></p>
      </section>
    </>
  );
}
```

- [ ] **Step 5: Aviso en el tablero de Ventas.** En `app/ventas/page.tsx`, dentro del componente de la página, después de leer el perfil agrega (si `puedeImportarVentas` ya está importado, no lo dupliques):

```tsx
  const { data: dodois } = puedeImportarVentas(perfil.rol)
    ? await supabase.from("dodois_conexion").select("estado").maybeSingle<{ estado: string }>()
    : { data: null };
  const { data: ultimas } = puedeImportarVentas(perfil.rol)
    ? await supabase.from("dodois_sincronizaciones").select("estado").order("inicio", { ascending: false }).limit(3).returns<{ estado: string }[]>()
    : { data: null };
  const avisoDodo = dodois?.estado === "requiere_reconectar" ? "Hay que reconectar Dodo IS: las ventas no se están actualizando."
    : (ultimas ?? []).length === 3 && (ultimas ?? []).every((u) => u.estado === "error") ? "Las últimas 3 sincronizaciones con Dodo IS fallaron." : null;
```

y en el JSX, justo después del `<EncabezadoPagina … />` principal:

```tsx
      {avisoDodo && <p className="aviso aviso-error">{avisoDodo} <Link href="/ventas/dodois">Revisar</Link></p>}
```

(si la página obtiene el cliente con otro nombre que `supabase`, usa ese.)

- [ ] **Step 6: Verificar**

Run: `node node_modules/typescript/bin/tsc --noEmit`, `npm test 2>&1 | grep -E "^ℹ (pass|fail)"`.
Expected: sin errores; todas pasan.

Vista previa: página temporal `app/login/prueba-dodois/page.tsx` que muestre la lista de sincronizaciones y el bloque de sucursales con datos de ejemplo (copia del JSX con arreglos fijos), en computadora y celular (375 px) sin scroll horizontal; borrarla después.

- [ ] **Step 7: Commit**

```bash
git add app lib
git commit -m "feat(dodois): pantalla Dodo IS, menú y aviso en Ventas"
```

---

### Task 5: Activación (SQL para correr después del despliegue)

**Files:** Create `supabase/correcciones/2026-10-20_activar_sincronizacion_dodois.sql`.

- [ ] **Step 1: Archivo:**

```sql
-- Activa la sincronización automática de ventas con Dodo IS. Córrelo en Supabase → SQL Editor DESPUÉS de:
--   1) la migración 20261020180000_sincronizacion_dodois.sql y su prueba (PRUEBAS OK);
--   2) desplegar la app y conectar Dodo IS en Ventas → Dodo IS.
-- Paso A crea la clave compartida y la muestra UNA vez: cópiala a Vercel como DODOIS_CRON_SECRET (no la pegues en chats).

-- A. Clave compartida y dirección de la app (en el Vault).
select dodois_secreto('dodois_cron_secret', encode(extensions.gen_random_bytes(32), 'hex')) as id_clave;
select decrypted_secret as copia_esto_a_vercel_DODOIS_CRON_SECRET from vault.decrypted_secrets where name = 'dodois_cron_secret';
select dodois_secreto('dodois_sync_url', 'https://dodo-money-j31t.vercel.app/api/dodois/sincronizar') as id_url;

-- B. Tareas (UTC): cada 15 min de 16:00 a 05:59 (10:00–23:59 en CDMX) y a las 09:00 (3:00 en CDMX) el día anterior.
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname in ('dodois-ventas-15min', 'dodois-ventas-noche');
select cron.schedule('dodois-ventas-15min', '*/15 0-5,16-23 * * *', $$ select dodois_disparar('cron') $$);
select cron.schedule('dodois-ventas-noche', '0 9 * * *', $$ select dodois_disparar('noche') $$);

-- C. Revisión: deben salir las dos tareas.
select jobname, schedule, active from cron.job where jobname like 'dodois-%' order by jobname;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/correcciones/2026-10-20_activar_sincronizacion_dodois.sql
git commit -m "chore(dodois): SQL para activar la sincronización automática"
```

## Cierre (después de la revisión final)

1. Sebastián corre la migración y su prueba (PRUEBAS OK); fusionar a main; Vercel despliega.
2. En Vercel: confirmar `SUPABASE_SERVICE_ROLE_KEY`, `DODOIS_CLIENT_ID`, `DODOIS_CLIENT_SECRET`.
3. Ventas → Dodo IS → Conectar; revisar que Zapopan-1 quede ligada.
4. "Actualizar ahora" con día 2026-09-25 y "Solo calcular": debe decir 39 pedidos, $7,736.00 (comparación contra el Excel).
5. Correr el SQL de activación; poner `DODOIS_CRON_SECRET` en Vercel y volver a desplegar; a los 15 minutos debe aparecer una sincronización "Cada 15 min".
