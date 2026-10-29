# Registro de cambios

## 2026-10-29 · Costeo con comisiones por canal

Costeo con el formato de The Coffee: margen bruto, comisión, margen con comisión y utilidad por canal en la ficha; la lista y las calculadoras muestran POS después de la comisión de terminal. POS = tasa NetPay (Amex/internacional en su parte) × parte de la venta fuera de Rappi cobrada con tarjeta en los últimos 30 días. Rappi sigue con `rappi_pct` sobre el precio con IVA; la gracia de tres meses se quita registrando 18 % desde la fecha real en Finanzas → Parámetros, lo que también aplica al P&L. La ficha usa la lista oficial Rappi vigente. Sin migración.

## 2026-10-29 · Lista oficial de precios Rappi · 20261029130000 · corrida en Supabase

Tabla `precios_rappi` con vigencia por producto y función `cargar_precios_rappi` (solo admin), que liga cada renglón del menú a productos del catálogo por nombre exacto normalizado y devuelve los que no encontró. Costeo y calculadoras usan la lista vigente y, sin ella, el último precio observado; el título del precio dice cuál es. Carga inicial `supabase/cargas/precios_rappi_menu_final_3.sql` desde "MENU DODO FINAL (3).xlsx" (hoja Sheet3): pizzas 30/35 cm a Mediano/Grande en masa tradicional y delgada, snacks, postres, bebidas y dips. No carga los siete combos propios de Rappi. Los costos siguen saliendo del BOM.

## 2026-10-23 · Fotos en manuales · 20261023120000 · pendiente de Supabase

Administración agrega y retira fotos numeradas en cada manual de Conocimiento. Bucket privado con la misma audiencia que el manual; borradores y puestos excluidos no ven las fotos. Reducción a JPG en el navegador para fotos del celular. Retiro lógico con historial. Detalle en fotos-manuales.md.

## 2026-10-07 · Reporte de ventas por canal

Tablero y PDF con ventas, pedidos, ticket y costo teórico separados POS/Dodo IS y Rappi. PDF añade detalle diario por fuente; Excel conserva hojas combinadas y agrega Resumen/Por día de POS y Rappi. Se separan las fuentes antes de combinarlas, conservando conciliaciones manuales de POS y las reglas existentes de inclusión de Rappi (Finalizado y sumar). La separación identifica la fuente importada, no el método de cobro ni el depósito bancario. No cambia P&L ni importaciones. Sin migración.

## 2026-10-07 · Pagos extraordinarios y reserva de bóveda · 0042 · pendiente de Supabase

Origen explícito transferencia o bóveda, motivo fuera de calendario y reserva de efectivo adicional al fondo para una factura. Salidas a corporativo conservan reserva y fondo; el pago parcial consume la reserva y afecta bóveda y corte sin doble gasto. Anulación con devolución actual e historial, y reintento del formulario sin duplicados. Administración gestiona y corporativo consulta. 422 pruebas locales y TypeScript; ensayo Supabase preparado. Flujo y límites documentados en pagos-boveda.md.

## 2026-10-07 · P&L sin venta bruta

Se retiran venta bruta total y sus desgloses POS/Rappi del P&L, comparativo, PDF y Excel. Venta neta y costos por fuente permanecen; margen y EBITDA no cambian. Las consultas y fuentes originales de Ventas se conservan. Sin migración. Validación: 421 pruebas y TypeScript. Banco (Excel Banregio) y Balance general (balance existente) pendientes de recibir los archivos; alcance preparado en banco-balance.md.

## 2026-10-07 · Activos · 0038

Inventario por unidad para sucursales existentes y aperturas. Costo de adquisición separado de valuaciones; historial de traslados, revisiones y servicios. Recepción de Aperturas limita unidades registrables. Administración captura; corporativo consulta. Validación reportada: 410 pruebas locales, TypeScript, build y PRUEBAS OK de Supabase. Main `4318228`; despliegue en producción no verificado en este registro.

## 2026-10-07 · Conocimiento y Asistente · 0039 · validado

Manuales con audiencia, borradores, versiones y edición de administración. Q&A visible a usuarios activos; todos preguntan y administración responde oficialmente. Ocho manuales iniciales sin reemplazar ediciones existentes. Documentación técnica en `docs/tecnica`.

Chat con Anthropic preparado para ventas, costos, cortes, manuales y P&L de oficina. Gerentes quedan fijados a su sucursal. Clave solo servidor, herramientas de lectura, fuentes verificables, cuotas y registro de consumo. Validación: 418 pruebas locales, TypeScript, build y PRUEBAS OK de Supabase reportado por el usuario. Pendiente: configuración Anthropic, validación real con proveedor y prueba de producción.

## 2026-10-07 · Diseño del chat

Vista de conversación con burbujas, sugerencias, fuentes por respuesta, indicador de consulta y compositor integrado. Enter envía; Shift + Enter agrega una línea. Las consultas fallidas conservan el borrador. Selector de sucursal y aviso de conexión compactos; privacidad desplegable. Sin cambio de permisos ni migración. Validación: escritorio y celular con datos ficticios, 418 pruebas, TypeScript y build. La conexión real con Anthropic sigue pendiente.

## 2026-10-07 · Márgenes de productos

Ficha de producto con margen bruto porcentual y en pesos por POS y Rappi, calculado sobre precio sin IVA (16 %) y costo vigente. Precio POS proviene de la versión BOM seleccionada; Rappi usa la última orden observada y conserva fecha, tienda y opciones. Referencias comparadas con costo de hoy, no utilidad histórica ni neta. Simulador de precio para un margen sobre venta, sin guardar objetivos ni modificar precios. Costos ausentes permanecen pendientes; pérdidas admitidas. Sin migración. Validación: 420 pruebas, TypeScript, build y vista con datos ficticios.

## 2026-10-07 · Orden a factura y pago · 0041 · pendiente de Supabase

Corrección de la prueba SQL: el pago de un anticipo sin recepción exige revisión documentada de la factura. La prueba original omitía ese paso y fue rechazada por registrar_pago. Ahora comprueba primero el rechazo y luego la revisión y el pago parcial. La ficha aclara cómo autorizar un anticipo sin registrar recepción ni cerrar la orden. Las validaciones financieras y la migración permanecen iguales. TypeScript y las 420 pruebas locales pasan; prueba SQL corregida pendiente de Supabase.

La orden confirmada ofrece Crear factura para pagar. Crea un documento Sin CFDI con referencia Prefactura OC, fecha de hoy, proveedor/sucursal de la orden, cantidades, unidades, precios e IVA sumado por renglón. Retenciones en cero: la orden solo contiene IVA. Conserva Oficina y usa cuentas por concepto heredadas del proveedor. Factura y vínculo se crean en una transacción. Si existe una factura vigente la devuelve; varias facturas requieren elegir. Abre la ficha con Registrar pago existente. El vínculo mantiene las reglas de cierre por recepción y facturación y su historial. Validación local: 420 pruebas, TypeScript, build y render de orden de ejemplo. Prueba SQL de copia, IVA mixto, Oficina, repetición, historial, pago parcial y corporativo preparada; ejecución en Supabase pendiente. Independiente de 0040.
