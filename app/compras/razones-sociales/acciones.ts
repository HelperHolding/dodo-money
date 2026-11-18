"use server";
import {revalidatePath} from 'next/cache';
import {clienteAdmin,volver} from '../servidor';
export async function altaRazonSocial(fd:FormData){
 const ruta='/compras/razones-sociales',db=await clienteAdmin(ruta);
 const {error}=await db.rpc('registrar_razon_social',{p_rfc:String(fd.get('rfc')??''),p_nombre:String(fd.get('razon_social')??''),p_sucursales:fd.getAll('sucursal').map(String),p_motivo:String(fd.get('motivo')??'')});
 if(error)volver(ruta,'error',error.message.includes('ya está registrado')?`${error.message} Para cambiar sus sucursales usa “Editar sucursales” en su tarjeta.`:error.message);
 revalidatePath('/compras','layout');volver(ruta,'ok','Razón social registrada.');
}
/** Cambia las sucursales autorizadas de una razón social existente; queda en su historial con el motivo. */
export async function editarSucursalesRazon(fd:FormData){
 const ruta='/compras/razones-sociales',db=await clienteAdmin(ruta);
 const {error}=await db.rpc('editar_sucursales_razon_social',{p_rfc:String(fd.get('rfc')??''),p_sucursales:fd.getAll('sucursal').map(String),p_motivo:String(fd.get('motivo')??'')});
 if(error)volver(ruta,'error',error.message.includes('editar_sucursales_razon_social')?'Falta correr la migración 20261118120000_editar_sucursales_razon_social en Supabase.':error.message);
 revalidatePath('/compras','layout');volver(ruta,'ok','Sucursales actualizadas.');
}
