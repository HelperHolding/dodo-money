"use server";
import {createHash} from 'node:crypto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {obtenerPerfil} from '@/lib/contexto';
import {validarAdjunto,MAX_ADJUNTO} from '@/lib/compras/adjuntos';
export async function adjuntarDocumento(fd:FormData) {
  const {supabase,perfil}=await obtenerPerfil();
  if(perfil.rol!=='admin')redirect('/compras/documentos');
  const tipo=String(fd.get('tipo')),id=String(fd.get('documento_id'));
  if(!['orden','factura'].includes(tipo)||!/^[0-9a-f-]{36}$/i.test(id))redirect('/compras/documentos');
  const ruta=`/compras/${tipo==='orden'?'ordenes':'facturas'}/${id}`;
  const volver=(error:string):never=>redirect(`${ruta}?error=${encodeURIComponent(error)}`);
  const archivo=fd.get('archivo');
  if(!(archivo instanceof File)||!archivo.size||archivo.size>MAX_ADJUNTO)return volver('Selecciona un archivo de hasta 4 MB.');
  const bytes=new Uint8Array(await archivo.arrayBuffer());
  let formato:ReturnType<typeof validarAdjunto>;
  try {formato=validarAdjunto(archivo.name,bytes);}catch(e){return volver(e instanceof Error?e.message:'Archivo inválido.');}
  const descripcion=String(fd.get('descripcion')??'').trim();
  if(descripcion.length>500)return volver('La descripción puede tener hasta 500 caracteres.');
  const {data,error}=await supabase.rpc('preparar_adjunto_compra',{p_id:String(fd.get('solicitud')),p_tipo:tipo,p_documento:id,p_nombre:formato.nombre,p_extension:formato.extension,p_mime:formato.mime,p_bytes:bytes.length,p_sha256:createHash('sha256').update(bytes).digest('hex'),p_descripcion:descripcion});
  if(error)return volver(error.message);
  const adjunto=data as {ruta:string;disponible:boolean};
  if(!adjunto.disponible) {
    const subido=await supabase.storage.from('adjuntos-compras').upload(adjunto.ruta,bytes,{contentType:formato.mime,upsert:false});
    if(subido.error) {
      // Reintento tras una respuesta perdida: el archivo ya existe, no se sobrescribe.
      const previo=await supabase.storage.from('adjuntos-compras').download(adjunto.ruta);
      if(previo.error||!previo.data)return volver('No se pudo subir el archivo. Vuelve a intentarlo.');
      const hash=createHash('sha256').update(new Uint8Array(await previo.data.arrayBuffer())).digest('hex');
      if(hash!==createHash('sha256').update(bytes).digest('hex'))return volver('La solicitud ya tiene otro archivo. Recarga antes de adjuntar.');
    }
    const confirmado=await supabase.rpc('confirmar_adjunto_compra',{p_id:String(fd.get('solicitud'))});
    if(confirmado.error)return volver('El archivo se subió, pero no pudo confirmarse y permanece privado. No aparece como adjunto; consulta a administración antes de volver a cargarlo.');
  }
  revalidatePath(ruta);
  redirect(`${ruta}?ok=${encodeURIComponent('Documento adjuntado. Se conservaron estado, importes y pagos.')}`);
}

export async function retirarDocumento(fd:FormData) {
 const {supabase,perfil}=await obtenerPerfil();
 if(perfil.rol!=='admin')redirect('/compras/documentos');
 const tipo=String(fd.get('tipo')),id=String(fd.get('documento_id'));
 if(!['orden','factura'].includes(tipo)||!/^[0-9a-f-]{36}$/i.test(id))redirect('/compras/documentos');
 const ruta=`/compras/${tipo==='orden'?'ordenes':'facturas'}/${id}`;
 if(fd.get('confirmar')!=='si')redirect(`${ruta}?error=${encodeURIComponent('Confirma que deseas retirar el adjunto.')}`);
 const {error}=await supabase.rpc('retirar_adjunto_compra',{p_id:String(fd.get('adjunto_id')),p_tipo:tipo,p_documento:id,p_motivo:String(fd.get('motivo')??'').trim()});
 if(error)redirect(`${ruta}?error=${encodeURIComponent(error.message)}`);
 revalidatePath(ruta);revalidatePath('/compras/pagos');
 redirect(`${ruta}?ok=${encodeURIComponent('Adjunto retirado. El motivo quedó en el historial.')}`);
}
