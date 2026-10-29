# Calendario de cumplimiento: obligaciones, alertas y avisos por n8n (diseño)

**Fecha:** 2026-10-29 · **Autor:** Claude con Sebastián · **Estado:** en revisión

## 1. Objetivo

El calendario de mantenimiento de Activos pasa a ser el **calendario de cumplimiento**: un solo lugar donde los
administradores ven todo lo que la empresa debe cumplir por fecha, sin perder nada de vista.

1. **Obligaciones nuevas:** permisos, licencias, protección civil, extintores, trámites fiscales y seguros, con su
   frecuencia y evidencia de cumplimiento (foto + documento) y, si llevan pago, ligadas a su factura.
2. **Vista unificada:** el mismo calendario muestra también los mantenimientos de activos y los compromisos
   recurrentes con servicio (fumigación, basura, trampas de grasa), sin migrarlos.
3. **Alertas:** franja de alertas dentro del portal y un flujo diario de n8n que avisa por correo y Google Chat.

**Éxito:** el admin da de alta "Póliza de seguro Zapopan · anual · inicio 15 de marzo" una vez. El 14 de enero llega
el primer aviso (60 días) por correo y Chat, se repite a 30 y 7 días y el día; si nadie la cierra, desde el 16 de
marzo llega un aviso diario y el inicio del portal la muestra como vencida. Al cerrarla con foto y PDF de la póliza
queda *cumplida sin factura* y sigue alertando hasta que se liga la factura del pago.

## 2. Decisiones

| Tema | Decisión |
|---|---|
| Relación con lo existente | Vista que une tres orígenes: obligaciones (nuevas), compromisos con servicio y mantenimientos de activos. Nada se migra; compromisos y mantenimientos se cierran en sus pantallas actuales |
| Tipos de obligación | Permiso, Licencia, Protección civil, Extintores, Trámite fiscal, Seguro, Otro (con descripción). Fumigación sigue en compromisos |
| Pertenencia | Exactamente una: sucursal **o** razón social |
| Frecuencias | Semanal (el día de la semana de la fecha de inicio), quincenal (día 15 y último día de cada mes), mensual, bimestral y anual (el día de la fecha de inicio; si el mes es más corto, su último día) |
| Vigencia | Inicio obligatorio, fin opcional |
| Fechas futuras | **No se guardan**: se calculan de la regla (`fechas_cumplimiento`). Solo se guarda una fecha cuando alguien actúa sobre ella |
| Pago | Casilla "con pago" con proveedor obligatorio y monto estimado opcional. La factura se elige entre las de ese proveedor y esa sucursal o razón social. Una factura solo se liga a una fecha |
| Cierre | Exige al menos **una foto y un PDF** confirmados y una nota (≥ 5 letras). Si es con pago y no hay factura, queda *cumplida sin factura* y sigue alertando hasta ligarla. La factura puede ligarse en el cierre o después |
| Omitir una fecha | Se permite con motivo (≥ 5 letras); deja de alertar |
| Cambiar la regla | Nombre, autoridad, folio, notas, proveedor, monto, "con pago" y fin se editan y afectan solo fechas sin trabajar. Para cambiar pertenencia, tipo, frecuencia o inicio se pone fin y se crea otra. El fin no puede quedar antes de una fecha ya trabajada |
| Quién edita | Admin (`edita_compras`): Julio y Sebastián. Corporativo (`ve_compras`) solo consulta |
| Quién recibe avisos | Perfiles `admin` activos (correo) y el espacio de Google Chat configurado en n8n |
| Anticipación | Semanal y quincenal: 2 días antes y el día. Mensual y bimestral: 7, 2 y el día. Anual: 60, 30, 7 y el día. Vencidas y *cumplidas sin factura*: diario |
| Avisos repetidos | Cada aviso tiene una clave única (origen, id, fecha que vence, tipo de aviso, día de envío) y se registra al entregarse; no se envía dos veces el mismo día |

## 3. Datos (migración `…_calendario_cumplimiento.sql`)

- **`cumplimiento_obligaciones`**: `id`, `tipo` (check con los siete valores), `nombre`, `descripcion`
  (obligatoria en `otro`), `autoridad`, `folio`, `notas`, `sucursal_id` / `razon_social_id` (check: exactamente uno),
  `frecuencia` (check: `semanal`, `quincenal`, `mensual`, `bimestral`, `anual`), `inicio`, `fin` (≥ inicio),
  `con_pago`, `proveedor_id` (obligatorio si `con_pago`), `monto_estimado` (> 0 si existe), `revision`,
  `creado_por`, `creado_en`.
- **`cumplimiento_fechas`**: `id`, `obligacion_id`, `vence` (único por obligación), `estado` (`pendiente`,
  `cumplida`, `omitida`), `cumplida_fecha`, `nota`, `omitida_motivo`, `factura_id` (único), `revision`. Checks:
  cumplida exige fecha y nota; omitida exige motivo y no admite factura.
- **`cumplimiento_evidencias`**: mismo esquema de reserva y confirmación que `compromiso_evidencias` (bucket privado
  `adjuntos-compras`, PDF o foto, SHA-256, confirmación contra `storage.objects`), con columna `clase`
  (`foto` o `documento`) derivada del MIME.
- **`cumplimiento_historial`**: evento, anterior, nuevo, usuario y fecha para alta, edición, cierre, omisión y
  factura ligada.
- **`cumplimiento_avisos_enviados`**: `clave` (única), `origen`, `referencia_id`, `vence`, `tipo_aviso`,
  `enviado_el`, `canal`.

**Funciones**

- `fechas_cumplimiento(obligacion, desde, hasta)`: única fuente de la regla.
- `guardar_obligacion`, `cerrar_fecha_cumplimiento` (valida foto + PDF confirmados), `omitir_fecha_cumplimiento`,
  `ligar_factura_cumplimiento`, `preparar_evidencia_cumplimiento` / `confirmar_evidencia_cumplimiento`: todas
  `security definer` con `search_path=''`, validan `edita_compras()` y `revision`, y escriben historial.
- `cumplimiento_en_rango(desde, hasta)`: filas homogéneas de los tres orígenes: `origen`, `referencia_id`,
  `titulo`, `tipo`, `sucursal_id`, `razon_social_id`, `vence`, `estado` (`pendiente`, `por_vencer`, `vencida`,
  `cumplida`, `cumplida_sin_factura`, `omitida`), `falta_evidencia`, `falta_factura`, `frecuencia`. Compromisos
  vienen de `compromisos_en_rango` (solo con `requiere_servicio`); mantenimientos de `activo_mantenimientos`
  (fecha programada; completados por fecha realizada; anulados como omitidos). Rango máximo 800 días.
- `avisos_cumplimiento(hoy)`: lo que toca avisar hoy según la tabla de anticipación, excluyendo claves ya enviadas.
- `registrar_avisos_cumplimiento(claves, canal)`: idempotente (`on conflict do nothing`).

**RLS:** lectura con `ve_compras()`; sin `insert/update/delete` directos; escritura solo por las funciones.

## 4. Pantallas

- **Cumplimiento (`/cumplimiento`)**, en el grupo de menú de Activos, para admin y corporativo:
  - Franja de alertas: vencidas, por vencer, cumplidas sin factura y sin evidencia; cada contador abre su filtro.
  - `CalendarioCumplimiento`, evolución de `CalendarioMantenimiento`: mes, Hoy, selección de día, filtros por origen,
    tipo, sucursal/razón social y estado. Lista en tarjetas en celular. Cada fila liga a su detalle
    (obligación, compromiso o ficha del activo).
  - Botón "Nueva obligación" solo para admin.
- **Nueva / editar obligación (`/cumplimiento/nueva`, `/cumplimiento/[id]/editar`)**: formulario con tipo,
  pertenencia, frecuencia (texto de ayuda con las próximas 3 fechas), con pago, proveedor y monto.
- **Detalle (`/cumplimiento/[id]`)**: regla, próximas fechas, fechas trabajadas y historial. Por fecha: cerrar
  (foto + PDF + nota, factura opcional), omitir, ligar factura después, ver evidencia.
- **Activos:** la pestaña "Calendario de mantenimiento" pasa a ser un enlace a `/cumplimiento?origen=mantenimiento`;
  se retira la vista embebida y su documento técnico se actualiza.
- **Inicio:** la misma franja de alertas para admin y corporativo cuando hay vencidas o por vencer.

## 5. Avisos por n8n

**Endpoints** (header `x-api-key` contra `CUMPLIMIENTO_API_KEY`; datos leídos con la cuenta de servicio
`REPORTE_CUENTA_EMAIL/PASSWORD`, igual que el reporte semanal, por lo que esa cuenta debe tener rol `admin`):

- `GET /api/cumplimiento/avisos`: `{ hoy, destinatarios: [correo], avisos: { vencidas, por_vencer,
  sin_factura } }` con título, sucursal o razón social, vence, días, liga absoluta y `clave` por aviso.
- `POST /api/cumplimiento/avisos/entregados`: `{ canal, claves: [] }` → registra; repetir no duplica.

**Flujo `cumplimiento-avisos`** (JSON importable en `docs/n8n/cumplimiento-avisos.json`, guía en
`docs/n8n-cumplimiento.md`):

1. Cron diario 08:00 America/Mexico_City.
2. GET de avisos; si vienen vacíos, termina.
3. Correo HTML a cada destinatario, agrupado por vencidas, por vencer y sin factura, con ligas al portal.
4. Mensaje resumido al webhook entrante del espacio de Google Chat.
5. POST de entregados por canal, solo de lo que sí salió.
6. Si falla el portal o un canal, no se registra y se reintenta al día siguiente; n8n manda un mensaje de error al
   mismo espacio de Chat.

## 6. Errores y casos límite

- Conflicto de edición: `revision` distinta → "Alguien más cambió esta obligación; recarga".
- Evidencia sin confirmar no cuenta para el cierre; reservas de más de un día se ignoran.
- Factura ya ligada a otra fecha (de obligación o compromiso) → rechazo con mensaje.
- Quincenal en febrero: 15 y 28 (29 en bisiesto). Mensual día 31 → último día del mes.
- Cambiar el fin no puede dejar fuera una fecha ya trabajada.

## 7. Pruebas

- **SQL en PGlite** (`supabase/pruebas`): las cinco frecuencias con meses cortos, bisiesto y quincena de febrero;
  checks de pertenencia y pago; cierre exige foto + PDF; factura única; omitir; RLS por rol (admin, corporativo,
  gerente); umbrales de `avisos_cumplimiento`; `registrar_avisos_cumplimiento` idempotente; unión de los tres
  orígenes en `cumplimiento_en_rango`.
- **TypeScript:** texto de frecuencia, validación del formulario, normalización de filas y conteo de alertas.
- **Endpoints:** 401 sin llave; formato de respuesta; POST repetido sin duplicar.
- **Navegador:** calendario, alta, cierre con evidencia y franja de alertas en escritorio y celular.

## 8. Entrega

Rama `feat/calendario-cumplimiento` → PR a `main` con `Historial válido` y `Pruebas y tipos` en verde. La migración
se entrega a Sebastián para ejecutar en Supabase; el formulario se publica después de su resultado. Variables nuevas:
`CUMPLIMIENTO_API_KEY` en Vercel y en la credencial de n8n; webhook de Google Chat solo en n8n.

## 9. Fuera de alcance

- Migrar compromisos o mantenimientos a la tabla nueva.
- Avisos a gerentes o encargados, WhatsApp o Telegram.
- Calcular montos de pago o registrar pagos desde el calendario (el pago sigue en Compras → Pagos).
