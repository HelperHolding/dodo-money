# Panel de aperturas

El detalle de cada proyecto muestra indicadores, distribución por estados y un roadmap. No requiere migración. Conserva permisos y acciones existentes.

- Avance: actividades completadas entre actividades aplicables; excluye `no_aplica`. Sin actividades muestra un guion, no 0 %.
- Recepción: unidades recibidas entre cantidades de equipo conocidas y positivas. Cada recepción se limita a la cantidad requerida para no inflar el porcentaje. Excluye referencias y equipo por validar; muestra conceptos sin cantidad.
- Compras: estimado parcial de cantidades por precios capturados, calculado con `resumenApertura`. No representa comprometido ni pagado; muestra faltantes de cotización y presupuesto cuando está definido. Las referencias por validar no suman al estimado.
- Atención: unión de registros bloqueados y vencidos aplicables, sin contar dos veces el mismo registro. Vencido significa fecha final anterior al día de México, sin estar completado o verificado.

Las donas cuentan conceptos, no unidades: pendientes, en curso/pedidos, recibidos/instalados, bloqueados y terminados/verificados. Su leyenda y segmentos enlazan a listas filtradas. La recepción y la verificación son estados distintos.

El roadmap calcula avance de actividades por etapa. Bloqueos y atrasos incluyen todos sus conceptos aplicables. Los colores llevan texto: rojo bloqueo, ámbar atraso, verde actividades completadas, azul en curso y gris pendiente. Las fechas corresponden a la ventana capturada de actividades; no se inventan fechas ni responsables.

Equipo y compras agrupa por `categoria` (pestañas del plano, `CATEGORIAS` en `lib/aperturas.ts`): cada tarjeta muestra conceptos instalados o verificados entre aplicables y filtra la lista. Las categorías marcadas como obra no entran a Recepción ni a la dona de equipo; sus enlaces usan `ambito=equipo`.

`vista=checklist` arma cuatro módulos con `checklistApertura` (`MODULOS_CHECKLIST`): primero los resúmenes por grupo (categorías de equipo, validaciones técnicas) y después cada actividad de sus etapas. El avance de cada módulo cuenta conceptos listos; el general promedia los módulos para que las piezas de compras no tapen al resto.

El Checklist es la vista predeterminada (sin `vista`). Con permiso de compras, cada casilla abre `VentanaEstado` (`ChecklistEditable.tsx`); `validarCambioEstado` replica en la ventana las reglas de la función de base y `datosCambioEstado` conserva los demás campos del registro.

El Checklist calcula sus módulos en el navegador (`ChecklistEditable`) a partir de `ItemChecklist`. Recibe cambios por el canal `apertura-<proyecto>` de Realtime (`postgres_changes` de `apertura_items`, filtrado por `proyecto_id`) con el cliente de `lib/supabase/navegador.ts`, que usa la sesión del usuario para respetar RLS.

La página admite `grupo`, `etapa`, `tipo`, `cat` y `ambito`, además de sus filtros anteriores. `vista=alertas` abre los registros que requieren atención. Los indicadores permanecen calculados sobre el proyecto completo al filtrar una lista.

Verificación: pruebas en `lib/aperturas.test.ts` cubren bases de los porcentajes, exclusiones, recepción parcial/excedentes, fechas y alertas únicas. Revisión visual local del componente real con datos de ejemplo en escritorio y celular; sin modificar producción.

## Calendario

`vista=calendario` muestra el mes (`mes=AAAA-MM`, por defecto el de hoy en México) con cada tarea como barra de su `inicio` a su `fin`. Con una sola fecha ocupa ese día; `no_aplica` no aparece. Las barras se acomodan en carriles por semana (`barrasSemana` en `lib/aperturasCalendario.ts`); a partir del quinto carril el día muestra «+n más». En celular se ve como tarjetas del mes.

Sin colores por etapa, categoría ni responsable (estilo Akton, `docs/diseno/estilo-akton.md`): las barras son grises, verdes si están listas y rojas si están vencidas o bloqueadas (`tonoConcepto` en `lib/aperturasAkton.ts`). Las personas se distinguen por iniciales en fichas grises. El parámetro viejo `color=` se ignora. La tabla `apertura_colores` y `guardar_color_apertura` quedan en la base sin uso.

Con permiso de compras, el clic en un día programa una tarea (inicio ese día, fin elegido) y el clic en una barra cambia o quita sus fechas. Ambos usan `actualizar_apertura_item` con todos los demás campos del registro (`datosFechas`), así que queda en el historial.

## Cronograma (vista `roadmap`)

`vista=roadmap` muestra el cronograma de `app/aperturas/Gantt.tsx` en lugar de la lista anterior: una fila por etapa (P1–P7) con su barra de la primera a la última fecha de sus tareas, rellena según el avance. El avance de la etapa es el promedio de puntos de todos sus conceptos (actividades, equipo y validaciones), sin no aplica ni equipo/referencias por validar (`ganttEtapas` en `lib/aperturasGantt.ts` con `promedioPuntos`). Cada partida suma según su etapa (`puntosItem` en `lib/aperturas.ts`): equipo y referencias 0.25 cotizado o aprobado, 0.5 pedido o recibido parcial, 0.75 recibido y 1 instalado o verificado; actividades y validaciones 1/3 en curso, 2/3 por cerrar y 1 completado. El avance general es `avanceApertura`: promedio de puntos por bloque, ponderado Proyecto 20 %, Compras 35 %, Obra 30 % y Apertura 15 % (un bloque vacío reparte su peso). Es el mismo en la portada, el Checklist y el KPI «Avance general». Todo % muestra 100 solo si todas sus partidas tienen 1 punto; si no, el tope es 99. Los conteos «listos» siguen el criterio del Checklist (`marcaItem`).

La escala (`escalaGantt`) siempre cabe en el ancho, sin deslizar: semanas hasta ~4 meses y meses si dura más. Marca Hoy y la fecha objetivo de apertura (`objetivo_hasta`). Al dar clic en una etapa se despliega el Gantt de sus tareas, con barras por estado: listo, en curso, pendiente o bloqueado, y vencidas con contorno ámbar.

El Cronograma muestra primero la tabla Akton por etapa (real, esperado a hoy y variación; ver `lib/aperturasAkton.ts`) y debajo el Gantt en grises: avance en gris oscuro, verde solo para tareas listas, rojo para vencidas o bloqueadas, Hoy en negro y la apertura objetivo en naranja. Usa la tipografía de la app.
