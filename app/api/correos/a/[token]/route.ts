import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const ESPERA_MS = 2000;

/** Píxel de apertura. Siempre responde la imagen: token inválido o base caída no se notan en el correo. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (/^[0-9a-f]{64}$/.test(token)) {
      const registro = Promise.resolve(crearClienteAdmin().rpc("correo_registrar_evento", { p_token: token, p_tipo: "apertura", p_enlace: null, p_agente: req.headers.get("user-agent") })).catch(() => null);
      await Promise.race([registro, new Promise((r) => setTimeout(r, ESPERA_MS))]);
    }
  } catch { /* el lector no debe ver errores */ }
  return new NextResponse(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, max-age=0" } });
}
