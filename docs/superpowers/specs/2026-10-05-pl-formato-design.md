# Formato del P&L: secciones y vista comparativa (diseño)

**Fecha:** 2026-10-05 · **Autor:** Claude con Sebastián · **Estado:** en revisión
**Referencia visual:** plantilla "Pro Forma Profit and Loss Statement" que compartió Sebastián (secciones con encabezado
de color, subtotales en barra gris, `$` alineado a la izquierda y cifra a la derecha, periodos lado a lado).

## 1. Objetivo

Que el P&L (mensual y semanal, ya en main) se lea como un estado de resultados formal, en pantalla, PDF y Excel, y que
además se puedan ver **varios periodos lado a lado**.

**Éxito:** el CEO abre el P&L y ve las secciones con color y los subtotales en barra; cambia a "Comparativo" y ve los
meses del año (o las semanas del mes) en columnas con su total; descarga el Excel y se ve igual (colores, barras,
formato contable) y abre en Excel sin reparar.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Vistas | Dos: **Contra meta** (la de hoy: real, %, meta %, diferencia, anterior %, acumulado %) y **Comparativo** (periodos lado a lado) |
| Comparativo mensual | Un mes por columna, de enero (o del inicio del P&L) al mes elegido, más **Total del año** |
| Comparativo semanal | Las semanas del mes elegido, **cortadas al borde del mes**, más **Total del mes**; las columnas suman el total |
| Celda del comparativo | Monto y, chico debajo, su % de venta |
| Formato de montos | Contable: `$` a la izquierda de la celda, cifra a la derecha, negativos entre paréntesis `$ (10.00)` |
| Excel | Mismo formato que la pantalla, dos hojas: "Contra meta" y "Comparativo" |
| Celular | Contra meta: tarjetas como hoy, con la sección como banda de color. Comparativo: tabla que se desliza de lado con la columna de renglones fija (única tabla ancha) |

## 3. Secciones

| Sección (color) | Renglones | Barra gris al final |
|---|---|---|
| Venta (azul `#BDD7EE`) | Venta neta; Descuentos (informativo) | — |
| Costo de venta (verde `#D9EAD3`) | Alimento y empaque; Merma | **Margen bruto** = venta neta − alimento − merma (renglón nuevo) |
| Gastos de operación (durazno `#FCE4D6`) | Nómina cocina, Nómina gerencia, Repartidores, Comisión de agregadores, Marketing de agregadores, Marketing, Renta, Servicios, Mantenimiento, Consumibles y equipo menor, Regalías, Otros | **EBITDA de tienda** |
| Oficina central (rosa `#EAD1DC`) | Oficina central | **EBITDA** |
| Memo (gris claro `#F2F2F2`) | Compras de insumos; Inversiones | — |

Barras de total: fondo gris oscuro `#7F7F7F`, texto blanco, negritas. "Margen bruto" lleva meta = venta − meta de
alimento − meta de merma cuando hay metas.

## 4. Vista Comparativo

- **Columnas** (función pura en `lib/finanzas/periodo.ts`, con pruebas):
  - Mensual: `periodoMes` de cada mes de enero (o del inicio) al elegido; el último puede ir cortado a ayer.
  - Semanal: el mes es el del **jueves** de la semana elegida (regla ISO); columnas = semanas que tocan ese mes, cada
    una recortada al mes, al inicio del P&L y a ayer; se omiten las vacías. Rótulo "Sem 40 · 1–4 oct".
  - Total: suma de las columnas (mismo cálculo que el acumulado de hoy, mes por mes o semana por semana).
- Cada columna es una carga de `datosPL` de su rango, todas en paralelo; los % de cada columna son sobre su venta.
- Sin metas en el comparativo (las metas viven en "Contra meta").
- Detalle por renglón solo en "Contra meta".

## 5. Pantalla, PDF y Excel

- `/finanzas`: dos selectores de pestaña, **Mes | Semana** y **Contra meta | Comparativo** (`?vista=comparativo`).
- PDF (`/reporte/pl`): la vista elegida, mismo formato, sin el detalle desplegable.
- Excel (`/reporte/pl/excel`): siempre las dos hojas. El generador `lib/xlsx-escribir.ts` aprende:
  - formato numérico **contable** (`_("$"* #,##0.00_);_("$"* (#,##0.00);_("$"* "-"??_);_(@_)`);
  - **estilo por renglón** (color de fondo, color de texto, negritas), con los estilos de la hoja generados según los
    que se usen; los reportes que ya existen (ventas) siguen saliendo igual.

## 6. Arquitectura

- `lib/finanzas/secciones.ts` (nuevo, puro): `SECCIONES` (clave, nombre, color, renglones, total), `cifraContable(n)`.
- `lib/finanzas/pl.ts`: renglón `margen_bruto` (total) entre Merma y Nómina cocina.
- `lib/finanzas/periodo.ts`: `columnasComparativo(p, hoy, inicio)`.
- `app/finanzas/datos.ts`: `comparativoPL(supabase, p, sucursalId)`.
- `app/finanzas/TablaPL.tsx` (contra meta, con secciones) y `app/finanzas/TablaComparativo.tsx` (nuevo); el PDF usa
  los mismos componentes.
- `lib/finanzas/excel.ts`: `hojaPL` con secciones y `hojaComparativo`.

## 7. Pruebas

- Node: `cifraContable` (positivo, negativo entre paréntesis, cero, null); `SECCIONES` cubre todos los renglones del P&L
  una sola vez; margen bruto y su meta; `columnasComparativo` (mes de enero, mes en curso, semanas de octubre 2026 con
  la 40 cortada al 1, semana 44 que cruza a noviembre pertenece a octubre, semana en curso cortada a ayer, total);
  `xlsx-escribir` con estilos por renglón y formato contable (y que los reportes de ventas no cambian);
  `hojaPL`/`hojaComparativo` (colores por sección, barras de total).
- Excel abierto en el Excel real (sin reparar, colores y formato contable).
- Vista previa en computadora y celular de las dos vistas.
