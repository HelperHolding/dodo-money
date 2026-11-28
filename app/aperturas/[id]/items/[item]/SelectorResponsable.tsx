"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icono} from '@/components/Icono';
import {crearResponsableExterno} from '../../../acciones';

export type OpcionResponsable={id:string;nombre:string};

// Responsable del registro desde el catálogo (HD-17), con «+ Nuevo externo» para dar de alta a alguien sin usuario.
// La ventana va en un portal fuera del formulario de la ficha: no tiene formulario propio para no anidarlo.
export function SelectorResponsable({opciones,valor,legado}:{opciones:OpcionResponsable[];valor:string|null;legado:string|null}) {
 const modal=useRef<HTMLDialogElement>(null);
 const [lista,setLista]=useState(opciones),[elegido,setElegido]=useState(valor??''),[montado,setMontado]=useState(false);
 const [nombre,setNombre]=useState(''),[ocupado,setOcupado]=useState(false),[error,setError]=useState('');
 useEffect(()=>setMontado(true),[]);
 const agregar=async()=>{
  const limpio=nombre.trim();if(!limpio){setError('Escribe el nombre del responsable externo.');return;}
  setOcupado(true);setError('');
  try{const r=await crearResponsableExterno(limpio);if('error' in r){setError(r.error);return;}
   setLista(l=>[...l,r].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es')));setElegido(r.id);setNombre('');modal.current?.close();}
  catch{setError('No se pudo agregar. Recarga la página e intenta de nuevo.');}finally{setOcupado(false);}
 };
 return <div className="campo"><label htmlFor="responsable_id">Responsable de este registro</label>
  <select id="responsable_id" name="responsable_id" value={elegido} onChange={e=>setElegido(e.target.value)}>
   <option value="">Sin asignar</option>{lista.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}
  </select>
  {!valor&&legado&&<small>Antes: «{legado}». Elige a la persona del catálogo para que el calendario la agrupe.</small>}
  <button type="button" className="boton-enlace" onClick={()=>{setError('');modal.current?.showModal();}}>+ Nuevo externo</button>
  {montado&&createPortal(<dialog ref={modal} className="compra-filtros-modal ap-externo-modal" aria-labelledby="ap-externo-titulo" onCancel={e=>{if(ocupado)e.preventDefault();}}>
   <header className="compra-modal-encabezado"><div><h2 id="ap-externo-titulo">Nuevo responsable externo</h2><p>Para proveedores o personas sin usuario en Dodo MX.</p></div><button type="button" className="boton-icono compra-modal-cerrar" disabled={ocupado} aria-label="Cerrar" onClick={()=>modal.current?.close()}><Icono nombre="cerrar" tamano={22}/></button></header>
   <div className="formulario">
    <div className="campo"><label htmlFor="ap-externo-nombre">Nombre</label><input id="ap-externo-nombre" maxLength={80} value={nombre} onChange={e=>setNombre(e.target.value)} disabled={ocupado} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void agregar();}}}/></div>
    {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
    <div className="acciones"><button type="button" className="boton" disabled={ocupado} onClick={()=>void agregar()}>{ocupado?'Guardando…':'Agregar y elegir'}</button><button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>modal.current?.close()}>Cancelar</button></div>
   </div>
  </dialog>,document.body)}
 </div>;
}
