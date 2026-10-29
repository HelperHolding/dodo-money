import { NextResponse, type NextRequest } from "next/server";
import { agruparAvisos, type AvisoCumplimiento } from "@/lib/cumplimiento";
import { hoyMX } from "@/lib/formato";
import { conCuentaAutomatizacion } from "../cuenta";

export const dynamic = "force-dynamic";

/** Lo que n8n debe avisar hoy por un canal (aún no entregado por ese canal), agrupado, con ligas absolutas y los correos de los admins. */
export async function GET(req: NextRequest) {
  return conCuentaAutomatizacion(req, async (supabase) => {
    const canal = req.nextUrl.searchParams.get("canal");
    if (canal !== "correo" && canal !== "chat") return NextResponse.json({ error: "Indica canal=correo o canal=chat." }, { status: 400 });
    const hoy = hoyMX(), base = (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/$/, "");
    const [avisos, correos] = await Promise.all([
      supabase.rpc("avisos_cumplimiento", { p_hoy: hoy, p_canal: canal }),
      supabase.rpc("correos_avisos_cumplimiento"),
    ]);
    if (avisos.error) throw new Error(avisos.error.message);
    if (correos.error) throw new Error(correos.error.message);
    const lista = ((avisos.data ?? []) as Omit<AvisoCumplimiento, "url">[]).map((a) => ({ ...a, url: `${base}${a.ruta}` }));
    return NextResponse.json({ hoy, canal, destinatarios: (correos.data ?? []) as string[], total: lista.length, avisos: agruparAvisos(lista) });
  });
}
