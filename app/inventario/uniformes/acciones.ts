"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { obtenerPerfil } from "@/lib/contexto";
import { cantidadValida } from "@/lib/inventario";
import { puedeEditarCompras } from "@/lib/roles";

const RUTA = "/inventario/uniformes";
const volver = (clave: "ok" | "error", texto: string): never => redirect(`${RUTA}?${clave}=${encodeURIComponent(texto)}`);

/** Cambia la cantidad contada de un artículo; la base de datos registra el ajuste en el historial. Solo admin. */
export async function ajustarArticulo(fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) volver("error", "Solo administración ajusta el inventario.");
  const sku = String(fd.get("sku") ?? ""), nombre = String(fd.get("nombre") ?? sku);
  const cantidad = cantidadValida(String(fd.get("cantidad") ?? ""));
  if (cantidad === null) volver("error", `Revisa la cantidad de ${nombre}: número entero sin decimales.`);
  const { error } = await supabase.rpc("ajustar_inventario", { p_sku: sku, p_cantidad: cantidad, p_nota: String(fd.get("nota") ?? "") });
  if (error) volver("error", error.message);
  revalidatePath(RUTA);
  volver("ok", `${nombre}: ${cantidad} piezas.`);
}
