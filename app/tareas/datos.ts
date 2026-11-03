import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntradaHilo, Prioridad, ResultadoRegla, Tarea, TipoDocumento } from "@/lib/tareas";

export type Persona = { id: string; nombre: string; rol: string };

/** Solo los mensajes propios de la base (P0001, en español) llegan al usuario; el resto se oculta. */
export function mensajeDe(error: { code?: string; message: string }): string {
  return error.code === "P0001" ? error.message : "No se pudo completar la operación. Intenta de nuevo.";
}

export async function leerTareas(supabase: SupabaseClient, o: { numero?: number; documento?: string } = {}): Promise<Tarea[]> {
  const { data, error } = await supabase.rpc("tareas_visibles", { p_numero: o.numero ?? null, p_documento: o.documento ?? null });
  if (error) throw new Error(error.message);
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return ((data ?? []) as Tarea[]).map((t) => ({ ...t, numero: Number(t.numero), anterior_numero: num(t.anterior_numero), siguiente_numero: num(t.siguiente_numero) }));
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

export type ReglaTarea = {
  clave: string; nombre: string; descripcion: string; activa: boolean; asignado_default: string | null; dias: number; prioridad: Prioridad;
  actualizada_en: string; abiertas: number; por_crear: number;
};

/** Reglas con sus tareas abiertas y lo que crearían hoy. Solo admin (la RLS y la función lo exigen). */
export async function leerReglas(supabase: SupabaseClient): Promise<ReglaTarea[]> {
  const [reglas, resumen] = await Promise.all([
    supabase.from("tarea_reglas").select("clave, nombre, descripcion, activa, asignado_default, dias, prioridad, actualizada_en").order("nombre"),
    supabase.rpc("resumen_reglas_tareas"),
  ]);
  if (reglas.error) throw new Error(reglas.error.message);
  if (resumen.error) throw new Error(resumen.error.message);
  const cuenta = new Map(((resumen.data ?? []) as { clave: string; abiertas: number; por_crear: number }[]).map((r) => [r.clave, r]));
  return ((reglas.data ?? []) as Omit<ReglaTarea, "abiertas" | "por_crear">[]).map((r) => ({
    ...r, abiertas: Number(cuenta.get(r.clave)?.abiertas ?? 0), por_crear: Number(cuenta.get(r.clave)?.por_crear ?? 0),
  }));
}

/** Corre las reglas con la llave de servicio (el historial queda a nombre de «Sistema»). Quien llame ya verificó que puede. */
export async function generarAutomaticas(admin: SupabaseClient): Promise<ResultadoRegla[]> {
  const { data, error } = await admin.rpc("generar_tareas_automaticas");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ResultadoRegla[]).map((r) => ({ regla: r.regla, creadas: Number(r.creadas), cerradas: Number(r.cerradas) }));
}
