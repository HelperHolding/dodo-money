# Avisos del calendario de cumplimiento en n8n

Cada día a las 8:00 (Ciudad de México) n8n pregunta al portal qué avisar y lo manda por correo a los administradores y al espacio de Google Chat. Después confirma lo que sí salió; así nada se repite el mismo día y lo que falló se reintenta mañana.

## Qué avisa
- **Vencidas** y **cumplidas sin factura**: todos los días hasta resolverse.
- **Por vencer**: semanal y quincenal 2 días antes y el día; mensual y bimestral 7, 2 y el día; anual 60, 30, 7 y el día. Mantenimientos como mensual.

## Configuración (una vez)
1. Vercel → Environment Variables: `CUMPLIMIENTO_API_KEY` (cadena larga aleatoria). La cuenta `REPORTE_CUENTA_EMAIL` debe tener rol **admin** en Usuarios y sucursales.
2. Google Chat → espacio del equipo → *Apps e integraciones* → *Webhooks* → crear "Cumplimiento" y copiar la URL.
3. n8n → *Variables*: `PORTAL_URL` (ej. `https://dodo-money-j31t.vercel.app`, sin `/` final), `GCHAT_WEBHOOK_URL` (la URL del paso 2), `CORREO_REMITENTE`.
4. n8n → *Credentials*: *Header Auth* llamada `Portal cumplimiento` con nombre `x-api-key` y el valor de `CUMPLIMIENTO_API_KEY`; *SMTP* llamada `Correo avisos` con la cuenta remitente.
5. Importar `docs/n8n/cumplimiento-avisos-error.json` y luego `docs/n8n/cumplimiento-avisos.json`. En *Settings* del segundo, elegir el primero como *Error workflow*. Activar ambos.

## Probar
- `curl -H "x-api-key: …" "$PORTAL_URL/api/cumplimiento/avisos?canal=correo"` debe responder `{hoy, destinatarios, total, avisos}`.
- Ejecutar el flujo a mano: llega el correo, el mensaje de Chat, y una segunda ejecución el mismo día ya no envía nada (`total: 0`).

## Si algo falla
El flujo de error publica en el mismo espacio de Chat el nodo y el mensaje. Como no se confirmó, al día siguiente sale de nuevo. `401` = llave distinta; `500` con "cuenta de automatización" = revisar `REPORTE_CUENTA_*`; error "Solo administración" = la cuenta no es admin.
