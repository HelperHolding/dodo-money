"use server";
import {revalidatePath} from 'next/cache';
import {clienteAdmin,volver} from '../servidor';
export async function altaRazonSocial(fd:FormData){
 const ruta='/compras/razones-sociales',db=await clienteAdmin(ruta);
 const {error}=await db.rpc('registrar_razon_social',{p_rfc:String(fd.get('rfc')??''),p_nombre:String(fd.get('razon_social')??''),p_sucursales:fd.getAll('sucursal').map(String),p_motivo:String(fd.get('motivo')??'')});
 if(error)volver(ruta,'error',error.message);
 revalidatePath('/compras','layout');volver(ruta,'ok','Razón social registrada.');
}
