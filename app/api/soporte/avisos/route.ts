import { NextRequest, NextResponse } from "next/server";
import { llaveValida } from "@/lib/correos/llave";
import { armarCorreo, type AvisoTomado } from "@/lib/soporte/correo";
import { crearClienteAdmin, urlInvitacion } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** n8n pide hasta 10 avisos del Help Desk ya armados. Body opcional { lote }. Header x-api-key = SOPORTE_API_KEY. */
export async function POST(req: NextRequest) {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.SOPORTE_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let lote = 10;
  try { const b = await req.json(); if (Number.isInteger(b?.lote)) lote = b.lote; } catch { /* sin cuerpo: 10 */ }
  const base = new URL(urlInvitacion()).origin;
  const { data, error } = await crearClienteAdmin().rpc("soporte_tomar_avisos", { p_lote: lote });
  if (error) { console.error("soporte_tomar_avisos", error); return NextResponse.json({ error: "No se pudieron preparar los avisos." }, { status: 500 }); }
  return NextResponse.json(((data ?? []) as AvisoTomado[]).map((a) => ({ aviso_id: a.aviso_id, para: a.para, ...armarCorreo(a, base) })));
}
