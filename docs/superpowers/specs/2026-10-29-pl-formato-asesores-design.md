# P&L en formato de asesores (diseño)

**Fecha:** 2026-10-29 · **Autor:** Claude con Sebastián · **Estado:** en revisión
**Referencia:** `Plantilla EF (P&L & CF) v2.xlsx`, hoja "P&L", compartida por los asesores.

## 0. Contexto: tres subproyectos

Los asesores piden P&L y Flujo de Efectivo **con cifras reales** en su formato. Se entrega en tres partes, cada una con
su spec, plan y PR:

1. **P&L "Formato asesores"** (este documento): presentación nueva sobre los cálculos actuales, hasta EBITDA.
2. **Conciliación bancaria**: cada movimiento de Banregio se asocia a su documento (pago → factura → cuenta;
   depósito → liquidación NetPay/Rappi; nómina → nómina real). Los movimientos sin documento (comisiones bancarias,
   préstamos, IMSS, traspasos) se clasifican directamente con un concepto de flujo y una nota.
3. **Flujo de Efectivo**: operación, inversión y financiamiento a partir de los movimientos conciliados, con saldo
   inicial y final del banco.

La plantilla trae supuestos (% de venta o monto fijo) en la columna D. **No** se usan: aquí todo es real.

## 1. Objetivo

Una cuarta pestaña en `/finanzas`, **Formato asesores** (`?vista=asesores`), que presenta el mismo P&L con la
estructura de la plantilla, en pantalla y en Excel.

**Éxito:** para cualquier mes o semana, sucursal o consolidado, la pestaña muestra ventas brutas → descuentos → netas →
… → EBITDA con los mismos totales que "Contra meta", y el Excel descargado abre con la misma estructura.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Ubicación | Pestaña nueva; Por cuentas, Contra meta y Comparativo no cambian |
| Cálculo | Ninguno nuevo salvo la venta bruta sin IVA por canal (`CanalPL.brutaSinIva`): capa de presentación sobre `EntradaPL` (función pura, con pruebas) |
| Debajo de EBITDA | D&A, EBIT, Intereses, Utilidad antes de impuestos, ISR y Utilidad neta se muestran como **Pendiente** (sin fuente todavía) |
| Comisión Rappi | Arriba de Utilidad bruta, como en la plantilla |
| Base del % | **Ventas brutas**, como en la plantilla (las demás pestañas usan venta neta); el encabezado lo indica |
| Renglones extra | Los que la plantilla no tiene se muestran aparte dentro de Gastos sucursal, no se esconden en "otros" |
| Filtros | Los mismos: Mes / Semana, sucursal o consolidado, mismos avisos |
| Exportación | Excel sí; PDF no en esta entrega |

## 3. Estructura

| Sección | Renglón | Fuente (`EntradaPL` / `calcularPL`) |
|---|---|---|
| Ventas | Ventas Dine-In | `canales.dodo.brutaSinIva` |
| | Ventas brutas Rappi | `canales.rappi.brutaSinIva` |
| | **Ventas brutas** | suma |
| | Descuentos Dine-In | `canales.dodo.brutaSinIva − canales.dodo.neta` |
| | Descuentos Rappi | `canales.rappi.brutaSinIva − canales.rappi.neta` |
| | **Total descuentos** | suma |
| | Rappi · ingresos fuera de base / excedente DAR | `rappiFueraBase`, `rappiExcedente` (solo si ≠ 0) |
| | **Ventas netas** | renglón `venta_neta` + los dos anteriores |
| | Comisión Rappi | `agregadores` |
| COGS | Alimentos y empaque | `alimento` |
| | Merma | `merma` (Pendiente si `mermaPendiente`) |
| | **Utilidad bruta** | ventas netas − comisión Rappi − alimentos − merma |
| Gastos sucursal | Nómina sucursal | `nomina_cocina + nomina_gerencia` |
| | Regalías | `regalias` |
| | Gastos de mantenimiento | `mantenimiento` |
| | Renta | `renta` |
| | Servicios (luz, agua, basura, etc.) | `servicios` |
| | Marketing Rappi | `marketing_agregadores` |
| | *Repartidores · Rappi compensaciones y cancelaciones · Marketing · Consumibles y equipo menor · Comisiones de cobro (NetPay) · Otros* | renglones actuales; Comisiones de cobro = `comisionesCobro`, que hoy va dentro de "Otros"; Otros = el resto de "Otros" (`otros` + `sinCuenta` + `faltantes`) |
| | **Total gastos sucursal** | suma |
| | **EBITDA 4-Wall** | debe ser igual a `ebitda_tienda` |
| Corporativo | Gasto corporativo | `oficina` |
| | **EBITDA** | debe ser igual a `ebitda` |
| Bajo EBITDA | Depreciación y amortización · **EBIT** · Intereses · **Utilidad antes de impuestos** · ISR · **Utilidad neta** | Pendiente |

Columnas: **Monto** y **% de ventas brutas**. Renglones con monto cero (fuera de los de la plantilla) no se muestran.

`brutaSinIva` es la venta bruta **sin IVA**: `CanalPL.bruta` (Σ `importe_sin_descuento`) lleva IVA, y la neta no; por eso
`resumenCanalPL` calcula aparte, por día, `bruta del día × (total − iva) / total` (un día con total 0 aporta 0), y
`brutaSinIva` es `null` cuando `bruta` lo es. `bruta` no cambia de significado (lo usan las demás pestañas). Los descuentos
son `brutaSinIva − neta`. Ventas Dine-In y Ventas brutas Rappi no despliegan "De dónde sale": su detalle era la venta neta.

## 4. Casos límite

- **Venta bruta desconocida** (`brutaSinIva === null`, el detalle por producto no cubre el día): Ventas brutas y
  descuentos de ese canal se muestran como Pendiente; el % pasa a calcularse sobre **ventas netas** y el encabezado y un
  aviso lo dicen.
- **Rappi con reporte financiero**: cuando la venta neta de Rappi se ajusta o reemplaza con el reporte financiero, la
  bruta sin IVA de Rappi no es confiable: `brutaSinIva` queda en `null` (Ventas brutas Rappi y Descuentos Rappi en
  Pendiente) y la base del % pasa a **ventas netas**.
- **Merma pendiente**: se muestra como Pendiente pero suma 0 en Utilidad bruta, igual que `calcularPL`, para que los
  totales coincidan con Contra meta.
- **Totales provisionales**: si la merma o Rappi están pendientes, Utilidad bruta, Total gastos sucursal, EBITDA 4-Wall
  y EBITDA conservan su monto pero se marcan provisionales ("Provisional: hay montos pendientes" en pantalla, sufijo
  "(provisional)" en Excel); con Rappi pendiente también Ventas netas y Comisión Rappi.
- **Avisos en el Excel**: la hoja incluye al final, una por fila, los avisos del formato y los de la página.
- **Periodo sin días cerrados**: el mismo estado vacío que las otras pestañas.
- **Comprobación**: si Utilidad bruta − Total gastos sucursal no coincide con `ebitda_tienda` (o EBITDA con `ebitda`)
  al centavo, la función lanza error en pruebas y en pantalla se muestra un aviso en vez de cifras inconsistentes.

## 5. Pantalla y Excel

- `app/finanzas/page.tsx`: cuarta pestaña; usa `plConHistoria` (mismos datos que Contra meta), sin metas.
- Componente `TablaAsesores.tsx`: secciones y subtotales con el estilo del P&L actual; en celular, tarjetas como
  Contra meta. Con sucursal elegida, cada renglón despliega su detalle (mismo `detalle` de hoy).
- Excel: con `vista=asesores`, `/reporte/pl/excel` entrega una hoja "P&L asesores" con el mismo formato contable y
  estilos de `lib/xlsx-escribir.ts`.

## 6. Módulos

- `lib/finanzas/formatoAsesores.ts`: `formatoAsesores(entrada: EntradaPL, filas: FilaPL[]) → RenglonAsesores[]`,
  pura, sin Supabase.
- `lib/finanzas/formatoAsesores.test.ts`: estructura completa; ventas brutas/descuentos por canal; comisión arriba de
  utilidad bruta; EBITDA 4-Wall y EBITDA iguales a `calcularPL` en varias entradas (incluye Rappi pendiente, merma
  pendiente, consolidado); bruta nula → base neta; renglones bajo EBITDA en Pendiente.
- Sin migraciones ni cambios en Supabase.

## 7. Fuera de alcance

D&A, intereses e ISR reales; proyecciones y supuestos de la plantilla; PDF de esta vista; Flujo de Efectivo y
conciliación (subproyectos 2 y 3).
