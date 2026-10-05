import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarFinanzas, SOLO_CONSULTA } from "@/lib/roles";

export const volver = (ruta: string, clave: "ok" | "error", texto: string): never =>
  redirect(`${ruta}${ruta.includes("?") ? "&" : "?"}${clave}=${encodeURIComponent(texto)}`);

/** Cliente de Supabase de un admin; cualquier otro regresa con el aviso de solo consulta. */
export async function clienteFinanzas(ruta: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarFinanzas(perfil.rol)) volver(ruta, "error", SOLO_CONSULTA);
  return supabase;
}
