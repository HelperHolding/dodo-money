// PRUEBA TEMPORAL de la API de Dodo IS (se quita al terminar): inicia sesión con OAuth 2 + PKCE. Solo admin.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";

export const dynamic = "force-dynamic";

const SCOPES = "openid offline_access user.role:read sales accounting:read unit:read";

export async function GET(request: Request) {
  const { perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  const clientId = process.env.DODOIS_CLIENT_ID;
  if (!clientId || !process.env.DODOIS_CLIENT_SECRET) return NextResponse.json({ error: "Faltan DODOIS_CLIENT_ID o DODOIS_CLIENT_SECRET en Vercel." }, { status: 500 });

  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  (await cookies()).set("dodois_pkce", JSON.stringify({ verifier, state }), {
    httpOnly: true, secure: true, sameSite: "lax", path: "/api/dodois", maxAge: 600,
  });

  const url = new URL("https://auth.dodois.io/connect/authorize");
  url.search = new URLSearchParams({
    client_id: clientId, redirect_uri: `${new URL(request.url).origin}/api/dodois/callback`, response_type: "code",
    scope: SCOPES, code_challenge: challenge, code_challenge_method: "S256", state,
  }).toString();
  return NextResponse.redirect(url);
}
