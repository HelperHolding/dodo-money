"use client";
import Link from 'next/link';
import {useEffect,useMemo,useState} from 'react';
import {useRouter} from 'next/navigation';
import {clienteNavegador} from '@/lib/supabase/navegador';
import {MARCAS,PESOS_BLOQUE,aItemChecklist,checklistApertura,fusionarItems,marcaItem,type ItemApertura,type ItemChecklist,type LineaChecklist} from '@/lib/aperturas';
import {VentanaEstado} from './VentanaEstado';

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
 return <><div className="ap-check-encabezado"><p className="ap-check-general"><strong>{general===null?'—':`${general} %`}</strong><span>avance del checklist</span></p>
  <div>{encabezado}<p className="ap-check-conexion" data-conexion={conexion} role="status">{conexion==='en_vivo'?'En vivo: los cambios de otras personas aparecen solos':conexion==='conectando'?'Conectando para ver cambios en vivo…':'Sin conexión en vivo: recarga la página para ver cambios de otras personas'}</p></div></div>
 <div className="ap-check-modulos">{modulos.map(m=><article key={m.clave} className="ap-check-modulo"><div className="ap-titulo"><h3>{m.nombre}<small className="ap-nota"> · {Math.round(PESOS_BLOQUE[m.clave]*100)} % del total</small></h3><strong>{m.porcentaje===null?'—':`${m.porcentaje} %`}</strong></div><progress value={m.porcentaje??0} max={100} aria-label={`Avance de ${m.nombre}`}/><small className="ap-nota">{m.listos} de {m.total} listos · {m.etapas.join(', ')}</small>
  {m.lineas.length?<><ul className="ap-check-lista">{m.lineas.slice(0,VISIBLES).map(linea)}</ul>{m.lineas.length>VISIBLES&&<details><summary className="ap-check-mas">Ver {m.lineas.length-VISIBLES} más</summary><ul className="ap-check-lista">{m.lineas.slice(VISIBLES).map(linea)}</ul></details>}</>:<p className="ap-nota">Sin registros aplicables.</p>}
 </article>)}</div>
 {edita&&<VentanaEstado concepto={editando} alCerrar={()=>setEditando(null)} alGuardar={i=>{aplicar(i);router.refresh();}}/>}</>;
}
