# Mermas en el P&L

Regla acordada: bajas de productos terminados se incorporan como Merma; los insumos siguen pendientes y excluidos hasta separar la pérdida de proceso ya incluida en el BOM. No se calcula aquí consumo real menos teórico ni se restan automáticamente porcentajes de pérdida de los ingredientes. No se añade el 1 % de periféricos a las bajas.

## Activación

1. Ejecutar `supabase/migrations/0035_mermas_pl.sql`.
2. Ejecutar `supabase/pruebas/0035_mermas_pl.sql`: el ERROR PRUEBAS OK revierte la prueba. Requiere admin/corporativo activos y sucursal. Usa fechas reservadas 2020-01-02 y 2020-01-03 que deben estar libres.
3. Tras publicar, reimportar en Finanzas → Mermas Dodo IS los periodos anteriores con el reporte completo y ambas hojas. Los días ya existentes conservan la marca de cobertura pendiente: el importador anterior no distinguía una hoja de productos vacía de una ausente.

## Costos y trazabilidad

Se usa el costo original sin IVA de Dodo IS, por sucursal y fecha de baja. Los costos desconocidos permanecen pendientes, separados del importe conocido. Un administrador puede registrar un costo unitario por pieza, sin IVA, con fecha de vigencia y fuente; aplica a ese producto/sucursal, sustituye el costo importado desde esa fecha y conserva ambos. Las correcciones de la misma fecha tienen orden de registro determinista. Anular recupera la versión previa aplicable o el costo original. Reimportar cantidades recalcula cantidad × costo confirmado y conserva su historial.

Las referencias de BOM son informativas: se exige nombre exacto normalizado y coincidencia única, con versión vigente a la fecha de la baja. No se usan similitudes, costos futuros, receta ambigua ni conversiones de litros a kg. La referencia de receta incluye sus ajustes y empaque, y no acredita por sí sola que el importe sea sin IVA o represente todos los componentes de una baja. La fuente del costo sin IVA requiere confirmación explícita al guardar.

## Cobertura y resultado

El archivo debe contener productos terminados aunque la hoja esté vacía. Una hoja ausente o con periodo más corto no confirma días fuera de su cobertura. Una hoja vacía completa sí acredita cero bajas. Un día sin importar, sin cobertura de productos o con costo desconocido conserva pendientes; la fila de Merma y los subtotales del resultado se etiquetan como parciales/provisionales. Solo se descuentan los costos conocidos, una vez. El consolidado conserva la advertencia si alguna sucursal está pendiente.

De dónde sale enlaza a las bajas del mes/sucursal y muestra cantidad, fecha, fuente del costo y archivo. Contra meta, comparativo, PDF y Excel usan el mismo cálculo. Reimportar y registrar/anular costos revalida los reportes del P&L.

## Muestra y límites

Se revisó el archivo `Mermas Zapopan-1 2026-09-21 a 2026-10-06.xlsx`: ambas hojas abarcan el mismo periodo. En octubre contiene una baja de Hawaiana Grande el 1 de octubre, una pieza, importe sin IVA 40.966, redondeado a $40.97. Los demás días de octubre en ese archivo tienen la hoja de productos completa y sin bajas. En septiembre aparecen costos de algunos productos que ameritan revisión (por ejemplo, Pepperoni Mediano por $2,285.22); se conservan como fuente original y pueden corregirse con un costo confirmado. No se modificaron datos reales de Supabase.

Pruebas locales: costos vigentes, correcciones y anulación, separación de insumos, importes parciales, días faltantes/hoja vacía/ausente, exclusión de datos fuera de rango, no duplicación en margen/EBITDA y estado provisional del consolidado. La prueba SQL cubre permisos, fuente original, importación y persistencia de versiones.
