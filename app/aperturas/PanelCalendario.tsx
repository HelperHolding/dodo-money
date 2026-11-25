"use client";
import Link from 'next/link';
import {useState,type CSSProperties} from 'react';
import {miniMes,moverMesTexto,nombreMes,semanaDe,type ModoCalendario,type Persona} from '@/lib/aperturasCalendario';

const INI=['L','M','M','J','V','S','D'];
// Panel izquierdo como Google: programar, mini mes, responsables con casilla de color y qué mostrar.
export function PanelCalendario({hoy,modo,mes,semana,personas,ocultos,conteo,todos,edita,irA,alternar,enlaceTipos,programar,alElegir}:{alElegir:()=>void;hoy:string;modo:ModoCalendario;mes:string;semana:string;personas:Persona[];ocultos:ReadonlySet<string>;conteo:Record<string,number>;todos:boolean;edita:boolean;irA:(dia:string)=>void;alternar:(clave:string)=>void;enlaceTipos:string;programar:()=>void}) {
 const [mini,setMini]=useState(mes);
 const deSemana=new Set(modo==='semana'?semanaDe(semana).map(c=>c.dia):[]);
 return <aside className="ap-gcal-panel" aria-label="Panel del calendario">
  {edita&&<button type="button" className="ap-gcal-crear" onClick={programar}><span aria-hidden="true">＋</span> Programar tarea</button>}
  <div className="ap-gcal-mini">
   <div className="ap-gcal-mini-barra"><strong>{nombreMes(mini)}</strong>
    <button type="button" aria-label="Mes anterior" onClick={()=>setMini(moverMesTexto(mini,-1))}>‹</button>
    <button type="button" aria-label="Mes siguiente" onClick={()=>setMini(moverMesTexto(mini,1))}>›</button></div>
   <div className="ap-gcal-mini-rejilla">
    {INI.map((d,k)=><span key={k} className="ap-gcal-mini-ini" aria-hidden="true">{d}</span>)}
    {miniMes(mini).flat().map(c=><button key={c.dia} type="button" onClick={()=>irA(c.dia)} aria-label={c.dia}
     data-fuera={!c.delMes||undefined} data-hoy={c.dia===hoy||undefined}
     data-visible={deSemana.has(c.dia)||undefined}>{Number(c.dia.slice(8))}</button>)}
   </div>
  </div>
  <h3 className="ap-gcal-panel-titulo">Responsables</h3>
  <ul className="ap-gcal-personas">{personas.map(p=><li key={p.clave}><label>
   <input type="checkbox" checked={!ocultos.has(p.clave)} onChange={()=>alternar(p.clave)} style={{'--ap-c':p.color} as CSSProperties}/>
   <span>{p.nombre}</span><small>{conteo[p.clave]??0}</small></label></li>)}</ul>
  <h3 className="ap-gcal-panel-titulo">Mostrar</h3>
  <Link className="ap-gcal-mostrar" href={enlaceTipos} onClick={alElegir} role="checkbox" aria-checked={!todos}><span className="ap-gcal-check" data-activo={!todos||undefined} aria-hidden="true"/>Solo actividades</Link>
 </aside>;
}
