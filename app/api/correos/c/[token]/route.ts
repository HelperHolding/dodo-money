import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { destinoClic, dominiosExtra } from "@/lib/correos/destino";
import { slug } from "@/lib/correos/tipos";

export const dynamic = "force-dynamic";
const ESPERA_MS = 2000;

/** Clic: registra y redirige solo a dominios permitidos (si no, a dodopizza.mx). Nunca falla a la vista. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const u = req.nextUrl.searchParams.get("u");
  const extra = dominiosExtra();
  let campana = "correo";
  try {
    const { token } = await params;
    if (/^[0-9a-f]{64}$/.test(token)) {
      const previo = destinoClic(u, "correo", extra);
      const registro = Promise.resolve(crearClienteAdmin().rpc("correo_registrar_evento", { p_token: token, p_tipo: "clic", p_enlace: previo, p_agente: req.headers.get("user-agent") })).catch(() => null);
      const res = await Promise.race([registro, new Promise<null>((r) => setTimeout(() => r(null), ESPERA_MS))]);
      const nombre = res?.data?.campana_nombre;
      if (nombre) campana = slug(String(nombre));
    }
  } catch { /* se redirige igual */ }
  return NextResponse.redirect(destinoClic(u, campana, extra), { status: 302, headers: { "cache-control": "no-store" } });
}
