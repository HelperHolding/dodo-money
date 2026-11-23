# Ventas BI (diseño)

**Fecha:** 2026-11-18 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Un tablero de análisis de ventas, **Ventas BI**, con la estructura y los filtros del «Dashboard The Coffee México» (Zoho
Analytics): filtros arriba, fila de KPIs, medidores contra punto de equilibrio y meta, donas de participación y gráficas
por semana, método de pago, día de la semana, hora, ranking de productos e históricos por semana y por año. Con los datos
de Dodo (Dodo IS + Rappi), para admin y corporativo.

**Éxito:** un corporativo abre Ventas → BI, elige «Mes pasado», «Comparar con el mismo periodo del año pasado» y la
sucursal Zapopan-1; en un par de segundos ve ventas netas, ticket promedio, tickets, UPT y productos con su cambio; ve
cuánto del punto de equilibrio y de la meta se cubrió; cambia el filtro a «Rappi» y «Viernes, 19–22 h» y todo el
tablero se recalcula sin recargar la página.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Dónde vive | Pestaña **BI** en el área Ventas (`/ventas/bi`), después de Conciliación. Admin y corporativo (`veVentasDeTodas`) |
| Cálculo | **Una función SQL** `ventas_bi(filtros jsonb) returns jsonb` que devuelve todo agregado. Migración entregada a Sebastián; probada antes en PGlite |
| P.E. | Calculado del P&L del **último mes cerrado** por sucursal: gastos fijos ÷ margen de contribución (§5) |
| Meta | **Meta de venta mensual por sucursal**, nueva (hoy `pl_metas` solo tiene renglones de costo). Se captura en Parámetros y metas (§6) |
| Filtros sin equivalente en Dodo | Franquicia/propias y Franquiciatario → **Canal** (POS/Rappi), **Origen** y **Razón social**; Contiene café → **Tipo de servicio**; Años operando y Maduración → **Antigüedad** |
| Gráficas | SVG propias con los componentes existentes (`Dona`, `BarrasVerticales`, `LineaHistorial`) y dos nuevos (barras horizontales, barras + línea). Sin librerías |
| Recarga | Filtros sin recarga completa (mismo patrón que el dashboard de inicio: `router.push(…, { scroll: false })` + `aria-busy`) |
| Fuera de alcance | «Conclusiones» (resumen con IA), exportar a Excel, guardar vistas |

## 3. Filtros

En una barra arriba (plegable en celular), todos en la URL para compartir la vista:

| Filtro | Parámetro | Valores |
|---|---|---|
| Fecha relativa | `rel` | hoy, ayer, esta semana, semana pasada, este mes, mes pasado, este año, año pasado (por defecto: esta semana) |
| Rango de fechas | `desde`, `hasta` | si se da, manda sobre `rel` |
| Comparar contra | `comp` | `anterior` (mismo número de días justo antes) · `anio` (mismas fechas del año pasado) |
| Sucursal | `suc` (varios) | sucursales |
| Razón social | `rfc` | razones sociales (vía `razon_social_sucursales`) |
| Antigüedad | `edad` | 0–6 meses, 6–12 meses, 1–2 años, más de 2 años (desde el primer día con ventas de la sucursal) |
| Canal | `canal` | POS (Dodo IS) · Rappi |
| Origen | `origen` | mostrador, kiosco, app, sitio, agregador, Rappi |
| Tipo de servicio | `tipo` | en tienda, entrega, para llevar |
| Día de la semana | `dia` (varios) | lunes … domingo |
| Hora | `hora` | rango de horas (p. ej. 19–22) |
| Categoría | `cat` (varios) | pizza, snack, postre, bebida, combo, otro, sin categoría |
| Producto | `prod` | búsqueda por nombre |
| Método de pago | `pago` | efectivo, tarjeta, en línea, Rappi, otro |

Reglas:
- Los pedidos de Dodo IS cuentan si `estado = 'entregado'` y `tipo <> 'personal'` (igual que hoy). Los de Rappi si
  `estado = 'Finalizado'` y `sumar = true`, con el **subtotal del restaurante** (igual que el reporte de ventas).
- Filtros de producto y categoría: KPIs y gráficas cuentan **los pedidos que contienen** esos productos, y las ventas
  de **esas líneas** (no el pedido entero). Lo dice una nota visible cuando hay filtro de producto o categoría.
- Rappi no tiene origen ni tipo de servicio propios: con «Canal = Rappi» esos filtros se ocultan; con un origen o tipo
  de Dodo elegido, Rappi queda fuera.

## 4. Bloques (en este orden)

1. **KPIs:** Ventas netas (sin IVA) · Ticket promedio · # de tickets · Promedio UPT (productos ÷ tickets) · Total
   productos. Cada uno con su cambio ▲/▼ contra la comparación.
2. **Medidores** (dos filas de tres, como The Coffee):
   - Venta vs P.E. (barra con P.E. y venta) · P.E. vs Venta % (medidor semicircular) · Diferencia contra P.E.
   - Venta vs Meta · Cumplimiento de meta % (medidor) · Diferencia contra meta.
   - Si falta P.E. o meta de alguna sucursal elegida, el bloque lo dice en lugar de mostrar 0.
3. **Donas:** Ventas por categoría (pizza, snack, postre, bebida, combo, otro) · Ventas por canal (POS / Rappi) ·
   Ventas por origen.
4. **Ventas vs transacciones por semana:** barras de venta y línea de tickets por semana del rango.
5. **Método de pago:** dona; **Método de pago por sucursal:** barras apiladas horizontales.
6. **Venta por día de la semana:** barras horizontales con venta y tickets.
7. **Venta por hora:** barras por hora (venta) con tickets en el detalle.
8. **Ranking de productos:** tabla con los 20 más vendidos (venta, piezas, % del total, cambio contra la comparación).
9. **Ventas por semana (comparando años):** una línea por año, semana ISO 1–53.
10. **Ventas por mes y año:** barras por mes, agrupadas por año.

Los bloques 9 y 10 respetan sucursal, razón social, antigüedad y canal; no los filtros de fecha, día, hora, producto,
categoría, pago, origen ni tipo (son históricos). Lo dice su nota.

## 5. Punto de equilibrio

Por cada sucursal elegida, con el P&L del **último mes cerrado** (el mismo cálculo de `app/finanzas/datos.ts`):

- **Costos variables** (proporcionales a la venta): alimento, merma, regalías, agregadores, marketing de agregadores,
  repartidores.
- **Costos fijos:** nómina de cocina y gerencia, renta, servicios, mantenimiento, consumibles y equipo, marketing,
  otros y oficina.
- `margen = 1 − variables ÷ venta neta del mes`; `P.E. mensual = fijos ÷ margen`.
- P.E. del rango = P.E. mensual × días del rango ÷ días del mes. Con varias sucursales se suman.
- Si el margen es ≤ 0 o no hay mes cerrado, la sucursal se marca «sin P.E.» y no se suma.

La clasificación fijo/variable queda en una constante en `lib/ventas/bi.ts` con prueba; si Sebastián quiere mover un
renglón, es una línea.

Se calcula en la app (no en la función SQL) porque reusa el P&L existente.

## 6. Meta de venta (nueva)

- Tabla nueva `ventas_metas(sucursal_id uuid references sucursales, mes date check (extract(day from mes) = 1),
  monto numeric(14,2) check (monto >= 0), primary key (sucursal_id, mes))`, con RLS: leen admin y corporativo, escribe
  admin.
- En **Parámetros y metas**, una sección «Meta de venta mensual» por sucursal y mes (sin IVA), con la opción de copiar
  la del mes anterior.
- Meta del rango = suma de las metas mensuales prorrateadas por día. Si falta la de un mes o una sucursal, se avisa.

## 7. Función SQL `ventas_bi`

- `ventas_bi(p jsonb) returns jsonb`, `security invoker` (respeta RLS de `pedidos`, `pedido_productos`,
  `rappi_ordenes`, `rappi_lineas`), `stable`.
- Entrada: los filtros ya validados en la app (fechas ISO, listas de ids y valores permitidos).
- Salida: `{ kpis, comparacion, categorias, canales, origenes, semanas, pagos, pagos_sucursal, dias, horas, ranking,
  historico_semanas, historico_meses, primeras_ventas }`.
- Une Dodo IS (`pedidos` + `pedido_productos` + `productos_venta.categoria`) y Rappi (`rappi_ordenes` +
  `rappi_lineas` + `rappi_productos`) en un CTE con columnas comunes.
- Índices: se revisa que existan `pedidos(sucursal_id, fecha)` y `rappi_ordenes(sucursal_id, fecha)`; si no, se crean
  en la misma migración.
- Pruebas en PGlite (`supabase/pruebas/`): KPIs, filtro de producto (solo líneas), Rappi con subtotal, comparación año
  anterior, RLS (gerente no ve).

## 8. Pantalla

- `app/ventas/bi/page.tsx` (servidor): valida filtros, llama `ventas_bi` (periodo y comparación en paralelo), calcula
  P.E. y meta, y pinta los bloques.
- `components/FiltrosBI.tsx` (navegador): barra de filtros sin recarga completa.
- Componentes nuevos: `MedidorSemicircular`, `BarrasHorizontales`, `BarrasLinea` (barras + línea), `LineasAnios`.
- Estilo: los mismos tokens y tarjetas del dashboard de inicio, día y noche.

## 9. Riesgos

- **Tiempo de respuesta** con «Este año» y toda la red: la función agrega en la base; se mide en el preview y, si pasa
  de 2 s, se agregan índices o una vista materializada por día.
- **Meta y P.E. vacíos** al inicio: los bloques lo dicen; la meta hay que capturarla.
- **Productos sin categoría** en Dodo IS: se muestran como «Sin categoría».
- **Rappi sin hora de pago ni origen**: documentado en los filtros.

## 10. Entrega

Una rama `feat/ventas-bi` y un PR. La migración (`ventas_bi`, `ventas_metas`, índices) se entrega a Sebastián para
correrla en producción **antes** de publicar la pantalla (AGENTS.md). Pruebas: PGlite para la función, `node --test`
para lo puro (filtros, P.E., meta), guardias de la pantalla, typecheck y build.
