# Correos de marketing

## Instalación (una vez)
1. Sebastián corre `supabase/migrations/20261106120000_correos_marketing.sql` en producción y comparte el resultado.
2. Vercel: `CORREOS_API_KEY` (valor largo aleatorio) y, si se necesitan, `CORREOS_DOMINIOS_EXTRA` (p. ej. `instagram.com,wa.me`). Redeploy.
3. n8n: credencial *Header Auth* «dodo-money correos» con nombre `x-api-key` y el mismo valor.
   `node --env-file=scripts/n8n/.env scripts/n8n/flujo-correos.mjs`, elegir la credencial en «Pedir lote» y «Reportar», y activar.
   - La credencial se debe elegir a mano en **ambos** nodos, «Pedir lote» y «Reportar». Mientras falte, el flujo recibe 401 y no envía nada.
   - Después de subir el flujo, verificar en n8n que «Reportar» reintenta: correr «Reportar» una vez a mano contra una URL que falle.
     Si no reintenta, cambiar su manejo de errores a «Continue (using error output)» y conectar esa salida también a «Pausa».
4. Antes de importar, revisar la lista:
   - Confirmar si `Dodo_GoBig_2026_10_30` es la lista más actual (es del 30 oct, posterior a la de apertura); si lo es,
     exportar ésa en lugar de `Dodo_Apertura_2026_10_22`.
   - Quitar a quien pidió no recibir más correos (p. ej. quien respondió a hola@ pidiéndolo, o se quejó). La app no
     sabe de esas peticiones: si se importan, les vuelve a llegar. Después de importar también se pueden dar de baja
     uno por uno en Correos → Contactos.

   Exportar los 249 contactos (o los de la lista elegida) de la tabla de n8n (columna email) a CSV e importarlos en
   Correos → Contactos con la etiqueta `apertura-2026-10-22` (o la de la lista elegida). El CSV puede salir de Excel como «CSV UTF-8» o como
   «CSV (delimitado por comas)»: ambos funcionan.
5. Invitar a marketing con el puesto **Marketing**.
6. Apagar en n8n «Dodo Pizza · Go Big 30 oct · CAMPAÑA 249 · 12:00». No apagar «Imagen combos (sucursal)».

## Uso
Nueva campaña → subir HTML de Canva → Mandar prueba → elegir a quién y cuándo → Programar envío.
Las estadísticas se ven al abrir la campaña. Las aperturas son orientativas; los clics son confiables.

## Si algo falla
- «Esperando a n8n»: revisar que el flujo «Correos dodo-money» esté activo y que la llave coincida.
- Envíos «con problema»: el detalle trae la respuesta del servidor de correo; «Reintentar» solo los vuelve a la cola si el contacto sigue activo.
- Si un reporte a la app falla, ese correo en particular pasa a «con problema — puede haber salido» a los 15 min. Revisar si el correo llegó antes de usar «Reintentar».
