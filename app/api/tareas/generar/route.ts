// Tareas automáticas. La llama n8n una vez al día (clave compartida del cron) o un admin con sesión.
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";
import { quienLlama } from "@/lib/dodois/cron";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { resumenGeneracion } from "@/lib/tareas";
import { generarAutomaticas } from "@/app/tareas/datos";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const llamada = quienLlama(request.headers.get("authorization"), process.env.DODOIS_CRON_SECRET);
  if (llamada.tipo === "rechazo") return NextResponse.json({ error: llamada.mensaje }, { status: 401 });
  if (llamada.tipo === "persona") {
    const { perfil } = await obtenerPerfil();
    if (perfil.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  }
  try {
    const reglas = await generarAutomaticas(crearClienteAdmin());
    return NextResponse.json({ resumen: resumenGeneracion(reglas), reglas });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error desconocido" }, { status: 500 });
  }
}
