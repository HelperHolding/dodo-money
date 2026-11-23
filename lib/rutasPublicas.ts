/**
 * Rutas que el middleware deja pasar sin sesión. Las de reportes, la sincronización de Dodo IS, la importación de Rappi, los avisos de cumplimiento las tareas automáticas para n8n, las de avisos del Help Desk (n8n con x-api-key) y las de correos (n8n con x-api-key; píxel, clic y baja públicos por token) se autentican solas, igual que el conector de Grok (`/api/mcp`, con su llave Bearer)
 * (header x-api-key o la clave compartida del cron); el login y la invitación son para quien aún no tiene sesión, y el portal de facturación de tickets es público y solo usa funciones de servidor.
 */
const CON_PREFIJO = ["/login", "/api/reporte-semanal", "/api/reporte-diario", "/api/reporte-mensual", "/api/cumplimiento/avisos", "/api/correos/", "/baja/", "/facturar"];
const EXACTAS = new Set(["/auth/confirm", "/invitacion", "/api/dodois/sincronizar", "/api/rappi/importar", "/api/tareas/generar", "/api/mcp", "/api/soporte/avisos", "/api/soporte/avisos/resultado"]);

export const rutaSinSesion = (ruta: string) => EXACTAS.has(ruta) || CON_PREFIJO.some((r) => ruta.startsWith(r));
