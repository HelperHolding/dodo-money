# Panel Rappi

La pantalla `/ventas/rappi` muestra indicadores y gráficas sobre las órdenes ya consultadas para el mes y sucursal seleccionados. Mantiene permisos, fuentes y flujo de importación; no requiere SQL.

Subtotal restaurante, ticket promedio, descuentos, barras diarias y top 5 de productos usan exclusivamente órdenes `Finalizado` con `sumar=true`. El subtotal incluye IVA y precede al descuento financiado por Rappi, siguiendo la base existente de ventas. No representa liquidación bancaria, utilidad ni total sin IVA del P&L.

La dona de estados incluye todas las órdenes importadas del periodo, incluso las incluidas en Dodo IS. El indicador de órdenes informa cuántas finalizadas fueron excluidas por esa fuente. No se interpreta ausencia de órdenes como cobertura confirmada de un día.

El top agrupa por nombre y opciones y ordena por unidades. No presenta márgenes ni costos sin verificar equivalencias y costos vigentes.

El historial de órdenes y la revisión de órdenes del archivo se muestran en acordeones cerrados. Consultar, revisar y confirmar importación utilizan las clases de botón existentes; el selector de archivo tiene estilo propio.

Verificación: pruebas de resumen en `lib/ventas/rappi.test.ts`, compilación y revisión visual local de la pantalla con datos de ejemplo en escritorio y celular. El acordeón se comprobó abriendo y cerrando el historial. No se importaron datos reales durante la revisión.
