# Compras y facturas

La entrada del menú es `/compras/documentos`, con lista predeterminada y tarjetas opcionales. Las rutas anteriores siguen disponibles y regresan a esta pantalla.

## Etapas

- Cotización: orden en borrador o enviada.
- Orden de compra: confirmada o cerrada.
- Factura: documento capturado directamente o vinculado a una orden.

Las etapas se derivan del estado existente; no obligan a pasar por todas. Las acciones de confirmar, crear factura, recibir y pagar siguen en el detalle del documento.

Una factura vigente de ingreso sustituye la fila de su orden en la lista y muestra enlaces a las órdenes originales. Varias facturas de una orden permanecen como documentos separados. Las notas de crédito y facturas canceladas no ocultan la orden. Canceladas y sustituidas se consultan con el filtro correspondiente.

La consulta respeta los permisos existentes de Supabase y usa paginación para recuperar documentos, vínculos y renglones. No agrega tablas, estados ni migraciones.

## Presentación y comprobación

Etapas y estados usan texto además del color: cotización ámbar, orden azul, factura violeta, pagada/cerrada verde y cancelada gris. Las facturas vencidas tienen una etiqueta roja. Los filtros incluyen búsqueda, proveedor, sucursal, etapa y estado; se conservan al cambiar de vista.

`lib/compras/documentosCompra.test.ts` comprueba etapas, vínculos, múltiples facturas, cancelaciones, notas de crédito, capturas directas y filtros. Las pruebas de menú y migas cubren las rutas anteriores. La revisión visual local utiliza datos de ejemplo; no modifica registros reales.
