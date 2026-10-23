/**
 * Consulta de exploración a la API de Dodo IS (solo lectura, solo admin): arma la dirección de una ruta de la lista
 * (contabilidad, producción, personal, o la lista de unidades) con las unidades ligadas y un rango de hasta 31 días.
 */
const API = "https://api.dodois.com";
const RUTA = /^\/(accounting|production|staff)(\/[a-z0-9-]+)+$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const PASAN = ["skip", "take"];
const REVISIONES = "/inventory/revisions";
const TRASPASOS = "/accounting/stock-transfer/transfer-items";
const DIA = 86_400_000;
const siguiente = (f: string) => new Date(Date.parse(`${f}T00:00:00Z`) + DIA).toISOString().slice(0, 10);

export function urlExplorar(q: URLSearchParams, unidades: readonly string[]): { url: string } | { error: string } {
  const ruta = q.get("ruta") ?? "";
  if (ruta === "/auth/roles/units") return { url: `${API}/auth/roles/units` };
  const revisiones = ruta === REVISIONES;
  const traspasos = ruta === TRASPASOS;
  if (!revisiones && !RUTA.test(ruta)) return { error: "Ruta no permitida: usa /accounting/…, /production/…, /staff/…, /inventory/revisions o /auth/roles/units." };
  if (!unidades.length) return { error: "No hay sucursales ligadas a Dodo IS." };
  if (revisiones && unidades.length > 10) return { error: "Máximo 10 unidades por consulta de revisiones." };
  if (traspasos && unidades.length > 30) return { error: "Máximo 30 unidades por consulta de traspasos." };
  const desde = q.get("desde"), hasta = q.get("hasta") || desde;
  // Este servicio filtra por expedición/recepción en UTC, no por from/to.
  // Hasta habilitar ambos filtros explícitos, consultar páginas sin fechas y filtrar
  // localmente shippedAtLocal/receivedAtLocal; nunca ignorar silenciosamente el periodo.
  if (traspasos && (desde || q.get("hasta"))) return { error: "Traspasos usa fechas de envío y recepción: consulta sin desde/hasta y filtra los movimientos por sus fechas locales." };
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
  if (revisiones || traspasos) {
    const take = q.get("take");
    if (take !== null && (!/^\d{1,5}$/.test(take) || Number(take) < 1 || Number(take) > 1000)) return { error: "take debe estar entre 1 y 1000 para revisiones o traspasos." };
  }
  // Las revisiones usan el servicio de inventario sin segmento de país.
  const base = traspasos ? API : `${API}/dodopizza${revisiones ? "" : "/mx"}`;
  return { url: `${base}${ruta}?${params.toString()}` };
}
