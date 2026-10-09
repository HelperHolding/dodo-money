# Recepción directa de factura sin orden

0054 agrega factura_recepciones: lote con fecha real, conceptos y cantidades, motivo, autor y marcas de anulación. Admin registra/anula; corporativo consulta; tablas sin escritura directa. Función bloquea factura, verifica conceptos, pendientes y solicitud idempotente. No requiere pago ni crea orden; ingreso no cancelado y sin órdenes vinculadas.

La ficha muestra recepción parcial/completa, historial y anulación con motivo. Lista de Compras hereda etiqueta desde conceptos recibidos; calendario muestra entregas por fecha real y enlace a factura. Cantidades son las unidades declaradas por XML; no convierten cajas en piezas. No mueve dinero, cambia P&L ni modifica inventario de Dodo IS.

Recepción activa bloquea cambiar cantidades/conceptos, vincular orden, cancelar factura o cambiar sucursal. Anular libera cantidades conservando lote e historial. Conciliación automática con posteriores reportes Dodo IS no forma parte de este flujo; el reporte importado se conserva en su fuente, sin sumarlo a las cantidades de esta factura.

Aplicar migración, ejecutar ensayo reversible 0054 y confirmar PRUEBAS OK antes de publicar la interfaz. Las pruebas locales no ejecutan SQL contra Supabase.
