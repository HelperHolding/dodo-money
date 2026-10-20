# Sincronización de ventas con la API de Dodo IS (diseño)

**Fecha:** 2026-10-20 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Las ventas de Dodo IS llegan solas a la app cada 15 minutos, sin importar "Datos brutos" a mano. Todo lo que hoy lee
ventas (P&L, tablero, reportes, Corporativo, asistente, conciliación) sigue funcionando sin cambios porque la API llena
las mismas tablas.

**Éxito:** un admin conecta Dodo IS una vez; a lo largo del día el tablero de Ventas muestra lo vendido con máximo
15 minutos de retraso; a las 3 a.m. el día anterior queda cerrado y cuadra con Dodo IS; una conciliación hecha sigue
aplicando aunque la sincronización vuelva a correr.

## 2. Lo que ya sabemos de la API (prueba del 2026-10-20)

- Acceso: OAuth 2 Authorization Code + PKCE en `https://auth.dodois.com` (la cuenta de México vive ahí). Token de 24 h
  con token de renovación (de un solo uso: cada renovación da uno nuevo). Vercel ya puede llegar al servidor de tokens.
- Unidades: `GET https://api.dodois.com/auth/roles/units` → Zapopan-1 y Office.
- Ventas: `GET https://api.dodois.com/dodopizza/mx/accounting/sales?units=…&from=…&to=…` → `{ sales, isEndOfListReached }`.
  El 25/09 trajo 39 pedidos y $7,736.00, igual que el Excel.
- Scopes que se piden: `openid offline_access user.role:read sales accounting:read unit:read productionefficiency`.

## 3. Decisiones

| Tema | Decisión |
|---|---|
| Frecuencia | Cada 15 min de 10:00 a 0:00 (CDMX) el día en curso completo; 3:00 a.m. el día anterior completo; botón "Actualizar ahora" |
| Disparador | `pg_cron` de Supabase llama a `POST /api/dodois/sincronizar` con una clave compartida (`DODOIS_CRON_SECRET`) |
| Unidad de trabajo | Un día de una sucursal; se trae completo cada vez (paginando hasta `isEndOfListReached`) |
| Pedidos | Se guardan o actualizan por el número de Dodo (`pedidos.dodo_id`); sus piezas se reemplazan; los pedidos sincronizados del día que ya no vienen en la API (cancelados o devueltos después) se quitan |
| Días importados del Excel | La sincronización **no los toca** (el Excel trae además tiempos de cocina, cliente y costo por pieza); queda anotado en el registro |
| Día | `ventas_dia`, desglose y `ventas_producto` se recalculan con la misma lógica de "Datos brutos" |
| Registro de importación | Uno por día y sucursal con `formato = 'api'` que se **reutiliza** en cada sincronización (no se crea uno nuevo), así la conciliación sigue aplicando |
| Conciliación | Sigue aplicando mientras el efectivo, la tarjeta y el en línea del día no cambien; si cambian, la sincronización la anula con el motivo "La venta de Dodo IS cambió después de conciliar" (una conciliación exige conservar la suma original) |
| Excel | La importación de "Datos brutos" se queda como respaldo; si se importa un día, reemplaza ese día como hoy |
| Tokens | Token de renovación cifrado en el Vault; se reemplaza en cada renovación; el de acceso vive solo en memoria |
| Escritura sin usuario | La ruta de sincronización usa la llave de servicio de Supabase (`SUPABASE_SERVICE_ROLE_KEY`, ya usada por las invitaciones) y funciones de la base que solo ejecuta `service_role` |
| Quién conecta | Solo admin; el registro guarda quién conectó y se usa como `importado_por` |

## 4. Traducción de la API a nuestras tablas

Por pedido (`sales[]`):

| API | `pedidos` |
|---|---|
| `orderId` | `dodo_id` en **mayúsculas** (el Excel los guarda así: el 25/09 coincide pedido por pedido) |
| `unitId` | `sucursal_id` (vía la unidad ligada a la sucursal) |
| `soldAtLocal` | `fecha`, `hora` en minutos (`HH:MM`, como el Excel; los reportes de tiempos lo esperan así) |
| `paymentMethod` | `pago`: Cash → efectivo, Card → tarjeta, Online/InternetAcquiring → en_linea, otro → otro |
| `salesChannel` | `tipo`: Delivery → entrega, Dine-in/Takeaway → en_tienda; Takeaway → `para_llevar` |
| `orderSource` | `origen`: Dine-in → mostrador, Kiosk → kiosco, Mobile/MobileApp → app, Site/Website → sitio, otro → otro; el valor crudo en `origen_dodo` |
| `aggregatorName` | `agregador` |
| `shiftId` | `turno_dodo` |
| Σ `priceWithDiscount` | `total`; Σ `price` → `total_sin_descuento`; IVA por pieza con `ivaDe`, igual que el Excel |
| número de piezas | `productos`; `discount.bonusActionName` → `promocion` |

Por pieza (`products[]`) → `pedido_productos`: `productId` en mayúsculas → `dodo_uuid` (y `dodo_id` del catálogo como hoy),
`defaultProductName` → `nombre`, `priceWithDiscount` → `precio`, `price` → `precio_sin_descuento`, `combo.name` → `combo`.

Las ventas de la API son pedidos vendidos: `estado = entregado`. Un valor nuevo que no esté en la tabla (por ejemplo un
`salesChannel` desconocido) se guarda como `otro` y queda anotado en el registro de la sincronización para revisarlo.

## 5. Base de datos (migración nueva)

- `dodois_conexion` (una fila): conectado_por, conectado_en, cuenta (login de Dodo), unidades (jsonb), scopes,
  `refresh_secret_id` (Vault), estado (`conectada` | `requiere_reconectar`), último error.
- `sucursales.dodois_unit_id text unique`: liga cada sucursal con su unidad de Dodo (Zapopan-1 ↔ `11f18755…`).
- `dodois_sincronizaciones`: inicio, fin, origen (`cron` | `noche` | `manual`), sucursal, fecha, pedidos, total,
  estado (`ok` | `error`), mensaje, valores desconocidos (jsonb). Se conservan 60 días.
- `importaciones_ventas.formato` acepta `'api'`; `importado_por` sigue siendo obligatorio (el admin que conectó).
- `sincronizar_ventas_dodo(p_sucursal uuid, p_fecha date, p_pedidos jsonb)`: solo `service_role`; bloqueo por
  (sucursal, fecha); upsert de pedidos y reemplazo de sus piezas; recalcula el día; reutiliza el registro `api` del día;
  marca la conciliación vigente si el total cambió.
- `pg_cron`: tres tareas (cada 15 min 16:00–05:59 UTC, 09:00 UTC diario) que llaman a la ruta con `pg_net` y la clave en el Vault.

## 6. Arquitectura

- `lib/dodois/` (puro, con pruebas): `traducirVenta` (API → pedido y piezas), `resumenDia` (reutiliza `resumirDias`,
  `tiposDesglose`), `ventanaDelDia` (fecha CDMX → `from`/`to`), `paginar`.
- `lib/dodois/cliente.ts` (servidor): token de acceso (renueva con el de la Vault y guarda el nuevo), `GET` con
  paginación y reintento ante 429/5xx.
- Rutas: `/api/dodois/conectar` y `/api/dodois/callback` (reemplazan las de prueba), `POST /api/dodois/sincronizar`
  (cron o admin), y se borra `/api/dodois/diagnostico` y la función `dodois_canjear_codigo`.
- Pantalla Ventas → "Dodo IS": estado de la conexión, sucursales ligadas, últimas sincronizaciones, "Actualizar ahora",
  "Conectar" / "Reconectar". Aviso en el tablero de Ventas (admin) si la conexión pide reconectar o hay 3 errores seguidos.
- `POST /api/dodois/sincronizar?simular=1` (admin): calcula sin guardar, para comparar un día contra lo ya importado.

## 7. Fuera de alcance (siguientes fases)

Recepciones con precio, consumo de insumos, productividad y mermas por API; tiempos de cocina por API.

## 8. Pruebas

- Node: traducción de un pedido real (los 39 del 25/09 suman $7,736.00 y 39 pedidos; pagos, canales y combos), valores
  desconocidos a `otro`, ventana del día en CDMX, paginación.
- SQL: la función solo la ejecuta `service_role`; upsert sin duplicar; conserva tiempos de cocina existentes; reutiliza
  el registro del día; conciliación marcada al cambiar el total; día recalculado igual que con "Datos brutos".
- Vista previa de la pantalla Dodo IS en computadora y celular.
