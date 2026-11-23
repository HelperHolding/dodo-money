import type { SupabaseClient } from "@supabase/supabase-js";
import { BUCKET_SOPORTE, type EntradaHilo, type Ticket } from "@/lib/soporte";
export { mensajeDe } from "@/app/tareas/datos";

export async function leerTickets(supabase: SupabaseClient, numero?: number): Promise<Ticket[]> {
  const { data, error } = await supabase.rpc("tickets_visibles", { p_numero: numero ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Ticket[]).map((t) => ({ ...t, numero: Number(t.numero) }));
}

export async function leerHilo(supabase: SupabaseClient, numero: number): Promise<EntradaHilo[]> {
  const { data, error } = await supabase.rpc("hilo_ticket", { p_numero: numero });
  if (error) throw new Error(error.message);
  return (data ?? []) as EntradaHilo[];
}

/** Para el menú: si la migración no está o falla, no hay contador y la página sigue. */
export async function contarSoporte(supabase: SupabaseClient): Promise<{ pendientes: number; urgente: boolean }> {
  try {
    const { data, error } = await supabase.rpc("contar_soporte");
    const fila = (data as { pendientes: number; urgente: boolean }[] | null)?.[0];
    return error || !fila ? { pendientes: 0, urgente: false } : { pendientes: Number(fila.pendientes), urgente: fila.urgente === true };
  } catch { return { pendientes: 0, urgente: false }; }
}

export async function leerResponsables(supabase: SupabaseClient): Promise<{ id: string; nombre: string }[]> {
  const { data, error } = await supabase.rpc("personas_soporte");
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; nombre: string }[];
}

export type Ajustes = { responsable_default: string | null; correos: string[]; avisar_nuevos: boolean; avisar_comentarios: boolean };
export type AvisoFallido = { id: string; para: string; evento: string; ultimo_error: string | null; creado_en: string; soporte_tickets: { numero: number } | null };
export async function leerAjustes(supabase: SupabaseClient): Promise<{ ajustes: Ajustes; fallidos: AvisoFallido[]; pendientes: number }> {
  const [a, f, p] = await Promise.all([
    supabase.from("soporte_ajustes").select("responsable_default, correos, avisar_nuevos, avisar_comentarios").single<Ajustes>(),
    supabase.from("soporte_avisos").select("id, para, evento, ultimo_error, creado_en, soporte_tickets(numero)").eq("estado", "fallido").order("creado_en", { ascending: false }).limit(20),
    supabase.from("soporte_avisos").select("id", { count: "exact", head: true }).in("estado", ["pendiente", "enviando"]),
  ]);
  if (a.error) throw new Error(a.error.message);
  if (f.error) throw new Error(f.error.message);
  return { ajustes: a.data, fallidos: (f.data ?? []) as unknown as AvisoFallido[], pendientes: p.count ?? 0 };
}

/** URL firmada de 10 minutos; null si no se puede (la dueña y soporte sí pueden). */
export async function urlCaptura(supabase: SupabaseClient, ruta: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET_SOPORTE).createSignedUrl(ruta, 600);
  return data?.signedUrl ?? null;
}
