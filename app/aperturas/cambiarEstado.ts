"use server";
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {aItemChecklist,datosCambioEstado,validarCambioEstado,type ItemApertura,type ItemChecklist} from '@/lib/aperturas';

// Cambio de estado desde el checklist: responde con el error en lugar de redirigir, para mostrarlo en la ventana,
// y con el registro guardado, para pintarlo sin esperar a que la página se vuelva a cargar.
export async function cambiarEstadoApertura(fd:FormData):Promise<{error:string}|{ok:true;item:ItemChecklist}> {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return {error:'Solo administración puede editar aperturas.'};
 const id=String(fd.get('item_id')??''),texto=(c:string)=>String(fd.get(c)??'');
 const {data:i,error:e}=await supabase.from('apertura_items').select('*').eq('id',id).maybeSingle<ItemApertura>();
 if(e||!i)return {error:'No se encontró el registro. Recarga la página.'};
 const compra=i.tipo==='equipo'||i.tipo==='referencia';
 const cambio={estado:texto('estado'),evidencia:texto('evidencia'),notas:texto('notas'),cantidad:compra?texto('cantidad'):undefined,recibido:compra?texto('recibido'):undefined};
 const invalido=validarCambioEstado(i.tipo,{...cambio,cantidad:cambio.cantidad??'',recibido:cambio.recibido??''});
 if(invalido)return {error:invalido};
 const {error}=await supabase.rpc('actualizar_apertura_item',{p_item:id,p_revision:Number(fd.get('revision')),p_datos:datosCambioEstado(i,cambio)});
 if(error)return {error:error.message==='El registro cambió. Recarga antes de guardar.'?'Alguien más cambió este concepto mientras lo editabas. Cierra la ventana y vuelve a abrirlo para ver su estado actual.':error.message};
 const {data:guardado}=await supabase.from('apertura_items').select('*').eq('id',id).maybeSingle<ItemApertura>();
 revalidatePath('/aperturas','layout');
 return {ok:true,item:aItemChecklist(guardado??{...i,...cambio,cantidad:i.cantidad,recibido:i.recibido,revision:i.revision+1})};
}
