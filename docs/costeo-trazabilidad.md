# Fichas y trazabilidad de costeo

Costeo permite vista de tarjetas o lista, búsqueda por nombre/ID y filtros de costo/categoría. Admin edita; corporativo consulta. Cada producto abre una ficha con costo vigente, fuente, fechas, correcciones, versiones de BOM y materiales. Las recetas sin vínculo de venta también tienen su propia ficha.

El precio POS procede del campo de venta directa del Excel de la versión elegida; es una referencia del archivo, no una consulta en vivo al POS. Rappi muestra precios brutos por pieza observados en órdenes finalizadas importadas, con opciones, tienda, fecha, archivo y enlace a la orden. Solo usa equivalencias guardadas con el producto Dodo; los productos sin equivalencia no se asignan por nombre. No se interpreta el cobro después de descuentos como precio de menú. Los combos conservan el vínculo completo y sus opciones.

Cada material que coincide con un único insumo normalizado enlaza a su ficha. La ficha del insumo muestra precio, unidad, ajuste de proceso y archivo, recetas que lo utilizan e historial por versiones. El historial enlaza nombres exactos y únicos entre archivos, no números de fila que pueden cambiar. Materiales preparados o sin coincidencia única mantienen su referencia del Excel sin enlace inventado.

No requiere migración ni cambia costos, recetas o equivalencias. Para precios actuales de catálogo POS/Rappi faltan fuentes con vigencia confirmada; se muestran explícitamente los precios de referencia y los observados disponibles.
