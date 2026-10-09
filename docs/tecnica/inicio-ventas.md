# Dashboard de ventas en Inicio

Inicio de sucursal y Vista general corporativa integran un dashboard para admin y corporativo. Mes actual hasta hoy por defecto; meses anteriores completos. Se puede seleccionar una sucursal visible o consolidar todas. La sucursal del tablero no cambia la sucursal de operación.

Indicadores: venta total con IVA, neta sin IVA, pedidos registrados y ticket promedio con IVA. Incluye comparación contra el periodo anterior del mismo largo (fechas explícitas), barras diarias, participación por fuente POS/Rappi y tabla de canales. Se enlaza al reporte completo con el mismo periodo y sucursal.

Se reutiliza datosVentas y resumenVentas para conservar la definición del reporte y las decisiones de fuente de Rappi. Rappi finalizado marcado para sumar cuenta por subtotal restaurante; no representa depósitos ni ventas después de comisión. Las consultas respetan RLS y paginan. No se consulta el dashboard para otros roles. Un error no se convierte en venta cero ni bloquea el resto de Inicio.

No se completan días ausentes con ceros. Se muestra cobertura y última fecha por canal dentro del periodo; no se declara completitud de importaciones ni exactitud de comparaciones incompletas. Cambios relativos carecen de comparación si el periodo anterior no tiene datos o su importe era cero.

Validación: 454 pruebas, TypeScript, build y render SSR simulado para admin/corporativo, rechazo de gerente y estado vacío. No requiere SQL ni cambia datos. La revisión visual en navegador está pendiente.
