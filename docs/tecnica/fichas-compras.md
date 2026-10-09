# Fichas de compras

Las órdenes y facturas usan una ficha con estado textual y color, resumen monetario y acciones en el encabezado. El cuaderno separa artículos, seguimiento, pagos y contabilidad. No se fuerza una secuencia de estados ni se modifican reglas de negocio.

FichaPestanas conserva los paneles montados para no perder los valores de formularios al cambiar de pestaña. Implementa tablist/tab/tabpanel, selección con flechas, Home y End, foco visible y desplazamiento horizontal en celular. La impresión muestra todos los paneles. No introduce dependencias ni requiere migración SQL.

Validación: TypeScript, 449 pruebas y build correctos. Renderizado SSR con datos simulados de orden confirmada y factura manual; 3 y 5 pestañas respectivamente, sin importes NaN. Revisión React: componentes de datos en servidor, interacción pequeña en cliente, claves estables, controles con etiquetas, sin cambios de autorización. La comprobación visual y de interacción en navegador queda pendiente.
