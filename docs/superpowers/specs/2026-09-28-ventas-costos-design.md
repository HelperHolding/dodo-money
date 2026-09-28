# Ventas y costos importados de Dodo IS

Fecha: 2026-09-28 · Estado: diseño aprobado en conversación, pendiente de revisión escrita

## Objetivo

La API de Dodo IS no está disponible (ataque del 27–28 de septiembre de 2026). Mientras vuelve, el admin importa cada día las dos exportaciones de Dodo IS ("Ventas" y "ProductsSales") para tener reportes de venta, mezcla de productos, descuentos y **costo teórico con costo promedio ponderado**, primer paso hacia el P&L.

**Éxito:** con la semana importada, corporativo, admin y cada gerente ven venta diaria, productos, descuentos, costo % por categoría y las diferencias entre el cierre del gerente y Dodo IS, sin copiar números a mano.

**Fuera de esta etapa (P&L):** costo de bebidas y alitas (falta costo de compra), costeo por receta e insumos, mermas valorizadas, nómina, renta y servicios, conexión por API.

## Decisiones tomadas

1. **Importación diaria** al cerrar el día; un par de archivos = un día de una sucursal.
2. **La hace un admin.** Corporativo solo consulta.
3. **Se compara con el cierre del gerente** (el gerente sigue capturando; nada se modifica).
4. **Reportes de esta etapa:** venta diaria (A), productos (B), descuentos (C), cierre contra Dodo IS (D).
5. **Costos:** catálogo de costo por producto con fecha desde la que aplica (carga inicial del modelo de UC Mexico).
6. **Visibilidad:** admin y corporativo todas las sucursales; gerente solo la suya, incluidos costos; encargado y cajero no ven ventas.
7. **Lectura de Excel en el servidor**, con vista previa antes de guardar, sin librerías externas.

## Formato de los archivos (exportaciones de Dodo IS)

Un `.xlsx` es un ZIP con XML. Se lee `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml` y la primera hoja; celdas con tipo `s` usan la tabla de cadenas compartidas; las fechas son números seriales de Excel (1900).

### "Ventas" (hoja "Ventas")

| Celda | Contenido | Ejemplo |
|---|---|---|
| A1 / D1 | `Informe` / `Ventas` | identifica el reporte |
| D2 | Sucursal ("Unidades") | `Zapopan-1` |
| D3 | Periodo | `25/09/2026 12:00:00 a.m. - 25/09/2026 11:59:00 p.m.` |
| fila 7 | Encabezados B–G: `Número de pedido`, `Total`, `Efectivo`, `Tarjeta`, `En línea`, `IMPUESTO` | |
| filas 8–15, columna A | `Entrega`, `Llevadera`, `Restaurante`, `Total`, `Centro de llamadas`, `Sitio`, `Aplicación móvil`, `Agregador (tarjeta)` | Restaurante: 39 · 7736 · 4299 · 3437 · 0 · 1066.97 |
| fila 18 | Encabezados por día: Unidad, Fecha, Total, Entrega, Restaurante, Llevadera, Por m² de comedor, Total (órdenes), Entrega, Restaurante, Llevadera | |
| filas 19+ | Un renglón por día (fecha serial) y uno final `Total` | 46290 → 25/09/2026, m² 126.8 |

Las filas se ubican por su texto en la columna A (no por número fijo). Más de un renglón de fecha en la tabla por día → "El archivo abarca varios días; exporta un solo día".

### "ProductsSales" (hoja "Precios locales")

| Celda | Contenido |
|---|---|
| A1 / B1 | `Informe:` / `Informe de ventas de productos` |
| B2 | Tienda (sucursal) |
| B4 | Periodo `25/09/2026 12:00:00 a.m.-25/09/2026 11:59:00 p.m.` |
| B9 | Método de cálculo: debe ser `Con descuentos` |
| fila 12 | `Fecha`, `Identificador del producto`, `Producto`, `Cantidad`, `Importe`, `Cantidad sin descuento`, `Descuento (%)`, `Fuentes de los pedidos` |
| filas 13+ | Un renglón por producto |

"Cantidad sin descuento" es en realidad el **importe sin descuento** (Margarita Mediano: cantidad 1, importe 143.4, "cantidad sin descuento" 169). Nombres con espacios dobles ("Papas Gajo  Medium") se normalizan.

### Validaciones de la importación

- Los dos archivos: reporte correcto, misma sucursal, misma fecha, un solo día; la sucursal existe en la app (por nombre exacto).
- **Cuadre:** total de "Ventas" = suma de importes de productos (25/09: $7,736 = $7,736). Diferencia mayor a $1 → aviso; se puede guardar confirmando.
- Día ya importado → la vista previa lo dice y el botón pasa a **Reimportar** con confirmación.

## Modelo de datos (migración `0006_ventas_costos.sql`)

```
categoria_producto  enum ('pizza', 'snack', 'postre', 'bebida', 'otro')

productos_venta      dodo_id int pk, nombre text, categoria categoria_producto (null = sin categoría),
                     tamano text check in ('pequeno','mediano','grande'), creado_en
                     -- igual para todas las sucursales; se agrega solo al importar un producto nuevo

costos_producto      id, dodo_id → productos_venta, costo numeric(10,2) >= 0, vigente_desde date,
                     fuente text, registrado_por, creado_en, unique (dodo_id, vigente_desde)

ventas_dia           id, sucursal_id, fecha, pedidos int, total, efectivo, tarjeta, en_linea, iva numeric(12,2),
                     venta_m2 numeric(10,2), importacion_id, unique (sucursal_id, fecha)

ventas_dia_desglose  ventas_dia_id, tipo text check in ('entrega','llevadera','restaurante','centro_llamadas',
                     'sitio','app','agregador'), pedidos, total, efectivo, tarjeta, en_linea, iva,
                     primary key (ventas_dia_id, tipo)

ventas_producto      sucursal_id, fecha, dodo_id → productos_venta, nombre text (como vino), cantidad numeric(10,2),
                     importe numeric(12,2), importe_sin_descuento numeric(12,2),
                     primary key (sucursal_id, fecha, dodo_id)

importaciones_ventas id, sucursal_id, fecha, archivo_ventas text, archivo_productos text, total numeric(12,2),
                     suma_productos numeric(12,2), productos int, reemplaza_id → importaciones_ventas,
                     total_anterior numeric(12,2), importado_por, importado_en
```

- **Importar/Reimportar:** función `importar_ventas_dia(p_sucursal uuid, p_fecha date, p_resumen jsonb, p_desglose jsonb, p_productos jsonb, p_archivos jsonb, p_reemplazar boolean) returns uuid` (`security definer`, solo `admin`). En una transacción: registra la importación, crea productos nuevos en el catálogo (nombre, tamaño detectado), y si `p_reemplazar` borra y vuelve a insertar el día (única excepción a "nada se borra"; la bitácora conserva el total anterior). Sin `p_reemplazar` y con el día existente → "Ese día ya se importó".
- **Costo vigente:** función `costo_vigente(p_dodo_id int, p_fecha date) returns numeric` = costo con el `vigente_desde` más reciente ≤ fecha.
- **Vista `ventas_producto_costeo`** (`security_invoker`): cada renglón de `ventas_producto` con categoría, costo vigente, costo teórico (cantidad × costo, null sin costo) e importe neto (importe × (total − iva) / total del día).
- Sin políticas de update/delete fuera de las funciones.

### Reglas de cálculo

- Venta neta del día = total − IVA. Por producto: importe × (venta neta / total).
- Costo teórico = Σ cantidad × costo vigente (productos sin costo se excluyen y se reportan aparte).
- Costo % = costo teórico ÷ venta neta **de los productos con costo**.
- Costo promedio ponderado por categoría = costo teórico ÷ piezas con costo.
- Descuento = importe sin descuento − importe; % = descuento ÷ importe sin descuento.
- Ticket promedio = total ÷ pedidos.
- Tamaño por nombre: termina en `Pequeño` → pequeño, `Mediano`/`Medium` → mediano, `Grande`/`Grande T` → grande.

### Comparación con el cierre del gerente

Por sucursal y día con cierre e importación: efectivo, tarjeta, IVA, total (efectivo + tarjeta + app + rappi del cierre contra total de Dodo IS), en línea (app + rappi del cierre contra en línea de Dodo IS) y pedidos (transacciones del cierre contra pedidos). Diferencia en valor absoluto mayor a $1 (o a 0 pedidos) → rojo.

### Permisos

| Acción | Admin | Corporativo | Gerente | Encargado / cajero |
|---|:-:|:-:|:-:|:-:|
| Importar, reimportar, categorías y costos | ✅ | ❌ | ❌ | ❌ |
| Ver reportes | Todas | Todas | Su sucursal | ❌ |

Lectura: `sucursal_id = mi_sucursal() and mi_rol() in ('gerente','admin')` o `ve_todas_las_sucursales()`. Catálogo y costos legibles por gerente, admin y corporativo. Escritura de catálogo y costos: solo admin (políticas de insert; categoría por función `asignar_categoria(p_dodo_id, p_categoria)` solo admin).

## Datos iniciales (`seed_ventas_costos.sql`)

Productos y costos de la prueba del 25/09/2026 (costos UC Mexico, snapshot 09/08/2026; `vigente_desde = 2026-08-09`, `fuente = 'UC Mexico 09/08/2026'`):

| dodo_id | Producto | Categoría | Costo |
|---|---|---|---|
| 27 | Margarita Mediano | pizza | 26.74 |
| 33 | Hawaiana Mediano | pizza | 44.09 |
| 40 | Pepperoni Mediano | pizza | 32.66 |
| 42 | Pepperoni Grande | pizza | 42.00 |
| 43 | Pepperoni Grande T | pizza | 40.32 |
| 64 | Quatro quesos Pequeño | pizza | 39.39 |
| 65 | Quatro quesos Mediano | pizza | 41.13 |
| 67 | Quatro quesos Grande | pizza | 44.01 |
| 70 | Jamón y champiñones Pequeño | pizza | 29.76 |
| 71 | Jamón y champiñones Mediano | pizza | 35.21 |
| 73 | Jamón y champiñones Grande | pizza | 48.28 |
| 80 | Pollo hawai supreme Mediano | pizza | 51.70 |
| 87 | Dodo Supreme Pequeño | pizza | 42.87 |
| 96 | Pepperoni Mango Grande | pizza | 43.13 |
| 108 | Pollo BBQ Mediano | pizza | 45.51 |
| 115 | Tres Carnes Mediano | pizza | 48.58 |
| 117 | Tres Carnes Grande | pizza | 72.99 |
| 139 | Ranch Picante Mediano | pizza | 39.77 |
| 145 | Bacorn BBQ Mediano | pizza | 41.57 |
| 165 | BBQ Carne Supreme Grande | pizza | 69.07 |
| 171 | Carbonara Grande | pizza | 70.02 |
| 187 | Crema champiñonas Pequeño | pizza | 48.68 |
| 161 | Dodster Classico 1 pza | snack | 25.49 |
| 202 | Dodster cheesy spicy 1 pza | snack | 23.66 |
| 204 | Dodster chimichurri 1 pza | snack | 21.38 |
| 199 | Papas francesas Grande | snack | 16.48 |
| 200 | Papas Gajo Medium | snack | 12.56 |
| 201 | Papas Gajo Grande | snack | 19.58 |
| 208 | Alitas Buffalo 10 uds | snack | 28.26 (costo "Wings" de UC Mexico; posiblemente de una orden más chica) |
| 156 | Coca-Cola 0,6 L | bebida | sin costo |
| 157 | Coca-Cola 2 L | bebida | sin costo |

Costos de referencia del modelo para productos que aún no aparecen en ventas (el admin los asigna cuando aparezcan): demás pizzas por tamaño (hoja Fuente_UC_Mexico), Rolls con Piña M/G $10.92 / $18.98, Apple rolls M/G $12.22 / $13.94, Fries M $11.01, Dodster Buffalo $20.45. Costos marcados como dudosos en el modelo (Hawaiana 30 cm > 35 cm; Pollo Hawai Supreme muy alto) se cargan tal cual y se señalan en la pantalla de costos.

## Pantallas

Entrada nueva en el menú: **Ventas** (admin, corporativo, gerente).

1. **Importar** (`/ventas/importar`, admin): dos campos de archivo → **Revisar** (server action que lee y valida, sin guardar) → vista previa: sucursal y fecha, totales, ticket promedio, cuadre ✅/⚠, productos nuevos / sin categoría / sin costo con enlace a Costos, aviso de día ya importado → **Guardar** o **Reimportar** (con casilla de confirmación). Los archivos no se guardan; se guardan sus nombres en la bitácora.
2. **Costos** (`/ventas/costos`, admin): tarjetas por categoría; cada producto con categoría (selector), costo vigente y desde cuándo, formulario "Nuevo costo" (monto y aplica desde) e historial; filtros "Sin costo" y "Sin categoría"; aviso en costos dudosos.
3. **Reportes** (`/ventas`): periodo (por defecto los últimos 7 días con datos; rango elegible) y sucursal (admin/corporativo: todas o una; gerente fija). Secciones plegables en celular:
   - **Resumen:** venta total y neta, pedidos, ticket promedio, descuentos $, costo % teórico.
   - **Venta diaria:** barras por día; desglose por tipo, por método y venta por m².
   - **Productos:** top 10, mezcla por categoría, cambio contra el periodo anterior.
   - **Descuentos:** total, % promedio, productos con más descuento.
   - **Costos:** costo % y costo promedio ponderado por categoría, productos con mayor costo %, aviso de productos sin costo.
   - **Cierre contra Dodo IS:** días con diferencias en rojo, o una línea verde.
   Gráficas SVG dibujadas en la app; tarjetas en lugar de tablas anchas.

## Errores

- "Este archivo no parece un reporte de Ventas / de Productos de Dodo IS."
- "El reporte de Ventas es del 25 de septiembre y el de Productos del 26."
- "El reporte es de la sucursal X y no existe en la app."
- "El archivo abarca varios días; exporta un solo día."
- "El método de cálculo del reporte de productos debe ser Con descuentos."
- "Los archivos no cuadran por $120" (aviso, se puede guardar confirmando).
- "Ese día ya se importó" (sin reimportar).

## Verificación

- `npm test`: lector de xlsx y extractores con los dos archivos reales del 25/09/2026 como fixtures (`lib/ventas/__fixtures__/`; repo privado): total 7736, 39 pedidos, IVA 1066.97, 31 productos, sucursal Zapopan-1, fecha 2026-09-25, m² 126.8; rechazo de archivo equivocado y de varios días; tamaño por nombre; costo vigente por fecha; costo teórico del día = 2187.19 con los costos del seed (redondeados a centavos; la prueba con costos sin redondear dio 2187.12); comparación con cierre.
- `supabase/pruebas/0006_ventas_costos.sql`: solo admin importa y maneja costos; gerente ve solo su sucursal; encargado y cajero no ven ventas; corporativo ve todo y no escribe; reimportar deja bitácora con total anterior; costo vigente por fecha.
- Typecheck, build, revisión independiente final.

## Arranque

1. `0006_ventas_costos.sql`, `seed_ventas_costos.sql`, `pruebas/0006_ventas_costos.sql` → `PRUEBAS OK`.
2. Fusionar a `main`.
3. El admin importa los 7 días de la semana.
4. Con el modelo actualizado, se cargan costos nuevos con su fecha de vigencia.
