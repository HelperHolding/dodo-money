/** Cómo se ve un catálogo: tarjetas (por omisión) o lista compacta. Se guarda en la dirección (?vista=lista). */
export type Vista = "tarjetas" | "lista";

export const leerVista = (valor: string | undefined): Vista => (valor === "lista" ? "lista" : "tarjetas");

/** Misma página con otra vista: conserva los filtros, quita los avisos de ok/error. Tarjetas no se escribe. */
export function hrefVista(ruta: string, params: Record<string, string | undefined>, vista: Vista): string {
  const q = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor && !["ok", "error", "vista"].includes(clave)) q.set(clave, valor);
  }
  if (vista === "lista") q.set("vista", "lista");
  const texto = q.toString();
  return texto ? `${ruta}?${texto}` : ruta;
}
