# Traspasos para conciliación de inventarios

La consulta antigua `/dodopizza/mx/accounting/stock-transfers` devolvió 200, lista vacía y fin de lista para La Calma el 23/10/2026. Está marcada como obsoleta; no concluir que no hubo traspasos a partir de esa respuesta.

La documentación vigente dirige a `/accounting/stock-transfer/transfer-items`, servicio raíz sin `/dodopizza/mx`. Usa el scope existente `accounting:read` y roles Division administrator o Store Manager.

Fuente: https://docs.dodois.io/docs/accounting/57f99fdb0c05b-peremeshheniya-poziczii-peremeshhenij

Consulta administrativa de solo lectura:

`/api/dodois/explorar?ruta=/accounting/stock-transfer/transfer-items&skip=0&take=1000`

Este servicio no filtra mediante `from/to`; admite filtros distintos de envío, recepción, creación y modificación en UTC. El explorador rechaza `desde/hasta` en esta ruta para no simular un filtro que no se aplica. Recorrer todas las páginas de las unidades ligadas hasta `isEndOfListReached=true`, incrementando skip según el número de renglones recibidos. Un documento puede partirse entre páginas.

Para el cruce semanal, separar entradas recibidas en La Calma por `destinationUnitId`, `receivedAtLocal` y `receivedQuantity`; salidas por `originUnitId`, `shippedAtLocal` y `shippedQuantity`. No usar fecha de solicitud, fecha de migración al servicio, cantidad ordenada ni registros cancelados como movimiento físico. Conservar documentos en tránsito por separado y revisar estados desconocidos. Identificar posiciones por `transferOrderItemId` y agrupar documentos por `transferOrderId`.

Cruce preliminar del 12–18: inventarios terminados el 12 a las 04:37:43 y el 19 a las 05:57:47, 73 insumos en cada uno. Confirmar zona y límites operativos antes de tratarlos como apertura/cierre definitivos. Sumar ubicaciones dentro de cada revisión y convertir gramos a kilos y mililitros a litros. No convertir automáticamente Pepperoni, que viene en Quantity.

Las cantidades producidas de semielaborados son entradas internas; los consumos de Production son salidas de sus ingredientes. No sumar ambos costos como gasto, pues duplicaría el costo. Chimichurri aparece producido por 550 kg, con aceite y perejil anómalos. Las diferencias no se califican como merma ni se llevan al P&L hasta conciliar movimientos, unidades, bajas/devoluciones y valuación.
