"use client";
import {useEffect,useRef} from 'react';
import {Icono} from '@/components/Icono';
import {nombreEstado} from '@/lib/aperturas';
import {cubreDia,esDeUnDia,type ItemCalendario} from '@/lib/aperturasCalendario';
import type {TonoConcepto} from '@/lib/aperturasAkton';

// Tarjeta flotante del día («N más»), como Google: día y número grandes y la lista completa; se cierra con ✕ o Esc.
export function TarjetaDia({dia,ancla,items,colorDe,tono,abrirItem,cerrar}:{dia:string;ancla:DOMRect;items:ItemCalendario[];colorDe:(i:ItemCalendario)=>string;tono:(i:ItemCalendario)=>TonoConcepto;abrirItem:(i:ItemCalendario)=>void;cerrar:()=>void}) {
 const caja=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const tecla=(e:KeyboardEvent)=>{if(e.key==='Escape')cerrar();};
  window.addEventListener('keydown',tecla);caja.current?.focus();
  return ()=>window.removeEventListener('keydown',tecla);
 },[cerrar]);
 const del=items.filter(i=>cubreDia(i,dia)).sort((a,b)=>a.nombre.localeCompare(b.nombre,'es-MX'));
 const ancho=260,izq=Math.max(8,Math.min(ancla.left+ancla.width/2-ancho/2,window.innerWidth-ancho-8)),arriba=Math.max(8,Math.min(ancla.top-120,window.innerHeight-420));
 const d=new Date(`${dia}T00:00:00Z`);
 return <div ref={caja} tabIndex={-1} role="dialog" aria-label={`Tareas del ${dia}`} className="ap-gcal-tarjeta" style={{left:izq,top:arriba,width:ancho}}>
  <button type="button" className="ap-gcal-tarjeta-cerrar" aria-label="Cerrar" onClick={cerrar}><Icono nombre="cerrar" tamano={18}/></button>
  <p className="ap-gcal-tarjeta-dia">{new Intl.DateTimeFormat('es-MX',{weekday:'short',timeZone:'UTC'}).format(d).replace('.','').toUpperCase()}</p>
  <p className="ap-gcal-tarjeta-num">{d.getUTCDate()}</p>
  <ul>{del.map(i=>{const c=colorDe(i),t=tono(i);return <li key={i.id}><button type="button" data-tono={t} onClick={()=>{cerrar();abrirItem(i);}} title={nombreEstado(i)}>
   <span className={esDeUnDia(i)?'ap-gcal-bolita':'ap-gcal-tira'} style={{background:c}} aria-hidden="true"/>{t==='alerta'&&<b>!</b>}<span>{i.nombre}</span></button></li>;})}</ul>
 </div>;
}
