# Export de corrida para Tesorería

Desde Compras → Pagos, abrir «Exportar corrida para Tesorería» en el calendario. Al seleccionar un día se propone ese día; al cambiar de mes se propone el mes completo. Se pueden cambiar rango y fecha de corrida. Respeta proveedor, sucursal y complemento pendiente del calendario.

GET /reporte/pagos/excel consulta los saldos actuales con el perfil de la sesión. Solo administración y corporativo pueden exportar; no usa service_role ni modifica pagos, reservas, fechas o facturas. Respuesta XLSX privada sin caché. No requiere migración.

Se adapta Corrida_de_Pagos_09_Octubre_2026.xlsx a la preferencia confirmada: Resumen, una hoja por sucursal (Oficina cuando corresponde) y Pendientes de revisión. Conserva bandas oscuras, agrupación por proveedor y razón social, saldo pendiente frente a importe original, fechas, forma prevista, ubicación, notas y totales. Los importes se suman en centavos. Usa el RFC propio de cada factura; las razones sociales no se infieren por sucursal.

La fecha efectiva es la programada, o la sugerida calculada con las mismas reglas del calendario. Solo entran ingresos por pagar o parciales con saldo positivo dentro del rango. Pagadas, canceladas y notas de crédito no se incluyen como pagos nuevos. El saldo ya incorpora los abonos y créditos existentes. Una factura se cuenta una vez aunque tenga varias órdenes de la misma sucursal. Si cubre varias sucursales sin distribución monetaria, se conserva en Pendientes como NO INCLUIDO; no se replica el saldo en varias hojas. Resumen muestra ese importe separado y reconcilia el total seleccionado con incluido + sin distribuir.

Falta de forma prevista, documento manual, complemento pendiente o receptor histórico inactivo se señalan como INCLUIDO · REVISAR. Estos registros ya están en la hoja de sucursal; Pendientes no se agrega otra vez al total. No se presupone Banregio o Paywise, ni se consultan saldos bancarios. Flujo disponible queda editable y vacío. Una diferencia no se calcula hasta capturar flujo; el cero explícito sí calcula diferencia. La fecha de corrida es una celda editable nombrada FECHA_CORRIDA y controla el estado Vencido/Abierto. No recupera saldos históricos ni vuelve a consultar Dodo MX al editar el Excel.

El escritor XLSX existente incorpora fórmulas con resultados guardados, estilos por celda, combinaciones, filas congeladas, alturas y áreas de impresión. Los textos provenientes de documentos se escriben como texto, incluso si empiezan con «=». Hay pruebas de selección, duplicados, centavos, nombres de hojas, fórmulas, ZIP, permisos HTTP y filtros. El ejemplo de QA contiene datos simulados; se revisó con Artifact Tool, incluidos el cambio de fecha y el flujo vacío frente a cero.

Las hojas de sucursal y Pendientes incluyen UUID cuando existe; queda vacío para documentos sin UUID. Todas las hojas incluyen una liga clicable al calendario de pagos de producción de Dodo MX. La liga requiere iniciar sesión y no registra pagos.
