# Periodo que cubre cada factura (diseño)

**Fecha:** 2026-10-06 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

El P&L reparte cada factura (con o sin CFDI) por el **periodo que cubre**, no por su fecha de emisión: el recibo
bimestral de CFE va a los dos meses que se consumieron, la fumigación trimestral a sus tres meses y la renta de octubre
facturada el 28 de septiembre a octubre.

**Éxito:** al subir un recibo de CFE emitido el 5/10, la factura queda "cubre 01/08–30/09" sin capturar nada; el P&L de
agosto y el de septiembre llevan cada uno su parte por días; el P&L de septiembre avisa que llegó un recibo después de
cerrar el mes.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| A qué meses va | A los meses que cubre (devengado), aunque el mes ya haya pasado |
| Dónde se guarda | `facturas.cubre_desde` / `cubre_hasta`, siempre llenos |
| Cómo se llena | Al crear la factura, con la regla del proveedor; se guarda (cambiar la regla no mueve facturas anteriores) |
| Regla del proveedor | "Cubre **N meses**" (1–12, por omisión 1) + inicio: **anteriores** a la emisión / **desde el mes de emisión** (por omisión) / **desde el mes siguiente** |
| Facturas existentes | Su mes de emisión (el P&L actual no cambia) |
| Corregir | Admin, en el detalle de la factura y al capturar "Agregar sin CFDI" |
| Reparto en el P&L | Por días: monto × días del periodo dentro del rango / días del periodo |
| Aviso | Un mes que recibe gasto de facturas capturadas (`creado_en`) después de que terminó lo avisa con cuántas y cuánto |
| Sin cambio | Pagos, vencimientos, IVA, caja chica y nómina |

## 3. Regla del proveedor (ejemplos)

Mes de emisión = M.

- **Anteriores**, N = 2, emitida 05/10 → 01/08–30/09 (los N meses que terminan en M−1).
- **Desde emisión**, N = 3, emitida 03/10 → 01/10–31/12.
- **Desde el siguiente**, N = 1, emitida 28/09 → 01/10–31/10.

El periodo siempre empieza el día 1 y termina el último día del mes.

## 4. Base de datos (migración 0029)

- `proveedores.cubre_meses smallint not null default 1 check (1..12)`,
  `proveedores.cubre_inicio text not null default 'emision' check (in ('anteriores','emision','siguiente'))`.
- `facturas.cubre_desde date`, `facturas.cubre_hasta date`: se llenan las existentes con su mes de emisión y quedan
  `not null`, con `check (cubre_desde <= cubre_hasta)`.
- Función `periodo_cubre(p_fecha date, p_meses int, p_inicio text)` → (desde, hasta).
- Trigger `before insert` en facturas: si no traen periodo, lo calcula con la regla del proveedor. Así cubre todas
  las altas (subir XML, gasto sin CFDI, sustitución) sin tocar cada función.
- `cambiar_periodo_factura(p_factura uuid, p_desde date, p_hasta date)`: solo admin de compras; normaliza a meses
  completos (1 a 24); rechaza desde > hasta y facturas canceladas; sus notas de crédito vigentes lo siguen.
- La nota de crédito, al darse de alta, toma el periodo de la factura que corrige.
- `registrar_gasto_manual` no cambia: la acción de "Agregar sin CFDI" guarda el periodo del formulario con
  `cambiar_periodo_factura` justo después del alta.

## 5. Arquitectura

- `lib/finanzas/cubre.ts` (puro, con pruebas): `periodoCubre(fecha, meses, inicio)` (el mismo cálculo que la función
  SQL, para mostrar la vista previa en formularios), `fraccionCubre(desde, hasta, rango)` (días de traslape / días del
  periodo), `textoCubre(cubre)` ("agosto–septiembre 2026", "octubre 2026").
- `app/finanzas/datos.ts`: lee facturas cuyo periodo se traslapa con el rango (`cubre_desde <= hasta` y
  `cubre_hasta >= desde`) en vez de por fecha de emisión; la fracción de cada factura sale de `fraccionCubre`; el
  detalle dice "cubre agosto–septiembre 2026 · $4,000.00 × 31/61"; calcula el aviso de capturas tardías.
- P&L (mes, semana, comparativo, acumulado, Excel) usa `datosPL`, así que el cambio llega a todas las vistas; el aviso
  se muestra junto a los avisos de "sin capturar".
- UI:
  - proveedor (nuevo y editar): "Cada recibo cubre [N] meses · [inicio]";
  - detalle de factura: "Cubre: …" con formulario para corregir (admin);
  - "Agregar sin CFDI": campos de periodo, prellenados con la regla del proveedor;
  - lista de facturas: sin cambio.

## 6. Pruebas

- Node: `periodoCubre` en los tres inicios (incluye cruce de año: anteriores en enero, siguiente en diciembre);
  `fraccionCubre` (rango dentro, parcial, fuera, semana que cruza meses, periodo de un día); facturas que cubren
  dos meses repartidas en el P&L mensual y semanal; aviso de captura tardía.
- SQL: existentes quedan en su mes de emisión; trigger con cada regla; periodo explícito respetado;
  `cambiar_periodo_factura` rechaza no admin, desde > hasta y cancelada; gasto manual con periodo.
- Vista previa: P&L de un mes con un recibo bimestral y el detalle de la factura en computadora y celular.
