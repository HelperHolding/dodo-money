// Sincronización de ventas. La llama pg_cron (clave compartida) o un admin ("Actualizar ahora"; ?simular=1 calcula sin guardar).
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { sincronizarVentas } from "@/app/ventas/dodois/sincronizar";
import type { OrigenSincronizacion } from "@/lib/dodois/ventas";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const igual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(request: Request) {
  const clave = process.env.DODOIS_CRON_SECRET ?? "";
  const porCron = clave.length >= 32 && igual(request.headers.get("authorization") ?? "", `Bearer ${clave}`);
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
