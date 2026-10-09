# Costeo y simulación de promociones

Costeo abre en lista. Se conservan tarjetas como opción, búsqueda y filtros. La lista muestra costo y vigencia; la fuente y las notas quedan en Ver origen. El producto usa pestañas de BOM, precios/márgenes e historial. Los vínculos para editar abren explícitamente la vista de tarjetas.

La calculadora se abre desde Costeo o desde un producto. Carga costos vigentes sin IVA y opcionalmente la referencia POS del BOM; un cambio de producto limpia el precio salvo que corresponda al producto inicial. El usuario puede sustituir el costo solo en la simulación. Una fuente desconocida o un costo faltante no se convierten en cero. Ninguna cifra se guarda ni modifica precios, costos o P&L.

Escenario: unidades enteras, precio total con IVA, descuento del restaurante, IVA editable, comisión porcentual con base explícita después del descuento (con o sin IVA), extras sin IVA y objetivo de contribución. El costo registrado incluye sus periféricos; no se suma de nuevo el 1 %. Para combo mixto se usa una unidad con la suma manual de costos.

Margen bruto = venta sin IVA menos costo. Contribución = venta sin IVA menos costo, comisión y extras. Ambos porcentajes usan venta sin IVA como denominador. Los precios para equilibrio y objetivo incluyen IVA antes del descuento y se redondean hacia arriba a centavos. Si comisión/objetivo hacen imposible un precio, se muestra explícitamente. No se calcula utilidad neta ni impuestos propios de la comisión.

Verificación: 452 pruebas, incluidas tres de escenarios (descuento/combos, bases de comisión, precio objetivo y límites), TypeScript y renderizado SSR de lista, tarjetas, calculadora y ficha. No requiere migración SQL. La revisión visual en navegador está pendiente.
