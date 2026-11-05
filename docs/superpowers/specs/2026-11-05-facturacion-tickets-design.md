# Autofacturación de tickets — diseño

Fecha: 2026-11-05 · Estado: aprobado en conversación, pendiente de revisión escrita

## Objetivo

Que el cliente de Dodo Pizza facture su ticket sin intervención de la oficina, desde una página pública, y que la oficina tenga el control de lo facturado para restarlo de la factura global que hace el contador.

Hoy: el ticket dice "solicitada a facturacion@dodopizza.mx"; alguien factura a mano en el portal del SAT; el contador hace la global a mano en el SAT.

Éxito:
- Un cliente con su ticket del mes en curso obtiene PDF y XML timbrados en menos de 2 minutos desde el celular.
- Es imposible facturar dos veces el mismo ticket.
- El contador recibe un Excel mensual de lo facturado por ticket.

## Alcance

Dentro:
- Solo la razón social **Helper Comercializadora Master** (RFC HCM260306B93) y su sucursal Mariano Otero (Zapopan-1), con el CSD que ya tienen.
- Facturas individuales CFDI 4.0 timbradas con **Facturapi**.
- Pantalla de oficina para consultar, cancelar, reenviar y exportar.

Fuera (fases posteriores):
- Factura global automática (Facturapi la soporta desde recibos).
- Otras razones sociales o sucursales con su propio CSD. La tabla `facturacion_sucursales` deja la puerta abierta.
- Número corto del pedido (#23) como dato de búsqueda; requiere confirmar si el scope `orders` de Dodo IS lo trae.

## Flujo del cliente — `/facturar`

Página pública (sin sesión), con marca Dodo y diseño pensado primero para móvil. Se agrega a `EXACTAS` o `CON_PREFIJO` en `lib/rutasPublicas.ts`.

1. **Encontrar el ticket.** La sucursal es fija mientras haya una sola. El cliente captura fecha, hora y total, tal como vienen en el ticket. Se busca en `pedidos` un registro con:
   - misma sucursal y misma `fecha`;
   - `total` exacto;
   - `hora` dentro de ±3 minutos;
   - `estado = 'entregado'`.

   Con una sola coincidencia, se muestran los productos y el total para que el cliente confirme. Con cero, el mensaje pide revisar los datos. Con más de una, el mensaje pide escribir a facturacion@dodopizza.mx.
2. **Datos fiscales.**
   - RFC, nombre o razón social, régimen fiscal, código postal, uso del CFDI (filtrado por régimen según el catálogo del SAT) y correo.
   - Opción de subir la constancia de situación fiscal para llenar los campos, reutilizando la lectura de `leerConstanciaSubida` de Compras.
   - Si el pedido se pagó con tarjeta (`pago = 'tarjeta'`), el cliente elige crédito (04) o débito (28). Si se pagó en línea (`pago = 'en_linea'`), también se le pregunta. Efectivo se factura como 01. Los pedidos con `pago = 'otro'` no se facturan en el portal.
3. **Timbrado.** Se timbra en Facturapi y se muestran botones para descargar el PDF y el XML. Facturapi envía ambos al correo capturado.

### Reglas

- Un ticket, una factura. Si ya existe una factura `timbrada`, se muestra "Este ticket ya se facturó" con la opción de reenviarla al correo original. No se puede refacturar a otro RFC desde el portal; eso requiere que la oficina cancele primero.
- Plazo: solo se facturan pedidos del mes calendario en curso, en hora de Ciudad de México. El mensaje para un pedido del mes anterior explica que ya está en la factura global e indica el correo de facturación.
- Se excluyen:
  - los pedidos cancelados;
  - `tipo = 'personal'`;
  - los pedidos con `agregador` (Rappi y otros), que se concilian aparte;
  - los pedidos con `pago = 'otro'`;
  - los RFC genéricos `XAXX010101000` y `XEXX010101000`.
- Anti-abuso: límite de intentos de búsqueda por IP (por ejemplo, 10 por cada 10 minutos). La búsqueda no revela nada si no coinciden fecha, hora y total.

## Arquitectura

### Base de datos (migración nueva `supabase/migrations/2026110xxxxxxx_facturacion_clientes.sql`)

Tabla `facturas_clientes`:

| columna | notas |
|---|---|
| `id` uuid pk | |
| `pedido_id` text → `pedidos(dodo_id)` | índice único parcial `where estado <> 'cancelada'` |
| `rfc_emisor` text → `razones_sociales(rfc)` | emisor, tomado de `facturacion_sucursales` |
| `rfc`, `nombre`, `regimen_fiscal`, `codigo_postal`, `uso_cfdi`, `correo` | receptor |
| `forma_pago` text | 01 / 04 / 28 |
| `subtotal`, `iva`, `total` numeric(12,2) | `total` = `pedidos.total` |
| `estado` text | `en_proceso` · `timbrada` · `cancelada` · `error` (CHECK) |
| `facturapi_id`, `uuid`, `serie`, `folio` | se llenan al timbrar |
| `error` text | último mensaje de Facturapi |
| `creada`, `timbrada_en`, `cancelada_en`, `motivo_cancelacion`, `cancelada_por` | |

Tabla `facturacion_sucursales(sucursal_id, rfc_emisor)`: qué sucursales facturan y con qué RFC. Arranca con Mariano Otero → HCM260306B93, fijada por RFC porque `razon_social_sucursales` liga Zapopan-1 a CMS230321FI8 (SITRU). La tabla `facturacion_intentos` guarda el hash de la IP para el límite de búsquedas.

RLS: `select` para admin y corporativo; sin `insert`, `update` ni `delete` para usuarios ni anon.

Funciones `security definer`, con `execute` solo para `service_role`:
- `facturacion_buscar_ticket(p_sucursal, p_fecha, p_hora, p_total)` regresa id, fecha, hora, total, pago, productos y si ya está facturado. Aplica el plazo y las exclusiones.
- `facturacion_reservar(p_pedido, datos…)` inserta la fila en `en_proceso`. Si ya existe una fila activa, falla con un mensaje claro: el índice único resuelve el doble clic.
- `facturacion_confirmar(p_id, facturapi_id, uuid, serie, folio)` cambia el estado a `timbrada`.
- `facturacion_liberar(p_id, error)` cambia el estado a `error`, lo que libera el pedido para reintentar.

El servidor las llama con el cliente de `lib/supabase/admin.ts`.

### Código (`lib/facturacion/`)

- `reglas.ts` (puro, con pruebas): plazo del mes, exclusiones, RFC genérico, mapeo de forma de pago y filtro de uso del CFDI por régimen.
- `conceptos.ts` (puro, con pruebas): convierte `pedido_productos` en conceptos de Facturapi. Usa el precio con descuento, con IVA 16 % incluido (`tax_included`). Las claves SAT de producto y unidad son configurables; la propuesta es `90101501` y `E48`, a confirmar con el contador. Falla si la suma no cuadra al centavo con `pedidos.total`.
- `facturapi.ts`: cliente con `fetch` (sin SDK) para crear factura, descargar PDF y XML, enviar por correo, cancelar y consultar. Lee la llave de `FACTURAPI_KEY`: llave de prueba en Preview y llave real en Production. Traduce los errores de validación de Facturapi al español.

### UI

- `app/facturar/`: los tres pasos, con server actions y sin datos en la URL.
- `app/finanzas/facturacion/`: lista del mes en tarjetas, siguiendo la preferencia del proyecto por tarjetas sobre tablas anchas. Admin y corporativo ven la lista. Solo admin cancela, con los motivos SAT 02 y 03, que no requieren sustitución; refacturar con sustitución (01) queda fuera de esta fase. Después de cancelar, el cliente puede volver a facturar el ticket y reenvía. Botón "Excel del mes" con fecha, ticket, RFC, nombre, subtotal, IVA, total, UUID y estado.

## Errores

- Facturapi rechaza los datos (RFC, nombre o CP no coinciden con el SAT): se ejecuta `liberar` y el cliente ve el mensaje y corrige.
- Timeout o respuesta desconocida: la fila se queda en `en_proceso` y la oficina la ve como "por confirmar". Antes de reintentar se consulta Facturapi para no timbrar doble; se manda `idempotency_key` y `external_id` iguales al id de la fila, y el reintento busca por `external_id`.
- La suma de conceptos no cuadra o el pedido no tiene productos: no se timbra, y el cliente ve un mensaje con el correo de facturación.

## Pruebas

- Unitarias (`node --test`) de `reglas.ts` y `conceptos.ts`, incluidos descuentos, combos y redondeo.
- SQL en PGlite (`supabase/pruebas`): búsqueda con ±3 minutos, exclusiones, plazo, reserva doble y liberar y reintentar. Los stubs deben copiar los CHECK reales.
- De punta a punta en Preview con la llave de prueba de Facturapi y un pedido real sincronizado.
- Revisión en móvil de `/facturar`.

## Entregas de Sebastián

1. Crear la organización Helper Master en Facturapi y subir el CSD (.cer, .key y contraseña). Esto se hace en Facturapi y nunca pasa por el repo.
2. Poner `FACTURAPI_KEY` en Vercel: la de prueba en Preview y la real en Production.
3. Ejecutar la migración en producción y reportar el resultado antes de publicar `/facturar`.
4. Confirmar con el contador las claves SAT de producto y unidad y la forma de pago para "en línea".
5. Cambiar el pie del ticket en Dodo IS para que indique la dirección de `/facturar`.
