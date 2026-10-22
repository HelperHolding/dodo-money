# Cierre financiero de Rappi

El reporte financiero y el historial de productos son fuentes diferentes. El primero gobierna el cierre contable y la liquidación; el segundo conserva unidades, recetas y costos. La importación financiera no crea productos ficticios ni modifica cortes físicos, recolecciones, órdenes o pagos.

## Importación

En Banca → Rappi se revisa el Excel con `Detalle` y, si existe, `Facturas de comisión`. Se confirma razón social, sucursal, cobertura y motivo. La cobertura actual comprende del primer al último movimiento; no certifica días externos. Se conserva el archivo original privado y el JSON validado con seis decimales. El resumen se redondea al presentar.

Los movimientos se distinguen por tipo e ID de orden. Una compensación del mismo ID es otro movimiento financiero, no otro pedido. Las canceladas con importes se conservan. Los conceptos monetarios desconocidos distintos de cero detienen la importación; no se omiten.

El doble envío conserva el resultado. Los reportes solapados solo se sustituyen completos, con vista previa vigente y motivo. La nueva versión y el original anterior permanecen consultables. La tienda no se reasigna a otra sucursal automáticamente. No hay escritura directa de usuarios en las tablas.

## Criterio del archivo de cierre proporcionado

- Venta después de descuentos = bruta + descuento aliado + DAR (estos descuentos tienen signo negativo).
- Neto del reporte = venta después de descuentos + comisión + IVA comisión + créditos DAR de comisión e IVA + retenciones + compensaciones + costo de canceladas.
- El DAR y sus créditos se contrarrestan. Los créditos no se registran como una segunda venta.
- Base de venta neta del cierre = IVA retenido / 8 %, contrastada con ISR retenido / 2.5 %.
- La base más 16 % de IVA se presenta como referencia de facturación del cierre. No genera un CFDI automáticamente.
- La diferencia entre venta después de ambos descuentos y base con IVA se presenta como ingreso fuera de base, siguiendo el criterio del archivo.
- La comisión se netea con el crédito DAR por lote completo. Un neto negativo es gasto de comisión; un neto positivo es excedente DAR, separado como ingreso sin IVA. El grupo sin paidlot es provisional.
- El CFDI identificado en el archivo manda sobre los centavos esperados de comisión. Se contrasta contra el importe del lote. Si el mismo UUID ya existe en Compras, se verifica empresa, sucursal, estado e importe y se excluye del gasto general para no duplicarlo. Una discordancia bloquea la aplicación de ese reporte al P&L.
- Retenciones e IVA de comisión no se vuelven gasto en el P&L. Compensaciones y cancelaciones se muestran en su propio renglón.

Para un rango parcial, el gasto y excedente del lote completo se reparten en proporción a la comisión bruta de los movimientos de cada día. No se determina si el lote debe facturarse usando solo una fracción del lote. Las regalías conservan su tasa vigente y aplican la base neta actualizada.

## Cobertura y pendientes

En los días cubiertos, el P&L sustituye la venta del historial por la base financiera, sin sumar ambas fuentes. En días sin reporte conserva el cálculo anterior, expresamente provisional. Si hay Rappi incluido en Dodo IS o un CFDI discordante, el reporte permanece visible en Banca pero su aplicación al P&L queda pendiente y se avisa. Los productos y costos siguen saliendo del historial operativo. Las órdenes financieras sin detalle no reciben costos inventados y los resultados se etiquetan provisionales.

Un neto reportado no prueba que esté pendiente de cobrar ni que ya se haya depositado. La conciliación contra Banregio sigue separada y no se confirma automáticamente.

## Despliegue

1. Ejecutar `supabase/migrations/20261022190000_rappi_financiero.sql`.
2. Ejecutar `supabase/pruebas/20261022190000_rappi_financiero.sql`. El ensayo crea una sucursal temporal, prueba escritura, versiones, permisos y conservación de cierres/recolecciones, y finaliza con `ROLLBACK`. El mensaje de éxito es un NOTICE, no un error.
3. Confirmar el resultado antes de integrar/publicar el formulario dependiente.
4. Importar el Excel real desde la vista previa y comprobar el desglose. No ejecutar correcciones SQL sobre `rappi_ordenes` para reemplazar el reporte financiero.
