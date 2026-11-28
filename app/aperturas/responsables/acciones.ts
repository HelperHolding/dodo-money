"use server";
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';

const RUTA='/aperturas/responsables';
// Alta o cambio en el catálogo de responsables (HD-27): nombre, usuario ligado (vacío = externo) y activo.
// La función de la base valida nombres duplicados, que un usuario no se ligue dos veces y que solo admin escriba.
export async function guardarResponsable(fd:FormData) {
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 const id=String(fd.get('id')??'').trim()||null,perfilId=String(fd.get('perfil_id')??'').trim()||null;
 // Un alta nueva entra activa; en una fila existente, la casilla manda.
 const activo=id===null?true:fd.get('activo')==='on';
 const {error}=await supabase.rpc('guardar_responsable_apertura',{p_id:id,p_nombre:String(fd.get('nombre')??'').trim(),p_perfil:perfilId,p_externo:perfilId===null,p_activo:activo});
 if(error)redirect(`${RUTA}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`${RUTA}?ok=${encodeURIComponent(id?'Responsable actualizado.':'Responsable agregado.')}`);
}
