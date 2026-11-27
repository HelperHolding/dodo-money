import { NextRequest, NextResponse } from "next/server";
import { reporteError } from "@/lib/errorPantalla";

export const dynamic = "force-dynamic";

/**
 * La pantalla de error manda aquí los errores que nacen en el navegador (sin digest) para que queden en Vercel → Logs
 * con su código N-xxxxxx. Requiere sesión (el middleware la pide) y solo escribe al log.
 */
export async function POST(req: NextRequest) {
  const cuerpo = await req.json().catch(() => null) as Record<string, string | undefined> | null;
  if (!cuerpo || typeof cuerpo.codigo !== "string") return NextResponse.json({ error: "Falta el código." }, { status: 400 });
  const r = reporteError({ name: cuerpo.nombre, message: cuerpo.mensaje, stack: cuerpo.pila }, cuerpo.codigo, String(cuerpo.ruta ?? ""));
  console.error(`Error en el navegador ${r.codigo} en ${r.ruta}: ${r.nombre}: ${r.mensaje}\n${r.pila}`);
  return new NextResponse(null, { status: 204 });
}
