"use server";
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
export async function guardarItem(fd:FormData) {
 const id=String(fd.get('proyecto_id')??''),item=String(fd.get('item_id')??'');
 const ruta=`/aperturas/${id}/items/${item}`;
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 const campos=['estado','responsable','inicio','fin','cantidad','recibido','precio','evidencia','notas','orden_id','factura_id'];
 const datos=Object.fromEntries(campos.map(c=>[c,String(fd.get(c)??'')]));
 const {error}=await supabase.rpc('actualizar_apertura_item',{p_item:item,p_revision:Number(fd.get('revision')),p_datos:datos});
 if(error)redirect(`${ruta}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`${ruta}?ok=${encodeURIComponent('Registro actualizado.')}`);
}
export async function agregarItem(fd:FormData) {
 const id=String(fd.get('proyecto_id')??'');const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 const {data,error}=await supabase.rpc('agregar_apertura_item',{p_proyecto:id,p_tipo:String(fd.get('tipo')),p_etapa:String(fd.get('etapa')),p_nombre:String(fd.get('nombre')??'')});
 if(error)redirect(`/aperturas/${id}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`/aperturas/${id}/items/${data}`);
}
export async function guardarProyecto(fd:FormData) {
 const id=String(fd.get('proyecto_id')??'');const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 const {error}=await supabase.rpc('actualizar_apertura_proyecto',{p_proyecto:id,p_revision:Number(fd.get('revision')),p_responsable:String(fd.get('responsable')??''),p_desde:String(fd.get('desde')??''),p_hasta:String(fd.get('hasta')??''),p_presupuesto:fd.get('presupuesto')?Number(fd.get('presupuesto')):null});
 if(error)redirect(`/aperturas/${id}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`/aperturas/${id}?ok=${encodeURIComponent('Proyecto actualizado.')}`);
}
