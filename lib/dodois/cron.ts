import { timingSafeEqual } from "node:crypto";

/**
 * Quién llama a /api/dodois/sincronizar: el cron (trae `Bearer <DODOIS_CRON_SECRET>`), una persona (sin esa cabecera:
 * se revisa su sesión) o un rechazo con el motivo, para que una clave mal puesta no termine en la página de login.
 */
export type Llamada = { tipo: "cron" } | { tipo: "persona" } | { tipo: "rechazo"; mensaje: string };

export function quienLlama(authorization: string | null, clave: string | undefined): Llamada {
  if (!authorization?.startsWith("Bearer ")) return { tipo: "persona" };
  if (!clave || clave.length < 32) {
    return { tipo: "rechazo", mensaje: "Falta DODOIS_CRON_SECRET en Vercel (Production) o volver a desplegar después de ponerla." };
  }
  const esperada = `Bearer ${clave}`;
  return authorization.length === esperada.length && timingSafeEqual(Buffer.from(authorization), Buffer.from(esperada))
    ? { tipo: "cron" }
    : { tipo: "rechazo", mensaje: "La clave del cron no coincide con DODOIS_CRON_SECRET de Vercel." };
}
