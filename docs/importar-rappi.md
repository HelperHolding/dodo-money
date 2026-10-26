# Ventas Rappi desde el historial

Fuente: Portal Aliados → Historial de órdenes → detalle de cada orden. El Excel estándar solo tiene orden, fecha, pago, estado y un total; no incluye productos ni descuentos. El primer libro se construyó leyendo las dos páginas del historial, sin nombres de clientes ni repartidores. Periodo consultado 21 septiembre a 6 octubre 2026: 16 finalizadas, 20 renglones, 22 piezas; órdenes visibles del 2 al 5 octubre. No había canceladas en el filtro. No se incluyeron órdenes en progreso.

Libro de importación:
- Ordenes: ID orden completo, ID tienda, Fecha ISO, Hora HH:mm, Estado, Pago, Importe productos, Descuento restaurante, Subtotal restaurante, Descuento Rappi, Total a facturar. Fuente es opcional.
- Productos: ID orden, Renglon, Producto, Opciones, Cantidad, Importe renglon. El importe incluye toda la cantidad del renglón y las opciones; no multiplicarlo nuevamente. Un renglón de 2 Pepperoni por $378 es cantidad 2, importe 378.
- Resumen se ignora al importar. Se validan sumas de productos y ambas relaciones de descuentos. Se conserva un combo como producto propio con su selección, sin inventar sus componentes.

Ventas → Importar → Importar historial de Rappi, o Ventas → Rappi. Admin elige sucursal, revisa y confirma. El servidor vuelve a leer el archivo. La tienda queda ligada a esa sucursal; los IDs completos impiden duplicados y una reimportación actualiza solo las órdenes incluidas. No reemplaza días de Dodo IS ni borra órdenes ausentes del archivo.

La base para sumar es Subtotal restaurante, antes del descuento Rappi. Se conserva el total sugerido a facturar como otro dato; no se interpreta como una liquidación o depósito. En el primer libro: bruto $3,598, descuento restaurante $1,020, subtotal $2,578, descuento Rappi $400, sugerido a facturar $2,178. El usuario debe revisar la liquidación del subsidio de Rappi por separado. Se aplica el mismo tratamiento de IVA incluido de 16% que el resto del módulo de ventas, sobre el subtotal elegido.

Solo Finalizado y fuente Rappi suman. Se incluyen en tablero, calendario, reportes, pedidos, P&L, regalías y comisión Rappi vigente; no generan efectivo del restaurante ni comisión dLocal/NetPay. Los pagos del reporte describen cómo pagó el cliente a Rappi. Productos sin equivalencia quedan sin categoría y costo; admin vincula cada producto y opciones al SKU de Dodo IS y se aplica su costo vigente por fecha. Los combos requieren una equivalencia que cubra el combo completo.

Cuando una orden ya aparezca en Dodo IS se cambia su fuente a Dodo IS (por orden o por periodo). Conserva historial y deja de sumarse desde Rappi; reimportar no restablece la fuente. No hay conciliación automática por ID entre ambas plataformas mientras no esté disponible esa relación. P&L avisa cuando hay agregador Dodo y órdenes Rappi para el mismo día.

Antes de fusionar: ejecutar migración 0032 y su prueba en Supabase; PRUEBAS OK es un error intencional que revierte los datos de prueba. Requiere admin y corporativo activos y sucursal. Los permisos dejan lectura según el rol y sucursal; todas las mutaciones pasan por RPC de admin.

## Importación automática desde el portal

`POST /api/rappi/importar` recibe el mismo contenido que el Excel en JSON y usa la misma validación (`leerJsonRappi`) y el mismo RPC `importar_rappi`, así que reimportar actualiza sin duplicar. Header `x-api-key: RAPPI_API_KEY`. Body: `{ sucursal?, ordenes: [{rappi_id, tienda_id, fecha, hora, estado, pago, bruto, descuento_restaurante, subtotal_restaurante, descuento_rappi, facturar}], productos: [{rappi_id, linea, nombre, opciones, cantidad, importe}] }`. La sucursal sale de la tienda ya ligada; solo se manda la primera vez. `?revisar=1` valida sin guardar. Respuestas: 401 key, 400 JSON, 422 datos o RPC, 409 tienda ligada a otra sucursal.

Variables en Vercel: `RAPPI_API_KEY` (Sensitive). La cuenta de automatización es la de los reportes (`REPORTE_CUENTA_EMAIL`, `REPORTE_CUENTA_PASSWORD`) salvo que se definan `RAPPI_CUENTA_EMAIL`/`RAPPI_CUENTA_PASSWORD`; debe tener rol **admin** porque el RPC exige `edita_finanzas()`.

Extractor local (`scripts/rappi/sincronizar.mjs`, Playwright con Edge instalado, sin descargar navegadores):
1. Copia `scripts/rappi/.env.example` a `scripts/rappi/.env` y llénalo.
2. `npm run rappi:login`: abre Edge con un perfil propio (`%LOCALAPPDATA%\dodo-rappi-perfil`); inicia sesión a mano. La sesión del portal caduca en unos días; cuando pase, el script sale con código 2 y hay que repetir este paso.
3. `npm run rappi:sincronizar`: lee el historial, toma las órdenes de ayer (hora de México), abre cada detalle y las envía. Opciones: `-- --fecha AAAA-MM-DD`, `-- --ids id1,id2`, `-- --revisar`, `-- --headed`, `-- --json archivo.json`.
4. Diario a las 07:00: `powershell -ExecutionPolicy Bypass -File scripts\rappi\programar.ps1` registra la tarea “Dodo - Ventas Rappi” (`-Hora 06:30` para cambiarla, `-Quitar` para borrarla). Corre con tu usuario mientras haya sesión de Windows; si la PC estaba apagada, corre al encenderla. Bitácora en `%LOCALAPPDATA%\dodo-rappi.log`. Si falta un día, `npm run rappi:sincronizar -- --fecha AAAA-MM-DD`; reimportar no duplica.
5. Avisos (opcional, n8n): con `RAPPI_AVISO_URL` apuntando a un Webhook de n8n, cada corrida manda `{fecha, tienda, estado, mensaje, ordenes, renglones, omitidas, avisos, app}` con `estado` = `ok`, `sin_ordenes`, `sesion_expirada` o `error`. En n8n basta un IF sobre `estado != ok` → WhatsApp/correo para avisar que hay que correr `npm run rappi:login`.

La sesión del portal vive en el perfil de Edge de esta PC, así que el extractor corre aquí y n8n solo recibe avisos; el login no se automatiza.

Montos: la pantalla redondea a pesos, pero el detalle carga un JSON (`orders/partner/status/v2/store/{tienda}/orders/{id}`) con centavos; el extractor usa ese JSON (`order_totals`) y solo si falta recalcula con lo visible, con aviso. Opciones separadas con ` · ` como en las importaciones previas: la clave del producto depende de ese texto.

## Extractor en el servidor de n8n

Rappi no deja renovar la sesión fuera de su portal (su refresh responde 500 y Auth0 `access_denied`: el cliente es confidencial), así que n8n no puede sostenerla solo. La sesión se mantiene en un navegador dentro de un contenedor junto a n8n:

- `scripts/rappi/servidor.mjs` + `scripts/rappi/docker/`: servicio `rappi-extractor` (Playwright/Chromium) en la red de n8n, sin puertos publicados. `POST /sincronizar {fecha?, revisar?}` con `x-api-key: RAPPI_EXTRACTOR_KEY` abre el portal con la sesión del volumen (`/datos/sesion.json`), escucha el listado y el detalle que el propio portal pide, convierte con `scripts/rappi/api.mjs` y devuelve `{fecha, estado, mensaje, ordenes, renglones, omitidas, cuerpo}`. Tras cada corrida reescribe la sesión renovada. `GET /salud` indica si hay sesión.
- La sesión del login clásico de Rappi **dura 24 h** y el portal no la renueva solo (no deja cookie de sesión de Auth0). Por eso el extractor tiene **login automático** (`scripts/rappi/login.mjs`): con `RAPPI_USUARIO` y `RAPPI_PASSWORD` en el `.env` del servidor (nunca en el repo) llena el formulario cuando la sesión vence o no existe. Como mucho un intento por hora; tras 3 fallos seguidos se detiene (borrar `/datos/login.json` para reactivarlo) y el aviso trae el mensaje del portal.
- Sesión inicial: `npm run rappi:login -- --exportar rappi-sesion.json` en una PC (marcar “Recordarme”) y copiarla al volumen; repetir cuando el servicio responda `sesion_expirada`. El archivo equivale a una sesión iniciada: se comparte solo por privado.
- `scripts/n8n/flujo-rappi.mjs` genera y sube el flujo `Rappi_Ventas_Diarias`: **en vivo** cada 15 min de 10:00 a 23:45 importa las órdenes de hoy (`fecha: "hoy"`, `cache: true`: el extractor guarda en `/datos/cache-AAAA-MM-DD.json` las órdenes ya terminadas y solo abre las nuevas o las que cambiaron de estado; las que siguen en curso entran en otra vuelta), y el **cierre** a las 6:30 relee todo ayer sin caché, antes del Reporte_Diario de las 7:00 para que ya incluya Rappi y no compita por memoria con gotenberg. El cierre también **repasa los 7 días anteriores** (`repasar: 7`): solo reenvía órdenes cuyo estado cambió respecto al último registrado (p. ej. canceladas después de importarse como finalizadas) y las reporta en `cambios`; los días sin registro previo solo guardan una referencia del estado, sin reimportarse, para no mover cortes pasados. Si una vuelta se empalma con otra, responde `ocupado` y se salta. Avisos por correo: uno al aparecer un error o sesión vencida y otro cada 6 h si sigue ( webhook “Probar”, envío a `/api/rappi/importar`, correo si falla; el webhook responde con el resumen) con `scripts/n8n/.env` (`N8N_URL`, `N8N_API_KEY`).
- Estados del portal: Finalizado = `finished`, `finished_order`, `close_order`, `pending_review`, `on_the_route`, `arrive`; Cancelado = `canceled*`; el resto sigue en curso y no se importa.

El portal muestra pesos redondeados: si no llega el JSON, los descuentos se recalculan como `productos − subtotal` y `subtotal − total sugerido` para que cuadren con lo que muestra Rappi, y cada ajuste sale como aviso. Las órdenes que no se pueden leer se omiten, se reportan y el script termina con código 1. No guarda nombres de cliente ni repartidor. Automatizar el portal puede ir contra los términos de Rappi; si Rappi da acceso a su API de integraciones, conviene cambiar el extractor por esa API y mantener el endpoint.

## Paginación del historial

El extractor recorre el historial del portal página por página hasta pasar la fecha más antigua que necesita. Tras cada clic espera (hasta 30 s) a que el listado crezca y a que el portal termine de entregar su JSON; no repite el clic para no saltar páginas. Si no llega a esa fecha ni al final del historial, responde `estado: "error"` con `cortado: true` y un mensaje que lo dice, en vez de `sin_ordenes`, así n8n avisa y la siguiente vuelta lo reintenta. Antes, una espera fija de 500 ms podía cortar la lectura en silencio (el 7/10 llegó a leerse vacío).

## Costeo manual por renglón

El admin puede ligar un renglón de una orden a un producto de costeo propio (p. ej. `Rappi interno · <orden>/<renglón> · combo confirmado`). Desde la migración `20261026200000_rappi_conservar_costeo_manual.sql`, `importar_rappi` conserva ese `producto_id` cuando el renglón llega igual (misma posición, nombre, opciones, cantidad e importe; sin distinguir mayúsculas ni espacios), así que reimportar —Excel, flujo en vivo, cierre o recargas— no deshace esos costeos. Si el renglón cambió, se liga por clave como siempre. Ensayo aislado con PGlite: `node tests/rappiConservarCosteo.mjs /ruta/a/@electric-sql/pglite/dist/index.js`.
