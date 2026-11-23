# Help Desk de DODO MX — diseño

Fecha: 2026-11-23 · Responsable: Sebastián (scervera@dodopizza.mx) · Rama: `feat/help-desk`

## Objetivo

Una sección **Help Desk** dentro de DODO MX donde cualquier persona que usa la app puede **reportar problemas** del sistema o **proponer mejoras**, y Sebastián (con Julio, ambos admin) los atiende en un tablero tipo Jira. Sebastián recibe un correo por cada ticket nuevo y cada comentario de quien reporta.

Éxito = el personal reporta sin salir de la app y en menos de un minuto; ningún reporte se pierde; Sebastián se entera por correo y ve en el menú qué falta atender; quien reporta ve la respuesta sin buscarla.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Quién reporta | Todos los puestos: operación, encargado, gerente, admin, corporativo, marketing |
| Quién gestiona | Puesto `admin` (Sebastián y Julio) |
| Aviso a Sebastián | Correo (n8n + SMTP existente) + contador en el menú |
| Aviso a quien reporta | Solo contador en el menú (sin correo) |
| Ubicación | Módulo propio `/soporte`, separado de Tareas, con su estilo y componentes |
| Clave | `HD-<número>` (secuencia propia) |

## Flujo

### Quien reporta

1. En el menú lateral de toda la app aparece **«Ayuda»** (grupo propio, visible para todos los puestos) con el enlace a `/soporte` y un acceso «Reportar» que abre `/soporte/nuevo?desde=<ruta actual>`.
2. Formulario:
   - **Tipo**: Problema · Mejora (obligatorio).
   - **Sección**: lista de secciones de la app; se prellena a partir de `desde` (p. ej. `/caja-chica` → Caja chica). Editable; incluye «Otra / general».
   - **Título**: 5–150 caracteres.
   - **Descripción**: «¿Qué pasó?» o «¿Qué propones?» según el tipo; 10–4000 caracteres.
   - **¿Te impide trabajar?** sí/no (solo para Problema). Sí → prioridad inicial Alta; no → Media. Mejora → Baja.
   - **Captura** opcional: una imagen (jpg, png, webp, heic) de hasta 4 MB (mismo límite que caja chica, `MAX_FOTO_BYTES`).
3. Se guarda con su puesto, sucursal (si tiene) y la ruta `desde`. Ve la confirmación «HD-14 recibido».
4. `/soporte` le muestra **sus tickets en tarjetas** (clave, tipo, título, estado, fecha, marca «Respuesta nueva»). En el detalle puede leer el hilo y comentar mientras el ticket no esté Descartado.

### Admin

- `/soporte` muestra el **tablero** con columnas **Nuevo → En revisión → En progreso → Resuelto** (Resuelto solo de los últimos 30 días) y una pestaña **Lista** en tarjetas con filtros: tipo, estado (incluye Descartado), sección, prioridad, sucursal, texto. En celular el tablero se ve como columnas apiladas en tarjetas (sin desplazamiento horizontal).
- Detalle `/soporte/[numero]`: datos del ticket, captura, hilo de comentarios e historial. El admin cambia **estado**, **prioridad** (Alta/Media/Baja) y **responsable** (cualquier admin; por defecto el responsable configurado en Ajustes).
- Transiciones permitidas (solo admin):
  - Nuevo → En revisión, En progreso, Resuelto, Descartado
  - En revisión → En progreso, Resuelto, Descartado
  - En progreso → En revisión, Resuelto, Descartado
  - Resuelto → En progreso (reabrir)
  - Descartado → En revisión (reabrir)
  - Pasar a **Resuelto** o **Descartado** exige un comentario (5+ caracteres) que queda en el hilo.
- Si quien reporta comenta en un ticket **Resuelto**, el ticket no cambia solo; el admin recibe el aviso y decide si lo reabre.
- `/soporte/ajustes` (solo admin): responsable por defecto, correos que reciben avisos (lista; inicial `scervera@dodopizza.mx`), casillas «Avisar tickets nuevos» y «Avisar comentarios de quien reporta» (ambas encendidas al inicio).

### Visibilidad

- Cada persona ve **solo los tickets que levantó**, aunque sea corporativo.
- Admin ve y gestiona todos.
- Los comentarios de admin aparecen con su nombre y la etiqueta «Soporte».

## Avisos

### Correo a responsables

- Eventos: ticket nuevo; comentario de quien reporta (no los de admin).
- Al ocurrir, la misma transacción inserta una fila en `soporte_avisos` por cada correo configurado (si la casilla del evento está encendida).
- Un flujo de n8n («Help Desk dodo-money») llama cada minuto a `POST /api/soporte/avisos` con encabezado `x-api-key: SOPORTE_API_KEY`. El endpoint toma hasta 10 avisos pendientes (los marca `enviando` con fecha) y devuelve `{ id, para, asunto, html }`. n8n los manda por el SMTP de hola@dodopizza.mx y reporta a `POST /api/soporte/avisos/resultado` `{ id, ok, error? }`.
- Un aviso `enviando` por más de 10 minutos vuelve a `pendiente`; tras 5 intentos fallidos queda `fallido` y se ve en Ajustes.
- Asunto: `[HD-14] Problema · Caja chica · No guarda la foto` o `[HD-14] Comentario de Ana López`. Cuerpo: tipo, sección, sucursal, quién, prioridad, texto (escapado) y botón «Abrir ticket» a `<URL de la app>/soporte/14`. La captura no se adjunta (solo se menciona que existe).
- Si falta `SOPORTE_API_KEY`, el endpoint responde 401 y los avisos esperan en la tabla; la app funciona igual.

### Contador en el menú

- Se basa en `soporte_lecturas (ticket_id, usuario_id, leido_en)`, que se actualiza al abrir el detalle.
- Admin: tickets en Nuevo + tickets con comentarios de quien reporta posteriores a su última lectura. En rojo si hay algún Problema Alta en Nuevo.
- Quien reporta: sus tickets con comentarios de admin o cambios de estado posteriores a su última lectura.
- Si la migración no existe o la consulta falla, no aparece contador y la página sigue (igual que Tareas).

## Datos (una migración `supabase/migrations/20261123120000_soporte.sql`)

- Tipos: `tipo_ticket` (`problema`,`mejora`), `estado_ticket` (`nuevo`,`en_revision`,`en_progreso`,`resuelto`,`descartado`); prioridad reutiliza `prioridad_tarea`.
- `soporte_tickets`: `id uuid`, `numero bigint` (identidad, único), `tipo`, `estado` (default `nuevo`), `prioridad`, `titulo`, `descripcion`, `seccion text`, `ruta_origen text`, `bloquea boolean`, `captura text` (ruta en storage), `creado_por` → perfil, `rol_creador`, `sucursal_id`, `responsable` → perfil admin, `creado_en`, `actualizado_en`, `cerrado_en` (lleno solo en resuelto/descartado). Checks de longitudes y de coherencia estado/cerrado_en.
- `soporte_comentarios`: `id`, `ticket_id`, `autor`, `es_soporte boolean`, `texto` (1–4000), `creado_en`.
- `soporte_historial`: `ticket_id`, `quien`, `campo` (`estado`,`prioridad`,`responsable`), `antes`, `despues`, `en`.
- `soporte_lecturas`: PK (`ticket_id`,`usuario_id`), `leido_en`.
- `soporte_ajustes`: una sola fila; `responsable_default`, `correos text[]`, `avisar_nuevos`, `avisar_comentarios`.
- `soporte_avisos`: `id`, `ticket_id`, `evento` (`nuevo`,`comentario`), `comentario_id` (solo en comentario), `para`, `estado` (`pendiente`,`enviando`,`enviado`,`fallido`), `intentos`, `ultimo_error`, `creado_en`, `tomado_en`, `enviado_en`.
- Bucket privado `soporte`, ruta `<usuario>/<uuid>.<ext>`; política: cada quien sube a su carpeta; lectura de la dueña y admin; la app muestra la captura con URL firmada.
- RLS en todas las tablas. Escrituras por funciones `security definer` con mensajes P0001 en español: `crear_ticket`, `comentar_ticket`, `cambiar_ticket` (estado/prioridad/responsable con validación de transición y comentario), `marcar_ticket_leido`, `contar_soporte`, `soporte_tomar_avisos`, `soporte_resultado_aviso`. Las dos últimas solo para `service_role`. Lectura con `tickets_visibles(filtros)` y `hilo_ticket(numero)`.
- El correo se arma en TypeScript (`lib/soporte/correo.ts`) dentro de `/api/soporte/avisos`, no en SQL: `soporte_tomar_avisos` devuelve los datos del ticket y del comentario, y el endpoint compone asunto y HTML.

## Código

- `lib/soporte.ts`: constantes (tipos, estados, columnas, prioridades), `clave(numero)`, `seccionDeRuta(ruta)`, `siguientes(estado)`, `pideComentario`, validaciones del formulario. Con pruebas.
- `lib/soporte/correo.ts`: arma asunto y HTML con escape. Con pruebas.
- `app/soporte/`: `layout.tsx` (Marco), `page.tsx` (mis tickets o tablero/lista), `nuevo/page.tsx` + formulario cliente con captura, `[numero]/page.tsx`, `ajustes/page.tsx`, `acciones.ts`, `datos.ts`, componentes de tarjeta y tablero en el estilo de Tareas.
- `app/api/soporte/avisos/route.ts` y `.../resultado/route.ts`, reutilizando `llaveValida`.
- `lib/roles.ts`: grupo «Ayuda» para todos los puestos (+ Ajustes para admin); actualizar `lib/roles.test.ts`.
- `components/Marco.tsx`: contador de soporte junto al de Tareas.
- Sección prellenada: tabla en `lib/soporte.ts` que mapea prefijos de ruta a nombres de sección.

## Errores

- Validación en el cliente y de nuevo en la base; los mensajes P0001 llegan al usuario y el resto se reemplaza por un genérico (como `mensajeDe` de Tareas).
- La captura se sube antes de crear el ticket; si la creación falla, se borra.
- Imagen inválida o >4 MB: mensaje y el ticket no se manda.

## Pruebas

- PGlite (`supabase/pruebas/soporte.sql`, termina con «PRUEBAS OK»): cada quien ve solo lo suyo; admin ve todo; no admin no cambia estado; transiciones inválidas rechazadas; Resuelto/Descartado exigen comentario; avisos creados según ajustes y solo por comentarios de quien reporta; reintentos y paso a `fallido`; contadores.
- Unitarias de `lib/soporte.ts`, `lib/soporte/correo.ts` y `lib/roles.test.ts`.
- `tsc` y `next build`.
- Navegador: en la vista previa de Vercel después de que Sebastián corra la migración (no hay `.env.local`).

## Puesta en marcha (Sebastián)

1. Correr la migración y `supabase/pruebas/soporte.sql` en Supabase de producción → «PRUEBAS OK».
2. Crear `SOPORTE_API_KEY` en Vercel.
3. Activar el flujo de n8n con la credencial `x-api-key` y mandar un ticket de prueba.
4. Fusionar el PR a `main`.

## Fuera de alcance (v1)

Votos en mejoras, notas internas, SLA/tiempos de respuesta, avisos por WhatsApp o push, correo a quien reporta, varias capturas, ligar tickets con Tareas.
