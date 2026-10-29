/**
 * Rutas que el middleware deja pasar sin sesión. Las de reportes, la sincronización de Dodo IS y la importación de Rappi y los avisos de cumplimiento para n8n se autentican solas
 * (header x-api-key o la clave compartida del cron); el login y la invitación son para quien aún no tiene sesión.
 */
const CON_PREFIJO = ["/login", "/api/reporte-semanal", "/api/reporte-diario", "/api/reporte-mensual", "/api/cumplimiento/avisos"];
const EXACTAS = new Set(["/auth/confirm", "/invitacion", "/api/dodois/sincronizar", "/api/rappi/importar"]);

export const rutaSinSesion = (ruta: string) => EXACTAS.has(ruta) || CON_PREFIJO.some((r) => ruta.startsWith(r));
