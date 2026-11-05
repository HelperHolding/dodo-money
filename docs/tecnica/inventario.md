# Inventario

Grupo **Inventario** del menú (admin y corporativo).

## Insumos Dodo IS (`/inventario`)

Se lee en vivo `GET /dodopizza/mx/accounting/inventory-stocks` ("Warehouse balances") con `includeUnconfirmed=true`; no se guarda en la base.
Por omisión consulta la sucursal del usuario. La opción "Todas" consulta hasta 30 sucursales ligadas.
Cada insumo muestra existencia, valor (`balanceInMoney`), consumo diario promedio (5 días entre semana + 2 de fin de semana) y días que alcanza.
Se marca cuando alcanza para 2 días o menos y tiene consumo. "Estimado" = `isConfirmed=false` (sin revisión de inventario que lo confirme).
Dodo IS excluye insumos sin saldo en 60 días o si el cálculo no corrió en los últimos 90 minutos.

Docs: https://docs.dodois.io/docs/english-documentation/u4g3vpceyccao-accounting-warehouse-balances

## Uniformes (`/inventario/uniformes`)

Tabla `inventario_articulos` (migración 20261105180000). La carga inicial viene del resumen de Zoho de Nueva Comercializadora The Coffee al 05/11/2026: 11 artículos y 89 piezas.
Solo admin ajusta, con `ajustar_inventario(sku, cantidad, nota)`. Cada cambio queda en `inventario_movimientos` con la cantidad anterior, la nueva, la nota y quién lo hizo.
Se marcan los artículos con 4 piezas o menos.
