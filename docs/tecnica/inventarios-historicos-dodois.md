# Consulta de inventarios históricos

El explorador de Dodo IS permite consultar revisiones de inventario con el acceso existente de administrador. No importa registros ni modifica el P&L.

Consulta inicial para La Calma, del 12 al 18 de octubre de 2026:

`/api/dodois/explorar?ruta=/inventory/revisions&desde=2026-10-12&hasta=2026-10-18&skip=0&take=1000`

La ruta oficial es `/dodopizza/inventory/revisions`, sin `/mx`. Revisiones admite hasta 14 días, 10 unidades y 1000 registros por página. Se conserva la selección de unidades ligadas en el servidor; no se aceptan unidades arbitrarias enviadas por el navegador. La consulta incluye el 18 y usa el 19 a las 00:00 como límite final. Si hay varias unidades ligadas, separar los resultados por el ID de Dodo IS de La Calma: `11f187558e757f53b0570d952420b810`.

Fuente de la ruta y parámetros: https://github.com/dodobrands/dodo-api-postman-collection/blob/main/dodo-is-api-postman-collection.json

Tras publicar, verificar la respuesta real y su paginación. Confirmar fechas efectivas, estado de las revisiones y significado de las cantidades antes de tratarlas como conteos físicos. Un periodo sin revisiones no equivale a inventario cero: para calcular consumo real hacen falta conteos que cubran la apertura y cierre de la semana, además de movimientos y valuación confiables.

`/accounting/inventory-stocks` devuelve existencias actuales; en la consulta del 23 de octubre devolvió `calculatedAt` del día 23 aun recibiendo fechas del 12 al 18. No usar ese saldo para reconstruir automáticamente los inventarios históricos. Los costos de Pepperoni y Alitas y las dos entradas de mozzarella del 12 siguen pendientes de conciliación.

## Autorización y diagnóstico del 401

Referencia oficial revisada el 23/10/2026: https://docs.dodois.io/docs/Inventory/4a55fc95adac8-uchet-revizii

La sección Security exige el scope OAuth `accounting`; `accounting:read` no es el scope documentado para este servicio. Los roles permitidos son Division administrator o Store Manager. No confundir el rol admin de Dodo MX con los roles de Dodo IS.

El 23/10 la conexión existente devolvió 200 para recepciones y 401 sin cuerpo para revisiones. El scope faltante es una explicación consistente con la documentación, pero su corrección solo queda confirmada con una nueva consulta autorizada.

Después de publicar el cambio de scopes:

1. Revisar en el panel del desarrollador de Dodo que la aplicación pueda solicitar `accounting`. Si no está disponible o devuelve `invalid_scope`, pedir habilitación a soporte; no sustituirlo por `inventory.admin` ni conceder permisos ajenos.
2. El usuario debe revisar y aceptar la ampliación de autorización al usar Reconectar en Ventas → Dodo IS, con una cuenta que tenga uno de los roles permitidos y acceso a La Calma. No solicitar ni copiar tokens o contraseñas por chat. Renovar el token anterior no sustituye este nuevo consentimiento.
3. Repetir la consulta de la semana y paginar hasta `isEndOfListReached=true`. Si persiste el 401 o aparece 403, confirmar scopes concedidos y roles/unidad con Dodo. No registrar ausencia de revisiones como inventario cero.

`accounting` es un permiso distinto del existente `accounting:read`; no asumir que su alcance es solo lectura. El explorador de Dodo MX sigue limitado a GET para administrador y este cambio no ejecuta escrituras de inventario. La ampliación no se activa simplemente al publicar: depende de la nueva autorización.

La respuesta contiene revisiones terminadas (`finishedAt`), periodicidad y cantidades por insumo, con correcciones. Un mismo insumo puede repetirse por ubicación: sumar sus renglones dentro de la misma revisión, sin unir revisiones de fechas distintas. Revisar las correcciones y su fecha antes de usarlas como conteos históricos de cierre.
