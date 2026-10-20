# Handoff: integración con la API de Dodo IS y pendientes (2026-10-20)

Para quien continúe el proyecto (persona o agente). Resume lo que quedó hecho en esta etapa, cómo operarlo, cómo
diagnosticarlo y qué sigue. Las especificaciones y planes detallados están en `docs/superpowers/specs/` y
`docs/superpowers/plans/`.

---

## 1. Cómo se trabaja en este repo

- **Flujo:** diseño (spec) → plan → rama → pruebas → si hay migración, Sebastián corre la migración y su prueba SQL en
  Supabase y pega "PRUEBAS OK" → fusión a `main` con `--no-ff` → Vercel despliega → copiar los archivos cambiados a la
  carpeta local de Sebastián → borrar la rama local y remota.
- **Pruebas:** `npm test` (Node `--experimental-strip-types --test`, ~554 pruebas). Las pruebas nuevas se agregan al
  script `test` de `package.json`. Tipos: `node node_modules/typescript/bin/tsc --noEmit`. Compilación:
  `npx next build`.
- **Pruebas SQL:** `supabase/pruebas/<migración>.sql`, un bloque `do $$ … $$` que termina en
  `raise exception 'PRUEBAS OK — …'` (no deja cambios). Usan `hoy_mx()`, no `current_date`. Cada `%` de un `raise`
  necesita su parámetro.
- **Migraciones:** las nuevas usan nombre con fecha y hora (`20261020200000_…sql`); las anteriores son `0001`–`0072`.
- **Código:**
  - Los módulos de `lib/` se importan entre sí **solo como tipos**; los valores se pasan como parámetros.
  - Los archivos usan **CRLF**.
  - La interfaz está en español y usa tarjetas en lugar de tablas anchas.
- **Seguridad:**
  - Secretos solo en Vercel o en el Vault de Supabase, nunca en el chat ni en el repo.
  - Las correcciones de datos se entregan como SQL que Sebastián revisa y corre.
  - En Dodo IS solo se lee.
  - No se guardan nombres de clientes.

---

## 2. API de Dodo IS — lo que funciona

### 2.1 Acceso (lo que costó encontrar)

- **App "Dodo MX"** en `marketplace.dodois.io` (Authorization Code + PKCE). Variables en Vercel: `DODOIS_CLIENT_ID`,
  `DODOIS_CLIENT_SECRET`.
- **La cuenta de México vive en `auth.dodois.com`** (no en `.io`). Usuario de Sebastián:
  `scervera@dodopizza.mx_pizza_mx`.
- **API:** `https://api.dodois.com`. Las unidades están en la raíz (`/auth/roles/units`); lo demás en
  `/dodopizza/mx/accounting/…` o `/dodopizza/mx/production/…`.
- Dodo **desbloqueó a Vercel** en `auth.dodois.com` (antes respondía 403 "Forbidden" anti-bot). `auth.dodois.io` sigue
  bloqueado, pero no se usa.
- **Scopes:** `openid offline_access user.role:read sales accounting:read unit:read productionefficiency`.
- **El token de renovación es de un solo uso:** cada renovación entrega uno nuevo, que hay que guardar. Se resuelve en
  `lib/dodois/tokens.ts`:
  - una renovación a la vez;
  - reintento al guardar;
  - un `invalid_grant` solo marca "reconectar" si nadie más renovó mientras tanto.
- **Unidades:** Zapopan-1 `11f187558e757f53b0570d952420b810`, Office `fe2fb5ee39b3865d11f0d67bada55b89`.

### 2.2 Sincronización de ventas (activa)

- **Cuándo corre:** `pg_cron` en Supabase llama por `pg_net` a `POST /api/dodois/sincronizar` con
  `Authorization: Bearer <DODOIS_CRON_SECRET>`. La clave está en el Vault (`dodois_cron_secret`) y la URL en
  `dodois_sync_url`.
  - `dodois-ventas-15min`: `*/15 0-5,16-23 * * *` UTC (10:00–23:59 en CDMX), el día en curso completo.
  - `dodois-ventas-noche`: `0 9 * * *` UTC (3:00 a.m. en CDMX), el día anterior completo.
- **Dónde guarda:** llena **las mismas tablas que la importación "Datos brutos"** (`pedidos`, `pedido_productos`,
  `ventas_dia`, `ventas_dia_desglose`, `ventas_producto`), así que P&L, tablero y reportes no cambiaron.
- **Formato:** ids en mayúsculas y hora `HH:MM`, como el Excel. El 25/09 la API dio 39 pedidos y $7,736.00, igual que
  el Excel.
- **Reglas:**
  - Un día importado del Excel no se toca.
  - El registro de importación del día se reutiliza, así que la conciliación sigue aplicando; si cambian efectivo,
    tarjeta o en línea, la conciliación se anula con su motivo.
  - Los pedidos que desaparecen de la API se quitan.
  - Una respuesta vacía no borra un día que ya tenía ventas.
- **Código:**
  - `lib/dodois/ventas.ts`: traducción pura.
  - `app/ventas/dodois/sincronizar.ts`: orquesta.
  - `lib/dodois/cliente.ts`: HTTP y paginación con `lib/dodois/paginas.ts`.
  - Migración `20261020180000_sincronizacion_dodois.sql`.
- **Pantalla Ventas → Dodo IS** (solo admin):
  - conexión (Conectar / Reconectar);
  - sucursal ↔ unidad;
  - "Actualizar ahora", con "Solo calcular" para comparar sin guardar;
  - registro de sincronizaciones (60 días).
- **Aviso en el tablero de Ventas** si hay que reconectar o fallaron 3 seguidas.
- **El middleware de sesión deja pasar `/api/dodois/sincronizar`** (`lib/rutasPublicas.ts`). Si la clave no coincide,
  la ruta responde 401 con el motivo (`lib/dodois/cron.ts`).

### 2.3 Recepciones de insumos (activa)

- **Endpoint:** `incoming-stock-items`, con el mismo cron.
  - Ventanas: 7 días con el cron cada 15 min; 31 días a las 3 a.m. y en "Actualizar ahora".
- **Qué se guarda:** en Dodo solo se dan de alta **insumos**. Cada entrega e insumo es una fila de `recepciones_dodo`
  con `fuente = 'api'`, documento, proveedor de Dodo, número de factura e importes con y sin IVA.
- **Reemplazo del Excel:** las filas del Excel (`fuente = 'excel'`) de los días con API se reemplazan.
  - La clasificación manual pasa a la fila de la API si ese día hubo una sola entrega de ese insumo.
  - El Excel ya no pisa días que tienen API.
- **Proveedores:** la API solo trae un ID de proveedor. Se liga una vez en **Compras → Recepciones → "Proveedores de
  Dodo IS sin ligar"** (`proveedores.dodois_supplier_id`).
  - "Proveedores ligados a Dodo IS" permite desligar uno ligado por error.
  - No se puede pisar un ID ya ligado; hay que desligarlo primero.
- **Ligas:**
  - **Orden:** debe ser del **mismo proveedor**, confirmada y recibida a más tardar 7 días después de la confirmación,
    con cantidad pendiente.
  - **Factura:** por folio normalizado (mayúsculas, solo letras y números, sin ceros a la izquierda), ±15 días y solo
    si coincide una sola factura.
  - **Precio:** se marca en ámbar si difiere más de 1 % del precio de la orden.
- **Lo recibido sin usuario:** `recibido_renglon_total` calcula lo recibido sin revisar permisos, porque la
  sincronización corre sin usuario. `recibido_renglon` conserva la revisión de permisos.
- **Detalle de factura:** muestra "Recepciones de Dodo IS" con lo recibido frente a lo facturado (informativo).
- **Código y migración:** `lib/dodois/recepciones.ts`; migración `20261020200000_recepciones_dodois.sql`.

### 2.4 Exploración (para investigar endpoints nuevos)

`GET /api/dodois/explorar?ruta=/accounting/…&desde=AAAA-MM-DD&hasta=AAAA-MM-DD` (solo admin):
- devuelve tal cual lo que responde Dodo, con las unidades ligadas;
- máximo 31 días por consulta;
- solo acepta rutas `/accounting/…`, `/production/…`, `/staff/…` o `/auth/roles/units`;
- no guarda nada.

---

## 3. Operación y diagnóstico

**¿Corre el cron?** Corre cada consulta por separado; el SQL Editor solo muestra el resultado de la última.

```sql
select jobname, status, return_message, start_time
  from cron.job_run_details d join cron.job j on j.jobid = d.jobid
 where j.jobname like 'dodois-%' order by start_time desc limit 5;
```

```sql
select status_code, left(content::text, 300), created from net._http_response order by created desc limit 3;
```

```sql
select inicio, tipo, origen, fecha, pedidos, total, estado, mensaje from dodois_sincronizaciones order by inicio desc limit 10;
```

**Cómo leer la respuesta de la app** (`net._http_response`):

| Respuesta | Qué significa |
|---|---|
| HTML de login | No llegó la clave: falta `DODOIS_CRON_SECRET` en Production o volver a desplegar |
| 401 con mensaje | La clave no coincide, o falta en Vercel |
| 200 con `"estado":"error"` | El mensaje dice qué pasó, por ejemplo "Hay que reconectar Dodo IS" → Ventas → Dodo IS → Reconectar |

**Disparar a mano:** `select dodois_disparar('cron');`. Después hay que ver su respuesta en `net._http_response`.

**Reconectar:** Ventas → Dodo IS → Reconectar. Sebastián inicia sesión en Dodo; nadie más escribe esa contraseña.

---

## 4. Otras entregas de esta etapa (ya en `main`)

- **Finanzas y Compras:**
  - **P&L por periodo que cubre cada factura** (migración `0029_periodo_cubre`): cada factura se reparte
    por días de su periodo (luz bimestral, renta del mes siguiente). La regla vive en el proveedor y el periodo se
    corrige en el detalle de la factura.
  - **Días de pago autorizados (viernes) y "Programar pagos"** (`0028_dias_de_pago`).
  - **Retenciones por enterar** (Finanzas → Retenciones; hecho en otra sesión a partir de la spec
    `2026-10-06-retenciones-design.md`).
  - **Selects que se salían de su celda:** se agregó `max-width: 100%` a `input, select, textarea`.
- **Usuarios:**
  - **El admin opera en cualquier sucursal** (migración `0040_sucursal_activa`). Tiene un selector
    "Operando en" y una vista general. `cambiar_mi_sucursal` cambia `perfiles.sucursal_id`, así que todas las reglas
    con `mi_sucursal()` lo siguen.
  - **Altas de usuarios admin:** Belen Caletti y Areli Lopez; `emarin` pasó a admin. Se hicieron con SQL; el patrón está
    en el README.

---

## 5. Pendientes

### 5.1 Lo que sigue con la API (por valor)

1. **Consumos de insumos** (`/accounting/stock-consumptions-by-period`). Responde 200 con `consumptionType`
   (Sale, Production, StaffMeal) y cantidades, pero los costos vienen casi todos en `null`. Sirve para comparar el
   costo real contra el teórico. Antes de diseñar, revisar con `/explorar` si Dodo tiene costos cargados.
2. **Productividad** (`/production/productivity`). Ya pedimos el scope `productionefficiency`; hay que reconectar una
   vez para que el token lo incluya y explorar qué trae (pedidos por hora o por persona).
3. **Mermas.** `/accounting/writeoffs/products` da 404; la ruta correcta no se ha encontrado. Hoy se importan del
   Excel (`docs/importar-mermas-dodo.md`). Buscar con `/explorar` (por ejemplo `/accounting/write-offs…`) o
   preguntar a soporte.
4. **Tiempos de cocina y entrega:** la API de ventas no los trae (el Excel sí). Hasta encontrar el endpoint, los días
   que vienen solo de la API no tienen tiempos.
5. **Precio de recepción → costos de receta.** Hoy los costos salen del Excel de UC México. Haría falta ligar los
   ingredientes del BOM con `dodo_insumo_id` y llevar un historial de precios.

### 5.2 Detalles menores conocidos (no urgentes)

- **Ventas:**
  - Un pedido que ya existe en otro día no cambia de día.
  - Un token rechazado (401) no se renueva antes de su vencimiento; el aviso de 3 errores seguidos lo cubre.
  - Un admin con sesión abierta podría disparar una sincronización extra desde otro sitio; solo cuesta una
    sincronización.
- **Recepciones:**
  - Si Dodo cambia el número de documento de una entrega, se pierde su clasificación manual.
  - Una factura cancelada sigue ligada a sus recepciones, y su reemplazo no se liga solo.
  - Si se corrige la cantidad o la fecha de una entrega ya ligada, la liga a la orden no se vuelve a revisar.
  - La pantalla muestra una tarjeta por insumo, no agrupada por entrega, y no enseña la hora.
  - "Actualizar ahora" (31 días por sucursal más ventas) puede acercarse al límite de 60 s.
  - `ligar_recepciones_dodo` revisa todas las pendientes en cada corrida.
- **Periodo que cubre:**
  - El gasto sin CFDI se guarda en dos pasos y no de forma atómica.
  - Al cambiar la fecha o el proveedor, se pierde el periodo editado a mano.
- **Sucursal activa:** es una por usuario; con dos pestañas en sucursales distintas, gana la última que se eligió.
- **Carpeta local de Sebastián** (`Downloads/dodo-control-efectivo_1/dodo-efectivo`): no está igual a `main`. Había unos
  60 archivos distintos de otras sesiones, y siguen ahí `app/api/dodois/login/route.ts` y `diagnostico/route.ts`, que ya
  no existen en `main`. Hay que decidir si se sincroniza completa con `main`.

---

## 6. Mapa rápido de archivos

| Tema | Archivos |
|---|---|
| Acceso y tokens | `lib/dodois/cliente.ts`, `lib/dodois/tokens.ts`, `app/api/dodois/conectar`, `app/api/dodois/callback` |
| Sincronización | `app/api/dodois/sincronizar/route.ts`, `app/ventas/dodois/sincronizar.ts`, `lib/dodois/cron.ts`, `lib/rutasPublicas.ts` |
| Ventas | `lib/dodois/ventas.ts` (usa `lib/ventas/pedidos.ts` → `resumirDias`, `ivaDe`) |
| Recepciones | `lib/dodois/recepciones.ts`, `app/compras/recepciones/*`, `app/compras/facturas/RecepcionesDodo.tsx` |
| Exploración | `lib/dodois/explorar.ts`, `app/api/dodois/explorar/route.ts` |
| Pantalla | `app/ventas/dodois/page.tsx`, `app/ventas/dodois/acciones.ts` |
| Base | `supabase/migrations/20261020180000_sincronizacion_dodois.sql`, `20261020200000_recepciones_dodois.sql`; activación del cron: `supabase/correcciones/2026-10-20_activar_sincronizacion_dodois.sql` |
| Specs | `docs/superpowers/specs/2026-10-20-sincronizacion-dodois-design.md`, `2026-10-20-recepciones-dodois-design.md` |
