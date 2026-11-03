# Ajustes del P&L con nota (diseño)

**Fecha:** 2026-11-02 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Presentar el P&L **normalizado** sin perder el real: por ejemplo, en octubre 2026 se hizo una inversión inicial de
marketing por la inauguración; en el reporte se quiere considerar solo el **5 % de la venta** y mostrar cuánto es eso, cuánto
se limpió y por qué.

**Éxito:** admin captura "Marketing · octubre 2026 · Dodo X · tope 5 % de la venta neta · nota"; el P&L muestra en ese renglón
Real, Ajuste y Ajustado, los totales ajustados y la lista de ajustes con su nota; el PDF se imprime con las columnas
elegidas (Real, Ajustado o ambas) y el Excel trae las dos.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Presentación | Real y Ajustado lado a lado (columnas **Real · Ajuste · Ajustado**) cuando el periodo tiene ajustes |
| Impresión | En el PDF se eligen las columnas: **Real**, **Ajustado** o **ambas** |
| Tipos | **Tope % de venta neta** (lo que pase se limpia) y **monto** (± pesos fijos) |
| Nota | Obligatoria en cada ajuste |
| Alcance | Un ajuste = un renglón de gasto · un mes · una sucursal. El consolidado suma los de sus sucursales |
| Vistas | **Contra meta** y **Formato asesores** (pantalla, PDF, Excel). "Por cuentas" y "Comparativo" siguen solo reales |
| Captura | En el P&L, con sucursal elegida y vista de mes: botón "Ajustar" por renglón de gasto (solo admin) |
| El real | No cambia: el ajuste es una capa sobre el cálculo. En pantalla, Meta y Diferencia siguen comparando contra el real; el detalle ("De dónde sale") y "Por cuentas" son siempre reales. Solo el PDF/Excel "ajustado" compara contra el ajustado |

## 3. Datos (migración)

Tabla `public.pl_ajustes`:

| Columna | Regla |
|---|---|
| `id` uuid | = id de solicitud (idempotente) |
| `sucursal_id` | not null, referencia `sucursales` |
| `mes` | date, día 1 |
| `renglon` | mismo `check` de renglones de gasto que `pl_metas` (alimento, merma, nomina_cocina, nomina_gerencia, repartidores, agregadores, marketing_agregadores, marketing, renta, servicios, mantenimiento, consumibles_equipo, regalias, otros, oficina) |
| `tipo` | `tope_pct` \| `monto` |
| `valor` | `tope_pct`: fracción 0 < v ≤ 1 (5 % = 0.05); `monto`: pesos con signo (negativo limpia), ≠ 0 |
| `nota` | 10 a 500 caracteres |
| `creado_por`, `creado_en` | auditoría |
| `anulado_por`, `anulado_en`, `motivo_anulacion` | anular con motivo (5–500); nunca se borra |

- Índice único parcial: a lo más **un ajuste activo** por (sucursal, mes, renglón).
- RLS: lectura con `ve_finanzas()`; sin escritura directa.
- RPC `guardar_ajuste_pl(p_solicitud, p_sucursal, p_mes, p_renglon, p_tipo, p_valor, p_nota)` y
  `anular_ajuste_pl(p_id, p_motivo)`, `security definer`, solo admin. Cambiar un ajuste = anular y capturar otro.
- Prueba reversible `supabase/pruebas/…` (termina en `PRUEBAS OK`): permisos, validaciones, unicidad, anulación.

## 4. Cálculo (función pura `lib/finanzas/ajustes.ts`)

`aplicarAjustes(filas: FilaPL[], entrada: EntradaPL, ajustes: AjusteVigente[]) → { filas: FilaAjustada[]; lista: AjusteAplicado[] }`
para una sucursal y un periodo.

- **Tope % de venta:** `ajustado = min(real, valor × venta neta del periodo)`; `ajuste = ajustado − real` (≤ 0). Si el real
  ya es menor, no cambia (ajuste 0, se lista como "sin efecto").
- **Monto:** `ajustado = real + valor × fracción del mes que cubre el periodo` (en un mes completo, fracción 1; en una
  semana, la parte proporcional de cada mes que toca).
- **Totales:** margen bruto, EBITDA de tienda y EBITDA se recalculan con los renglones ajustados; los % ajustados se
  calculan sobre la misma venta neta (la venta no se ajusta).
- **Consolidado:** cada sucursal se ajusta con sus propios ajustes y venta; el consolidado suma reales y ajustes.
- **Formato asesores:** se arma igual desde las filas ajustadas (columnas Real y Ajustado; EBITDA 4-Wall y EBITDA ajustados).
- Pruebas: el ejemplo de marketing (real 34,067.74, venta 356,560.09, tope 5 % → ajustado 17,828.00, ajuste −16,239.74);
  tope sin efecto; monto negativo; semana con fracción; varios ajustes en la misma sucursal; consolidado de dos sucursales;
  totales iguales a recalcular `calcularPL` con los montos ajustados.

## 5. Pantalla

- **Contra meta / Formato asesores:** si el periodo tiene ajustes vigentes, después de "Real" aparecen **Ajuste** y
  **Ajustado** (monto y %); sin ajustes, la tabla queda igual que hoy.
- Debajo de la tabla, **"Ajustes del periodo"**: sucursal (en consolidado), renglón, regla ("Tope 5 % de la venta neta =
  $17,828.00" o "Monto −$16,000.00"), real, ajuste y nota.
- **Captura (admin, sucursal y mes elegidos):** "Ajustar" en cada renglón de gasto abre un formulario (tipo, valor —% o
  pesos—, nota) con vista previa del ajustado; un ajuste vigente se muestra con "Anular" (motivo). No se captura en semana
  ni en consolidado.

## 6. PDF y Excel

- **PDF** (`/reporte/pl`, sobre el formato de una cuartilla del PR #104): parámetro `columnas=real|ajustado|ambas`,
  elegido en un selector junto al botón PDF.
  - `real`: el PDF de hoy.
  - `ajustado`: la columna Real se reemplaza por Ajustado (los % y diferencias contra meta usan el ajustado).
  - `ambas`: Real, Ajuste y Ajustado; para caber, se omiten "Mes anterior %" y "Acumulado %".
  - Con ajustes, al pie va la lista de ajustes en una línea cada uno, con la misma letra y tamaño.
- **Excel**: columnas Ajuste y Ajustado junto a Real, y una hoja "Ajustes" con la lista.

## 7. Fuera de alcance

Ajustes de venta (venta neta, Rappi fuera de base, excedente); ajustes en "Por cuentas" y "Comparativo"; ajustes que
cubran un rango de meses o que existan solo a nivel consolidado; aprobación en dos pasos.
