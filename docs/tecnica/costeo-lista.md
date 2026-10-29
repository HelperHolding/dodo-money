# Lista interactiva de costeo

La vista predeterminada permite buscar por palabras, código e insumos del BOM vigente sin acentos; filtra inmediatamente sin consultas por pulsación. Incluye categoría, tamaño y rangos inclusivos de costo, precios POS/Rappi y margen. Filtros rápidos: sin costo, sin categoría, lista Rappi (solo productos con precio de la lista oficial vigente), sin precio Rappi, margen bajo y diferencia contra BOM. Umbral inicial de margen bajo: 60 %, editable, no es una meta guardada.

Agrupaciones desplegables por categoría, tamaño, BOM y costo. Encabezados ordenan ascendente/descendente; datos pendientes al final, costo cero válido. Conserva enlaces a ficha, calculadora y origen cerrado. Vista de tarjetas mantiene los formularios de edición anteriores.

POS proviene de receta vigente. Rappi proviene de la lista oficial vigente (`precios_rappi`, la más reciente con `vigente_desde` hasta hoy); sin ella, del último precio observado en orden finalizada no futura. El título del precio dice cuál de los dos es. Lectura paginada en lote; sin N consultas por producto. Los precios observados no se guardan como lista oficial. Margen usa la fórmula existente: venta sin IVA 16 % menos costo, entre venta sin IVA. No incluye descuentos ni comisiones.

La diferencia contra BOM compara costo vigente con receta más el periférico de la versión cuando corresponde; no agrega el periférico otra vez al margen. Fuentes pendientes conservan null. Permisos admin/corporativo y RLS sin cambios. Filtros se conservan en URL; no hay migración.
