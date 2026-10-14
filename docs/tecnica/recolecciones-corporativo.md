# Recolecciones y pagos desde caja de ventas

Aplicar 0062, su ensayo reversible, 0063 y su ensayo reversible, antes de publicar. Las entregas históricas se conservan. Nuevas salidas requieren expediente en /recolecciones; se retira la opción del formulario genérico y los campos duplicados de entrega del cierre diario.

## Caja de ventas

Administración registra un pago de una factura de la misma sucursal desde un turno abierto del día operativo actual, con ticket y motivo. El último arqueo confirmado respalda la disponibilidad: contado menos retiros confirmados posteriores, pagos netos posteriores, retiros pendientes y el mayor fondo entre sucursal y arqueo. Ventas nuevas requieren otro arqueo confirmado antes de disponer del efectivo. Se bloquean arqueo y turno, se vuelve a validar y el pago/aplicación/evento es atómico e idempotente.

No modifica la bóveda al pagar desde caja; el retiro automático al cierre se calcula sobre el efectivo físico restante. El esperado del arqueo descuenta los pagos de ventas explícitamente. El cierre captura gastos_ventas_dia como detalle; no lo resta de bóveda otra vez. No puede anularse un arqueo que respalda un pago. Una anulación en el turno aún abierto devuelve a caja; después de cerrar devuelve a bóveda en el día actual, sin reescribir arqueos ni cierres anteriores. El usuario debe confirmar que el efectivo fue realmente devuelto.

## Entrega por rango

Gerente solo su sucursal y administración preparan. Corporativo consulta y recibe; encargado/operación sin acceso. Rango de hasta 366 días sin fechas futuras, con cierres existentes. Cada cierre solo tiene una recolección activa. Snapshot guarda todos los cierres y eventos de efectivo desde inicio del rango hasta día operativo actual, incluyendo posteriores al último cierre, con referencias a pagos/facturas/órdenes y comprobantes. Las compras no pagadas no son salidas; reservas vigentes protegen el efectivo comprometido.

No se suman stocks de bóveda: el máximo del periodo es el menor entre el incremento contado (última bóveda contada menos bóveda inicial del primer cierre, mínimo cero) y disponibilidad actual (saldo menos fondo, reservas y entregas pendientes). Gastos ya descontados se muestran como respaldo. Efectivo de ventas agregado es informativo, no se asume idéntico al efectivo retirado a bóveda. Esta entrega requiere el máximo calculado, no soporta entregas parciales del mismo conjunto de cierres. Si el conteo físico no coincide, conciliar antes de registrar. Se incluyen los cierres existentes; el rango no inventa cierres faltantes.

Pagos históricos en efectivo sin origen se marcan por revisar y requieren confirmación de revisión, sin atribuirles caja ni descontarlos automáticamente. Egresos antiguos en gastos_caja_chica de bóveda siguen incluidos en los totales de cada cierre, aunque no tengan una factura/pago asociado. No se reclasifican ni duplican.

Preparar registra salida pendiente con caja bloqueada y conserva snapshot. Un admin distinto recoge o rechaza usando la custodia existente; rechazo antes de recoger libera los cierres. Después de recoger, no se liberan aunque corporativo detecte diferencia: el dinero salió físicamente. Recepción exige conteo; coincidencia acepta y discrepancia requiere motivo y marca No cuadró. Repetir el mismo conteo es idempotente. Las entregas con expediente no se reciben desde el formulario antiguo sin conteo. Mismo movimiento: no hay salida duplicada ni ajustes a ingresos/P&L.

Nuevas tablas de consulta con RLS y sin escritura directa. El enlace movimiento→expediente usa FK diferida para impedir nuevas salidas sin un expediente válido incluso vía inserción directa. Los helpers de sucursal y rol siguen el alcance existente; futuras empresas deberán ampliar ese alcance. Los ensayos son reversibles, no realizaron pagos reales ni carga de comprobantes. Falta validar el flujo con usuarios y datos reales tras despliegue.
