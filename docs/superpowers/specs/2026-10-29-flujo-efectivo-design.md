# Flujo de Efectivo (diseño)

**Fecha:** 2026-10-29 · **Autor:** Claude con Sebastián · **Estado:** en revisión
**Contexto:** subproyecto 3 de 3. Subproyecto 1 (P&L formato asesores) y 2 (conciliación bancaria, `banca_conciliaciones`) ya en `main`.
**Referencia:** `Plantilla EF (P&L & CF) v2.xlsx`, hoja "Flujo de Efectivo".

## 1. Objetivo

Página **Finanzas → Flujo de efectivo** (`/finanzas/flujo`) con el flujo **real** del banco en la estructura de la
plantilla: operación, inversión y financiamiento, del saldo inicial al saldo final de Banregio. Las cifras salen de los
movimientos bancarios y del concepto de flujo de su conciliación.

**Éxito:** para cualquier mes, saldo inicial + flujo neto = saldo final del banco al centavo; lo no conciliado se ve en
"Por conciliar" con cuántos movimientos faltan; el comparativo muestra los meses del año lado a lado; el Excel abre
con las dos hojas.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Fuente | Movimientos de `banca_movimientos` del periodo y el `concepto`/`tipo` de su conciliación activa |
| No conciliados | Renglón **Por conciliar** (entradas y salidas) para que el saldo cuadre; aviso con el número de movimientos |
| Ubicación | Finanzas, página propia; enlace en el menú junto a P&L y Banca |
| Periodos | **Mes** (monto y %) y **Comparativo** (meses del año hasta el elegido + total) |
| % | Sobre **total de ingresos operativos** (como la plantilla) |
| Filtro | Razón social (todas por omisión); suma todas las cuentas de esa razón social |
| Excel | Hojas "Flujo" y "Flujo comparativo", con el formato contable del P&L |
| Permisos | Los de Finanzas (admin y corporativo consultan; nada se edita aquí) |
| Base de datos | Sin migraciones: solo lectura de tablas existentes |

## 3. Renglones

Signo: entradas positivas, salidas negativas. Cada concepto = Σ abonos − Σ cargos de sus movimientos (una devolución de
proveedor reduce la salida).

| Sección | Renglón | Conceptos |
|---|---|---|
| Operación · ingresos | Cobranza tarjeta (NetPay) | `cobranza_tarjeta` |
| | Depósitos de efectivo | `deposito_efectivo` |
| | Cobranza Rappi | `cobranza_rappi` |
| | **Total ingresos operativos** | suma |
| Operación · egresos | Proveedores (alimentos y empaque) | `proveedores` |
| | Nómina | `nomina` |
| | IMSS e impuestos | `imss_impuestos` |
| | Renta | `renta` |
| | Servicios | `servicios` |
| | Marketing | `marketing` |
| | Regalías | `regalias` |
| | Comisiones de cobro | `comisiones_cobro` |
| | Comisiones bancarias | `comisiones_bancarias` |
| | Otros de operación | `otros_operacion` |
| | **Total egresos operativos** | suma |
| | **Flujo de operación** | ingresos + egresos |
| Inversión | CapEx | `capex` |
| | Apertura y equipamiento | `apertura` |
| | **Flujo de inversión** | suma |
| | **Flujo antes de financiamiento** | operación + inversión |
| Financiamiento | Préstamo recibido | `prestamo_recibido` |
| | Pago de capital | `pago_capital` |
| | Intereses | `intereses` |
| | **Flujo de financiamiento** | suma |
| Otros movimientos | Traspasos entre cuentas propias | `traspaso_interno` |
| | Por conciliar · entradas | abonos sin conciliación activa |
| | Por conciliar · salidas | cargos sin conciliación activa |
| | **Flujo neto** | antes de financiamiento + financiamiento + traspasos + por conciliar |
| Saldos | Saldo inicial | banco |
| | Saldo final | banco |

Los renglones de la plantilla y los totales siempre se muestran; "Depósitos de efectivo", "Apertura", "Intereses",
"Pago de capital", "Traspasos" y "Por conciliar" solo si ≠ 0 en el periodo (en el comparativo, si ≠ 0 en alguna columna).

**Regla del cobro con tarjeta:** en una conciliación `cobro_tarjeta`, los **abonos** cuentan como `cobranza_tarjeta` y
los **cargos** (comisión e IVA de NetPay del mismo día) como `comisiones_cobro`, sin importar el concepto guardado.
En cualquier otro tipo, todos sus movimientos usan el concepto guardado.

## 4. Saldos y cobertura

- **Saldo inicial** de una cuenta en el periodo = saldo del banco **antes** de su primer movimiento del periodo
  (`saldo − abono + cargo` de ese movimiento, por fecha y `fila_origen`). Sin movimientos en el periodo: el saldo del
  último movimiento anterior; sin ninguno, 0 y la cuenta no aparece.
- **Saldo final** = saldo después del último movimiento del periodo (o el inicial si no hubo).
- Con varias cuentas, los saldos se suman.
- **Comprobación:** saldo inicial + flujo neto debe ser igual al saldo final al centavo. Si no, se muestra un aviso
  ("Hay huecos en los reportes importados de la cuenta …: la diferencia es $X") y las cifras se muestran igual.
- **Cobertura:** si el último movimiento importado de alguna cuenta es anterior al fin del periodo, el encabezado dice
  "movimientos hasta el {fecha}".
- Un mes que empieza antes del primer movimiento importado no inventa saldo: inicia en el balance previo al primer
  movimiento.

## 5. Pantalla y Excel

- `/finanzas/flujo?vista=mes|comparativo&mes=AAAA-MM&rfc=…`. Selector de mes (desde el primer mes con movimientos) y
  de razón social. Por omisión: mes actual, todas las razones sociales.
- **Mes:** tabla por secciones con el estilo del P&L (encabezado de sección con color, totales en barra), columnas
  **Monto** y **% de ingresos**. En celular, tarjetas (`tabla-tarjetas`). Aviso de "Por conciliar" con enlace a
  Banca → Conciliación del mismo mes.
- **Comparativo:** meses de enero (o del primer mes con movimientos) al elegido, más **Total**; saldo inicial del total =
  el del primer mes, saldo final = el del último. Tabla que se desliza de lado con la columna de renglones fija
  (igual que el comparativo del P&L).
- **Excel** (`/reporte/flujo/excel?...`): hojas "Flujo" (mes) y "Flujo comparativo", formato contable y estilos de
  `lib/xlsx-escribir.ts`.
- Menú de Finanzas: "Flujo de efectivo" después de "P&L".

## 6. Módulos

- `lib/finanzas/flujo.ts` (pura): catálogo de renglones y `calcularFlujo(movimientos, opciones)` →
  `{ renglones, saldoInicial, saldoFinal, diferencia, porConciliar: { n, entradas, salidas }, ultimaFecha }`.
  Cada movimiento trae `{ cuentaId, fecha, fila, cargo, abono, saldo, conciliacion: { tipo, concepto } | null }`.
- `lib/finanzas/flujo.test.ts`: mapeo de conceptos; regla del cobro con tarjeta; devoluciones; por conciliar; saldos con
  una y dos cuentas; mes sin movimientos; hueco detectado; renglones opcionales ocultos; % sobre ingresos (ingresos 0 → sin %).
- `lib/finanzas/excelFlujo.ts` + prueba: las dos hojas.
- `app/finanzas/flujo/datos.ts`: lee movimientos del rango (y el último anterior de cada cuenta) con su conciliación
  activa; `app/finanzas/flujo/page.tsx` y su tabla; `app/reporte/flujo/excel/route.ts`.

## 7. Fuera de alcance

Proyección y supuestos de la plantilla; flujo por sucursal; efectivo en caja y bóveda (no pasan por el banco hasta su
depósito); otras cuentas o bancos además de Banregio; semanas.
