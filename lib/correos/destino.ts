const INICIO = "https://dodopizza.mx/";
export const dominioPermitido = (host: string, extra: string[]) => {
  const h = host.toLowerCase();
  return h === "dodopizza.mx" || h.endsWith(".dodopizza.mx") || extra.some((d) => { const x = d.trim().toLowerCase(); return x !== "" && (h === x || h.endsWith("." + x)); });
};
/** A dónde manda el clic: solo https a dominios permitidos; agrega UTM si la URL no trae utm_source. */
export function destinoClic(u: string | null, campana: string, extra: string[]): string {
  let url: URL;
  try { url = new URL(String(u ?? "")); } catch { return INICIO; }
  if (url.protocol !== "https:" || url.username || url.password || !dominioPermitido(url.hostname, extra)) return INICIO;
  if (!url.searchParams.has("utm_source")) {
    url.searchParams.set("utm_source", "correo"); url.searchParams.set("utm_medium", "email"); url.searchParams.set("utm_campaign", campana);
  }
  return url.toString();
}
export const dominiosExtra = () => (process.env.CORREOS_DOMINIOS_EXTRA ?? "").split(",").map((d) => d.trim()).filter(Boolean);
