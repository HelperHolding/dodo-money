/**
 * Requisitos de seguridad de Dodo para mx-portal.dodopizza.org: headers base y cookies host-only
 * (`__Host-`, Secure, HttpOnly, SameSite=Lax, sin Domain).
 */

/** Opciones de las cookies de sesión de Supabase. La app no usa cliente de Supabase en el navegador, así que pueden ser HttpOnly. */
export const COOKIES_SESION = { name: "__Host-sb", path: "/", sameSite: "lax", httpOnly: true, secure: true } as const;

/** Opciones para cookies propias; con `__Host-` el navegador exige Secure, Path=/ y sin Domain. */
export const COOKIE_HOST = { path: "/", sameSite: "lax", httpOnly: true, secure: true } as const;

/** Origen de Supabase para las imágenes y vistas previas firmadas de Storage; null si la URL no es válida. */
function origen(url: string | undefined) {
  try { return url ? new URL(url.trim()).origin : null; } catch { return null; }
}

/**
 * Política de contenido. Next inyecta scripts y estilos en línea, por eso 'unsafe-inline';
 * en desarrollo además necesita eval y el websocket de recarga.
 */
export function politicaContenido({ supabaseUrl, desarrollo = false }: { supabaseUrl?: string; desarrollo?: boolean }) {
  const supabase = origen(supabaseUrl);
  const con = (...fuentes: (string | null)[]) => fuentes.filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    `script-src ${con("'self'", "'unsafe-inline'", desarrollo ? "'unsafe-eval'" : null)}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${con("'self'", "data:", "blob:", supabase)}`,
    "font-src 'self' data:",
    `connect-src ${con("'self'", desarrollo ? "ws:" : null)}`,
    `frame-src ${con("'self'", supabase)}`,
    "frame-ancestors 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

/** Headers para todas las rutas. HSTS sin preload, como pide seguridad de Dodo. */
export function encabezadosSeguridad(opciones: { supabaseUrl?: string; desarrollo?: boolean }) {
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
    { key: "Content-Security-Policy", value: politicaContenido(opciones) },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
}
