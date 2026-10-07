'use server';
import {obtenerPerfil} from '@/lib/contexto';
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import type {Resultado} from '@/app/activos/acciones';
export async function guardarManual(_prev:Resultado,fd:FormData):Promise<Resultado> {
 const {supabase,perfil}=await obtenerPerfil();if(perfil.rol!=='admin')return {error:'Solo administración publica manuales.'};
 const {data,error}=await supabase.rpc('kb_guardar_articulo',{p_id:fd.get('id')||null,p_revision:Number(fd.get('revision')||0),p_titulo:String(fd.get('titulo')),p_categoria:String(fd.get('categoria')),p_contenido:String(fd.get('contenido')),p_roles:fd.getAll('roles').map(String),p_publicado:fd.get('publicado')==='on'});
 if(error)return {error:error.message};revalidatePath('/conocimiento','layout');redirect(`/conocimiento/manuales/${data}?ok=Manual%20guardado`);
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
