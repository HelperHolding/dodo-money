# Recepción real desde la orden

0049 requiere 0048. El admin registra entregas desde el encabezado de una orden confirmada, incluidos consumibles y fechas anteriores a la captura de la orden. Fecha real separada de recibido_en/recibido_por; nota obligatoria y lote idempotente. Se valida cada cantidad contra lo pendiente, sin cambiar precios, pagos ni P&L. No registra inventario en Dodo IS.

La importación posterior con sucursal/insumo/fecha coincidentes se mantiene pendiente para revisión. En Recepciones, Conciliar con recepción manual vincula ambas fuentes. Las claves naturales sobreviven a la reimportación. El recibido suma ambas fuentes y resta únicamente la cantidad solapada explícitamente conciliada; si falta el importado conserva la captura original. Los artículos sin identificador Dodo necesitan selección manual de la entrega importada. La clasificación directa rechaza coincidencias manuales no conciliadas.

Programar entrega corrige una expresión regular que había perdido las barras de dígitos y rechazaba todas las fechas.

Correr migración y prueba 0049 en SQL Editor. La prueba se revierte por excepción PRUEBAS OK. Pendiente verificación real de Supabase y navegador autenticado. Las pruebas anteriores de recepción, pagos y seguridad deben mantenerse válidas.
