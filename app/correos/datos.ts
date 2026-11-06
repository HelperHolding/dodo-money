import type { SupabaseClient } from "@supabase/supabase-js";
import type { Campana, Envio, Evento } from "@/lib/correos/tipos";
export function mensajeDe(error: { code?: string; message: string }): string {
  return error.code === "P0001" ? error.message : "No se pudo completar la operación. Intenta de nuevo.";
}
const COLS = "id,nombre,asunto,html,etiqueta,programada_para,estado,iniciada_en,terminada_en,creado_en";
export async function leerCampanas(sb: SupabaseClient): Promise<Campana[]> {
  const { data, error } = await sb.from("correo_campanas").select(COLS).order("creado_en", { ascending: false }).limit(200);
  if (error) throw new Error(error.message); return (data ?? []) as Campana[];
}
export async function leerCampana(sb: SupabaseClient, id: string): Promise<Campana | null> {
  const { data } = await sb.from("correo_campanas").select(COLS).eq("id", id).maybeSingle(); return (data as Campana) ?? null;
}
/** n8n no ha pedido correos en 10 min (o nunca). */
export async function esperandoN8n(sb: SupabaseClient): Promise<boolean> {
  const { data } = await sb.from("correo_estado_n8n").select("ultima_consulta").eq("id", 1).maybeSingle();
  const u = data?.ultima_consulta ? Date.parse(data.ultima_consulta) : 0; return Date.now() - u > 10 * 60_000;
}
export async function leerEtiquetas(sb: SupabaseClient): Promise<string[]> {
  const { data } = await sb.from("correo_contactos").select("etiquetas").eq("estado", "activo").limit(20000);
  return [...new Set((data ?? []).flatMap((r) => r.etiquetas as string[]))].sort();
}
const PAGINA = 1000;
/** PostgREST corta cada consulta en max_rows (1000): se piden páginas hasta que una venga corta. */
async function leerPaginas<T>(pedir: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const todo: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await pedir(desde, desde + PAGINA - 1);
    if (error) throw new Error(error.message);
    todo.push(...(data ?? []));
    if ((data ?? []).length < PAGINA) return todo;
  }
}
export async function leerEnviosYEventos(sb: SupabaseClient, campana: string): Promise<{ envios: Envio[]; eventos: Evento[] }> {
  const envios = await leerPaginas<Envio>((d, h) => sb.from("correo_envios").select("id,email,es_prueba,estado,enviado_en,detalle").eq("campana_id", campana).order("id").range(d, h));
  const eventos: Evento[] = [];
  for (let i = 0; i < envios.length; i += 100) {
    const ids = envios.slice(i, i + 100).map((e) => e.id);
    eventos.push(...await leerPaginas<Evento>((d, h) => sb.from("correo_eventos").select("id,envio_id,tipo,enlace,sospechoso,creado_en").in("envio_id", ids).order("id").range(d, h)));
  }
  return { envios, eventos };
}
