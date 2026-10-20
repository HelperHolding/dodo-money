// Sincronización de ventas. La llama pg_cron (clave compartida) o un admin ("Actualizar ahora"; ?simular=1 calcula sin guardar).
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";
import { quienLlama } from "@/lib/dodois/cron";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sincronizarVentas } from "@/app/ventas/dodois/sincronizar";
import type { OrigenSincronizacion } from "@/lib/dodois/ventas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const llamada = quienLlama(request.headers.get("authorization"), process.env.DODOIS_CRON_SECRET);
  if (llamada.tipo === "rechazo") return NextResponse.json({ error: llamada.mensaje }, { status: 401 });
  const porCron = llamada.tipo === "cron";
  const url = new URL(request.url);
  let origen: OrigenSincronizacion = "manual";
  if (porCron) {
    const cuerpo = await request.json().catch(() => ({})) as { origen?: string };
    origen = cuerpo.origen === "noche" ? "noche" : "cron";
  } else {
    const { perfil } = await obtenerPerfil();
    if (perfil.rol !== "admin") return NextResponse.json({ error: "Solo admin." }, { status: 403 });
  }
  const fecha = url.searchParams.get("fecha");
  const resultados = await sincronizarVentas(crearClienteAdmin(), origen, {
    fecha: !porCron && fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : undefined,
    simular: !porCron && url.searchParams.get("simular") === "1",
  });
  return NextResponse.json({ origen, resultados });
}
