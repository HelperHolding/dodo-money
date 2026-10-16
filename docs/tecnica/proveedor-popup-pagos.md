# Datos del proveedor en Pagos

Cada factura de las tablas de hoy, rango y calendario tiene el botón «Datos del proveedor». El diálogo consulta al abrirse razón social, RFC, banco, CLABE, cuenta y contacto, sin datos de portales ni contraseñas. Puede abrirse la ficha completa para cambios.

Muestra los tres tipos documentales existentes: constancia fiscal, opinión de cumplimiento y carátula bancaria. Usa la misma selección de versión vigente que la ficha del proveedor (fecha del documento y fecha de subida). No afirma vigencia fiscal ni exige cargar documentos faltantes. Indica archivos ausentes o no disponibles; los PDF y las imágenes pueden verse en el diálogo o abrirse aparte.

GET /compras/proveedores/[id]/resumen exige sesión, permisos de Compras y RLS. No usa service_role, no devuelve las rutas privadas originales ni datos de acceso. Las URLs firmadas duran cinco minutos y se regeneran en cada apertura. Respuesta y fetch sin caché; se cancelan las solicitudes al cerrar el diálogo o desmontar el componente. El diálogo nativo admite Escape y devuelve el foco al botón.

No requiere migración SQL ni modifica datos. Hay pruebas de permisos, selección de la última versión, faltantes, firma no disponible y presencia del botón en la tabla.
