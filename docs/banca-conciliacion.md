# Banregio: conciliación de movimientos

## Alcance

Cada movimiento importado de Banregio se concilia con su documento o sin documento, y queda con un concepto de flujo para el Flujo de Efectivo. Es documental: no marca facturas pagadas, no crea ventas ni pagos, no cambia saldos, caja ni bóveda.

Solo administración concilia y anula. Administración y corporativo consultan.

## Tipos

- **Pago a proveedor:** cargos contra pagos registrados en Compras → Pagos (transferencia, no anulados).
- **Cobro con tarjeta:** un depósito de NetPay (venta bruta) y su comisión e IVA del mismo día contra la venta con tarjeta de Dodo IS de días anteriores al depósito, en un lapso de hasta 7 días.
- **Cobro de Rappi:** depósitos contra paidlots de reportes financieros vigentes.
- **Nómina:** cargos de la dispersión, opcionalmente con la nómina real del mes.
- **Sin documento:** con concepto y nota obligatoria (comisiones bancarias, IMSS, préstamos, traspasos…).

Un movimiento, un pago, un día de venta y un paidlot pertenecen a lo más a una conciliación activa. Los montos y la diferencia los calcula la base; una diferencia distinta de cero exige nota. Anular exige motivo y libera los vínculos.

## Sugerencias

La app sugiere y admin confirma; "Confirmar exactas" solo confirma las que tienen documento y diferencia cero. Las reglas están en `lib/banca/conciliacion.ts`. El Excel de Banregio recorta la descripción a unos 60 caracteres; por eso las reglas leen descripción y referencia, y la nómina se marca a mano con el botón Nómina cuando el texto no la identifica.

## Activación

1. Ejecutar `supabase/migrations/20261029200000_banca_conciliacion.sql` en Supabase.
2. Ejecutar `supabase/pruebas/20261029200000_banca_conciliacion.sql`. Necesita un admin activo, una razón social con un día de venta con tarjeta y un pago por transferencia registrados. El `RAISE` final `PRUEBAS OK` es intencional y revierte los datos de ensayo.
3. Confirmar ese resultado antes de integrar el PR que activa la pantalla.
4. Usar Banca → Conciliación.
