# Retirar adjuntos de compras

Aplicar migración 0071 y ejecutar sus pruebas antes de publicar. La excepción PRUEBAS OK revierte la prueba completa.

Administración puede retirar soportes de órdenes/cotizaciones y facturas/prefacturas desde Adjuntos, con motivo y confirmación. Se conserva el archivo y metadata para auditoría; el retiro es lógico, no borra el documento financiero ni sus XML/PDF originales. Corporativo consulta y no retira.

RLS oculta el adjunto retirado y bloquea su descarga en Storage. Pagos excluye los PDF retirados de su respaldo alternativo. Una URL firmada emitida antes del retiro puede seguir vigente hasta su vencimiento (300 segundos). El historial conserva nombre, motivo, autor y fecha. Los reintentos idénticos no duplican el historial.

Pagos usa columnas en contenedores amplios y campos etiquetados en dos o una columnas en espacios reducidos. Verificado a 1100, 720 y 360 px sin overflow horizontal.
