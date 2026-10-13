import "server-only";
import { createClient } from "@supabase/supabase-js";
export function crearClienteAdmin() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim(),key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if(!url||!key) throw new Error("Configura SUPABASE_SERVICE_ROLE_KEY en el servidor para enviar invitaciones.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export function urlInvitacion() {
  const url=process.env.APP_URL?.trim();
  if(!url) throw new Error("Configura APP_URL con la dirección de Dodo MX.");
  const parsed=new URL(url);
  if(parsed.protocol!=="https:"||parsed.username||parsed.password) throw new Error("APP_URL debe ser una dirección HTTPS válida.");
  return `${parsed.origin}/invitacion`;
}
