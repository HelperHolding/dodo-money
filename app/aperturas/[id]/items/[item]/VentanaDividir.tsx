"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icono} from '@/components/Icono';
import {BotonEnviar} from '@/components/BotonEnviar';
import {dividirItem} from '../../../acciones';
import type {OpcionResponsable} from './SelectorResponsable';

const MIN_PARTES=2,MAX_PARTES=10;

// Dividir un registro (HD-18): de 2 a 10 filas con nombre, responsable, inicio y fin. La original queda «No aplica»
// con «Dividida en …» y las nuevas heredan tipo, etapa y categoría. La acción redirige a la apertura con el aviso.
export function VentanaDividir({proyecto,item,vista,nombre,responsable,inicio,fin,opciones}:{proyecto:string;vista:string;item:string;nombre:string;responsable:string|null;inicio:string|null;fin:string|null;opciones:OpcionResponsable[]}) {
 const modal=useRef<HTMLDialogElement>(null);
 const [montado,setMontado]=useState(false),[filas,setFilas]=useState<number[]>([0,1]),[siguiente,setSiguiente]=useState(2);
 useEffect(()=>setMontado(true),[]);
 const agregar=()=>{if(filas.length>=MAX_PARTES)return;setFilas(f=>[...f,siguiente]);setSiguiente(n=>n+1);};
 const quitar=(k:number)=>{if(filas.length<=MIN_PARTES)return;setFilas(f=>f.filter(x=>x!==k));};
 return <>
  <button type="button" className="boton boton-secundario" onClick={()=>modal.current?.showModal()}>Dividir</button>
  {montado&&createPortal(<dialog ref={modal} className="compra-filtros-modal ap-dividir-modal" aria-labelledby="ap-dividir-titulo">
   <header className="compra-modal-encabezado"><div><h2 id="ap-dividir-titulo">Dividir «{nombre}»</h2><p>De {MIN_PARTES} a {MAX_PARTES} partes. Este registro quedará como «No aplica» con la liga a las nuevas.</p></div><button type="button" className="boton-icono compra-modal-cerrar" aria-label="Cerrar" onClick={()=>modal.current?.close()}><Icono nombre="cerrar" tamano={22}/></button></header>
   <form action={dividirItem} className="formulario">
    <input type="hidden" name="proyecto_id" value={proyecto}/><input type="hidden" name="item_id" value={item}/><input type="hidden" name="vista" value={vista}/>
    <ol className="ap-dividir-partes">{filas.map((k,n)=><li key={k} className="ap-dividir-parte">
     <fieldset><legend>Parte {n+1}</legend>
      <div className="campo"><label htmlFor={`parte-nombre-${k}`}>Nombre</label><input id={`parte-nombre-${k}`} name="parte_nombre" required maxLength={300} placeholder={`${nombre} (${n+1})`}/></div>
      <div className="rejilla">
       <div className="campo"><label htmlFor={`parte-resp-${k}`}>Responsable</label><select id={`parte-resp-${k}`} name="parte_responsable" defaultValue={responsable??''}><option value="">Sin asignar</option>{opciones.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select></div>
       <div className="campo"><label htmlFor={`parte-inicio-${k}`}>Inicio</label><input id={`parte-inicio-${k}`} name="parte_inicio" type="date" defaultValue={inicio??''}/></div>
       <div className="campo"><label htmlFor={`parte-fin-${k}`}>Fin</label><input id={`parte-fin-${k}`} name="parte_fin" type="date" defaultValue={fin??''}/></div>
      </div>
      {filas.length>MIN_PARTES&&<button type="button" className="boton-enlace" onClick={()=>quitar(k)}>Quitar parte {n+1}</button>}
     </fieldset>
    </li>)}</ol>
    {filas.length<MAX_PARTES&&<button type="button" className="boton boton-secundario" onClick={agregar}>Agregar parte</button>}
    <div className="acciones"><BotonEnviar pendiente="Dividiendo…" confirmar={`Se crearán ${filas.length} registros nuevos y este quedará como «No aplica». ¿Continuar?`}>Dividir en {filas.length}</BotonEnviar><button type="button" className="boton boton-secundario" onClick={()=>modal.current?.close()}>Cancelar</button></div>
   </form>
  </dialog>,document.body)}
 </>;
}
