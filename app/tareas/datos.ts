import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntradaHilo, Tarea, TipoDocumento } from "@/lib/tareas";

export type Persona = { id: string; nombre: string; rol: string };

/** Solo los mensajes propios de la base (P0001, en español) llegan al usuario; el resto se oculta. */
export function mensajeDe(error: { code?: string; message: string }): string {
  return error.code === "P0001" ? error.message : "No se pudo completar la operación. Intenta de nuevo.";
}

export async function leerTareas(supabase: SupabaseClient, o: { numero?: number; documento?: string } = {}): Promise<Tarea[]> {
  const { data, error } = await supabase.rpc("tareas_visibles", { p_numero: o.numero ?? null, p_documento: o.documento ?? null });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Tarea[]).map((t) => ({ ...t, numero: Number(t.numero) }));
}

export async function leerHilo(supabase: SupabaseClient, numero: number): Promise<EntradaHilo[]> {
  const { data, error } = await supabase.rpc("hilo_tarea", { p_numero: numero });
  if (error) throw new Error(error.message);
  return (data ?? []) as EntradaHilo[];
}

export async function leerPersonas(supabase: SupabaseClient, sucursal: string | null): Promise<Persona[]> {
  const { data, error } = await supabase.rpc("personas_asignables", { p_sucursal: sucursal });
  if (error) throw new Error(error.message);
  return (data ?? []) as Persona[];
}

/** Para el menú: si la migración no está o falla, el contador no aparece y la página sigue. */
export async function contarMisTareas(supabase: SupabaseClient): Promise<{ abiertas: number; vencidas: number }> {
  const { data, error } = await supabase.rpc("contar_mis_tareas");
  const fila = (data as { abiertas: number; vencidas: number }[] | null)?.[0];
  return error || !fila ? { abiertas: 0, vencidas: 0 } : { abiertas: Number(fila.abiertas), vencidas: Number(fila.vencidas) };
}

export async function leerDocumento(supabase: SupabaseClient, tipo: TipoDocumento, id: string) {
  const { data, error } = await supabase.rpc("documento_para_tarea", { p_tipo: tipo, p_id: id });
  if (error) return { error: mensajeDe(error) };
  const d = (data as { texto: string; sucursal_id: string | null; ruta: string; anulado: boolean }[] | null)?.[0];
  return d ?? { error: "El documento no existe." };
}
