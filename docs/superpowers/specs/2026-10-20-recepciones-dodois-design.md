# Recepciones de insumos desde la API de Dodo IS (diseño)

**Fecha:** 2026-10-20 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Las recepciones de insumos que la sucursal captura en Dodo IS llegan solas a Compras, entrega por entrega, con su
proveedor, su número de factura y sus importes. Se ligan con más precisión a la orden de compra (ahora también por
proveedor) y, cuando el folio coincide, a la factura. Reemplazan la importación del Excel "Incoming supplies".

**Éxito:** Compras → Recepciones muestra cada entrega de Dodo IS de los últimos días sin importar nada; la mayoría
queda ligada sola a su orden; las que traen un folio que existe en Facturas quedan ligadas a esa factura; un precio
distinto al de la orden se ve en ámbar; lo ya revisado a mano con el Excel no se pierde.

## 2. Lo que trae la API (prueba del 2026-10-20)

`GET https://api.dodois.com/dodopizza/mx/accounting/incoming-stock-items?units=…&from=…&to=…` →
`{ incomingStockItems, isEndOfListReached }`. Del 21/09 al 20/10: 65 renglones, 29 entregas, 12 proveedores, 45 insumos.

Por renglón: `incomingStockOrderId` (la entrega), `stockItemId` / `stockItemName`, `quantity`, `measurementUnit`
(Kilogram, Quantity), `totalPriceWithoutVat`, `totalPriceWithVat`, `vatRate` (16, 0), `vatValue`, `supplierId`
(ID de Dodo, sin nombre ni RFC), `suppliedAtLocal`, `invoiceNumber` (texto libre), `invoiceDate`,
`incomingStockOrderModifiedAt`.

## 3. Decisiones

| Tema | Decisión |
|---|---|
| Qué se trae | Solo insumos (lo único que se da de alta en Dodo IS); lo demás se sigue recibiendo en la app |
| Unidad | Un renglón por entrega e insumo (`incomingStockOrderId` + `stockItemId`), no uno por día |
| Frecuencia | Con la misma sincronización de ventas: cada 15 min los últimos 7 días; a las 3 a.m. los últimos 31 |
| Desde cuándo | Desde el 21/09 (apertura): la primera sincronización trae todo y reemplaza lo importado del Excel |
| Proveedor | Se liga cada proveedor de Dodo con uno de la cartera una sola vez (`proveedores.dodois_supplier_id`); mientras no esté ligado, sus recepciones quedan "pendiente de ligar proveedor" |
| Insumo | Por `articulos.dodo_insumo_id` (como hoy); sin artículo ligado → pendiente |
| Liga a la orden | Orden confirmada del **mismo proveedor**, sucursal e insumo, recibida entre la confirmación y +7 días, con cantidad pendiente; la más antigua primero (hoy no se usa el proveedor) |
| Liga a la factura | Factura de ingreso no cancelada del mismo proveedor cuyo folio (serie+folio) coincide con el número de factura normalizado (mayúsculas, sin espacios ni signos, sin ceros a la izquierda) y fecha de emisión a ±15 días; si hay más de una o ninguna, queda sin factura |
| Precio | Precio unitario sin IVA = importe sin IVA ÷ cantidad; si difiere más de 1 % del precio de la orden, se marca en ámbar |
| Lo revisado a mano | Al reemplazar lo del Excel, la clasificación manual (sin orden, traspaso, orden elegida a mano) y las conciliaciones con recepciones de la app pasan a las entregas de la API del mismo día, sucursal e insumo cuando hay una sola entrega ese día; si hay varias, quedan pendientes y se avisa |
| Entrega borrada en Dodo | Si una entrega de los días consultados ya no viene en la API, se quita (y su liga) |
| Excel | La importación queda como respaldo: un día que ya tiene recepciones de la API no se reemplaza con el Excel |
| Costos | Fuera de alcance: el precio de recepción no cambia los costos de receta (siguen del Excel de UC México) |

## 4. Base de datos (migración nueva)

- `proveedores.dodois_supplier_id text unique`.
- `recepciones_dodo` gana: `fuente` (`excel` | `api`), `dodo_documento_id`, `dodo_proveedor_id`, `proveedor_id`,
  `recibido_en timestamptz`, `factura_texto`, `factura_fecha`, `importe_sin_iva`, `importe_con_iva`, `tasa_iva`,
  `factura_id` (FK facturas), `modificado_dodo`. `importacion_id` pasa a opcional (la API no tiene archivo).
  La unicidad `(sucursal_id, dodo_insumo_id, fecha)` queda solo para `fuente = 'excel'`; para la API,
  `unique (dodo_documento_id, dodo_insumo_id)`.
- `sincronizar_recepciones_dodo(p_sucursal uuid, p_desde date, p_hasta date, p_renglones jsonb) → jsonb`: solo
  `service_role`; con bloqueo por sucursal; guarda o actualiza por (documento, insumo); quita las entregas de la API de
  esos días que ya no vienen; la primera vez que un día trae API, borra las filas del Excel de ese día y pasa su
  clasificación manual según la regla de la tabla; liga proveedor, orden y factura; devuelve cuántas guardó, ligó y
  quedaron pendientes.
- `ligar_proveedor_dodois(p_proveedor uuid, p_supplier text)` (admin de compras): al ligar, vuelve a correr la liga
  de las recepciones pendientes de ese proveedor.
- `ligar_recepciones_dodo()` se amplía: para filas de la API exige el proveedor de la orden.
- `importar_recepciones_dodo` deja intactos los días que ya tienen filas `api`.
- `dodois_sincronizaciones` gana `tipo` (`ventas` | `recepciones`).

## 5. Arquitectura

- `lib/dodois/recepciones.ts` (puro, con pruebas): `traducirRecepciones` (API → renglones con precio unitario, IVA,
  fecha local, ids en mayúsculas), `folioNormalizado`, `ventanaRecepciones(origen, fecha)`.
- `app/ventas/dodois/sincronizar.ts`: después de las ventas, trae las recepciones de cada sucursal ligada y llama a la
  función; registra en `dodois_sincronizaciones` con `tipo = 'recepciones'`.
- Compras → Recepciones: las entregas de la API agrupadas por entrega (fecha y hora, proveedor, folio, factura ligada,
  importe), con sus renglones, la orden ligada y el aviso de precio; la sección "Proveedores de Dodo IS sin ligar"
  (ID, insumos y folios de ejemplo, selector de proveedor de la cartera); la importación de Excel pasa a "Respaldo".
- Detalle de factura: "Recepciones de Dodo IS" ligadas, con el total recibido frente al facturado (informativo).
- Ventas → Dodo IS: el registro muestra si la sincronización fue de ventas o de recepciones.

## 6. Pruebas

- Node: traducción de renglones reales (precio unitario, IVA 0 y 16 %, fecha local, unidades), folio normalizado
  (`Aa1657629` = `AA1657629`, `0002` = `2`, "30 de septiembre 2026" no coincide con nada), ventanas de 7 y 31 días.
- SQL: solo `service_role` sincroniza; guarda por entrega sin duplicar; quita entregas borradas; reemplaza el Excel del
  día pasando la clasificación manual con una sola entrega y dejándola pendiente con varias; liga orden solo del mismo
  proveedor; liga factura por folio y no con folios ambiguos; el Excel no pisa un día con API; ligar un proveedor
  vuelve a ligar sus pendientes.
- Vista previa de Recepciones en computadora y celular (en producción si el entorno local no tiene Supabase).
