/**
 * Rutas que el middleware deja pasar sin sesión. Las de reportes y la sincronización de Dodo IS se autentican solas
 * (header x-api-key o la clave compartida del cron); el login y la invitación son para quien aún no tiene sesión.
 */
const CON_PREFIJO = ["/login", "/api/reporte-semanal", "/api/reporte-diario", "/api/reporte-mensual"];
const EXACTAS = new Set(["/auth/confirm", "/invitacion", "/api/dodois/sincronizar"]);

export const rutaSinSesion = (ruta: string) => EXACTAS.has(ruta) || CON_PREFIJO.some((r) => ruta.startsWith(r));
