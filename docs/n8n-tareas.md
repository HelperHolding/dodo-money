# Tareas automáticas desde n8n

Cada mañana n8n llama al portal para que corra las reglas de `/tareas/reglas`: crea las tareas de pendientes nuevos
y cierra solas las que ya se resolvieron («Resuelto automáticamente», a nombre de «Sistema»). Es idempotente: correrla
dos veces el mismo día no duplica nada.

## Configuración (una vez)
1. Vercel ya tiene `DODOIS_CRON_SECRET` (la misma clave del cron de ventas) y `SUPABASE_SERVICE_ROLE_KEY`. No hay variables nuevas.
2. n8n → *Credentials*: *Header Auth* llamada `Portal cron` con nombre `Authorization` y valor `Bearer <DODOIS_CRON_SECRET>`.
3. n8n → flujo nuevo «Tareas automáticas»:
   - *Schedule Trigger*: todos los días a las 8:00 (Ciudad de México), después de la sincronización de ventas de la mañana.
   - *HTTP Request*: `POST {{$vars.PORTAL_URL}}/api/tareas/generar`, autenticación *Header Auth* → `Portal cron`.
   - Como *Error workflow*, el mismo de cumplimiento (`cumplimiento-avisos-error`), para que un fallo avise en Chat.
4. En `/tareas/reglas`, prender cada regla con su responsable. Apagadas no crean nada.

## Probar
- `curl -X POST -H "Authorization: Bearer …" "$PORTAL_URL/api/tareas/generar"` responde
  `{resumen, reglas: [{regla, creadas, cerradas}]}`. Una segunda llamada responde «Sin cambios».
- En `/tareas/reglas`, «Generar ahora» hace lo mismo con la sesión de un admin.

## Si algo falla
`401` = la clave no coincide con `DODOIS_CRON_SECRET`; `500` con «SUPABASE_SERVICE_ROLE_KEY» = falta en Vercel;
`500` con «generar_tareas_automaticas» = falta correr la migración `20261102200000_tareas_automaticas.sql`.
