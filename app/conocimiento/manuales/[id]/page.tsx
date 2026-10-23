import { EncabezadoPagina } from "@/components/EncabezadoPagina";
import {randomUUID} from 'node:crypto';
import {notFound} from 'next/navigation';
import {obtenerPerfil} from '@/lib/contexto';
import type {Articulo,FotoManual} from '@/lib/conocimiento';
import {Aviso} from '@/components/Aviso';
import {BotonEnviar} from '@/components/BotonEnviar';
import {Formulario} from '@/app/activos/Formulario';
import {CamposManual} from '../../CamposManual';
import {CampoFoto} from '../../CampoFoto';
import {guardarManual,agregarFoto,retirarFoto} from '../../acciones';
export default async function Manual({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{ok?:string;error?:string}>}) {
 const [{id},avisos]=await Promise.all([params,searchParams]);const {supabase,perfil}=await obtenerPerfil();const {data:a,error}=await supabase.from('kb_articulos').select('*').eq('id',id).maybeSingle<Articulo>();if(error)return <p className="aviso aviso-error">No se pudo consultar el manual.</p>;if(!a)notFound();
 const {data:fotos}=await supabase.from('kb_fotos').select('id,nombre,descripcion,creado_en').eq('articulo_id',id).not('confirmado_en','is',null).order('creado_en').returns<FotoManual[]>();
 const admin=perfil.rol==='admin';
 return <><EncabezadoPagina titulo={a.titulo} descripcion={<>{a.categoria} · versión {a.revision} · actualizado {new Date(a.actualizado_en).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City'})}{!a.publicado?' · Borrador':''}</>}/><Aviso {...avisos}/><article className="seccion texto-libre" >{a.contenido}</article>
 {(!!fotos?.length||admin)&&<section className="seccion"><h2>Fotos · {fotos?.length??0}</h2>{!fotos?.length?<p>Sin fotos. Agrega fotos de referencia; en el texto puedes citarlas como «ver foto 1».</p>:<ol className="galeria-manual">{fotos.map((f,i)=><li key={f.id}><a href={`/conocimiento/fotos/${f.id}`} target="_blank" rel="noopener"><img src={`/conocimiento/fotos/${f.id}`} alt={f.descripcion||f.nombre} loading="lazy"/></a><small><strong>Foto {i+1}</strong>{f.descripcion&&` · ${f.descripcion}`}</small>{admin&&<form action={retirarFoto}><input type="hidden" name="articulo_id" value={id}/><input type="hidden" name="foto_id" value={f.id}/><BotonEnviar className="boton boton-secundario" pendiente="Retirando…" confirmar={`¿Retirar la foto ${i+1} del manual?`}>Retirar</BotonEnviar></form>}</li>)}</ol>}
  {admin&&<details><summary className="boton boton-secundario">Agregar foto</summary><form action={agregarFoto} className="formulario"><input type="hidden" name="articulo_id" value={id}/><input type="hidden" name="solicitud" value={randomUUID()}/><CampoFoto/><label className="campo">Descripción opcional<input name="descripcion" maxLength={300} placeholder="Placa del medidor: 3F 4H"/></label><p className="saldo-nota">JPG, PNG o WebP. Las fotos grandes del celular se reducen solas. La ve quien puede leer este manual.</p><BotonEnviar pendiente="Subiendo…">Guardar foto</BotonEnviar></form></details>}
 </section>}
 {admin&&<details className="seccion"><summary>Editar manual</summary><Formulario accion={guardarManual}><CamposManual a={a}/></Formulario></details>}</>;
}
