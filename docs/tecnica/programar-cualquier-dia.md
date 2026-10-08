# Programación de pagos cualquier día — 0045

La programación individual desde la factura y la programación en bloque aceptan cualquier fecha desde hoy. Los días configurados (viernes por omisión) siguen sugiriendo fechas y ahora se muestran como recomendados en Programar pagos y Datos de la empresa.

Se conservan permisos de administración, facturas por pagar/parciales, rechazo de fechas pasadas y la opción de quitar la fecha individual dejando el campo vacío. Programar no registra un pago. Al registrar un pago real fuera de los días habituales se conserva el motivo obligatorio existente.

Ejecutar migración 0045 y prueba 0045 en Supabase antes de fusionar. La excepción final PRUEBAS OK revierte el ensayo, incluida la configuración temporal de viernes.
