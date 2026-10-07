import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConciliacionVenta } from "@/lib/ventas/conciliacion";

/** Lectura paginada; durante el despliegue, una migración ausente no bloquea las ventas existentes. */
export async function leerConciliaciones(supabase: SupabaseClient, desde: string, hasta: string, historial = false): Promise<{ filas: ConciliacionVenta[]; disponible: boolean }> {
 const filas: ConciliacionVenta[] = [];
 for (let inicio=0;;inicio+=1000) {
  const { data,error } = await supabase.from(historial ? "ventas_conciliaciones" : "ventas_conciliaciones_vigentes").select("*")
   .gte("fecha",desde).lte("fecha",hasta).order("id").range(inicio,inicio+999).returns<ConciliacionVenta[]>();
  if(error) {
   if(["42P01","PGRST205"].includes(error.code)) return { filas: [], disponible: false };
   throw new Error(`No se pudieron consultar las conciliaciones: ${error.message}`);
  }
  filas.push(...(data??[]));if((data??[]).length<1000) return { filas,disponible: true };
 }
}
