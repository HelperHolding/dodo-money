# Panel de aperturas

El detalle de cada proyecto muestra indicadores, distribución por estados y un roadmap. No requiere migración. Conserva permisos y acciones existentes.

- Avance: actividades completadas entre actividades aplicables; excluye `no_aplica`. Sin actividades muestra un guion, no 0 %.
- Recepción: unidades recibidas entre cantidades de equipo conocidas y positivas. Cada recepción se limita a la cantidad requerida para no inflar el porcentaje. Excluye referencias y equipo por validar; muestra conceptos sin cantidad.
- Compras: estimado parcial de cantidades por precios capturados, calculado con `resumenApertura`. No representa comprometido ni pagado; muestra faltantes de cotización y presupuesto cuando está definido. Las referencias por validar no suman al estimado.
- Atención: unión de registros bloqueados y vencidos aplicables, sin contar dos veces el mismo registro. Vencido significa fecha final anterior al día de México, sin estar completado o verificado.

Las donas cuentan conceptos, no unidades: pendientes, en curso/pedidos, recibidos/instalados, bloqueados y terminados/verificados. Su leyenda y segmentos enlazan a listas filtradas. La recepción y la verificación son estados distintos.

El roadmap calcula avance de actividades por etapa. Bloqueos y atrasos incluyen todos sus conceptos aplicables. Los colores llevan texto: rojo bloqueo, ámbar atraso, verde actividades completadas, azul en curso y gris pendiente. Las fechas corresponden a la ventana capturada de actividades; no se inventan fechas ni responsables.

La página admite `grupo`, `etapa` y `tipo`, además de sus filtros anteriores. `vista=alertas` abre los registros que requieren atención. Los indicadores permanecen calculados sobre el proyecto completo al filtrar una lista.

Verificación: pruebas en `lib/aperturas.test.ts` cubren bases de los porcentajes, exclusiones, recepción parcial/excedentes, fechas y alertas únicas. Revisión visual local del componente real con datos de ejemplo en escritorio y celular; sin modificar producción.
