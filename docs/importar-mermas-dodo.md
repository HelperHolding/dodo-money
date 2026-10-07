# Importación de mermas Dodo IS

Ruta: Finanzas → Mermas Dodo IS. Admin importa; corporativo consulta. Los productos terminados con costo conocido alimentan el P&L; los insumos quedan pendientes hasta separar la merma incluida en el BOM.

En Dodo IS usar Gestión de inventario → Bajas → Excel: por días, todas las siete razones y sin IVA. El archivo incluye insumos y pérdida del producto terminado. La sucursal se identifica por un nombre único coincidente con el catálogo de la app.

Revisar archivo muestra cada día, cantidades de productos, renglones de insumos, costos separados y renglones sin costo. Confirmar reenvía el archivo original y el servidor lo vuelve a leer y verifica su SHA-256. No se confía en renglones proporcionados por el navegador.

La RPC reemplaza todos los renglones de los días y sucursales incluidos, incluso días sin mermas; conserva el resto. Guarda archivo, huella, usuario, fecha de importación y periodo de origen por día. Los bloqueos transaccionales serializan importaciones que coinciden. La base impide escritura directa y solo autoriza la RPC a administradores activos.

El costo de insumos viene para todo el periodo: se reparte proporcionalmente a la cantidad por día, conservando centavos y usando el importe del Excel, no el precio unitario redondeado. Los productos se agrupan por nombre y día; renglones repetidos son bajas legítimas que se suman. Se muestran por separado y no se suman al costo de insumos.

Se rechazan reportes parciales por razones, con IVA, por motivos, días inconsistentes, sucursales ambiguas, fechas futuras, cantidades negativas o que no coincidan con el total y hojas desconocidas. Insumos con costo cero se conservan para revisión. El archivo original no se guarda en Storage.

Antes de fusionar: ejecutar 0031_mermas_dodo.sql de migrations y luego su prueba de supabase/pruebas. El error intencional PRUEBAS OK revierte los datos de prueba. Requiere un admin activo, corporativo activo y sucursal. La comprobación local no sustituye esta prueba en Supabase.

La integración al P&L y la cobertura de la hoja de productos se documentan en `docs/mermas-pl.md`: productos terminados con costo conocido entran; insumos pendientes quedan fuera.
