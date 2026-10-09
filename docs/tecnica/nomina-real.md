# Nómina real mensual

La nómina real reemplaza toda la plantilla estimada del lugar y mes. Los ajustes manuales de nomina_ajustes siguen sumándose: revisar si ya representan importes contenidos en el reporte antes de cargarlo. Sin captura real se conserva la plantilla estimada existente; la captura de septiembre no se extrapola a octubre.

Cada empleado guarda sueldo bruto (o una excepción documentada), IMSS patronal, cesantía, retiro, impuesto estatal, Infonavit y ajuste al total patronal reportado. IMSS empresa es un subtotal: no sumar además invalidez, enfermedad, riesgo y guardería. Las deducciones del trabajador no se suman al costo. La captura no genera pagos, facturas ni movimientos bancarios. Si después se registra una factura por estas mismas obligaciones, revisar su cuenta para no duplicar el gasto.

Administración captura y corrige mediante RPC; corporativo consulta. Cada corrección anula la versión anterior y guarda otra; conserva fuente, usuario y fechas. El ID previo exige revisión de la versión actual y evita sobrescritura. Anular requiere motivo y restaura la plantilla estimada del mes. Las consultas financieras respetan la restricción de contraseña temporal de 0048.

## Septiembre 2026, Zapopan-1

Fuente: Acumulado Septiembre.xlsx, Hoja1 I14:AK18. Brandon y Gael se asignan a gerencia, los otros tres a cocina/operación conforme a la clasificación del usuario. Obligaciones reportadas: 19,627.24; conceptos suman 19,650.74. Se preserva el total reportado mediante ajustes por empleado que suman -23.50. Sueldos de estos cinco: 58,400.00. Ricardo Villa, Gerente Distrital: excepción de 22,000.00 completos sin cargas en septiembre. Total base: 100,027.24 (cocina 41,109.16 y gerencia 58,918.08), antes de ajustes manuales existentes.

Desde octubre Ricardo debe tener sueldo bruto y obligaciones patronales; faltan esos importes. No se inventan ni se extrapolan. Mientras no se capture nómina real de octubre el sistema continúa mostrando la plantilla estimada que ya existía.

## Instalación y verificación

1. supabase/migrations/0050_nomina_real.sql.
2. supabase/pruebas/0050_nomina_real.sql: reversible, termina en PRUEBAS OK.
3. supabase/cargas/0050_nomina_septiembre.sql: carga real, termina en CARGA OK. Es repetible si los datos coinciden y rechaza sobrescribir otra nómina existente. Requiere Zapopan-1 y admin activo.

Pruebas TypeScript: sustitución de plantilla, ajustes separados, prorrateo semanal, aislamiento por lugar y no extrapolación al siguiente mes. SQL valida permisos, importes, versiones, historial y anulación. Compilación y tsc validan integración; la prueba SQL se ejecuta en Supabase por el usuario.
