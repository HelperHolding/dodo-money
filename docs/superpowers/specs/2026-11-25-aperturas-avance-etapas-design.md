# Aperturas: avance por etapas y ponderado por bloque (HD-12) — diseño

Fecha: 2026-11-25 · Ticket: HD-12 (Julio) · Responsable: Sebastián

## Objetivo

Que el % de avance de una apertura refleje el trabajo real. Cotizar, comprar, recibir e instalar suman por etapas, y las actividades avanzan por pasos. El avance global se pondera por bloque, no por número de renglones. Hoy López Mateos marca 9 % en la portada y 14 % en el checklist, aunque 72 de 112 equipos ya están pedidos.

## Decisiones tomadas

- **Equipo y compras** usa los estados que ya existen, cada uno con puntos.
- **Actividades** reciben un solo estado nuevo, `por_cerrar` («Por cerrar»), como paso intermedio. Su nombre visible depende del bloque.
- **Pesos por bloque fijos:** Proyecto 20 %, Compras 35 %, Obra 30 %, Apertura 15 %. Editarlos por apertura queda fuera.
- **Una sola regla** para todas las pantallas que muestran %.

## Puntos por partida (`puntosItem`, de 0 a 1)

| Tipo | Estado | Puntos |
|---|---|---|
| equipo / referencia | por_validar, por_cotizar, bloqueado | 0 |
| | cotizado, aprobado | 0.25 |
| | pedido, recibido_parcial | 0.50 |
| | recibido | 0.75 |
| | instalado, verificado | 1 |
| actividad / tecnico | pendiente, por_validar, bloqueado | 0 |
| | en_curso | 1/3 |
| | por_cerrar | 2/3 |
| | completado | 1 |

- **Partidas fuera del cálculo:** `no_aplica`, y el equipo o las referencias en `por_validar` (como hoy).
- **«Listo»:** el criterio de `marcaItem` no cambia: una partida está lista con 1 punto, y el equipo `instalado` ya cuenta como listo.

## Bloques (`bloqueDe`) y avance global (`avanceApertura`)

**Bloques.** Se reusa la asignación que ya hace el checklist (`MODULOS_CHECKLIST`):

| Bloque | Qué entra | Peso |
|---|---|---|
| proyecto | etapas P1–P3 | 0.20 |
| compras | P4: equipo y referencias sin categoría de obra, y categorías con `obra:false` | 0.35 |
| obra | P5 y toda partida con categoría `obra:true` | 0.30 |
| apertura | P6–P7 | 0.15 |

**Cálculo.**
- El % de un bloque es el promedio de los puntos de sus partidas: cada partida pesa igual.
- El global es la suma de `peso × %` de cada bloque.
- Si un bloque no tiene partidas, su peso se reparte proporcionalmente entre los demás.
- Sin ninguna partida, el resultado es `null`.
- Para mostrarlo se redondea a entero y queda topado en 99 mientras falte algo: 100 solo si todas las partidas tienen 1 punto. Es la misma regla que hoy aplica `porcentajeAvance`.

## Nombres visibles por bloque (`nombreEstado(item)`)

| Bloque | en_curso | por_cerrar | completado |
|---|---|---|---|
| proyecto | Expediente armado / enviado | Ingresado / en revisión | Aprobado |
| obra | Cotizado / aprobado | En ejecución | Terminado |
| apertura | En curso | Casi listo | Listo |

- Los demás estados conservan su nombre actual (`ESTADOS`).
- En los registros de equipo los nombres no cambian.
- El valor guardado en la base sigue siendo el mismo (`en_curso`, `por_cerrar`, `completado`): solo cambia la etiqueta.

## Pantallas (todas con `avanceApertura`/`puntosItem`)

- **Portada /aperturas:** la tarjeta muestra el % global ponderado. La consulta ahora trae también `tipo`, `etapa` y `categoria`. El texto «N de M actividades» cambia a «N de M partidas listas».
- **Checklist del detalle:**
  - El % de cada módulo pasa a ser el % de su bloque (promedio de puntos).
  - El «general» pasa a ser el global ponderado.
  - Debajo de cada módulo se muestra su peso, por ejemplo «Equipo y compras · 35 % del total».
- **KPI «Avance general»** (Akton): `real` es el global ponderado. «Esperado a hoy» y la tolerancia no cambian.
- **Gantt por etapa:** el % de cada etapa es el promedio de puntos de sus partidas.
- **Avance por categoría:** el % es el promedio de puntos (hoy solo cuenta lo instalado).
- **Equipo y compras:** el encabezado muestra un conteo por etapa: «N sin cotizar · N cotizados · N pedidos · N entregados · N instalados». Usa los mismos grupos que la tabla de puntos.
- **Selectores de estado** (cambio rápido y ficha): las actividades y validaciones técnicas ofrecen «Por cerrar» con el nombre de su bloque.
- **`indicadoresApertura.avance`** (actividades completadas sobre actividades): se reemplaza por el global ponderado donde se muestre como avance.

## Datos (migración `supabase/migrations/20261125120000_aperturas_por_cerrar.sql`)

- Agrega `por_cerrar` al CHECK de `apertura_items.estado`.
- Agrega `por_cerrar` a los estados válidos de actividad/técnico en `actualizar_apertura_item`. Se toma su versión más reciente (la última migración que la redefine) y solo se añade el estado, sin otros cambios.
- `por_cerrar` no exige evidencia (solo `completado`/`verificado`/`no_aplica` la exigen).
- No se modifican datos existentes.
- Lleva pruebas PGlite y `supabase/pruebas/20261125120000_aperturas_por_cerrar.sql`, que termina en «PRUEBAS OK».

## Pruebas

**Unitarias (lib):**
- `puntosItem` en todos los estados.
- `bloqueDe` en categorías de obra y fuera de ellas.
- `avanceApertura`:
  - pesos;
  - reparto cuando falta un bloque;
  - `null` sin partidas;
  - tope en 99 y 100 solo completo.
- `nombreEstado` por bloque.
- Ejemplo del ticket: 72 equipos pedidos y 9 recibidos de 112 dan un bloque Compras ≈ 38 %.

**Pruebas existentes:** se actualizan las que fijan la fórmula vieja.
- `checklistApertura.general` era un promedio simple.
- `avanceCategorias` solo contaba instalado.
- `avancePorProyecto` y `porcentajeAvance`.
- `aperturasGantt`.
- `aperturasAkton`.
- La regex de la portada.

**SQL:** PGlite de la migración, que verifica que la RPC acepta `por_cerrar` en actividades y lo rechaza en equipo.

## Fuera de alcance

- Pesos editables por apertura.
- Colores en el plano (HD-14), que usará `puntosItem`/etapas.
- Presupuesto vivo (HD-3).
- Marcar «Cotizado» automáticamente al registrar una cotización.
