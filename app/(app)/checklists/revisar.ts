"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerContextoParaEscribir } from "@/lib/contexto";

const TIPOS = ["checklist", "amasado", "limpieza"];

/** "Revisado" para listas, lotes de amasado y limpieza profunda. Regresa a la página de origen. */
export async function revisarRegistro(formData: FormData) {
  const pedido = String(formData.get("volver") ?? "/checklists");
  const volver = pedido.startsWith("/checklists") ? pedido : "/checklists";
  const { supabase } = await obtenerContextoParaEscribir(volver.split("?")[0]);
  const tipo = String(formData.get("tipo") ?? "");
  const sep = volver.includes("?") ? "&" : "?";
  if (!TIPOS.includes(tipo)) redirect(`${volver}${sep}error=${encodeURIComponent("Tipo de registro inválido.")}`);

  const { error } = await supabase.rpc("revisar", { p_tipo: tipo, p_id: String(formData.get("id") ?? "") });
  if (error) redirect(`${volver}${sep}error=${encodeURIComponent(error.message)}`);
  revalidatePath("/checklists", "layout");
  redirect(`${volver}${sep}ok=${encodeURIComponent("Marcado como revisado.")}`);
}
