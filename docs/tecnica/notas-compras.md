# Historial lateral y notas de compras

Facturas y órdenes muestran Historial y notas a la derecha; en móvil queda debajo. La línea de tiempo mezcla notas internas con los eventos que ya existen. Las notas se agregan desde administración, también en documentos cerrados o cancelados; corporativo consulta. No se editan ni borran y no modifican estado, importe ni programación.

0053 crea compra_notas con vínculo exclusivo a factura u orden, autor y fecha. RLS limita consulta a Compras y la RPC exige administración. La solicitud UUID evita duplicados por doble envío y no permite reutilizar la solicitud para otro contenido o documento. No hay escritura directa desde authenticated ni ejecución anónima.

Las facturas muestran creación, última revisión disponible, programación, pagos y anulaciones, cancelación y notas. Las órdenes conservan su historial existente. Los cambios antiguos de cuenta y periodo no tenían un registro de eventos y no se reconstruyen. La última revisión de factura no se presenta como historial de todas las revisiones.

Verificación local: TypeScript, 449 pruebas, renderizado SSR de ambas fichas. La prueba SQL 0053 requiere validación en Supabase. No se ha verificado visualmente en navegador.
