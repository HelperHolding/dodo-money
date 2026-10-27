# Cierre de bóveda con días sin corte

Los cierres nuevos parten del último conteo guardado y recorren los efectos posteriores hasta el fin del día operativo solicitado (o el momento actual si todavía está transcurriendo). Si no existe cierre anterior, parten del saldo inicial y recorren los movimientos disponibles. La fecha de confirmación determina cuándo se incorpora un movimiento; para registros antiguos sin esa fecha se usa su creación. Se excluye cambio de morralla.

Se incluyen entradas, salidas a corporativo, otros egresos como reposiciones y aperturas, gastos activos no informativos y eventos de pagos y anulaciones. Los pagos se toman por el momento de registro de su efecto, para incorporar regularizaciones tardías sin repetir pagos incluidos en el conteo anterior. Las diferencias de arqueos continúan siendo las del día, no se suman otra vez a las entradas contadas.

La consulta RPC respeta RLS y valida sucursal. El trigger existente vuelve a calcular los componentes al insertar; el conteo que introduce el usuario permanece intacto. No se recalculan cierres existentes, saldos iniciales, pagos, entregas ni conteos anteriores. Esto no resuelve por sí solo discrepancias heredadas de conteos históricos ni demuestra que un conteo haya sido físico.

## Validación y publicación

- `npm test`: incluye PostgreSQL aislado con PGlite cargando la migración real: salto de días, frontera exacta del conteo, primer cierre, cierres consecutivos, confirmación tardía, gastos informativos/anulados, eventos negativos, reposiciones, permisos y conservación del conteo anterior.
- Sebastián ejecuta primero `supabase/migrations/20261027231046_cierre_boveda_acumulado.sql` y luego `supabase/pruebas/20261027_cierre_boveda_acumulado.sql`. Compartir el resultado antes de integrar/publicar el formulario dependiente.
- La verificación en producción solo consulta; termina en ROLLBACK. No prueba inserciones en producción: esas se ensayan en PostgreSQL aislado.
