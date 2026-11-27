"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Icono} from '@/components/Icono';
import {nombreEstado,estadosPara,requisitosEstado,validarCambioEstado,type ItemChecklist} from '@/lib/aperturas';
import {cambiarEstadoApertura} from './cambiarEstado';

// Ventana para cambiar el estado de un concepto. La comparten el checklist y el plano: misma validación y misma acción.
export function VentanaEstado({concepto:c,alCerrar,alGuardar}:{concepto:ItemChecklist|null;alCerrar:()=>void;alGuardar:(i:ItemChecklist)=>void}) {
 const modal=useRef<HTMLDialogElement>(null);
 const [montado,setMontado]=useState(false),[ocupado,setOcupado]=useState(false),[error,setError]=useState('');
 const [estado,setEstado]=useState(''),[evidencia,setEvidencia]=useState(''),[notas,setNotas]=useState(''),[cantidad,setCantidad]=useState(''),[recibido,setRecibido]=useState('');
 useEffect(()=>setMontado(true),[]);
 useEffect(()=>{if(!c||!montado)return;
  setEstado(c.estado);setEvidencia(c.evidencia??'');setNotas(c.notas??'');setCantidad(c.cantidad===null?'':String(c.cantidad));setRecibido(String(c.recibido??0));setError('');
  if(!modal.current?.open)modal.current?.showModal();},[c,montado]);
 if(!montado)return null;
 const r=c?requisitosEstado(c.tipo,estado):null;
 const elegir=(e:string)=>{setEstado(e);setError('');
  // Recibir completo, instalar o verificar implica tener todo: se propone la cantidad completa.
  if(c&&requisitosEstado(c.tipo,e).completa&&cantidad&&Number(recibido||0)<Number(cantidad))setRecibido(cantidad);};
 return createPortal(<dialog ref={modal} className="compra-filtros-modal ap-estado-modal" aria-labelledby="ap-estado-titulo" onClose={alCerrar} onCancel={e=>{if(ocupado)e.preventDefault();}}>
  {c&&<><header className="compra-modal-encabezado"><div><h2 id="ap-estado-titulo">{c.nombre}</h2><p>Estado actual: {nombreEstado(c)}</p></div><button type="button" className="boton-icono compra-modal-cerrar" disabled={ocupado} aria-label="Cerrar" onClick={()=>modal.current?.close()}><Icono nombre="cerrar" tamano={22}/></button></header>
  <form className="formulario" onSubmit={async e=>{e.preventDefault();if(ocupado)return;
   const invalido=validarCambioEstado(c.tipo,{estado,evidencia,cantidad,recibido});if(invalido){setError(invalido);return;}
   const fd=new FormData(e.currentTarget);setOcupado(true);setError('');
   try{const res=await cambiarEstadoApertura(fd);if('error' in res){setError(res.error);return;}alGuardar(res.item);modal.current?.close();}
   catch{setError('No se pudo confirmar el cambio. Recarga la página antes de intentar de nuevo.');}finally{setOcupado(false);}}}>
   <input type="hidden" name="item_id" value={c.id}/><input type="hidden" name="revision" value={c.revision}/>
   <fieldset className="ap-estados" disabled={ocupado}><legend>Nuevo estado</legend>{estadosPara(c.tipo).map(e=><label key={e} data-activo={estado===e}><input type="radio" name="estado" value={e} checked={estado===e} onChange={()=>elegir(e)}/>{nombreEstado({...c,estado:e})}</label>)}</fieldset>
   {r?.cantidades&&<div className="rejilla"><div className="campo"><label htmlFor="ap-cantidad">Cantidad necesaria{c.unidad?` (${c.unidad})`:''}</label><input id="ap-cantidad" name="cantidad" type="number" min="0.0001" max="99999999" step="0.0001" required value={cantidad} onChange={e=>setCantidad(e.target.value)} disabled={ocupado}/></div><div className="campo"><label htmlFor="ap-recibido">Cantidad recibida</label><input id="ap-recibido" name="recibido" type="number" min="0" max="99999999" step="0.0001" value={recibido} onChange={e=>setRecibido(e.target.value)} disabled={ocupado}/></div></div>}
   {!r?.cantidades&&(c.tipo==='equipo'||c.tipo==='referencia')&&<><input type="hidden" name="cantidad" value={cantidad}/><input type="hidden" name="recibido" value={recibido}/></>}
   <div className="campo"><label htmlFor="ap-evidencia">{r?.evidencia?'Evidencia o motivo (obligatorio)':'Evidencia (opcional)'}</label><textarea id="ap-evidencia" name="evidencia" rows={3} maxLength={4000} required={r?.evidencia} minLength={r?.evidencia?5:undefined} value={evidencia} onChange={e=>setEvidencia(e.target.value)} placeholder="Resultado, recepción, aprobación o enlace al documento" disabled={ocupado}/></div>
   <div className="campo"><label htmlFor="ap-notas">Notas o bloqueo (opcional)</label><textarea id="ap-notas" name="notas" rows={2} maxLength={4000} value={notas} onChange={e=>setNotas(e.target.value)} disabled={ocupado}/></div>
   {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
   <div className="acciones"><button type="submit" className="boton" disabled={ocupado}>{ocupado?'Guardando…':'Guardar'}</button><button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>modal.current?.close()}>Cancelar</button></div>
  </form></>}
 </dialog>,document.body);
}
