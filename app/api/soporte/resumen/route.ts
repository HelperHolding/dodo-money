import { NextRequest, NextResponse } from "next/server";
import { llaveValida } from "@/lib/correos/llave";
import { armarResumen, type FilaResumen } from "@/lib/soporte/correo";
import { crearClienteAdmin, urlInvitacion } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** n8n (8:00 México) pide el resumen de lo que resolvió el agente en las últimas 24 h, ya armado por destinatario. */
export async function POST(req: NextRequest) {
  if (!llaveValida(req.headers.get("x-api-key"), process.env.SOPORTE_API_KEY)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const admin = crearClienteAdmin();
  const { data: aj, error: ea } = await admin.from("soporte_ajustes").select("correos, resumen_diario").single<{ correos: string[]; resumen_diario: boolean }>();
  if (ea) { console.error("resumen ajustes", ea.code); return NextResponse.json({ error: "No se pudieron leer los ajustes." }, { status: 500 }); }
  if (!aj.resumen_diario || aj.correos.length === 0) return NextResponse.json([]);
  const hasta = new Date(), desde = new Date(hasta.getTime() - 24 * 60 * 60 * 1000);
  const { data, error } = await admin.rpc("soporte_resumen_agente", { p_desde: desde.toISOString(), p_hasta: hasta.toISOString() });
  if (error) { console.error("soporte_resumen_agente", error.code); return NextResponse.json({ error: "No se pudo armar el resumen." }, { status: 500 }); }
  const filas = ((data ?? []) as FilaResumen[]).map((f) => ({ ...f, numero: Number(f.numero) }));
  const fecha = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric" }).format(hasta);
  return NextResponse.json(armarResumen(filas, new URL(urlInvitacion()).origin, aj.correos, fecha));
}
