# Precio unitario de compras a cuatro decimales

Aplicar 0072 y sus pruebas antes de publicar. Se amplían orden_renglones, precios_proveedor y recepciones_dodo de numeric(12,2) a numeric(14,4), manteniendo capacidad entera. La vista dependiente se recrea con definición y permisos anteriores y security_invoker. Sin CASCADE; cualquier dependencia inesperada aborta la transacción.

La captura conserva hasta cuatro decimales (redondea solo lo que exceda cuatro). Cotizaciones, último precio, importación de recepciones, comparativo y precios de artículos/facturas muestran cuatro decimales. Importes e IVA por renglón y totales conservan centavos; no cambia el método de impuestos ni XML originales. Los precios históricos ya redondeados no se pueden reconstruir: requieren corrección desde la fuente. No recalcula documentos existentes.
