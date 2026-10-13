"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
export async function guardarUsuario(form:FormData) {
  const {supabase,perfil}=await obtenerPerfil();
  if(perfil.rol!=="admin") redirect("/");
  let original:unknown;
  try {original=JSON.parse(String(form.get("original")));} catch {redirect("/administracion/usuarios?error=Recarga%20la%20pantalla");}
  const {error}=await supabase.rpc("administrar_usuario",{
    p_id:String(form.get("id")),p_original:original,
    p_nombre:String(form.get("nombre")??""),p_rol:String(form.get("rol")??""),
    p_sucursal:String(form.get("sucursal_id")??"")||null,p_activo:form.get("activo")==="on",
    p_motivo:String(form.get("motivo")??"")
  });
  if(error) redirect(`/administracion/usuarios?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/", "layout");
  redirect("/administracion/usuarios?ok=Usuario%20actualizado");
}
