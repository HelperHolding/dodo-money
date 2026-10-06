# Retenciones por enterar (diseño)

**Fecha:** 2026-10-06 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Saber cada mes cuánto IVA e ISR retuvimos a proveedores (renta a persona física, honorarios, fletes) y llevar el control
de su entero al SAT, que vence el **17 del mes siguiente** al pago.

**Éxito:** el admin abre Finanzas → Retenciones y ve "Octubre 2026 · IVA $3,328.00 · ISR $3,120.00 · enterar a más
tardar el 17/11 · Pendiente"; registra el entero con su acuse y el mes queda "Enterado el 15/11"; si después se registra
o se anula un pago de octubre, el mes avisa la diferencia.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Cuándo se causa | En la **fecha del pago** al proveedor (no la de emisión) |
| Cuánto por pago | Retención de la factura × monto aplicado ÷ total de la factura; los pagos anulados no cuentan |
| Qué facturas | De ingreso, con o sin CFDI, no canceladas, con `retencion_iva` o `retencion_isr` > 0 (sin descontar notas de crédito) |
| Fecha límite | Día 17 del mes siguiente al del pago (no se recorre por días inhábiles) |
| Lo retenido | Se calcula de pagos y facturas, no se guarda |
| Entero | Uno o varios por mes (complementario); cada uno: fecha, IVA, ISR, número de operación, acuse opcional; se anula con motivo |
| Quién | Admin registra y anula; corporativo consulta |

## 3. Pantalla Finanzas → Retenciones (`/finanzas/retenciones`)

- Una tarjeta por mes con retenciones o enteros, del más reciente al más antiguo: mes, IVA retenido, ISR retenido,
  fecha límite y estado:
  - **Enterado el DD/MM**: lo enterado (suma de enteros vigentes) cubre lo retenido de IVA y de ISR (tolerancia $1).
  - **Falta enterar $X**: hay enteros pero no cubren lo retenido (pago tardío, anulación, captura incompleta).
  - **Vencido**: sin cubrir y hoy (CDMX) es después del día 17 del mes siguiente.
  - **Vence en N días** (N ≤ 5) o **Pendiente**.
  - Si lo enterado pasa lo retenido por más de $1: "Enterado de más $X".
- Detalle plegable: proveedor, factura (enlace), fecha y monto del pago (enlace), IVA y ISR de ese pago.
- Enteros del mes: fecha, IVA, ISR, operación, acuse (enlace firmado de 1 hora); los anulados tachados con su motivo.
- Admin: formulario "Registrar entero" (fecha ≤ hoy, IVA e ISR prellenados con lo que falta, operación, acuse PDF/foto
  hasta 4 MB) y "Anular" con motivo en cada entero vigente.
- Botón **Excel** del mes: hoja con el detalle (proveedor, RFC, factura, fecha de pago, pagado, IVA retenido, ISR retenido)
  y totales.
- Menú: Finanzas → "Retenciones"; migas "Finanzas › Retenciones".

## 4. Base de datos (migración 0030)

- Tabla `enteros_retenciones`: `id`, `mes date` (día 1), `fecha date`, `iva numeric(14,2) >= 0`,
  `isr numeric(14,2) >= 0` (al menos uno > 0), `operacion text`, `acuse_ruta text`, `registrado_por`, `registrado_en`,
  `anulado_por`, `anulado_en`, `motivo_anulacion` (obligatorio al anular). RLS: leen quienes ven finanzas; sin escritura
  directa.
- `registrar_entero(p_mes date, p_fecha date, p_iva numeric, p_isr numeric, p_operacion text, p_acuse text) → uuid`:
  solo admin; fecha no futura ni antes del mes; montos ≥ 0 y alguno > 0.
- `anular_entero(p_id uuid, p_motivo text)`: solo admin; motivo obligatorio; no anula dos veces.
- Bucket privado `acuses-sat` (PDF, JPG, PNG, WebP; 5 MB) con políticas: admin sube, quienes ven finanzas leen.

## 5. Arquitectura

- `lib/finanzas/retenciones.ts` (puro, con pruebas): `retencionesDePagos(aplicaciones)` → renglones por pago con IVA/ISR
  proporcionales; `porMes(renglones, enteros, hoy)` → tarjetas con totales, límite, estado, faltante; `limiteEntero(mes)`;
  `hojaRetenciones(mes, renglones)` para el Excel.
- `app/finanzas/retenciones/page.tsx` (lectura: `pago_aplicaciones` con su pago vigente y su factura con retenciones;
  `enteros_retenciones`), `acciones.ts` (registrar con acuse, anular), ruta `app/reporte/retenciones/excel/route.ts`.
- `lib/roles.ts` (enlace del menú) y `lib/migas.ts` (sin cambios si la página está en el menú).

## 6. Pruebas

- Node: pago completo, parcial (mitad), dos pagos en meses distintos, pago anulado fuera, factura sin retenciones fuera;
  límite (diciembre → 17 de enero); estados (pendiente, vence en N días, vencido, enterado, falta, de más; anulado no
  suma; complementario suma); hoja de Excel con totales.
- SQL: registrar como admin; corporativo rechazado; fecha futura y montos en cero rechazados; anular sin motivo
  rechazado; anular dos veces rechazado.
- Vista previa de la pantalla en computadora y celular.
