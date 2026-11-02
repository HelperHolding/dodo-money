"use client";
import Link from 'next/link';
import {useEffect,useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {useRouter} from 'next/navigation';
import {Icono} from '@/components/Icono';
import {clienteNavegador} from '@/lib/supabase/navegador';
import {ESTADOS,MARCAS,aItemChecklist,checklistApertura,estadosPara,fusionarItems,marcaItem,requisitosEstado,validarCambioEstado,type ItemApertura,type ItemChecklist,type LineaChecklist} from '@/lib/aperturas';
import {cambiarEstadoApertura} from './cambiarEstado';

const VISIBLES=8;
type Conexion='conectando'|'en_vivo'|'sin_conexion';

export function ChecklistEditable({items,proyecto,base,edita,encabezado}:{items:ItemChecklist[];proyecto:string;base:string;edita:boolean;encabezado:React.ReactNode}) {
 const router=useRouter();
 const [porId,setPorId]=useState<Record<string,ItemChecklist>>(()=>Object.fromEntries(items.map(i=>[i.id,i])));
 const [editando,setEditando]=useState<ItemChecklist|null>(null),[conexion,setConexion]=useState<Conexion>('conectando');
 // Lo que traiga la página al recargarse entra sin pisar un cambio más nuevo que ya llegó por el websocket.
 useEffect(()=>setPorId(actual=>fusionarItems(actual,items)),[items]);
 const aplicar=(i:ItemChecklist)=>setPorId(actual=>fusionarItems(actual,[i]));

 // Realtime: cambios de cualquier persona o pestaña sobre este proyecto. RLS decide qué llega (ve_compras).
 useEffect(()=>{
  const supabase=clienteNavegador();let pendiente:ReturnType<typeof setTimeout>|undefined;
  const canal=supabase.channel(`apertura-${proyecto}`)
   .on('postgres_changes',{event:'*',schema:'public',table:'apertura_items',filter:`proyecto_id=eq.${proyecto}`},(cambio:{new:Partial<ItemApertura>})=>{
    if(!cambio.new?.id)return;
    aplicar(aItemChecklist(cambio.new as ItemApertura));
    // Los indicadores de arriba se calculan en el servidor: se refrescan una vez que dejan de llegar cambios.
    clearTimeout(pendiente);pendiente=setTimeout(()=>router.refresh(),1500);
   })
   .subscribe(estado=>setConexion(estado==='SUBSCRIBED'?'en_vivo':estado==='CHANNEL_ERROR'||estado==='TIMED_OUT'||estado==='CLOSED'?'sin_conexion':'conectando'));
  return ()=>{clearTimeout(pendiente);supabase.removeChannel(canal);};
 },[proyecto,router]);

 const lista=useMemo(()=>Object.values(porId),[porId]);
 const {modulos,general}=useMemo(()=>checklistApertura(lista),[lista]);
 const marca=(c:ItemChecklist)=>{const m=marcaItem(c);return edita
  ?<button type="button" className="ap-check-marca" data-marca={m} aria-label={`${MARCAS[m].texto}. Cambiar estado de ${c.nombre}`} onClick={()=>setEditando(c)}>{MARCAS[m].icono}</button>
  :<span className="ap-check-marca" data-marca={m} aria-label={MARCAS[m].texto}>{MARCAS[m].icono}</span>;};
 const fila=(c:ItemChecklist)=><div className="ap-check-linea">{marca(c)}<Link href={`${base}/items/${c.id}`}>{c.nombre}</Link>{c.cantidad!==null&&<small>{c.recibido} / {c.cantidad}{c.unidad?` ${c.unidad}`:''}</small>}</div>;
 const linea=(l:LineaChecklist)=>{
  const d=l.destino;
  if('item' in d){const c=porId[d.item];return c?<li key={l.clave}>{fila(c)}</li>:null;}
  const enlace=`${base}?vista=${d.vista}${d.etapa?`&etapa=${d.etapa}`:''}${d.cat?`&cat=${d.cat}`:''}`;
  return <li key={l.clave}><details className="ap-check-grupo"><summary className="ap-check-linea"><span className="ap-check-marca" data-marca={l.marca} aria-label={MARCAS[l.marca].texto}>{MARCAS[l.marca].icono}</span><span>{l.nombre}</span><small>{l.listos} de {l.total}</small></summary>
   <ul className="ap-check-lista ap-check-hijos">{(l.hijos??[]).map(id=>porId[id]&&<li key={id}>{fila(porId[id])}</li>)}</ul><Link className="ap-check-mas" href={enlace}>Abrir la lista con filtros</Link></details></li>;
 };
 return <><div className="ap-check-encabezado"><div className="ap-dona" style={{width:96,height:96,flexBasis:96}}><svg viewBox="0 0 120 120" role="img" aria-label={`Avance general: ${general??0} %`}><circle cx="60" cy="60" r="46" fill="none" style={{stroke:'var(--dato-pista)'}} strokeWidth="14"/>{general?<circle cx="60" cy="60" r="46" fill="none" style={{stroke:'var(--cuadra)'}} strokeWidth="14" pathLength="100" strokeDasharray={`${general} ${100-general}`} transform="rotate(-90 60 60)"/>:null}</svg><div><strong style={{fontSize:'1.3rem'}}>{general===null?'—':`${general} %`}</strong></div></div>
  <div>{encabezado}<p className="ap-check-conexion" data-conexion={conexion} role="status">{conexion==='en_vivo'?'En vivo: los cambios de otras personas aparecen solos':conexion==='conectando'?'Conectando para ver cambios en vivo…':'Sin conexión en vivo: recarga la página para ver cambios de otras personas'}</p></div></div>
 <div className="ap-check-modulos">{modulos.map(m=><article key={m.clave} className="ap-check-modulo"><div className="ap-titulo"><h3>{m.nombre}</h3><strong>{m.porcentaje===null?'—':`${m.porcentaje} %`}</strong></div><progress value={m.porcentaje??0} max={100} aria-label={`Avance de ${m.nombre}`}/><small className="ap-nota">{m.listos} de {m.total} listos · {m.etapas.join(', ')}</small>
  {m.lineas.length?<><ul className="ap-check-lista">{m.lineas.slice(0,VISIBLES).map(linea)}</ul>{m.lineas.length>VISIBLES&&<details><summary className="ap-check-mas">Ver {m.lineas.length-VISIBLES} más</summary><ul className="ap-check-lista">{m.lineas.slice(VISIBLES).map(linea)}</ul></details>}</>:<p className="ap-nota">Sin registros aplicables.</p>}
 </article>)}</div>
 {edita&&<VentanaEstado concepto={editando} alCerrar={()=>setEditando(null)} alGuardar={i=>{aplicar(i);router.refresh();}}/>}</>;
}

function VentanaEstado({concepto:c,alCerrar,alGuardar}:{concepto:ItemChecklist|null;alCerrar:()=>void;alGuardar:(i:ItemChecklist)=>void}) {
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
  {c&&<><header className="compra-modal-encabezado"><div><h2 id="ap-estado-titulo">{c.nombre}</h2><p>Estado actual: {ESTADOS[c.estado]}</p></div><button type="button" className="boton-icono compra-modal-cerrar" disabled={ocupado} aria-label="Cerrar" onClick={()=>modal.current?.close()}><Icono nombre="cerrar" tamano={22}/></button></header>
  <form className="formulario" onSubmit={async e=>{e.preventDefault();if(ocupado)return;
   const invalido=validarCambioEstado(c.tipo,{estado,evidencia,cantidad,recibido});if(invalido){setError(invalido);return;}
   const fd=new FormData(e.currentTarget);setOcupado(true);setError('');
   try{const res=await cambiarEstadoApertura(fd);if('error' in res){setError(res.error);return;}alGuardar(res.item);modal.current?.close();}
   catch{setError('No se pudo confirmar el cambio. Recarga la página antes de intentar de nuevo.');}finally{setOcupado(false);}}}>
   <input type="hidden" name="item_id" value={c.id}/><input type="hidden" name="revision" value={c.revision}/>
   <fieldset className="ap-estados" disabled={ocupado}><legend>Nuevo estado</legend>{estadosPara(c.tipo).map(e=><label key={e} data-activo={estado===e}><input type="radio" name="estado" value={e} checked={estado===e} onChange={()=>elegir(e)}/>{ESTADOS[e]}</label>)}</fieldset>
   {r?.cantidades&&<div className="rejilla"><div className="campo"><label htmlFor="ap-cantidad">Cantidad necesaria{c.unidad?` (${c.unidad})`:''}</label><input id="ap-cantidad" name="cantidad" type="number" min="0.0001" max="99999999" step="0.0001" required value={cantidad} onChange={e=>setCantidad(e.target.value)} disabled={ocupado}/></div><div className="campo"><label htmlFor="ap-recibido">Cantidad recibida</label><input id="ap-recibido" name="recibido" type="number" min="0" max="99999999" step="0.0001" value={recibido} onChange={e=>setRecibido(e.target.value)} disabled={ocupado}/></div></div>}
   {!r?.cantidades&&(c.tipo==='equipo'||c.tipo==='referencia')&&<><input type="hidden" name="cantidad" value={cantidad}/><input type="hidden" name="recibido" value={recibido}/></>}
   <div className="campo"><label htmlFor="ap-evidencia">{r?.evidencia?'Evidencia o motivo (obligatorio)':'Evidencia (opcional)'}</label><textarea id="ap-evidencia" name="evidencia" rows={3} maxLength={4000} required={r?.evidencia} minLength={r?.evidencia?5:undefined} value={evidencia} onChange={e=>setEvidencia(e.target.value)} placeholder="Resultado, recepción, aprobación o enlace al documento" disabled={ocupado}/></div>
   <div className="campo"><label htmlFor="ap-notas">Notas o bloqueo (opcional)</label><textarea id="ap-notas" name="notas" rows={2} maxLength={4000} value={notas} onChange={e=>setNotas(e.target.value)} disabled={ocupado}/></div>
   {error&&<p role="alert" className="aviso aviso-error">{error}</p>}
   <div className="acciones"><button type="submit" className="boton" disabled={ocupado}>{ocupado?'Guardando…':'Guardar'}</button><button type="button" className="boton boton-secundario" disabled={ocupado} onClick={()=>modal.current?.close()}>Cancelar</button></div>
  </form></>}
 </dialog>,document.body);
}
