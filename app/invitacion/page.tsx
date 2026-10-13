import { crearClienteServidor } from "@/lib/supabase/server";
import { establecerContrasena } from "./acciones";
import { Aviso } from "@/components/Aviso";
import Link from "next/link";
export const dynamic="force-dynamic";
export default async function Invitacion({searchParams}:{searchParams:Promise<{error?:string}>}) {
  const q=await searchParams,supabase=await crearClienteServidor(),{data:{user}}=await supabase.auth.getUser();
  const {data:pendiente}=user?await supabase.rpc("mi_invitacion_pendiente"): {data:null};
  return <main className="login"><div className="seccion"><img src="/logo-dodo.png" alt="Dodo MX" width={60} height={60}/><h1>Crea tu contraseña</h1>
  <Aviso error={q.error==="enlace"?"El enlace expiró o ya se utilizó. Pide a administración que reenvíe la invitación.":q.error}/>
  {pendiente?<form action={establecerContrasena}><p>Bienvenido a Dodo MX. Tu contraseña es personal.</p><label>Nueva contraseña<input name="nueva" type="password" autoComplete="new-password" required minLength={8}/></label><label>Confirmar contraseña<input name="confirmar" type="password" autoComplete="new-password" required minLength={8}/></label><button className="boton">Guardar contraseña y entrar</button></form>:<p>Abre el enlace de tu invitación para continuar. Si ya creaste tu contraseña, <Link href="/login">inicia sesión</Link>.</p>}</div></main>;
}
