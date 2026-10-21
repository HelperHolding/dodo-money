"use server";
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {crearClienteAdmin} from '@/lib/supabase/admin';
import {errorContrasenaTemporal} from '@/lib/contrasenaTemporal';
const volver=(tipo:string,texto:string):never=>redirect(`/administracion/usuarios?${tipo}=${encodeURIComponent(texto)}`);
export async function asignarContrasenaTemporal(fd:FormData) {
 const {supabase,perfil}=await obtenerPerfil();
 if(perfil.rol!=='admin')redirect('/');
 const usuario=String(fd.get('usuario')??''),solicitud=String(fd.get('solicitud')??'');
 const nueva=String(fd.get('temporal')??''),confirmar=String(fd.get('confirmar')??''),motivo=String(fd.get('motivo')??'').trim();
 const problema=errorContrasenaTemporal(nueva,confirmar,motivo);
 if(problema)volver('error',problema);
 if(usuario===perfil.id)volver('error','Para tu propia cuenta utiliza Mi contraseña.');
 const admin=crearClienteAdmin();
 const reserva=await supabase.rpc('preparar_password_temporal',{p_id:solicitud,p_usuario:usuario,p_motivo:motivo});
 if(reserva.error)volver('error',reserva.error.message);
 if(reserva.data==='aplicada')volver('ok','La contraseña temporal ya fue asignada. El usuario debe cambiarla al entrar.');
 let fallo=false;
 try {
  const actual=await admin.auth.admin.getUserById(usuario);
  if(actual.error||!actual.data.user)fallo=true;
  else {
   const resultado=await admin.auth.admin.updateUserById(usuario,{
    password:nueva,
    app_metadata:{...actual.data.user.app_metadata,dodo_password_temporal_id:solicitud}
   });
   fallo=!!resultado.error;
  }
 } catch {fallo=true;}
 if(fallo) {
  await supabase.rpc('fallar_password_temporal',{p_id:solicitud});
  volver('error','No se pudo confirmar la asignación. Recarga y revisa el historial antes de reintentar.');
 }
 revalidatePath('/administracion/usuarios');
 volver('ok','Contraseña temporal asignada. Compártela por un medio privado; el usuario deberá cambiarla al entrar.');
}
