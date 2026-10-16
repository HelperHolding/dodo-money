"use client";
import {useRef,useState,useId,useEffect} from 'react';
import Link from 'next/link';
import {fechaTexto} from '@/lib/formato';
type Datos={proveedor:{id:string;razon_social:string;nombre_comercial:string|null;rfc:string;banco:string|null;clabe:string|null;cuenta:string|null;contacto_nombre:string|null;correo:string|null;telefono:string|null;activo:boolean};documentos:{tipo:string;nombre:string;fecha:string|null;disponible:boolean;url:string|null;imagen:boolean}[]};
export function DatosProveedor({id}:{id:string}){
 const modal=useRef<HTMLDialogElement>(null),peticion=useRef<AbortController|null>(null),titulo=useId();
 const [datos,setDatos]=useState<Datos|null>(null),[error,setError]=useState(''),[cargando,setCargando]=useState(false),[elegido,setElegido]=useState('');
 useEffect(()=>()=>peticion.current?.abort(),[]);
 async function abrir(){
  if(!modal.current?.open)modal.current?.showModal();peticion.current?.abort();const control=new AbortController();peticion.current=control;
  setCargando(true);setError('');setDatos(null);setElegido('');
  try{const r=await fetch(`/compras/proveedores/${encodeURIComponent(id)}/resumen`,{cache:'no-store',signal:control.signal});const d=await r.json().catch(()=>({error:'Recarga la página y vuelve a consultar; la sesión pudo haber vencido.'}));if(!r.ok||!d.proveedor)throw Error(d.error??'No se pudo consultar el proveedor.');if(control.signal.aborted)return;setDatos(d);setElegido(d.documentos.find((x:Datos['documentos'][number])=>x.url)?.tipo??'');}
  catch(e){if(!control.signal.aborted)setError(e instanceof Error?e.message:'No se pudo consultar el proveedor.');}
  finally{if(!control.signal.aborted)setCargando(false);}
 }
 const doc=datos?.documentos.find(d=>d.tipo===elegido);
 return <><button type="button" className="boton boton-secundario" aria-haspopup="dialog" onClick={abrir}>Datos del proveedor</button>
 <dialog ref={modal} className="compra-filtros-modal proveedor-datos-modal" aria-labelledby={titulo} onClose={()=>peticion.current?.abort()} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close();}}}>
 <header className="compra-modal-encabezado"><h2 id={titulo}>Datos del proveedor</h2><button type="button" className="boton boton-secundario" onClick={()=>modal.current?.close()}>Cerrar</button></header>
 {cargando&&<p role="status">Consultando datos y documentos…</p>}{error&&<div role="alert"><p>{error}</p><button type="button" className="boton boton-secundario" onClick={abrir}>Reintentar</button></div>}
 {datos&&<><h3>{datos.proveedor.nombre_comercial??datos.proveedor.razon_social}{!datos.proveedor.activo?' · inactivo':''}</h3><dl className="tarjeta-datos"><dt>Razón social</dt><dd>{datos.proveedor.razon_social}</dd><dt>RFC</dt><dd>{datos.proveedor.rfc}</dd><dt>Banco</dt><dd>{datos.proveedor.banco??'Sin registrar'}</dd><dt>CLABE</dt><dd>{datos.proveedor.clabe??'Sin registrar'}</dd><dt>Cuenta</dt><dd>{datos.proveedor.cuenta??'Sin registrar'}</dd><dt>Contacto</dt><dd>{[datos.proveedor.contacto_nombre,datos.proveedor.telefono,datos.proveedor.correo].filter(Boolean).join(' · ')||'Sin registrar'}</dd></dl>
 <div className="proveedor-documentos-resumen">{datos.documentos.map(d=><section key={d.tipo} className="seccion"><h4>{d.nombre}</h4><p>{d.fecha?`Fecha del documento: ${fechaTexto(d.fecha)}`:'Sin documento registrado'}</p>{d.url?<div className="acciones"><button type="button" className="boton boton-secundario" aria-pressed={elegido===d.tipo} onClick={()=>setElegido(d.tipo)}>Ver aquí</button><a className="boton boton-secundario" href={d.url} target="_blank" rel="noreferrer">Abrir documento</a></div>:d.disponible?<p role="status">El archivo no está disponible en este momento. Vuelve a consultar.</p>:null}</section>)}</div>
 {doc?.url&&<section aria-label={`Vista previa: ${doc.nombre}`}><h3>{doc.nombre}</h3>{doc.imagen?<img className="proveedor-documento-imagen" src={doc.url} alt={doc.nombre} referrerPolicy="no-referrer"/>:<iframe className="proveedor-documento-preview" title={doc.nombre} src={doc.url} referrerPolicy="no-referrer"/>}</section>}
 <p><Link href={`/compras/proveedores/${datos.proveedor.id}`}>Abrir ficha completa del proveedor</Link></p></>}
 </dialog></>;
}
