// Regreso de Dodo IS: canjea el código, lee las unidades y guarda la conexión (tokens al Vault). No muestra tokens.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API, getDodo, pedirToken } from "@/lib/dodois/cliente";
import { obtenerPerfil } from "@/lib/contexto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { supabase, perfil } = await obtenerPerfil();
  const url = new URL(request.url);
  const volver = (clave: "ok" | "error", texto: string) => NextResponse.redirect(`${url.origin}/ventas/dodois?${clave}=${encodeURIComponent(texto)}`);
  if (perfil.rol !== "admin") return NextResponse.redirect(`${url.origin}/ventas`);
  if (url.searchParams.get("error")) return volver("error", `Dodo IS no dio permiso: ${url.searchParams.get("error_description") ?? url.searchParams.get("error")}`);
  const jar = await cookies();
  const guardado = JSON.parse(jar.get("dodois_pkce")?.value ?? "{}") as { verifier?: string; state?: string };
  jar.delete({ name: "dodois_pkce", path: "/api/dodois" });
  const code = url.searchParams.get("code");
  if (!code || !guardado.verifier || url.searchParams.get("state") !== guardado.state) return volver("error", "La conexión expiró; vuelve a darle Conectar.");
  try {
    const t = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: `${url.origin}/api/dodois/callback`, code_verifier: guardado.verifier });
    const unidades = await getDodo<{ id: string; name: string }[]>(t.access_token, `${API}/auth/roles/units`);
    const { error } = await supabase.rpc("dodois_conectar", {
      p_refresh: t.refresh_token, p_access: t.access_token, p_expira: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      p_unidades: unidades.map((u) => ({ id: u.id, name: u.name })), p_scopes: t.scope ?? "",
    });
    if (error) return volver("error", error.message);
  } catch (e) {
    return volver("error", (e as Error).message);
  }
  return volver("ok", "Dodo IS conectado.");
}
