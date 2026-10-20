import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { leerPaginas } from "./paginas";
import { ErrorDodo, tokenDeAcceso as resolverToken, type Almacen } from "./tokens";
import type { RecepcionApi } from "./recepciones";
import type { VentaApi } from "./ventas";

export { ErrorDodo };

export const AUTH = "https://auth.dodois.com";
export const API = "https://api.dodois.com";
export const SCOPES = "openid offline_access user.role:read sales accounting:read unit:read productionefficiency";

export type Tokens = { access_token: string; refresh_token: string; expires_in: number; scope?: string };
const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Canje o renovación en el servidor de tokens de Dodo IS (desde Vercel; Dodo ya no lo bloquea). */
export async function pedirToken(campos: Record<string, string>): Promise<Tokens> {
  // Menos que los 30 s del turno de renovación: si Dodo tarda más, otra sincronización no gasta el mismo token.
  const r = await fetch(`${AUTH}/connect/token`, {
    method: "POST", signal: AbortSignal.timeout(20_000), headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.DODOIS_CLIENT_ID ?? "", client_secret: process.env.DODOIS_CLIENT_SECRET ?? "", ...campos }),
  });
  const t = await r.json().catch(() => ({})) as Partial<Tokens> & { error?: string };
  if (!r.ok || !t.access_token || !t.refresh_token) {
    throw new ErrorDodo(`Dodo IS no dio el token (${r.status}${t.error ? ` ${t.error}` : ""}).`, t.error === "invalid_grant");
  }
  return t as Tokens;
}

/** Token de acceso vigente (ver lib/dodois/tokens.ts): lee y guarda en la base con la llave de servicio. */
export async function tokenDeAcceso(admin: SupabaseClient): Promise<string> {
  const almacen: Almacen = {
    leer: async () => {
      const { data, error } = await admin.rpc("dodois_tokens").maybeSingle<{ refresh: string | null; access: string | null; access_expira: string | null; estado: string }>();
      return error ? null : data;
    },
    tomarRenovacion: async () => Boolean((await admin.rpc("dodois_tomar_renovacion")).data),
    guardar: async (refresh, access, expira) => {
      const { error } = await admin.rpc("dodois_guardar_tokens", { p_refresh: refresh, p_access: access, p_expira: expira });
      return { error: error?.message ?? null };
    },
    marcarError: async (mensaje, reconectar) => { await admin.rpc("dodois_marcar_error", { p_mensaje: mensaje, p_reconectar: reconectar }); },
  };
  return resolverToken(almacen, (refresh) => pedirToken({ grant_type: "refresh_token", refresh_token: refresh }), { esperar, ahora: Date.now });
}

/** GET con el token; reintenta 429 y 5xx dos veces. */
export async function getDodo<T>(token: string, url: string): Promise<T> {
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) return r.json() as Promise<T>;
    if (r.status === 401) throw new ErrorDodo("Dodo IS rechazó el token (401).");
    if ((r.status === 429 || r.status >= 500) && i < 2) { await esperar(1500 * (i + 1)); continue; }
    throw new ErrorDodo(`Dodo IS respondió ${r.status} en ${new URL(url).pathname}.`);
  }
}

/** Ventas de una unidad en una ventana, página por página (ver lib/dodois/paginas.ts); un pedido repetido se cuenta una vez. */
export async function ventasDelDia(token: string, unitId: string, ventana: { from: string; to: string }): Promise<VentaApi[]> {
  const ventas = await leerPaginas(async (skip) => {
    const r = await getDodo<{ sales: VentaApi[]; isEndOfListReached: boolean }>(token,
      `${API}/dodopizza/mx/accounting/sales?units=${unitId}&from=${ventana.from}&to=${ventana.to}&skip=${skip}&take=1000`);
    return { items: r.sales ?? [], fin: r.isEndOfListReached };
  }).catch((e) => { throw new ErrorDodo((e as Error).message); });
  return [...new Map(ventas.map((v) => [v.orderId, v])).values()];
}

/** Recepciones de insumos de una unidad en una ventana, página por página; las líneas iguales se conservan. */
export async function recepcionesDe(token: string, unitId: string, ventana: { from: string; to: string }): Promise<RecepcionApi[]> {
  return leerPaginas(async (skip) => {
    const r = await getDodo<{ incomingStockItems: RecepcionApi[]; isEndOfListReached: boolean }>(token,
      `${API}/dodopizza/mx/accounting/incoming-stock-items?units=${unitId}&from=${ventana.from}&to=${ventana.to}&skip=${skip}&take=1000`);
    return { items: r.incomingStockItems ?? [], fin: r.isEndOfListReached };
  }).catch((e) => { throw new ErrorDodo((e as Error).message); });
}
