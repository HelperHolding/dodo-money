# Gráficas del reporte de ventas

- Participación: importe con IVA de cada fuente dividido entre la suma POS/Dodo IS y Rappi. Sin ventas se muestra sin porcentaje. Conserva la separación existente por fuente, no reclasifica pedidos por agregador.
- Histórico mensual: doce meses calendario hasta la fecha final del reporte, acotado a esa fecha y a la sucursal autorizada. Agrupa por año-mes y conserva días con datos; meses ausentes no se presentan como cero y el último puede estar incompleto.
- Horas pico: pedidos entregados del periodo elegido, excepto consumo personal, más Rappi finalizado marcado para sumar. Usa las fechas y horas locales ya guardadas. No distribuye importes diarios sin detalle entre horas. Informa monto con hora frente a total del reporte y pedidos con hora inválida.
- Las gráficas son SVG en el reporte imprimible. Excel agrega Participación por canal, Ventas mensuales y Ventas por hora con los datos de respaldo. Las hojas anteriores se conservan.
- Lecturas autenticadas y paginadas; mantienen el alcance de sucursal por rol y las políticas existentes. No requiere migración ni cambia importaciones, conciliaciones o cierres.
