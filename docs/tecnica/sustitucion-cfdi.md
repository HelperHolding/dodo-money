# Sustituir el CFDI de una factura

Migración `20261106120000_sustituir_cfdi_factura.sql`. Requiere 0060, 0067, 0068 y 0070. Prueba SQL en `supabase/pruebas/` con el mismo nombre; termina en «PRUEBAS OK» y revierte todo.

Sirve cuando el proveedor cancela un CFDI ya registrado y timbra otro para la misma compra. Ejemplo: Frutigo reemplazó los folios 3077, 3079 y 3081 por 3089, 3088 y 3090. El botón «Sustituir CFDI» aparece en la ficha de una factura de ingreso con CFDI, vigente y no sustituida. Solo lo ve administración; las RPC exigen `exigir_admin_compras`.

## Flujo

Funciona igual que «Convertir con XML» (ver [cfdi-prefactura.md](cfdi-prefactura.md)). Primero `preparar_sustitucion_cfdi` valida el XML, guarda una reserva en `cfdi_sustituciones` con la copia completa de la factura y devuelve las rutas. La app sube el XML y, si se elige, el PDF al bucket `facturas` bajo `sustituciones/<factura>/<solicitud>`, sin sobrescribir nada. La vista previa muestra el folio anterior y el nuevo, los importes, lo pagado y los avisos. Después `confirmar_sustitucion_cfdi` revisa que la factura no haya cambiado, que los archivos estén subidos y que el UUID siga libre. Repetir la confirmación no hace nada nuevo. La reserva vence en 24 horas.

## Validaciones

- CFDI de ingreso 3.3 o 4.0, en MXN, con conceptos, fecha y método PUE/PPD.
- El RFC receptor debe ser la razón social de la factura, válida para su sucursal. El emisor debe ser el RFC del proveedor de la factura.
- El UUID nuevo debe ser distinto del actual. No puede estar en otra factura, ni como UUID de XML ni como manual, ni haber sido sustituido antes.
- Si el XML trae `CfdiRelacionados`, el UUID actual debe estar entre ellos. Si no trae ninguno, solo se muestra un aviso, porque los XML de Frutigo no los incluyen.
- Una nota de crédito vigente ligada al UUID actual bloquea la sustitución. Su `uuid_relacionado` es un dato fiscal y la nota quedaría suelta.
- **Total distinto:** se aplica el mismo criterio que en 0067. Se muestran las diferencias y hay que marcar «Acepto corregir los importes con el XML». El saldo y el estado se recalculan sin tocar los pagos. Si lo pagado supera el nuevo total, solo se avisa.

## Qué cambia y qué se conserva

Cambian UUID, serie, folio, fecha de emisión, nombre y régimen del emisor, método y forma de pago, `xml_ruta`, `pdf_ruta` (vacía si no se sube PDF) e importes. Se limpia `uuid_manual`.

Se conserva el mismo `factura_id` con pagos, reservas, órdenes, recepciones, conceptos y cuentas, además de sucursal, periodo, vencimiento, programación, adjuntos y notas.

`cfdi_sustituciones` guarda para auditoría el UUID anterior, la factura completa anterior (`original`, que incluye `xml_ruta` y `pdf_ruta` viejos), el CFDI nuevo, el motivo, el autor y las fechas. Los archivos viejos no se borran. La ficha muestra la sección «CFDI anteriores», con enlaces al XML y PDF anteriores, y queda una nota en el historial de la compra.

Un trigger (`validar_uuid_sustituido`) impide registrar de nuevo como factura un UUID ya sustituido, por ejemplo si alguien vuelve a subir el XML viejo.

## Complementos de pago (REP)

`complemento_facturas` se liga por UUID. Los REP del UUID anterior se conservan, pero ya no cubren la factura. La vista previa y la nota indican cuántos son y por qué monto. En una factura PPD, «falta complemento» se marca hasta subir un REP que cite el UUID nuevo por el flujo normal de Pagos → Complementos, y ese REP queda ligado solo.

## Pendiente

- Correr la migración y la prueba en Supabase producción.
- Probar la subida real al bucket después de publicar.
- No se consulta el estatus del SAT. Que el CFDI anterior esté cancelado se confirma con el proveedor.
