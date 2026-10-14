# Conversión de prefactura a CFDI

0060 requiere 0059 y anteriores. El botón «Convertir con XML» aparece en el encabezado de una prefactura de ingreso vigente para administración. Corporativo consulta el resultado y sus conceptos fiscales. Se recibe XML CFDI 3.3/4.0 en MXN, hasta 4 MB; no se verifican sellos criptográficos ni estatus SAT en línea.

La preparación guarda una reserva privada con snapshot completo de la factura, sus conceptos, JSON fiscal, hash, motivo, autor y ruta única. Se sube el XML al bucket privado facturas, sin sobrescribir. Luego aparece la vista previa. Solo confirmar cambia origen, identidad fiscal, fecha de emisión y método/forma fiscal del documento. No registra pago; la forma fiscal no reemplaza la forma real del pago ni su programación.

Se mantiene el mismo factura_id: no se crea ni cancela una factura alternativa, no se transfieren pagos o recepciones. Conserva subtotal, descuento, IVA, retenciones, total, saldos, estado, vencimiento, sucursal, cuentas, períodos, programación, reservas, adjuntos y notas. Cada importe fiscal debe coincidir a centavos con el existente; si difiere se requiere revisar la diferencia antes de este flujo. No hay corrección automática de importes en esta entrega.

Los conceptos operativos se conservan, incluidos IDs referidos por recepciones; los conceptos fiscales se consultan como referencia en Documentos relacionados y en el XML, sin sumar una compra adicional. Original y conceptos originales quedan conservados en prefactura_conversiones. Solo hay una conversión confirmada por factura. La nota registra UUID, referencia original y motivo.

Confirmación bloquea reserva y factura, compara snapshot para evitar aplicar una vista previa sobre un documento modificado, comprueba presencia/tamaño/MIME del XML, vuelve a verificar UUID único y es idempotente. La reserva expira en 24 horas; fallos o vistas previas abandonadas pueden dejar archivos privados pendientes, sin convertir la factura. El bucket utiliza los permisos de Compras existentes. La comparación completa detecta cambios de la factura y de conceptos; no impide registrar nuevos pagos entre vista previa y confirmación, pues no altera montos ni aplicaciones.

Ensayo SQL reversible con objeto Storage simulado. Falta confirmar carga y descarga real después de publicación. No ejecutar escrituras directas en tablas de producción para probar.
