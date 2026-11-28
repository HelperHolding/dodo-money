/**
 * Código que muestra la pantalla de error. Si el error viene del servidor, Next.js trae su `digest` (el mismo que sale
 * en Vercel → Logs). Si nació en el navegador (respuesta cortada, red, un componente que falló) no hay digest: se arma
 * uno corto, «N-xxxxxx», con el nombre y el mensaje, y la pantalla lo manda a los logs para poder buscarlo.
 */
export function codigoError(error: { name?: string; message?: string; digest?: string }): { codigo: string; delNavegador: boolean } {
  if (error.digest) return { codigo: error.digest, delNavegador: false };
  const texto = `${error.name ?? "Error"}:${error.message ?? ""}`;
  let h = 2166136261; // FNV-1a de 32 bits: el mismo error da el mismo código.
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619); }
  return { codigo: `N-${(h >>> 0).toString(16).padStart(8, "0").slice(0, 6)}`, delNavegador: true };
}

/** Ventana en la que no se vuelve a reintentar solo: si falla dos veces seguidas, se muestra la tarjeta. */
export const VENTANA_REINTENTO_MS = 60_000;

/** Reintenta solo una vez por ruta dentro de la ventana; `ultimo` es la hora del último reintento automático (o null). */
export const debeReintentarSolo = (ultimo: number | null, ahora: number) => ultimo === null || !Number.isFinite(ultimo) || ahora - ultimo > VENTANA_REINTENTO_MS;

/** Lo que se manda al servidor para que quede en Vercel → Logs: recortado y sin datos de la página. */
export function reporteError(error: { name?: string; message?: string; stack?: string }, codigo: string, ruta: string) {
  const corta = (s: string | undefined, n: number) => (s ?? "").slice(0, n);
  return { codigo: corta(codigo, 20), nombre: corta(error.name, 80), mensaje: corta(error.message, 500), pila: corta(error.stack, 1500), ruta: corta(ruta, 200) };
}
