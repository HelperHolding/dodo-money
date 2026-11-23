import { NextRequest, NextResponse } from "next/server";
import { llaveValida } from "@/lib/correos/llave";
import { crearClienteAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** n8n reporta cómo le fue a un aviso: { aviso_id, ok, error? }. */
export async function POST(req: NextRequest) {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.SOPORTE_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  let b: { aviso_id?: unknown; ok?: unknown; error?: unknown };
  try { b = await req.json(); } catch { return NextResponse.json({ error: "El cuerpo no es JSON válido." }, { status: 400 }); }
  if (typeof b.aviso_id !== "string" || !UUID.test(b.aviso_id) || typeof b.ok !== "boolean") return NextResponse.json({ error: "Falta aviso_id u ok." }, { status: 400 });
  const { error } = await crearClienteAdmin().rpc("soporte_resultado_aviso", { p_aviso: b.aviso_id, p_ok: b.ok, p_error: typeof b.error === "string" ? b.error : null });
  if (error) { console.error("soporte_resultado_aviso", error); return NextResponse.json({ error: error.code === "P0001" ? error.message : "No se pudo registrar el resultado." }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
