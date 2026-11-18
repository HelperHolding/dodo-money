"use server";
import {createHash,randomUUID} from 'node:crypto';
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {leerCfdi} from '@/lib/compras/cfdi';
import {revisarArchivos} from '@/lib/compras/sustitucionCfdi';
import {clienteAdmin,volver} from '../servidor';
export type VistaSustitucionCfdi={error?:string;datos?:{solicitud:string;uuid:string;emisor:string;folio:string;fecha:string;metodo:string|null;total:number;relacionados:string[];
 original:Record<string,number|string|null>;pagado:number;complementos:{cantidad:number;monto:number};pdf:boolean;importes:Record<string,unknown>}}|null;

export async function prepararSustitucionCfdi(_anterior:VistaSustitucionCfdi,fd:FormData):Promise<VistaSustitucionCfdi> {
 const {supabase,perfil}=await obtenerPerfil();
 if(perfil.rol!=='admin')return {error:'Solo administración puede sustituir el CFDI de una factura.'};
 const xml=fd.get('xml'),pdfCampo=fd.get('pdf');
 const pdf=pdfCampo instanceof File&&pdfCampo.size>0?pdfCampo:null;
 const problema=revisarArchivos(xml instanceof File?xml:null,pdf);
 if(problema)return {error:problema};
 const bytes=new Uint8Array(await (xml as File).arrayBuffer());
 const leido=leerCfdi(new TextDecoder().decode(bytes));
 if('error' in leido)return {error:leido.error};
 const pdfBytes=pdf?new Uint8Array(await pdf.arrayBuffer()):null;
 const solicitud=randomUUID();
 const {data,error}=await supabase.rpc('preparar_sustitucion_cfdi',{p_id:solicitud,p_factura:String(fd.get('id')),p_cfdi:leido.cfdi,p_motivo:String(fd.get('motivo')??'').trim(),
  p_bytes:bytes.length,p_sha256:createHash('sha256').update(bytes).digest('hex'),p_pdf_bytes:pdfBytes?.length??null});
 if(error)return {error:error.message};
 const r=data as {ruta:string;ruta_pdf:string|null;original:Record<string,number|string|null>;pagado:number;complementos:{cantidad:number;monto:number}};
 const subida=await supabase.storage.from('facturas').upload(r.ruta,bytes,{contentType:'application/xml',upsert:false});
 if(subida.error)return {error:'No se pudo subir el XML. La factura no cambió. Vuelve a intentarlo.'};
 if(pdfBytes&&r.ruta_pdf){
  const s=await supabase.storage.from('facturas').upload(r.ruta_pdf,pdfBytes,{contentType:'application/pdf',upsert:false});
  if(s.error)return {error:'No se pudo subir el PDF. La factura no cambió. Vuelve a intentarlo.'};
 }
 const c=leido.cfdi;
 return {datos:{solicitud,uuid:c.uuid,emisor:c.nombre_emisor,folio:`${c.serie??''}${c.folio??''}`,fecha:c.fecha,metodo:c.metodo_pago,total:c.total,relacionados:c.uuids_relacionados,
  original:r.original,pagado:Number(r.pagado),complementos:{cantidad:Number(r.complementos?.cantidad??0),monto:Number(r.complementos?.monto??0)},pdf:!!pdfBytes,importes:c}};
}

export async function confirmarSustitucionCfdi(fd:FormData) {
 const id=String(fd.get('id')),ruta=`/compras/facturas/${id}`;
 const supabase=await clienteAdmin(ruta);
 // La factura la determina la reserva privada, no el id del formulario.
 const {data,error}=await supabase.rpc('confirmar_sustitucion_cfdi',{p_id:String(fd.get('solicitud')),p_aceptar_ajuste:fd.get('aceptar_ajuste')==='on'});
 if(error)volver(ruta,'error',error.message);
 revalidatePath('/compras','layout');revalidatePath('/finanzas','layout');revalidatePath('/recepciones');
 volver(`/compras/facturas/${data}`,'ok','CFDI sustituido. Se conservaron pagos, órdenes, recepciones y el CFDI anterior en el historial.');
}
