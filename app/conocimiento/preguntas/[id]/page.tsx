import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import type {Pregunta} from '@/lib/conocimiento';
import {Aviso} from '@/components/Aviso';
import {Formulario} from '@/app/activos/Formulario';
import {responder} from '../../acciones';
export default async function Duda({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
 const [{id},avisos]=await Promise.all([params,searchParams]);const {supabase,perfil}=await obtenerPerfil();const {data:p,error}=await supabase.from('kb_preguntas').select('*').eq('id',id).maybeSingle<Pregunta>();if(error)return <p className="aviso aviso-error">No se pudo consultar la pregunta.</p>;if(!p)notFound();
 return <><EncabezadoPagina titulo={p.titulo}/><Aviso {...avisos}/><section className="seccion"><h2>Pregunta</h2><p className="texto-libre">{p.contenido}</p></section><section className="seccion"><h2>Respuesta oficial</h2><p className="texto-libre">{p.respuesta??'Pendiente de respuesta por administración.'}</p>{p.respondido_en&&<small>Actualizada {new Date(p.respondido_en).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'})} · versión {p.revision}</small>}</section>{perfil.rol==='admin'&&<Formulario accion={responder} texto="Publicar respuesta oficial"><input type="hidden" name="id" value={p.id}/><input type="hidden" name="revision" value={p.revision}/><label className="campo">Respuesta<textarea name="respuesta" rows={8} required minLength={10} maxLength={10000} defaultValue={p.respuesta??''}/></label></Formulario>}</>;
}
