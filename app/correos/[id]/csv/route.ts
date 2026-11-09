import { NextResponse } from "next/server";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerCorreos } from "@/lib/roles";
import { estadisticas } from "@/lib/correos/estadisticas";
import { csvDestinatarios } from "@/lib/correos/csvSalida";
import { slug } from "@/lib/correos/tipos";
import { leerCampana, leerEnviosYEventos } from "../../datos";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params, { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCorreos(perfil.rol)) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  const c = await leerCampana(supabase, id); if (!c) return NextResponse.json({ error: "No existe" }, { status: 404 });
  const { envios, eventos } = await leerEnviosYEventos(supabase, id);
  return new NextResponse(csvDestinatarios(envios, estadisticas(envios, eventos).porEnvio), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${slug(c.nombre)}.csv"`, "cache-control": "no-store" },
  });
}
