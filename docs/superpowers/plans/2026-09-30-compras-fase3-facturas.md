# Compras fase 3: facturas (XML del CFDI) y cotejo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar facturas de proveedores subiendo su XML (y PDF), validarlas contra la empresa y la cartera, ligarlas a órdenes de compra, cotejar orden ↔ recibido ↔ facturado, restar notas de crédito y cerrar solas las órdenes recibidas y facturadas.

**Architecture:** Lector de CFDI puro en `lib/compras/cfdi.ts` (sin dependencias, atributo por atributo); cálculos de cotejo y vencimiento en `lib/compras/facturas.ts`; migración 0013 con `empresa`, `facturas`, `factura_conceptos`, `factura_ordenes`, bucket privado `facturas` y funciones `security definer` para registrar, ligar, revisar, cambiar vencimiento y cancelar. Pantallas en `/compras/facturas` y la facturación visible en el detalle de la orden.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript estricto, Supabase Postgres (RLS, plpgsql, storage), `node --experimental-strip-types --test`.

**Spec:** `docs/superpowers/specs/2026-09-30-compras-design.md` — sección 4 (Facturas) y "Seguridad". Pagos, complementos y calendario (sección 5) quedan para la fase 4.

## Global Constraints

- Repositorio: `C:/Users/sebcm/AppData/Local/Temp/claude/C--Users-sebcm-Downloads-dodo-control-efectivo-1-dodo-efectivo/e60f0e8d-16fc-4407-8eb6-62a8265bd266/scratchpad/dodo-money`, rama `feat/compras-facturas`. Antes de node: `export PATH="$PATH:/c/Program Files/nodejs"`.
- Módulos de `lib/` importan de otros módulos locales **solo tipos** (`import type`, sin extensión). Los `*.test.ts` importan valores con extensión `.ts`.
- Español de México; montos con `pesos()`; fechas con `fechaTexto()`; hoy en SQL con `hoy_mx()` (de 0012).
- Tarjetas y plegables; **nada de tablas anchas ni scroll horizontal** (revisar a 375 px).
- Nada se borra: una factura se cancela con motivo. Admin hace todo; corporativo consulta; la sucursal no ve facturas.
- Varios archivos del proyecto tienen fin de línea CRLF: editar con la herramienta Edit (no con scripts que busquen `\n`).
- `supabase.rpc` no tiene tipos generados: castear el resultado (`data as T`) en lugar de `.returns<T[]>()`.
- Pruebas SQL: bloque `do $$ … $$` que termina con `raise exception 'PRUEBAS OK — …'`; las corre Sebastián. No se fusiona a main sin su "PRUEBAS OK".
- Páginas temporales en `app/login/prueba-*`; se borran antes del commit, junto con `.next`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Decisiones de este plan (desviaciones del spec, con motivo)

- **Proveedor nuevo desde el XML:** en lugar de un paso de "proponer alta", la pantalla de subida trae la casilla **"Dar de alta a los proveedores que no estén en la cartera"** (activada por omisión). Con ella, la base crea el proveedor con razón social, RFC y régimen del XML (días de crédito 0) y el admin lo completa después. Sin ella, ese XML se rechaza con el RFC.
- **Complementos de pago (tipo P)** se reconocen y se rechazan con "Es un complemento de pago: se sube en Pagos" hasta la fase 4.
- **Avance de facturación por orden** = facturas (netas de notas de crédito) ligadas a esa orden ÷ total de la orden. Si una factura cubre varias órdenes, cuenta completa en cada una (puede verse "completa" antes de tiempo); el cotejo sí agrupa todas las órdenes de la factura.
- **Cierre automático:** al ligar una factura, cada orden ligada que esté **recibida completa** y **facturada completa** (±$1) se cierra sola con motivo "Recibida y facturada". Si la recepción se completa después de ligar, la orden queda confirmada con ambos avances completos y el admin la cierra a mano (la pantalla lo sugiere).
- **Saldo** en esta fase = total − notas de crédito ligadas (no canceladas). Los pagos se restan en la fase 4.
- **Archivos:** bucket privado nuevo `facturas` (`<RFC emisor>/<UUID>.xml|pdf`): admin sube, admin y corporativo leen.

## Review Focus

1. **XML con prefijos distintos o sin prefijo** (`<cfdi:Comprobante>`, `<Comprobante>`), con BOM, comillas simples o entidades (`&amp;`) — debe leerse igual.
2. **El nodo `Impuestos` de cada concepto** no trae totales: el IVA del comprobante sale del nodo `Impuestos` que trae `TotalImpuestosTrasladados`; si no hay ninguno, IVA = 0.
3. **La misma factura subida dos veces** (o el mismo XML dos veces en una subida) — la segunda dice "ya se registró el dd/mm…", no se duplica.
4. **Factura para otro RFC** (otra razón social de la empresa) o **en USD** — rechazo claro, nada guardado (ni archivo huérfano: se valida antes de subir).
5. **Nota de crédito cuya factura aún no está** — se guarda con aviso, y al subir la factura después su saldo ya resta la nota.

---

### Task 1: Lector de CFDI (`lib/compras/cfdi.ts`)

**Files:**
- Create: `lib/compras/cfdi.ts`
- Test: `lib/compras/cfdi.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces:
  - `type Cfdi = { uuid: string; version: string; serie: string | null; folio: string | null; tipo: "ingreso" | "egreso"; fecha: string; rfc_emisor: string; nombre_emisor: string; regimen_emisor: string; rfc_receptor: string; metodo_pago: "PUE" | "PPD" | null; forma_pago: string | null; moneda: string; subtotal: number; descuento: number; iva: number; retenciones: number; total: number; uuid_relacionado: string | null; conceptos: { descripcion: string; cantidad: number; unidad: string; valor_unitario: number; importe: number }[] }` (`fecha` = `YYYY-MM-DD`).
  - `NO_ES_CFDI = "El archivo no es un XML de factura (CFDI) válido."`.
  - `leerCfdi(xml: string): { cfdi: Cfdi } | { error: string }`.

- [ ] **Step 1: Write the failing test**

`lib/compras/cfdi.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerCfdi, NO_ES_CFDI } from "./cfdi.ts";

const TFD = (uuid: string) =>
  `<cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="1.1" UUID="${uuid}" FechaTimbrado="2026-09-25T10:16:00"/></cfdi:Complemento>`;

const INGRESO = `\uFEFF<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="A" Folio="1234" Fecha="2026-09-25T10:15:00" FormaPago="03" SubTotal="1000.00" Descuento="0.00" Moneda="MXN" Total="1080.00" TipoDeComprobante="I" Exportacion="01" MetodoPago="PPD" LugarExpedicion="44100">
  <cfdi:Emisor Rfc="LBA010203AB1" Nombre="LACTEOS &amp; ABARROTES DEL BAJIO" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="DPM010203XY9" Nombre="DODO PIZZA MEXICO" DomicilioFiscalReceptor="44100" RegimenFiscalReceptor="601" UsoCFDI="G01"/>
  <cfdi:Conceptos>
    <cfdi:Concepto ClaveProdServ="50131700" Cantidad="10" ClaveUnidad="KGM" Unidad="Kilogramo" Descripcion="QUESO MOZZARELLA" ValorUnitario="50.00" Importe="500.00" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.000000" Importe="0.00"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
    <cfdi:Concepto ClaveProdServ="24121500" Cantidad="100" ClaveUnidad="H87" Descripcion="CAJA PIZZA 35" ValorUnitario="5.00" Importe="500.00" ObjetoImp="02">
      <cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="80.00"/></cfdi:Traslados></cfdi:Impuestos>
    </cfdi:Concepto>
  </cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="80.00"><cfdi:Traslados><cfdi:Traslado Base="500.00" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="80.00"/></cfdi:Traslados></cfdi:Impuestos>
  ${TFD("6f2d9a2b-1c3e-4f5a-8b7c-9d0e1f2a3b4c")}
</cfdi:Comprobante>`;

test("ingreso CFDI 4.0: encabezado, emisor, receptor, impuestos del comprobante y conceptos", () => {
  const r = leerCfdi(INGRESO);
  assert.ok("cfdi" in r);
  assert.deepEqual(r.cfdi, {
    uuid: "6F2D9A2B-1C3E-4F5A-8B7C-9D0E1F2A3B4C", version: "4.0", serie: "A", folio: "1234", tipo: "ingreso", fecha: "2026-09-25",
    rfc_emisor: "LBA010203AB1", nombre_emisor: "LACTEOS & ABARROTES DEL BAJIO", regimen_emisor: "601", rfc_receptor: "DPM010203XY9",
    metodo_pago: "PPD", forma_pago: "03", moneda: "MXN", subtotal: 1000, descuento: 0, iva: 80, retenciones: 0, total: 1080,
    uuid_relacionado: null,
    conceptos: [
      { descripcion: "QUESO MOZZARELLA", cantidad: 10, unidad: "Kilogramo", valor_unitario: 50, importe: 500 },
      { descripcion: "CAJA PIZZA 35", cantidad: 100, unidad: "H87", valor_unitario: 5, importe: 500 },
    ],
  });
});

test("CFDI 3.3 sin prefijo, comillas simples y retenciones; sin nodo de totales el IVA es 0", () => {
  const xml = `<Comprobante Version='3.3' Fecha='2026-09-01T08:00:00' SubTotal='1000' Moneda='MXN' Total='940' TipoDeComprobante='I' MetodoPago='PUE'>
    <Emisor Rfc='GOMJ800101AB2' Nombre='Juan Gómez' RegimenFiscal='612'/><Receptor Rfc='DPM010203XY9'/>
    <Conceptos><Concepto Cantidad='1' ClaveUnidad='E48' Descripcion='Mantenimiento' ValorUnitario='1000' Importe='1000'/></Conceptos>
    <Impuestos TotalImpuestosRetenidos='60'/>
    <Complemento><TimbreFiscalDigital UUID='AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'/></Complemento></Comprobante>`;
  const r = leerCfdi(xml);
  assert.ok("cfdi" in r);
  assert.equal(r.cfdi.version, "3.3");
  assert.equal(r.cfdi.serie, null);
  assert.equal(r.cfdi.forma_pago, null);
  assert.equal(r.cfdi.iva, 0);
  assert.equal(r.cfdi.retenciones, 60);
  assert.equal(r.cfdi.metodo_pago, "PUE");
  assert.equal(r.cfdi.conceptos[0].unidad, "E48");
});

test("nota de crédito (egreso) con su factura relacionada", () => {
  const xml = INGRESO.replace('TipoDeComprobante="I"', 'TipoDeComprobante="E"')
    .replace("<cfdi:Emisor", '<cfdi:CfdiRelacionados TipoRelacion="01"><cfdi:CfdiRelacionado UUID="11111111-2222-3333-4444-555555555555"/></cfdi:CfdiRelacionados><cfdi:Emisor')
    .replace("6f2d9a2b-1c3e-4f5a-8b7c-9d0e1f2a3b4c", "99999999-8888-7777-6666-555555555555");
  const r = leerCfdi(xml);
  assert.ok("cfdi" in r);
  assert.equal(r.cfdi.tipo, "egreso");
  assert.equal(r.cfdi.uuid_relacionado, "11111111-2222-3333-4444-555555555555");
});

test("rechazos con mensaje claro", () => {
  const error = (xml: string) => { const r = leerCfdi(xml); return "error" in r ? r.error : null; };
  assert.equal(error("<html>hola</html>"), NO_ES_CFDI);
  assert.equal(error(INGRESO.replace('Version="4.0"', 'Version="2.2"')), "Versión de CFDI no soportada (2.2); se aceptan 3.3 y 4.0.");
  assert.equal(error(INGRESO.replace(/<cfdi:Complemento>[\s\S]*<\/cfdi:Complemento>/, "")), "La factura no está timbrada (no trae folio fiscal UUID).");
  assert.equal(error(INGRESO.replace('TipoDeComprobante="I"', 'TipoDeComprobante="P"')), "Es un complemento de pago: se sube en Pagos.");
  assert.equal(error(INGRESO.replace('TipoDeComprobante="I"', 'TipoDeComprobante="T"')), "Un comprobante de tipo T no se registra como factura de proveedor.");
  assert.equal(error(INGRESO.replace('Moneda="MXN"', 'Moneda="USD"')), "La factura está en USD; por ahora solo se registran en pesos (MXN).");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/compras/cfdi.test.ts`
Expected: FAIL — `Cannot find module …/lib/compras/cfdi.ts`.

- [ ] **Step 3: Write minimal implementation**

`lib/compras/cfdi.ts`:

```ts
/** Factura de proveedor leída de su XML (CFDI 3.3 o 4.0). Montos tal como vienen; fecha sin hora. */
export type Cfdi = {
  uuid: string; version: string; serie: string | null; folio: string | null; tipo: "ingreso" | "egreso"; fecha: string;
  rfc_emisor: string; nombre_emisor: string; regimen_emisor: string; rfc_receptor: string;
  metodo_pago: "PUE" | "PPD" | null; forma_pago: string | null; moneda: string;
  subtotal: number; descuento: number; iva: number; retenciones: number; total: number;
  uuid_relacionado: string | null;
  conceptos: { descripcion: string; cantidad: number; unidad: string; valor_unitario: number; importe: number }[];
};

export const NO_ES_CFDI = "El archivo no es un XML de factura (CFDI) válido.";

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const desescapar = (t: string) =>
  t.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e.toLowerCase()]);

/** Todas las etiquetas de apertura `<prefijo:Nombre …>` (con o sin prefijo). */
const etiquetas = (xml: string, nombre: string) =>
  [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${nombre}\\b[^>]*>`, "g"))].map((m) => m[0]);
const etiqueta = (xml: string, nombre: string) => etiquetas(xml, nombre)[0];

/** Valor de un atributo, con comillas dobles o simples, ya sin entidades. */
function atributo(tag: string | undefined, nombre: string): string | null {
  if (!tag) return null;
  const m = new RegExp(`\\s${nombre}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(tag);
  return m ? desescapar(m[1] ?? m[2]).trim() : null;
}
const monto = (tag: string | undefined, nombre: string) => Number(atributo(tag, nombre) ?? 0) || 0;

export function leerCfdi(xml: string): { cfdi: Cfdi } | { error: string } {
  const texto = xml.replace(/^\uFEFF/, "");
  const comprobante = etiqueta(texto, "Comprobante");
  if (!comprobante) return { error: NO_ES_CFDI };

  const version = atributo(comprobante, "Version");
  if (version !== "4.0" && version !== "3.3") return { error: `Versión de CFDI no soportada (${version ?? "sin versión"}); se aceptan 3.3 y 4.0.` };

  const uuid = atributo(etiqueta(texto, "TimbreFiscalDigital"), "UUID");
  if (!uuid) return { error: "La factura no está timbrada (no trae folio fiscal UUID)." };

  const letra = atributo(comprobante, "TipoDeComprobante");
  if (letra === "P") return { error: "Es un complemento de pago: se sube en Pagos." };
  if (letra !== "I" && letra !== "E") return { error: `Un comprobante de tipo ${letra ?? "?"} no se registra como factura de proveedor.` };

  const moneda = atributo(comprobante, "Moneda") ?? "MXN";
  if (moneda !== "MXN") return { error: `La factura está en ${moneda}; por ahora solo se registran en pesos (MXN).` };

  const emisor = etiqueta(texto, "Emisor");
  const receptor = etiqueta(texto, "Receptor");
  const fecha = atributo(comprobante, "Fecha") ?? "";
  if (!emisor || !receptor || !/^\d{4}-\d{2}-\d{2}T/.test(fecha)) return { error: NO_ES_CFDI };

  // Los Impuestos de cada concepto no traen totales; los del comprobante sí.
  const impuestos = etiquetas(texto, "Impuestos").find((t) => /\sTotalImpuestos(?:Trasladados|Retenidos)\s*=/.test(t));
  const metodo = atributo(comprobante, "MetodoPago");

  return {
    cfdi: {
      uuid: uuid.toUpperCase(), version, serie: atributo(comprobante, "Serie"), folio: atributo(comprobante, "Folio"),
      tipo: letra === "I" ? "ingreso" : "egreso", fecha: fecha.slice(0, 10),
      rfc_emisor: (atributo(emisor, "Rfc") ?? "").toUpperCase(), nombre_emisor: atributo(emisor, "Nombre") ?? "",
      regimen_emisor: atributo(emisor, "RegimenFiscal") ?? "", rfc_receptor: (atributo(receptor, "Rfc") ?? "").toUpperCase(),
      metodo_pago: metodo === "PUE" || metodo === "PPD" ? metodo : null, forma_pago: atributo(comprobante, "FormaPago"), moneda,
      subtotal: monto(comprobante, "SubTotal"), descuento: monto(comprobante, "Descuento"),
      iva: monto(impuestos, "TotalImpuestosTrasladados"), retenciones: monto(impuestos, "TotalImpuestosRetenidos"),
      total: monto(comprobante, "Total"),
      uuid_relacionado: atributo(etiqueta(texto, "CfdiRelacionado"), "UUID")?.toUpperCase() ?? null,
      conceptos: etiquetas(texto, "Concepto").map((c) => ({
        descripcion: atributo(c, "Descripcion") ?? "", cantidad: monto(c, "Cantidad"),
        unidad: atributo(c, "Unidad") ?? atributo(c, "ClaveUnidad") ?? "",
        valor_unitario: monto(c, "ValorUnitario"), importe: monto(c, "Importe"),
      })),
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/compras/cfdi.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Real samples (if Sebastián shared them)**

If real XML files from providers are available, copy them (they contain only company data, no personal data) to `lib/compras/__fixtures__/` and add one test per file asserting `"cfdi" in leerCfdi(texto)` and the UUID, RFC emisor and total read by hand from the file. Ledger a `Ruling:` line saying which files were added, or that none were available.

- [ ] **Step 6: Add to suite and commit**

Append ` lib/compras/cfdi.test.ts` to the `test` script. Run `npm test` → all pass.

```bash
git add lib/compras/cfdi.ts lib/compras/cfdi.test.ts lib/compras/__fixtures__ package.json
git commit -m "feat(compras): lector de facturas CFDI"
```

---

### Task 2: Cotejo, vencimiento y facturación (`lib/compras/facturas.ts`)

**Files:**
- Create: `lib/compras/facturas.ts`
- Test: `lib/compras/facturas.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `type TasaIva` (solo tipo).
- Produces:
  - `ESTADOS_FACTURA = ["por_pagar", "parcial", "pagada", "cancelada"] as const`, `type EstadoFactura`, `NOMBRE_ESTADO_FACTURA`.
  - `venceEl(fecha: string, diasCredito: number, metodo: "PUE" | "PPD" | null): string`.
  - `vencida(f: { estado: EstadoFactura; vence_el: string; saldo: number }, hoy: string): boolean`.
  - `valorRecibido(renglones: readonly { recibido: number; precio: number; tasa_iva: TasaIva }[]): number`.
  - `type Cotejo = "cuadra" | "facturado_de_mas" | "precio_distinto" | "nada_recibido" | "sin_orden"`, `NOMBRE_COTEJO: Record<Cotejo, { texto: string; alerta: boolean }>`.
  - `cotejar(d: { tieneOrdenes: boolean; ordenado: number; recibido: number; recepcionCompleta: boolean; facturado: number }): Cotejo`.
  - `avanceFacturacion(totalOrden: number, facturado: number): "nada" | "parcial" | "completa"`.
  - `baseArchivo(nombre: string): string` (minúsculas, sin extensión) para emparejar `x.xml` con `x.pdf`.

- [ ] **Step 1: Write the failing test**

`lib/compras/facturas.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { avanceFacturacion, baseArchivo, cotejar, valorRecibido, venceEl, vencida } from "./facturas.ts";

test("vencimiento: PUE vence el mismo día; PPD y sin método suman los días de crédito", () => {
  assert.equal(venceEl("2026-09-25", 15, "PUE"), "2026-09-25");
  assert.equal(venceEl("2026-09-25", 15, "PPD"), "2026-10-10");
  assert.equal(venceEl("2026-12-20", 30, null), "2027-01-19");
  assert.equal(venceEl("2026-09-25", 0, "PPD"), "2026-09-25");
});

test("vencida: con saldo, sin pagar y pasada la fecha", () => {
  assert.equal(vencida({ estado: "por_pagar", vence_el: "2026-09-29", saldo: 100 }, "2026-09-30"), true);
  assert.equal(vencida({ estado: "parcial", vence_el: "2026-09-29", saldo: 50 }, "2026-09-30"), true);
  assert.equal(vencida({ estado: "por_pagar", vence_el: "2026-09-30", saldo: 100 }, "2026-09-30"), false);
  assert.equal(vencida({ estado: "pagada", vence_el: "2026-09-01", saldo: 0 }, "2026-09-30"), false);
  assert.equal(vencida({ estado: "cancelada", vence_el: "2026-09-01", saldo: 100 }, "2026-09-30"), false);
  assert.equal(vencida({ estado: "por_pagar", vence_el: "2026-09-01", saldo: 0 }, "2026-09-30"), false);
});

test("valor de lo recibido a precio de la orden con IVA", () => {
  assert.equal(valorRecibido([{ recibido: 10, precio: 50, tasa_iva: "0" }, { recibido: 50, precio: 5, tasa_iva: "16" }]), 790);
  assert.equal(valorRecibido([]), 0);
});

test("cotejo de tres vías con tolerancia de $1", () => {
  const base = { tieneOrdenes: true, ordenado: 1080, recibido: 1080, recepcionCompleta: true, facturado: 1080 };
  assert.equal(cotejar(base), "cuadra");
  assert.equal(cotejar({ ...base, facturado: 1080.9 }), "cuadra");
  assert.equal(cotejar({ ...base, tieneOrdenes: false }), "sin_orden");
  assert.equal(cotejar({ ...base, recibido: 0, recepcionCompleta: false }), "nada_recibido");
  assert.equal(cotejar({ ...base, recibido: 540, recepcionCompleta: false, facturado: 1080 }), "facturado_de_mas");
  assert.equal(cotejar({ ...base, recibido: 540, recepcionCompleta: false, facturado: 540 }), "cuadra");
  assert.equal(cotejar({ ...base, recibido: 1200, ordenado: 1200, facturado: 1080 }), "precio_distinto");
});

test("avance de facturación de una orden", () => {
  assert.equal(avanceFacturacion(1000, 0), "nada");
  assert.equal(avanceFacturacion(1000, 400), "parcial");
  assert.equal(avanceFacturacion(1000, 999.5), "completa");
  assert.equal(avanceFacturacion(1000, 1200), "completa");
});

test("emparejar XML y PDF por nombre", () => {
  assert.equal(baseArchivo("A-1234.XML"), "a-1234");
  assert.equal(baseArchivo("A-1234.pdf"), "a-1234");
  assert.equal(baseArchivo("factura sin extension"), "factura sin extension");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/compras/facturas.test.ts`
Expected: FAIL — `Cannot find module …/facturas.ts`.

- [ ] **Step 3: Write minimal implementation**

`lib/compras/facturas.ts`:

```ts
import type { TasaIva } from "./proveedores";

export const ESTADOS_FACTURA = ["por_pagar", "parcial", "pagada", "cancelada"] as const;
export type EstadoFactura = (typeof ESTADOS_FACTURA)[number];
export const NOMBRE_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  por_pagar: "Por pagar", parcial: "Pagada en parte", pagada: "Pagada", cancelada: "Cancelada",
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const TOLERANCIA = 1;

/** PUE se paga de contado (vence el día de la factura); PPD o sin método: fecha + días de crédito. */
export function venceEl(fecha: string, diasCredito: number, metodo: "PUE" | "PPD" | null): string {
  if (metodo === "PUE") return fecha;
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + diasCredito);
  return d.toISOString().slice(0, 10);
}

export const vencida = (f: { estado: EstadoFactura; vence_el: string; saldo: number }, hoy: string) =>
  (f.estado === "por_pagar" || f.estado === "parcial") && Number(f.saldo) > 0 && f.vence_el < hoy;

/** Lo recibido valuado al precio de la orden, con IVA por renglón (como factura el proveedor). */
export const valorRecibido = (renglones: readonly { recibido: number; precio: number; tasa_iva: TasaIva }[]) =>
  r2(renglones.reduce((s, r) => {
    const importe = r2(Number(r.recibido) * Number(r.precio));
    return s + importe + r2(importe * (r.tasa_iva === "16" ? 0.16 : 0));
  }, 0));

export type Cotejo = "cuadra" | "facturado_de_mas" | "precio_distinto" | "nada_recibido" | "sin_orden";
export const NOMBRE_COTEJO: Record<Cotejo, { texto: string; alerta: boolean }> = {
  cuadra: { texto: "Cuadra con lo recibido", alerta: false },
  facturado_de_mas: { texto: "Facturado de más: supera lo recibido", alerta: true },
  precio_distinto: { texto: "Precio distinto: lo facturado no coincide con la orden", alerta: true },
  nada_recibido: { texto: "Nada recibido todavía", alerta: true },
  sin_orden: { texto: "Sin orden de compra", alerta: false },
};

/**
 * Orden ↔ recibido ↔ facturado por totales (±$1). Facturar menos de lo recibido cuadra (puede faltar otra factura);
 * con todo recibido, lo facturado debe coincidir con lo ordenado.
 */
export function cotejar(d: { tieneOrdenes: boolean; ordenado: number; recibido: number; recepcionCompleta: boolean; facturado: number }): Cotejo {
  if (!d.tieneOrdenes) return "sin_orden";
  if (d.recibido <= 0) return "nada_recibido";
  if (d.facturado > d.recibido + TOLERANCIA) return "facturado_de_mas";
  if (d.recepcionCompleta && Math.abs(d.facturado - d.ordenado) > TOLERANCIA) return "precio_distinto";
  return "cuadra";
}

export function avanceFacturacion(totalOrden: number, facturado: number): "nada" | "parcial" | "completa" {
  if (facturado <= 0) return "nada";
  return facturado + TOLERANCIA >= totalOrden ? "completa" : "parcial";
}

export const baseArchivo = (nombre: string) => nombre.toLowerCase().replace(/\.(xml|pdf)$/, "");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test lib/compras/facturas.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Add to suite and commit**

Append ` lib/compras/facturas.test.ts` to the `test` script. Run `npm test` → all pass.

```bash
git add lib/compras/facturas.ts lib/compras/facturas.test.ts package.json
git commit -m "feat(compras): cotejo, vencimiento y avance de facturación"
```

---

### Task 3: Menú de Compras con Facturas

**Files:**
- Modify: `lib/roles.ts`
- Test: `lib/roles.test.ts`

**Interfaces:**
- Produces: `enlacesCompras(rol)` agrega `{ href: "/compras/facturas", texto: "Facturas" }` después de Recepciones.

- [ ] **Step 1: Write the failing test**

In `lib/roles.test.ts`, test `menú de compras por rol`: change the two `deepEqual` expectations to

```ts
  assert.deepEqual(enlacesCompras("admin").map((e) => e.href),
    ["/", "/compras", "/compras/articulos", "/compras/ordenes", "/compras/recepciones", "/compras/facturas", "/compras/cargar"]);
  assert.deepEqual(enlacesCompras("corporativo").map((e) => e.href),
    ["/corporativo", "/compras", "/compras/articulos", "/compras/ordenes", "/compras/recepciones", "/compras/facturas"]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test lib/roles.test.ts`
Expected: FAIL in `menú de compras por rol` (missing `/compras/facturas`).

- [ ] **Step 3: Implement**

In `lib/roles.ts`, in `enlacesCompras`, after `{ href: "/compras/recepciones", texto: "Recepciones" },` add `{ href: "/compras/facturas", texto: "Facturas" },`.

- [ ] **Step 4: Run test to verify it passes, commit**

Run: `node --experimental-strip-types --test lib/roles.test.ts` → PASS; `npm test` → all pass.

```bash
git add lib/roles.ts lib/roles.test.ts
git commit -m "feat(compras): Facturas en el menú de Compras"
```

---

### Task 4: Migración 0013 y su prueba SQL

**Files:**
- Create: `supabase/migrations/0013_compras_facturas.sql`
- Create: `supabase/pruebas/0013_compras_facturas.sql`

**Interfaces:**
- Consumes: `ve_compras()`, `edita_compras()`, `exigir_admin_compras()`, `hoy_mx()`, `recibido_renglon(uuid)`, tablas de 0011–0012.
- Produces:
  - `empresa(id boolean pk = true, rfc, razon_social)`.
  - Tipos `tipo_factura` (`ingreso | egreso`), `estado_factura` (`por_pagar | parcial | pagada | cancelada`).
  - `facturas(id, uuid unique, serie, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, metodo_pago, forma_pago, moneda, subtotal, descuento, iva, retenciones, total, proveedor_id, sucursal_id, uuid_relacionado, vence_el, estado, revisada, revision_nota, revisada_por, revisada_en, xml_ruta, pdf_ruta, motivo_cancelacion, cancelada_por, cancelada_en, creado_por, creado_en)`, `factura_conceptos(id, factura_id, descripcion, cantidad, unidad, valor_unitario, importe)`, `factura_ordenes(factura_id, orden_id)`.
  - Vista `facturas_saldo` = columnas de `facturas` + `saldo numeric`.
  - Funciones: `saldo_factura(uuid) → numeric`, `total_orden(uuid) → numeric`, `facturado_orden(uuid) → numeric`, `recepcion_completa(uuid) → boolean`, `registrar_factura(p_cfdi jsonb, p_alta_proveedor boolean, p_xml text, p_pdf text) → uuid`, `ligar_factura_ordenes(p_factura uuid, p_ordenes uuid[])`, `asignar_destino_factura(p_factura uuid, p_sucursal uuid)`, `marcar_factura_revisada(p_id uuid, p_nota text)`, `cambiar_vencimiento(p_id uuid, p_fecha date)`, `cancelar_factura(p_id uuid, p_motivo text)`.
  - Bucket `facturas`.

- [ ] **Step 1: Write the migration**

`supabase/migrations/0013_compras_facturas.sql`:

```sql
-- Compras, fase 3: facturas de proveedores (XML del CFDI), notas de crédito y cotejo con las órdenes.
-- El admin sube; corporativo consulta; la sucursal no ve facturas. Nada se borra: se cancela con motivo.
-- Al ligar una factura, las órdenes recibidas y facturadas completas se cierran solas. Requiere 0001–0012.

create table empresa (
  id            boolean primary key default true check (id),   -- una sola fila
  rfc           text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  razon_social  text not null check (trim(razon_social) <> '')
);

create type tipo_factura as enum ('ingreso', 'egreso');
create type estado_factura as enum ('por_pagar', 'parcial', 'pagada', 'cancelada');

create table facturas (
  id                  uuid primary key default gen_random_uuid(),
  uuid                text not null unique,
  serie               text,
  folio               text,
  tipo                tipo_factura not null,
  fecha_emision       date not null,
  rfc_emisor          text not null,
  nombre_emisor       text not null,
  regimen_emisor      text not null,
  rfc_receptor        text not null,
  metodo_pago         text check (metodo_pago in ('PUE', 'PPD')),
  forma_pago          text,
  moneda              text not null default 'MXN' check (moneda = 'MXN'),
  subtotal            numeric(14,2) not null,
  descuento           numeric(14,2) not null default 0,
  iva                 numeric(14,2) not null default 0,
  retenciones         numeric(14,2) not null default 0,
  total               numeric(14,2) not null check (total >= 0),
  proveedor_id        uuid not null references proveedores(id),
  sucursal_id         uuid references sucursales(id),          -- a dónde se carga; null = Oficina
  uuid_relacionado    text,                                    -- egreso: la factura que corrige
  vence_el            date not null,
  estado              estado_factura not null default 'por_pagar',
  revisada            boolean not null default false,
  revision_nota       text,
  revisada_por        uuid references perfiles(id),
  revisada_en         timestamptz,
  xml_ruta            text not null,
  pdf_ruta            text,
  motivo_cancelacion  text,
  cancelada_por       uuid references perfiles(id),
  cancelada_en        timestamptz,
  creado_por          uuid references perfiles(id) default auth.uid(),
  creado_en           timestamptz not null default now(),
  check (estado <> 'cancelada' or coalesce(trim(motivo_cancelacion), '') <> ''),
  check (not revisada or coalesce(trim(revision_nota), '') <> '')
);
create index facturas_proveedor on facturas (proveedor_id);
create index facturas_relacionado on facturas (uuid_relacionado);

create table factura_conceptos (
  id              bigserial primary key,
  factura_id      uuid not null references facturas(id),
  descripcion     text not null,
  cantidad        numeric(14,4) not null,
  unidad          text not null,
  valor_unitario  numeric(14,4) not null,
  importe         numeric(14,2) not null
);
create index factura_conceptos_factura on factura_conceptos (factura_id);

create table factura_ordenes (
  factura_id  uuid not null references facturas(id),
  orden_id    uuid not null references ordenes_compra(id),
  primary key (factura_id, orden_id)
);
create index factura_ordenes_orden on factura_ordenes (orden_id);

-- ─── Cálculos ───────────────────────────────────────────────────────────────
-- Saldo: total − notas de crédito vigentes que la corrigen (los pagos se restan en la fase 4). Un egreso no tiene saldo.
create or replace function saldo_factura(p_id uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select case when f.tipo = 'egreso' or f.estado = 'cancelada' then 0
              else greatest(f.total - coalesce((select sum(n.total) from facturas n
                                                  where n.tipo = 'egreso' and n.estado <> 'cancelada' and n.uuid_relacionado = f.uuid), 0), 0)
         end
    from facturas f where f.id = p_id
$$;

create view facturas_saldo with (security_invoker = true) as
select f.*, saldo_factura(f.id) as saldo from facturas f;

-- Total de una orden con IVA por renglón (como totalesOrden en lib/compras/ordenes.ts).
create or replace function total_orden(p_orden uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(round(cantidad * precio, 2) + round(round(cantidad * precio, 2) * case when tasa_iva = '16' then 0.16 else 0 end, 2)), 0)
    from orden_renglones where orden_id = p_orden
$$;

-- Facturado de una orden: facturas de ingreso vigentes ligadas, netas de sus notas de crédito.
create or replace function facturado_orden(p_orden uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(saldo_factura(f.id)), 0)
    from factura_ordenes fo join facturas f on f.id = fo.factura_id
   where fo.orden_id = p_orden and f.tipo = 'ingreso' and f.estado <> 'cancelada'
$$;

create or replace function recepcion_completa(p_orden uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from orden_renglones where orden_id = p_orden)
     and not exists (select 1 from orden_renglones r where r.orden_id = p_orden and recibido_renglon(r.id) < r.cantidad)
$$;

revoke execute on function saldo_factura(uuid), total_orden(uuid), facturado_orden(uuid), recepcion_completa(uuid) from public, anon;
grant execute on function saldo_factura(uuid), total_orden(uuid), facturado_orden(uuid), recepcion_completa(uuid) to authenticated;

-- ─── Seguridad por renglón ──────────────────────────────────────────────────
alter table empresa            enable row level security;
alter table facturas           enable row level security;
alter table factura_conceptos  enable row level security;
alter table factura_ordenes    enable row level security;

create policy ver_empresa on empresa for select using (ve_compras());
create policy alta_empresa on empresa for insert with check (edita_compras());
create policy editar_empresa on empresa for update using (edita_compras()) with check (edita_compras());
create policy ver_facturas on facturas for select using (ve_compras());
create policy ver_conceptos on factura_conceptos for select using (ve_compras());
create policy ver_factura_ordenes on factura_ordenes for select using (ve_compras());
-- Facturas, conceptos y ligas solo se escriben con las funciones de abajo.

-- ─── Archivos ───────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas', 'facturas', false, 5242880, array['application/xml', 'text/xml', 'application/pdf'])
on conflict (id) do nothing;

create policy subir_factura on storage.objects for insert to authenticated
  with check (bucket_id = 'facturas' and public.edita_compras());
create policy ver_factura on storage.objects for select to authenticated
  using (bucket_id = 'facturas' and public.ve_compras());
-- Sin update ni delete: un archivo subido no se reemplaza ni se borra.

-- ─── Registrar ──────────────────────────────────────────────────────────────
-- p_cfdi: el objeto que arma leerCfdi (lib/compras/cfdi.ts). p_alta_proveedor: si el RFC no está en la cartera, darlo de alta.
create or replace function registrar_factura(p_cfdi jsonb, p_alta_proveedor boolean, p_xml text, p_pdf text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e empresa; v_prov proveedores; v_id uuid; v_previa facturas; v_fecha date := (p_cfdi->>'fecha')::date;
  v_metodo text := nullif(p_cfdi->>'metodo_pago', '');
begin
  perform exigir_admin_compras();
  select * into e from empresa;
  if not found then raise exception 'Configura primero el RFC de la empresa (Compras → Facturas → Datos de la empresa).'; end if;
  if upper(p_cfdi->>'rfc_receptor') <> e.rfc then
    raise exception 'La factura es para el RFC %, no para % (%).', p_cfdi->>'rfc_receptor', e.razon_social, e.rfc;
  end if;
  select * into v_previa from facturas where uuid = upper(p_cfdi->>'uuid');
  if found then
    raise exception 'Esta factura ya se registró el % (folio %).', to_char(v_previa.creado_en at time zone 'America/Mexico_City', 'DD/MM/YYYY'), coalesce(v_previa.serie || '-', '') || coalesce(v_previa.folio, v_previa.uuid);
  end if;
  if coalesce(p_cfdi->>'moneda', 'MXN') <> 'MXN' then raise exception 'Solo se registran facturas en pesos (MXN).'; end if;

  select * into v_prov from proveedores where rfc = upper(p_cfdi->>'rfc_emisor');
  if not found then
    if not p_alta_proveedor then raise exception 'El proveedor con RFC % no está en la cartera.', p_cfdi->>'rfc_emisor'; end if;
    insert into proveedores (razon_social, rfc, regimen_fiscal)
    values (coalesce(nullif(trim(p_cfdi->>'nombre_emisor'), ''), upper(p_cfdi->>'rfc_emisor')), upper(p_cfdi->>'rfc_emisor'),
            case when p_cfdi->>'regimen_emisor' ~ '^6[0-9]{2}$' then p_cfdi->>'regimen_emisor' else '601' end)
    returning * into v_prov;
  end if;

  insert into facturas (uuid, serie, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, rfc_receptor, metodo_pago, forma_pago,
                        subtotal, descuento, iva, retenciones, total, proveedor_id, uuid_relacionado, vence_el, xml_ruta, pdf_ruta, estado)
  values (upper(p_cfdi->>'uuid'), nullif(p_cfdi->>'serie', ''), nullif(p_cfdi->>'folio', ''), (p_cfdi->>'tipo')::tipo_factura, v_fecha,
          upper(p_cfdi->>'rfc_emisor'), coalesce(p_cfdi->>'nombre_emisor', ''), coalesce(p_cfdi->>'regimen_emisor', ''), upper(p_cfdi->>'rfc_receptor'),
          v_metodo, nullif(p_cfdi->>'forma_pago', ''),
          (p_cfdi->>'subtotal')::numeric, coalesce((p_cfdi->>'descuento')::numeric, 0), coalesce((p_cfdi->>'iva')::numeric, 0),
          coalesce((p_cfdi->>'retenciones')::numeric, 0), (p_cfdi->>'total')::numeric, v_prov.id, nullif(upper(p_cfdi->>'uuid_relacionado'), ''),
          case when v_metodo = 'PUE' then v_fecha else v_fecha + v_prov.dias_credito end, p_xml, nullif(p_pdf, ''),
          case when p_cfdi->>'tipo' = 'egreso' then 'pagada'::estado_factura else 'por_pagar'::estado_factura end)
  returning id into v_id;

  insert into factura_conceptos (factura_id, descripcion, cantidad, unidad, valor_unitario, importe)
  select v_id, c.descripcion, c.cantidad, coalesce(c.unidad, ''), c.valor_unitario, c.importe
    from jsonb_to_recordset(coalesce(p_cfdi->'conceptos', '[]'::jsonb))
         c(descripcion text, cantidad numeric, unidad text, valor_unitario numeric, importe numeric);
  return v_id;
end $$;

-- ─── Ligar a órdenes (y cierre automático) ──────────────────────────────────
create or replace function ligar_factura_ordenes(p_factura uuid, p_ordenes uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare f facturas; v_orden uuid; v_folio text;
begin
  perform exigir_admin_compras();
  select * into f from facturas where id = p_factura for update;
  if not found then raise exception 'Factura no encontrada'; end if;
  if f.estado = 'cancelada' then raise exception 'La factura está cancelada'; end if;
  if f.tipo <> 'ingreso' then raise exception 'Las notas de crédito se ligan a su factura, no a órdenes'; end if;
  if exists (select 1 from ordenes_compra o where o.id = any(coalesce(p_ordenes, '{}'))
              and (o.proveedor_id <> f.proveedor_id or o.estado not in ('confirmada', 'cerrada'))) then
    raise exception 'Solo se ligan órdenes confirmadas o cerradas del mismo proveedor';
  end if;

  delete from factura_ordenes where factura_id = p_factura;
  insert into factura_ordenes (factura_id, orden_id) select p_factura, unnest(coalesce(p_ordenes, '{}'));

  foreach v_orden in array coalesce(p_ordenes, '{}') loop
    if (select estado from ordenes_compra where id = v_orden) = 'confirmada'
       and recepcion_completa(v_orden) and facturado_orden(v_orden) + 1 >= total_orden(v_orden) then
      update ordenes_compra set estado = 'cerrada', cerrada_por = auth.uid(), cerrada_en = now(), motivo = 'Recibida y facturada'
       where id = v_orden returning folio into v_folio;
      insert into orden_historial (orden_id, evento, nota) values (v_orden, 'cerrada', 'Recibida y facturada');
    end if;
  end loop;
  insert into orden_historial (orden_id, evento, nota)
  select unnest(coalesce(p_ordenes, '{}')), 'facturada', coalesce(f.serie || '-', '') || coalesce(f.folio, f.uuid);
end $$;

create or replace function asignar_destino_factura(p_factura uuid, p_sucursal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  update facturas set sucursal_id = p_sucursal where id = p_factura and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o está cancelada'; end if;
end $$;

create or replace function marcar_factura_revisada(p_id uuid, p_nota text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_nota), '') = '' then raise exception 'Escribe qué revisaste'; end if;
  update facturas set revisada = true, revision_nota = trim(p_nota), revisada_por = auth.uid(), revisada_en = now()
   where id = p_id and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o está cancelada'; end if;
end $$;

create or replace function cambiar_vencimiento(p_id uuid, p_fecha date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if p_fecha is null then raise exception 'Elige la fecha de vencimiento'; end if;
  update facturas set vence_el = p_fecha where id = p_id and estado in ('por_pagar', 'parcial');
  if not found then raise exception 'Solo se cambia el vencimiento de una factura por pagar'; end if;
end $$;

-- No se cancela con pagos (fase 4 agrega esa revisión). Cancelar una factura quita sus ligas a órdenes.
create or replace function cancelar_factura(p_id uuid, p_motivo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform exigir_admin_compras();
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Escribe el motivo de la cancelación'; end if;
  update facturas set estado = 'cancelada', motivo_cancelacion = trim(p_motivo), cancelada_por = auth.uid(), cancelada_en = now()
   where id = p_id and estado <> 'cancelada';
  if not found then raise exception 'La factura no existe o ya estaba cancelada'; end if;
  delete from factura_ordenes where factura_id = p_id;
end $$;
```

- [ ] **Step 2: Write the SQL test**

`supabase/pruebas/0013_compras_facturas.sql`:

```sql
-- Pruebas de la migración 0013 (Compras: facturas). Córrelas completas en Supabase → SQL Editor.
-- Necesitan dos usuarios activos de la misma sucursal; sus puestos y la empresa cambian solo mientras corre el script.
-- El resultado aparece como ERROR A PROPÓSITO para que Postgres deshaga todo:
--   · "PRUEBAS OK — …" → todo bien.   · "FALLÓ: …" → dice qué regla no se cumplió.

do $$
declare
  v_a uuid; v_b uuid; v_suc uuid; v_prov uuid; v_art uuid; v_oc uuid; v_r uuid; v_f uuid; v_nc uuid; v_n int;
  v_hoy date := (now() at time zone 'America/Mexico_City')::date;
  v_insumo text := 'FEDCBA9876543210FEDCBA9876543210';
  v_ok text[] := '{}';
  v_cfdi jsonb;
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

  -- Orden confirmada y recibida completa: 10 kg a $100 sin IVA = $1,000.
  insert into proveedores (razon_social, rfc, regimen_fiscal, dias_credito) values ('Prueba Factura Uno', 'PFU010203AB1', '601', 15) returning id into v_prov;
  insert into articulos (nombre, unidad, tipo, tasa_iva, dodo_insumo_id) values ('Prueba factura queso', 'kg', 'consumible', '0', v_insumo) returning id into v_art;
  insert into ordenes_compra (proveedor_id, sucursal_id) values (v_prov, v_suc) returning id into v_oc;
  insert into orden_renglones (orden_id, articulo_id, descripcion, cantidad, precio, tasa_iva) values (v_oc, v_art, 'Queso', 10, 100, '0') returning id into v_r;
  perform confirmar_orden(v_oc);
  perform importar_recepciones_dodo('prueba.xlsx', jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'fecha', v_hoy)),
    jsonb_build_array(jsonb_build_object('sucursal_id', v_suc, 'dodo_insumo_id', v_insumo, 'material', 'Queso', 'unidad', 'kg', 'fecha', v_hoy, 'cantidad', 10, 'precio', 100)));
  if not recepcion_completa(v_oc) then raise exception 'FALLÓ: la orden de prueba debe quedar recibida'; end if;

  v_cfdi := jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000001', 'serie', 'A', 'folio', '1', 'tipo', 'ingreso', 'fecha', v_hoy,
    'rfc_emisor', 'PFU010203AB1', 'nombre_emisor', 'PRUEBA FACTURA UNO', 'regimen_emisor', '601', 'rfc_receptor', 'DPM010203XY9',
    'metodo_pago', 'PPD', 'forma_pago', '99', 'moneda', 'MXN', 'subtotal', 1000, 'descuento', 0, 'iva', 0, 'retenciones', 0, 'total', 1000,
    'uuid_relacionado', null, 'conceptos', jsonb_build_array(jsonb_build_object('descripcion', 'QUESO', 'cantidad', 10, 'unidad', 'KG', 'valor_unitario', 100, 'importe', 1000)));

  -- Receptor equivocado
  begin
    perform registrar_factura(v_cfdi || jsonb_build_object('rfc_receptor', 'OTR010203AB1'), true, 'x.xml', null);
    raise exception 'FALLÓ: factura para otro RFC';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'La factura es para el RFC%' then raise exception 'FALLÓ: mensaje inesperado (receptor): %', sqlerrm; end if;
  end;

  v_f := registrar_factura(v_cfdi, false, 'PFU010203AB1/AAAAAAAA-0000-0000-0000-000000000001.xml', null);
  if (select vence_el from facturas where id = v_f) <> v_hoy + 15 then raise exception 'FALLÓ: vence = fecha + días de crédito (PPD)'; end if;
  if (select count(*) from factura_conceptos where factura_id = v_f) <> 1 then raise exception 'FALLÓ: conceptos'; end if;
  begin
    perform registrar_factura(v_cfdi, false, 'x.xml', null);
    raise exception 'FALLÓ: UUID repetido';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Esta factura ya se registró el%' then raise exception 'FALLÓ: mensaje inesperado (UUID): %', sqlerrm; end if;
  end;
  begin
    perform registrar_factura(v_cfdi || jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000009', 'rfc_emisor', 'NUE010203AB1'), false, 'x.xml', null);
    raise exception 'FALLÓ: proveedor fuera de la cartera sin alta';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like '%no está en la cartera%' then raise exception 'FALLÓ: mensaje inesperado (cartera): %', sqlerrm; end if;
  end;
  perform registrar_factura(v_cfdi || jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000002', 'rfc_emisor', 'NUE010203AB1', 'nombre_emisor', 'NUEVO SA', 'metodo_pago', 'PUE'), true, 'x.xml', null);
  if not exists (select 1 from proveedores where rfc = 'NUE010203AB1' and razon_social = 'NUEVO SA') then raise exception 'FALLÓ: alta de proveedor desde el XML'; end if;
  if (select vence_el from facturas where uuid = 'AAAAAAAA-0000-0000-0000-000000000002') <> v_hoy then raise exception 'FALLÓ: PUE vence el día de la factura'; end if;
  v_ok := array_append(v_ok, 'registrar: receptor, UUID único, vencimiento y alta del proveedor');

  -- Nota de crédito antes de ligar: resta del saldo
  v_nc := registrar_factura(v_cfdi || jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000003', 'tipo', 'egreso', 'total', 100, 'subtotal', 100,
                            'uuid_relacionado', 'AAAAAAAA-0000-0000-0000-000000000001'), false, 'x.xml', null);
  if saldo_factura(v_f) <> 900 then raise exception 'FALLÓ: la nota de crédito resta del saldo (saldo %)', saldo_factura(v_f); end if;
  if saldo_factura(v_nc) <> 0 then raise exception 'FALLÓ: una nota de crédito no tiene saldo'; end if;
  begin
    perform ligar_factura_ordenes(v_nc, array[v_oc]);
    raise exception 'FALLÓ: una nota de crédito no se liga a órdenes';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Las notas de crédito%' then raise exception 'FALLÓ: mensaje inesperado (nota): %', sqlerrm; end if;
  end;
  v_ok := array_append(v_ok, 'notas de crédito restan del saldo');

  -- Ligar con la nota vigente: facturado 900 < 1000 → la orden sigue abierta
  perform ligar_factura_ordenes(v_f, array[v_oc]);
  if (select estado::text from ordenes_compra where id = v_oc) <> 'confirmada' then raise exception 'FALLÓ: con $900 de $1,000 no se cierra'; end if;
  -- Cancelar la nota y volver a ligar: facturado 1000 → se cierra sola
  perform cancelar_factura(v_nc, 'Prueba');
  perform ligar_factura_ordenes(v_f, array[v_oc]);
  if (select estado::text from ordenes_compra where id = v_oc) <> 'cerrada' then raise exception 'FALLÓ: recibida y facturada completa se cierra sola'; end if;
  if (select motivo from ordenes_compra where id = v_oc) <> 'Recibida y facturada' then raise exception 'FALLÓ: motivo del cierre automático'; end if;
  v_ok := array_append(v_ok, 'cierre automático al quedar recibida y facturada');

  -- Revisar, vencimiento, cancelar
  begin
    perform marcar_factura_revisada(v_f, ' ');
    raise exception 'FALLÓ: revisar sin nota';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
  end;
  perform marcar_factura_revisada(v_f, 'Cuadra con la remisión');
  perform cambiar_vencimiento(v_f, v_hoy + 3);
  if (select vence_el from facturas where id = v_f) <> v_hoy + 3 then raise exception 'FALLÓ: cambiar vencimiento'; end if;
  perform cancelar_factura(v_f, 'El proveedor la canceló en el SAT');
  if (select count(*) from factura_ordenes where factura_id = v_f) <> 0 then raise exception 'FALLÓ: cancelar quita las ligas'; end if;
  v_ok := array_append(v_ok, 'revisar con nota, vencimiento y cancelar');

  -- Gerente no ve facturas; corporativo consulta
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select count(*) into v_n from facturas;
  if v_n <> 0 then raise exception 'FALLÓ: el gerente no ve facturas'; end if;
  execute 'reset role';
  update perfiles set rol = 'corporativo', sucursal_id = null where id = v_b;
  execute 'set local role authenticated';
  select count(*) into v_n from facturas where id = v_f;
  if v_n <> 1 then raise exception 'FALLÓ: corporativo lee facturas'; end if;
  begin
    perform registrar_factura(v_cfdi || jsonb_build_object('uuid', 'aaaaaaaa-0000-0000-0000-000000000004'), false, 'x.xml', null);
    raise exception 'FALLÓ: corporativo no registra';
  exception when others then
    if sqlerrm like 'FALLÓ%' then raise; end if;
    if sqlerrm not like 'Corporativo%' then raise exception 'FALLÓ: mensaje inesperado (corporativo): %', sqlerrm; end if;
  end;
  execute 'reset role';
  v_ok := array_append(v_ok, 'la sucursal no ve facturas; corporativo consulta');

  raise exception 'PRUEBAS OK — %', array_to_string(v_ok, ' · ');
end $$;
```

- [ ] **Step 3: Review both files**

Check by reading: RLS on the four tables; no write policies on facturas/conceptos/ligas; every `security definer` has `set search_path = public`; storage policies use `public.edita_compras()`/`public.ve_compras()`; the test leaves `empresa` as it was (the final `raise` rolls everything back).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0013_compras_facturas.sql supabase/pruebas/0013_compras_facturas.sql
git commit -m "feat(compras): migración 0013 de facturas con su prueba"
```

---

### Task 5: Datos de la empresa y subida de facturas

**Files:**
- Create: `app/compras/facturas/acciones.ts`
- Create: `app/compras/facturas/empresa/page.tsx`
- Create: `app/compras/facturas/subir/page.tsx`
- Create: `app/compras/facturas/subir/FormSubir.tsx`

**Interfaces:**
- Consumes: `leerCfdi`, `type Cfdi` (Task 1); `baseArchivo` (Task 2); `clienteAdmin`, `volver` (`app/compras/servidor.ts`); `registrar_factura` (Task 4); `puedeEditarCompras`, `SOLO_CONSULTA`.
- Produces: `guardarEmpresa(fd)`, `subirFacturas(previo, fd): Promise<{ resultados: { archivo: string; ok: boolean; texto: string; id?: string }[] }>`, and (Task 6) `ligarOrdenes`, `asignarDestino`, `marcarRevisada`, `cambiarVencimientoFactura`, `cancelarFacturaAccion` in the same file.

- [ ] **Step 1: Actions (empresa and upload)**

`app/compras/facturas/acciones.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { leerCfdi } from "@/lib/compras/cfdi";
import { baseArchivo } from "@/lib/compras/facturas";
import { normalizarRfc, rfcValido } from "@/lib/compras/proveedores";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";
import { clienteAdmin, volver } from "../servidor";

const BUCKET = "facturas";
const MAX_BYTES = 5 * 1024 * 1024;
const texto = (fd: FormData, campo: string) => String(fd.get(campo) ?? "").trim();

export async function guardarEmpresa(fd: FormData) {
  const ruta = "/compras/facturas/empresa";
  const supabase = await clienteAdmin(ruta);
  const rfc = normalizarRfc(texto(fd, "rfc"));
  const razon_social = texto(fd, "razon_social");
  if (!rfcValido(rfc)) volver(ruta, "error", `El RFC ${rfc || "(vacío)"} no es válido.`);
  if (!razon_social) volver(ruta, "error", "Escribe la razón social.");
  const { error } = await supabase.from("empresa").upsert({ id: true, rfc, razon_social });
  if (error) volver(ruta, "error", error.message);
  revalidatePath("/compras", "layout");
  volver("/compras/facturas", "ok", "Datos de la empresa guardados.");
}

export type ResultadoSubida = { resultados: { archivo: string; ok: boolean; texto: string; id?: string }[] };

/**
 * Cada XML se valida antes de subir nada (para no dejar archivos huérfanos): que sea CFDI, que no esté registrado
 * y que sea para la empresa. Después se suben XML y PDF (mismo nombre) y se registra en la base, que vuelve a validar.
 */
export async function subirFacturas(_previo: ResultadoSubida | null, fd: FormData): Promise<ResultadoSubida> {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { resultados: [{ archivo: "", ok: false, texto: SOLO_CONSULTA }] };
  const archivos = fd.getAll("archivos").filter((a): a is File => a instanceof File && a.size > 0);
  const xmls = archivos.filter((a) => a.name.toLowerCase().endsWith(".xml"));
  const pdfs = new Map(archivos.filter((a) => a.name.toLowerCase().endsWith(".pdf")).map((a) => [baseArchivo(a.name), a]));
  if (!xmls.length) return { resultados: [{ archivo: "", ok: false, texto: "Elige al menos un XML de factura." }] };
  const altaProveedor = fd.get("alta_proveedor") === "si";

  const { data: empresa } = await supabase.from("empresa").select("rfc, razon_social").maybeSingle<{ rfc: string; razon_social: string }>();
  if (!empresa) return { resultados: [{ archivo: "", ok: false, texto: "Configura primero los datos de la empresa." }] };

  const resultados: ResultadoSubida["resultados"] = [];
  const vistos = new Set<string>();
  for (const xml of xmls) {
    if (xml.size > MAX_BYTES) { resultados.push({ archivo: xml.name, ok: false, texto: "Pesa más de 5 MB." }); continue; }
    const leido = leerCfdi(await xml.text());
    if ("error" in leido) { resultados.push({ archivo: xml.name, ok: false, texto: leido.error }); continue; }
    const cfdi = leido.cfdi;
    if (vistos.has(cfdi.uuid)) { resultados.push({ archivo: xml.name, ok: false, texto: "Viene dos veces en esta subida." }); continue; }
    vistos.add(cfdi.uuid);
    if (cfdi.rfc_receptor !== empresa.rfc) {
      resultados.push({ archivo: xml.name, ok: false, texto: `Es para el RFC ${cfdi.rfc_receptor}, no para ${empresa.razon_social} (${empresa.rfc}).` });
      continue;
    }
    const { data: previa } = await supabase.from("facturas").select("id, creado_en").eq("uuid", cfdi.uuid).maybeSingle<{ id: string; creado_en: string }>();
    if (previa) { resultados.push({ archivo: xml.name, ok: false, texto: `Ya se registró el ${previa.creado_en.slice(0, 10)}.`, id: previa.id }); continue; }

    const carpeta = `${cfdi.rfc_emisor}/${cfdi.uuid}`;
    const { error: errorXml } = await supabase.storage.from(BUCKET).upload(`${carpeta}.xml`, xml, { contentType: "application/xml", upsert: false });
    if (errorXml) { resultados.push({ archivo: xml.name, ok: false, texto: `No se pudo subir el XML: ${errorXml.message}` }); continue; }
    const pdf = pdfs.get(baseArchivo(xml.name));
    let pdfRuta: string | null = null;
    if (pdf && pdf.size <= MAX_BYTES) {
      const { error: errorPdf } = await supabase.storage.from(BUCKET).upload(`${carpeta}.pdf`, pdf, { contentType: "application/pdf", upsert: false });
      if (!errorPdf) pdfRuta = `${carpeta}.pdf`;
    }
    const { data: id, error } = await supabase.rpc("registrar_factura", { p_cfdi: cfdi, p_alta_proveedor: altaProveedor, p_xml: `${carpeta}.xml`, p_pdf: pdfRuta });
    if (error) { resultados.push({ archivo: xml.name, ok: false, texto: error.message }); continue; }
    const nombre = cfdi.tipo === "egreso" ? "Nota de crédito" : "Factura";
    resultados.push({ archivo: xml.name, ok: true, texto: `${nombre} ${cfdi.serie ?? ""}${cfdi.folio ?? ""} de ${cfdi.nombre_emisor} registrada${pdfRuta ? " con PDF" : ""}.`, id: id as string });
  }
  revalidatePath("/compras", "layout");
  return { resultados };
}
```

- [ ] **Step 2: Company data page**

`app/compras/facturas/empresa/page.tsx`:

```tsx
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { guardarEmpresa } from "../acciones";

export default async function Empresa({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const { data: e } = await supabase.from("empresa").select("rfc, razon_social").maybeSingle<{ rfc: string; razon_social: string }>();
  const edita = puedeEditarCompras(perfil.rol);
  return (
    <>
      <div className="encabezado"><h1>Datos de la empresa</h1><p>Cada factura que se sube debe venir a nombre de este RFC.</p></div>
      <Aviso error={error} />
      {edita ? (
        <form action={guardarEmpresa} className="seccion formulario">
          <div className="rejilla">
            <div className="campo"><label htmlFor="rfc">RFC</label><input id="rfc" name="rfc" defaultValue={e?.rfc ?? ""} required autoCapitalize="characters" /></div>
            <div className="campo"><label htmlFor="razon_social">Razón social</label><input id="razon_social" name="razon_social" defaultValue={e?.razon_social ?? ""} required /></div>
          </div>
          <BotonEnviar>Guardar</BotonEnviar>
        </form>
      ) : (
        <section className="seccion"><dl className="tarjeta-datos"><dt>RFC</dt><dd>{e?.rfc ?? "Sin configurar"}</dd><dt>Razón social</dt><dd>{e?.razon_social ?? "—"}</dd></dl></section>
      )}
    </>
  );
}
```

- [ ] **Step 3: Upload form and page**

`app/compras/facturas/subir/FormSubir.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useActionState } from "react";
import { subirFacturas, type ResultadoSubida } from "../acciones";

export function FormSubir() {
  const [estado, enviar, pendiente] = useActionState<ResultadoSubida | null, FormData>(subirFacturas, null);
  return (
    <form action={enviar} className="seccion formulario">
      <div className="campo">
        <label htmlFor="archivos">XML de las facturas (y su PDF, con el mismo nombre)</label>
        <input id="archivos" name="archivos" type="file" accept=".xml,.pdf" multiple required />
        <small>Puedes elegir varios a la vez. Las notas de crédito también se suben aquí.</small>
      </div>
      <label className="campo"><span><input type="checkbox" name="alta_proveedor" value="si" defaultChecked /> Dar de alta a los proveedores que no estén en la cartera</span></label>
      {estado && (
        <ul className="seccion">
          {estado.resultados.map((r, i) => (
            <li key={i} className={r.ok ? "aviso aviso-ok" : "aviso aviso-error"}>
              {r.archivo && <strong>{r.archivo}: </strong>}{r.texto}{r.id && <> <Link href={`/compras/facturas/${r.id}`}>Ver</Link></>}
            </li>
          ))}
        </ul>
      )}
      <button className="boton" type="submit" disabled={pendiente}>{pendiente ? "Subiendo…" : "Subir facturas"}</button>
    </form>
  );
}
```

`app/compras/facturas/subir/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { FormSubir } from "./FormSubir";

export default async function Subir() {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) redirect("/compras/facturas");
  const { data: e } = await supabase.from("empresa").select("rfc").maybeSingle<{ rfc: string }>();
  return (
    <>
      <div className="encabezado"><h1>Subir facturas</h1><p>Se leen del XML: folio fiscal, proveedor, montos, impuestos y conceptos.</p></div>
      {!e ? (
        <p className="aviso aviso-error">Antes configura el RFC de la empresa. <Link href="/compras/facturas/empresa">Datos de la empresa</Link></p>
      ) : <FormSubir />}
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras/facturas/empresa` and `/compras/facturas/subir`.

Visual check: temp page rendering `<FormSubir />`-like markup with three sample result lines (one ok, two errors with long text) at 375 px; no horizontal scroll. Delete temp page and `.next`.

- [ ] **Step 5: Commit**

```bash
git add app/compras/facturas
git commit -m "feat(compras): datos de la empresa y subida de facturas XML"
```

---

### Task 6: Lista y detalle de facturas (ligar, cotejo, revisar, vencimiento, cancelar)

**Files:**
- Modify: `app/compras/facturas/acciones.ts` (append actions)
- Create: `app/compras/facturas/page.tsx`
- Create: `app/compras/facturas/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 2 (`cotejar`, `NOMBRE_COTEJO`, `valorRecibido`, `vencida`, `NOMBRE_ESTADO_FACTURA`, `ESTADOS_FACTURA`, `type EstadoFactura`), Task 1 (none at runtime), `totalesOrden`, `avanceOrden` from `lib/compras/ordenes`; `nombreRegimen` from `lib/compras/proveedores`; functions of Task 4; `hoyMX`.

- [ ] **Step 1: Actions**

Append to `app/compras/facturas/acciones.ts`:

```ts
const rutaFactura = (id: string) => `/compras/facturas/${id}`;

async function llamarFactura(fd: FormData, funcion: string, argumentos: Record<string, unknown>, mensaje: string) {
  const id = texto(fd, "id");
  const supabase = await clienteAdmin(rutaFactura(id));
  const { error } = await supabase.rpc(funcion, argumentos);
  if (error) volver(rutaFactura(id), "error", error.message);
  revalidatePath("/compras", "layout");
  volver(rutaFactura(id), "ok", mensaje);
}

export async function ligarOrdenes(fd: FormData) {
  const ordenes = fd.getAll("ordenes").map(String).filter(Boolean);
  await llamarFactura(fd, "ligar_factura_ordenes", { p_factura: texto(fd, "id"), p_ordenes: ordenes },
    ordenes.length ? "Factura ligada a sus órdenes." : "La factura quedó sin orden.");
}
export async function asignarDestino(fd: FormData) {
  const s = texto(fd, "sucursal_id");
  await llamarFactura(fd, "asignar_destino_factura", { p_factura: texto(fd, "id"), p_sucursal: s === "oficina" || !s ? null : s }, "Destino guardado.");
}
export async function marcarRevisada(fd: FormData) {
  await llamarFactura(fd, "marcar_factura_revisada", { p_id: texto(fd, "id"), p_nota: texto(fd, "nota") }, "Factura marcada como revisada.");
}
export async function cambiarVencimientoFactura(fd: FormData) {
  await llamarFactura(fd, "cambiar_vencimiento", { p_id: texto(fd, "id"), p_fecha: texto(fd, "vence_el") || null }, "Vencimiento actualizado.");
}
export async function cancelarFacturaAccion(fd: FormData) {
  await llamarFactura(fd, "cancelar_factura", { p_id: texto(fd, "id"), p_motivo: texto(fd, "motivo") }, "Factura cancelada.");
}
```

- [ ] **Step 2: List page**

`app/compras/facturas/page.tsx`:

```tsx
import Link from "next/link";
import { Aviso } from "@/components/Aviso";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { ESTADOS_FACTURA, NOMBRE_ESTADO_FACTURA, vencida, type EstadoFactura } from "@/lib/compras/facturas";
import { puedeEditarCompras } from "@/lib/roles";
import { leerTodo } from "@/lib/ventas/paginar";

type Factura = {
  id: string; uuid: string; serie: string | null; folio: string | null; tipo: "ingreso" | "egreso"; fecha_emision: string; total: number; saldo: number;
  estado: EstadoFactura; vence_el: string; revisada: boolean; proveedor_id: string; uuid_relacionado: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null } | null;
};

export default async function Facturas({ searchParams }: { searchParams: Promise<{ ver?: string; proveedor?: string; ok?: string; error?: string }> }) {
  const { ver = "", proveedor = "", ok, error } = await searchParams;
  const { supabase, perfil } = await obtenerPerfil();
  const hoy = hoyMX();
  const [facturas, { data: empresa }, { data: proveedores }] = await Promise.all([
    leerTodo<Factura>((d, h) => supabase.from("facturas_saldo")
      .select("id, uuid, serie, folio, tipo, fecha_emision, total, saldo, estado, vence_el, revisada, proveedor_id, uuid_relacionado, proveedores(razon_social, nombre_comercial)")
      .order("vence_el").order("id").range(d, h).returns<Factura[]>()),
    supabase.from("empresa").select("rfc, razon_social").maybeSingle<{ rfc: string; razon_social: string }>(),
    supabase.from("proveedores").select("id, razon_social, nombre_comercial").order("razon_social").returns<{ id: string; razon_social: string; nombre_comercial: string | null }[]>(),
  ]);
  const uuids = new Set(facturas.map((f) => f.uuid));
  const visibles = facturas.filter((f) =>
    (!proveedor || f.proveedor_id === proveedor)
    && (ver === "vencidas" ? vencida(f, hoy)
      : ver === "notas" ? f.tipo === "egreso"
      : (ESTADOS_FACTURA as readonly string[]).includes(ver) ? f.estado === ver && f.tipo === "ingreso"
      : f.tipo === "ingreso" && (f.estado === "por_pagar" || f.estado === "parcial")));

  return (
    <>
      <div className="encabezado">
        <h1>Facturas</h1>
        <p>{empresa ? `A nombre de ${empresa.razon_social} (${empresa.rfc}).` : "Falta configurar el RFC de la empresa."} <Link href="/compras/facturas/empresa">Datos de la empresa</Link></p>
      </div>
      <Aviso ok={ok} error={error} />
      <form className="seccion formulario" role="search">
        <div className="rejilla">
          <div className="campo">
            <label htmlFor="ver">Ver</label>
            <select id="ver" name="ver" defaultValue={ver}>
              <option value="">Por pagar</option>
              <option value="vencidas">Vencidas</option>
              {ESTADOS_FACTURA.filter((e) => e !== "por_pagar").map((e) => <option key={e} value={e}>{NOMBRE_ESTADO_FACTURA[e]}</option>)}
              <option value="notas">Notas de crédito</option>
            </select>
          </div>
          <div className="campo">
            <label htmlFor="proveedor">Proveedor</label>
            <select id="proveedor" name="proveedor" defaultValue={proveedor}>
              <option value="">Todos</option>
              {(proveedores ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
            </select>
          </div>
        </div>
        <div className="acciones">
          <button className="boton boton-secundario" type="submit">Filtrar</button>
          {puedeEditarCompras(perfil.rol) && <Link className="boton" href="/compras/facturas/subir">Subir facturas</Link>}
        </div>
      </form>
      {!visibles.length && <p className="vacio">No hay facturas con ese filtro.</p>}
      <div className="tarjetas">
        {visibles.map((f) => {
          const atrasada = vencida(f, hoy);
          return (
            <article key={f.id} className="tarjeta" data-alerta={atrasada || (f.tipo === "egreso" && f.uuid_relacionado && !uuids.has(f.uuid_relacionado)) ? "si" : undefined}>
              <div className="tarjeta-encabezado">
                <div>
                  <h3><Link href={`/compras/facturas/${f.id}`}>{f.tipo === "egreso" ? "Nota de crédito" : "Factura"} {f.serie ?? ""}{f.folio ?? f.uuid.slice(0, 8)}</Link></h3>
                  <p className="tarjeta-estado">{f.proveedores?.nombre_comercial ?? f.proveedores?.razon_social} · {NOMBRE_ESTADO_FACTURA[f.estado]}</p>
                </div>
              </div>
              <dl className="tarjeta-datos">
                <dt>Total</dt><dd>{pesos(f.total)}{f.tipo === "ingreso" && Number(f.saldo) !== Number(f.total) ? ` · saldo ${pesos(f.saldo)}` : ""}</dd>
                {f.tipo === "ingreso" && <><dt>Vence</dt><dd>{fechaTexto(f.vence_el)}{atrasada ? " · vencida" : ""}</dd></>}
                <dt>Emitida</dt><dd>{fechaTexto(f.fecha_emision)}{f.revisada ? " · revisada" : ""}</dd>
                {f.tipo === "egreso" && f.uuid_relacionado && !uuids.has(f.uuid_relacionado) && <><dt>Aviso</dt><dd>Aún no se sube la factura que corrige</dd></>}
              </dl>
            </article>
          );
        })}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Detail page**

`app/compras/facturas/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Aviso } from "@/components/Aviso";
import { BotonEnviar } from "@/components/BotonEnviar";
import { Plegable } from "@/components/Plegable";
import { obtenerPerfil } from "@/lib/contexto";
import { fechaTexto, hoyMX, pesos } from "@/lib/formato";
import { cotejar, NOMBRE_COTEJO, NOMBRE_ESTADO_FACTURA, valorRecibido, vencida, type EstadoFactura } from "@/lib/compras/facturas";
import { avanceOrden, totalesOrden } from "@/lib/compras/ordenes";
import { nombreRegimen, type TasaIva } from "@/lib/compras/proveedores";
import { puedeEditarCompras } from "@/lib/roles";
import { asignarDestino, cambiarVencimientoFactura, cancelarFacturaAccion, ligarOrdenes, marcarRevisada } from "../acciones";

type Factura = {
  id: string; uuid: string; serie: string | null; folio: string | null; tipo: "ingreso" | "egreso"; fecha_emision: string;
  rfc_emisor: string; nombre_emisor: string; regimen_emisor: string; metodo_pago: string | null; forma_pago: string | null;
  subtotal: number; descuento: number; iva: number; retenciones: number; total: number; saldo: number; proveedor_id: string; sucursal_id: string | null;
  uuid_relacionado: string | null; vence_el: string; estado: EstadoFactura; revisada: boolean; revision_nota: string | null;
  xml_ruta: string; pdf_ruta: string | null; motivo_cancelacion: string | null;
  proveedores: { razon_social: string; nombre_comercial: string | null; regimen_fiscal: string } | null;
};
type Concepto = { id: number; descripcion: string; cantidad: number; unidad: string; valor_unitario: number; importe: number };
type Orden = { id: string; folio: string; estado: string; sucursales: { nombre: string } | null };
type Renglon = { orden_id: string; descripcion: string; cantidad: number; precio: number; tasa_iva: TasaIva; recibido: number };
type Relacionada = { id: string; serie: string | null; folio: string | null; uuid: string; tipo: string; total: number; estado: EstadoFactura };

export default async function DetalleFactura({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ id }, { ok, error }] = await Promise.all([params, searchParams]);
  const { supabase, perfil } = await obtenerPerfil();
  const { data: f } = await supabase.from("facturas_saldo")
    .select("id, uuid, serie, folio, tipo, fecha_emision, rfc_emisor, nombre_emisor, regimen_emisor, metodo_pago, forma_pago, subtotal, descuento, iva, retenciones, total, saldo, proveedor_id, sucursal_id, uuid_relacionado, vence_el, estado, revisada, revision_nota, xml_ruta, pdf_ruta, motivo_cancelacion, proveedores(razon_social, nombre_comercial, regimen_fiscal)")
    .eq("id", id).maybeSingle<Factura>();
  if (!f) notFound();

  const [{ data: conceptos }, { data: ligas }, { data: candidatas }, { data: sucursales }, { data: relacionadas }] = await Promise.all([
    supabase.from("factura_conceptos").select("id, descripcion, cantidad, unidad, valor_unitario, importe").eq("factura_id", id).order("id").returns<Concepto[]>(),
    supabase.from("factura_ordenes").select("orden_id").eq("factura_id", id).returns<{ orden_id: string }[]>(),
    supabase.from("ordenes_compra").select("id, folio, estado, sucursales(nombre)").eq("proveedor_id", f.proveedor_id).in("estado", ["confirmada", "cerrada"])
      .order("confirmada_en", { ascending: false }).limit(50).returns<Orden[]>(),
    supabase.from("sucursales").select("id, nombre").order("nombre").returns<{ id: string; nombre: string }[]>(),
    f.tipo === "ingreso"
      ? supabase.from("facturas").select("id, serie, folio, uuid, tipo, total, estado").eq("uuid_relacionado", f.uuid).returns<Relacionada[]>()
      : supabase.from("facturas").select("id, serie, folio, uuid, tipo, total, estado").eq("uuid", f.uuid_relacionado ?? "").returns<Relacionada[]>(),
  ]);
  const ligadas = (ligas ?? []).map((l) => l.orden_id);
  const { data: renglones } = ligadas.length
    ? await supabase.from("renglones_recibido").select("orden_id, descripcion, cantidad, precio, tasa_iva, recibido").in("orden_id", ligadas).returns<Renglon[]>()
    : { data: [] as Renglon[] };
  // Todas las facturas vigentes ligadas a esas órdenes (para el cotejo del grupo).
  const { data: delGrupo } = ligadas.length
    ? await supabase.from("factura_ordenes").select("factura_id, facturas_saldo!inner(saldo, estado, tipo)").in("orden_id", ligadas)
      .returns<{ factura_id: string; facturas_saldo: { saldo: number; estado: string; tipo: string } }[]>()
    : { data: [] as { factura_id: string; facturas_saldo: { saldo: number; estado: string; tipo: string } }[] };
  const facturado = [...new Map((delGrupo ?? []).filter((x) => x.facturas_saldo.estado !== "cancelada" && x.facturas_saldo.tipo === "ingreso")
    .map((x) => [x.factura_id, Number(x.facturas_saldo.saldo)])).values()].reduce((s, v) => s + v, 0);
  const rs = renglones ?? [];
  const cotejo = cotejar({
    tieneOrdenes: ligadas.length > 0, ordenado: totalesOrden(rs).total, recibido: valorRecibido(rs),
    recepcionCompleta: rs.length > 0 && avanceOrden(rs) === "completa", facturado,
  });

  const firmar = async (ruta: string | null) => (ruta ? (await supabase.storage.from("facturas").createSignedUrl(ruta, 3600)).data?.signedUrl ?? null : null);
  const [urlXml, urlPdf] = await Promise.all([firmar(f.xml_ruta), firmar(f.pdf_ruta)]);
  const edita = puedeEditarCompras(perfil.rol) && f.estado !== "cancelada";
  const regimenDistinto = f.proveedores && f.regimen_emisor && f.regimen_emisor !== f.proveedores.regimen_fiscal;
  const hoy = hoyMX();

  return (
    <>
      <div className="encabezado">
        <h1>{f.tipo === "egreso" ? "Nota de crédito" : "Factura"} {f.serie ?? ""}{f.folio ?? ""} · {f.proveedores?.nombre_comercial ?? f.proveedores?.razon_social}</h1>
        <p>{NOMBRE_ESTADO_FACTURA[f.estado]}{f.motivo_cancelacion ? ` · ${f.motivo_cancelacion}` : ""} · UUID {f.uuid}</p>
      </div>
      <Aviso ok={ok} error={error} />

      <section className="seccion">
        <dl className="tarjeta-datos">
          <dt>Emitida</dt><dd>{fechaTexto(f.fecha_emision)} · {f.metodo_pago ?? "sin método"}{f.forma_pago ? ` · forma ${f.forma_pago}` : ""}</dd>
          <dt>Subtotal</dt><dd>{pesos(f.subtotal)}{Number(f.descuento) ? ` · descuento ${pesos(f.descuento)}` : ""}</dd>
          <dt>IVA</dt><dd>{pesos(f.iva)}{Number(f.retenciones) ? ` · retenciones ${pesos(f.retenciones)}` : ""}</dd>
          <dt>Total</dt><dd><strong>{pesos(f.total)}</strong>{f.tipo === "ingreso" ? ` · saldo ${pesos(f.saldo)}` : ""}</dd>
          {f.tipo === "ingreso" && <><dt>Vence</dt><dd>{fechaTexto(f.vence_el)}{vencida(f, hoy) ? " · vencida" : ""}</dd></>}
          <dt>Emisor</dt><dd>{f.nombre_emisor} · {f.rfc_emisor} · {f.regimen_emisor} {nombreRegimen(f.regimen_emisor)}</dd>
          {regimenDistinto && <><dt>Aviso</dt><dd>El régimen del XML ({f.regimen_emisor}) no es el de la cartera ({f.proveedores!.regimen_fiscal}).</dd></>}
          {f.revisada && <><dt>Revisada</dt><dd>{f.revision_nota}</dd></>}
        </dl>
        <div className="acciones">
          {urlXml && <a className="boton boton-secundario" href={urlXml} target="_blank" rel="noreferrer">Ver XML</a>}
          {urlPdf && <a className="boton boton-secundario" href={urlPdf} target="_blank" rel="noreferrer">Ver PDF</a>}
        </div>
      </section>

      {f.tipo === "ingreso" && (
        <section className="seccion" aria-labelledby="t-cotejo">
          <h2 id="t-cotejo">Cotejo</h2>
          <p className={NOMBRE_COTEJO[cotejo].alerta ? "aviso aviso-error" : "aviso aviso-ok"}>{NOMBRE_COTEJO[cotejo].texto}</p>
          {ligadas.length > 0 && (
            <dl className="tarjeta-datos">
              <dt>Ordenado</dt><dd>{pesos(totalesOrden(rs).total)}</dd>
              <dt>Recibido</dt><dd>{pesos(valorRecibido(rs))}</dd>
              <dt>Facturado</dt><dd>{pesos(facturado)}</dd>
            </dl>
          )}
          {edita && (
            <form action={ligarOrdenes} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <fieldset className="campo">
                <legend>Órdenes de compra de este proveedor</legend>
                {!(candidatas ?? []).length && <p className="vacio">Este proveedor no tiene órdenes confirmadas.</p>}
                {(candidatas ?? []).map((o) => (
                  <label key={o.id}><input type="checkbox" name="ordenes" value={o.id} defaultChecked={ligadas.includes(o.id)} /> {o.folio} · {o.sucursales?.nombre ?? "Oficina"}{o.estado === "cerrada" ? " · cerrada" : ""}</label>
                ))}
              </fieldset>
              <BotonEnviar>Guardar órdenes</BotonEnviar>
            </form>
          )}
          {!ligadas.length && edita && (
            <form action={asignarDestino} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo">
                <label htmlFor="destino">Sin orden: ¿a dónde se carga?</label>
                <select id="destino" name="sucursal_id" defaultValue={f.sucursal_id ?? "oficina"}>
                  {(sucursales ?? []).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  <option value="oficina">Oficina</option>
                </select>
              </div>
              <BotonEnviar className="boton boton-secundario">Guardar destino</BotonEnviar>
            </form>
          )}
        </section>
      )}

      {(relacionadas ?? []).length > 0 && (
        <section className="seccion">
          <h2>{f.tipo === "ingreso" ? "Notas de crédito" : "Factura que corrige"}</h2>
          <dl className="tarjeta-datos">
            {(relacionadas ?? []).map((n) => (
              <Fragment key={n.id}><dt><Link href={`/compras/facturas/${n.id}`}>{n.serie ?? ""}{n.folio ?? n.uuid.slice(0, 8)}</Link></dt><dd>{pesos(n.total)} · {NOMBRE_ESTADO_FACTURA[n.estado]}</dd></Fragment>
            ))}
          </dl>
        </section>
      )}
      {f.tipo === "egreso" && !(relacionadas ?? []).length && f.uuid_relacionado && (
        <p className="aviso aviso-error">La factura que corrige ({f.uuid_relacionado}) aún no se sube. Cuando se suba, su saldo ya restará esta nota.</p>
      )}

      <Plegable id="t-conceptos" titulo="Conceptos del XML" resumen={`${conceptos?.length ?? 0}`}>
        <dl className="tarjeta-datos">
          {(conceptos ?? []).map((c) => <Fragment key={c.id}><dt>{c.cantidad} {c.unidad}</dt><dd>{c.descripcion} · {pesos(c.valor_unitario)} · {pesos(c.importe)}</dd></Fragment>)}
        </dl>
        {rs.length > 0 && (
          <>
            <h3>Renglones de las órdenes</h3>
            <dl className="tarjeta-datos">
              {rs.map((r, i) => <Fragment key={i}><dt>{r.cantidad} pedidos · {r.recibido} recibidos</dt><dd>{r.descripcion} · {pesos(r.precio)}</dd></Fragment>)}
            </dl>
          </>
        )}
      </Plegable>

      {edita && (
        <section className="seccion">
          <h2>Acciones</h2>
          {!f.revisada && NOMBRE_COTEJO[cotejo].alerta && f.tipo === "ingreso" && (
            <form action={marcarRevisada} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="nota">Revisada: ¿qué verificaste?</label><input id="nota" name="nota" required placeholder="Ej. el proveedor aplicó un aumento autorizado" /></div>
              <BotonEnviar className="boton boton-secundario">Marcar como revisada</BotonEnviar>
            </form>
          )}
          {f.tipo === "ingreso" && (f.estado === "por_pagar" || f.estado === "parcial") && (
            <form action={cambiarVencimientoFactura} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="vence">Vencimiento</label><input id="vence" name="vence_el" type="date" defaultValue={f.vence_el} required /></div>
              <BotonEnviar className="boton boton-secundario">Cambiar vencimiento</BotonEnviar>
            </form>
          )}
          <details>
            <summary>Cancelar</summary>
            <form action={cancelarFacturaAccion} className="formulario">
              <input type="hidden" name="id" value={f.id} />
              <div className="campo"><label htmlFor="motivo">Motivo</label><input id="motivo" name="motivo" required placeholder="Ej. el proveedor la canceló en el SAT" /></div>
              <BotonEnviar className="boton boton-alerta" confirmar="¿Cancelar esta factura? Se quitan sus ligas a órdenes.">Cancelar factura</BotonEnviar>
            </form>
          </details>
        </section>
      )}
    </>
  );
}
```

- [ ] **Step 4: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build`
Expected: both succeed; build lists `/compras/facturas` and `/compras/facturas/[id]`. If PostgREST embed `facturas_saldo!inner(...)` from `factura_ordenes` fails to type-check, query `facturas_saldo` with `.in("id", facturaIds)` in a second step instead and ledger a ruling.

Visual check: temp page with three factura cards (one vencida, one nota de crédito sin su factura, one normal) and the cotejo section with its order checkboxes (long folio labels) at 375 px; no horizontal scroll. Delete temp page and `.next`.

- [ ] **Step 5: Commit**

```bash
git add app/compras/facturas
git commit -m "feat(compras): lista y detalle de facturas con cotejo"
```

---

### Task 7: Facturación en el detalle de la orden y README

**Files:**
- Modify: `app/compras/ordenes/[id]/page.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `avanceFacturacion` (Task 2), `NOMBRE_AVANCE` (`lib/compras/ordenes`), tablas `factura_ordenes`, vista `facturas_saldo`.

- [ ] **Step 1: Show invoices and billing progress on the order**

In `app/compras/ordenes/[id]/page.tsx` (CRLF: use Edit):
- add `import { avanceFacturacion } from "@/lib/compras/facturas";`
- after the line `const t = totalesOrden(rs);` add:

```ts
  const { data: facturasLigadas } = await supabase.from("factura_ordenes")
    .select("facturas_saldo!inner(id, serie, folio, uuid, saldo, estado, tipo)").eq("orden_id", o.id)
    .returns<{ facturas_saldo: { id: string; serie: string | null; folio: string | null; uuid: string; saldo: number; estado: string; tipo: string } }[]>();
  const facturas = (facturasLigadas ?? []).map((x) => x.facturas_saldo).filter((x) => x.estado !== "cancelada" && x.tipo === "ingreso");
  const facturado = facturas.reduce((s, x) => s + Number(x.saldo), 0);
```

- in the summary `<dl>`, right after the `Recepción` line, add:

```tsx
          {(o.estado === "confirmada" || o.estado === "cerrada") && (
            <><dt>Facturación</dt><dd>{NOMBRE_AVANCE_FACTURA[avanceFacturacion(t.total, facturado)]} · {pesos(facturado)} de {pesos(t.total)}
              {facturas.map((x) => <Fragment key={x.id}> · <Link href={`/compras/facturas/${x.id}`}>{x.serie ?? ""}{x.folio ?? x.uuid.slice(0, 8)}</Link></Fragment>)}</dd></>
          )}
          {o.estado === "confirmada" && avanceOrden(rs) === "completa" && avanceFacturacion(t.total, facturado) === "completa" && (
            <><dt>Lista</dt><dd>Recibida y facturada: ya se puede cerrar.</dd></>
          )}
```

- above the component, add `const NOMBRE_AVANCE_FACTURA = { nada: "Sin facturar", parcial: "Facturada en parte", completa: "Facturada completa" } as const;`

- [ ] **Step 2: README**

Append to the "Compras (oficina central)" section of `README.md`:

```markdown
- **Facturas** (fase 3): se suben los XML del CFDI (3.3 o 4.0) y su PDF con el mismo nombre, varios a la vez. Se valida que sea para el RFC de la empresa (Compras → Facturas → Datos de la empresa), que el folio fiscal no se repita y que esté en pesos; un proveedor fuera de la cartera se da de alta con los datos del XML. Las notas de crédito (egreso) restan del saldo de la factura que corrigen. Cada factura se liga a una o varias órdenes del mismo proveedor (o queda sin orden con su sucursal u Oficina) y se coteja orden ↔ recibido ↔ facturado (±$1); si no cuadra, se marca como revisada con una nota. Al ligar, la orden recibida y facturada completa se cierra sola. Vencimiento = fecha + días de crédito (PUE vence el mismo día), editable.

Migración `0013_compras_facturas.sql` y su prueba `supabase/pruebas/0013_compras_facturas.sql`.
```

- [ ] **Step 3: Verify**

Run: `rm -rf .next && npx tsc --noEmit && npm run build && npm test`
Expected: all succeed.

- [ ] **Step 4: Commit**

```bash
git add "app/compras/ordenes/[id]/page.tsx" README.md
git commit -m "feat(compras): facturación visible en la orden"
```

---

## After all tasks

- Final whole-branch review (fresh reviewer, most capable model) against this plan and spec section 4.
- Push `feat/compras-facturas`; Sebastián runs `0013_compras_facturas.sql` then `pruebas/0013_compras_facturas.sql` and confirms **PRUEBAS OK**; only then merge to main and copy changed files to `C:\Users\sebcm\Downloads\dodo-control-efectivo_1\dodo-efectivo`.
- Before using it: Sebastián captures the company RFC in Compras → Facturas → Datos de la empresa.
