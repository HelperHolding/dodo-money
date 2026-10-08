# Recepción y forma de pago previstas en factura — 0046

Desde una factura de compra vigente se programa la recepción para cualquier fecha desde hoy. El plazo de entrega del proveedor (días naturales) es una recomendación calculada desde hoy, no una restricción por día de semana. Dejar la fecha vacía quita la programación.

La recepción prevista se muestra en la factura y en Compras → Recepciones. También actualiza entrega_esperada de todas las órdenes vinculadas confirmadas y aún no recibidas completas. No altera órdenes cerradas ni cantidades recibidas, inventario, cotejo o pagos. Las fechas de factura son una agenda, no una constancia de recepción; se pueden quitar cuando ya no se necesiten.

La programación individual y en bloque exige una forma prevista: transferencia, efectivo, tarjeta o cheque. Se muestra en la factura, listado y calendario de pagos. Quitar la fecha individual elimina también su forma prevista. Programar efectivo no crea una reserva ni mueve dinero. El registro del pago real mantiene sus controles y las opciones de origen existentes; no ejecuta automáticamente la forma prevista.

Se conserva historial de programación con usuario y fecha, consultable por compras y sin escritura directa. Las órdenes mantienen su historial de entrega. Si un CFDI sustituye una prefactura, hereda la programación cuando no tiene ya una propia.

Ejecutar migración 0046 y prueba 0046 en Supabase. PRUEBAS OK revierte el ensayo. Pendiente de esa confirmación antes de fusionar a main.

## Concurrencia al migrar

La migración toma primero un bloqueo exclusivo sobre facturas_saldo y sus relaciones, antes de alterar facturas. Evita el orden inverso tabla → vista que puede formar un deadlock con una consulta de la aplicación. NOWAIT falla inmediatamente si existen consultas activas: volver a ejecutar la migración completa cuando terminen, sin ejecutar la prueba en paralelo. lock_timeout local de 5 segundos limita otras esperas de DDL. Si SQL Editor conserva la transacción abortada, ejecutar ROLLBACK antes del nuevo intento. No se cancelan sesiones de otros usuarios.

La validación de concurrencia real sigue pendiente en Supabase; los números de relación del error requieren consultar pg_class para identificar sus nombres.
