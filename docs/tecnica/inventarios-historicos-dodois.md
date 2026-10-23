# Consulta de inventarios históricos

El explorador de Dodo IS permite consultar revisiones de inventario con el acceso existente de administrador. No importa registros ni modifica el P&L.

Consulta inicial para La Calma, del 12 al 18 de octubre de 2026:

`/api/dodois/explorar?ruta=/inventory/revisions&desde=2026-10-12&hasta=2026-10-18&skip=0&take=1000`

La ruta oficial es `/dodopizza/inventory/revisions`, sin `/mx`. Se conserva el límite de 31 días, la paginación y la selección de unidades ligadas en el servidor; no se aceptan unidades arbitrarias enviadas por el navegador. La consulta incluye el 18 y usa el 19 a las 00:00 como límite final. Si hay varias unidades ligadas, separar los resultados por el ID de Dodo IS de La Calma: `11f187558e757f53b0570d952420b810`.

Fuente de la ruta y parámetros: https://github.com/dodobrands/dodo-api-postman-collection/blob/main/dodo-is-api-postman-collection.json

Tras publicar, verificar la respuesta real y su paginación. Confirmar fechas efectivas, estado de las revisiones y significado de las cantidades antes de tratarlas como conteos físicos. Un periodo sin revisiones no equivale a inventario cero: para calcular consumo real hacen falta conteos que cubran la apertura y cierre de la semana, además de movimientos y valuación confiables.

`/accounting/inventory-stocks` devuelve existencias actuales; en la consulta del 23 de octubre devolvió `calculatedAt` del día 23 aun recibiendo fechas del 12 al 18. No usar ese saldo para reconstruir automáticamente los inventarios históricos. Los costos de Pepperoni y Alitas y las dos entradas de mozzarella del 12 siguen pendientes de conciliación.

Si Dodo responde 403, revisar los permisos exigidos por el servicio antes de solicitar un cambio de autorización. La existencia de esta ruta en el explorador no garantiza que la cuenta conectada tenga acceso a revisiones ni que existan conteos históricos.
