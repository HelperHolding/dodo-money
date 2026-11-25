"use server";
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';

// Fotos Dodo por partida (HD-16). El navegador sube directo al bucket; aquí se registran y se borran las que quedan sin uso.
// Responden {error} o {ok} sin redirigir, como las acciones del plano.
const BUCKET='aperturas-fotos';
const SIN_PERMISO={error:'Solo administración puede editar las fotos de la apertura.'};
const esUuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f-]{36}$/i.test(s);

export type FilaImportar={item_id:string;codigo:string|null;matriz:string|null;matriz_url:string|null;sustituto:string|null;foto:string|null};

/** Liga las partidas con la matriz (máximo 400 por llamada). Borra del bucket las fotos de proyecto reemplazadas. */
export async function importarDodo(proyecto:string,filas:FilaImportar[]):Promise<{error:string}|{ok:true;ligadas:number;conFoto:number;aviso?:string}> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return SIN_PERMISO;
 if(!esUuid(proyecto))return {error:'La apertura no es válida.'};
 if(!Array.isArray(filas)||!filas.length)return {error:'No hay partidas para importar.'};
 if(filas.length>400)return {error:'Máximo 400 partidas por importación.'};
 const {data,error}=await supabase.rpc('importar_apertura_dodo',{p_proyecto:proyecto,p_filas:filas});
 if(error)return {error:error.message};
 const r=((data??[]) as {ligadas:number;con_foto:number;fotos_anteriores:string[]|null}[])[0];
 revalidatePath('/aperturas','layout');
 const res={ok:true as const,ligadas:r?.ligadas??0,conFoto:r?.con_foto??0};
 const viejas=[...new Set(r?.fotos_anteriores??[])];
 if(viejas.length){
  const {error:e}=await supabase.storage.from(BUCKET).remove(viejas);
  if(e)return {...res,aviso:'Se importó, pero no se pudieron borrar las fotos anteriores.'};
 }
 return res;
}

/** Guarda (ruta) o quita (null) la foto real de la partida y borra la anterior del bucket. */
export async function guardarFotoReal(proyecto:string,item:string,ruta:string|null):Promise<{error:string}|{ok:true;aviso?:string}> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return SIN_PERMISO;
 if(!esUuid(proyecto)||!esUuid(item))return {error:'La partida no es válida.'};
 if(ruta!==null&&(typeof ruta!=='string'||!ruta.startsWith(`${proyecto}/`)))return {error:'La ruta de la foto no es válida.'};
 const {data:anterior,error}=await supabase.rpc('guardar_foto_real',{p_item:item,p_ruta:ruta});
 if(error)return {error:error.message};
 revalidatePath('/aperturas','layout');
 if(typeof anterior==='string'&&anterior&&anterior!==ruta){
  const {error:e}=await supabase.storage.from(BUCKET).remove([anterior]);
  if(e)return {ok:true,aviso:'La foto se guardó, pero no se pudo borrar la anterior.'};
 }
 return {ok:true};
}
