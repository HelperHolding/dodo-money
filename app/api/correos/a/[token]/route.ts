import { after, NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/**
 * Píxel de apertura. Siempre responde la imagen: token inválido o base caída no se notan en el correo.
 * La apertura se guarda con after(): la imagen sale de inmediato y Vercel mantiene viva la función hasta terminar de guardar.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (/^[0-9a-f]{64}$/.test(token)) {
      const agente = req.headers.get("user-agent");
      after(async () => {
        try { await crearClienteAdmin().rpc("correo_registrar_evento", { p_token: token, p_tipo: "apertura", p_enlace: null, p_agente: agente }); } catch { /* sin ruido para el lector */ }
      });
    }
  } catch { /* el lector no debe ver errores */ }
  return new NextResponse(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store, no-cache, must-revalidate, max-age=0" } });
}
