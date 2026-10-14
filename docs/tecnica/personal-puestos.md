# Altas, bajas y plantillas de puesto

0061 amplía los perfiles 0051. Administración gestiona; corporativo consulta. Nuevas tablas con RLS y sin escritura directa: personal_puestos y personal_movimientos. RPCs guardan plantillas, condiciones con trazabilidad y baja con fecha, motivo y autor. Repetir una solicitud no duplica el movimiento ni el empleado. Versiones previas protegen de sobreescritura concurrente.

La carga 0061_puestos_zapopan crea solo Jefe de turno ($13,800) y Pizzero/cajero ($12,000), desde el último desglose completo registrado. No crea variante $6,800 ni usa la excepción de Ricardo de septiembre; tampoco modifica empleados existentes. Plantillas ligadas a la sucursal de la fuente; no se reutilizan en otra sucursal sin una base propia. No se copian nombre, código, ingreso ni baja.

Al aplicar una plantilla se llenan puesto, renglón y ocho importes mensuales. Se permite revisar y ajustar para la persona; se exige confirmar revisión de fuente, cargas y ajuste del reporte. Estas bases históricas no son cálculos fiscales nuevos ni nóminas reales confirmadas. Guardar un perfil no genera pago ni P&L; sigue el flujo existente de borrador y confirmación de nómina.

Baja usa último día laborado. Conserva historial, fuente y nóminas confirmadas. Mes parcial requiere importes reales según generarPersonal; meses posteriores excluyen a la persona. No se calcula finiquito ni se comunica alta o baja a IMSS. Si la baja es anterior a la última vigencia, se detiene para revisar historial; una baja futura ya programada no admite otra duplicada. Si los importes vencieron antes de la baja, se dejan pendientes en la nueva versión y se conserva la original.

Puede guardar otro desglose completo como plantilla desde una ficha. Plantillas inmutables: nombre distinto para nueva base; no sobrescriben empleados al cambiar. Edición de condiciones conserva las versiones 0051 y añade evento de cambio. Un cambio manual de fecha de baja se refleja en versiones y movimiento de cambio; el botón dedicado genera movimiento de baja. Registros heredados conservan su historial previo aunque no tengan evento de alta nuevo.

Orden de aplicación: migración, prueba reversible, carga inicial. Falta verificar altas/bajas reales tras publicar. Mantener permisos por empresa al ampliar el alcance multiempresa de los helpers de Finanzas.
