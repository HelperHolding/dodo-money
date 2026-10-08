# Banco y Balance general · preparación

Solicitud del 7 de octubre de 2026. Banco confirmado: Banregio, con exportación Excel. El usuario aportará un balance existente como punto de arranque. Estos módulos aún no están implementados; no existen nuevas tablas ni rutas publicadas.

## P&L

El estado de resultados presenta venta neta sin IVA y después de descuentos, con detalle POS/Dodo IS y Rappi y costos por canal. Se retiran los tres renglones de venta bruta en pantalla, comparativo, PDF y Excel. El cálculo de márgenes y EBITDA permanece igual. La fuente original importada y el cálculo del bruto por productos se conservan para las consultas de ventas.

## Banco: flujo a implementar con el Excel real

1. Dar de alta las cuentas bancarias y su alcance por sucursal u oficina. Guardar nombre, banco, moneda, referencia de cuenta y fecha/saldo inicial.
2. Cargar el Excel de Banregio. Revisar sus hojas, fechas, cargos, abonos, referencias y saldos antes de definir el mapeo. Mostrar una vista previa con ingresos, egresos y filas rechazadas antes de confirmar.
3. Conservar archivo, origen y valores originales. Detectar cargas repetidas y periodos superpuestos sin eliminar operaciones idénticas legítimas. El criterio de identidad dependerá de las referencias reales del banco.
4. Mostrar movimientos por cuenta y periodo, ingresos, egresos y saldo; estados pendiente, parcialmente conciliado y conciliado.
5. Vincular egresos con pagos registrados en Compras e ingresos con cobros o liquidaciones identificados. Contemplar un depósito que agrupa cobros y pagos parciales; no asumir que una venta equivale a un depósito bancario.
6. Exponer diferencias, comisiones, movimientos sin contraparte y transferencias entre cuentas. Mantener motivo e historial de correcciones y permitir revertir una conciliación sin modificar el archivo ni el pago original.

Administración gestiona; corporativo consulta. RLS y RPC validarán los permisos y montos en el servidor. La importación bancaria no creará automáticamente ventas, gastos ni pagos para evitar duplicar los registros actuales.

## Balance general: preparación del arranque

Recibir el balance existente con su fecha de corte, cuentas, saldos y alcance. Mapearlo antes de cargarlo y comprobar su cuadre. Identificar cómo enlazar cada cuenta con bancos, proveedores, activos y demás fuentes existentes; documentar partidas que todavía requieren captura o ajustes contables.

Definir con el usuario la fuente y reglas de actualización de cada saldo, incluyendo su historial y las correcciones. No convertir el EBITDA en un saldo de capital ni usar automáticamente valuaciones comerciales de activos como valor contable. No publicar un balance completo calculado únicamente con los datos operativos actuales.

## Pendiente de recibir

- Excel real de movimientos Banregio, preferiblemente de un periodo cerrado.
- Balance existente con fecha de corte y cuentas/saldos.

La siguiente implementación requiere estos archivos para verificar formatos, correspondencias y saldos de referencia. El importador y las pruebas SQL se entregarán después de inspeccionarlos.
