"use client";
import {nombreEstado} from '@/lib/aperturas';
import {clavePersona,MOMENTOS,momentoEnDia,semanaDe,textoSobre,type ItemCalendario,type Momento,type Persona} from '@/lib/aperturasCalendario';
import type {TonoConcepto} from '@/lib/aperturasAkton';

const DIAS=['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'];
// Semana como los eventos de «todo el día» de Google: 7 columnas, cada tarea en cada día que ocupa, sin límite.
export function VistaSemana({semana,hoy,items,personas,colorDe,tono,abrirDia,abrirItem}:{semana:string;hoy:string;items:ItemCalendario[];personas:Persona[];colorDe:(i:ItemCalendario)=>string;tono:(i:ItemCalendario)=>TonoConcepto;abrirDia:(d:string)=>void;abrirItem:(i:ItemCalendario)=>void}) {
 const ini=new Map(personas.map(p=>[p.clave,p.iniciales]));
 return <div className="ap-gcal-sem" role="grid" aria-label="Semana">{semanaDe(semana).map((c,k)=>{
  const del=items.flatMap(i=>{const m=momentoEnDia(i,c.dia);return m?[{i,m}]:[];}).sort((a,b)=>a.i.nombre.localeCompare(b.i.nombre,'es-MX'));
  return <div key={c.dia} className="ap-gcal-sem-col" data-hoy={c.dia===hoy||undefined} role="gridcell">
   <button type="button" className="ap-gcal-sem-cabeza" onClick={()=>abrirDia(c.dia)} aria-label={`Abrir el día ${c.dia}`}>
    <span>{DIAS[k]}</span><b data-hoy={c.dia===hoy||undefined}>{Number(c.dia.slice(8))}</b></button>
   {del.map(({i,m}:{i:ItemCalendario;m:Momento})=>{const color=colorDe(i),t=tono(i);return <button key={i.id} type="button" className="ap-gcal-bloque" data-tono={t}
    style={{background:color,color:textoSobre(color)}} title={`${i.nombre} · ${nombreEstado(i)}`} onClick={()=>abrirItem(i)}>
    <strong>{t==='alerta'&&'! '}{i.nombre}</strong><small>{ini.get(clavePersona(i.responsable))??'—'} · {MOMENTOS[m]}</small></button>;})}
  </div>;})}</div>;
}
