"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import type {ContactoProveedor} from '@/lib/compras/contactos';
import {guardarContacto} from './contacto-acciones';
export function ContactosProveedor({proveedor,contactos,edita,disponible}:{proveedor:string;contactos:ContactoProveedor[];edita:boolean;disponible:boolean}) {
 const [editando,setEditando]=useState<ContactoProveedor|null|undefined>(undefined);
 const [ocupado,setOcupado]=useState(false),[mensaje,setMensaje]=useState('');
 const router=useRouter();
 async function guardar(id:string|null,fd:FormData) {
  setOcupado(true);setMensaje('');
  try {const r=await guardarContacto(proveedor,id,fd);if('error' in r)setMensaje(r.error??'No se pudo guardar.');else {setMensaje(r.ok);setEditando(undefined);router.refresh();}}
  catch {setMensaje('No se pudo guardar. Recarga la página y vuelve a intentar.');}
  finally {setOcupado(false);}
 }
 return <section className="seccion" aria-labelledby="contactos-titulo">
  <div className="encabezado"><h2 id="contactos-titulo">Contactos adicionales</h2>{edita&&disponible&&<button type="button" disabled={ocupado} onClick={()=>{setEditando(null);setMensaje('');}}>Agregar contacto</button>}</div>
  {!disponible?<p className="aviso aviso-error">Contactos no disponibles. Aplica la migración 0043 en Supabase.</p>:<>
  {!contactos.length?<p>Todavía no hay contactos adicionales.</p>:<ul className="lista-simple">{contactos.map(c=><li key={c.id}>
   <strong>{c.nombre}</strong>{c.puesto&&` · ${c.puesto}`}{!c.activo&&' · Inactivo'}
   <p>{c.telefono&&<span>Teléfono: {c.telefono} </span>}{c.correo&&<a href={`mailto:${c.correo}`}>{c.correo}</a>}</p>
   {edita&&<div className="acciones"><button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>{setEditando(c);setMensaje('');}}>Editar</button><button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>{const fd=new FormData();for(const campo of ['nombre','puesto','telefono','correo'] as const)fd.set(campo,c[campo]??'');fd.set('activo',c.activo?'no':'si');void guardar(c.id,fd);}}>{c.activo?'Desactivar':'Reactivar'}</button></div>}
  </li>)}</ul>}
  {edita&&editando!==undefined&&<form key={editando?.id??'nuevo'} className="formulario" onSubmit={e=>{e.preventDefault();void guardar(editando?.id??null,new FormData(e.currentTarget));}}>
   <h3>{editando?'Editar contacto':'Nuevo contacto'}</h3>
   <input type="hidden" name="activo" value={editando?.activo===false?'no':'si'}/>
   <div className="rejilla">
    <div className="campo"><label htmlFor="contacto-nombre">Nombre</label><input id="contacto-nombre" name="nombre" required maxLength={200} defaultValue={editando?.nombre??''}/></div>
    <div className="campo"><label htmlFor="contacto-puesto">Puesto o área</label><input id="contacto-puesto" name="puesto" maxLength={200} defaultValue={editando?.puesto??''}/></div>
    <div className="campo"><label htmlFor="contacto-telefono">Teléfono</label><input id="contacto-telefono" name="telefono" type="tel" maxLength={100} defaultValue={editando?.telefono??''}/></div>
    <div className="campo"><label htmlFor="contacto-correo">Correo</label><input id="contacto-correo" name="correo" type="email" maxLength={254} defaultValue={editando?.correo??''}/></div>
   </div><small>Agrega al menos un teléfono o correo.</small>
   <div className="acciones"><button disabled={ocupado}>{ocupado?'Guardando…':'Guardar contacto'}</button><button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>setEditando(undefined)}>Cancelar</button></div>
  </form>}</>}
  <p role="status">{mensaje}</p>
 </section>;
}
