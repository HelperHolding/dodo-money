"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SUCURSAL, obtenerPerfil } from "@/lib/contexto";
import { esCorporativo, puedeCambiarSucursal } from "@/lib/roles";

/**
 * Abre una sucursal. Admin: la vuelve su sucursal activa y opera ahí (la base valida que exista).
 * Corporativo: la guarda en la cookie y la ve en solo lectura (obtenerContexto() valida que exista).
 */
export async function verSucursal(formData: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  const id = String(formData.get("sucursal_id") ?? "");
  if (puedeCambiarSucursal(perfil.rol)) {
    if (!id) redirect("/corporativo");
    const { error } = await supabase.rpc("cambiar_mi_sucursal", { p_sucursal: id });
    if (error) redirect(`/corporativo?error=${encodeURIComponent(error.message)}`);
    revalidatePath("/", "layout");
    redirect("/");
  }
  if (!esCorporativo(perfil.rol)) redirect("/");
  if (!id) redirect("/corporativo");
  (await cookies()).set(COOKIE_SUCURSAL, id, {
    httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
  });
  redirect("/");
}
