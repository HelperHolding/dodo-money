# Conciliación de bóveda · 27/10/2026

La diferencia autorizada para regularización es $589.78: los $589.70 mencionados dejarían ocho centavos pendientes. Se usa el objetivo explícito de $7,369 (fondo $4,500 + efectivo del 26 por $2,869), sin incluir las ventas del 27 ni los $500 de caja.

La causa queda como declaración del usuario: error técnico por fallas de internet y órdenes canceladas. No se afirma que se haya verificado con órdenes concretas. No se cancelan ni cambian ventas para justificarla.

El ajuste tiene registro independiente con referencia única, autor, fecha, motivo y saldos antes/después. La tabla solo permite consulta por usuarios autenticados con acceso a la sucursal; no hay escritura directa desde el cliente. Se integra al saldo de bóveda y al cálculo de cierres nuevos; los ajustes anteriores al último conteo no se vuelven a sumar. No se crean gastos ni cambios en las fuentes del P&L. Los cierres y entregas existentes quedan intactos.

## Ejecución

1. Sebastián ejecuta `supabase/migrations/20261027235402_ajustes_conciliacion_boveda.sql` completa. Instala el registro sin crear aún el ajuste.
2. Ejecuta completo `supabase/correcciones/2026-10-27_ajuste_conciliacion_589_78.sql` sin cambios: ROLLBACK ensaya. Compartir resultado antes de aplicar.
3. Tras revisar el ensayo, cambiar solo el último ROLLBACK por COMMIT y ejecutar todo el archivo. La referencia única evita un segundo descuento.
4. Si la recolección de $21,980 continúa pendiente, otro administrador distinto de Sebastián (quien la preparó) debe confirmar la salida ya efectuada mediante el flujo existente. No se inventa firma ni se vuelve a retirar el dinero. Mientras está pendiente, el saldo registrado tras el ajuste será $29,349 y el remanente proyectado $7,369; confirmada la salida, el saldo será $7,369.

El script falla si el saldo, entrega o importe dejan de coincidir. No impone el objetivo sobre movimientos nuevos. La UI dependiente se integra/publica después del resultado de Supabase y checks aprobados.

Pruebas locales: PostgreSQL aislado con PGlite carga la migración y la corrección reales; entrega pendiente/confirmada, ROLLBACK, COMMIT, reintento, continuidad del cierre, aislamiento por sucursal, ausencia de escritura del cliente y conservación de movimientos y facturas. No sustituye la verificación en producción.
