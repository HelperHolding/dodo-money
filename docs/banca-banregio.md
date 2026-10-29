# Banregio: importación de movimientos

## Alcance

La carga incorpora reportes documentales de cuenta de cheques en MXN. No crea pagos de facturas, ventas, gastos, asientos de P&L ni salidas de caja o bóveda. La conciliación se documenta en `docs/banca-conciliacion.md`.

Solo administración importa. Administración y corporativo pueden consultar movimientos y descargar el Excel original. Gerentes, encargados, operación y usuarios anónimos no tienen acceso a Banca.

## Formato admitido

Excel `.xlsx` original de Banregio, hasta 2 MB y 2,000 movimientos, una hoja visible, sin fórmulas. La cabecera identifica cuenta, CLABE, titular, RFC, periodo solicitado y saldo inicial. Las columnas son Fecha, Descripción, Referencia, Cargo, Abonos, Saldo y Clasificación.

Se leen los importes en centavos enteros. Cada fila debe contener un cargo o un abono positivo y enlazar exactamente con el saldo anterior. Se rechazan fechas inválidas, fuera del periodo, desordenadas y, al guardar, futuras. Los textos se conservan, incluyendo la referencia original y la fila fuente.

El RFC debe existir activo en el catálogo de razones sociales. La cuenta queda vinculada a ese RFC y a su CLABE sin reasignación automática. La moneda MXN y la asignación se confirman antes de guardar. Por omisión, los movimientos quedan sin sucursal; una cuenta compartida no se atribuye a una sucursal a partir del nombre o domicilio.

## Duplicados y procedencia

- Guardar vuelve a leer el archivo y compara el SHA revisado. Cambiar archivo o sucursal obliga a revisar otra vez.
- Una solicitud repetida con el mismo contenido devuelve el mismo resultado. Una solicitud reutilizada con otros datos se rechaza.
- El mismo archivo, aunque se renombre, no vuelve a cargar movimientos.
- Un archivo distinto puede compartir días completos idénticos y agregar días nuevos. Cada movimiento conserva su primera fuente y sucursal. Cada importación registra sus filas y vínculos, incluyendo los repetidos.
- La huella incluye fecha, descripción, referencia, cargo, abono y saldo. No se elimina por referencia sola: una comisión y su IVA pueden compartirla.
- Si un día cargado difiere, está incompleto o sus movimientos cambiaron de orden con otros saldos intermedios, se bloquea toda la importación. Esta entrega no reemplaza ni corrige movimientos existentes.
- Se comprueba el enlace de saldos entre fechas inmediatamente contiguas ya registradas. No se presupone cobertura de fechas sin reporte.

El Excel se conserva en `banca_archivos`, con RLS y sin escritura directa. La importación almacena SHA-256, autor, fecha, periodo solicitado, fechas efectivas y resumen. No hay bucket público. La descarga exige sesión y permiso financiero, y responde sin caché.

## Lectura de saldos

Se muestra el último saldo **reportado**, con fecha del último movimiento. El rango solicitado por el reporte no demuestra cobertura completa. El resumen usa el reporte con la última fecha efectiva por cuenta; no representa una consulta en línea al banco. Los movimientos del día se ordenan por su fila original, en orden descendente en la vista.

## Activación

1. Ejecutar `supabase/migrations/20261020230000_banca_banregio.sql` en Supabase.
2. Ejecutar `supabase/pruebas/20261020230000_banca_banregio.sql`. El `RAISE` final que comienza con `PRUEBAS OK` es intencional y revierte los datos de ensayo.
3. Confirmar ese resultado antes de integrar el PR que activa el formulario y las consultas. No requiere cargar los reportes reales desde SQL.
4. Publicar por PR y usar Banca → Banregio → Importar Excel. Revisar cada reporte y confirmar el guardado.

Las pruebas del parser son parte de `npm test`. El SQL reversible comprueba importación, idempotencia, preservación del original, solapamientos, continuidad, permisos y bloqueo de escritura directa. Los reportes bancarios reales no se incluyen en el repositorio ni en fixtures públicos.
