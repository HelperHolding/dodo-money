# Pago con efectivo acumulado en bóveda — 0044

Compras → Registrar pago → Efectivo acumulado en bóveda · días anteriores.
Administración selecciona bóveda, una factura del proveedor, monto, motivo específico y ticket obligatorio. Varios tickets se reúnen en un PDF (máximo 5 MB). Para compras sin factura fiscal se registra primero el gasto sin CFDI con su cuenta por concepto.

Se muestran disponibilidades indicativas; la base verifica de nuevo bajo bloqueo. El efectivo debe seguir físicamente en bóveda: no se permite tomar dinero comprometido en salidas a corporativo, otras reservas o el fondo protegido. El saldo es acumulado; no se asigna una salida a billetes o depósitos de un día concreto.

La función `registrar_pago_boveda_acumulado(jsonb)` crea una reserva por el importe y registra el pago en una misma transacción, reutilizando 0042. Si falla, no queda reserva huérfana. Mantiene cotejo, sucursal de factura, fecha de hoy, día operativo abierto, calendario de pagos y reintentos idempotentes. No genera gasto adicional de caja chica ni altera cortes históricos.

El pago conserva `nota_boveda`, comprobante y reserva. Al anular, 0042 devuelve efectivo al día operativo actual y reactiva el importe de la reserva: se puede reutilizar o liberar con motivo desde Reservas de bóveda. La factura recupera su saldo.

Despliegue: ejecutar `supabase/migrations/0044_pago_boveda_acumulado.sql`, después `supabase/pruebas/0044_pago_boveda_acumulado.sql`. PRUEBAS OK es una excepción intencional y revierte el ensayo. No fusionar antes de confirmar la prueba en Supabase.
