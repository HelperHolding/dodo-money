import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import type {Articulo} from '@/lib/conocimiento';
import {Aviso} from '@/components/Aviso';
import {Formulario} from '@/app/activos/Formulario';
import {CamposManual} from '../../CamposManual';
import {guardarManual} from '../../acciones';
export default async function Manual({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
 const [{id},avisos]=await Promise.all([params,searchParams]);const {supabase,perfil}=await obtenerPerfil();const {data:a,error}=await supabase.from('kb_articulos').select('*').eq('id',id).maybeSingle<Articulo>();if(error)return <p className="aviso aviso-error">No se pudo consultar el manual.</p>;if(!a)notFound();
 return <><h1>{a.titulo}</h1><p>{a.categoria} · versión {a.revision} · actualizado {new Date(a.actualizado_en).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'})}{!a.publicado?' · Borrador':''}</p><Aviso {...avisos}/><article className="seccion texto-libre" >{a.contenido}</article>{perfil.rol==='admin'&&<details className="seccion"><summary>Editar manual</summary><Formulario accion={guardarManual}><CamposManual a={a}/></Formulario></details>}</>;
}
