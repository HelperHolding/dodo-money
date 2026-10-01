# Compras fase 4: pagos, abonos, complementos y calendario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar pagos a proveedores (completos o en abonos, uno puede cubrir varias facturas), anularlos con motivo, programar fechas de pago, ligar complementos de pago (XML tipo P) y ver un calendario de lo que hay que pagar con indicadores de vencido, esta semana, próximos 30 días y pagado en el mes.

**Architecture:** Cálculos puros en `lib/compras/pagos.ts` (reparto por vencimiento, validación, indicadores, agrupación y totales por día) y lector de complementos en `lib/compras/cfdi.ts`. Migración 0014: `pagos`, `pago_aplicaciones`, `complementos_pago`, `complemento_facturas`, `facturas.pago_programado_el`; el saldo ahora resta pagos; funciones `security definer` para registrar y anular pagos, programar, registrar complementos y cotejar en la base. Pantallas en `/compras/pagos`, el pago en la factura y una tarjeta en la vista de corporativo.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript estricto, Supabase Postgres (RLS, plpgsql, storage), `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-09-30-compras-design.md` — sección 5 (Pagos, abonos y calendario) y "Seguridad".

## Global Constraints

- Repositorio: `C:/Users/sebcm/AppData/Local/Temp/claude/C--Users-sebcm-Downloads-dodo-control-efectivo-1-dodo-efectivo/e60f0e8d-16fc-4407-8eb6-62a8265bd266/scratchpad/dodo-money`, rama `feat/compras-pagos`. Antes de node: `export PATH="$PATH:/c/Program Files/nodejs"`.
- Módulos de `lib/` importan de otros módulos locales **solo tipos** (`import type`, sin extensión). Los `*.test.ts` importan valores con extensión `.ts`. El código de `app/` sí importa valores de `lib/` (por ejemplo `lib/ventas/calendario`).
- Español de México; montos con `pesos()`/`pesosCortos()`; fechas con `fechaTexto()`; hoy con `hoyMX()` en TS y `hoy_mx()` en SQL.
- Tarjetas y plegables; **nada de tablas anchas ni scroll horizontal** (revisar a 375 px). El calendario reutiliza las clases `calendario-*` de `app/globals.css`.
- Nada se borra: un pago se anula con motivo. Admin hace todo; corporativo consulta; la sucursal no ve pagos.
- Varios archivos son CRLF: editarlos con la herramienta Edit. `supabase.rpc` sin tipos: castear el resultado.
- Pruebas SQL: bloque `do $$ … $$` que termina con `raise exception 'PRUEBAS OK — …'`; las corre Sebastián. No se fusiona a main sin su "PRUEBAS OK".
- Páginas temporales en `app/login/prueba-*`; se borran antes del commit, junto con `.next`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisiones de este plan

- **Fechas del calendario:** cada factura cae en su `pago_programado_el` o, si no hay, en su `vence_el`. **Vencido** = `vence_el` < hoy con saldo (aunque esté programada después). **Esta semana** = de hoy al domingo; **Próximos 30 días** = de hoy a hoy + 29 (incluye esta semana); ambos sin las vencidas.
- **Fecha del pago** no puede ser futura (se registra lo que ya se pagó).
- **Cotejo en la base:** `cotejo_factura(id)` replica `cotejar` de `lib/compras/facturas.ts`; `registrar_pago` exige `revisada` si no es `cuadra` ni `sin_orden`.
- **Estado de la factura** se recalcula al pagar o anular: saldo 0 → `pagada`; algo pagado → `parcial`; nada → `por_pagar`. Una factura con pagos vigentes no se cancela.
- **Comprobante del pago** (PDF o foto) y **XML del complemento** van al bucket `facturas` (`pagos/<uuid>.<ext>`, `complementos/<UUID>.xml`); el bucket acepta además imágenes.
- **Falta complemento** = factura PPD con más pagado que lo cubierto por complementos (±$0.01). Solo es aviso.

## Review Focus

1. **Monto con centavos que no se reparten exacto** (p. ej. $1,000.01 entre tres facturas) — el reparto debe sumar exactamente el monto o dejar el resto sin aplicar con mensaje claro; nunca aplicar más que el saldo.
2. **Dos admins pagando la misma factura a la vez** — la segunda debe rechazarse si ya no hay saldo (bloqueo de filas en `registrar_pago`).
3. **Anular un pago** devuelve el estado correcto (`parcial` o `por_pagar`) a cada factura que tocaba.
4. **Complemento de un proveedor que cubre facturas que aún no se suben** — se guarda; cuando la factura llega, el aviso de "falta complemento" ya la considera cubierta.
5. **El calendario a 375 px** con montos grandes ($123,456.78) y meses de 6 semanas — sin scroll horizontal.

---

### Task 1: Cálculos de pagos (`lib/compras/pagos.ts`)

**Files:**
- Create: `lib/compras/pagos.ts`
- Test: `lib/compras/pagos.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `type EstadoFactura` de `./facturas` (solo tipo).
- Produces:
  - `type PorPagar = { id: string; saldo: number; vence_el: string; pago_programado_el: string | null; estado: EstadoFactura }`.
  - `fechaDePago(f: { vence_el: string; pago_programado_el: string | null }): string`.
  - `repartirPago(monto: number, facturas: readonly PorPagar[]): { aplicaciones: { factura_id: string; monto: number }[]; sobrante: number }`.
  - `revisarPago(monto: number, aplicaciones: readonly { factura_id: string; monto: number }[], saldos: ReadonlyMap<string, number>): string | null`.
  - `finDeSemana(hoy: string): string` (domingo de la semana de `hoy`; lunes es el primer día).
  - `grupoPorPagar(f: PorPagar, hoy: string): "vencidas" | "semana" | "despues"`.
  - `resumenPagos(facturas: readonly PorPagar[], pagos: readonly { fecha: string; monto: number; anulado: boolean }[], hoy: string): { vencido: number; semana: number; treinta: number; pagadoMes: number }`.

- [ ] **Step 1: Write the failing test**

`lib/compras/pagos.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { fechaDePago, finDeSemana, grupoPorPagar, repartirPago, resumenPagos, revisarPago, type PorPagar } from "./pagos.ts";

const f = (id: string, saldo: number, vence_el: string, pago_programado_el: string | null = null): PorPagar =>
  ({ id, saldo, vence_el, pago_programado_el, estado: "por_pagar" });

test("fecha de pago: la programada o, si no hay, el vencimiento", () => {
  assert.equal(fechaDePago(f("a", 1, "2026-10-10")), "2026-10-10");
  assert.equal(fechaDePago(f("a", 1, "2026-10-10", "2026-10-08")), "2026-10-08");
});

test("reparto: primero lo que se paga antes, hasta el saldo, al centavo", () => {
  const facturas = [f("c", 500, "2026-10-20"), f("a", 300.5, "2026-10-01"), f("b", 400, "2026-10-10", "2026-09-30")];
  assert.deepEqual(repartirPago(1000.01, facturas), {
    aplicaciones: [{ factura_id: "b", monto: 400 }, { factura_id: "a", monto: 300.5 }, { factura_id: "c", monto: 299.51 }], sobrante: 0,
  });
  assert.deepEqual(repartirPago(2000, facturas).sobrante, 799.5);
  assert.deepEqual(repartirPago(0, facturas), { aplicaciones: [], sobrante: 0 });
});

test("revisar un pago antes de registrarlo", () => {
  const saldos = new Map([["a", 300], ["b", 400]]);
  assert.equal(revisarPago(700, [{ factura_id: "a", monto: 300 }, { factura_id: "b", monto: 400 }], saldos), null);
  assert.equal(revisarPago(0, [], saldos), "Escribe el monto del pago.");
  assert.equal(revisarPago(100, [], saldos), "Elige al menos una factura y cuánto se le aplica.");
  assert.equal(revisarPago(500, [{ factura_id: "a", monto: 500 }], saldos), "Lo aplicado a una factura no puede pasar de su saldo ($300.00).");
  assert.equal(revisarPago(500, [{ factura_id: "a", monto: 300 }], saldos), "Lo aplicado ($300.00) no suma el monto del pago ($500.00).");
  assert.equal(revisarPago(100, [{ factura_id: "x", monto: 100 }], saldos), "Una de las facturas ya no tiene saldo por pagar.");
});

test("semana de lunes a domingo", () => {
  assert.equal(finDeSemana("2026-10-01"), "2026-10-04");
  assert.equal(finDeSemana("2026-10-04"), "2026-10-04");
  assert.equal(finDeSemana("2026-10-05"), "2026-10-11");
});

test("agrupar por pagar e indicadores", () => {
  const hoy = "2026-10-01";
  const facturas = [
    f("vencida", 100, "2026-09-25"),
    f("vencida-programada", 50, "2026-09-28", "2026-10-03"),
    f("semana", 200, "2026-10-03"),
    f("mes", 300, "2026-10-20"),
    f("lejos", 400, "2026-12-01"),
  ];
  assert.deepEqual(facturas.map((x) => grupoPorPagar(x, hoy)), ["vencidas", "vencidas", "semana", "despues", "despues"]);
  assert.deepEqual(resumenPagos(facturas, [
    { fecha: "2026-10-01", monto: 1000, anulado: false },
    { fecha: "2026-10-01", monto: 999, anulado: true },
    { fecha: "2026-09-30", monto: 5, anulado: false },
  ], hoy), { vencido: 150, semana: 200, treinta: 500, pagadoMes: 1000 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/compras/pagos.test.ts`
Expected: FAIL — `Cannot find module …/lib/compras/pagos.ts`.

- [ ] **Step 3: Write minimal implementation**

`lib/compras/pagos.ts`:

```ts
import type { EstadoFactura } from "./facturas";

export type PorPagar = { id: string; saldo: number; vence_el: string; pago_programado_el: string | null; estado: EstadoFactura };

const centavos = (n: number) => Math.round(Number(n) * 100);
const pesosTexto = (c: number) => `$${(c / 100).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export const fechaDePago = (f: { vence_el: string; pago_programado_el: string | null }) => f.pago_programado_el ?? f.vence_el;

/** Reparte el monto entre las facturas, primero las que se pagan antes, sin pasar el saldo de ninguna. En centavos. */
export function repartirPago(monto: number, facturas: readonly PorPagar[]) {
  let resta = centavos(monto);
  const orden = [...facturas].sort((a, b) =>
    fechaDePago(a).localeCompare(fechaDePago(b)) || a.vence_el.localeCompare(b.vence_el) || a.id.localeCompare(b.id));
  const aplicaciones: { factura_id: string; monto: number }[] = [];
  for (const f of orden) {
    if (resta <= 0) break;
    const aplicar = Math.min(resta, centavos(f.saldo));
    if (aplicar <= 0) continue;
    aplicaciones.push({ factura_id: f.id, monto: aplicar / 100 });
    resta -= aplicar;
  }
  return { aplicaciones, sobrante: Math.max(resta, 0) / 100 };
}

/** Mensaje para el admin, o null si el pago se puede registrar (la base lo vuelve a revisar). */
export function revisarPago(monto: number, aplicaciones: readonly { factura_id: string; monto: number }[], saldos: ReadonlyMap<string, number>): string | null {
  if (!(monto > 0)) return "Escribe el monto del pago.";
  const usadas = aplicaciones.filter((a) => a.monto > 0);
  if (!usadas.length) return "Elige al menos una factura y cuánto se le aplica.";
  for (const a of usadas) {
    const saldo = saldos.get(a.factura_id);
    if (saldo === undefined || saldo <= 0) return "Una de las facturas ya no tiene saldo por pagar.";
    if (centavos(a.monto) > centavos(saldo)) return `Lo aplicado a una factura no puede pasar de su saldo (${pesosTexto(centavos(saldo))}).`;
  }
  const suma = usadas.reduce((s, a) => s + centavos(a.monto), 0);
  if (suma !== centavos(monto)) return `Lo aplicado (${pesosTexto(suma)}) no suma el monto del pago (${pesosTexto(centavos(monto))}).`;
  return null;
}

/** Domingo de la semana de `hoy` (la semana empieza en lunes). */
export function finDeSemana(hoy: string): string {
  const diaSemana = (new Date(`${hoy}T00:00:00Z`).getUTCDay() + 6) % 7; // lunes = 0
  return sumarDias(hoy, 6 - diaSemana);
}

const abierta = (f: PorPagar) => (f.estado === "por_pagar" || f.estado === "parcial") && Number(f.saldo) > 0;

export function grupoPorPagar(f: PorPagar, hoy: string): "vencidas" | "semana" | "despues" {
  if (f.vence_el < hoy) return "vencidas";
  return fechaDePago(f) <= finDeSemana(hoy) ? "semana" : "despues";
}

export function resumenPagos(facturas: readonly PorPagar[], pagos: readonly { fecha: string; monto: number; anulado: boolean }[], hoy: string) {
  const fin = finDeSemana(hoy);
  const treintaDias = sumarDias(hoy, 29);
  let vencido = 0, semana = 0, treinta = 0;
  for (const f of facturas.filter(abierta)) {
    const c = centavos(f.saldo);
    if (f.vence_el < hoy) { vencido += c; continue; }
    const dia = fechaDePago(f);
    if (dia <= fin) semana += c;
    if (dia <= treintaDias) treinta += c;
  }
  const mes = hoy.slice(0, 7);
  const pagadoMes = pagos.filter((p) => !p.anulado && p.fecha.slice(0, 7) === mes).reduce((s, p) => s + centavos(p.monto), 0);
  return { vencido: vencido / 100, semana: semana / 100, treinta: treinta / 100, pagadoMes: pagadoMes / 100 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/compras/pagos.test.ts`
Expected: PASS, 5 tests. (2026-10-01 is a Thursday, so its Sunday is 2026-10-04.)

- [ ] **Step 5: Add to suite and commit**

Append ` lib/compras/pagos.test.ts` to the `test` script. Run `npm test` → all pass.

```bash
git add lib/compras/pagos.ts lib/compras/pagos.test.ts package.json
git commit -m "feat(compras): cálculos de pagos y calendario"
```

---

### Task 2: Lector de complementos de pago (`leerComplementoPago`)

**Files:**
- Modify: `lib/compras/cfdi.ts`
- Test: `lib/compras/cfdi.test.ts`

**Interfaces:**
- Produces: `type ComplementoPago = { uuid: string; fecha: string; rfc_emisor: string; nombre_emisor: string; rfc_receptor: string; monto: number; documentos: { uuid: string; monto_pagado: number; parcialidad: number | null }[] }` and `leerComplementoPago(xml: string): { complemento: ComplementoPago } | { error: string }`.

- [ ] **Step 1: Write the failing test**

Append to `lib/compras/cfdi.test.ts` (and add `leerComplementoPago` to its import):

```ts
const COMPLEMENTO = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:pago20="http://www.sat.gob.mx/Pagos20" Version="4.0" Fecha="2026-10-02T09:00:00" SubTotal="0" Moneda="XXX" Total="0" TipoDeComprobante="P">
  <cfdi:Emisor Rfc="LBA010203AB1" Nombre="LACTEOS DEL BAJIO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DPM010203XY9" UsoCFDI="CP01"/>
  <cfdi:Conceptos><cfdi:Concepto ClaveProdServ="84111506" Cantidad="1" ClaveUnidad="ACT" Descripcion="Pago" ValorUnitario="0" Importe="0" ObjetoImp="01"/></cfdi:Conceptos>
  <cfdi:Complemento>
    <pago20:Pagos Version="2.0">
      <pago20:Totales MontoTotalPagos="1500.00"/>
      <pago20:Pago FechaPago="2026-10-01T12:00:00" FormaDePagoP="03" MonedaP="MXN" Monto="1500.00">
        <pago20:DoctoRelacionado IdDocumento="6f2d9a2b-1c3e-4f5a-8b7c-9d0e1f2a3b4c" MonedaDR="MXN" NumParcialidad="1" ImpSaldoAnt="1080.00" ImpPagado="1000.00" ImpSaldoInsoluto="80.00" ObjetoImpDR="01"/>
        <pago20:DoctoRelacionado IdDocumento="11111111-2222-3333-4444-555555555555" MonedaDR="MXN" NumParcialidad="2" ImpPagado="500.00" ObjetoImpDR="01"/>
      </pago20:Pago>
    </pago20:Pagos>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="cccccccc-dddd-eeee-ffff-000000000000"/>
  </cfdi:Complemento>
</cfdi:Comprobante>`;

test("complemento de pago 2.0: fecha del pago, monto y documentos que cubre", () => {
  const r = leerComplementoPago(COMPLEMENTO);
  assert.ok("complemento" in r);
  assert.deepEqual(r.complemento, {
    uuid: "CCCCCCCC-DDDD-EEEE-FFFF-000000000000", fecha: "2026-10-01", rfc_emisor: "LBA010203AB1", nombre_emisor: "LACTEOS DEL BAJIO",
    rfc_receptor: "DPM010203XY9", monto: 1500,
    documentos: [
      { uuid: "6F2D9A2B-1C3E-4F5A-8B7C-9D0E1F2A3B4C", monto_pagado: 1000, parcialidad: 1 },
      { uuid: "11111111-2222-3333-4444-555555555555", monto_pagado: 500, parcialidad: 2 },
    ],
  });
});

test("complemento: rechaza facturas normales y complementos sin documentos", () => {
  const error = (xml: string) => { const r = leerComplementoPago(xml); return "error" in r ? r.error : null; };
  assert.equal(error(INGRESO), "No es un complemento de pago (es tipo I): las facturas se suben en Facturas.");
  assert.equal(error(COMPLEMENTO.replace(/<pago20:DoctoRelacionado[^>]*\/>/g, "")), "El complemento no dice qué facturas paga.");
  assert.equal(error("<x/>"), NO_ES_CFDI);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/compras/cfdi.test.ts`
Expected: FAIL — `does not provide an export named 'leerComplementoPago'`.

- [ ] **Step 3: Implement**

Append to `lib/compras/cfdi.ts`:

```ts
/** Complemento de pago (CFDI tipo P, Pagos 1.0 o 2.0): qué facturas paga y cuánto. */
export type ComplementoPago = {
  uuid: string; fecha: string; rfc_emisor: string; nombre_emisor: string; rfc_receptor: string; monto: number;
  documentos: { uuid: string; monto_pagado: number; parcialidad: number | null }[];
};

export function leerComplementoPago(xml: string): { complemento: ComplementoPago } | { error: string } {
  const texto = xml.replace(/^\uFEFF/, "").replace(/<(?:[\w-]+:)?Addenda\b[\s\S]*?<\/(?:[\w-]+:)?Addenda>/g, "");
  const comprobante = etiqueta(texto, "Comprobante");
  if (!comprobante) return { error: NO_ES_CFDI };
  const letra = atributo(comprobante, "TipoDeComprobante");
  if (letra !== "P") return { error: `No es un complemento de pago (es tipo ${letra ?? "?"}): las facturas se suben en Facturas.` };
  const uuid = atributo(etiqueta(texto, "TimbreFiscalDigital"), "UUID");
  if (!uuid) return { error: "El complemento no está timbrado (no trae folio fiscal UUID)." };
  const emisor = etiqueta(texto, "Emisor");
  const receptor = etiqueta(texto, "Receptor");
  if (!emisor || !receptor) return { error: NO_ES_CFDI };

  const pagos = etiquetas(texto, "Pago");
  const documentos = etiquetas(texto, "DoctoRelacionado").map((d) => ({
    uuid: (atributo(d, "IdDocumento") ?? "").toUpperCase(),
    monto_pagado: monto(d, "ImpPagado"),
    parcialidad: atributo(d, "NumParcialidad") ? Number(atributo(d, "NumParcialidad")) : null,
  })).filter((d) => d.uuid);
  if (!documentos.length) return { error: "El complemento no dice qué facturas paga." };

  const fechaPago = atributo(pagos[0], "FechaPago") ?? atributo(comprobante, "Fecha") ?? "";
  return {
    complemento: {
      uuid: uuid.toUpperCase(), fecha: fechaPago.slice(0, 10),
      rfc_emisor: (atributo(emisor, "Rfc") ?? "").toUpperCase(), nombre_emisor: atributo(emisor, "Nombre") ?? "",
      rfc_receptor: (atributo(receptor, "Rfc") ?? "").toUpperCase(),
      monto: Math.round(pagos.reduce((s, p) => s + monto(p, "Monto"), 0) * 100) / 100,
      documentos,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes, commit**

Run: `node --experimental-strip-types --test lib/compras/cfdi.test.ts` → PASS (all tests in file). `npm test` → all pass.

```bash
git add lib/compras/cfdi.ts lib/compras/cfdi.test.ts
git commit -m "feat(compras): lector de complementos de pago"
```

---

### Task 3: Pagos en el menú de Compras

**Files:**
- Modify: `lib/roles.ts`, `lib/roles.test.ts`

- [ ] **Step 1: Failing test**

In `lib/roles.test.ts`, test `menú de compras por rol`, insert `"/compras/pagos"` right after `"/compras/facturas"` in both expected arrays.

- [ ] **Step 2: Run** `node --experimental-strip-types --test lib/roles.test.ts` → FAIL in that test.

- [ ] **Step 3: Implement** — in `enlacesCompras`, after `{ href: "/compras/facturas", texto: "Facturas" },` add `{ href: "/compras/pagos", texto: "Pagos" },`.

- [ ] **Step 4: Run** → PASS; `npm test` → all pass. Commit:

```bash
git add lib/roles.ts lib/roles.test.ts
git commit -m "feat(compras): Pagos en el menú de Compras"
```

---

### Task 4: Migración 0014 y su prueba SQL

**Files:**
- Create: `supabase/migrations/0014_compras_pagos.sql`
- Create: `supabase/pruebas/0014_compras_pagos.sql`

**Interfaces:**
- Consumes: `ve_compras()`, `edita_compras()`, `exigir_admin_compras()`, `hoy_mx()`, `neto_factura()`, `total_orden()`, `recepcion_completa()`, `recibido_renglon()`, tipo `forma_pago` (0011), tablas de 0011–0013.
- Produces:
  - Columna `facturas.pago_programado_el date`.
  - Tablas `pagos(id, proveedor_id, fecha, monto, forma, cuenta_origen, referencia, comprobante_ruta, creado_por, creado_en, anulado_por, anulado_en, motivo_anulacion)`, `pago_aplicaciones(id, pago_id, factura_id, monto)`, `complementos_pago(id, uuid, fecha, rfc_emisor, nombre_emisor, proveedor_id, monto, xml_ruta, creado_por, creado_en)`, `complemento_facturas(id, complemento_id, factura_uuid, monto_pagado, parcialidad)`.
  - Funciones: `pagado_factura(uuid)`, `saldo_factura(uuid)` (ahora resta pagos), `cubierto_por_complementos(uuid)`, `falta_complemento(uuid)`, `cotejo_factura(uuid) → text`, `actualizar_estado_factura(uuid)`, `registrar_pago(p_proveedor uuid, p_fecha date, p_monto numeric, p_forma text, p_cuenta text, p_referencia text, p_comprobante text, p_aplicaciones jsonb) → uuid`, `anular_pago(p_id uuid, p_motivo text)`, `programar_pago(p_factura uuid, p_fecha date)`, `registrar_complemento(p_complemento jsonb, p_xml text) → uuid`; `cancelar_factura` rechaza facturas con pagos.
  - Vista `facturas_saldo` recreada con `saldo, neto, pagado, falta_complemento`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0014_compras_pagos.sql`:

```sql
-- Compras, fase 4: pagos a proveedores (completos o en abonos; uno puede cubrir varias facturas),
-- complementos de pago (CFDI tipo P) y fecha programada de pago. El saldo de una factura ahora resta lo pagado.
-- Admin registra; corporativo consulta. Nada se borra: un pago se anula con motivo. Requiere 0001–0013.

alter table facturas add column pago_programado_el date;

create table pagos (
  id                uuid primary key default gen_random_uuid(),
  proveedor_id      uuid not null references proveedores(id),
  fecha             date not null,
  monto             numeric(14,2) not null check (monto > 0),
  forma             forma_pago not null,
  cuenta_origen     text,
  referencia        text,
  comprobante_ruta  text,
  creado_por        uuid references perfiles(id) default auth.uid(),
  creado_en         timestamptz not null default now(),
  anulado_por       uuid references perfiles(id),
  anulado_en        timestamptz,
  motivo_anulacion  text,
  check (anulado_en is null or coalesce(trim(motivo_anulacion), '') <> '')
);
create index pagos_proveedor on pagos (proveedor_id);

create table pago_aplicaciones (
  id          bigserial primary key,
  pago_id     uuid not null references pagos(id),
  factura_id  uuid not null references facturas(id),
  monto       numeric(14,2) not null check (monto > 0),
  unique (pago_id, factura_id)
);
create index pago_aplicaciones_factura on pago_aplicaciones (factura_id);

create table complementos_pago (
  id             uuid primary key default gen_random_uuid(),
  uuid           text not null unique,
  fecha          date not null,
  rfc_emisor     text not null,
  nombre_emisor  text not null default '',
  proveedor_id   uuid references proveedores(id),
  monto          numeric(14,2) not null default 0,
  xml_ruta       text not null,
  creado_por     uuid references perfiles(id) default auth.uid(),
  creado_en      timestamptz not null default now()
);

-- Ligado por el UUID de la factura (puede llegar antes que la factura).
create table complemento_facturas (
  id              bigserial primary key,
  complemento_id  uuid not null references complementos_pago(id),
  factura_uuid    text not null,
  monto_pagado    numeric(14,2) not null default 0,
  parcialidad     integer
);
create index complemento_facturas_uuid on complemento_facturas (factura_uuid);

-- ─── Cálculos ───────────────────────────────────────────────────────────────
create or replace function pagado_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when not ve_compras() then null else
    coalesce((select sum(a.monto) from pago_aplicaciones a join pagos p on p.id = a.pago_id
               where a.factura_id = p_id and p.anulado_en is null), 0) end
$$;

-- Saldo por pagar = neto (total − notas de crédito) − pagos vigentes.
create or replace function saldo_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select greatest(neto_factura(p_id) - pagado_factura(p_id), 0)
$$;

create or replace function cubierto_por_complementos(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(cf.monto_pagado) from complemento_facturas cf join facturas f on f.uuid = cf.factura_uuid where f.id = p_id), 0)
$$;

-- PPD con más pagado que lo amparado por complementos (±1 centavo).
create or replace function falta_complemento(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select f.metodo_pago = 'PPD' from facturas f where f.id = p_id), false)
     and pagado_factura(p_id) > cubierto_por_complementos(p_id) + 0.01
$$;

drop view facturas_saldo;
create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo, neto_factura(f.id) as neto, pagado_factura(f.id) as pagado, falta_complemento(f.id) as falta_complemento
  from facturas f;

-- Igual que cotejar() en lib/compras/facturas.ts: orden ↔ recibido ↔ facturado (±$1) de las órdenes de la factura.
create or replace function cotejo_factura(p_id uuid) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_ordenes uuid[]; v_ordenado numeric; v_recibido numeric; v_completa boolean; v_facturado numeric;
begin
  select array_agg(orden_id) into v_ordenes from factura_ordenes where factura_id = p_id;
  if v_ordenes is null then return 'sin_orden'; end if;
  select coalesce(sum(total_orden(o.id)), 0), bool_and(recepcion_completa(o.id)) into v_ordenado, v_completa from unnest(v_ordenes) o(id);
  select coalesce(sum(round(recibido_renglon(r.id) * r.precio, 2)
                    + round(round(recibido_renglon(r.id) * r.precio, 2) * case when r.tasa_iva = '16' then 0.16 else 0 end, 2)), 0)
    into v_recibido from orden_renglones r where r.orden_id = any(v_ordenes);
  select coalesce(sum(neto_factura(fx.id)), 0) into v_facturado
    from facturas fx
   where fx.tipo = 'ingreso' and fx.estado <> 'cancelada'
     and exists (select 1 from factura_ordenes fo where fo.factura_id = fx.id and fo.orden_id = any(v_ordenes));
  if v_recibido <= 0 then return 'nada_recibido'; end if;
  if v_facturado > v_recibido + 1 then return 'facturado_de_mas'; end if;
  if v_completa and abs(v_facturado - v_ordenado) > 1 then return 'precio_distinto'; end if;
  return 'cuadra';
end $$;

create or replace function actualizar_estado_factura(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update facturas f
     set estado = case when saldo_factura(f.id) <= 0 then 'pagada'::estado_factura
                       when pagado_factura(f.id) > 0 then 'parcial'::estado_factura
                       else 'por_pagar'::estado_factura end
   where f.id = p_id and f.tipo = 'ingreso' and f.estado <> 'cancelada';
end $$;

revoke execute on function pagado_factura(uuid), saldo_factura(uuid), cubierto_por_complementos(uuid), falta_complemento(uuid), cotejo_factura(uuid) from public, anon;
grant execute on function pagado_factura(uuid), saldo_factura(uuid), cubierto_por_complementos(uuid), falta_complemento(uuid), cotejo_factura(uuid) to authenticated;
revoke execute on function actualizar_estado_factura(uuid) from public, anon, authenticated;

-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table pagos                 enable row level security;
alter table pago_aplicaciones     enable row level security;
alter table complementos_pago     enable row level security;
alter table complemento_facturas  enable row level security;

create policy ver_pagos on pagos for select using (ve_compras());
create policy ver_aplicaciones on pago_aplicaciones for select using (ve_compras());
create policy ver_complementos on complementos_pago for select using (ve_compras());
create policy ver_complemento_facturas on complemento_facturas for select using (ve_compras());
-- Escritura solo con las funciones de abajo.

-- Comprobantes de pago como foto o PDF en el mismo bucket.
update storage.buckets
   set allowed_mime_types = array['application/xml', 'text/xml', 'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
 where id = 'facturas';

-- ─── Pagos ──────────────────────────────────────────────────────────────────
-- p_aplicaciones: [{factura_id, monto}]. Una transacción: se bloquean las facturas para que dos pagos a la vez no pasen el saldo.
create or replace function registrar_pago(p_proveedor uuid, p_fecha date, p_monto numeric, p_forma text, p_cuenta text, p_referencia text,
                                          p_comprobante text, p_aplicaciones jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare a record; f facturas; v_suma numeric := 0; v_id uuid; v_cotejo text;
begin
  perform exigir_admin_compras();
  if p_monto is null or p_monto <= 0 then raise exception 'Escribe el monto del pago'; end if;
  if p_fecha is null or p_fecha > hoy_mx() then raise exception 'La fecha del pago no puede ser futura'; end if;
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

  insert into pagos (proveedor_id, fecha, monto, forma, cuenta_origen, referencia, comprobante_ruta)
  values (p_proveedor, p_fecha, round(p_monto, 2), p_forma::forma_pago, nullif(trim(p_cuenta), ''), nullif(trim(p_referencia), ''), nullif(p_comprobante, ''))
  returning id into v_id;
  insert into pago_aplicaciones (pago_id, factura_id, monto)
  select v_id, x.factura_id, round(x.monto, 2) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric);
  perform actualizar_estado_factura(x.factura_id) from jsonb_to_recordset(p_aplicaciones) x(factura_id uuid, monto numeric);
  return v_id;
end $$;

create or replace function anular_pago(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la anulación'; end if;
  update pagos set anulado_por = auth.uid(), anulado_en = now(), motivo_anulacion = trim(p_motivo) where id = p_id and anulado_en is null;
  if not found then raise exception 'El pago no existe o ya estaba anulado'; end if;
  perform actualizar_estado_factura(a.factura_id) from pago_aplicaciones a where a.pago_id = p_id;
end $$;

create or replace function programar_pago(p_factura uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  update facturas set pago_programado_el = p_fecha where id = p_factura and tipo = 'ingreso' and estado in ('por_pagar', 'parcial');
  if not found then raise exception 'Solo se programa una factura por pagar'; end if;
end $$;

-- Una factura con pagos vigentes no se cancela.
create or replace function cancelar_factura(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la cancelación'; end if;
  if pagado_factura(p_id) > 0 then raise exception 'La factura tiene pagos: anúlalos antes de cancelarla'; end if;
  update facturas set estado = 'cancelada', motivo_cancelacion = trim(p_motivo), cancelada_por = auth.uid(), cancelada_en = now()
   where id = p_id and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o ya estaba cancelada'; end if;
  delete from factura_ordenes where factura_id = p_id;
end $$;

-- ─── Complementos de pago ───────────────────────────────────────────────────
-- p_complemento: el objeto de leerComplementoPago (lib/compras/cfdi.ts).
create or replace function registrar_complemento(p_complemento jsonb, p_xml text) returns uuid
language plpgsql security definer set search_path = public as $$
declare e empresa; v_id uuid; v_previo complementos_pago;
begin
  perform exigir_admin_compras();
  select * into e from empresa;
  if not found then raise exception 'Configura primero el RFC de la empresa.'; end if;
  if upper(p_complemento->>'rfc_receptor') <> e.rfc then
    raise exception 'El complemento es para el RFC %, no para % (%).', p_complemento->>'rfc_receptor', e.razon_social, e.rfc;
  end if;
  select * into v_previo from complementos_pago where uuid = upper(p_complemento->>'uuid');
  if found then raise exception 'Este complemento ya se registró el %.', to_char(v_previo.creado_en at time zone 'America/Mexico_City', 'DD/MM/YYYY'); end if;
  insert into complementos_pago (uuid, fecha, rfc_emisor, nombre_emisor, proveedor_id, monto, xml_ruta)
  values (upper(p_complemento->>'uuid'), (p_complemento->>'fecha')::date, upper(p_complemento->>'rfc_emisor'), coalesce(p_complemento->>'nombre_emisor', ''),
          (select id from proveedores where rfc = upper(p_complemento->>'rfc_emisor')), coalesce((p_complemento->>'monto')::numeric, 0), p_xml)
  returning id into v_id;
  insert into complemento_facturas (complemento_id, factura_uuid, monto_pagado, parcialidad)
  select v_id, upper(d.uuid), coalesce(d.monto_pagado, 0), d.parcialidad
    from jsonb_to_recordset(coalesce(p_complemento->'documentos', '[]'::jsonb)) d(uuid text, monto_pagado numeric, parcialidad integer);
  return v_id;
end $$;
```

- [ ] **Step 2: Write the SQL test**

`supabase/pruebas/0014_compras_pagos.sql`:

```sql
-- Pruebas de la migración 0014 (Compras: pagos y complementos). Córrelas completas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos de la misma sucursal; sus puestos y la empresa cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc uuid; v_prov uuid; v_prov2 uuid; v_f1 uuid; v_f2 uuid; v_fx uuid; v_pago uuid; v_pago2 uuid; v_n int;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_base jsonb;
  v_ok text[] := '{}';
begin
  select a.id, b.id, a.sucursal_id into v_a, v_b, v_suc
    from perfiles a join perfiles b on b.id <> a.id and b.activo and b.sucursal_id = a.sucursal_id
   where a.activo and a.sucursal_id is not null
   limit 1;
  if v_a is null then raise exception 'FALTAN DATOS: se necesitan dos usuarios activos de la misma sucursal.'; end if;
  update perfiles set rol = 'admin' where id = v_a;
  update perfiles set rol = 'gerente' where id = v_b;
  delete from empresa;
  insert into empresa (rfc, razon_social) values ('DPM010203XY9', 'Dodo Pizza Prueba');

  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into proveedores (razon_social, rfc, regimen_fiscal, dias_credito) values ('Prueba Pago Uno', 'PPU010203AB1', '601', 30) returning id into v_prov;
  insert into proveedores (razon_social, rfc, regimen_fiscal) values ('Prueba Pago Dos', 'PPD010203AB1', '601') returning id into v_prov2;
  v_base := jsonb_build_object('tipo', 'ingreso', 'fecha', v_hoy, 'rfc_emisor', 'PPU010203AB1', 'nombre_emisor', 'PRUEBA PAGO UNO', 'regimen_emisor', '601',
    'rfc_receptor', 'DPM010203XY9', 'metodo_pago', 'PPD', 'moneda', 'MXN', 'descuento', 0, 'iva', 0, 'retenciones', 0, 'conceptos', '[]'::jsonb);
  v_f1 := registrar_factura(v_base || jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000001', 'folio', '1', 'subtotal', 1000, 'total', 1000), false, 'x.xml', null);
  v_f2 := registrar_factura(v_base || jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000002', 'folio', '2', 'subtotal', 500, 'total', 500), false, 'x.xml', null);
  v_fx := registrar_factura(v_base || jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000003', 'folio', '3', 'subtotal', 100, 'total', 100,
                            'rfc_emisor', 'PPD010203AB1'), false, 'x.xml', null);

  -- Reglas del pago
  begin
    perform registrar_pago(v_prov, v_hoy, 1200, 'transferencia', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 1200)));
    raise exception 'FALLÓ: aplicar más que el saldo';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%su saldo es%' then raise exception 'FALLÓ: mensaje inesperado (saldo): %', sqlerrm; end if;
  end;
  begin
    perform registrar_pago(v_prov, v_hoy, 900, 'transferencia', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 800)));
    raise exception 'FALLÓ: lo aplicado no suma el monto';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Lo aplicado%' then raise exception 'FALLÓ: mensaje inesperado (suma): %', sqlerrm; end if;
  end;
  begin
    perform registrar_pago(v_prov, v_hoy, 200, 'transferencia', null, null, null,
      jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 100), jsonb_build_object('factura_id', v_fx, 'monto', 100)));
    raise exception 'FALLÓ: facturas de dos proveedores';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%mismo proveedor%' then raise exception 'FALLÓ: mensaje inesperado (proveedor): %', sqlerrm; end if;
  end;
  begin
    perform registrar_pago(v_prov, v_hoy + 1, 100, 'transferencia', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 100)));
    raise exception 'FALLÓ: fecha futura';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%futura%' then raise exception 'FALLÓ: mensaje inesperado (futura): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'reglas: saldo, suma, mismo proveedor y fecha');

  -- Un pago a dos facturas: completa una y abona a la otra
  v_pago := registrar_pago(v_prov, v_hoy, 1200, 'transferencia', 'BBVA', 'REF-1', null,
    jsonb_build_array(jsonb_build_object('factura_id', v_f1, 'monto', 1000), jsonb_build_object('factura_id', v_f2, 'monto', 200)));
  if (select estado::text from facturas where id = v_f1) <> 'pagada' then raise exception 'FALLÓ: pagada'; end if;
  if (select estado::text from facturas where id = v_f2) <> 'parcial' then raise exception 'FALLÓ: parcial'; end if;
  if saldo_factura(v_f2) <> 300 then raise exception 'FALLÓ: saldo tras abono (%)', saldo_factura(v_f2); end if;
  if neto_factura(v_f1) <> 1000 then raise exception 'FALLÓ: el neto no cambia con pagos'; end if;
  begin
    perform cancelar_factura(v_f1, 'Prueba');
    raise exception 'FALLÓ: cancelar con pagos';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%tiene pagos%' then raise exception 'FALLÓ: mensaje inesperado (cancelar): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'un pago a varias facturas: pagada y parcial');

  -- Complemento (PPD): falta hasta que se sube; cubre una factura que llega después
  if not falta_complemento(v_f1) then raise exception 'FALLÓ: PPD pagada sin complemento debe marcarse'; end if;
  perform registrar_complemento(jsonb_build_object('uuid', 'cccccccc-0000-0000-0000-000000000001', 'fecha', v_hoy, 'rfc_emisor', 'PPU010203AB1',
    'nombre_emisor', 'PRUEBA PAGO UNO', 'rfc_receptor', 'DPM010203XY9', 'monto', 1400,
    'documentos', jsonb_build_array(
      jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000001', 'monto_pagado', 1000, 'parcialidad', 1),
      jsonb_build_object('uuid', 'bbbbbbbb-0000-0000-0000-000000000009', 'monto_pagado', 200, 'parcialidad', 1))), 'c.xml');
  if falta_complemento(v_f1) then raise exception 'FALLÓ: el complemento cubre la factura 1'; end if;
  if not falta_complemento(v_f2) then raise exception 'FALLÓ: la factura 2 sigue sin complemento'; end if;
  begin
    perform registrar_complemento(jsonb_build_object('uuid', 'cccccccc-0000-0000-0000-000000000001', 'fecha', v_hoy, 'rfc_emisor', 'PPU010203AB1',
      'rfc_receptor', 'DPM010203XY9', 'documentos', '[]'::jsonb), 'c.xml');
    raise exception 'FALLÓ: complemento repetido';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Este complemento ya se registró%' then raise exception 'FALLÓ: mensaje inesperado (complemento): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'complementos: falta, cubre por UUID y no se repiten');

  -- Programar y anular
  perform programar_pago(v_f2, v_hoy + 5);
  if (select pago_programado_el from facturas where id = v_f2) <> v_hoy + 5 then raise exception 'FALLÓ: programar'; end if;
  begin
    perform programar_pago(v_f1, v_hoy + 5);
    raise exception 'FALLÓ: programar una pagada';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
  end;
  perform anular_pago(v_pago, 'Pago duplicado');
  if (select estado::text from facturas where id = v_f1) <> 'por_pagar' or (select estado::text from facturas where id = v_f2) <> 'por_pagar' then
    raise exception 'FALLÓ: anular devuelve las facturas a por pagar';
  end if;
  if saldo_factura(v_f2) <> 500 then raise exception 'FALLÓ: anular devuelve el saldo'; end if;
  begin
    perform anular_pago(v_pago, 'otra vez');
    raise exception 'FALLÓ: anular dos veces';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
  end;
  v_ok := array_append(v_ok, 'programar y anular con motivo');

  -- Factura que no cuadra con su orden: hay que revisarla antes de pagar
  declare v_art uuid; v_oc uuid;
  begin
    insert into articulos (nombre, unidad, tipo) values ('Prueba pago horno', 'pza', 'activo_fijo') returning id into v_art;
    insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_oc;
    insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_art, 'Horno', 1, 500, '0');
    perform confirmar_orden(v_oc);
    perform ligar_factura_ordenes(v_f2, array[v_oc]);
    if cotejo_factura(v_f2) <> 'nada_recibido' then raise exception 'FALLÓ: cotejo sin recibir (%)', cotejo_factura(v_f2); end if;
    begin
      perform registrar_pago(v_prov, v_hoy, 100, 'transferencia', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f2, 'monto', 100)));
      raise exception 'FALLÓ: pagar una factura que no cuadra sin revisarla';
    exception when others then
      if sqlerrm like 'FALLÓ%' then raise; end if;
      if sqlerrm not like '%márcala como revisada%' then raise exception 'FALLÓ: mensaje inesperado (revisada): %', sqlerrm; end if;
    end;
    perform marcar_factura_revisada(v_f2, 'Anticipo acordado');
    v_pago2 := registrar_pago(v_prov, v_hoy, 100, 'cheque', null, 'CH-9', null, jsonb_build_array(jsonb_build_object('factura_id', v_f2, 'monto', 100)));
    if v_pago2 is null then raise exception 'FALLÓ: pagar revisada'; end if;
  end;
  v_ok := array_append(v_ok, 'si no cuadra, se revisa antes de pagar');

  -- Gerente no ve pagos; corporativo consulta y no paga
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from pagos;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no ve pagos'; end if;
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  execute 'set local role authenticated';
  select count(*) into v_n from pagos where id in (v_pago, v_pago2);
  if v_n <> 2 then raise exception 'FALLÓ: corporativo lee pagos'; end if;
  begin
    perform registrar_pago(v_prov, v_hoy, 50, 'efectivo', null, null, null, jsonb_build_array(jsonb_build_object('factura_id', v_f2, 'monto', 50)));
    raise exception 'FALLÓ: corporativo no paga';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  begin
    perform actualizar_estado_factura(v_f2);
    raise exception 'FALLÓ: actualizar_estado_factura es interna';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  v_ok := array_append(v_ok, 'la sucursal no ve pagos; corporativo consulta');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 3: Review both files**

Check by reading: the four new tables have RLS and only select policies; `facturas_saldo` is dropped and recreated (its column list changes because `facturas` gained a column); the `registrar_pago` loop locks each factura `for update` in `factura_id` order; every `security definer` has `set search_path = public`; `actualizar_estado_factura` is not executable by `authenticated`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0014_compras_pagos.sql supabase/pruebas/0014_compras_pagos.sql
git commit -m "feat(compras): migración 0014 de pagos y complementos con su prueba"
```

---

### Task 5: Pantalla de Pagos (indicadores, calendario, por pagar, complementos)

**Files:**
- Create: `app/compras/pagos/acciones.ts`
- Create: `app/compras/pagos/CalendarioPagos.tsx`
- Create: `app/compras/pagos/FormComplementos.tsx`
- Create: `app/compras/pagos/page.tsx`

**Interfaces:**
- Consumes: Task 1 (`fechaDePago`, `grupoPorPagar`, `resumenPagos`, `type PorPagar`), Task 2 (`leerComplementoPago`), `rutaArchivoFactura`/`archivoYaSubido`/`vencida` (`lib/compras/facturas`), `mesDe`, `moverMes`, `semanasDelMes` (`lib/ventas/calendario`), Task 4 (`registrar_complemento`, vista `facturas_saldo`, tabla `pagos`).
- Produces: `subirComplementos(previo, fd): Promise<{ resultados: { archivo: string; ok: boolean; texto: string }[] }>` (Task 6 appends pago actions to the same file).

- [ ] **Step 1: Complement upload action**

`app/compras/pagos/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerComplementoPago } from "@/lib/compras/cfdi";
import { archivoYaSubido } from "@/lib/compras/facturas";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";

const BUCKET = "facturas";
const MAX_BYTES = 5 * 1024 * 1024;

export type ResultadoComplementos = { resultados: { archivo: string; ok: boolean; texto: string }[] };

export async function subirComplementos(_previo: ResultadoComplementos | null, fd: FormData): Promise<ResultadoComplementos> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { resultados: [{ archivo: "", ok: false, texto: SOLO_CONSULTA }] };
  const xmls = fd.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0 && a.name.toLowerCase().endsWith(".xml"));
  if (!xmls.length) return { resultados: [{ archivo: "", ok: false, texto: "Elige al menos un XML de complemento de pago." }] };
  const { data: empresa } = await supabase.from("empresa").select("rfc").maybeSingle<{ rfc: string }>();
  if (!empresa) return { resultados: [{ archivo: "", ok: false, texto: "Configura primero los datos de la empresa." }] };

  const resultados: ResultadoComplementos["resultados"] = [];
  for (const xml of xmls) {
    if (xml.size > MAX_BYTES) { resultados.push({ archivo: xml.name, ok: false, texto: "Pesa más de 5 MB." }); continue; }
    const leido = leerComplementoPago(await xml.text());
    if ("error" in leido) { resultados.push({ archivo: xml.name, ok: false, texto: leido.error }); continue; }
    const c = leido.complemento;
    if (c.rfc_receptor !== empresa.rfc) { resultados.push({ archivo: xml.name, ok: false, texto: `Es para el RFC ${c.rfc_receptor}, no para la empresa (${empresa.rfc}).` }); continue; }
    const { data: previo } = await supabase.from("complementos_pago").select("id").eq("uuid", c.uuid).maybeSingle();
    if (previo) { resultados.push({ archivo: xml.name, ok: false, texto: "Este complemento ya se registró." }); continue; }
    const ruta = `complementos/${c.uuid}.xml`;
    const { error: errorXml } = await supabase.storage.from(BUCKET).upload(ruta, xml, { contentType: "application/xml", upsert: false });
    if (errorXml && !archivoYaSubido(errorXml.message)) { resultados.push({ archivo: xml.name, ok: false, texto: `No se pudo subir el XML: ${errorXml.message}` }); continue; }
    const { error } = await supabase.rpc("registrar_complemento", { p_complemento: c, p_xml: ruta });
    if (error) { resultados.push({ archivo: xml.name, ok: false, texto: error.message }); continue; }
    resultados.push({ archivo: xml.name, ok: true, texto: `Complemento de ${c.nombre_emisor || c.rfc_emisor} por ${c.monto.toLocaleString("es-MX", { style: "currency", currency: "MXN" })}: cubre ${c.documentos.length} ${c.documentos.length === 1 ? "factura" : "facturas"}.` });
  }
  revalidatePath("/compras", "layout");
  return { resultados };
}
```

- [ ] **Step 2: Complement upload form**

`app/compras/pagos/FormComplementos.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { subirComplementos, type ResultadoComplementos } from "./acciones";

export function FormComplementos() {
  const [estado, enviar, pendiente] = useActionState<ResultadoComplementos | null, FormData>(subirComplementos, null);
  return (
    <form action={enviar} className="formulario">
      <div className="campo">
        <label htmlFor="complementos">XML de complementos de pago</label>
        <input id="complementos" name="archivos" type="file" accept=".xml" multiple required />
        <small>Los manda el proveedor después de cada pago a una factura PPD.</small>
      </div>
      {estado && (
        <ul style={{ listStyle: "none", paddingLeft: 0, display: "grid", gap: 8 }}>
          {estado.resultados.map((r, i) => (
            <li key={i} className={r.ok ? "aviso aviso-ok" : "aviso aviso-error"} style={{ overflowWrap: "anywhere" }}>
              {r.archivo && <strong>{r.archivo}: </strong>}{r.texto}
            </li>
          ))}
        </ul>
      )}
      <button className="boton boton-secundario" type="submit" disabled={pendiente}>{pendiente ? "Subiendo…" : "Subir complementos"}</button>
    </form>
  );
}
```

- [ ] **Step 3: Calendar (client)**

`app/compras/pagos/CalendarioPagos.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { fechaTexto, pesos, pesosCortos } from "@/lib/formato";
import { mesDe, moverMes, semanasDelMes } from "@/lib/ventas/calendario";

export type FacturaDelDia = { id: string; nombre: string; proveedor: string; saldo: number; vencida: boolean };

const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"];
const nombreMes = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const tituloMes = (anio: number, mes: number) => {
  const t = nombreMes.format(new Date(Date.UTC(anio, mes - 1, 1))).replace(" de ", " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Cada día muestra lo que se paga ese día (programado o por vencer); en rojo si incluye vencidas. Al tocarlo, sus facturas. */
export function CalendarioPagos({ hoy, porDia }: { hoy: string; porDia: Record<string, FacturaDelDia[]> }) {
  const [mes, setMes] = useState(mesDe(hoy));
  const [dia, setDia] = useState<string | null>(null);
  const lista = dia ? porDia[dia] ?? [] : [];
  return (
    <section className="seccion calendario" aria-label="Calendario de pagos">
      <div className="calendario-cabecera">
        <button type="button" className="calendario-flecha" aria-label="Mes anterior" onClick={() => setMes(moverMes(mes, -1))}>‹</button>
        <h2>{tituloMes(mes.anio, mes.mes)}</h2>
        <button type="button" className="calendario-flecha" aria-label="Mes siguiente" onClick={() => setMes(moverMes(mes, 1))}>›</button>
      </div>
      <div className="calendario-rejilla" role="grid">
        {DIAS.map((d) => <span key={d} className="calendario-dia-semana" role="columnheader">{d}</span>)}
        {semanasDelMes(mes.anio, mes.mes).flat().map((d, i) => {
          if (!d) return <span key={`h${i}`} aria-hidden="true" />;
          const facturas = porDia[d] ?? [];
          const total = facturas.reduce((s, f) => s + f.saldo, 0);
          const vencidas = facturas.some((f) => f.vencida);
          return (
            <button key={d} type="button" className="calendario-dia" data-vacio={facturas.length ? undefined : "si"}
              data-estado={d === dia ? "extremo" : undefined} aria-pressed={d === dia}
              aria-label={`${fechaTexto(d)}: ${facturas.length ? pesos(total) : "nada por pagar"}${vencidas ? ", con vencidas" : ""}`}
              onClick={() => setDia(d === dia ? null : d)}>
              <span className="calendario-numero">{Number(d.slice(8))}{d === hoy ? " ·" : ""}</span>
              <span className="calendario-venta" style={vencidas && d !== dia ? { color: "var(--alerta-texto)" } : undefined}>{facturas.length ? pesosCortos(total) : "—"}</span>
            </button>
          );
        })}
      </div>
      <div className="calendario-pie">
        {!dia ? <p>Toca un día para ver sus facturas.</p> : !lista.length ? <p>{fechaTexto(dia)}: nada por pagar.</p> : (
          <ul style={{ listStyle: "none", paddingLeft: 0, display: "grid", gap: 6 }}>
            {lista.map((f) => (
              <li key={f.id} style={{ overflowWrap: "anywhere" }}>
                <Link href={`/compras/facturas/${f.id}`}>{f.nombre}</Link> · {f.proveedor} · {pesos(f.saldo)}{f.vencida ? " · vencida" : ""}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Page**

`app/compras/pagos/page.tsx`:

```tsx
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { vencida, type EstadoFactura } from "@/lib/compras/facturas";
import { fechaDePago, grupoPorPagar, resumenPagos } from "@/lib/compras/pagos";
import { NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";
import { CalendarioPagos, type FacturaDelDia } from "./CalendarioPagos";
import { FormComplementos } from "./FormComplementos";

type Factura = {
  id: string; uuid: string; serie: string | null; folio: string | null; saldo: number; vence_el: string; pago_programado_el: string | null;
  estado: EstadoFactura; proveedor_id: string; sucursal_id: string | null; falta_complemento: boolean;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null;
};
type Pago = { id: string; fecha: string; monto: number; forma: FormaPago; referencia: string | null; anulado_en: string | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null };
type Liga = { factura_id: string; ordenes_compra: { sucursal_id: string | null } | null };

export default async function Pagos({ searchParams }: { searchParams: Promise<{ proveedor?: string; sucursal?: string; complemento?: string; ok?: string; error?: string }> }) {
  const { proveedor = "", sucursal = "", complemento, ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyMX();
  const [facturas, pagos, ligas, { data: proveedores }, { data: sucursales }, { data: conComplemento }] = await Promise.all([
    leerTodo<Factura>((d, h) => supabase.from("facturas_saldo")
      .select("id, uuid, serie, folio, saldo, vence_el, pago_programado_el, estado, proveedor_id, sucursal_id, falta_complemento, proveedores(razon_social, nombre_comercial)")
      .eq("tipo", "ingreso").in("estado", ["por_pagar", "parcial"]).order("vence_el").order("id").range(d, h).returns<Factura[]>()),
    leerTodo<Pago>((d, h) => supabase.from("pagos").select("id, fecha, monto, forma, referencia, anulado_en, proveedores(razon_social, nombre_comercial)")
      .gte("fecha", `${hoy.slice(0, 7)}-01`).order("fecha", { ascending: false }).order("id").range(d, h).returns<Pago[]>()),
    leerTodo<Liga>((d, h) => supabase.from("factura_ordenes").select("factura_id, ordenes_compra(sucursal_id)").order("factura_id").range(d, h).returns<Liga[]>()),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    supabase.from("facturas_saldo").select("id").eq("falta_complemento", true).returns<{ id: string }[]>(),
  ]);

  // Sucursal de una factura: la de sus órdenes o, sin orden, su destino ("oficina" = sin sucursal).
  const sucursalesDe = new Map<string, Set<string>>();
  for (const l of ligas) {
    const s = l.ordenes_compra?.sucursal_id ?? "oficina";
    sucursalesDe.set(l.factura_id, (sucursalesDe.get(l.factura_id) ?? new Set()).add(s));
  }
  const deSucursal = (f: Factura, s: string) => (sucursalesDe.get(f.id) ?? new Set([f.sucursal_id ?? "oficina"])).has(s);
  const visibles = facturas.filter((f) => Number(f.saldo) > 0
    && (!proveedor || f.proveedor_id === proveedor)
    && (!sucursal || deSucursal(f, sucursal))
    && (complemento !== "si" || f.falta_complemento));

  const r = resumenPagos(visibles, pagos.map((p) => ({ fecha: p.fecha, monto: Number(p.monto), anulado: !!p.anulado_en })), hoy);
  const nombre = (f: Factura) => `${f.serie ?? ""}${f.folio ?? f.uuid.slice(0, 8)}`;
  const proveedorDe = (f: { proveedores: { razon_social: string; nombre_comercial: string | null } | null }) => f.proveedores?.nombre_comercial ?? f.proveedores?.razon_social ?? "";
  const porDia: Record<string, FacturaDelDia[]> = {};
  for (const f of visibles) {
    const d = fechaDePago(f);
    (porDia[d] ??= []).push({ id: f.id, nombre: nombre(f), proveedor: proveedorDe(f), saldo: Number(f.saldo), vencida: vencida(f, hoy) });
  }
  const grupos = { vencidas: [] as Factura[], semana: [] as Factura[], despues: [] as Factura[] };
  for (const f of visibles) grupos[grupoPorPagar(f, hoy)].push(f);
  const edita = puedeEditarCompras(perfil.rol);

  const Tarjetas = ({ lista }: { lista: Factura[] }) => (
    <div className="tarjetas">
      {lista.map((f) => (
        <article key={f.id} className="tarjeta" data-alerta={vencida(f, hoy) ? "si" : undefined}>
          <div className="tarjeta-encabezado">
            <div>
              <h3><Link href={`/compras/facturas/${f.id}`}>{nombre(f)}</Link> · {proveedorDe(f)}</h3>
              <p className="tarjeta-estado">{pesos(f.saldo)}{f.estado === "parcial" ? " · abonada" : ""}</p>
            </div>
          </div>
          <dl className="tarjeta-datos">
            <dt>Vence</dt><dd>{fechaTexto(f.vence_el)}{vencida(f, hoy) ? " · vencida" : ""}</dd>
            {f.pago_programado_el && <><dt>Programada</dt><dd>{fechaTexto(f.pago_programado_el)}</dd></>}
            {f.falta_complemento && <><dt>Aviso</dt><dd>Falta complemento de pago</dd></>}
          </dl>
          {edita && <Link className="boton boton-secundario" href={`/compras/pagos/nuevo?proveedor=${f.proveedor_id}&factura=${f.id}`}>Registrar pago</Link>}
        </article>
      ))}
    </div>
  );

  return (
    <>
      <div className="encabezado">
        <h1>Pagos</h1>
        <p>Lo que hay que pagar a proveedores, por fecha. {edita && <Link href="/compras/pagos/nuevo">Registrar un pago</Link>}</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion">
        <div className="rejilla">
          <div className="saldo" style={r.vencido > 0 ? { borderLeftColor: "var(--alerta)" } : undefined}>
            <span>Vencido</span><span className="saldo-monto">{pesos(r.vencido)}</span><span className="saldo-nota">{grupos.vencidas.length} facturas</span>
          </div>
          <div className="saldo"><span>Esta semana</span><span className="saldo-monto">{pesos(r.semana)}</span><span className="saldo-nota">hasta el domingo</span></div>
          <div className="saldo"><span>Próximos 30 días</span><span className="saldo-monto">{pesos(r.treinta)}</span><span className="saldo-nota">sin contar lo vencido</span></div>
          <div className="saldo"><span>Pagado este mes</span><span className="saldo-monto">{pesos(r.pagadoMes)}</span><span className="saldo-nota">{pagos.filter((p) => !p.anulado_en).length} pagos</span></div>
        </div>
      </section>

      <form className="seccion formulario" role="search">
        <div className="rejilla">
          <div className="campo">
            <label htmlFor="proveedor">Proveedor</label>
            <select id="proveedor" name="proveedor" defaultValue={proveedor}>
              <option value="">Todos</option>
              {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="sucursal">Sucursal</label>
            <select id="sucursal" name="sucursal" defaultValue={sucursal}>
              <option value="">Todas</option>
              {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              <option value="oficina">Oficina</option>
            </select>
          </div>
          <label className="campo"><span><input type="checkbox" name="complemento" value="si" defaultChecked={complemento === "si"} /> Solo con complemento pendiente ({conComplemento?.length ?? 0})</span></label>
        </div>
        <button className="boton boton-secundario" type="submit">Filtrar</button>
      </form>

      <CalendarioPagos hoy={hoy} porDia={porDia} />

      {!visibles.length && <p className="vacio">No hay nada por pagar con ese filtro.</p>}
      {grupos.vencidas.length > 0 && <Plegable id="t-vencidas" titulo="Vencidas" resumen={pesos(r.vencido)} alerta><Tarjetas lista={grupos.vencidas} /></Plegable>}
      {grupos.semana.length > 0 && <Plegable id="t-semana" titulo="Esta semana" resumen={pesos(r.semana)}><Tarjetas lista={grupos.semana} /></Plegable>}
      {grupos.despues.length > 0 && <Plegable id="t-despues" titulo="Después" resumen={`${grupos.despues.length} facturas`}><Tarjetas lista={grupos.despues} /></Plegable>}

      <Plegable id="t-pagos" titulo="Pagos de este mes" resumen={pesos(r.pagadoMes)}>
        {!pagos.length && <p className="vacio">Aún no hay pagos este mes.</p>}
        <div className="tarjetas">
          {pagos.map((p) => (
            <article key={p.id} className="tarjeta" data-alerta={p.anulado_en ? "si" : undefined}>
              <div className="tarjeta-encabezado"><div>
                <h3><Link href={`/compras/pagos/${p.id}`}>{pesos(p.monto)}</Link> · {proveedorDe(p)}</h3>
                <p className="tarjeta-estado">{fechaTexto(p.fecha)} · {NOMBRE_FORMA_PAGO[p.forma]}{p.anulado_en ? " · anulado" : ""}</p>
              </div></div>
              {p.referencia && <dl className="tarjeta-datos"><dt>Referencia</dt><dd>{p.referencia}</dd></dl>}
            </article>
          ))}
        </div>
      </Plegable>

      {edita && (
        <Plegable id="t-complementos" titulo="Complementos de pago" resumen={`${conComplemento?.length ?? 0} facturas pendientes`}>
          <FormComplementos />
        </Plegable>
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras/pagos`. (The links to `/compras/pagos/nuevo` and `/compras/pagos/[id]` are built in Task 6.)

Visual check: temp page rendering the four indicator blocks and `<CalendarioPagos hoy="2026-10-01" porDia={…}>` with large amounts on several days (one vencida) and a 6-week month (navigate to a month that needs 6 rows, e.g. August 2026), at 375 px; no horizontal scroll; tapping a day lists its invoices. Delete temp page and `.next`.

- [ ] **Step 6: Commit**

```bash
git add app/compras/pagos
git commit -m "feat(compras): pagos: indicadores, calendario, por pagar y complementos"
```

---

### Task 6: Registrar, ver y anular un pago

**Files:**
- Modify: `app/compras/pagos/acciones.ts` (append)
- Create: `app/compras/pagos/nuevo/page.tsx`
- Create: `app/compras/pagos/nuevo/FormPago.tsx`
- Create: `app/compras/pagos/[id]/page.tsx`

**Interfaces:**
- Consumes: `repartirPago`, `revisarPago`, `type PorPagar` (Task 1); `FORMAS_PAGO`, `NOMBRE_FORMA_PAGO`, `type FormaPago` (`lib/compras/proveedores`); `validarFoto`-like rules (comprobante: PDF or image ≤ 5 MB); `clienteAdmin`, `volver` (`app/compras/servidor.ts`); `registrar_pago`, `anular_pago`, `cotejo_factura` (Task 4); `NOMBRE_COTEJO` (`lib/compras/facturas`).
- Produces: `registrarPago(fd)`, `anularPago(fd)`.

- [ ] **Step 1: Actions**

Append to `app/compras/pagos/acciones.ts` (add `import { redirect } from "next/navigation";`, `import { revisarPago } from "@/lib/compras/pagos";` and `import { clienteAdmin, volver } from "../servidor";` to its imports):

```ts
const COMPROBANTE: Record<string, string> = {
  "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif",
};

/** Las aplicaciones llegan como campos `aplicar_<factura_id>`; se revisan aquí y otra vez en la base. */
export async function registrarPago(fd: FormData) {
  const proveedor = String(fd.get("proveedor_id") ?? "");
  const ruta = `/compras/pagos/nuevo?proveedor=${proveedor}`;
  const supabase = await clienteAdmin(ruta);
  const monto = Number(String(fd.get("monto") ?? "").replace(/[$\s,]/g, ""));
  const aplicaciones = [...fd.entries()]
    .filter(([k]) => k.startsWith("aplicar_"))
    .map(([k, v]) => ({ factura_id: k.slice(8), monto: Math.round(Number(String(v).replace(/[$\s,]/g, "")) * 100) / 100 }))
    .filter((a) => a.monto > 0);
  const { data: saldos } = await supabase.from("facturas_saldo").select("id, saldo").in("id", aplicaciones.map((a) => a.factura_id).concat("00000000-0000-0000-0000-000000000000"))
    .returns<{ id: string; saldo: number }[]>();
  const problema = revisarPago(monto, aplicaciones, new Map((saldos ?? []).map((s) => [s.id, Number(s.saldo)])));
  if (problema) volver(ruta, "error", problema);

  const archivo = fd.get("comprobante");
  const comprobante = archivo instanceof File && archivo.size > 0 ? archivo : null;
  let rutaComprobante: string | null = null;
  if (comprobante) {
    const ext = COMPROBANTE[comprobante.type];
    if (!ext) volver(ruta, "error", "El comprobante debe ser PDF o foto (JPG, PNG o HEIC).");
    if (comprobante.size > 5 * 1024 * 1024) volver(ruta, "error", "El comprobante pesa más de 5 MB.");
    rutaComprobante = `pagos/${crypto.randomUUID()}.${ext}`;
    const { error: errorArchivo } = await supabase.storage.from(BUCKET).upload(rutaComprobante, comprobante, { contentType: comprobante.type, upsert: false });
    if (errorArchivo) volver(ruta, "error", `No se pudo subir el comprobante: ${errorArchivo.message}`);
  }

  const { data: id, error } = await supabase.rpc("registrar_pago", {
    p_proveedor: proveedor, p_fecha: String(fd.get("fecha") ?? ""), p_monto: monto, p_forma: String(fd.get("forma") ?? "transferencia"),
    p_cuenta: String(fd.get("cuenta_origen") ?? ""), p_referencia: String(fd.get("referencia") ?? ""), p_comprobante: rutaComprobante,
    p_aplicaciones: aplicaciones,
  });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  redirect(`/compras/pagos/${id as string}?ok=${encodeURIComponent("Pago registrado.")}`);
}

export async function anularPago(fd: FormData) {
  const id = String(fd.get("id") ?? "");
  const ruta = `/compras/pagos/${id}`;
  const supabase = await clienteAdmin(ruta);
  const { error } = await supabase.rpc("anular_pago", { p_id: id, p_motivo: String(fd.get("motivo") ?? "") });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver(ruta, "ok", "Pago anulado. Las facturas recuperaron su saldo.");
}
```

- [ ] **Step 2: Payment form (client, live reparto)**

`app/compras/pagos/nuevo/FormPago.tsx`:

```tsx
"use client";

import { useState } from "react";
import { BotonEnviar } from "@/components/BotonEnviar";
import { fechaTexto, pesos } from "@/lib/formato";
import { repartirPago, revisarPago, type PorPagar } from "@/lib/compras/pagos";
import { FORMAS_PAGO, NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/compras/proveedores";
import { registrarPago } from "../acciones";

export type FacturaParaPagar = PorPagar & { nombre: string; bloqueada: string | null };

/** El monto se reparte solo por fecha de pago; cada factura se puede ajustar a mano. */
export function FormPago({ proveedorId, facturas, forma, hoy, preseleccion }: {
  proveedorId: string; facturas: FacturaParaPagar[]; forma: FormaPago; hoy: string; preseleccion: string | null;
}) {
  const pagables = facturas.filter((f) => !f.bloqueada);
  const inicial = preseleccion ? String(pagables.find((f) => f.id === preseleccion)?.saldo ?? "") : "";
  const [monto, setMonto] = useState(inicial);
  const [manual, setManual] = useState<Record<string, string>>({});
  const numero = (t: string) => Number(t.replace(/[$\s,]/g, "")) || 0;
  const reparto = repartirPago(numero(monto), pagables);
  const aplicado = (id: string) => manual[id] ?? String(reparto.aplicaciones.find((a) => a.factura_id === id)?.monto ?? "");
  const aplicaciones = pagables.map((f) => ({ factura_id: f.id, monto: numero(aplicado(f.id)) }));
  const problema = revisarPago(numero(monto), aplicaciones, new Map(pagables.map((f) => [f.id, Number(f.saldo)])));

  return (
    <form action={registrarPago} className="seccion formulario">
      <input type="hidden" name="proveedor_id" value={proveedorId} />
      <div className="rejilla">
        <div className="campo">
          <label htmlFor="monto">Monto pagado</label>
          <input id="monto" name="monto" inputMode="decimal" required value={monto} onChange={(e) => { setMonto(e.target.value); setManual({}); }} />
        </div>
        <div className="campo"><label htmlFor="fecha">Fecha del pago</label><input id="fecha" name="fecha" type="date" defaultValue={hoy} max={hoy} required /></div>
        <div className="campo">
          <label htmlFor="forma">Forma</label>
          <select id="forma" name="forma" defaultValue={forma}>{FORMAS_PAGO.map((x) => <option key={x} value={x}>{NOMBRE_FORMA_PAGO[x]}</option>)}</select>
        </div>
        <div className="campo"><label htmlFor="cuenta_origen">Cuenta de origen</label><input id="cuenta_origen" name="cuenta_origen" placeholder="Ej. BBVA empresa" /></div>
        <div className="campo"><label htmlFor="referencia">Referencia o clave de rastreo</label><input id="referencia" name="referencia" /></div>
        <div className="campo"><label htmlFor="comprobante">Comprobante (PDF o foto, opcional)</label><input id="comprobante" name="comprobante" type="file" accept="application/pdf,image/*" /></div>
      </div>

      <fieldset className="campo">
        <legend>A qué facturas se aplica</legend>
        <div className="tarjetas">
          {facturas.map((f) => (
            <article key={f.id} className="tarjeta" data-alerta={f.bloqueada ? "si" : undefined}>
              <div className="tarjeta-encabezado"><div>
                <h3>{f.nombre}</h3>
                <p className="tarjeta-estado">Saldo {pesos(f.saldo)} · vence {fechaTexto(f.vence_el)}</p>
              </div></div>
              {f.bloqueada ? <p className="saldo-nota">{f.bloqueada}</p> : (
                <div className="campo">
                  <label htmlFor={`a-${f.id}`}>Aplicar</label>
                  <input id={`a-${f.id}`} name={`aplicar_${f.id}`} inputMode="decimal" value={aplicado(f.id)}
                    onChange={(e) => setManual({ ...manual, [f.id]: e.target.value })} />
                </div>
              )}
            </article>
          ))}
        </div>
      </fieldset>

      {reparto.sobrante > 0 && !Object.keys(manual).length && <p className="aviso aviso-error">Sobran {pesos(reparto.sobrante)}: el monto pasa del saldo de las facturas.</p>}
      {problema && numero(monto) > 0 && <p className="saldo-nota" role="status">{problema}</p>}
      <BotonEnviar pendiente="Registrando…">Registrar pago</BotonEnviar>
    </form>
  );
}
```

- [ ] **Step 3: New payment page**

`app/compras/pagos/nuevo/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { hoyMX } from "@/lib/formato";
import { NOMBRE_COTEJO, type Cotejo, type EstadoFactura } from "@/lib/compras/facturas";
import type { FormaPago } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { FormPago, type FacturaParaPagar } from "./FormPago";

type Factura = { id: string; uuid: string; serie: string | null; folio: string | null; saldo: number; vence_el: string; pago_programado_el: string | null; estado: EstadoFactura; revisada: boolean };

export default async function NuevoPago({ searchParams }: { searchParams: Promise<{ proveedor?: string; factura?: string; error?: string }> }) {
  const { proveedor = "", factura = null, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/pagos");
  const { data: proveedores } = await supabase.from("proveedores").select("id, razon_social, nombre_comercial, forma_pago_habitual").order("razon_social")
    .returns<{ id: string; razon_social: string; nombre_comercial: string | null; forma_pago_habitual: FormaPago }[]>();
  const elegido = (proveedores ?? []).find((p) => p.id === proveedor);

  let facturas: FacturaParaPagar[] = [];
  if (elegido) {
    const { data } = await supabase.from("facturas_saldo").select("id, uuid, serie, folio, saldo, vence_el, pago_programado_el, estado, revisada")
      .eq("proveedor_id", elegido.id).eq("tipo", "ingreso").in("estado", ["por_pagar", "parcial"]).order("vence_el").returns<Factura[]>();
    const abiertas = (data ?? []).filter((f) => Number(f.saldo) > 0);
    const cotejos = await Promise.all(abiertas.map(async (f) => (await supabase.rpc("cotejo_factura", { p_id: f.id })).data as Cotejo | null));
    facturas = abiertas.map((f, i) => {
      const c = cotejos[i];
      const bloqueada = c && c !== "cuadra" && c !== "sin_orden" && !f.revisada ? `${NOMBRE_COTEJO[c].texto}. Márcala como revisada en la factura para poder pagarla.` : null;
      return { ...f, saldo: Number(f.saldo), nombre: `${f.serie ?? ""}${f.folio ?? f.uuid.slice(0, 8)}`, bloqueada };
    });
  }

  return (
    <>
      <div className="encabezado"><h1>Registrar pago</h1><p>Un pago puede cubrir varias facturas del mismo proveedor, completas o en abono.</p></div>
      <Aviso error={error} />
      <form className="seccion formulario" role="search">
        <div className="campo">
          <label htmlFor="proveedor">Proveedor</label>
          <select id="proveedor" name="proveedor" defaultValue={proveedor} required>
            <option value="" disabled>Elige…</option>
            {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
          </select>
        </div>
        <button className="boton boton-secundario" type="submit">Ver sus facturas</button>
      </form>
      {elegido && (!facturas.length
        ? <p className="vacio">Este proveedor no tiene facturas por pagar.</p>
        : <FormPago proveedorId={elegido.id} facturas={facturas} forma={elegido.forma_pago_habitual} hoy={hoyMX()} preseleccion={factura} />)}
    </>
  );
}
```

- [ ] **Step 4: Payment detail page**

`app/compras/pagos/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, pesos } from "@/lib/formato";
import { NOMBRE_FORMA_PAGO, type FormaPago } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { anularPago } from "../acciones";

type Pago = {
  id: string; fecha: string; monto: number; forma: FormaPago; cuenta_origen: string | null; referencia: string | null; comprobante_ruta: string | null;
  anulado_en: string | null; motivo_anulacion: string | null; proveedores: { razon_social: string; nombre_comercial: string | null } | null;
};
type Aplicacion = { id: number; monto: number; facturas: { id: string; serie: string | null; folio: string | null; uuid: string } | null };

export default async function DetallePago({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: p } = await supabase.from("pagos")
    .select("id, fecha, monto, forma, cuenta_origen, referencia, comprobante_ruta, anulado_en, motivo_anulacion, proveedores(razon_social, nombre_comercial)")
    .eq("id", id).maybeSingle<Pago>();
  if (!p) notFound();
  const { data: aplicaciones } = await supabase.from("pago_aplicaciones").select("id, monto, facturas(id, serie, folio, uuid)").eq("pago_id", id).order("id").returns<Aplicacion[]>();
  const url = p.comprobante_ruta ? (await supabase.storage.from("facturas").createSignedUrl(p.comprobante_ruta, 3600)).data?.signedUrl : null;
  const edita = puedeEditarCompras(perfil.rol) && !p.anulado_en;

  return (
    <>
      <div className="encabezado">
        <h1>Pago de {pesos(p.monto)} · {p.proveedores?.nombre_comercial ?? p.proveedores?.razon_social}</h1>
        <p>{fechaTexto(p.fecha)} · {NOMBRE_FORMA_PAGO[p.forma]}{p.anulado_en ? ` · anulado: ${p.motivo_anulacion}` : ""}</p>
      </div>
      <Aviso ok={ok} error={error} />
      <section className="seccion">
        <dl className="tarjeta-datos">
          {p.cuenta_origen && <><dt>Cuenta</dt><dd>{p.cuenta_origen}</dd></>}
          {p.referencia && <><dt>Referencia</dt><dd>{p.referencia}</dd></>}
          {(aplicaciones ?? []).map((a) => (
            <Fragment key={a.id}><dt>{a.facturas ? <Link href={`/compras/facturas/${a.facturas.id}`}>{a.facturas.serie ?? ""}{a.facturas.folio ?? a.facturas.uuid.slice(0, 8)}</Link> : "Factura"}</dt><dd>{pesos(a.monto)}</dd></Fragment>
          ))}
        </dl>
        {url && <a className="boton boton-secundario" href={url} target="_blank" rel="noreferrer">Ver comprobante</a>}
      </section>
      {edita && (
        <details className="seccion">
          <summary>Anular el pago</summary>
          <form action={anularPago} className="formulario">
            <input type="hidden" name="id" value={p.id} />
            <div className="campo"><label htmlFor="motivo">Motivo</label><input id="motivo" name="motivo" required placeholder="Ej. se registró dos veces" /></div>
            <BotonEnviar className="boton boton-alerta" confirmar="¿Anular este pago? Las facturas recuperan su saldo.">Anular pago</BotonEnviar>
          </form>
        </details>
      )}
    </>
  );
}
```

- [ ] **Step 5: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras/pagos/nuevo` and `/compras/pagos/[id]`.

Visual and behavior check: temp page rendering `<FormPago>` with three sample facturas (one `bloqueada`) at 375 px: typing 1000.01 fills the amounts by date; editing one amount shows the "Lo aplicado … no suma …" status; no horizontal scroll. Delete temp page and `.next`.

- [ ] **Step 6: Commit**

```bash
git add app/compras/pagos
git commit -m "feat(compras): registrar, ver y anular pagos"
```

---

### Task 7: Pagos en la factura, tarjeta en corporativo y README

**Files:**
- Modify: `app/compras/facturas/acciones.ts` (append `programarPagoFactura`)
- Modify: `app/compras/facturas/[id]/page.tsx`
- Modify: `app/corporativo/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `programar_pago` (Task 4); `resumenPagos` (Task 1); vista `facturas_saldo` (`pagado`, `falta_complemento`).

- [ ] **Step 1: Action**

Append to `app/compras/facturas/acciones.ts`:

```ts
export async function programarPagoFactura(fd: FormData) {
  await llamarFactura(fd, "programar_pago", { p_factura: texto(fd, "id"), p_fecha: texto(fd, "pago_programado_el") || null },
    texto(fd, "pago_programado_el") ? "Pago programado." : "Se quitó la fecha programada.");
}
```

- [ ] **Step 2: Invoice detail**

In `app/compras/facturas/[id]/page.tsx` (CRLF: use Edit):
- add `pagado, falta_complemento, pago_programado_el` to the `Factura` type (`pagado: number; falta_complemento: boolean; pago_programado_el: string | null;`) and to the `facturas_saldo` select list;
- add `programarPagoFactura` to the import from `../acciones`;
- add a query in the `Promise.all` (or right after it):

```ts
  const { data: pagosFactura } = await supabase.from("pago_aplicaciones")
    .select("id, monto, pagos!inner(id, fecha, anulado_en)").eq("factura_id", id).order("id")
    .returns<{ id: number; monto: number; pagos: { id: string; fecha: string; anulado_en: string | null } }[]>();
```

- in the first summary `<dl>`, after the `Vence` line, add:

```tsx
          {f.tipo === "ingreso" && Number(f.pagado) > 0 && <><dt>Pagado</dt><dd>{pesos(f.pagado)}</dd></>}
          {f.pago_programado_el && <><dt>Programada</dt><dd>{fechaTexto(f.pago_programado_el)}</dd></>}
          {f.falta_complemento && <><dt>Aviso</dt><dd>Falta el complemento de pago del proveedor (factura PPD).</dd></>}
```

- after the `acciones` div with the XML/PDF links, add:

```tsx
        {(pagosFactura ?? []).length > 0 && (
          <dl className="tarjeta-datos">
            {(pagosFactura ?? []).map((a) => (
              <Fragment key={a.id}><dt><Link href={`/compras/pagos/${a.pagos.id}`}>{fechaTexto(a.pagos.fecha)}</Link></dt><dd>{pesos(a.monto)}{a.pagos.anulado_en ? " · anulado" : ""}</dd></Fragment>
            ))}
          </dl>
        )}
        {edita && f.tipo === "ingreso" && Number(f.saldo) > 0 && (f.estado === "por_pagar" || f.estado === "parcial") && (
          <div className="acciones"><Link className="boton" href={`/compras/pagos/nuevo?proveedor=${f.proveedor_id}&factura=${f.id}`}>Registrar pago</Link></div>
        )}
```

- in the Acciones section, next to the vencimiento form, add:

```tsx
          {f.tipo === "ingreso" && (f.estado === "por_pagar" || f.estado === "parcial") && (
            <form action={programarPagoFactura} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="programada">Fecha programada de pago (vacía = la del vencimiento)</label><input id="programada" name="pago_programado_el" type="date" defaultValue={f.pago_programado_el ?? ""} /></div>
              <BotonEnviar className="boton boton-secundario">Programar</BotonEnviar>
            </form>
          )}
```

- [ ] **Step 3: Corporativo card**

In `app/corporativo/page.tsx` (CRLF: use Edit):
- add imports `import Link from "next/link";`, `import { resumenPagos, type PorPagar } from "@/lib/compras/pagos";` and `import { hoyMX } from "@/lib/formato";` (merge with the existing `@/lib/formato` import: `import { hora, hoyMX, pesos } from "@/lib/formato";`);
- after `const datos = await datosCorporativo(...)`, add:

```ts
  const hoyCalendario = hoyMX();
  const [{ data: porPagar }, { data: pagosMes }] = await Promise.all([
    supabase.from("facturas_saldo").select("id, saldo, vence_el, pago_programado_el, estado").eq("tipo", "ingreso").in("estado", ["por_pagar", "parcial"]).returns<PorPagar[]>(),
    supabase.from("pagos").select("fecha, monto, anulado_en").gte("fecha", `${hoyCalendario.slice(0, 7)}-01`).returns<{ fecha: string; monto: number; anulado_en: string | null }[]>(),
  ]);
  const proveedoresResumen = resumenPagos(porPagar ?? [], (pagosMes ?? []).map((p) => ({ fecha: p.fecha, monto: Number(p.monto), anulado: !!p.anulado_en })), hoyCalendario);
```

- right after the `<form className="acciones" method="get">…</form>` block, add:

```tsx
      <section className="seccion" aria-labelledby="t-proveedores">
        <h2 id="t-proveedores">Pagos a proveedores</h2>
        <div className="rejilla">
          <div className="saldo" style={proveedoresResumen.vencido > 0 ? { borderLeftColor: "var(--alerta)" } : undefined}>
            <span>Vencido</span><span className="saldo-monto">{pesos(proveedoresResumen.vencido)}</span>
          </div>
          <div className="saldo"><span>Esta semana</span><span className="saldo-monto">{pesos(proveedoresResumen.semana)}</span></div>
        </div>
        <Link href="/compras/pagos">Ver calendario de pagos</Link>
      </section>
```

- [ ] **Step 4: README**

Append to the "Compras (oficina central)" section of `README.md`:

```markdown
- **Pagos** (fase 4): un pago se registra con su fecha, forma, cuenta, referencia y comprobante; el monto se reparte solo entre las facturas del proveedor que se pagan antes (ajustable) y puede cubrir varias, completas o en abono. La base revisa que nada pase del saldo, que todo sea del mismo proveedor y que una factura que no cuadra con su orden esté revisada. Anular un pago (con motivo) devuelve los saldos. Cada factura se puede programar para otra fecha. Las facturas PPD pagadas muestran "falta complemento" hasta que se sube el XML del complemento de pago. **Calendario** en Compras → Pagos: vencido, esta semana, próximos 30 días y pagado en el mes, y cada día con lo que hay que pagar. Corporativo ve lo vencido y lo de la semana en su vista general.

Migración `0014_compras_pagos.sql` y su prueba `supabase/pruebas/0014_compras_pagos.sql`.
```

- [ ] **Step 5: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build && npm test`
Expected: all succeed.

- [ ] **Step 6: Commit**

```bash
git add app/compras/facturas "app/corporativo/page.tsx" README.md
git commit -m "feat(compras): pagos en la factura y tarjeta en corporativo"
```

---

## After all tasks

- Final whole-branch review (fresh reviewer, most capable model) against this plan and spec section 5.
- Push `feat/compras-pagos`; Sebastián runs `0014_compras_pagos.sql` then `pruebas/0014_compras_pagos.sql` and confirms **PRUEBAS OK**; only then merge to main and copy changed files to `C:\Users\sebcm\Downloads\dodo-control-efectivo_1\dodo-efectivo`.
