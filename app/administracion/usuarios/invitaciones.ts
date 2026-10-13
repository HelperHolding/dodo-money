"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { obtenerPerfil } from "@/lib/contexto";
import { crearClienteAdmin,urlInvitacion } from "@/lib/supabase/admin";
const volver=(tipo:"ok"|"error",texto:string):never=>redirect(`/administracion/usuarios?${tipo}=${encodeURIComponent(texto)}`);
export async function invitarUsuario(form:FormData) {
  const {supabase,perfil}=await obtenerPerfil();
  if(perfil.rol!=="admin") redirect("/");
  let admin:ReturnType<typeof crearClienteAdmin>,destino:string;
  try {admin=crearClienteAdmin();destino=urlInvitacion();} catch(e) {return volver("error",e instanceof Error?e.message:"Falta configuración del servidor.");}
  const id=String(form.get("invitacion_id")??"")||randomUUID(),envio=randomUUID();
  const {data,error}=await supabase.rpc("preparar_invitacion_usuario",{
    p_id:id,p_envio:envio,p_correo:String(form.get("correo")??""),p_nombre:String(form.get("nombre")??""),
    p_rol:String(form.get("rol")??""),p_sucursal:String(form.get("sucursal_id")??"")||null
  });
  if(error) volver("error",error.message);
  const invitacion=data as {id:string;correo:string;usuario_id:string|null};
  let fallo:string|null=null;
  try {
    let recuperacion=false;
    if(invitacion.usuario_id) {
      const usuario=await admin.auth.admin.getUserById(invitacion.usuario_id);
      if(usuario.error) throw new Error("No se pudo verificar la cuenta de la invitación.");
      recuperacion=Boolean(usuario.data.user.email_confirmed_at);
    }
    const resultado=recuperacion
      ? await admin.auth.resetPasswordForEmail(invitacion.correo,{redirectTo:destino})
      : await admin.auth.admin.inviteUserByEmail(invitacion.correo,{redirectTo:destino,data:{dodo_invitacion_id:invitacion.id}});
    if(resultado.error) fallo=resultado.error.message;
  } catch {fallo="No se pudo confirmar el envío. Puedes reintentarlo en un minuto.";}
  const terminado=await admin.rpc("finalizar_envio_invitacion",{p_id:invitacion.id,p_envio:envio,p_error:fallo});
  revalidatePath("/administracion/usuarios");
  if(terminado.error) volver("error","No se pudo actualizar el estado del envío. Recarga y revisa antes de reintentar.");
  if(fallo) volver("error",`No se pudo enviar la invitación: ${fallo}`);
  volver("ok","Invitación enviada. La persona debe abrir el correo y crear su contraseña.");
}
