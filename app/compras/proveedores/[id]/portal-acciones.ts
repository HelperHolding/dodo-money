"use server";

import { obtenerPerfil } from "@/lib/contexto";
import { puedeEditarCompras } from "@/lib/roles";
import { leerPortal } from "@/lib/compras/portal";
import { revalidatePath } from "next/cache";

export async function guardarPortal(id: string, fd: FormData) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { error: "Solo administración puede gestionar accesos de portal." };
  const r = leerPortal(c => String(fd.get(c) ?? ""));
  if ("error" in r) return { error: r.error };
  const d = r.datos;
  const { error } = await supabase.rpc("guardar_portal_proveedor", { p_proveedor: id, p_url: d.url, p_usuario: d.usuario, p_password: d.password, p_notas: d.notas, p_quitar_password: d.quitar });
  if (error) return { error: "No se pudo guardar el acceso. Revisa que la migración 0036 esté aplicada." };
  revalidatePath(`/compras/proveedores/${id}`);
  return { ok: "Acceso guardado." };
}

export async function revelarPortal(id: string) {
  const { supabase, perfil } = await obtenerPerfil();
  if (!puedeEditarCompras(perfil.rol)) return { error: "Solo administración puede consultar contraseñas." };
  const { data, error } = await supabase.rpc("revelar_portal_proveedor", { p_proveedor: id });
  if (error || typeof data !== "string") return { error: "No se pudo consultar la contraseña." };
  return { password: data };
}
