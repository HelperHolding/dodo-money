"use server";
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
export async function guardarItem(fd:FormData) {
 const id=String(fd.get('proyecto_id')??''),item=String(fd.get('item_id')??'');
 const ruta=`/aperturas/${id}/items/${item}`;
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 const campos=['estado','responsable','inicio','fin','cantidad','recibido','precio','evidencia','notas','orden_id','factura_id',...(fd.has('categoria')?['categoria']:[])];
 const datos=Object.fromEntries(campos.map(c=>[c,String(fd.get(c)??'')]));
 const {error}=await supabase.rpc('actualizar_apertura_item',{p_item:item,p_revision:Number(fd.get('revision')),p_datos:datos});
 if(error)redirect(`${ruta}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`${ruta}?ok=${encodeURIComponent('Registro actualizado.')}`);
}
export async function agregarItem(fd:FormData) {
 const id=String(fd.get('proyecto_id')??'');const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 // Alta en un paso (HD-18): nombre, descripción, tipo, etapa, categoría, responsable del catálogo, inicio y fin.
 const texto=(c:string)=>String(fd.get(c)??'').trim(),opcional=(c:string)=>texto(c)||null;
 const base={p_proyecto:id,p_tipo:texto('tipo'),p_etapa:texto('etapa'),p_nombre:texto('nombre'),p_categoria:texto('categoria')};
 let {data,error}=await supabase.rpc('crear_apertura_item_completo',{p_proyecto:id,p_tipo:base.p_tipo,p_etapa:base.p_etapa,p_categoria:base.p_categoria,p_nombre:base.p_nombre,p_descripcion:opcional('descripcion'),p_responsable:opcional('responsable_id'),p_inicio:opcional('inicio'),p_fin:opcional('fin')});
 // Mientras la migración de responsables no esté en producción, el alta sigue con la función anterior (nombre, tipo, etapa y categoría).
 if(error&&(error.code==='PGRST202'||error.code==='42883'))({data,error}=await supabase.rpc('agregar_apertura_item',base));
 if(error)redirect(`/aperturas/${id}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`/aperturas/${id}/items/${data}`);
}
export async function guardarProyecto(fd:FormData) {
 const id=String(fd.get('proyecto_id')??'');const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 const {error}=await supabase.rpc('actualizar_apertura_proyecto',{p_proyecto:id,p_revision:Number(fd.get('revision')),p_responsable:String(fd.get('responsable')??''),p_desde:String(fd.get('desde')??''),p_hasta:String(fd.get('hasta')??''),p_presupuesto:fd.get('presupuesto')?Number(fd.get('presupuesto')):null});
 if(error)redirect(`/aperturas/${id}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`/aperturas/${id}?ok=${encodeURIComponent('Proyecto actualizado.')}`);
}
