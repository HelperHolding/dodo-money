// Conectar Dodo IS (solo admin): OAuth 2 + PKCE en auth.dodois.com.
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH, SCOPES } from "@/lib/dodois/cliente";
import { obtenerPerfil } from "@/lib/contexto";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { perfil } = await obtenerPerfil();
  const origen = new URL(request.url).origin;
  if (perfil.rol !== "admin") return NextResponse.redirect(`${origen}/ventas`);
  if (!process.env.DODOIS_CLIENT_ID || !process.env.DODOIS_CLIENT_SECRET) {
    return NextResponse.redirect(`${origen}/ventas/dodois?error=${encodeURIComponent("Faltan DODOIS_CLIENT_ID o DODOIS_CLIENT_SECRET en Vercel.")}`);
  }
  const verifier = randomBytes(32).toString("base64url"), state = randomBytes(16).toString("base64url");
  (await cookies()).set("dodois_pkce", JSON.stringify({ verifier, state }), { httpOnly: true, secure: true, sameSite: "lax", path: "/api/dodois", maxAge: 600 });
  const url = new URL(`${AUTH}/connect/authorize`);
  url.search = new URLSearchParams({
    client_id: process.env.DODOIS_CLIENT_ID, redirect_uri: `${origen}/api/dodois/callback`, response_type: "code", scope: SCOPES,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", state,
  }).toString();
  return NextResponse.redirect(url);
}
