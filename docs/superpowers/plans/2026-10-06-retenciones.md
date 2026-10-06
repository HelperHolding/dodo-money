# Plan de retenciones por enterar

Implementar la especificación aprobada de 2026-10-06 en tres pasos:

1. Cálculo puro y pruebas: proporción de cada pago vigente, meses, estados por impuesto con tolerancia de $1, fechas límite, validación y Excel. Incorporar el menú.
2. Migración 0030: historial de enteros, anulación con motivo, funciones exclusivas de admin, RLS de lectura y bucket privado. Prueba SQL con reversión intencional y fecha de México.
3. Pantalla, carga paginada, acciones con acuse y exportación: admin captura/anula, corporativo consulta. Verificar pruebas, TypeScript y vista en escritorio y celular.

No fusionar feat/retenciones hasta recibir PRUEBAS OK de Supabase. La fecha límite se mantiene en el día 17 conforme a la especificación; no se ajusta por días inhábiles.

## Validación realizada

- 346 pruebas Node aprobadas (331 existentes y 15 nuevas). TypeScript sin errores.
- Vista del TSX real renderizada con pagos y enteros ficticios en navegador: 1280 px y 390 px, sin desbordamiento horizontal. Verificados importes prellenados, estados pendiente/enterado/vencido e historial anulado. No se escribieron datos en Supabase.
- SQL pendiente de ejecución por Sebastián: correr migración y prueba 0030 antes de fusionar. La revisión local no sustituye la prueba de funciones, RLS ni almacenamiento en Supabase.
- Un faltante de IVA o ISR tiene prioridad sobre un exceso del otro impuesto; ambos importes se muestran. La tolerancia de $1 se evalúa por impuesto.
- Si falla la RPC tras subir el acuse, se intenta retirar el archivo; la política solo permite retirar acuses sin registro asociado. Los acuses de enteros anulados se conservan.
