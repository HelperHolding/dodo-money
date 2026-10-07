'use server';
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
export type Resultado = {error:string};
export async function guardar(_prev:Resultado,fd:FormData):Promise<Resultado> {
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))return {error:'Solo administración puede gestionar activos.'};
 const campos=['sucursal_id','nombre','categoria','estado','ubicacion','responsable','marca','modelo','serie','condicion','evidencia','adquirido','costo','garantia_hasta','proveedor_id','factura_id','apertura_item_id'];
 const {data,error}=await supabase.rpc('guardar_activo',{p_id:fd.get('id')||null,p_revision:Number(fd.get('revision')||0),p_datos:Object.fromEntries(campos.map(c=>[c,String(fd.get(c)??'')]))});
 if(error)return {error:error.message};
 revalidatePath('/activos','layout');revalidatePath('/aperturas','layout');redirect(`/activos/${data}?ok=Activo%20guardado`);
}
export async function valuar(_prev:Resultado,fd:FormData):Promise<Resultado> {
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))return {error:'Solo administración puede gestionar activos.'};
 const {error}=await supabase.rpc('valuar_activo',{p_activo:String(fd.get('activo_id')),p_fecha:String(fd.get('fecha')),p_valor:fd.get('valor')?Number(fd.get('valor')):null,p_criterio:String(fd.get('criterio')),p_evidencia:String(fd.get('evidencia')??'')});
 if(error)return {error:error.message};revalidatePath('/activos','layout');redirect(`/activos/${fd.get('activo_id')}?ok=Valuacion%20registrada`);
}
export async function mantener(_prev:Resultado,fd:FormData):Promise<Resultado> {
 const {supabase,perfil}=await obtenerPerfil();if(!puedeEditarCompras(perfil.rol))return {error:'Solo administración puede gestionar activos.'};
 const campos=['tipo','tarea','programado','estado','realizado','costo','tecnico','evidencia'];
 const {error}=await supabase.rpc('mantener_activo',{p_activo:String(fd.get('activo_id')),p_id:fd.get('id')||null,p_revision:Number(fd.get('revision')||0),p_datos:Object.fromEntries(campos.map(c=>[c,String(fd.get(c)??'')]))});
 if(error)return {error:error.message};revalidatePath('/activos','layout');redirect(`/activos/${fd.get('activo_id')}?ok=Mantenimiento%20guardado`);
}
