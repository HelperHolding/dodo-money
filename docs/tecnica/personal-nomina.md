# Personal y preparación de nómina

## Flujo

Finanzas → Personal contiene perfiles por sucursal y fichas individuales. Nombre, puesto, renglón, ingreso, baja y condiciones mensuales se versionan por vigencia. Código CONTPAQi y sucursal identifican el perfil; cambiar código conserva su valor en el historial. La sucursal del perfil es fija en este flujo (un traslado de personal no está implementado). Administración gestiona y corporativo consulta, conforme a los permisos actuales de nómina; gerente/operación no acceden a estos importes.

En Nómina, seleccionar mes y lugar y elegir Generar desde Personal. Se guarda un borrador con la versión de cada perfil usada, fuente y usuario. Todavía no altera el P&L ni registra pagos. Revisar y confirmar toma todos los empleados del borrador y usa guardar_nomina_real (0050): reemplaza la plantilla estimada del lugar y mes, conserva ajustes manuales e historial. Se impide doble confirmación y se rechaza confirmar si otro usuario cambió la nómina real desde que se preparó el borrador. Confirmar no modifica automáticamente las condiciones del perfil.

Un campo vacío significa pendiente; cero es un valor confirmado. Cuando falta un importe o venció la vigencia, se requiere completarlo. Si hubo ingreso, baja o cambio de condiciones durante el mes, el borrador deja los importes pendientes para capturar el valor real del periodo: no calcula automáticamente sueldo proporcional ni impuestos. Las fechas de ingreso no conocidas permanecen vacías. Una baja excluye al empleado de meses posteriores.

## CONTPAQi

Acepta .xlsx hasta 4 MB, Lista de Raya tabular del mes completo, formato del Acumulado Septiembre.xlsx proporcionado. Verifica periodo, encabezados de columnas y sumas de percepciones/obligaciones contra Total Gral. Usa C como sueldo y diferencia I−C como bonos/otras percepciones. IMSS empresa AG es un subtotal; no se suman nuevamente AA/AC/AF/AI. Cesantía AB, retiro AD, impuesto AE e Infonavit AH. Ajuste = AK−AG−AB−AD−AE−AH para conservar el total patronal reportado.

Vincula por código y nombre normalizados con el perfil del mes y sucursal; rechaza empleados repetidos, desconocidos o nombres discordantes. Los perfiles activos que no están en el archivo siguen en el borrador con importes pendientes, sin reutilizar una estimación. Muestra diferencias con las condiciones del perfil cuando estaban completas. La fuente conserva nombre de archivo y SHA256; no se almacena el archivo original. Los cambios del perfil posteriores no cambian borradores ni nóminas ya confirmadas.

Bonos/otras percepciones se muestran como componente del desglose de nómina. Los registros de 0050 sin bono mantienen valor cero; no cambian sus totales. Se conserva el P&L agrupado en Nómina cocina y Nómina gerencia.

## Carga inicial

0051_personal_zapopan.sql precarga seis perfiles desde el desglose confirmado de septiembre (0050). Los cinco códigos 001–005 vienen del archivo. Ricardo usa RV-PENDIENTE hasta informar su código CONTPAQi, editable en la ficha. Sus 22,000 completos sin cargas son una excepción de septiembre. Se guarda septiembre como antecedente hasta 30/09 y una versión desde 01/10 con importes pendientes para los seis; no extrapolar cuotas de septiembre. No se inventan fechas de ingreso, no se vuelve a cargar nómina real y no se generan pagos.

La carga es repetible si el perfil inicial coincide; ante otro perfil existente aborta para evitar sobrescribirlo. Ejecutar migración, prueba reversible y luego carga inicial. El ensayo termina en PRUEBAS OK, la carga en CARGA OK con seis perfiles.

## Validación

Pruebas TypeScript cubren vigencia, aislamiento por lugar, baja, meses parciales, correcciones, campos pendientes, columnas CONTPAQi, bonos, ajuste reportado, vínculo y faltantes. Lectura del Excel real: 5 empleados, sueldo 58,400 y obligaciones 19,627.24. Ensayo SQL cubre permisos, historial, guardas de sobrescritura, borrador sin P&L, pendiente, bono, confirmación única y helper privado.

TypeScript y build comprueban integración. Se renderizaron las tres pantallas con datos de ejemplo sin importes NaN; el borrador de seis personas expone 48 campos monetarios obligatorios. No se pudo hacer revisión visual en navegador: la vista local no fue accesible. No se ejecutó SQL en Supabase por el asistente; requiere resultado del usuario.
