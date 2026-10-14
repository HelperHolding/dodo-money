// PRUEBA TEMPORAL de la API de Dodo IS (se quita al terminar): ¿Dodo IS le responde a Vercel? Llama con datos falsos
// (sin secretos) al servidor de tokens y a la API, y muestra estado, encabezados y región. Solo admin.
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";

export const dynamic = "force-dynamic";

async function probar(url: string, init?: RequestInit) {
  try {
    const r = await fetch(url, init);
    const texto = await r.text();
    const encabezados = Object.fromEntries([...r.headers].filter(([k]) => /server|cf-|via|x-|content-type|www-authenticate/i.test(k)));
    return { url, status: r.status, encabezados, cuerpo: texto.slice(0, 500) };
  } catch (e) {
    return { url, status: 0, error: String(e) };
  }
}

export async function GET() {
  const { perfil } = await obtenerPerfil();
  if (perfil.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  const falso = { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=authorization_code&code=x&client_id=x" };
  const ip = await probar("https://api.ipify.org?format=json");
  const resultados = await Promise.all([
    probar("https://auth.dodois.io/connect/token", falso),
    probar("https://auth.dodois.com/connect/token", falso),
    probar("https://auth.dodois.io/.well-known/openid-configuration"),
    probar("https://api.dodois.io/dodopizza/mx/auth/roles/units"),
    probar("https://api.dodois.com/dodopizza/mx/auth/roles/units"),
  ]);
  return NextResponse.json({ region: process.env.VERCEL_REGION ?? null, ip: ip.cuerpo, resultados });
}
