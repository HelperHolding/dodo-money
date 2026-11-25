"use server";
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';

// Planos de apertura (HD-14). Los archivos los sube el navegador directo al bucket (el límite de las acciones es 5 MB);
// aquí solo se registran, se ubican marcas y se borra. Responden {error} o {ok} sin redirigir, como cambiarEstado.ts.
const BUCKET='aperturas-planos';
const SIN_PERMISO={error:'Solo administración puede editar planos.'};
const esUuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f-]{36}$/i.test(s);

export type DatosPlano={proyecto:string;hoja:string;nombre:string;version:string;archivo:string;imagen:string;ancho:number;alto:number;revision:number|null};

/** Crea la hoja (revision null) o reemplaza su archivo (revision vigente). Al reemplazar, borra los archivos anteriores. */
export async function guardarPlano(d:DatosPlano):Promise<{error:string}|{ok:true;id:string;aviso?:string}> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return SIN_PERMISO;
 if(!esUuid(d?.proyecto))return {error:'La apertura no es válida.'};
 // Rutas de la versión que se reemplaza: la función no las devuelve, se leen antes.
 const {data:previo,error:ep}=await supabase.from('apertura_planos').select('archivo,imagen,revision').eq('proyecto_id',d.proyecto).eq('hoja',String(d.hoja??'').trim()).maybeSingle<{archivo:string;imagen:string;revision:number}>();
 if(ep)return {error:'No se pudo leer la hoja. Recarga la página.'};
 if(d.revision===null&&previo)return {error:`Ya existe la hoja ${String(d.hoja).trim()}. Para cambiar su archivo usa «Reemplazar archivo».`};
 const {data:id,error}=await supabase.rpc('guardar_apertura_plano',{p_proyecto:d.proyecto,p_hoja:d.hoja,p_nombre:d.nombre,p_version:d.version,p_archivo:d.archivo,p_imagen:d.imagen,p_ancho:Math.round(d.ancho),p_alto:Math.round(d.alto),p_revision:d.revision});
 if(error||!id)return {error:error?.message??'No se pudo guardar la hoja.'};
 revalidatePath(`/aperturas/${d.proyecto}`);
 // Solo si lo leído es exactamente la revisión reemplazada (la función exige esa revisión, así que son esos archivos).
 if(previo&&previo.revision===d.revision){
  const viejos=[...new Set([previo.archivo,previo.imagen])].filter(r=>r!==d.archivo&&r!==d.imagen);
  if(viejos.length){
   const {error:e}=await supabase.storage.from(BUCKET).remove(viejos);
   if(e)return {ok:true,id:String(id),aviso:'La hoja se actualizó, pero no se pudieron borrar los archivos de la versión anterior.'};
  }
 }
 return {ok:true,id:String(id)};
}

export async function colocarMarca(plano:string,item:string,x:number,y:number):Promise<{error:string}|{ok:true}> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return SIN_PERMISO;
 if(!esUuid(plano)||!esUuid(item))return {error:'La marca no es válida.'};
 if(!Number.isFinite(x)||!Number.isFinite(y))return {error:'La posición debe estar dentro del plano.'};
 const {error}=await supabase.rpc('colocar_apertura_marca',{p_plano:plano,p_item:item,p_x:x,p_y:y});
 return error?{error:error.message}:{ok:true};
}

export async function quitarMarca(plano:string,item:string):Promise<{error:string}|{ok:true}> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return SIN_PERMISO;
 if(!esUuid(plano)||!esUuid(item))return {error:'La marca no es válida.'};
 const {error}=await supabase.rpc('quitar_apertura_marca',{p_plano:plano,p_item:item});
 return error?{error:error.message}:{ok:true};
}

/** Borra la hoja y sus marcas; después, sus archivos del bucket. */
export async function borrarPlano(proyecto:string,plano:string):Promise<{error:string}|{ok:true;aviso?:string}> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return SIN_PERMISO;
 if(!esUuid(proyecto)||!esUuid(plano))return {error:'La hoja no es válida.'};
 const {data,error}=await supabase.rpc('borrar_apertura_plano',{p_plano:plano});
 if(error)return {error:error.message};
 revalidatePath(`/aperturas/${proyecto}`);
 const filas=(data??[]) as {archivo:string|null;imagen:string|null}[];
 const rutas=[...new Set(filas.flatMap(f=>[f.archivo,f.imagen]).filter((r):r is string=>!!r))];
 if(rutas.length){
  const {error:e}=await supabase.storage.from(BUCKET).remove(rutas);
  if(e)return {ok:true,aviso:'La hoja se borró, pero no se pudieron borrar sus archivos.'};
 }
 return {ok:true};
}
