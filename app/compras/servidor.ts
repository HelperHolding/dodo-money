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
