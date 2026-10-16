# Pagos de hoy y documentos

La cabecera de Compras → Pagos muestra en grande la suma en centavos de los saldos pendientes con fecha de pago efectiva de hoy: programada, o sugerida por los días autorizados. Respeta los filtros de proveedor, sucursal y complemento. No cambia las reglas financieras ni vuelve a sumar abonos. Las obligaciones anteriores con una programación explícita en otro día no se presentan como programadas hoy.

La tabla de hoy, la del rango abierto desde Tesorería y la del día seleccionado muestran factura, proveedor/sucursal, UUID, saldo a pagar, forma prevista y documentos. El UUID manual queda identificado como pendiente de XML. PDF proveedor usa el archivo PDF subido con la factura o el último adjunto PDF confirmado. Un archivo ausente se indica sin mostrar un botón roto. XML usa la ruta de la propia factura. Las rutas verifican sesión, rol de Compras y acceso mediante RLS; generan ligas firmadas por cinco minutos, sin almacenamiento público.

PDF Dodo MX genera un PDF interno con proveedor, receptor, UUID, conceptos registrados, importes, pagos y saldo actuales. Es independiente del PDF fiscal del proveedor y lo indica en el documento. Usa pdf-lib en el servidor, admite varias páginas y se entrega inline con caché privada desactivada. Los caracteres fuera de WinAnsi se sustituyen por guion en este reporte interno para evitar errores de generación.

Todas las ligas del Excel de Tesorería incluyen desde/hasta y filtros de proveedor, sucursal y complemento. Al abrirlas se conserva el bloque de hoy y se agrega la tabla del rango exportado; el calendario abre en el mes inicial, resalta ese rango y carga las mismas fechas en el exportador. Los saldos se consultan nuevamente; no son una instantánea histórica del Excel. No se requiere migración SQL adicional.

Pruebas: permisos de documentos, archivo no existente, fuente privada y adjunto PDF, PDF multipágina, enlaces con fechas/filtros codificados, rango entre meses, campos visibles y UUID manual. El PDF de QA usa datos simulados y no forma parte de los archivos de producción.
