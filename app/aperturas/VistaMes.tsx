"use client";
import type {CSSProperties} from 'react';
import {nombreEstado} from '@/lib/aperturas';
import {barrasSemana,esDeUnDia,ocultasPorDia,semanasCalendario,textoSobre,type ItemCalendario} from '@/lib/aperturasCalendario';
import type {TonoConcepto} from '@/lib/aperturasAkton';

const DIAS=['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM'],LIMITE=4;
const fechaLarga=(d:string)=>new Intl.DateTimeFormat('es-MX',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));

// Mes como Google Calendar: barras de color para lo de varios días, punto + nombre para lo de un día, «N más» si no cabe.
export function VistaMes({mes,hoy,items,colorDe,tono,abrirDia,abrirItem,abrirMas}:{mes:string;hoy:string;items:ItemCalendario[];colorDe:(i:ItemCalendario)=>string;tono:(i:ItemCalendario)=>TonoConcepto;abrirDia:(dia:string)=>void;abrirItem:(i:ItemCalendario)=>void;abrirMas:(dia:string,ancla:DOMRect)=>void}) {
 return <div className="ap-gcal-mes" role="grid" aria-label="Mes">
  <div className="ap-gcal-mes-cabeza" role="row">{DIAS.map(d=><span key={d} role="columnheader">{d}</span>)}</div>
  {semanasCalendario(mes).map(semana=>{
   const {barras}=barrasSemana(items,semana),ocultas=ocultasPorDia(barras,semana,LIMITE);
   return <div key={semana[0].dia} className="ap-gcal-semana" role="row" style={{gridTemplateRows:`30px repeat(${LIMITE},22px) 22px`}}>
    {semana.map((c,col)=><div key={c.dia} role="gridcell" className="ap-gcal-dia" data-fuera={!c.delMes||undefined} style={{gridColumn:col+1,gridRow:'1 / -1'}}>
     <button type="button" className="ap-gcal-num" data-hoy={c.dia===hoy||undefined} aria-label={fechaLarga(c.dia)} onClick={()=>abrirDia(c.dia)}>{Number(c.dia.slice(8))}</button>
    </div>)}
    {barras.filter(b=>b.carril<LIMITE).map(b=>{
     const i=b.item,color=colorDe(i),t=tono(i),uno=esDeUnDia(i)&&b.span===1;
     const estilo:CSSProperties=uno?{gridColumn:`${b.col+1} / span 1`,gridRow:b.carril+2,['--ap-c' as string]:color}
      :{gridColumn:`${b.col+1} / span ${b.span}`,gridRow:b.carril+2,background:color,color:textoSobre(color)};
     return <button key={i.id} type="button" className={uno?'ap-gcal-punto':'ap-gcal-barra'} data-tono={t}
      data-antes={b.empiezaAntes||undefined} data-despues={b.sigueDespues||undefined} style={estilo}
      title={`${i.nombre} · ${nombreEstado(i)}${i.responsable?` · ${i.responsable}`:''}`} onClick={()=>abrirItem(i)}>
      {uno&&<span className="ap-gcal-bolita" aria-hidden="true"/>}{t==='alerta'&&<b aria-label="Atención">!</b>}<span>{i.nombre}</span>
     </button>;})}
    {ocultas.map((n,col)=>n>0&&<button key={col} type="button" className="ap-gcal-mas" style={{gridColumn:col+1,gridRow:LIMITE+2}}
     onClick={e=>abrirMas(semana[col].dia,e.currentTarget.getBoundingClientRect())}>{n} más</button>)}
   </div>;
  })}
 </div>;
}
