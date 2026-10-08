"use server";
import {obtenerPerfil} from '@/lib/contexto';
import {puedeEditarCompras} from '@/lib/roles';
import {leerContacto} from '@/lib/compras/contactos';
import {revalidatePath} from 'next/cache';
export async function guardarContacto(proveedor:string,id:string|null,fd:FormData) {
 const {supabase,perfil}=await obtenerPerfil();
 if(!puedeEditarCompras(perfil.rol))return {error:'Solo administración puede gestionar contactos.'};
 const r=leerContacto(c=>String(fd.get(c)??''));
 if('error' in r)return {error:r.error};
 const {error}=await supabase.rpc('guardar_contacto_proveedor',{p_proveedor:proveedor,p_id:id,p_nombre:r.datos.nombre,p_puesto:r.datos.puesto,p_telefono:r.datos.telefono,p_correo:r.datos.correo,p_activo:fd.get('activo')!=='no'});
 if(error)return {error:'No se pudo guardar el contacto. Vuelve a intentar.'};
 revalidatePath(`/compras/proveedores/${proveedor}`);
 return {ok:'Contacto guardado.'};
}
