# Cancelación interna de facturas y gastos

La administración puede cancelar desde el encabezado de la factura con motivo de 5 a 1000 caracteres. Ejemplo: Rappi absorbe el marketing y no corresponde pagarlo. No registra un pago ni tramita cancelaciones ante el SAT.

0052 conserva una instantánea de la factura original, sus órdenes, usuario y fecha en factura_cancelaciones. La tabla permite consulta de compras y solo escritura mediante RPC. Se conserva el importe original; las facturas canceladas quedan excluidas del P&L y pendientes.

La RPC bloquea la factura antes de comprobar pagos, impide repetir la cancelación y exige anular pagos y cancelar reservas de bóveda primero. No modifica efectivo ni recepciones realizadas. Quita programación de la factura con historial, desvincula órdenes y aplica la reapertura existente. La programación propia de una orden sigue siendo independiente.

Verificación: 449 pruebas de código, TypeScript y build correctos. El ensayo SQL 0052 es reversible y necesita validación en Supabase. No se ha ejecutado contra la factura real ni verificado visualmente en navegador. Las cancelaciones anteriores mantienen sus campos históricos; la instantánea detallada se guarda para nuevas cancelaciones.
