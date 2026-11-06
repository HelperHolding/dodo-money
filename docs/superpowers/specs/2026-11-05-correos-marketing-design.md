# Correos de marketing: campañas, contactos y estadísticas (diseño)

**Fecha:** 2026-11-05 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

Hoy cada campaña de correo (apertura 22 oct, Go Big 30 oct) la arma Sebastián a mano en n8n: duplicar flujos,
pegar el HTML, cargar la lista en una tabla de n8n, abrir un candado. Marketing no puede hacerlo sola ni ve
resultados. DODO MX tendrá una sección **Correos** donde marketing:

1. Sube el HTML que exporta Canva, pone el asunto y ve la vista previa.
2. Manda una prueba a hasta 5 correos.
3. Elige a quién va (toda la base o una etiqueta) y cuándo (ahora o fecha y hora de México) y la lanza, **sin
   aprobación** de un admin.
4. Ve las estadísticas: enviados, con problema, aperturas y clics únicos, clics por enlace, bajas y quién abrió o dio
   clic.
5. Administra una base de contactos única con etiquetas, importación por CSV y bajas.

**Éxito:** una persona de marketing exporta el HTML de Canva, crea la campaña «Halloween», manda la prueba a su
correo, la programa para el viernes a las 12:00 a la etiqueta «Zapopan» y se va. El viernes a las 12:30 abre la
campaña y ve 249 aceptados, 2 con problema, 41 % de aperturas, 6 % de clics y 1 baja, sin que Sebastián tocara n8n.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Quién usa la sección | Puesto nuevo `marketing` y `admin` hacen todo; `corporativo` solo consulta estadísticas |
| Aprobación | Ninguna: marketing lanza sus campañas |
| Destinatarios | Base de contactos única en Supabase; la campaña va a toda la base activa o a una etiqueta |
| Fuente de verdad | Supabase guarda contactos, campañas, envíos y eventos |
| Quién manda el correo | n8n, con la credencial SMTP actual (`hola@dodopizza.mx`). La contraseña nunca sale de n8n |
| Cómo se coordinan | n8n consulta la app cada minuto (pull) con `x-api-key`; la app le entrega correos ya armados y n8n reporta el resultado |
| Seguimiento | En la app (Next.js en Vercel), no en n8n: píxel de apertura, redirección de clics y página de baja |
| Remitente | Fijo: `Dodo Pizza México <hola@dodopizza.mx>`, responder a `hola@dodopizza.mx` |
| Imágenes | Se quedan donde las aloje Canva; la app no aloja imágenes en esta versión |
| Ritmo | Lotes de 8 por minuto con 5 s entre correos: ~10/min, 249 en ~30 min |
| Pruebas de campaña | Mismo camino de envío, marcadas `es_prueba`; no cuentan en estadísticas; máximo 5 destinatarios |

## 3. Pantallas

Ruta `/correos`, nuevo enlace «Correos» en el menú para `marketing`, `admin` y `corporativo`. Tarjetas en lugar de
tablas anchas, como el resto de la app.

### 3.1 Campañas (`/correos`)

- Tarjeta por campaña: nombre, asunto, estado, fecha programada o de envío, destinatarios y, si ya se envió,
  % de aperturas y % de clics.
- Filtro por estado. Botón «Nueva campaña» (no para corporativo).
- Si una campaña está `programada` o `enviando` y n8n no ha pedido correos en 10 min, la tarjeta dice «Esperando a
  n8n».

### 3.2 Nueva / editar campaña (`/correos/nueva`, `/correos/[id]/editar`)

Solo en estado `borrador` o `programada`.

- Nombre interno y asunto (1–150 caracteres).
- HTML: pegar el código o subir el `.html` (máx. 500 KB). Vista previa en un `<iframe sandbox>` sin scripts.
- Al guardar se limpia el HTML: se quitan `<script>`, manejadores `on*=` y `javascript:`; se avisa si se quitó algo.
- «Mandar prueba»: hasta 5 correos (separados por coma). Llega en menos de un minuto con `[PRUEBA]` al inicio del
  asunto.
- A quién va: «Toda la base» o una etiqueta existente; muestra cuántos contactos activos son.
- Cuándo: «Enviar ahora» o fecha y hora (zona `America/Mexico_City`), no en el pasado.
- «Programar» pasa la campaña a `programada`. «Regresar a borrador» la saca de la programación para editarla;
  «Cancelar» la deja `cancelada` para siempre (se puede duplicar).
- Las estadísticas siempre excluyen los envíos `es_prueba`.

### 3.3 Campaña (`/correos/[id]`)

- Acciones según estado: editar, cancelar, detener (`enviando` → `detenida`), reanudar (`detenida` → `enviando`),
  reintentar los que tienen problema, duplicar.
- Números: destinatarios, aceptados, con problema, pendientes, aperturas únicas y %, clics únicos y %, bajas.
  Los porcentajes se calculan sobre aceptados.
- Clics por enlace (URL destino y número de personas únicas).
- Actividad por hora (aperturas y clics) desde el inicio del envío.
- Lista de destinatarios con estado, si abrió, si dio clic y cuándo; búsqueda por correo; descargar CSV.
- Vista previa del HTML enviado.

### 3.4 Contactos (`/correos/contactos`)

- Buscar por correo o nombre; filtro por etiqueta y estado (`activo`, `baja`, `rebote`).
- Agregar uno a mano; editar nombre y etiquetas; dar de baja a mano.
- Importar CSV con columnas `correo` (obligatoria), `nombre`, `etiquetas` (separadas por `;`). Resumen antes de
  confirmar: nuevos, ya existentes (se les suman las etiquetas), inválidos y dados de baja (no se reactivan).
- Corporativo solo consulta.

## 4. Datos

Migración nueva `supabase/migrations/<fecha>_correos_marketing.sql`.

### 4.1 Puesto `marketing`

- `alter type rol_usuario add value if not exists 'marketing';`
- La regla de `perfiles` que hoy exige `(rol = 'corporativo') = (sucursal_id is null)` pasa a permitir
  `sucursal_id is null` también para `marketing` (oficina central, sin sucursal).
- `lib/roles.ts`: `NOMBRE_ROL.marketing = "Marketing"`, `puedeVerCorreos` (marketing, admin, corporativo) y
  `puedeEditarCorreos` (marketing, admin). Marketing no ve ninguna otra sección.
- Invitaciones y administración de usuarios ofrecen el puesto nuevo.

### 4.2 Tablas

**`correo_contactos`**: `id`, `email` (texto, único, guardado en minúsculas y sin espacios), `nombre`,
`etiquetas text[]`, `estado` (`activo` | `baja` | `rebote`), `origen` (texto libre: «Apertura 22 oct», nombre del
CSV, «manual»), `fecha_baja`, `creado_en`, `actualizado_en`.

**`correo_campanas`**: `id`, `nombre`, `asunto`, `html`, `etiqueta` (null = toda la base), `programada_para`
(timestamptz), `estado` (`borrador` | `programada` | `enviando` | `detenida` | `enviada` | `cancelada`),
`iniciada_en`, `terminada_en`, `creada_por` (perfil), `creado_en`, `actualizado_en`.

**`correo_envios`**: `id`, `campana_id`, `contacto_id` (null en pruebas), `email` (copia al momento de armar la
lista), `token` (aleatorio de 22+ caracteres, único), `es_prueba`, `estado` (`pendiente` | `procesando` | `aceptado`
| `problema`), `reservado_en`, `enviado_en`, `message_id`, `detalle`. Único `(campana_id, contacto_id)` para envíos
reales.

**`correo_eventos`**: `id`, `envio_id`, `tipo` (`apertura` | `clic` | `baja`), `enlace` (destino del clic), `agente`
(user-agent, 300 caracteres), `sospechoso` (bool: clic de antivirus, ver 6.2), `creado_en`.

**`correo_estado_n8n`**: una fila con `ultima_consulta` para saber si n8n está pidiendo correos.

### 4.3 Permisos (RLS)

- `marketing` y `admin`: leer y escribir contactos y campañas; leer envíos y eventos.
- `corporativo`: leer campañas, envíos (con la copia del correo de cada destinatario) y eventos; no lee
  `correo_contactos` ni la sección Contactos.
- Los demás puestos: nada.
- Envíos y eventos solo se escriben desde funciones `security definer` llamadas por las rutas de API con la llave de
  servicio, nunca desde el navegador.

## 5. Envío

### 5.1 Ciclo de vida de la campaña

```
borrador ──programar──▶ programada ──(hora llegó, n8n pide)──▶ enviando ──(sin pendientes)──▶ enviada
   ▲                        │                                    │   ▲
   └──regresar a borrador───┘                              detener   reanudar
                                                                 ▼   │
                                                               detenida
programada/borrador ──cancelar definitivo──▶ cancelada
```

### 5.2 Rutas para n8n (autenticadas con header `x-api-key` contra `CORREOS_API_KEY`)

- `POST /api/correos/siguiente` `{ lote?: number }` (máx. 8). Llama a la función `correo_tomar_lote(lote)` que, en
  una transacción con bloqueo de filas (`for update skip locked`):
  1. Actualiza `correo_estado_n8n.ultima_consulta`.
  2. Pasa a `enviando` las campañas `programada` cuya hora ya llegó y arma sus envíos con los contactos `activo` de
     la etiqueta (o de toda la base), sin duplicados.
  3. Pasa a `problema` los envíos `procesando` con `reservado_en` de hace más de 15 min (detalle: «Sin respuesta de
     n8n; puede haber salido, revisar antes de reintentar»).
  4. Reserva hasta `lote` envíos `pendiente` (primero pruebas, luego por fecha de campaña) → `procesando`.
  5. Pasa a `enviada` las campañas `enviando` sin envíos `pendiente` ni `procesando`.

  Responde `[{ envio_id, para, asunto, html, texto }]` con el HTML ya personalizado (5.3) y una versión en texto plano.
- `POST /api/correos/resultado` `{ envio_id, aceptado: boolean, message_id?, detalle? }`. Solo acepta envíos en
  `procesando`. `aceptado` → `aceptado`; si no → `problema`. Si el servidor SMTP rechazó la dirección (código 5xx
  en `detalle`), el contacto pasa a `rebote`.

### 5.3 Preparación del HTML (`lib/correos/preparar.ts`, función pura)

- Reescribe cada `href` que apunte a un dominio permitido a `https://<app>/api/correos/c/<token>?u=<url>`.
- Agrega antes de `</body>` el píxel `https://<app>/api/correos/a/<token>.gif` (1×1, `alt=""`).
- Agrega antes de `</body>` un pie discreto: «Si ya no quieres recibir estos correos, date de baja aquí» con enlace a
  `https://<app>/baja/<token>`.
- Versión de texto plano: asunto, enlaces principales y el enlace de baja.
- En pruebas usa un token real de envío de prueba: el seguimiento se puede revisar, pero no suma a estadísticas.

### 5.4 Flujo de n8n «Correos dodo-money»

Archivo versionado en `docs/n8n/correos-dodo-money.json` y script `scripts/n8n/flujo-correos.mjs` que lo sube, como
`flujo-rappi.mjs`.

1. Disparador cada minuto.
2. `POST /api/correos/siguiente` con `lote: 8`.
3. Uno por uno: nodo *Send Email* (credencial «SMTP account», remitente fijo, HTML y texto), sin reintento
   automático.
4. `POST /api/correos/resultado` con `accepted`/`messageId` o el error.
5. Pausa de 5 s y siguiente.
6. Flujo de error que avisa por correo a Sebastián si el flujo falla tres veces seguidas.

## 6. Seguimiento y bajas

### 6.1 Aperturas

`GET /api/correos/a/[token].gif`: responde un GIF transparente 1×1 con `Cache-Control: no-store` y registra un
evento `apertura` (si el token existe). Estadística: envíos con al menos una apertura.

### 6.2 Clics

`GET /api/correos/c/[token]?u=<url>`:

- Solo redirige (302) si `u` es `https` y su dominio está en la lista permitida: `dodopizza.mx` y subdominios, más
  los de la variable `CORREOS_DOMINIOS_EXTRA` (p. ej. `instagram.com,wa.me`). Si no, redirige a
  `https://dodopizza.mx/`.
- Agrega `utm_source=correo&utm_medium=email&utm_campaign=<slug de la campaña>` si no trae `utm_source`.
- Registra el evento `clic` con el destino. Se marca `sospechoso` si llega en los primeros 10 s después de
  `enviado_en` (antivirus que abren los enlaces solos); los sospechosos no cuentan en el % de clics pero se ven en
  el detalle.
- Un clic también cuenta como apertura si el envío no tenía ninguna (la persona tenía las imágenes bloqueadas).

### 6.3 Bajas

- `GET /baja/[token]`: página pública con el logo de Dodo, «¿Ya no quieres recibir nuestros correos?» y un botón
  «Darme de baja». No da de baja al abrirla (los antivirus abren enlaces).
- `POST` del botón: el contacto pasa a `baja` con `fecha_baja`, se registra el evento `baja` y la página confirma.
  Idempotente.
- Las campañas futuras no incluyen contactos `baja` ni `rebote`; los envíos ya armados `pendiente` de un contacto que
  se da de baja se omiten al reservarlos.

## 7. Fallas

| Caso | Qué pasa |
|---|---|
| SMTP rechaza o falla | Envío `problema` con el motivo; sin reintento automático. Botón «Reintentar con problema» los regresa a `pendiente` |
| n8n se cae a mitad | `procesando` de más de 15 min → `problema` (pudo haber salido). El resto sigue cuando n8n vuelve |
| n8n no consulta en 10 min con campañas listas | Aviso «Esperando a n8n» en la tarjeta y en el detalle |
| Rebote inmediato (5xx) | Contacto `rebote`; no se le vuelve a mandar |
| Rebote posterior (correo de respuesta) | Fuera de alcance en esta versión |
| HTML con scripts | Se quitan al guardar y se avisa |
| Lista vacía, sin asunto, fecha pasada | No deja programar; mensaje claro |
| Doble programación o doble reserva | Estados con transición única y `for update skip locked` |
| Token inexistente en píxel o clic | GIF / redirección a `dodopizza.mx` sin registrar nada |

## 8. Datos iniciales

Los 249 contactos de la apertura se exportan de la tabla de n8n `Dodo_Apertura_2026_10_22` a CSV y se cargan con
**Importar CSV** de la propia sección, con la etiqueta `apertura-2026-10-22`. Así los correos de clientes no quedan en
el repositorio. Las campañas pasadas no se migran.

## 9. Pruebas

- **SQL en PGlite** (`supabase/pruebas/correos.mjs`), con stubs que copian los CHECK y enums reales:
  reserva sin duplicados con dos llamadas simultáneas; armado de lista que excluye `baja` y `rebote` y respeta la
  etiqueta; transiciones de campaña; `procesando` vencido → `problema`; RLS por puesto (marketing, admin,
  corporativo, gerente).
- **Unitarias** (`node --test`): `preparar.ts` (reescritura de enlaces, píxel, pie, dominios no permitidos sin
  tocar); validación de destino de clics; cálculo de estadísticas únicas y exclusión de clics sospechosos;
  importación de CSV (duplicados, inválidos, bajas no reactivadas); limpieza de HTML.
- **Flujo de n8n**: prueba como la de `.cumplimiento/tests/n8nCumplimiento.test.mjs` (nodos, sin secretos, sin
  reintento SMTP, pausa de 5 s).
- **Extremo a extremo antes de publicar**: campaña de prueba a `scervera@dodopizza.mx` por el flujo real de n8n;
  comprobar apertura, clic con UTM y baja en la página de la campaña.

## 10. Entrega

- Rama `feat/correos-marketing` y PR hacia `main`; deben pasar «Historial válido» y «Pruebas y tipos».
- La migración y la semilla se entregan a Sebastián para correrlas en producción; la sección no se publica hasta
  tener su resultado.
- Variables nuevas en Vercel: `CORREOS_API_KEY`, `CORREOS_DOMINIOS_EXTRA` (opcional). En n8n, la misma llave en el
  flujo.
- Al publicar: apagar los flujos de n8n de campañas pasadas que siguen activos («Go Big 30 oct · CAMPAÑA 249 ·
  12:00») y dejar el flujo «Seguimiento de correos» de n8n solo para las pruebas ya registradas. El flujo «Imagen
  combos (sucursal)» se queda encendido porque el correo de Go Big lo usa.

## 11. Fuera de alcance

Alojar imágenes en la app, editor visual, pruebas A/B, leer rebotes posteriores, cabecera `List-Unsubscribe` de un
clic, segmentos con varias etiquetas y envío desde otros remitentes.
