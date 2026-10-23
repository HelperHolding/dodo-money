/**
 * Consulta de exploración a la API de Dodo IS (solo lectura, solo admin): arma la dirección de una ruta de la lista
 * (contabilidad, producción, personal, o la lista de unidades) con las unidades ligadas y un rango de hasta 31 días.
 */
const API = "https://api.dodois.com";
const RUTA = /^\/(accounting|production|staff)(\/[a-z0-9-]+)+$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const PASAN = ["skip", "take"];
const REVISIONES = "/inventory/revisions";
const DIA = 86_400_000;
const siguiente = (f: string) => new Date(Date.parse(`${f}T00:00:00Z`) + DIA).toISOString().slice(0, 10);

export function urlExplorar(q: URLSearchParams, unidades: readonly string[]): { url: string } | { error: string } {
  const ruta = q.get("ruta") ?? "";
  if (ruta === "/auth/roles/units") return { url: `${API}/auth/roles/units` };
  const revisiones = ruta === REVISIONES;
  if (!revisiones && !RUTA.test(ruta)) return { error: "Ruta no permitida: usa /accounting/…, /production/…, /staff/…, /inventory/revisions o /auth/roles/units." };
  if (!unidades.length) return { error: "No hay sucursales ligadas a Dodo IS." };
  if (revisiones && unidades.length > 10) return { error: "Máximo 10 unidades por consulta de revisiones." };
  const desde = q.get("desde"), hasta = q.get("hasta") || desde;
  if (revisiones && (!desde || !hasta)) return { error: "Las revisiones de inventario requieren desde y hasta." };
  const params = new URLSearchParams({ units: unidades.join(",") });
  if (desde || hasta) {
    if (!desde || !FECHA.test(desde) || !hasta || !FECHA.test(hasta)) return { error: "Fechas en formato AAAA-MM-DD." };
    if (revisiones && [desde, hasta].some((f) => !Number.isFinite(Date.parse(`${f}T00:00:00Z`)) || new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) !== f)) return { error: "Fechas de inventario inválidas." };
    if (hasta < desde) return { error: "La fecha final no puede ser antes de la inicial." };
    if (revisiones && (Date.parse(hasta) - Date.parse(desde)) / DIA > 13) return { error: "Máximo 14 días por consulta de revisiones." };
    if ((Date.parse(hasta) - Date.parse(desde)) / DIA > 30) return { error: "Máximo 31 días por consulta." };
    params.set("from", `${desde}T00:00:00`);
    params.set("to", `${siguiente(hasta)}T00:00:00`);
  }
  for (const p of PASAN) { const v = q.get(p); if (v && /^\d{1,5}$/.test(v)) params.set(p, v); }
  if (revisiones) {
    const take = q.get("take");
    if (take !== null && (!/^\d{1,5}$/.test(take) || Number(take) < 1 || Number(take) > 1000)) return { error: "take debe estar entre 1 y 1000 para revisiones." };
  }
  // Las revisiones usan el servicio de inventario sin segmento de país.
  return { url: `${API}/dodopizza${revisiones ? "" : "/mx"}${ruta}?${params.toString()}` };
}
