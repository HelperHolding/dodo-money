# CAPEX de aperturas: presupuesto vs real (diseño)

**Fecha:** 2026-11-09 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Llevar en Finanzas el control del CAPEX de cada apertura: cuánto se aprobó por categoría, cuánto está comprometido,
facturado y pagado, cuánto queda por ejercer y qué tanto se desvía. Incluye en la misma vista las tiendas ya abiertas
con su inversión histórica importada, para comparar el costo por apertura.

**Éxito:** admin aprueba el presupuesto de una apertura por categoría; al confirmar una orden o registrar una factura
en Compras la marca como CAPEX de esa apertura (pudiendo repartirla); `/finanzas/capex` muestra por apertura y por
categoría Presupuesto · Comprometido · Facturado · Pagado · Por ejercer · Desviación, con semáforo, y deja bajar hasta
los documentos. Ningún documento cuenta dos veces y nada sin marcar cuenta.

## 2. Decisiones tomadas

| Tema | Decisión |
|---|---|
| Uso principal | Presupuesto vs real |
| "Real" | Tres columnas: **Comprometido** (órdenes), **Facturado** (facturas), **Pagado** (aplicaciones de pago) |
| Alcance | Proyectos en curso **y** tiendas abiertas con inversión histórica, en una sola vista |
| Presupuesto | **Base aprobada por categoría**, congelada; cada cambio es una revisión nueva con motivo |
| Atribución | **Marca explícita** en la orden o factura (proyecto + categoría + monto, repartible). Lo no marcado no cuenta |
| IVA | Comparación **sin IVA**; pagado y por pagar se muestran también **con IVA** (salida de caja) |
| Anticipos sin factura | Se registran como orden confirmada asignada → cuentan como comprometido hasta que llega la factura |
| Acceso | Admin y corporativo ven (`puedeVerFinanzas`); solo admin captura y aprueba (`puedeEditarFinanzas` / `edita_finanzas()`) |
| Presentación | Tarjetas, no tablas anchas |

## 3. Datos (migración)

Archivo: `supabase/migrations/<timestamp>_capex_aperturas.sql`, en una transacción.

### 3.1 `public.capex_categorias`

Catálogo fijo cargado en la migración (`clave` text pk, `nombre`, `orden` int):

| clave | nombre |
|---|---|
| `proyecto_permisos` | Proyecto y permisos |
| `obra_civil` | Obra civil y acabados |
| `instalaciones` | Instalaciones (eléctrica, hidráulica, gas, HVAC) |
| `equipo_cocina` | Equipo de cocina |
| `camara_fria` | Cámara fría |
| `mobiliario` | Mobiliario |
| `tecnologia` | Tecnología y POS |
| `senaletica` | Señalética |
| `smallware` | Smallware |
| `otros` | Otros |

Equivalencia fija desde `apertura_items.categoria` (solo para sugerir y para el aviso "sin categorizar"):
`equipo_cocina→equipo_cocina`, `camara_fria→camara_fria`, `mobiliario→mobiliario`,
`puertas, zoclos, pisos, acabados, paneles, plafones, sanitarios→obra_civil`,
`contactos, salidas_cable, baja_tension, iluminacion→instalaciones`,
`senaletica_interior, senaletica_fachada→senaletica`. Items sin categoría → `otros`.

### 3.2 `public.capex_presupuestos`

Una fila por proyecto · revisión · categoría. Las filas no se editan ni borran: una revisión nueva reemplaza a la vigente.

| Columna | Regla |
|---|---|
| `id` uuid pk | |
| `proyecto_id` | not null → `apertura_proyectos` |
| `revision` | int ≥ 1; misma revisión para todas las categorías capturadas juntas |
| `categoria` | not null → `capex_categorias` |
| `monto` | numeric(16,2), sin IVA, ≥ 0 y < 1e12 |
| `motivo` | 5 a 2000 caracteres (en la revisión 1: "Presupuesto inicial" o similar) |
| `aprobado_por` / `aprobado_en` | perfil y fecha; `auth.uid()` / `now()` |
| | `unique(proyecto_id, revision, categoria)` |

Vigente = filas con la `revision` máxima del proyecto. Una revisión trae **todas** las categorías con monto (las que
se omiten valen 0 en esa revisión).

Función `aprobar_capex_presupuesto(p_proyecto uuid, p_revision_actual int, p_montos jsonb, p_motivo text) returns int`:
`security definer`, `search_path=''`; exige `edita_finanzas()`; bloquea el proyecto `for update`; falla con
"El presupuesto cambió. Recarga antes de guardar." si `p_revision_actual` no es la máxima vigente (0 si no hay);
valida claves de categoría y montos; inserta la revisión `p_revision_actual + 1` y la devuelve.

### 3.3 `public.capex_asignaciones`

Liga un documento de Compras a una apertura y categoría.

| Columna | Regla |
|---|---|
| `id` uuid pk | |
| `orden_id` | → `ordenes_compra`, nullable |
| `factura_id` | → `facturas`, nullable |
| | `check(num_nonnulls(orden_id, factura_id) = 1)` |
| `proyecto_id` | not null → `apertura_proyectos` |
| `categoria` | not null → `capex_categorias` |
| `monto` | numeric(16,2) > 0, **sin IVA** (en notas de crédito también positivo; el signo lo da el tipo de factura) |
| `nota` | opcional, ≤ 500 |
| `creado_por` / `creado_en` | |
| | `unique(orden_id, proyecto_id, categoria)` y `unique(factura_id, proyecto_id, categoria)` (índices parciales) |

Historial: `public.capex_asignacion_historial(id, documento_tipo, documento_id, anterior jsonb, nuevo jsonb, usuario_id, fecha)`.

Función `guardar_capex_asignacion(p_tipo text, p_documento uuid, p_renglones jsonb, p_motivo text) returns void`:
reemplaza **todos** los renglones del documento de una vez (lista `[{proyecto_id, categoria, monto, nota}]`; lista vacía
quita la marca).
- Exige `edita_finanzas()`; bloquea el documento `for update`.
- Proyecto de la **misma sucursal** que el documento ("El proyecto debe ser de la sucursal del documento.").
- Suma de montos ≤ subtotal sin IVA del documento: factura = `subtotal − descuento`; orden = suma de sus renglones
  sin IVA ("Lo asignado pasa el subtotal del documento."). Orden = Σ `cantidad × precio` de `orden_renglones`
  (`precio` ya es sin IVA); una orden con renglones en precio 0 solo admite lo que sumen los renglones con precio.
- Factura u orden cancelada → "No se asigna un documento cancelado."
- Registra anterior/nuevo en el historial con el motivo (5 a 2000 caracteres).

RLS: `select` con `ve_finanzas()` en las cuatro tablas; sin `insert/update/delete` directos (solo vía funciones).

### 3.4 Vista `public.capex_resumen` (`security_invoker = true`)

Una fila por `proyecto_id × categoria` con presupuesto vigente o con algún movimiento:

| Columna | Cálculo (sin IVA salvo que diga) |
|---|---|
| `presupuesto` | monto de la revisión vigente (null si no hay revisión aprobada) |
| `facturado` | Σ asignaciones de facturas no canceladas; `egreso` resta |
| `comprometido` | por cada orden `confirmada` asignada: `max(0, asignado_orden − facturado de esa orden en esa categoría)`, donde lo facturado de la orden es lo asignado a sus facturas (vía `factura_ordenes`) en el mismo proyecto y categoría. Órdenes `borrador`, `enviada`, `cerrada` y `cancelada` no comprometen |
| `pagado_con_iva` | Σ por factura de `pago_aplicaciones.monto` (pagos no anulados) × (asignado / subtotal sin IVA de la factura) |
| `pagado` | `pagado_con_iva` × (subtotal sin IVA / total) de cada factura |
| `por_pagar_con_iva` | facturado con IVA proporcional − `pagado_con_iva` |
| `por_ejercer` | `presupuesto − comprometido − facturado` (null si no hay presupuesto) |
| `desviacion` | `(comprometido + facturado) − presupuesto` |

Prorrateo: si una factura se reparte 60/40, su pago y su IVA se reparten igual.

### 3.5 Histórico (`inversion_apertura_fuentes`)

Tabla `public.capex_equivalencias_historico(tipo text, categoria_origen text, categoria → capex_categorias,
primary key(tipo, categoria_origen))`, editable por admin con `guardar_capex_equivalencia`. La migración carga una
equivalencia inicial para los pares `tipo/categoria` que ya existen en `datos->'detalles'`; lo que no tenga equivalencia
cae en `otros`.

Vista `public.capex_historico`: por sucursal × categoría, Σ de `monto` de los detalles de la fuente, tal como viene
(los detalles traen un solo monto sin desglose de IVA). La tarjeta lo rotula "importe de la fuente contable" y no se
mezcla con las columnas sin IVA de los proyectos. Cuenta como **facturado y pagado**, sin presupuesto.
Una sucursal con proyecto activo y fuente histórica muestra ambos por separado; no se suman.

## 4. Pantallas

### 4.1 Menú

`lib/roles.ts`: "CAPEX de aperturas" → `/finanzas/capex` en el área de Finanzas. Se actualizan las rutas esperadas
de admin y corporativo en `lib/roles.test.ts` y `tests/menuAreas.test.mjs`.

### 4.2 `/finanzas/capex` (resumen)

- Encabezado con cuatro cifras de todas las aperturas: presupuesto aprobado, ejercido (comprometido + facturado),
  pagado con IVA y por pagar con IVA.
- Una tarjeta por apertura en curso: nombre, responsable, fechas objetivo, presupuesto, ejercido, % ejercido, barra
  apilada (facturado · comprometido · disponible) y semáforo:
  - **verde** < 90 % · **ámbar** 90–100 % · **rojo** > 100 % · **gris** sin presupuesto aprobado.
- Tarjetas de tiendas abiertas: "Inversión histórica · sin presupuesto", total por categoría.
- Filtro por estado del semáforo.

### 4.3 `/finanzas/capex/[proyecto]` (detalle)

- Tarjeta por categoría con las seis cifras y la desviación; una categoría sin presupuesto pero con gasto se pinta en
  rojo ("Sin presupuesto en esta categoría").
- Al abrir una categoría: lista de documentos (folio OC/factura, proveedor, fecha, monto asignado, estado de pago),
  con liga a `/compras/ordenes/[id]` o `/compras/facturas/[id]`.
- Sección **Presupuesto**: revisión vigente, historial de revisiones (quién, cuándo, motivo, diferencia por categoría)
  y, solo para admin, formulario para nueva revisión (monto por categoría + motivo).
- Aviso **Sin categorizar**: `apertura_items` del proyecto con `orden_id` o `factura_id` cuyo documento no tiene
  asignación CAPEX, con liga al documento.

### 4.4 Captura en Compras

En `app/compras/ordenes/[id]` y `app/compras/facturas/[id]`, bloque **CAPEX de apertura**, visible solo si la sucursal
del documento tiene `apertura_proyectos`:
- Muestra los renglones asignados y el saldo sin asignar.
- Admin edita la lista (proyecto, categoría, monto, nota) y guarda con motivo.
- Sugerencias (no se guardan solas):
  - Documento sin asignación: un renglón con el subtotal completo y la categoría que salga de sus `apertura_items`.
  - Factura ligada a una orden asignada: los mismos proyecto y categorías, por el monto de la factura.
  - Nota de crédito: proyecto y categoría de la factura que corrige (`uuid_relacionado`).

## 5. Lógica en TypeScript

`lib/finanzas/capex.ts` (funciones puras, probadas):
- `semaforo(presupuesto, ejercido)`.
- `resumenProyecto(filas)` y `resumenGeneral(filas, historico)`: totales y porcentajes desde la vista.
- `sugerirAsignacion(documento, items, asignacionesOrden)`.
- `equivalenciaItem(categoriaItem)`.

Lectura en `app/finanzas/capex/datos.ts`; acciones en `app/finanzas/capex/acciones.ts` y en las acciones de Compras,
llamando solo a las funciones SQL.

## 6. Casos límite

| Caso | Comportamiento |
|---|---|
| Factura cancelada | Sale de facturado y pagado; su asignación se ve tachada como "cancelada" |
| Nota de crédito (`egreso`) | Resta en facturado; se asigna igual que una factura |
| Orden con facturas parciales | Comprometido = asignado − ya facturado, mínimo 0 |
| Orden cerrada sin factura / cancelada | Libera el comprometido |
| Anticipo a contratista | Orden confirmada asignada; pasa a facturado al llegar la factura |
| Pago de bóveda / histórico | Entra por `pago_aplicaciones` como cualquier pago |
| Pago anulado | No cuenta |
| Sin revisión aprobada | Semáforo gris, sin por ejercer ni desviación |
| Dos admins editando | `revision`/`for update`; el segundo recibe "cambió, recarga" |
| Documento de Oficina (`sucursal_id` null) | No puede asignarse a una apertura |

## 7. Pruebas

- **PGlite** `tests/capex.test.mjs` (migración real; stubs copian CHECK y enums reales): reparto ≤ subtotal; misma
  sucursal; RLS (admin captura, corporativo solo lee, gerente no ve); orden → factura sin doble conteo; cancelación;
  nota de crédito; pago parcial y anulado; prorrateo 60/40; revisión vigente y conflicto de revisión.
- **Unitarias** `lib/finanzas/capex.test.ts`: semáforo en los bordes 90 % y 100 %, resúmenes, sugerencias,
  equivalencias.
- **Roles/menú**: `lib/roles.test.ts`, `tests/menuAreas.test.mjs`.
- Todos agregados al script `test` de `package.json`.

## 8. Entrega

1. Rama `feat/capex-aperturas` → PR a `main`; deben pasar **Historial válido** y **Pruebas y tipos**.
2. La migración y la carga inicial de equivalencias se entregan a Sebastián para ejecutarlas en el proyecto Supabase de
   producción; con su resultado se publican las pantallas de captura.
3. Después: captura del presupuesto aprobado de cada apertura en curso y asignación de las órdenes y facturas existentes
   (el aviso "Sin categorizar" sirve de lista de pendientes).

## 9. Fuera de alcance

- Depreciación y capitalización contable de activos.
- Proyección de flujo de pagos futuros del CAPEX.
- Presupuesto para tiendas históricas (se puede capturar después con el mismo mecanismo si tienen proyecto).
- Exportación a Excel/PDF (se puede agregar en una fase siguiente).
