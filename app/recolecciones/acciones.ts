"use server";
import {obtenerPerfil} from '@/lib/contexto';
import {revalidatePath} from 'next/cache';
import {redirect} from 'next/navigation';
const texto=(fd:FormData,k:string)=>String(fd.get(k)??'').trim();
function volver(ruta:string,tipo:string,mensaje:string):never {redirect(`${ruta}${ruta.includes('?')?'&':'?'}${tipo}=${encodeURIComponent(mensaje)}`);}
function actualizar(){revalidatePath('/','layout');revalidatePath('/efectivo');revalidatePath('/recolecciones','layout');}
export async function registrarRecoleccion(fd:FormData){
 const {supabase}=await obtenerPerfil();
 const {data,error}=await supabase.rpc('registrar_recoleccion',{p_id:texto(fd,'solicitud'),p_sucursal:texto(fd,'sucursal'),p_desde:texto(fd,'desde'),p_hasta:texto(fd,'hasta'),p_monto:Number(texto(fd,'monto')),p_folio:texto(fd,'folio'),p_nota:texto(fd,'nota'),p_historicos_revisados:fd.get('historicos_revisados')==='si'});
 if(error)volver(`/recolecciones?sucursal=${texto(fd,'sucursal')}&desde=${texto(fd,'desde')}&hasta=${texto(fd,'hasta')}`,'error',error.message);
 actualizar();volver(`/recolecciones/${data}`,'ok','Entrega preparada. Un administrador distinto debe recogerla.');
}
export async function resolverRecoleccion(fd:FormData){
 const {supabase,perfil}=await obtenerPerfil(),id=texto(fd,'id'),ruta=`/recolecciones/${id}`;
 if(perfil.rol!=='admin')volver(ruta,'error','Solo administración recoge o rechaza entregas.');
 const {error}=await supabase.rpc('confirmar_movimiento',{p_id:id,p_aceptar:fd.get('aceptar')==='si'});
 if(error)volver(ruta,'error',error.message);actualizar();volver(ruta,'ok',fd.get('aceptar')==='si'?'Efectivo recogido; queda en camino a corporativo.':'Entrega rechazada; los cierres vuelven a quedar disponibles.');
}
export async function recibirRecoleccion(fd:FormData){
 const {supabase}=await obtenerPerfil(),id=texto(fd,'id'),ruta=`/recolecciones/${id}`;
 const {error}=await supabase.rpc('recibir_recoleccion',{p_id:id,p_contado:Number(texto(fd,'contado')),p_nota:texto(fd,'nota')});
 if(error)volver(ruta,'error',error.message);actualizar();volver(ruta,'ok','Conteo recibido y registrado. Si difiere de la entrega, queda marcado como no cuadrado.');
}
