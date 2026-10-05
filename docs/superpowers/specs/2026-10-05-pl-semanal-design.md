# P&L semanal (diseño)

**Fecha:** 2026-10-05 · **Autor:** Claude con Sebastián · **Estado:** en revisión · **Pide:** el CEO

## 1. Objetivo

Que el P&L de la fase 1 (`docs/superpowers/specs/2026-10-05-pl-fase-1-design.md`) también se pueda ver **por semana**,
por sucursal y consolidado, con los mismos renglones, metas, detalle por renglón y export a PDF/Excel.

**Éxito:** el CEO elige una semana y ve venta, alimento, nómina, … EBITDA de esa semana con su % y meta; los costos fijos
repartidos en los días de un mes suman (salvo centavos) lo del mes, aunque las semanas crucen de un mes a otro; una semana en curso no se ve peor solo porque lleva menos días.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Semana | Lunes a domingo (ISO), con el día operativo de las ventas (corte a las 4:00) |
| Costos que se registran por mes | Proporcionales a los días: monto del mes ÷ días del mes × días del periodo en ese mes |
| Semana que cruza meses | Cada día toma la parte de su propio mes |
| Periodo en curso (semana o mes) | Se corta en **ayer** (día operativo): ventas y costos fijos cubren los mismos días |
| Comparación en semanal | Semana anterior % y acumulado del mes % (mes del último día de la semana, del 1 a ese día) |
| Comparación en mensual | Sin cambio: mes anterior % y acumulado del año % |
| Base de datos | Sin migración: no se guarda nada nuevo |

## 3. Cálculo de cada renglón en un periodo (semana o mes)

Un **periodo** es un rango `desde–hasta` (días operativos). El mes es el caso de todos los días del mes.

**Exacto por día** (como hoy, filtrando por fecha dentro del periodo): venta neta, descuentos, alimento teórico,
comisión de agregadores, comisiones de cobro, regalías, faltantes de efectivo, caja chica (por su fecha).

**Proporcional por días** — para cada mes que toca el periodo, fracción = días del periodo en ese mes ÷ días del mes:
- Nómina: plantilla vigente al cierre de ese mes + ajustes de ese mes, × fracción.
- Gastos del mes, × fracción.
- Facturas (gasto por cuenta, sin cuenta y memos): las de **todo ese mes** (por fecha de emisión, notas de crédito
  restan, canceladas no), × fracción.
- Oficina central: lo de oficina de ese mes × fracción; luego se reparte entre sucursales por la venta del periodo.

Con el periodo = mes completo la fracción es 1 y el resultado es el de la fase 1.

**Metas:** `pct` y `pct_rappi` sobre la venta del periodo (sin cambio); `monto` y `plantilla` × fracción (suma de
fracciones de los meses que toca).

**Detalle por renglón:** lo prorrateado dice de dónde sale, p. ej. "Renta de octubre $30,000.00 × 7/31";
cada factura o gasto se lista con su monto completo y la fracción.

## 4. Periodo en curso

Si el periodo incluye hoy, `hasta` se recorta a ayer (día operativo). Ventas, caja chica, faltantes y la fracción de los
costos fijos usan ese mismo rango. Si el periodo empieza hoy (lunes en la mañana), no hay días: se muestra "La semana
apenas empieza" y nada más. El aviso de días faltantes cuenta solo hasta ayer (corrige el aviso del mes en curso
que contaba días futuros).

## 5. Pantalla

- P&L: selector **Mes | Semana**. En Semana, una lista de semanas desde la primera del P&L (semana del 2026-10-01)
  hasta la actual, la más reciente primero, rotuladas "Sem 41 · 5–11 oct" (número ISO). La URL lleva
  `?periodo=semana&semana=2026-W41` (o `periodo=mes&mes=2026-10`, como hoy).
- Columnas: real, %, meta %, diferencia, **semana anterior %**, **mes %** (en mensual: mes anterior %, año %).
- Nota visible en semanal: "Los costos que se registran por mes se reparten por días; si llega una factura del mes,
  esta semana se ajusta."
- PDF y Excel: el mismo periodo; encabezado "Semana 41 · 5 al 11 oct 2026" o "Mes 2026-10".

## 6. Arquitectura

- `lib/finanzas/periodo.ts` (nuevo, puro, con pruebas): semanas ISO (`semanaISO`, `rangoSemana`, `semanasDesde`),
  meses que toca un rango y su fracción, recorte a ayer.
- `app/finanzas/datos.ts`: `datosPL(supabase, periodo)` en lugar de `(supabase, mes)`; lee los datos diarios del rango
  y los mensuales de cada mes que toca, y aplica las fracciones. `plConHistoria` recibe el periodo y arma las
  comparaciones según el tipo.
- `lib/finanzas/pl.ts`: sin cambio en `calcularPL`; las metas en monto se escalan antes de calcular.

## 7. Pruebas

- Node: semana ISO (fin y principio de año, semana 53), rango de la semana, semana que cruza meses (fracciones
  7 días = 2/30 + 5/31), febrero bisiesto, recorte a ayer (lunes, miércoles, domingo), semana que aún no empieza;
  escalado de metas en monto; prorrateo de nómina y facturas en cruce de meses; periodos que cubren un mes (p. ej. del 1 al 7 y del 8 al fin) suman el costo fijo del mes.
- Vista previa: selector y tabla en computadora y celular.
