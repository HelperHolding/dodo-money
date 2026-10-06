import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras, SOLO_CONSULTA } from "@/lib/roles";

/** Regresa a `ruta` con un aviso (ok o error). */
export const volver = (ruta: string, clave: "ok" | "error", texto: string): never =>
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}${clave}=${encodeURIComponent(texto)}`);

/** Cliente de Supabase de un admin; cualquier otro regresa con el aviso de solo consulta. */
export async function clienteAdmin(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) volver(ruta, "error", SOLO_CONSULTA);
  return supabase;
}

/** Días de pago autorizados de la empresa (ISO, 1 = lunes … 7 = domingo); por omisión, viernes. */
export async function diasDePago(supabase: SupabaseClient): Promise<number[]> {
  const { data } = await supabase.from("empresa").select("dias_pago").maybeSingle<{ dias_pago: number[] | null }>();
  return data?.dias_pago?.length ? data.dias_pago.map(Number) : [5];
}
