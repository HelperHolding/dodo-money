# Conciliación de ventas Dodo IS

Aplicar `supabase/migrations/0034_conciliacion_ventas.sql` y luego `supabase/pruebas/0034_conciliacion_ventas.sql`. La prueba termina con ERROR intencional PRUEBAS OK y revierte sus datos. Requiere admin, corporativo y sucursal; utiliza el día reservado 2020-01-02 si no existe.

Ventas → Conciliación permite revisar por mes/sucursal el total diario, suma de productos y diferencia. Solo el admin guarda y anula; gerente consulta su sucursal y corporativo consulta todas. Los importes originales y cada conciliación permanecen auditados.

Una corrección redistribuye efectivo/tarjeta/en línea conservando exactamente su suma original. No modifica venta, IVA, productos, costos ni pedidos; ajusta los cobros del tablero, la comparación con cierres y las comisiones estimadas del P&L. El canal agregador importado de Dodo IS conserva sus cobros: el ajuste no puede dejarlos por debajo de esa base. El detalle de pedidos sigue mostrando los medios de pago originales.

La casilla de productos justifica expresamente la diferencia para mostrar la venta bruta disponible, no agrega ventas ni altera importes para forzar el cuadre. Sin productos en un día con venta no se puede aprobar. La tolerancia automática del P&L se iguala a la importación: $1 por día, con detalle presente. Diferencias mayores requieren aprobación y motivo; sin aprobación, el bruto del periodo conserva Sin dato.

Cada conciliación queda ligada al ID de la importación. Reimportar invalida su aplicación y conserva su historial. La pantalla avisa Importación reemplazada; requiere nueva revisión. Para corregir una conciliación vigente, primero se anula con motivo y luego se registra otra. El servidor bloquea formularios de importaciones reemplazadas, duplicados y escrituras directas.

Durante un despliegue sin la nueva migración las lecturas conservan el comportamiento anterior; la pantalla muestra que falta 0034. Los errores de consulta ajenos a una tabla/vista ausente se reportan. No se modifica Dodo IS ni se aplica una corrección a las órdenes de Rappi.
