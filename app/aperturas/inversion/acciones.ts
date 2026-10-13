'use server';
import {obtenerPerfil} from '@/lib/contexto';import {puedeEditarCompras} from '@/lib/roles';import {redirect} from 'next/navigation';import {revalidatePath} from 'next/cache';
export async function vincular(fd:FormData){const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas/inversion?error=Solo%20administración');
 const {error}=await supabase.rpc('vincular_inversion_apertura',{p_fuente:String(fd.get('fuente')),p_detalle:String(fd.get('detalle')),p_tipo:String(fd.get('tipo')),p_destino:String(fd.get('destino')),p_motivo:String(fd.get('motivo'))});
 if(error)redirect('/aperturas/inversion?error='+encodeURIComponent(error.message));revalidatePath('/aperturas/inversion');redirect('/aperturas/inversion?ok=Vínculo%20registrado');}
