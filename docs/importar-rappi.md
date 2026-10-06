# Ventas Rappi desde el historial

Fuente: Portal Aliados → Historial de órdenes → detalle de cada orden. El Excel estándar solo tiene orden, fecha, pago, estado y un total; no incluye productos ni descuentos. El primer libro se construyó leyendo las dos páginas del historial, sin nombres de clientes ni repartidores. Periodo consultado 21 septiembre a 6 octubre 2026: 16 finalizadas, 20 renglones, 22 piezas; órdenes visibles del 2 al 5 octubre. No había canceladas en el filtro. No se incluyeron órdenes en progreso.

Libro de importación:
- Ordenes: ID orden completo, ID tienda, Fecha ISO, Hora HH:mm, Estado, Pago, Importe productos, Descuento restaurante, Subtotal restaurante, Descuento Rappi, Total a facturar. Fuente es opcional.
- Productos: ID orden, Renglon, Producto, Opciones, Cantidad, Importe renglon. El importe incluye toda la cantidad del renglón y las opciones; no multiplicarlo nuevamente. Un renglón de 2 Pepperoni por $378 es cantidad 2, importe 378.
- Resumen se ignora al importar. Se validan sumas de productos y ambas relaciones de descuentos. Se conserva un combo como producto propio con su selección, sin inventar sus componentes.

Ventas → Importar → Importar historial de Rappi, o Ventas → Rappi. Admin elige sucursal, revisa y confirma. El servidor vuelve a leer el archivo. La tienda queda ligada a esa sucursal; los IDs completos impiden duplicados y una reimportación actualiza solo las órdenes incluidas. No reemplaza días de Dodo IS ni borra órdenes ausentes del archivo.

La base para sumar es Subtotal restaurante, antes del descuento Rappi. Se conserva el total sugerido a facturar como otro dato; no se interpreta como una liquidación o depósito. En el primer libro: bruto $3,598, descuento restaurante $1,020, subtotal $2,578, descuento Rappi $400, sugerido a facturar $2,178. El usuario debe revisar la liquidación del subsidio de Rappi por separado. Se aplica el mismo tratamiento de IVA incluido de 16% que el resto del módulo de ventas, sobre el subtotal elegido.

Solo Finalizado y fuente Rappi suman. Se incluyen en tablero, calendario, reportes, pedidos, P&L, regalías y comisión Rappi vigente; no generan efectivo del restaurante ni comisión dLocal/NetPay. Los pagos del reporte describen cómo pagó el cliente a Rappi. Productos sin equivalencia quedan sin categoría y costo; admin vincula cada producto y opciones al SKU de Dodo IS y se aplica su costo vigente por fecha. Los combos requieren una equivalencia que cubra el combo completo.

Cuando una orden ya aparezca en Dodo IS se cambia su fuente a Dodo IS (por orden o por periodo). Conserva historial y deja de sumarse desde Rappi; reimportar no restablece la fuente. No hay conciliación automática por ID entre ambas plataformas mientras no esté disponible esa relación. P&L avisa cuando hay agregador Dodo y órdenes Rappi para el mismo día.

Antes de fusionar: ejecutar migración 0032 y su prueba en Supabase; PRUEBAS OK es un error intencional que revierte los datos de prueba. Requiere admin y corporativo activos y sucursal. Los permisos dejan lectura según el rol y sucursal; todas las mutaciones pasan por RPC de admin.
