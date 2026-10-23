'use server';
import {obtenerPerfil} from '@/lib/contexto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import type {Resultado} from '@/app/activos/acciones';
import {createHash} from 'node:crypto';
import {MAX_ADJUNTO,validarImagen} from '@/lib/compras/adjuntos';
export async function guardarManual(_prev:Resultado,fd:FormData):Promise<Resultado> {
 const {supabase,perfil}=await obtenerPerfil();if(perfil.rol!=='admin')return {error:'Solo administración publica manuales.'};
 const {data,error}=await supabase.rpc('kb_guardar_articulo',{p_id:fd.get('id')||null,p_revision:Number(fd.get('revision')||0),p_titulo:String(fd.get('titulo')),p_categoria:String(fd.get('categoria')),p_contenido:String(fd.get('contenido')),p_roles:fd.getAll('roles').map(String),p_publicado:fd.get('publicado')==='on'});
 if(error)return {error:error.message};revalidatePath('/conocimiento','layout');redirect(`/conocimiento/manuales/${data}?ok=Manual%20guardado`);
}
export async function agregarFoto(fd:FormData) {
 const {supabase,perfil}=await obtenerPerfil();
 const id=String(fd.get('articulo_id'));if(perfil.rol!=='admin'||!/^[0-9a-f-]{36}$/i.test(id))redirect('/conocimiento');
 const ruta=`/conocimiento/manuales/${id}`;const volver=(error:string):never=>redirect(`${ruta}?error=${encodeURIComponent(error)}`);
 const archivo=fd.get('foto');
 if(!(archivo instanceof File)||!archivo.size||archivo.size>MAX_ADJUNTO)return volver('Selecciona una foto de hasta 4 MB.');
 const bytes=new Uint8Array(await archivo.arrayBuffer());
 let formato:ReturnType<typeof validarImagen>;
 try {formato=validarImagen(archivo.name,bytes);}catch(e){return volver(e instanceof Error?e.message:'Foto inválida.');}
 const descripcion=String(fd.get('descripcion')??'').trim();if(descripcion.length>300)return volver('La descripción puede tener hasta 300 caracteres.');
 const solicitud=String(fd.get('solicitud')),hash=createHash('sha256').update(bytes).digest('hex');
 const {data,error}=await supabase.rpc('kb_preparar_foto',{p_id:solicitud,p_articulo:id,p_nombre:formato.nombre,p_extension:formato.extension,p_mime:formato.mime,p_bytes:bytes.length,p_sha256:hash,p_descripcion:descripcion});
 if(error)return volver(error.message);
 const foto=data as {ruta:string;disponible:boolean};
 if(!foto.disponible) {
  const subida=await supabase.storage.from('manuales').upload(foto.ruta,bytes,{contentType:formato.mime,upsert:false});
  if(subida.error) {
   // Reintento tras una respuesta perdida: la foto ya existe, no se sobrescribe.
   const previa=await supabase.storage.from('manuales').download(foto.ruta);
   if(previa.error||!previa.data)return volver('No se pudo subir la foto. Vuelve a intentarlo.');
   if(createHash('sha256').update(new Uint8Array(await previa.data.arrayBuffer())).digest('hex')!==hash)return volver('La solicitud ya tiene otra foto. Recarga antes de agregarla.');
  }
  const confirmada=await supabase.rpc('kb_confirmar_foto',{p_id:solicitud});
  if(confirmada.error)return volver('La foto se subió, pero no pudo confirmarse y no aparece en el manual. Vuelve a intentarlo.');
 }
 revalidatePath(ruta);redirect(`${ruta}?ok=Foto%20agregada`);
}
export async function retirarFoto(fd:FormData) {
 const {supabase,perfil}=await obtenerPerfil();
 const id=String(fd.get('articulo_id'));if(perfil.rol!=='admin'||!/^[0-9a-f-]{36}$/i.test(id))redirect('/conocimiento');
 const ruta=`/conocimiento/manuales/${id}`;
 const {error}=await supabase.rpc('kb_retirar_foto',{p_id:String(fd.get('foto_id'))});
 if(error)redirect(`${ruta}?error=${encodeURIComponent(error.message)}`);
 revalidatePath(ruta);redirect(`${ruta}?ok=Foto%20retirada`);
}
export async function preguntar(_prev:Resultado,fd:FormData):Promise<Resultado> {
 const {supabase}=await obtenerPerfil();const {data,error}=await supabase.rpc('kb_preguntar',{p_titulo:String(fd.get('titulo')),p_contenido:String(fd.get('contenido'))});
 if(error)return {error:error.message};revalidatePath('/conocimiento','layout');redirect(`/conocimiento/preguntas/${data}?ok=Pregunta%20publicada`);
}
export async function responder(_prev:Resultado,fd:FormData):Promise<Resultado> {
 const {supabase,perfil}=await obtenerPerfil();if(perfil.rol!=='admin')return {error:'Solo administración publica respuestas oficiales.'};
 const id=String(fd.get('id'));const {error}=await supabase.rpc('kb_responder',{p_id:id,p_revision:Number(fd.get('revision')),p_respuesta:String(fd.get('respuesta'))});
 if(error)return {error:error.message};revalidatePath('/conocimiento','layout');redirect(`/conocimiento/preguntas/${id}?ok=Respuesta%20publicada`);
}
