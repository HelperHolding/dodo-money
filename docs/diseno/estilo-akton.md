# Estilo Akton para reportes de Dodo MX

Los reportes financieros de Dodo MX siguen el formato del reporte de resultados de Akton Partners
(«Dodo Pizza · Resultados»). La primera pantalla que lo usa es el P&L **Contra meta** (`/finanzas?vista=meta`).
Cuando un reporte nuevo tenga métricas, contra meta o explicación, usa estas piezas en vez de inventar otras.

## Principios

1. **Primero el número, luego la explicación.** Arriba van los indicadores. Después viene una lectura
   numerada que dice qué pasó. La tabla va al final, como respaldo.
2. **Poco color, con significado fijo.**
   - Naranja Dodo (`--accion`): solo EBITDA y alertas.
   - Verde (`--cuadra`) y rojo (`--alerta`): solo variaciones contra meta.
   - Todo lo demás va en negro y grises.
3. **Tarjetas blancas sobre fondo claro.** Usa bordes de 1 px (`--linea`), radio `--r-md` y sin sombras.
4. **Cifras tabulares.** Usa `font-variant-numeric: tabular-nums`. Los montos usan `<Importe>`, con el $ a la
   izquierda y los negativos entre paréntesis. Los % se escriben con `porcentaje()`.
5. **Explica en la tabla, no en otro lado.**
   - Los avisos de un renglón van en su columna de notas, a la derecha.
   - La metodología va como ⓘ con número y nota al pie.
   - El pie también dice la meta usada y las fuentes.

## Piezas y clases

| Pieza | Clase | Cuándo usarla |
|---|---|---|
| Contenedor | `.akton` | Envuelve la vista. Da el fondo claro (`--papel-2`) y el espacio entre tarjetas. |
| Franja de indicadores | `.akton-kpis` > `.akton-kpi` | 4 a 6 cifras clave del periodo. Cada una lleva etiqueta en versalitas, valor grande y una línea de pie con la referencia (meta, rango, desglose). |
| Indicador destacado | `.akton-kpi[data-tono="destacado"]` | Solo el resultado principal (EBITDA). Lleva borde y franja superior naranja. |
| Indicador contra referencia | `data-tono="si"` / `"no"` | El valor se pinta verde o rojo cuando está mejor o peor que su meta o rango. Sin referencia, no lleva tono. |
| Lectura numerada | `.akton-lectura` | Una conclusión por tarjeta, con un número en círculo negro. El título lleva el dato («EBITDA de tienda: $X contra $Y de meta») y el texto dice cuánto falta y qué lo explica. Se calcula, no se escribe a mano. |
| Tabla | `.akton-tabla-marco` > `.akton-tabla` | Estado de resultados. Columnas: Renglón · Real · % venta · Meta · % meta · Var. vs meta · Notas. |
| Encabezado de sección | `tr.akton-seccion` | Va en versalitas gris, sin fondo de color. |
| Sub-renglón | `tr.akton-sub` | Desglose (POS / Rappi, productos / insumos, conceptos de nómina). Va sangrado y en gris. |
| Subtotal | `tr.akton-subtotal` | Venta neta, Margen bruto, Rappi neto y EBITDA. Va en negritas con fondo durazno suave (`--accion-tinte`). |
| Subtotal destacado | `tr.akton-destacado` | EBITDA de tienda. Lleva fondo `--accion-suave` y líneas naranjas. |
| Variación | `.akton-var[data-favorable]` | `si` va en verde y `no` en rojo. Sin meta o sin capturar, va sin color. |
| Chip | `.akton-chip` | Marca un ingreso dentro de un grupo de gastos (ej. excedente DAR en Rappi). |
| ⓘ | `.akton-info` | Enlaza a la nota al pie `#akton-pie-N`. |
| Nota al margen | `.akton-nota` | Texto corto con borde izquierdo naranja, dentro de la columna Notas. |
| Pie | `.akton-pie` | Notas numeradas, la meta usada y las fuentes. |

En celular (≤ 640 px) la tabla pasa a tarjetas (`.tabla-tarjetas`). Cada renglón es una tarjeta con «etiqueta: valor».
Los subtotales conservan su fondo y las notas van al final de la tarjeta.

## Reglas de cálculo (no de estilo)

- La lógica vive en `lib/finanzas/akton.ts`, en funciones puras con pruebas en `lib/finanzas/akton.test.ts`.
  Los componentes de `app/finanzas/PLAkton.tsx` solo dibujan.
  - `indicadoresAkton`: venta neta y bruta, % de descuento, pedidos y promedio diario, ticket por canal,
    alimento + merma contra meta, prime cost y EBITDA de tienda.
  - `lecturaEbitda`: cuánto falta para la meta y los 3 renglones de gasto con la mayor variación desfavorable.
    Oficina no cuenta, porque no es de la tienda.
  - `renglonesAkton`: el orden de la tabla. Rappi se agrupa después del margen bruto y cierra con «Rappi, neto».
    Los ingresos en cero no se muestran.
  - `notasPorRenglon`: manda cada aviso del P&L a su renglón. Los que no tienen renglón quedan en
    «Observaciones del reporte».
  - `favorable`: un gasto es favorable abajo de su meta; un ingreso o total, arriba.
- **Prime cost**: alimento + merma + nómina (cocina y gerencia) sobre la venta neta. El rango de mercado es 55–65 %
  (`PRIME_COST_MERCADO`).
- **Ticket**: venta neta del canal entre pedidos del canal.
  - POS: `ventas_dia.pedidos`.
  - Rappi: órdenes finalizadas que suman como canal propio.

## Al crear un reporte nuevo

1. Empieza por la franja de indicadores y una lectura calculada. Si no hay conclusión que calcular, no pongas lectura.
2. Reutiliza las clases `.akton-*`. Si algo nuevo hace falta, agrégalo a esta guía con su regla de uso.
3. No agregues colores nuevos. Si un dato no es variación ni alerta, va en negro o gris.
4. Mantén «De dónde sale» (`desplegable`) en cada renglón que tenga detalle.
