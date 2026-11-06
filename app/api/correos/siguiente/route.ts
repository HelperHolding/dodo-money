import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin, urlInvitacion } from "@/lib/supabase/admin";
import { llaveValida } from "@/lib/correos/llave";
import { prepararCorreo } from "@/lib/correos/preparar";

export const dynamic = "force-dynamic";

/** n8n pide el siguiente lote (máx. 8). Body opcional { lote }. Header x-api-key = CORREOS_API_KEY. */
export async function POST(req: NextRequest) {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.CORREOS_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let lote = 8;
  try { const b = await req.json(); if (Number.isInteger(b?.lote)) lote = b.lote; } catch { /* sin cuerpo: 8 */ }
  const base = new URL(urlInvitacion()).origin;
  const { data, error } = await crearClienteAdmin().rpc("correo_tomar_lote", { p_lote: lote });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const filas = (data ?? []) as { envio_id: string; token: string; para: string; asunto: string; html: string }[];
  return NextResponse.json(filas.map((f) => ({ envio_id: f.envio_id, para: f.para, asunto: f.asunto, ...prepararCorreo(f.html, f.token, base, f.asunto) })));
}
