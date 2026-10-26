# Asignación contable con revisión

El catálogo del PR 52 es referencia. Esta entrega añade una clasificación exacta por concepto de factura (cabecera únicamente si no tiene conceptos), gasto y ajuste de gastos del mes. Incluye los históricos que tengan cobertura en octubre, aunque la factura sea de otro mes. Las nuevas capturas aparecen en el mismo flujo después de guardar el origen; la ficha de factura y Gastos enlazan a la revisión. No hay asignación masiva ni herencia silenciosa por proveedor.

## Uso y equivalencias

1. P&L → Asignar cuentas → octubre 2026. Revisar documento, categoría, RFC e importe de referencia. La lista tiene páginas de 50 y contador; no es un reporte de importes devengados ni netos (las notas de crédito y descuentos conservan su tratamiento en el P&L).
2. Elegir la razón social si el gasto no la identifica. La factura conserva su receptor. Solo cuentas capturables de esa entidad; títulos y mayores quedan fuera. Una subcuenta de nivel 2 solo es capturable si no tiene auxiliares activos para esa entidad.
3. Las referencias de la categoría son alternativas del maestro, nunca una asignación por coincidencia del nombre. Elegir cuenta, abrir vista previa, revisar origen, anterior/propuesta y RFC, y confirmar con motivo de 12–1000 caracteres.
4. Corregir o retirar por el mismo flujo. Cada versión conserva autor, fecha, motivo, cuenta anterior y fotografía de metadatos revisados. El archivo original continúa en su módulo.

Se protege la separación entre compras de insumos (502, memo), inversiones (15x/17x, memo), gastos de tienda (602) y oficina (603). El RFC histórico inactivo requiere corregir primero el origen con su procedimiento existente; nunca se remapea por parecido. No se infiere tratamiento fiscal por falta de XML.

## Datos y permisos

Catálogo inmutable para los usuarios, semilla versionada por SHA-256 del archivo. `contabilidad_asignaciones` es un diario sin UPDATE/DELETE/INSERT para authenticated. Su vista actual toma la mayor revisión, no el timestamp. Función pública invoker delega en función privada definer de búsqueda vacía, con validación de administrador activo, confirmación, fuente, entidad/sucursal y cuenta. Corporativo consulta; gerente/encargado/anónimo no asignan ni consultan el diario.

Bloqueos de origen + por clave y solicitud, versión anterior esperada y huella de origen impiden confirmaciones obsoletas. Cambiar un dato de la factura, incluso pagos o estado, invalida la huella: la clasificación se muestra «Revisar», no se considera verificada automáticamente. Facturas canceladas/sustituidas y gastos anulados salen de pendientes; su historial conserva acceso por la ruta original.

## P&L por cuentas y documentos

La vista predeterminada «Por cuentas» muestra meses (o semanas) en columnas, categorías operativas como subtotales y cuentas exactas como subcuentas. Se pueden contraer y abrir los importes del periodo o acumulado. El diálogo presenta fecha, factura/concepto, proveedor, RFC, UUID y aportación neta devengada, con vínculo al origen. Los subtotales y resultados también tienen desglose con signo: ingresos suman, costos y gastos restan; no se duplican filas de canal ni subtotales.

La agrupación toma las aportaciones ya calculadas por `datosPL`, nunca los importes de referencia de `contabilidad_movimientos`. Una factura conserva la base subtotal menos descuento, el signo de nota de crédito y el prorrateo por cobertura, incluso si el XML cambió la cabecera y se conservaron los conceptos previos. CP242 es el caso de control: base XML 2,972.03 y concepto original 2,940.00. El gasto informativo mantiene la fecha real y no mueve efectivo otra vez. Las compras de insumos capturadas como gasto también entran al memo.

Solo una asignación vigente cuya huella coincide con el origen se muestra como cuenta confirmada. Pendientes, retiros y cambios de origen conservan sus importes, separados para revisión. Ventas, costo teórico, nómina, comisiones y otros cálculos se identifican como fuentes calculadas; no se les inventan facturas ni una cuenta exacta por inferencia. Las diferencias de redondeo o fuentes sin detalle se muestran explícitamente. El reparto de oficina expone sus facturas y la proporción aplicada; un saldo sin detalle permanece visible.

Se conservan «Contra meta», «Comparativo» y los PDF/Excel operativos. La exportación específica de la nueva tabla por cuentas no se incluye en esta entrega. El resultado sigue siendo provisional cuando faltan costos, mermas o reportes financieros; no se reemplaza el costo teórico por costo real.

## Correcciones revisadas de octubre

El lote `CUENTAS-OCTUBRE-20261026` contiene 78 conceptos de 32 facturas y nueve gastos (41 documentos; 87 equivalencias). El JSON y SQL de `supabase/correcciones/2026-10-26_*` contienen el plan exacto. Son documentos revisados individualmente, no reglas automáticas para cualquier proveedor.

Confirmaciones de Sebastián: renta/agua/gastos menores son Helper; Periquera es publicidad; cámaras es monitoreo; BGL6963 y FGDLCRE16133 corresponden a La Calma; Walmart 106 es insumos. BGL6973 y BGL6918 son gasto de limpieza de octubre, confirmado expresamente durante esta entrega. Se excluyen los documentos de septiembre. Las compras de insumos permanecen en memo para no duplicar el costo de venta.

La corrección conserva una fotografía antes/después en `contabilidad_origen_historial`, además de notas de factura e historial de gastos. Valida conceptos, importes, categorías, RFC y sucursal revisados; solo corrige RFC en un origen manual sin UUID. Si una orden vinculada tiene una sucursal o RFC incompatible, detiene todo para revisión. El historial usa la identidad administradora activa `scervera@dodopizza.mx`; si no existe exactamente ese perfil activo, no hace nada.

Un bloqueo breve y comparación completa antes/después protegen pagos, aplicaciones, reservas, cierres, recolecciones (incluida 004), movimientos y arqueos. Las líneas originales y los importes no cambian. Repetir la misma corrección no duplica diario ni historial; si el origen cambió después, se rechaza para no sobrescribir. Las asignaciones se calculan después de corregir todos los conceptos y la cabecera, para guardar la huella final.

## Instalación y validación

La primera migración y pruebas `20261024001536_cuentas_contables_exactas.sql` ya fueron reportadas como satisfactorias por Sebastián. Esta ampliación requiere, en orden:

1. `supabase/migrations/20261026155811_revision_octubre_cuentas.sql`: bitácora protegida y permite reclasificar un gasto a insumos memo desde administración. No aplica equivalencias reales.
2. `supabase/pruebas/20261026155811_revision_octubre_cuentas.sql`: ensaya las correcciones completas sobre los registros reales y termina con ROLLBACK; devuelve una fila «PRUEBAS OK». No guarda las asignaciones.
3. `supabase/correcciones/2026-10-26_cuentas_octubre.sql`: solo después del ensayo correcto; aplica el mismo plan y devuelve «CUENTAS OCTUBRE OK», 87 equivalencias y 41 documentos.

Sebastián ejecuta producción y entrega los resultados antes de publicar, según AGENTS.md. No se ejecutaron modificaciones de producción desde esta sesión.

Validación local: 641 pruebas, typecheck y build. PostgreSQL/PGlite con esquema de apoyo: migraciones, ensayo reversible sin guardar filas, aplicación de las 87 equivalencias, repetición sin duplicados, rechazo de deriva, permisos sin escritura directa y conservación de pagos/entrega 004. Falta la ejecución con el esquema completo y datos actuales en Supabase. La tabla real y su diálogo fueron probados en navegador con datos ficticios (abrir importe mensual/acumulado, contraer y cerrar con Escape devolviendo el foco). La prueba visual no acredita la conciliación de producción.
