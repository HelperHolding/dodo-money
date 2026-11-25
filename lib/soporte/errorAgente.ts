/** Mensajes que lanza nuestro propio código (no traen texto del ticket). */
const PROPIOS = /^(sin-configuracion|cierre-[\w-]+)$/;

/**
 * Describe una falla del agente para la nota interna y el log, sin texto del ticket: nombre del error y, si es una
 * llamada rechazada por Anthropic, su código HTTP, tipo y mensaje del proveedor (por ejemplo, modelo inexistente).
 */
export function describirError(e: unknown): string {
  if (!(e instanceof Error)) return "desconocido";
  const ultimo = (e as { lastError?: unknown }).lastError;
  if (e.name === "AI_RetryError" && ultimo instanceof Error) return describirError(ultimo);
  if (e.name === "AI_APICallError") {
    const { statusCode, responseBody } = e as { statusCode?: number; responseBody?: string };
    let detalle = "";
    try {
      const err = (JSON.parse(responseBody ?? "") as { error?: { type?: string; message?: string } }).error;
      if (err?.type) detalle = ` ${err.type}${err.message ? `: ${err.message}` : ""}`;
    } catch { /* cuerpo no JSON: solo el código */ }
    return `AI_APICallError${statusCode ? ` ${statusCode}` : ""}${detalle}`.replace(/\s+/g, " ").trim().slice(0, 220);
  }
  return e.name === "Error" && PROPIOS.test(e.message) ? e.message : e.name;
}
