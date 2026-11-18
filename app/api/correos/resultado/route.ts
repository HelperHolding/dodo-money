import { NextRequest, NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { esRebote, llaveValida } from "@/lib/correos/llave";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** n8n reporta cómo le fue a un correo: { envio_id, aceptado, message_id?, detalle? }. */
export async function POST(req: NextRequest) {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.CORREOS_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let b: { envio_id?: unknown; aceptado?: unknown; message_id?: unknown; detalle?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "El cuerpo no es JSON válido." }, { status: 400 }); }
  if (typeof b.envio_id !== "string" || !UUID.test(b.envio_id) || typeof b.aceptado !== "boolean") return NextResponse.json({ error: "Falta envio_id o aceptado." }, { status: 400 });
  const detalle = typeof b.detalle === "string" ? b.detalle : null;
  const { error } = await crearClienteAdmin().rpc("correo_registrar_resultado", {
    p_envio: b.envio_id, p_aceptado: b.aceptado, p_message_id: typeof b.message_id === "string" ? b.message_id : null, p_detalle: detalle, p_rebote: !b.aceptado && esRebote(detalle),
  });
  if (error) { console.error("correo_registrar_resultado", error); return NextResponse.json({ error: error.code === "P0001" ? error.message : "No se pudo registrar el resultado." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
