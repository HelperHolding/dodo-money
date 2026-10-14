// PRUEBA TEMPORAL de la API de Dodo IS (se quita al terminar): canjea el código y lee unidades, ventas del 25/09 y otros
// endpoints para ver qué trae la API. No guarda ni muestra tokens. Solo admin.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DESDE = "2026-09-25T00:00:00", HASTA = "2026-09-26T00:00:00";

type Resultado = { ruta: string; status: number; cuerpo: unknown };

export async function GET(request: Request) {
  const { supabase, perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  const url = new URL(request.url);
  if (url.searchParams.get("error")) {
    return NextResponse.json({ paso: "autorizar", error: url.searchParams.get("error"), detalle: url.searchParams.get("error_description") });
  }
  const jar = await cookies();
  const guardado = JSON.parse(jar.get("dodois_pkce")?.value ?? "{}") as { verifier?: string; state?: string; auth?: string };
  jar.delete({ name: "dodois_pkce", path: "/api/dodois" });
  const code = url.searchParams.get("code");
  if (!code || !guardado.verifier || url.searchParams.get("state") !== guardado.state) {
    return NextResponse.json({ paso: "regreso", error: "Falta el código o el state no coincide; vuelve a /api/dodois/login." }, { status: 400 });
  }

  const auth = guardado.auth === "https://auth.dodois.com" ? guardado.auth : "https://auth.dodois.io";
  type Token = { access_token?: string; scope?: string; expires_in?: number; refresh_token?: string; error?: string; error_description?: string };
  const redirect = `${url.origin}/api/dodois/callback`;
  let token: Token, status: number;
  if (auth === "https://auth.dodois.com") {
    // Dodo bloquea a Vercel: el canje lo hace Supabase (función dodois_canjear_codigo, llave secreta en el Vault).
    const { data, error } = await supabase.rpc("dodois_canjear_codigo", {
      p_client_id: process.env.DODOIS_CLIENT_ID ?? "", p_code: code, p_verifier: guardado.verifier, p_redirect: redirect,
    });
    if (error) return NextResponse.json({ paso: "token (Supabase)", error: error.message });
    status = (data as { status: number }).status;
    const cuerpo = (data as { cuerpo: unknown }).cuerpo;
    token = typeof cuerpo === "object" && cuerpo ? cuerpo as Token : { error: "respuesta no JSON", error_description: String(cuerpo) };
  } else {
    const respToken = await fetch(`${auth}/connect/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code", code, redirect_uri: redirect,
        client_id: process.env.DODOIS_CLIENT_ID ?? "", client_secret: process.env.DODOIS_CLIENT_SECRET ?? "", code_verifier: guardado.verifier,
      }),
    });
    status = respToken.status;
    token = await respToken.json().catch(() => ({})) as Token;
  }
  if (status !== 200 || !token.access_token) {
    return NextResponse.json({ paso: "token", servidor: auth, status, error: token.error, detalle: token.error_description });
  }

  const llamar = async (base: string, ruta: string): Promise<Resultado> => {
    const r = await fetch(`${base}${ruta}`, { headers: { Authorization: `Bearer ${token.access_token}` } });
    const texto = await r.text();
    let cuerpo: unknown = texto.slice(0, 6000);
    try { cuerpo = JSON.parse(texto); } catch { /* texto */ }
    return { ruta: `${base}${ruta}`, status: r.status, cuerpo };
  };

  // La API es del mismo dominio que el servidor de acceso (.com o .io); las unidades van en la raíz, sin /dodopizza/mx.
  const host = auth === "https://auth.dodois.com" ? "https://api.dodois.com" : "https://api.dodois.io";
  const base = `${host}/dodopizza/mx`;
  let unidades: Resultado | null = null;
  for (const ruta of ["/auth/roles/units", "/dodopizza/mx/auth/roles/units"]) {
    try { unidades = await llamar(host, ruta); if (unidades.status !== 404) break; } catch (e) { unidades = { ruta, status: 0, cuerpo: String(e) }; }
  }
  const lista = Array.isArray(unidades?.cuerpo) ? unidades!.cuerpo as { id?: string; name?: string }[]
    : ((unidades?.cuerpo as { units?: { id?: string; name?: string }[] })?.units ?? []);
  const ids = lista.map((u) => u.id).filter(Boolean).join(",");

  const rango = `units=${ids}&from=${DESDE}&to=${HASTA}`;
  const rutas = [
    `/accounting/sales?${rango}`,
    `/accounting/sales?units=${ids}&from=2026-09-25&to=2026-09-26`,
    `/accounting/incoming-stock-items?${rango}`,
    `/accounting/writeoffs/products?${rango}`,
    `/accounting/stock-consumptions-by-period?${rango}`,
    `/production/productivity?${rango}`,
    `/unit/units`,
  ];
  const otros = await Promise.all(rutas.map((r) => llamar(base, r).catch((e) => ({ ruta: r, status: 0, cuerpo: String(e) }))));

  // Resumen de ventas si el cuerpo trae una lista: cuántas y las llaves de la primera, para comparar con el Excel (39 pedidos, $7,736).
  const resumen = otros.slice(0, 2).map((o) => {
    const c = o.cuerpo as Record<string, unknown> | unknown[];
    const arreglo = Array.isArray(c) ? c : Object.values(c ?? {}).find(Array.isArray) as unknown[] | undefined;
    return { ruta: o.ruta, status: o.status, elementos: arreglo?.length ?? null, llaves: arreglo?.[0] && typeof arreglo[0] === "object" ? Object.keys(arreglo[0] as object) : null };
  });

  return NextResponse.json({
    servidor: auth, token: { scope: token.scope, expira_en_s: token.expires_in, trae_refresh: Boolean(token.refresh_token) },
    base, unidades, resumen, otros,
  });
}
