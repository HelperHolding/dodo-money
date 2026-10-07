'use server';
import {obtenerPerfil} from '@/lib/contexto';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
export async function vincularMenu(fd:FormData){
 const {supabase,perfil}=await obtenerPerfil();if(perfil.rol!=='admin')redirect('/ventas/costos/menu-rappi');
 const id=String(fd.get('id')??''),revision=Number(fd.get('revision')),valor=String(fd.get('dodo_id')??''),version=String(fd.get('version')??'');
 const base='/ventas/costos/menu-rappi?'+new URLSearchParams({version,vincular:id});
 if(!Number.isSafeInteger(revision)||revision<1||valor&&!/^\d+$/.test(valor))redirect(base+'&error='+encodeURIComponent('Vínculo inválido.'));
 const {error}=await supabase.rpc('vincular_menu_rappi',{p_id:id,p_revision:revision,p_dodo_id:valor?Number(valor):null});
 if(error)redirect(base+'&error='+encodeURIComponent(error.code==='23505'?'Ese producto ya está vinculado a otro renglón de esta versión.':error.message));
 revalidatePath('/ventas/costos','layout');redirect('/ventas/costos/menu-rappi?'+new URLSearchParams({version,ok:'Vínculo guardado.'}));
}
