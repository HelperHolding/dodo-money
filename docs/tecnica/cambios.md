# Registro de cambios

## 2026-10-07 · Activos · 0038

Inventario por unidad para sucursales existentes y aperturas. Costo de adquisición separado de valuaciones; historial de traslados, revisiones y servicios. Recepción de Aperturas limita unidades registrables. Administración captura; corporativo consulta. Validación reportada: 410 pruebas locales, TypeScript, build y PRUEBAS OK de Supabase. Main `4318228`; despliegue en producción no verificado en este registro.

## 2026-10-07 · Conocimiento y Asistente · 0039 · validado

Manuales con audiencia, borradores, versiones y edición de administración. Q&A visible a usuarios activos; todos preguntan y administración responde oficialmente. Ocho manuales iniciales sin reemplazar ediciones existentes. Documentación técnica en `docs/tecnica`.

Chat con Anthropic preparado para ventas, costos, cortes, manuales y P&L de oficina. Gerentes quedan fijados a su sucursal. Clave solo servidor, herramientas de lectura, fuentes verificables, cuotas y registro de consumo. Validación: 418 pruebas locales, TypeScript, build y PRUEBAS OK de Supabase reportado por el usuario. Pendiente: configuración Anthropic, validación real con proveedor y prueba de producción.

## 2026-10-07 · Diseño del chat

Vista de conversación con burbujas, sugerencias, fuentes por respuesta, indicador de consulta y compositor integrado. Enter envía; Shift + Enter agrega una línea. Las consultas fallidas conservan el borrador. Selector de sucursal y aviso de conexión compactos; privacidad desplegable. Sin cambio de permisos ni migración. Validación: escritorio y celular con datos ficticios, 418 pruebas, TypeScript y build. La conexión real con Anthropic sigue pendiente.

## 2026-10-07 · Márgenes de productos

Ficha de producto con margen bruto porcentual y en pesos por POS y Rappi, calculado sobre precio sin IVA (16 %) y costo vigente. Precio POS proviene de la versión BOM seleccionada; Rappi usa la última orden observada y conserva fecha, tienda y opciones. Referencias comparadas con costo de hoy, no utilidad histórica ni neta. Simulador de precio para un margen sobre venta, sin guardar objetivos ni modificar precios. Costos ausentes permanecen pendientes; pérdidas admitidas. Sin migración. Validación: 420 pruebas, TypeScript, build y vista con datos ficticios.

## 2026-10-07 · Menú Rappi · 0040 · pendiente de Supabase

56 precios de Sheet3 del archivo MENU DODO FINAL  (2).xlsx, vigentes desde 2026-10-01. Costos (55) y precios POS de EDITADO se conservan como referencias de otro escenario, sin modificar costos vigentes ni BOM. Trío Ganador no tiene costo numérico. Carga atómica e idempotente; versiones no se sobrescriben. Solo nombres completos únicos se vinculan inicialmente; pendientes se resuelven en Costeo > Menú Rappi. Vínculos de administración con revisión e historial, corporativo solo consulta. La ficha usa el precio del menú vigente si tiene vínculo; conserva observaciones históricas de Rappi. Validación: extracción contrastada con el archivo, 420 pruebas, TypeScript, build y revisión visual con catálogo ficticio. Pendiente: carga/pruebas en Supabase y despliegue.
