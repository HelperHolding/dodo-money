"use server";
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import type {ItemApertura} from '@/lib/aperturas';
import {datosFechas,esAgrupacion,esColor,validarFechas} from '@/lib/aperturasCalendario';

type Respuesta = {error:string}|{ok:true};

// Fechas desde el calendario: misma función de base que el detalle, con historial; responde el error para mostrarlo en la ventana.
export async function fijarFechasApertura(fd:FormData):Promise<Respuesta> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return {error:'Solo administración puede editar aperturas.'};
 const id=String(fd.get('item_id')??''),inicio=String(fd.get('inicio')??''),fin=String(fd.get('fin')??'');
 const invalido=validarFechas(inicio,fin);if(invalido)return {error:invalido};
 const {data:i,error:e}=await supabase.from('apertura_items').select('*').eq('id',id).maybeSingle<ItemApertura>();
 if(e||!i)return {error:'No se encontró la tarea. Recarga la página.'};
 const {error}=await supabase.rpc('actualizar_apertura_item',{p_item:id,p_revision:i.revision,p_datos:datosFechas(i,inicio,fin)});
 if(error)return {error:error.message==='El registro cambió. Recarga antes de guardar.'?'Alguien más cambió esta tarea. Vuelve a intentarlo.':error.message};
 revalidatePath('/aperturas','layout');
 return {ok:true};
}

// Color de una etapa o categoría; vacío vuelve al predeterminado.
export async function guardarColorApertura(fd:FormData):Promise<Respuesta> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return {error:'Solo administración puede cambiar los colores.'};
 const agrupacion=String(fd.get('agrupacion')??''),clave=String(fd.get('clave')??''),color=String(fd.get('color')??'');
 if(!esAgrupacion(agrupacion)||(color&&!esColor(color)))return {error:'Color inválido.'};
 const {error}=await supabase.rpc('guardar_color_apertura',{p_agrupacion:agrupacion,p_clave:clave,p_color:color});
 if(error)return {error:/apertura_colores|guardar_color_apertura/.test(error.message)?'Falta correr la migración de colores en Supabase.':error.message};
 revalidatePath('/aperturas','layout');
 return {ok:true};
}
