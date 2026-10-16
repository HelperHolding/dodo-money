# Razones sociales del grupo en Compras (0068)

Los mismos usuarios y permisos de Compras gestionan todas las razones sociales: no se crean tenants independientes. La empresa principal conserva su RFC y configuración; no se reasigna el histórico. SITRU (CMS230321FI8) se registra exclusivamente para Zapopan-1, según confirmación del usuario; domicilio, régimen y correo quedan sin inventar.

El XML determina el receptor. Una secundaria con una sola sucursal se asigna a esa sucursal; si tiene varias se usa la sucursal por omisión del proveedor y se valida su autorización. Una factura de una razón social no puede ligarse a órdenes, sustituir prefacturas, recibir notas de crédito ni complementos de otra. La conversión 0067 valida contra el receptor de la propia prefactura y conserva sus importes originales. UUID sigue siendo único en todo el grupo. Una orden alternativa conserva empresa y facturar una orden hereda el receptor.

Las nuevas cotizaciones y prefacturas incluyen selector de empresa. El PDF de orden usa la empresa del documento. Compras permite filtrar y buscar por razón social o RFC; no cambia los totales ni duplica filas. Las razones se consultan y dan de alta en /compras/razones-sociales; altas con motivo, sucursales, autor e historial, idempotentes sin sobrescritura. Las tablas del catálogo solo permiten consulta autenticada de Compras, la gestión requiere admin y los helpers son privados.

Caja, ventas, nómina, activos y P&L operativo siguen por sucursal. Esto es multiempresa fiscal en Compras, no separación de balances o tesorerías de cada razón social. Los usuarios del grupo conservan su alcance. Los días recomendados de pago continúan en la configuración principal. Un pago del grupo puede cubrir facturas de diferentes razones sociales; cada aplicación sigue identificada por su factura y no se inventan transferencias intercompañía.

Primero ejecutar 0068 y sus pruebas SQL reversibles, después publicar. Las funciones heredadas se reemplazan preservando sus validaciones, sus grants y las reglas de 0067. No editar los SQL antiguos. La prueba usa rutas de ejemplo sin subir archivos reales y termina con RAISE PRUEBAS OK para revertir los fixtures. Probar en producción la carga real del XML pendiente tras publicar.

## Receptor histórico pendiente

El diagnóstico de producción encontró una prefactura del 06/10/2026, Zapopan-1, con HCM260306G93. Se conserva ese valor literal en facturas y se agrega una referencia de catálogo inactiva, etiquetada como receptor histórico pendiente de revisión. No se afirma que sea una nueva razón social legal ni se habilitan capturas con ese RFC. La corrección a B93 requiere comprobar el receptor del documento; no se infiere ni se aplica automáticamente. Cualquier otro RFC histórico desconocido continúa bloqueando la migración.
