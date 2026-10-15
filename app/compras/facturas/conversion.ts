"use server";
import {createHash,randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {leerCfdi} from '@/lib/compras/cfdi';
import {clienteAdmin,volver} from '../servidor';
export type VistaXmlPrefactura={error?:string;datos?:{solicitud:string;uuid:string;emisor:string;folio:string;fecha:string;total:number;original:Record<string,number>;pagado:number;importes:Record<string,unknown>}}|null;
export async function prepararXmlPrefactura(_anterior:VistaXmlPrefactura,fd:FormData):Promise<VistaXmlPrefactura> {
 const {supabase,perfil}=await obtenerPerfil();
 if(perfil.rol!=='admin')return {error:'Solo administración puede convertir una prefactura.'};
 const archivo=fd.get('xml');
 if(!(archivo instanceof File)||!archivo.name.toLowerCase().endsWith('.xml')||!archivo.size||archivo.size>4*1024*1024)return {error:'Selecciona un XML de hasta 4 MB.'};
 const bytes=new Uint8Array(await archivo.arrayBuffer());
 const leido=leerCfdi(new TextDecoder().decode(bytes));
 if('error' in leido)return {error:leido.error};
 const solicitud=randomUUID();
 const {data,error}=await supabase.rpc('preparar_cfdi_prefactura',{p_id:solicitud,p_factura:String(fd.get('id')),p_cfdi:leido.cfdi,p_motivo:String(fd.get('motivo')??'').trim(),p_bytes:bytes.length,p_sha256:createHash('sha256').update(bytes).digest('hex')});
 if(error)return {error:error.message};
 const ruta=(data as {ruta:string}).ruta;
 const subida=await supabase.storage.from('facturas').upload(ruta,bytes,{contentType:'application/xml',upsert:false});
 if(subida.error)return {error:'No se pudo subir el XML. La prefactura no cambió. Vuelve a intentarlo.'};
 return {datos:{solicitud,uuid:leido.cfdi.uuid,emisor:leido.cfdi.nombre_emisor,folio:`${leido.cfdi.serie??''}${leido.cfdi.folio??''}`,fecha:leido.cfdi.fecha,total:leido.cfdi.total,original:(data as {original:Record<string,number>}).original,pagado:Number((data as {pagado:number}).pagado),importes:leido.cfdi}};
}
export async function confirmarXmlPrefactura(fd:FormData) {
 const id=String(fd.get('id')),ruta=`/compras/facturas/${id}`;
 const supabase=await clienteAdmin(ruta);
 // No se confía en el id del formulario para elegir la factura: lo determina la reserva privada.
 const {data,error}=await supabase.rpc('confirmar_cfdi_prefactura',{p_id:String(fd.get('solicitud')),p_aceptar_ajuste:fd.get('aceptar_ajuste')==='on'});
 if(error)volver(ruta,'error',error.message);
 revalidatePath('/compras','layout');revalidatePath('/finanzas','layout');revalidatePath('/recepciones');
 volver(`/compras/facturas/${data}`,'ok','Prefactura convertida a factura. Se conservaron pagos, programación, recepciones e historial.');
}
