# Corregir sucursal de una orden recibida

Requiere ejecutar la migración 0069 y su ensayo reversible antes de publicar la aplicación.

Administración abre una orden confirmada o cerrada y usa «Corregir sucursal». Se elige destino y motivo. La orden completa cambia de destino, incluidas sus recepciones capturadas en Dodo MX, que toman la sucursal de la orden. No se actualizan cantidades, fechas, archivos, autores, importes ni estados. No se registra un traspaso físico ni se modifica Dodo IS.

Las facturas vigentes vinculadas exclusivamente a esta orden se corrigen juntas. Se detiene toda la operación cuando hay pagos o reservas vigentes, facturas compartidas con otras órdenes, recepciones directas de factura, sustituciones, complementos o CFDI relacionados. Las recepciones importadas o conciliadas con Dodo IS requieren revisar su vínculo antes de corregir; se conserva intacta la sucursal del reporte original. La razón social debe admitir el destino.

La RPC valida permisos, estado, sucursal anterior, motivo y destino; bloquea escrituras concurrentes en las ligas y recepciones durante la corrección. Usa solicitud idempotente y conserva sucursal anterior/nueva, usuario, motivo, facturas afectadas y copia de las recepciones previas. Genera un evento de orden y notas en las facturas; corporativo consulta. La tabla de auditoría no permite escritura directa por usuarios autenticados y anónimo no puede ejecutar la función.

El ensayo SQL termina con PRUEBAS OK mediante una excepción para revertir todos los registros de prueba. No debe presentarse como ejecutado hasta que se corra en Supabase.
