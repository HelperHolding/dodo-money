# Tareas y backlog: asignaciones ligadas a documentos (diseño)

**Fecha:** 2026-11-02 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Julio pierde el seguimiento con tantos pendientes. DODO MX tendrá un módulo de **Tareas** estilo Jira donde:

1. Cualquier pendiente se registra como tarea con responsable, prioridad, vencimiento y estado.
2. Desde los documentos que ya se capturan (órdenes de compra, facturas, días de venta, proyectos e ítems de
   apertura) se **asigna una tarea a una persona**, ligada a ese documento.
3. Un tablero por estado permite ver y mover todo el backlog; cada persona tiene su vista *Mis tareas*.
4. Nada se da por terminado sin que lo vea quien lo pidió: quien recibe la tarea la manda a revisión y quien la creó
   la aprueba.
5. (Fase 2) El sistema crea solo las tareas de pendientes que ya se pueden detectar en los datos.

**Éxito:** Julio abre la factura A-1234, pulsa *Asignar tarea*, elige al gerente de Zapopan, «Subir la remisión
firmada», prioridad alta, vence el viernes. El gerente ve el contador rojo en su menú, la abre, comenta, la manda a
revisión; Julio la ve en *En revisión (me toca cerrar)*, abre la factura desde la tarea, comprueba y la aprueba. El
historial deja quién hizo qué y cuándo. La factura muestra sus tareas abiertas mientras las tenga.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Dónde vive | Dentro de DODO MX; sin Jira/Linear externos |
| Quién recibe tareas | Todos los puestos activos: admin, gerente, encargado y operación. Corporativo solo consulta |
| Liga con documentos | Columnas FK opcionales por tipo de documento, a lo más una por tarea (`num_nonnulls(...) <= 1`); el día de venta se liga por su clave natural (`ventas_sucursal_id` + `ventas_fecha`) |
| Documentos ligables (fase 1) | `ordenes_compra`, `facturas`, `ventas_dia`, `apertura_proyectos`, `apertura_items`. Tareas sin documento también valen |
| Estados | `por_hacer` → `en_curso` → `en_revision` → `hecho`; `cancelada` desde cualquiera abierto |
| Cierre | Pasa `en_revision` → `hecho` o la regresa a `en_curso`: quien creó la tarea, un admin o el gerente de la sucursal, salvo que el gerente sea el asignado (entonces solo quien la creó o un admin) |
| Avisos | Solo dentro de la app (contador en el menú, bloque en Inicio). Sin correo ni WhatsApp |
| `responsable` de aperturas | Se queda como texto libre; la tarea ligada es la que asigna a un usuario real |
| Fases | Fase 1: módulo manual completo. Fase 2: tareas automáticas. PR separados |

## 3. Modelo de datos (fase 1)

### `tareas`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | |
| `numero` | bigint, secuencia `tareas_numero` | Se muestra como clave `DODO-<numero>` |
| `titulo` | text not null | 3–200 caracteres |
| `descripcion` | text | hasta 4000 |
| `estado` | `estado_tarea` enum | `por_hacer` (default), `en_curso`, `en_revision`, `hecho`, `cancelada` |
| `prioridad` | `prioridad_tarea` enum | `alta`, `media` (default), `baja` |
| `vence` | date | opcional |
| `asignado_a` | uuid → `perfiles` not null | |
| `creado_por` | uuid → `perfiles` | null solo en tareas automáticas |
| `sucursal_id` | uuid → `sucursales` | null = tarea de oficina |
| `origen` | text check in (`manual`,`automatica`) | |
| `regla` | text → `tarea_reglas(clave)` | solo en automáticas (fase 2) |
| `orden_id` | uuid → `ordenes_compra` | |
| `factura_id` | uuid → `facturas` | |
| `ventas_sucursal_id`, `ventas_fecha` | uuid → `sucursales`, date | día de venta por clave natural, la de `ventas_dia (sucursal_id, fecha)`. Sin FK a `ventas_dia`: una reimportación borra y recrea esa fila con otro id y no debe toparse con la tarea |
| `apertura_proyecto_id` | uuid → `apertura_proyectos` | |
| `apertura_item_id` | uuid → `apertura_items` | |
| `documento_texto` | text | texto del documento al crear (p. ej. «Factura A-1234 · Proveedor»): el asignado lo lee aunque no pueda abrir el documento |
| `motivo_cierre` | text | obligatorio al cancelar |
| `revision` | integer | sube en cada cambio; las funciones rechazan una revisión vieja |
| `creada_en`, `actualizada_en`, `cerrada_en` | timestamptz | `cerrada_en` se llena al pasar a `hecho` o `cancelada` |

Restricciones:
- `check (num_nonnulls(orden_id, factura_id, ventas_fecha, apertura_proyecto_id, apertura_item_id) <= 1)`.
- `check ((estado in ('hecho','cancelada')) = (cerrada_en is not null))`.
- `check (estado <> 'cancelada' or length(trim(motivo_cierre)) >= 5)`.
- FK con `on delete restrict`: los documentos se anulan, no se borran.
- Si la tarea liga un documento con sucursal (orden, factura, día de venta, apertura), `sucursal_id` se toma del
  documento al crearla.
- Índices: `(asignado_a) where estado not in ('hecho','cancelada')`, `(sucursal_id, estado)`, y uno parcial por
  cada columna de documento.

### `tarea_comentarios`

`id`, `tarea_id` → `tareas` (cascade), `autor_id` → `perfiles`, `texto` (1–4000), `fecha`. Solo inserción: sin
update ni delete para nadie.

### `tarea_historial`

`id`, `tarea_id`, `usuario_id` (null = sistema), `campo`, `antes`, `despues`, `fecha`. Lo llena un trigger `after
insert or update` en `tareas` por cada campo que cambió (`estado`, `prioridad`, `vence`, `asignado_a`, `titulo`,
`descripcion`), más un registro `creada` al insertar. Nadie escribe directo.

## 4. Permisos

Toda escritura pasa por funciones `security definer` (`crear_tarea`, `actualizar_tarea`, `mover_tarea`,
`comentar_tarea`), como en el resto del repo; la RLS de `select` decide qué se ve.

| Puesto | Ve | Crea / asigna | Mueve |
|---|---|---|---|
| Admin | Todas | A cualquier usuario activo | Cualquier transición, incluida cerrar |
| Corporativo | Todas | — | — |
| Gerente | Las de su sucursal, las suyas y las que creó | A usuarios activos de su sucursal | Cualquier transición en tareas de su sucursal, salvo las asignadas a él que no creó (cierra quien las pidió) |
| Encargado | Las suyas, las que creó y las asignadas a operación de su sucursal | A encargados y operación de su sucursal | Las suyas (hasta `en_revision`) y las que creó (incluido cerrar) |
| Operación | Solo las asignadas a él | — | Las suyas, de `por_hacer` hasta `en_revision` |

Reglas de las funciones:
- El asignado debe estar activo. En tareas de sucursal debe pertenecer a esa sucursal, salvo admins.
- Quien asigna debe poder ver el documento ligado. Órdenes, facturas y aperturas hoy solo las ve oficina, así que
  solo un admin liga tareas a ellas; el gerente liga días de venta de su sucursal; el encargado crea tareas sin
  documento. El asignado ve el texto del documento y, si su puesto no puede abrirlo, no se muestra el enlace.
- Las lecturas (`tareas_visibles`, `hilo_tarea`) son funciones que aplican la misma `puede_ver_tarea` de la RLS y
  devuelven los nombres de las personas, que la RLS de `perfiles` no deja ver entre sucursales. Las tareas cerradas
  salen en listas y tablero durante 30 días; por número o desde su documento, siempre.
- Transiciones válidas: `por_hacer→en_curso`, `en_curso→en_revision`, `por_hacer→en_revision`,
  `en_revision→hecho`, `en_revision→en_curso` (regresar, exige comentario), `* abierta → cancelada` (exige motivo).
  `en_revision→hecho` y `en_revision→en_curso` solo para el creador, admin o el gerente de la sucursal (no si él es el asignado).
- Si el asignado es el creador, puede cerrar su propia tarea.
- Comentar: cualquiera que vea la tarea, excepto corporativo.
- Reasignar a alguien que no podría ver la tarea se rechaza.
- Los mensajes de rechazo son frases en español listas para mostrar con `Aviso`.

## 5. Pantallas (fase 1)

Todas con tarjetas, pensadas para celular primero; nada de tablas anchas.

1. **Mis tareas** (`/tareas`), entrada del módulo para todos. Pestañas *Asignadas a mí*, *Creadas por mí* y *En
   revisión (me toca cerrar)*. Cada pestaña agrupa en **Vencidas**, **Hoy**, **Esta semana**, **Después** y **Sin
   fecha**. Cada tarjeta lleva clave, título, color de prioridad, vencimiento, documento ligado (enlace) y sucursal.
2. **Tablero** (`/tareas/tablero`), para todos menos operación. En escritorio, columnas por estado (sin
   `cancelada`) con arrastrar y soltar; en celular, una pestaña por estado y selector de estado en la tarjeta.
   Filtros en la URL (`BusquedaUrl`): persona, sucursal, prioridad, módulo (compras, facturas, ventas, aperturas, sin
   documento), solo vencidas y origen. `SelectorVista` alterna **Tablero ↔ Lista**; la lista ordena por vencimiento.
3. **Detalle** (`/tareas/[numero]`). Campos editables según permisos, tarjeta del documento ligado con resumen y
   enlace, y un hilo único con comentarios e historial en orden cronológico. Botones según estado: *Empezar*,
   *Mandar a revisión*, *Aprobar*, *Regresar* (pide comentario) y *Cancelar* (pide motivo).
4. **Asignar tarea desde documentos**: botón en orden de compra, factura, día de venta, proyecto de apertura e ítem
   de apertura. Lleva a `/tareas/nueva?tipo=…&id=…` con persona (solo las elegibles), título prellenado (p. ej.
   «Factura A-1234 · Proveedor X»), descripción, prioridad y vencimiento; al crear, regresa a la tarea. (Página en
   lugar de `Cajon`: la lista de personas depende de la sucursal y así funciona sin JavaScript en celular.) El
   documento muestra una franja con sus tareas abiertas y quién las tiene; en Conciliación cada día muestra el
   número de tareas abiertas y el botón.
5. **Avisos**: contador de tareas asignadas abiertas junto a «Tareas» en `MenuLateral`, rojo si hay vencidas; en
   Inicio, bloque «Tus pendientes» con las 3 más urgentes (vencidas primero, luego prioridad y fecha).
6. **Menú**: «Tareas» visible para todos los puestos. Operación no ve el enlace al tablero.

Casos especiales en pantalla:
- Documento ligado anulado o cancelado: la tarea sigue abierta y muestra la marca «documento anulado».
- Asignado dado de baja: la tarea aparece con la marca «asignado inactivo» en el tablero para reasignarla.

## 6. Tareas automáticas (fase 2)

### Reglas iniciales

| Clave | Condición | Asignado por defecto | Se cierra sola cuando |
|---|---|---|---|
| `factura_sin_revisar` | `facturas.revisada = false`, no cancelada, cargada hace más de N días | Admin configurado | se marca revisada o se cancela |
| `factura_por_vencer` | `estado = 'por_pagar'`, `vence_el - hoy <= N`, sin pago programado | Admin configurado | se programa o se paga |
| `dia_sin_ventas` | sucursal activa sin `ventas_dia` de ayer después de la sincronización | Admin configurado | llega el día |
| `orden_sin_recibir` | orden `enviada` o `confirmada` sin recepción tras N días | Gerente de la sucursal | se registra recepción o se cierra/cancela |
| `apertura_item_atrasado` | `apertura_items.fin < hoy` y estado no terminal | Admin configurado | el ítem llega a estado terminal |

Columnas fijadas contra el esquema de `main` (migración `20261102200000_tareas_automaticas.sql`):

- «Cargada»: `facturas.creado_en` (fecha en hora de México). «Sin pago programado»: `facturas.pago_programado_el is null`.
- `factura_por_vencer` también cuenta `estado = 'parcial'` (abonada, aún con saldo) y las ya vencidas; solo `tipo = 'ingreso'`
  (las notas de crédito no se pagan).
- «Recepción»: algún renglón con `recibido_renglon_total(renglon) > 0` (Dodo IS más app, sin anuladas). No se usa
  `hay_recepciones`: revisa permisos del usuario y sin sesión devuelve null.
- `orden_sin_recibir` solo cuenta órdenes `confirmada`: una `enviada` sigue siendo cotización y no se puede recibir. N se
  cuenta desde `entrega_esperada` o, si no tiene, desde `confirmada_en`. Si la orden es de oficina o la sucursal no tiene
  gerente activo, va al responsable de la regla.
- «Sucursal activa» para ventas: `sucursales.dodois_unit_id is not null` y con ventas antes del día revisado (una sucursal
  que aún no abre no genera avisos). N = días hacia atrás que revisa, de ayer en adelante (mínimo ayer).
- Estados terminales de apertura: `completado`, `verificado`, `no_aplica` (los mismos que `lib/aperturas.ts`). También se
  cierra si la fecha fin se mueve a hoy o después.

Umbrales por defecto (editables en `/tareas/reglas`): sin revisar 3, por vencer 5, día sin ventas 3, orden 3, apertura 0.

### `tarea_reglas`

`clave` PK, `nombre`, `activa` (default **false**), `asignado_default` → `perfiles`, `dias` (entero ≥ 0),
`prioridad`. Las administran los admins en `/tareas/reglas`. Las reglas arrancan apagadas y se prenden una por una.

### Generación

- Función `generar_tareas_automaticas()`, idempotente. En cada corrida (1) crea las tareas faltantes, ya ligadas a
  su documento y con `origen = 'automatica'`, y (2) pasa a `hecho` las que ya se resolvieron, con historial
  «resuelto automáticamente» (`usuario` null).
- No hay duplicados: índice único parcial por `(regla, documento)` mientras la tarea esté abierta. Para «día sin
  ventas» el documento es la clave natural que ya usa la fase 1 (`ventas_sucursal_id`, `ventas_fecha`): la tarea se liga
  al día aunque su fila de `ventas_dia` aún no exista, y el enlace aparece cuando llega.
- Una tarea automática que alguien pasa a `hecho` sin resolver el pendiente se vuelve a crear en la siguiente corrida;
  solo cancelarla la silencia.
- Cancelar una tarea automática la silencia: no se vuelve a crear para ese mismo documento.
- Se invoca diario desde una ruta `/api/tareas/generar` protegida con secreto, siguiendo el patrón de
  `/api/dodois/sincronizar` (`quienLlama`), y disparada por n8n como el calendario de cumplimiento.
- Las tareas automáticas llevan la etiqueta «Automática» y se filtran por origen.

## 7. Errores

- Toda validación vive en las funciones SQL; la UI solo traduce el mensaje de la excepción a `Aviso`.
- Transición inválida, asignado no elegible, documento no visible y texto demasiado largo tienen mensajes propios.
- Concurrencia: `mover_tarea` y `actualizar_tarea` reciben la `revision` que la pantalla vio y rechazan si cambió («La tarea cambió, recarga»).

## 8. Pruebas

- `lib/tareas.ts` con pruebas en `lib/tareas.test.ts`: transiciones permitidas por puesto, agrupación por
  vencimiento, clave `DODO-n`, título prellenado por tipo de documento y orden de «Tus pendientes».
- Pruebas SQL en PGlite (`supabase/pruebas` + `tests/tareas.test.mjs`): migración aplicada sobre stubs que copian
  los CHECK y enums reales; cada puesto ve y mueve solo lo que debe; historial completo; un solo documento por
  tarea; cancelación exige motivo.
- Fase 2: por cada regla, crea, no duplica, se cierra sola, respeta la cancelación y respeta `activa = false`.

## 9. Entrega

- Una rama y un PR por fase hacia `main`; deben pasar `Historial válido` y `Pruebas y tipos`.
- Cada migración se entrega a Sebastián para ejecutarla en producción; las pantallas que dependen de ella no se
  publican hasta tener su resultado.

## 10. Fuera de alcance

Correo, WhatsApp o Google Chat; subtareas, épicas, sprints y estimaciones; etiquetas libres; adjuntos en tareas;
@menciones en comentarios; ligar otros documentos (recepciones, pagos, activos, checklists), que se agregan después
con una columna FK más.
