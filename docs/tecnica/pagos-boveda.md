# Pagos extraordinarios y reservas de bóveda · 0042

Pendiente de ejecutar migración y prueba en Supabase. Administración registra pagos y autoriza/libera reservas; corporativo consulta. El fondo de bóveda no cambia.

## Flujo

1. Compras → Reservas de bóveda: el admin elige sucursal, factura, importe, fecha prevista y motivo. La reserva separa dinero adicional al fondo y no reduce el saldo físico esperado.
2. Movimientos y Cierre calculan la salida a corporativo descontando fondo, salidas pendientes y reservas sin consumir. Una reserva de $6,000 con saldo de $20,000 y fondo de $4,500 deja $9,500 disponibles para enviar.
3. Registrar pago: elegir Transferencia bancaria y cuenta, o Efectivo de bóveda y reserva. Fuera de los días autorizados se conserva el motivo obligatorio, con el texto Pago extraordinario.
4. Cada reserva paga únicamente su factura, completa o parcialmente. El pago consume el efectivo y la reserva por el mismo importe. El cotejo y los límites de factura existentes se siguen validando.
5. Liberar reserva requiere motivo y libera solo lo no consumido. Las fechas previstas no liberan dinero automáticamente. Si se cancela o sustituye la factura, liberar la reserva anterior y crear otra para la factura vigente.

## Datos y consistencia

`reservas_boveda` conserva autorización y cancelación. `reservas_boveda_saldo` calcula pendiente contra pagos vigentes. `pagos.origen_fondos` y `reserva_boveda_id` hacen explícito el origen; los pagos anteriores conservan origen desconocido.

`registrar_pago_con_origen(jsonb)` valida origen, cuenta/reserva y llama al RPC de pago existente. Identificador de solicitud y bloqueo transaccional evitan registrar dos veces el mismo envío. El formulario actual ofrece transferencia o bóveda; el RPC anterior se conserva para compatibilidad de registros y pruebas existentes.

`pagos_boveda_eventos` registra salida y devolución por anulación. No crea gastos de caja chica: la factura sigue siendo la fuente del P&L, sin duplicar el gasto. El saldo de bóveda y el corte incluyen estos movimientos.

El pago de bóveda se registra en la fecha de calendario de hoy cuando sale el efectivo. Su evento utiliza el día operativo de México (cambio a las 04:00). La anulación agrega devolución en el día operativo actual y no reescribe cortes anteriores; debe confirmarse que el dinero está en bóveda o nunca salió. Un corte ya cerrado impide pago o anulación de bóveda en ese día.

Reservas, salidas, pagos, gastos de bóveda y cortes toman bloqueo sobre la caja. Los triggers protegen lo reservado frente a movimientos y gastos; para las salidas a corporativo protegen también el fondo. El trigger de corte recalcula los egresos de bóveda antes de insertar.

Tablas nuevas: lectura con RLS por sucursal o puesto global; escritura solo por funciones de administración. Funciones nuevas con `SECURITY DEFINER`, `search_path=''` y sin ejecución anónima.

## Validación

422 pruebas locales, TypeScript, build y render del formulario con transferencia extraordinaria, viernes y reserva de $6,000. La prueba SQL usa una sucursal temporal con $20,000, comprueba reservas, salida pendiente, protección del fondo, pago parcial, reintento sin duplicados, anulación, transferencia fuera de calendario, permiso corporativo y cierre. La excepción final PRUEBAS OK revierte todo el ensayo.

Ejecutar primero `supabase/migrations/0042_pagos_boveda.sql`, luego `supabase/pruebas/0042_pagos_boveda.sql`. No fusionar hasta validar el resultado en Supabase.
