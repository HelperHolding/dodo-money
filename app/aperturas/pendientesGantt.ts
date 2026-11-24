import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemApertura } from "@/lib/aperturas";
import type { EstadoTarea } from "@/lib/tareas";
import { leerPersonas, type Persona } from "@/app/tareas/datos";

export type PendienteGantt = { numero: number; estado: EstadoTarea; asignado: string };

/**
 * Pendientes (tareas manuales) ligados a cada tarea del Gantt y, si quien ve puede ligarlos (admin), las personas a quien
 * se puede asignar uno. Si la consulta falla, el Gantt sigue sin pendientes.
 */
export async function pendientesGantt(supabase: SupabaseClient, items: readonly ItemApertura[], sucursal: string, puedeAsignar: boolean)
  : Promise<{ pendientes: Record<string, PendienteGantt[]>; personas: Persona[] }> {
  const pendientes: Record<string, PendienteGantt[]> = {};
  const ids = items.map((i) => i.id);
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await supabase.from("tareas").select("numero, estado, apertura_item_id, perfiles:asignado_a(nombre)")
        .in("apertura_item_id", ids.slice(i, i + 200)).eq("origen", "manual").neq("estado", "cancelada").order("numero")
        .returns<{ numero: number; estado: EstadoTarea; apertura_item_id: string; perfiles: { nombre: string } | null }[]>();
      if (error) throw error;
      for (const t of data ?? []) (pendientes[t.apertura_item_id] ??= []).push({ numero: Number(t.numero), estado: t.estado, asignado: t.perfiles?.nombre ?? "Sin nombre" });
    }
  } catch { /* sin pendientes */ }
  let personas: Persona[] = [];
  if (puedeAsignar) personas = await leerPersonas(supabase, sucursal).catch(() => []);
  return { pendientes, personas };
}
