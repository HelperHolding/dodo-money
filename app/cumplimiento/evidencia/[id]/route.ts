import { obtenerPerfil } from "@/lib/contexto";
import { puedeVerCompras } from "@/lib/roles";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeVerCompras(perfil.rol)) return new Response("Sin acceso", { status: 403 });
  const { id } = await params;
  const { data: e } = await supabase.from("cumplimiento_evidencias").select("ruta,nombre,mime").eq("id", id).not("confirmado_en", "is", null).maybeSingle<{ ruta: string; nombre: string; mime: string }>();
  if (!e) return new Response("Evidencia no encontrada", { status: 404 });
  const { data, error } = await supabase.storage.from("adjuntos-compras").download(e.ruta);
  if (error || !data) return new Response("No se pudo descargar la evidencia", { status: 404 });
  const nombre = encodeURIComponent(e.nombre).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(await data.arrayBuffer(), { headers: { "Content-Type": e.mime, "Content-Disposition": `inline; filename*=UTF-8''${nombre}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
