"use server";
import { redirect } from "next/navigation";
import { crearClienteServidor } from "@/lib/supabase/server";
export async function establecerContrasena(form:FormData) {
  const supabase=await crearClienteServidor(),{data:{user}}=await supabase.auth.getUser();
  const volver=(texto:string):never=>redirect(`/invitacion?error=${encodeURIComponent(texto)}`);
  if(!user) volver("Abre el enlace de tu invitación.");
  const {data:pendiente,error}=await supabase.rpc("mi_invitacion_pendiente");
  if(error||!pendiente) volver("No hay una invitación pendiente para esta cuenta.");
  const nueva=String(form.get("nueva")??""),confirmar=String(form.get("confirmar")??"");
  if(nueva.length<8||nueva!==confirmar) volver("Escribe una contraseña de al menos ocho caracteres y confírmala.");
  const resultado=await supabase.auth.updateUser({password:nueva});
  if(resultado.error) volver(resultado.error.message);
  const {error:marca}=await supabase.rpc("contrasena_cambiada");
  if(marca) volver("La contraseña cambió, pero el acceso sigue pendiente. Contacta a administración.");
  redirect("/");
}
