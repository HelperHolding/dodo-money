"use server";
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {RESPONSABLE_LEGADO} from '@/lib/aperturas';
export async function guardarItem(fd:FormData) {
 const id=String(fd.get('proyecto_id')??''),item=String(fd.get('item_id')??'');
 const ruta=`/aperturas/${id}/items/${item}`;
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 // Nombre, descripción y responsable del catálogo solo van si la ficha los muestra (con la migración de responsables);
 // sin ella, el responsable sigue como texto libre y la función anterior no conoce esas claves.
 const opcionales=['responsable','nombre','descripcion','responsable_id','categoria'].filter(c=>fd.has(c));
 const campos=['estado','inicio','fin','cantidad','recibido','precio','evidencia','notas','orden_id','factura_id',...opcionales];
 const datos:Record<string,string>=Object.fromEntries(campos.map(c=>[c,String(fd.get(c)??'')]));
 // Registro de legado sin tocar el selector: no se mandan responsable_id ni texto, así el texto anterior se conserva.
 if(datos.responsable_id===RESPONSABLE_LEGADO){delete datos.responsable_id;delete datos.responsable;}
 // «Sin asignar» en el catálogo también limpia el texto anterior; la función solo respeta el texto en registros sin responsable_id.
 else if(datos.responsable_id==='')datos.responsable='';
 const {error}=await supabase.rpc('actualizar_apertura_item',{p_item:item,p_revision:Number(fd.get('revision')),p_datos:datos});
 if(error)redirect(`${ruta}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`${ruta}?ok=${encodeURIComponent('Registro actualizado.')}`);
}
// Lo único que el responsable de un registro puede cambiar (HD-27): estado, fechas, notas, evidencia y la cantidad recibida.
// Cantidad necesaria y precio son de administración. La función rechaza cualquier otra clave.
const CAMPOS_RESPONSABLE=['estado','inicio','fin','notas','evidencia','recibido'];
export async function guardarSeguimiento(fd:FormData) {
 const id=String(fd.get('proyecto_id')??''),item=String(fd.get('item_id')??''),ruta=`/aperturas/${id}/items/${item}`;
 const {supabase}=await obtenerPerfil();
 // recibido solo va si el formulario lo trae (registros de compra).
 const datos=Object.fromEntries(CAMPOS_RESPONSABLE.filter(c=>c!=='recibido'||fd.has(c)).map(c=>[c,String(fd.get(c)??'')]));
 const {error}=await supabase.rpc('actualizar_apertura_item',{p_item:item,p_revision:Number(fd.get('revision')),p_datos:datos});
 if(error)redirect(`${ruta}?error=${encodeURIComponent(error.message)}`);
 revalidatePath('/aperturas','layout');redirect(`${ruta}?ok=${encodeURIComponent('Seguimiento actualizado.')}`);
}
// Bitácora: admin o el responsable del registro (la función lo valida). Sin fecha, hoy; avance opcional de 0 a 100.
export async function agregarBitacora(fd:FormData) {
 const id=String(fd.get('proyecto_id')??''),item=String(fd.get('item_id')??''),ruta=`/aperturas/${id}/items/${item}`;
 const {supabase}=await obtenerPerfil();const texto=(c:string)=>String(fd.get(c)??'').trim();
 const avance=texto('avance');
 const {error}=await supabase.rpc('agregar_bitacora_apertura',{p_item:item,p_fecha:texto('fecha')||null,p_avance:avance===''?null:Number(avance),p_estatus:texto('estatus')||null,p_comentario:texto('comentario')});
 if(error)redirect(`${ruta}?error=${encodeURIComponent(error.message)}`);
 revalidatePath(ruta);redirect(`${ruta}?ok=${encodeURIComponent('Entrada agregada a la bitácora.')}`);
}
// Divide un registro en 2 a 10 partes (HD-18). Cada fila de la ventana manda parte_nombre, parte_responsable, parte_inicio y parte_fin.
export async function dividirItem(fd:FormData) {
 const id=String(fd.get('proyecto_id')??''),item=String(fd.get('item_id')??''),ruta=`/aperturas/${id}/items/${item}`;
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))redirect('/aperturas');
 const lista=(c:string)=>fd.getAll(c).map(v=>String(v).trim());
 const nombres=lista('parte_nombre'),resp=lista('parte_responsable'),ini=lista('parte_inicio'),fin=lista('parte_fin');
 const partes=nombres.map((nombre,n)=>({nombre,responsable_id:resp[n]??'',inicio:ini[n]??'',fin:fin[n]??''}));
 const {data,error}=await supabase.rpc('dividir_apertura_item',{p_item:item,p_partes:partes});
 if(error)redirect(`${ruta}?error=${encodeURIComponent(error.message)}`);
 const claves=(data as string[]|null)??[];
 const vista=['compras','tecnico'].includes(String(fd.get('vista')))?String(fd.get('vista')):'actividades';
 revalidatePath('/aperturas','layout');redirect(`/aperturas/${id}?vista=${vista}&ok=${encodeURIComponent(`Dividida en ${claves.join(', ')}.`)}`);
}
// «+ Nuevo externo» desde la ficha: alta rápida en el catálogo; la ventana agrega la opción y la deja elegida.
export async function crearResponsableExterno(nombre:string):Promise<{id:string;nombre:string}|{error:string}> {
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))return {error:'Solo administración gestiona responsables.'};
 const limpio=String(nombre??'').trim();
 const {data,error}=await supabase.rpc('guardar_responsable_apertura',{p_id:null,p_nombre:limpio,p_perfil:null,p_externo:true,p_activo:true});
 if(error||!data)return {error:error?.message??'No se pudo agregar el responsable.'};
 revalidatePath('/aperturas/responsables');
 return {id:String(data),nombre:limpio};
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
