# Costeo y listas de materiales

Ventas → Costeo → Insumos y listas de materiales permite consultar los insumos, los BOM por producto/tamaño y las preparaciones de masa y chimichurri. El administrador importa; corporativo consulta. El Excel UC Mexico (4).xlsx está preparado para la primera carga, sin necesidad de volver a subirlo.

## Aplicar en Supabase

1. Ejecutar `supabase/migrations/0033_costeo_bom.sql`.
2. Ejecutar `supabase/pruebas/0033_costeo_bom.sql`. El ERROR `PRUEBAS OK` es intencional y revierte los datos de prueba.
3. Ejecutar `supabase/cargas/0033_uc_mexico.sql` para actualizar los costos reales y guardar los insumos y BOM del archivo adjunto. La variable `fecha` inicia en 2026-10-01 y puede cambiarse antes de ejecutar. Termina con un NOTICE `CARGA OK` con el número real de costos actualizados y las recetas pendientes/sin vincular. Usa un administrador activo y solo vincula nombres exactos normalizados o equivalencias previas. No crea productos de venta ni inventa IDs.

La carga real actualiza ventas y P&L desde esa fecha. No agrega compras ni movimientos de caja. Los costos de días anteriores se conservan. Si ya había un costo con la misma fecha, su cambio queda en `correcciones_costo`.

## Actualizaciones posteriores

En la sección de importación, subir otro UC Mexico, elegir la fecha y presionar Revisar. La tabla muestra costo actual a esa fecha, costo del BOM y costo con 1 % de periféricos. Elegir manualmente el producto para los nombres no coincidentes y revisar de nuevo. Después Guardar. El servidor relee el archivo y verifica la huella de la revisión, fecha y vínculos antes de escribir todo en una transacción.

Las equivalencias se conservan para cargas posteriores. La reimportación del mismo archivo/fecha no duplica versiones ni costos. Se conservan otros días, versiones y productos no incluidos. «Sin vincular» deja el costo de venta anterior; no lo borra.

## Método y límites del archivo

- La fuente contiene 62 insumos y 129 recetas. 119 recetas tienen todos los componentes verificables; 10 quedan pendientes por fórmulas con error o filas nombradas sin cantidad/precio. Las pendientes se muestran y conservan el costo anterior hasta corregir el Excel.
- Se usan únicamente las pestañas visibles y los rangos de materiales de la fórmula SUMIF del total de cada receta. Se excluyen la plantilla y todas las pestañas ocultas. No se usa `registry` columna F como costo: es un porcentaje y tiene valores defectuosos.
- Se suman los importes de los componentes conservando su precisión; se redondea el total del BOM a centavos. Se comprueba cantidad × precio por componente y la suma frente al total del Excel. No se interpreta un error o una celda pendiente como cero.
- Se lee la unidad real de la fórmula: `H × G / 1000` son gramos con precio por kg, incluso cuando el rótulo dice Piece (masa). `H × G` son piezas. Las cantidades ya incluyen los ajustes de merma del modelo; no se vuelve a aplicar merma.
- Las Thin usan su propio BOM. No toman el costo de masa normal. No se calculan nuevos costos para mitad y mitad, bebidas, dips ni combos que no tienen BOM en este archivo; mantienen sus costos anteriores.
- Se conserva el 1 % adicional de periféricos por decisión del usuario. El BOM ya incluye cajas y otros componentes de empaque. El extra se calcula con el precio de venta directa de `registry` D, no con el precio de agregador E, al que algunas recetas apuntan por error.
- Las unidades de precios de insumos sin uso verificable en un BOM se muestran pendientes de confirmar. La etiqueta `ingredients` H es una medida de producción y no siempre representa la unidad del precio.
- Los vínculos de nombres son exactos o manuales. Un nombre ambiguo queda sin vincular. No se asignan por similitud aproximada.
- Los BOM son versiones del archivo, no un editor de recetas. Para cambiar cantidades o precios se corrige y vuelve a importar el Excel. Las bajas de productos terminados se incorporan al P&L con la regla de `docs/mermas-pl.md`; los insumos continúan pendientes y excluidos.

## Verificación

Pruebas locales: conversión de gramos/piezas, Thin vs normal, exclusión de plantillas, errores y precios cero/distintos, totales, vínculos ambiguos y suma independiente de las 119 recetas válidas del archivo. La prueba SQL verifica permisos, reimportación, historial, correcciones y que las recetas pendientes conserven el costo anterior.
