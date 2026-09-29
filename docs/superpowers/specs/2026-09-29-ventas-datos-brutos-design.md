# Ventas con Datos brutos de Dodo IS

Fecha: 2026-09-29 · Estado: diseño aprobado en conversación, pendiente de revisión escrita

## Objetivo

Reemplazar la importación diaria de dos archivos (Ventas + ProductsSales) por **un solo archivo "Datos brutos"** de Dodo IS, que trae cada pedido y cada producto vendido de cualquier periodo y sucursal. Con ese detalle se agregan cuatro reportes al tablero de Ventas: venta por hora, canales, comidas del personal y cancelados, y tiempos de cocina y combos.

**Éxito:** el admin importa una semana con un archivo; los reportes actuales (tablero, costos, calendario, cierre contra Dodo IS) siguen igual, y los nuevos muestran la operación por hora y canal.

**Puente hacia la API:** Dodo IS ya dio acceso a su API (`accounting/sales`, `cancelled-sales`, `staff-meals`, `incoming-stock-items`…). Mientras se aprueban la URL de regreso y los scopes (hasta 4 días hábiles), esta etapa importa el archivo. La sincronización por API, en un diseño aparte, llenará **las mismas tablas** (`pedidos`, `pedido_productos`), así que los reportes no cambian; la importación de archivo queda como respaldo. Por eso los campos que la API podría no traer (tiempos, cliente, promoción) son opcionales.

**Fuera de esta etapa:** costos por receta con recepciones (siguiente diseño, que usará `unitCost` guardado aquí para comparar), recompra de clientes, venta por agregador (no hay pedidos de agregador todavía).

## Decisiones tomadas

1. **Primero ventas, luego costos:** dos diseños y dos entregas.
2. **Reemplazar** la importación actual. Lo ya importado se queda; reimportar esos días con Datos brutos los reemplaza y les agrega el detalle.
3. **Guardar cada pedido y cada producto** (enfoque A), y además seguir llenando `ventas_dia`, `ventas_dia_desglose` y `ventas_producto`.
4. **Los cuatro reportes nuevos** en esta etapa.
5. **No se guardan nombres de clientes**; sí el ID de cliente y su número de pedidos.

## El archivo (exportación "Datos brutos" de Dodo IS)

Un `.xlsx` con dos hojas. Se leen por nombre sin espacios sobrantes (la primera viene como `"RawData "`).

### Hoja `RawData`: un renglón por pedido

Encabezados en la fila 1 (se ubican por nombre, no por columna): `OrderId`, `Store`, `Date` (`28.09.2026`), `Time` (`21:11`), `Price` (`129.000`), `PriceWithoutDiscount`, `ProductsCount`, `PaymentType`, `Type`, `State`, `Source`, `BonusAction`, `ClientId`, `ClientName`, `OrderCount`, `ShiftId`, `Aggregator`, `TakeAway` (`1`/`0`), `StartCookingAt`, `ReadyAt`, `GivenOutAt` (`28.09.2026 21:04`, pueden venir vacíos). Las columnas `Product1…Product5` se ignoran: el detalle completo está en `OrderPositions`.

Valores vistos (21–28/09/2026, Zapopan-1, 334 pedidos):

| Campo | Valores |
|---|---|
| `State` | `OnDelivery` (325), `Failure` (9) |
| `PaymentType` | `Cash`, `BankCard`, `InternetAcquiring` |
| `Type` | `Stationary` (303), `PersonalFood` (29), `Delivery` (2) |
| `Source` | `Restaurant`, `Kiosk`, `Mobile`, `Site`, `Pizzeria` (solo en `PersonalFood`) |
| `BonusAction` | vacío o `Training promo` (46 pedidos del 21/09) |

### Hoja `OrderPositions`: un renglón por producto vendido

`OrderId`, `ProductUUId`, `Product` (`Pepperoni`), `ProductSize` (`Mediano`), `productPrice`, `ProductPriceWithoutDiscount`, `unitCost`, `ComboUUId`, `Combo` (`El de Siempre`), `Ingr1…Ingr3` y sus precios (vacíos en el ejemplo; se ignoran), `BonusActionUUId`. `ProductUUId` es distinto por producto y tamaño.

### Reglas

- **Venta** = pedidos con `State = OnDelivery` y `Type ≠ PersonalFood`. Los cancelados (`Failure`) y las comidas del personal se guardan pero no cuentan como venta. Verificado el 25/09: 39 pedidos, $7,736, efectivo $4,299, tarjeta $3,437, 64 productos por $7,736 y $8,832 sin descuento, igual que los reportes Ventas y ProductsSales de ese día.
- **IVA** = Σ por producto de `round(precio × 16 / 116, 2)`. Da $1,066.97 el 25/09, igual que Dodo IS (sobre el total daría $1,067.03).
- **Forma de pago:** `Cash` → efectivo, `BankCard` → tarjeta, `InternetAcquiring` → en línea, otro → otro.
- **Tipo:** `Stationary` → en tienda, `Delivery` → entrega, `PersonalFood` → personal.
- **Origen:** `Restaurant` → mostrador, `Kiosk` → kiosco, `Mobile` → app, `Site` → sitio, cualquier otro → otro (se guarda también el texto original).
- **Desglose por servicio** (para `ventas_dia_desglose`, como en el reporte de Ventas): `Delivery` → entrega; en tienda desde app o sitio → llevadera; en tienda desde mostrador, kiosco u otro → restaurante. Dodo IS cuenta como "Restaurante" lo vendido en tienda aunque vaya para llevar (el 25/09, 31 de 39 pedidos tenían `TakeAway = 1` y el reporte dice Restaurante 39). **La regla de llevadera se confirma** contra el reporte de Ventas de un día con pedidos de app.
- **Desglose por origen:** `Site` → sitio, `Mobile` → app, `Aggregator` con valor → agregador. Kiosco y mostrador no tienen renglón en el reporte de Ventas; salen en el reporte nuevo de canales.
- **Nombre del producto** = `Product` + " " + `ProductSize`, con espacios repetidos quitados ("Papas Gajo" + "Medium" → "Papas Gajo Medium"), igual que en ProductsSales.
- **Fecha** = `Date` del pedido (día de Dodo IS, de 0:00 a 23:59).
- **Varias sucursales:** un archivo puede traer varias (`Store`); cada una se busca en la app sin distinguir mayúsculas ni espacios repetidos.
- **Promociones:** se guarda `BonusAction` y cuenta como venta, igual que en Dodo IS; los reportes pueden separarla.
- **Combos:** `ComboUUId` identifica el combo (es el mismo en todos los pedidos), no cada venta. Un combo vendido = un par (pedido, combo) distinto; si un pedido lleva dos veces el mismo combo cuenta como uno (el archivo no permite distinguirlo). En la semana, pedidos con venta: El de Siempre 8, Solo Dodo 7, Trío Ganador 4, Supremo 3, Especial del Antojo 1 (16, 14, 12, 6 y 3 productos).
- **Tiempos:** se miden en los pedidos que cuentan como venta. Cocina = `ReadyAt` − `StartCookingAt`; entrega = `GivenOutAt` − (`Date` + `Time`). En la semana los 296 pedidos con venta traen las tres horas (los vacíos eran comidas del personal y cancelados): mediana 11 min de cocina y 13 min de entrega; 56 pedidos (19 %) pasaron de 15 min de cocina.

## Modelo de datos (migración `0007_datos_brutos.sql`)

```
pedidos               dodo_id text pk (OrderId), sucursal_id, fecha date, hora time,
                      pago text check in ('efectivo','tarjeta','en_linea','otro'),
                      tipo text check in ('en_tienda','entrega','personal'),
                      origen text check in ('mostrador','kiosco','app','sitio','otro'), origen_dodo text,
                      para_llevar boolean, estado text check in ('entregado','cancelado'),
                      total, total_sin_descuento, iva numeric(12,2), productos int,
                      promocion text, cliente_id text, cliente_pedidos int, turno_dodo text,
                      inicio_coccion, listo, entregado timestamptz (null si no vienen),
                      importacion_id → importaciones_ventas

pedido_productos      pedido_id → pedidos on delete cascade, renglon int, dodo_uuid text, dodo_id → productos_venta,
                      nombre text, precio, precio_sin_descuento numeric(12,2), costo_dodo numeric(12,4),
                      combo text, primary key (pedido_id, renglon)

productos_venta       + dodo_uuid text unique (se llena al empatar)
                      nuevos productos sin número de ProductsSales: dodo_id de la secuencia productos_venta_interno (desde 1,000,000)

importaciones_ventas  + formato text check in ('ventas_productos','datos_brutos') default 'ventas_productos'
                      + pedidos int; archivo_productos deja de ser obligatorio

sucursales            + m2_comedor numeric(8,2) (para venta por m²)
```

- **RLS:** `pedidos` y `pedido_productos` se leen con `ve_ventas(sucursal_id)` (admin y corporativo todas, gerente la suya). Sin políticas de escritura: solo la función.
- **Hora local:** `inicio_coccion`, `listo` y `entregado` se guardan como hora de Ciudad de México (UTC−6).

### Importar: `importar_datos_brutos(p_archivo text, p_dias jsonb, p_pedidos jsonb, p_productos jsonb, p_reemplazar boolean) returns integer`

`security definer`, solo admin; todo el archivo en una transacción.
- `p_dias`: `[{sucursal_id, fecha, resumen: {pedidos, total, efectivo, tarjeta, en_linea, iva, venta_m2}, desglose: [...]}]`, calculado en la app (probado en node).
- `p_pedidos` y `p_productos`: los renglones ya normalizados.
- Por cada día: si ya existe y no se pide reemplazar → error "Estos días ya se importaron: …". Con reemplazar, borra `ventas_producto`, `ventas_dia` (el desglose se va en cascada) y `pedidos` de ese día y sucursal (los productos se van en cascada), y registra la importación con el total anterior.
- Catálogo: cada producto se empata por `dodo_uuid`; si no, por nombre sin distinguir mayúsculas entre los que aún no tienen código (y se le guarda); si no, entra nuevo, sin categoría, con `dodo_id` de la secuencia interna y el tamaño detectado por nombre.
- `ventas_producto` se calcula en SQL agrupando `pedido_productos` de los pedidos que cuentan como venta.
- Devuelve el número de días guardados.

La función vieja `importar_ventas_dia` se queda (no se usa desde la pantalla) para no romper las pruebas de 0006.

## Pantallas

### Importar (`/ventas/importar`, admin)

Un campo de archivo (Datos brutos) → **Revisar** (lee sin guardar) → vista previa: periodo, sucursales y, por sucursal y día, pedidos, venta, ticket, comidas del personal y cancelados; días ya importados marcados; productos nuevos; totales de la semana → **Guardar** o **Reimportar** (casilla de confirmación si hay días ya importados). Los archivos no se guardan; su nombre queda en la bitácora.

### Reportes (`/ventas`): secciones nuevas

Debajo de las actuales, en plegables (abiertos y en dos columnas en computadora, cerrados y apilados en celular), con el mismo periodo y sucursal del calendario:

1. **Venta por hora** (ancho completo): mapa de calor de días de la semana × horas (11–23 h); intensidad del naranja según la venta; tocar un cuadro muestra venta y pedidos; arriba, la hora pico. En celular caben las 12 columnas.
2. **Canales:** venta, pedidos y ticket por origen (mostrador, kiosco, app, sitio, entrega) en barras; % para llevar contra comer ahí; efectivo y tarjeta por canal.
3. **Personal y cancelados:** comidas del personal (pedidos, monto a precio de lista, % de la venta); cancelados (número, monto y lista con día, hora, monto y productos). Rojo si los cancelados pasan del 3 % de los pedidos.
4. **Tiempos de cocina:** mediana de inicio a listo y de pedido a entrega; % de pedidos de más de 15 minutos; horas más lentas; los 5 pedidos más lentos. Los pedidos sin "listo" no cuentan y se dice cuántos son.
5. **Combos:** los más vendidos, con combos vendidos (pedidos que los llevan) y venta de sus productos.

Días del periodo importados con el formato anterior: "N días del periodo no tienen detalle; reimpórtalos con Datos brutos."

### Permisos

Iguales al resto de Ventas: importar solo admin; ver reportes admin y corporativo (todas), gerente (la suya); encargado y cajero no ven Ventas.

## Errores

- "Este archivo no parece un Datos brutos de Dodo IS." (faltan las hojas o sus encabezados)
- "El archivo no trae pedidos."
- "La sucursal X del archivo no existe en la app."
- "Hay productos de pedidos que no están en OrderPositions" (o pedidos sin productos).
- "El archivo abarca más de 92 días."
- "Estos días ya se importaron: …" (sin confirmar reemplazo).

## Verificación

- **Fixture:** el archivo real del 21–28/09/2026 **sin nombres de clientes** (se vacía `ClientName` antes de guardarlo en `lib/ventas/__fixtures__/`).
- **`npm test`:** 25/09 = 39 pedidos, $7,736, efectivo $4,299, tarjeta $3,437, IVA $1,066.97, 64 productos, $8,832 sin descuento; semana = 29 comidas del personal por $3,681 y 9 cancelados; nombre de producto y empate con el catálogo; venta por hora; tiempos (296 pedidos con venta, mediana 11 min de cocina y 13 de entrega, 56 de más de 15 min) y combos (El de Siempre 8, Solo Dodo 7); rechazo de archivo equivocado y de hojas que no coinciden.
- **`supabase/pruebas/0007_datos_brutos.sql`:** solo el admin importa; el gerente ve pedidos solo de su sucursal; encargado y cajero no ven nada; corporativo ve todo y no escribe; reimportar reemplaza días completos y deja bitácora; producto empatado por nombre recibe su código y uno nuevo entra con `dodo_id` interno; `ventas_producto` sale de los pedidos que cuentan como venta.
- Revisión en local (celular y computadora) de las secciones nuevas; typecheck, build y revisión independiente.

## Arranque

1. `0007_datos_brutos.sql` y `pruebas/0007_datos_brutos.sql` → `PRUEBAS OK`.
2. Fusionar a `main`.
3. `update sucursales set m2_comedor = 61 where nombre = 'Zapopan-1';` (Dodo IS: $7,736 / 126.8 por m² ≈ 61 m²).
4. Importar Datos brutos del 21–28/09/2026 (reemplaza los días importados con el formato anterior).
5. Con un día que tenga pedidos de app, comparar contra el reporte de Ventas de Dodo IS para confirmar la regla de llevadera.
