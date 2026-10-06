# Días de pago autorizados y programación de pagos (diseño)

**Fecha:** 2026-10-06 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Como cultura, los proveedores se pagan en **días de pago autorizados** (hoy: los **viernes**). La app sugiere el viernes
de cada factura, deja programar varias de un jalón y pide motivo cuando se paga fuera de esos días.

**Éxito:** el admin abre "Programar pagos", ve las facturas por pagar agrupadas por viernes con su total, marca las que
se pagan y las programa; al programar a mano solo hay viernes; si un pago urgente se registra otro día, la app pide el
motivo y lo guarda.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Días autorizados | Configurables en Compras → Datos de la empresa (uno o varios días de la semana); por omisión **viernes** |
| Viernes sugerido | El último día autorizado **en o antes** del vencimiento (nunca se paga tarde); si ese día ya pasó, el **próximo** día autorizado desde hoy |
| Fecha de una factura | La programada, o si no tiene, la sugerida (antes era el vencimiento) |
| Programar a mano | Solo días autorizados, de hoy en adelante; vaciar la fecha la quita |
| Programar en bloque | Pantalla nueva Compras → Pagos → "Programar pagos" |
| Pago fuera de día | Se permite **con motivo** obligatorio; el motivo queda en el pago |

## 3. Pantalla "Programar pagos" (`/compras/pagos/programar`)

- Grupos por día autorizado, de hoy en adelante: "Viernes 10/10 · 7 facturas · $48,320.00". Las vencidas sin
  programar caen en el próximo día autorizado, marcadas "vencida".
- En cada grupo, cada factura con casilla (proveedor, folio, vence, saldo, "programada" o "sugerida").
- Al pie de cada grupo: "Programar marcadas para" + selector de los próximos días autorizados (por omisión el del
  grupo) + botón. Solo admin; corporativo ve la lista sin casillas.
- Respeta los filtros de proveedor y sucursal de Pagos.

## 4. Reglas en la base

- `empresa.dias_pago`: días de la semana ISO (1 = lunes … 7 = domingo), al menos uno; por omisión `{5}`.
- `programar_pago(p_factura, p_fecha)`: rechaza un día no autorizado o pasado.
- `programar_pagos(p_facturas uuid[], p_fecha date)`: lo mismo en bloque; solo facturas por pagar.
- `registrar_pago(...)` gana `p_motivo_fuera_de_dia`: si la fecha del pago no es día autorizado y no hay motivo,
  error claro; el motivo se guarda en `pagos.motivo_fuera_de_dia`.

## 5. Arquitectura

- `lib/compras/diasPago.ts` (puro, con pruebas): `esDiaDePago`, `proximoDiaDePago`, `diaDePagoSugerido`,
  `proximosDiasDePago`, `NOMBRE_DIA`.
- `lib/compras/pagos.ts`: `fechaDePago` usa la sugerida cuando no hay programada (recibe los días autorizados).
- Migración 0028 con su prueba SQL.
- UI: Datos de la empresa (casillas de días), Programar pagos (nueva), formulario de factura (selector con solo días
  autorizados), registrar pago (campo de motivo cuando no es día de pago), detalle del pago (muestra el motivo),
  migas ("Compras › Pagos › Programar pagos").

## 6. Pruebas

- Node: sugerido (vence viernes, miércoles, domingo; ya pasado → próximo; varios días autorizados), próximos días,
  `esDiaDePago`, agrupación por día con totales.
- SQL: días por omisión, programar en día no autorizado / pasado rechazado, en bloque, pago fuera de día sin motivo
  rechazado y con motivo guardado.
- Vista previa de "Programar pagos" en computadora y celular.
