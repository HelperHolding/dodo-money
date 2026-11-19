# Conector de Grok (Grok Bot → dodo-money)

Endpoint MCP de solo lectura: `https://dodo-money-j31t.vercel.app/api/mcp`. Herramientas: sucursales, ventas,
productos (piezas y venta por producto), bi (venta por hora, día, canal y pago, ticket promedio, comparada con
el periodo anterior o el año pasado), tiempos (tiempos de cocina y entrega), cortes, costos, manuales y P&L. Cada llamada queda en `mcp_llamadas` (solo
admin la lee). Límites: 10 por minuto, 300 por día.

## 1. Supabase (proyecto de producción)

1. SQL Editor → corre, en orden, `supabase/migrations/20261119120000_grok_mcp.sql`,
   `supabase/migrations/20261119190000_grok_mcp_productos.sql` y `supabase/migrations/20261120120000_grok_mcp_bi_tiempos.sql`.
2. Corre la prueba de cada una: `supabase/pruebas/20261119120000_grok_mcp.sql`,
   `supabase/pruebas/20261119190000_grok_mcp_productos.sql` y `supabase/pruebas/20261120120000_grok_mcp_bi_tiempos.sql`.
   Cada una debe terminar con el error **PRUEBAS OK** (deshace todo). No las corras entre 00:00 y 00:02.
3. Authentication → Users → Add user → Create new user: correo propio para el bot, contraseña larga generada por tu
   gestor de contraseñas, y marca **Auto Confirm User**.
4. SQL Editor (cambia el correo):

   ```sql
   insert into public.perfiles(id,nombre,rol,sucursal_id,activo,debe_cambiar_contrasena)
   select id,'Grok Bot','corporativo',null,true,false from auth.users where email='CORREO-DEL-BOT';
   ```

## 2. Vercel (Production)

Settings → Environment Variables:

| Variable | Valor |
|---|---|
| `GROK_MCP_KEY` | Llave aleatoria de 32 bytes o más (por ejemplo, 48 caracteres de tu gestor de contraseñas) |
| `GROK_MCP_CUENTA_EMAIL` | Correo de la cuenta Grok Bot |
| `GROK_MCP_CUENTA_PASSWORD` | Su contraseña |

Pega la contraseña exactamente como es, sin espacios ni saltos de línea al final; la llave y el correo se recortan
solos. Después, Redeploy del último despliegue de producción.

## 3. Grok Bot

En tu Grok Bot → Plugins → agregar servidor MCP:
- URL: `https://<dominio de producción>/api/mcp`
- Encabezado: `Authorization: Bearer <GROK_MCP_KEY>`

Pregunta de prueba: «¿Cuánto vendió cada sucursal ayer?».

## Cortar el acceso

- Inmediato: borra o cambia `GROK_MCP_KEY` en Vercel y haz Redeploy.
- O desactiva el usuario «Grok Bot» en Usuarios de dodo-money.

## Revisar el uso

```sql
select iniciado_en at time zone 'America/Mexico_City' as hora,herramienta,argumentos,estado,error
from public.mcp_llamadas order by iniciado_en desc limit 50;
```

Nota: las respuestas pasan por los servidores de xAI.
