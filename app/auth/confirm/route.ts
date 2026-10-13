import { NextRequest,NextResponse } from "next/server";
import { crearClienteServidor } from "@/lib/supabase/server";
// Correo de invitación/reenvío con TokenHash: funciona también al abrirlo en otro dispositivo.
export async function GET(request:NextRequest) {
  const hash=request.nextUrl.searchParams.get("token_hash"),tipo=request.nextUrl.searchParams.get("type");
  const headers={"Cache-Control":"no-store","Referrer-Policy":"no-referrer"};
  if(hash&&(tipo==="invite"||tipo==="recovery")) {
    const supabase=await crearClienteServidor();
    const {error}=await supabase.auth.verifyOtp({token_hash:hash,type:tipo});
    if(!error) return NextResponse.redirect(new URL("/invitacion",request.url),{headers});
  }
  return NextResponse.redirect(new URL("/invitacion?error=enlace",request.url),{headers});
}
