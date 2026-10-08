# Documentos en el alta de proveedores

Nuevo proveedor solicita carátula bancaria y opinión de cumplimiento con fecha. Ambos son obligatorios en el formulario manual. La constancia fiscal sigue siendo opcional y permite prellenar datos fiscales. Los tres adjuntos juntos tienen un límite de 4 MB para respetar la petición de Vercel. Se aceptan PDF, JPG, PNG y WebP; la constancia requiere PDF.

Cliente y servidor validan documentos y fechas antes de insertar el proveedor. Si se adjunta constancia, el servidor verifica lectura, RFC y fecha antes del alta. Después se guardan los adjuntos en el bucket privado y como versiones de `documentos_proveedor`, con las políticas existentes. No requiere migración. La carga masiva y la edición de proveedores conservan su flujo.

Si falla almacenamiento o registro de algún documento después del alta, se abre la ficha con un error que identifica los pendientes y pide completar Documentos, sin volver a crear el proveedor. El alta y Storage no constituyen una única transacción.

## Lectura bancaria propuesta

Pendiente de muestras reales de las carátulas de los proveedores. Para PDF con texto, extraer localmente etiquetas de banco, CLABE y cuenta. El lector actual de constancias es específico del SAT y no sirve como lector general de carátulas. Fotos y PDF escaneados necesitan OCR. No enviar documentos bancarios a Anthropic como parte del chat actual.

Mostrar la propuesta junto al documento para confirmarla antes de aplicar. Validar la CLABE de 18 dígitos y su dígito verificador, conservar ceros iniciales de cuenta y CLABE, evitar confundir cuenta con tarjeta o número de cliente, y no elegir automáticamente entre varias cuentas. No reemplazar valores ya capturados sin una acción explícita. Un archivo no reconocido permite captura manual.
